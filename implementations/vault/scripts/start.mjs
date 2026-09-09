import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const children = new Map();
let stopping = false;
function start(name, relative, args = []) {
  const child = spawn(process.execPath, [path.join(root, relative), ...args], { cwd: root, stdio: 'inherit', env: process.env });
  child.closed = new Promise(resolve => child.once('close', resolve));
  children.set(name, child);
  child.once('close', () => children.delete(name));
  child.on('error', error => console.error(name + ': ' + error.message));
  return child;
}
async function rpc(method, params = []) {
  const response = await fetch('http://127.0.0.1:9547', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(1500) });
  const result = await response.json();
  if (result.error) throw Error(result.error.message);
  return result.result;
}
async function chainReady() {
  try {
    const chain = await rpc('eth_chainId');
    if (BigInt(chain) !== 31373n) throw Error('RPC 9547 belongs to another chain');
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
  for (const name of ['web', 'api', 'deploy', 'chain']) {
    const child = children.get(name);
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await child.closed; }
  }
}
process.on('SIGINT', () => stop().catch(console.error));
process.on('SIGTERM', () => stop().catch(console.error));
try {
  if (!fs.existsSync('.state/artifacts/PoolCoordinator.json'))
    throw Error('Contract artifacts are missing. Run npm run compile explicitly; dev never starts a compiler automatically.');
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
  if (fs.existsSync('.state/deployment.json')) deployment = JSON.parse(fs.readFileSync('.state/deployment.json'));
  if (deployment) {
    if ((await rpc('eth_getCode', [deployment.addresses.PoolCoordinator, 'latest'])) === '0x')
      throw Error('Saved deployment is absent from this chain. Restore the matching snapshot or perform explicit archived recovery; no silent redeployment.');
  } else {
    const child = start('deploy', 'scripts/deploy.mjs');
    if ((await child.closed) !== 0) throw Error('Deployment failed');
  }
  if (!(await reachable('http://127.0.0.1:4173/api/config'))) start('api', 'server/index.mjs');
  if (!(await reachable('http://127.0.0.1:5173'))) start('web', 'node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--port', '5173', '--strictPort']);
  console.log('Vault persistent devnet ready: http://127.0.0.1:5173 | RPC :9547 | API :4173');
} catch (error) {
  console.error(error.message); await stop(); process.exitCode = 1;
}
