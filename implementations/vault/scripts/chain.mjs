import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {localEndpoints} from '../sdk/local-endpoints.mjs';
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
  if (fs.existsSync('.state/deployment.json')) throw Error('Old deployment exists without a chain identity. Explicit recovery/archive is required.');
  fs.writeFileSync('.state/chain-instance.json', JSON.stringify({ id: randomUUID(), kind: 'anvil-persistent', chainId: 31373,
    createdAt: new Date().toISOString(), genesisTimestamp: Math.floor(Date.now() / 1000) }, null, 2));
}
const instance = JSON.parse(fs.readFileSync('.state/chain-instance.json'));
const stateFile = path.join(root, '.state/chain/anvil-state.json');
const backupFile = path.join(root, '.state/chain/anvil-state.last-good.json');
function validState(file) {
  if (!fs.existsSync(file)) return false;
  if (fs.statSync(file).size > 64 * 1024 * 1024) throw Error('Snapshot exceeds 64 MiB startup validation budget; inspect explicitly before starting.');
  try {
    const state = JSON.parse(fs.readFileSync(file));
    return !!state.block && !!state.accounts && Array.isArray(state.blocks) && Array.isArray(state.transactions);
  } catch { return false; }
}
if (!validState(stateFile) && validState(backupFile)) {
  fs.copyFileSync(backupFile, stateFile + '.restoring');
  fs.renameSync(stateFile + '.restoring', stateFile);
  console.log('Restored the last validated snapshot of this chain instance.');
}
if (fs.existsSync(stateFile) && !validState(stateFile)) throw Error('Snapshot is invalid; refusing an empty replacement chain.');
if (instance.hasStarted && !fs.existsSync(stateFile)) throw Error('Persistent chain state is missing; explicit recovery is required.');
instance.hasStarted = true;
fs.writeFileSync('.state/chain-instance.json', JSON.stringify(instance, null, 2));
const args = ['--host', '127.0.0.1', '--port', String(endpoints.rpcPort), '--chain-id', '31373', '--hardfork', 'cancun',
  '--threads', '2', '--memory-limit', '67108864', '--gas-limit', '100000000',
  '--accounts', '10', '--balance', '10000', '--mnemonic', 'test test test test test test test test test test test junk',
  '--timestamp', String(instance.genesisTimestamp), '--state', stateFile,
  '--state-interval', '10', '--preserve-historical-states', '--max-persisted-states', '128',
  '--transaction-block-keeper', '1024', '--cache-path', path.join(root, '.state/chain/cache'), '--silent'];
const child = spawn(binary, args, { cwd: root, stdio: 'inherit',
  env: { ...process.env, RAYON_NUM_THREADS: '2', TOKIO_WORKER_THREADS: '2', RUST_LOG: 'error' } });
fs.writeFileSync('.state/chain/process.json', JSON.stringify({ launcherPid: process.pid, anvilPid: child.pid, instance: instance.id }, null, 2));
console.log(`Vault Anvil RPC :${endpoints.rpcPort} · instance ${instance.id} · state every 10 s`);
let stopping = false, timer;
let lastBackupBlock;
function backup() {
  // Backup is replaced atomically only after parsing a bounded complete dump.
  // If Anvil is currently writing, keep the previous valid copy and try later.
  const temporary = backupFile + '.tmp';
  try {
    if (!fs.existsSync(stateFile) || fs.statSync(stateFile).size > 64 * 1024 * 1024) return;
    fs.copyFileSync(stateFile, temporary);
    const state = JSON.parse(fs.readFileSync(temporary));
    if (!state.block || !state.accounts || !Array.isArray(state.transactions)) throw Error('Incomplete dump');
    if (lastBackupBlock === state.best_block_number) { fs.unlinkSync(temporary); return; }
    fs.renameSync(temporary, backupFile); lastBackupBlock = state.best_block_number;
  } catch { try { fs.unlinkSync(temporary); } catch {} }
}
backup();
const backupTimer = setInterval(backup, 10_000);
function stop() {
  if (stopping) return;
  stopping = true;
  // Signal the actual binary, not an npm shim; await its final dump and exit.
  child.kill('SIGINT');
  timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  clearTimeout(timer); clearInterval(backupTimer); backup();
  process.exitCode = stopping ? 0 : (code ?? 1);
});
