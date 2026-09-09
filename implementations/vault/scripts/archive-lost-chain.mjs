// Explicit recovery preparation. Never runs automatically from npm run dev.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
try {
  const response = await fetch('http://127.0.0.1:9547', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
    signal: AbortSignal.timeout(1500) });
  throw Error(`RPC responded HTTP ${response.status}; refusing replacement while a listener exists`);
} catch (error) {
  if (error.cause?.code !== 'ECONNREFUSED') throw error;
}
if (['anvil-state.json', 'anvil-state.last-good.json'].some(file => fs.existsSync('.state/chain/' + file)))
  throw Error('A persisted chain or validated backup exists; restore it instead of replacing it');
const now = new Date(), label = now.toISOString().replace(/[:.]/g, '-');
const directory = `.state/archive/${label}-lost-volatile-hardhat`;
fs.mkdirSync(directory, { recursive: true });
const copies = [];
for (const file of fs.readdirSync('.state')) {
  if (!file.endsWith('.json') || file === 'community.json') continue;
  const from = path.join('.state', file);
  if (!fs.statSync(from).isFile()) continue;
  const contents = fs.readFileSync(from);
  fs.copyFileSync(from, path.join(directory, file));
  copies.push({ file, bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') });
}
const instance = { id: randomUUID(), kind: 'anvil-persistent', chainId: 31373,
  createdAt: now.toISOString(), genesisTimestamp: Math.floor(now.getTime() / 1000),
  recovery: { previous: 'volatile-hardhat-state-lost', archive: directory,
    notice: 'New local chain and deployment. Previous chain cannot be recovered from addresses/reports; copied reports describe the lost chain.' } };
fs.writeFileSync(path.join(directory, 'ARCHIVE-MANIFEST.json'), JSON.stringify({ createdAt: now.toISOString(), copies,
  socialHistory: 'community.json intentionally left unchanged', reason: instance.recovery.notice }, null, 2));
fs.writeFileSync('.state/chain-instance.json', JSON.stringify(instance, null, 2));
console.log(JSON.stringify({ archive: directory, newInstance: instance.id, copiedFiles: copies.length }));
