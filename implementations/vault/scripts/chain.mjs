import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {localEndpoints} from '../sdk/local-endpoints.mjs';
import {validateSnapshot,backupSnapshot,historicalStateArgs,initializeMiningClock} from './state-snapshot.mjs';
const endpoints=localEndpoints(process.env.VAULT_PORT_OFFSET??0);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const binary = process.env.VAULT_ANVIL || path.join(root, '.toolchain/anvil');
if (!fs.existsSync(binary)) throw Error('Anvil is missing. Run npm run setup:anvil; this command never compiles a toolchain.');
try {
  const response = await fetch(endpoints.rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(1500) });
  throw Error(`RPC ${endpoints.rpcPort} already responds (HTTP ${response.status}); reuse it with npm run dev.`);
} catch (error) {
  if (error.cause?.code !== 'ECONNREFUSED') throw error;
}
fs.mkdirSync('.state/chain', { recursive: true });
if (!fs.existsSync('.state/chain-instance.json')) {
  if (fs.existsSync('.state/deployment.json') || fs.existsSync('.state/deployment-v2.json')) throw Error('Old deployment exists without a chain identity. Explicit recovery/archive is required.');
  fs.writeFileSync('.state/chain-instance.json', JSON.stringify({ id: randomUUID(), kind: 'anvil-persistent', chainId: 31373,
    createdAt: new Date().toISOString(), genesisTimestamp: Math.floor(Date.now() / 1000) }, null, 2));
}
const instance = JSON.parse(fs.readFileSync('.state/chain-instance.json'));
const stateFile = path.join(root, '.state/chain/anvil-state.json');
const backupFile = path.join(root, '.state/chain/anvil-state.last-good.json');
const writingFile = path.join(root, '.state/chain/anvil-state.writing.json');
function fileIdentity(file){try{const s=fs.statSync(file,{bigint:true});return `${s.ino}:${s.size}:${s.mtimeNs}`;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
const originalWritingIdentity=fileIdentity(writingFile);
const readyFile=path.join(root,'.state/chain/ready.json');
fs.rmSync(readyFile,{force:true});
// Never silently recover an older backup: a interrupted dump or missing primary
// requires operator review, otherwise the chain can roll back accepted writes.
let restoredSnapshot;
if (fs.existsSync(stateFile)) restoredSnapshot=await validateSnapshot(stateFile,{signal:AbortSignal.timeout(120_000)});
else if (instance.hasStarted) throw Error('Persistent chain state is missing; explicit recovery is required.');
instance.hasStarted = true;
fs.writeFileSync('.state/chain-instance.json.tmp', JSON.stringify(instance, null, 2));
fs.renameSync('.state/chain-instance.json.tmp','.state/chain-instance.json');
const persistedStates=Number(process.env.VAULT_MAX_PERSISTED_STATES??128);
if(!Number.isInteger(persistedStates)||persistedStates<2||persistedStates>128)throw Error('VAULT_MAX_PERSISTED_STATES must be 2..128');
const args = ['--host', '127.0.0.1', '--port', String(endpoints.rpcPort), '--chain-id', '31373', '--hardfork', 'cancun',
  '--threads', '2', '--memory-limit', '67108864', '--gas-limit', '100000000',
  '--accounts', '10', '--balance', '10000', '--mnemonic', 'test test test test test test test test test test test junk',
  '--timestamp', String(instance.genesisTimestamp), '--no-mining',
  ...(restoredSnapshot?['--load-state',stateFile]:[]),'--dump-state',writingFile,
  '--state-interval', '30', ...historicalStateArgs(process.env.VAULT_PRESERVE_HISTORICAL_STATES), '--max-persisted-states', String(persistedStates),
  '--cache-path', path.join(root, '.state/chain/cache'), '--silent'];
let blockTime;
if (process.env.VAULT_BLOCK_TIME) {
  const seconds = Number(process.env.VAULT_BLOCK_TIME);
  if (!Number.isInteger(seconds) || seconds < 2 || seconds > 60) throw Error('VAULT_BLOCK_TIME must be 2..60 seconds');
  blockTime=seconds;
}
const child = spawn(binary, args, { cwd: root, stdio: 'inherit',
  env: { ...process.env, RAYON_NUM_THREADS: '2', TOKIO_WORKER_THREADS: '2', RUST_LOG: 'error' } });
fs.writeFileSync('.state/chain/process.json', JSON.stringify({ launcherPid: process.pid, anvilPid: child.pid, instance: instance.id }, null, 2));
console.log(`Vault Anvil RPC :${endpoints.rpcPort} · instance ${instance.id} · dump every 30 s; stable validated checkpoints`);
let stopping = false, timer, clockInitialized=false;
let backupInFlight,backupController,observedWriting,lastPublishedWriting;
async function checkpoint(final=false) {
  if(!clockInitialized){if(final)throw Error('Clock initialization failed; stable primary will not be replaced');return;}
  if(backupInFlight||stopping&&!final)return backupInFlight;
  const current=fileIdentity(writingFile);
  if(!current||current===originalWritingIdentity){if(final)throw Error('Anvil did not produce a fresh final dump');return;}
  if(!final){
    // Observe the same size/mtime twice before copying a large live dump.
    // This cheap poll does not parse or retain the state in memory.
    if(observedWriting!==current){observedWriting=current;return;}
    if(lastPublishedWriting===current)return;
  }
  backupController=new AbortController();
  const deadline=setTimeout(()=>backupController.abort(),120_000);
  backupInFlight=backupSnapshot(writingFile,stateFile,{previous:backupFile,signal:backupController.signal})
    .then(report=>{lastPublishedWriting=current;console.log(`Validated checkpoint block ${report.blockNumber} timestamp ${report.blockTimestamp} (${report.bytes} bytes)`);return report;})
    .finally(()=>{clearTimeout(deadline);backupInFlight=undefined;});
  return backupInFlight;
}
// One checkpoint in flight; fresh native dumps occur every thirty seconds.
const backupTimer=setInterval(()=>checkpoint().catch(error=>console.error('Stable checkpoint unchanged:',error.message)),5000);
function stop() {
  if (stopping) return;
  stopping = true;
  fs.rmSync(readyFile,{force:true});
  backupController?.abort();
  // Signal the actual binary, not an npm shim; await its final dump and exit.
  child.kill('SIGINT');
  timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', async code => {
  fs.rmSync(readyFile,{force:true});
  clearTimeout(timer);clearInterval(backupTimer);backupController?.abort();
  try{
    await backupInFlight?.catch(()=>{});
    if(code!==0)throw Error('Anvil exited without a clean final dump: '+code);
    // Complete the final validated atomic promotion before the launcher exits.
    await checkpoint(true);
    process.exitCode=0;
  }catch(error){console.error('Final checkpoint failed; stable primary retained:',error.message);process.exitCode=1;}
});

// The node starts with all mining disabled. A connected API may read or queue
// transactions, but no block can be produced before genesis/clock validation.
async function initialize(){
 const rpc=async(method,params=[])=>{
  if(stopping)throw Error('Launcher is stopping');
  const response=await fetch(endpoints.rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(3000)});
  const result=await response.json();if(!response.ok||result.error)throw Error(result.error?.message||'Startup RPC failed');return result.result;
 };
 const deadline=Date.now()+60000;
 while(true){
  if(stopping||child.exitCode!==null)throw Error('Anvil stopped before initialization');
  try{if(await rpc('eth_chainId')!=='0x7a8d')throw Error('Wrong startup chain ID');break;}
  catch(error){if(Date.now()>=deadline||stopping)throw error;await new Promise(resolve=>setTimeout(resolve,100));}
 }
 const initialized=await initializeMiningClock(rpc,{genesisTimestamp:instance.genesisTimestamp,snapshot:restoredSnapshot,blockTime});
 if(stopping)throw Error('Launcher stopped during initialization');
 clockInitialized=true;
 fs.writeFileSync(readyFile+'.tmp',JSON.stringify({launcherPid:process.pid,anvilPid:child.pid,instance:instance.id,...initialized,initializedAt:new Date().toISOString()},null,2));
 fs.renameSync(readyFile+'.tmp',readyFile);
 console.log(`Clock ready at ${initialized.clockTarget}; original genesis ${initialized.genesisHash}; ${initialized.mining}`);
}
initialize().catch(error=>{console.error('Startup clock initialization failed:',error.message);process.exitCode=1;stop();});
