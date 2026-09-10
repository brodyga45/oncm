import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {localEndpoints} from '../sdk/local-endpoints.mjs';
import {validateSnapshot,backupSnapshot} from './state-snapshot.mjs';
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
// Never silently recover an older backup: a interrupted dump or missing primary
// requires operator review, otherwise the chain can roll back accepted writes.
if (fs.existsSync(stateFile)) await validateSnapshot(stateFile,{signal:AbortSignal.timeout(120_000)});
else if (instance.hasStarted) throw Error('Persistent chain state is missing; explicit recovery is required.');
instance.hasStarted = true;
fs.writeFileSync('.state/chain-instance.json.tmp', JSON.stringify(instance, null, 2));
fs.renameSync('.state/chain-instance.json.tmp','.state/chain-instance.json');
const persistedStates=Number(process.env.VAULT_MAX_PERSISTED_STATES??128);
if(!Number.isInteger(persistedStates)||persistedStates<2||persistedStates>128)throw Error('VAULT_MAX_PERSISTED_STATES must be 2..128');
const args = ['--host', '127.0.0.1', '--port', String(endpoints.rpcPort), '--chain-id', '31373', '--hardfork', 'cancun',
  '--threads', '2', '--memory-limit', '67108864', '--gas-limit', '100000000',
  '--accounts', '10', '--balance', '10000', '--mnemonic', 'test test test test test test test test test test test junk',
  '--timestamp', String(instance.genesisTimestamp), '--state', stateFile,
  '--state-interval', '10', '--preserve-historical-states', '--max-persisted-states', String(persistedStates),
  '--transaction-block-keeper', '1024', '--cache-path', path.join(root, '.state/chain/cache'), '--silent'];
if (process.env.VAULT_BLOCK_TIME) {
  const seconds = Number(process.env.VAULT_BLOCK_TIME);
  if (!Number.isInteger(seconds) || seconds < 2 || seconds > 60) throw Error('VAULT_BLOCK_TIME must be 2..60 seconds');
  args.push('--block-time', String(seconds), '--mixed-mining');
}
const child = spawn(binary, args, { cwd: root, stdio: 'inherit',
  env: { ...process.env, RAYON_NUM_THREADS: '2', TOKIO_WORKER_THREADS: '2', RUST_LOG: 'error' } });
fs.writeFileSync('.state/chain/process.json', JSON.stringify({ launcherPid: process.pid, anvilPid: child.pid, instance: instance.id }, null, 2));
console.log(`Vault Anvil RPC :${endpoints.rpcPort} · instance ${instance.id} · state every 10 s`);
let stopping = false, timer;
let backupInFlight,backupController;
function backup() {
  if(backupInFlight||stopping)return backupInFlight;
  backupController=new AbortController();
  const deadline=setTimeout(()=>backupController.abort(),120_000);
  backupInFlight=backupSnapshot(stateFile,backupFile,{signal:backupController.signal})
    .catch(error=>console.error('Snapshot backup retained previous copy:',error.message))
    .finally(()=>{clearTimeout(deadline);backupInFlight=undefined;});
  return backupInFlight;
}
// Do not parse each ten-second dump: one bounded background backup per minute.
const backupTimer = setInterval(backup,60_000);
function stop() {
  if (stopping) return;
  stopping = true;
  backupController?.abort();
  // Signal the actual binary, not an npm shim; await its final dump and exit.
  child.kill('SIGINT');
  timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  clearTimeout(timer); clearInterval(backupTimer); backupController?.abort();
  process.exitCode = stopping ? 0 : (code ?? 1);
});
