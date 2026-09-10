import {runtimeFiles,readRuntimeDeployment,assertSameRuntime} from '../server/runtime-version.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {ensureSocialSetup} from './social-setup.mjs';
import {ensureProofDescriptor} from './proof-bootstrap.mjs';
import {ensureProductionArtifacts} from './production-bootstrap.mjs';
import {localEndpoints} from '../sdk/local-endpoints.mjs';
const endpoints=localEndpoints(process.env.VAULT_PORT_OFFSET??0);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const files=runtimeFiles(root,process.env.VAULT_PROTOCOL_VERSION??'legacy');
const children = new Map();
let stopping = false;
function start(name, relative, args = []) {
  const child = spawn(process.execPath, [path.join(root, relative), ...args], { cwd: root, stdio: 'inherit', env: process.env });
  child.closed = new Promise(resolve => child.once('close', resolve));
  children.set(name, child);
  child.once('close', (code,signal) => {children.delete(name);if(!stopping&&['web','api','chain'].includes(name))console.error(name+' exited: code='+code+' signal='+signal);});
  child.on('error', error => console.error(name + ': ' + error.message));
  return child;
}
async function rpc(method, params = []) {
  const response = await fetch(endpoints.rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(1500) });
  const result = await response.json();
  if (result.error) throw Error(result.error.message);
  return result.result;
}
async function chainReady() {
  try {
    const chain = await rpc('eth_chainId');
    if (BigInt(chain) !== 31373n) throw Error(endpoints.rpcUrl+' belongs to another chain');
    return true;
  } catch (error) {
    if (error.message.includes('another chain')) throw error;
    if (error.cause?.code !== 'ECONNREFUSED') throw error;
    return false;
  }
}
async function reachable(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
async function stop() {
  if (stopping) return;
  stopping = true;
  // Only processes created by this invocation are stopped. API drains jobs;
  // chain launcher waits for Anvil's final state dump before it exits.
  for (const name of ['web', 'api', 'social-deploy', 'deploy', 'chain']) {
    const child = children.get(name);
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await child.closed; }
  }
}
process.on('SIGINT', () => stop().catch(console.error));
process.on('SIGTERM', () => stop().catch(console.error));
try {
  if(files.version==='2')readRuntimeDeployment(files); // No implicit V2 deployment or legacy fallback.
  ensureProductionArtifacts(root);
  ensureProofDescriptor(root);
  if (!(await chainReady())) {
    start('chain', 'scripts/chain.mjs');
    let ready = false;
    for (let n = 0; n < 40 && !ready; n++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      ready = await chainReady();
      if (!ready && !children.has('chain')) throw Error('Anvil exited before RPC became ready');
    }
    if (!ready) throw Error('Anvil RPC did not become ready');
  }
  const version = await rpc('web3_clientVersion');
  if (!version.toLowerCase().includes('anvil')) throw Error('Existing RPC is not Anvil; refusing to replace a running node');
  await rpc('anvil_setLoggingEnabled', [false]);
  let deployment;
  if (fs.existsSync(files.deployment)) deployment = readRuntimeDeployment(files);
  if (deployment) {
    if(deployment.rpcUrl!==endpoints.rpcUrl||deployment.localPortOffset!==undefined&&deployment.localPortOffset!==endpoints.offset)throw Error('Saved deployment uses another explicit local port offset');
    if ((await rpc('eth_getCode', [deployment.addresses.PoolCoordinator, 'latest'])) === '0x')
      throw Error('Saved deployment is absent from this chain. Restore the matching snapshot or perform explicit archived recovery; no silent redeployment.');
  } else {
    const child = start('deploy', 'scripts/deploy.mjs');
    if ((await child.closed) !== 0) throw Error('Deployment failed');
  }
  deployment=readRuntimeDeployment(files);
  const social=await ensureSocialSetup({root,config:deployment,rpc,runDeployment:async()=>{
    const child=start('social-deploy','social/deploy.mjs');
    if((await child.closed)!==0)throw Error('Additive social setup/runtime verification failed');
  }});
  console.log('Vault onchain social '+social.mode+': '+social.descriptor.resolver);
  if (!(await reachable(endpoints.apiUrl+'/api/config'))) start('api', 'server/index.mjs');
  if (!(await reachable(endpoints.webUrl))) start('web', 'node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--port', String(endpoints.webPort), '--strictPort']);
  let ready=false;
  for(let n=0;n<40&&!ready;n++){
    if(stopping)throw Error('Startup was stopped before readiness');
    try{
      const response=await fetch(endpoints.apiUrl+'/api/config',{signal:AbortSignal.timeout(1500)});
      if(response.ok){const {config}=await response.json();
        assertSameRuntime(config,deployment);
        if(config.social?.resolver!==social.descriptor.resolver)
          throw Error('Running API belongs to another deployment or lacks the verified social setup');
        ready=await reachable(endpoints.webUrl);
      }
    }catch(error){if(error.message.startsWith('Running API'))throw error;}
    if(!ready)await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready)throw Error('Vault API/web did not become ready; only newly launched processes will be stopped');
  console.log('Vault persistent devnet ready: '+endpoints.webUrl+' | RPC '+endpoints.rpcUrl+' | API '+endpoints.apiUrl);
} catch (error) {
  console.error(error.message); await stop(); process.exitCode = 1;
}
