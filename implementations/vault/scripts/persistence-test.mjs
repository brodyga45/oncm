// Light RPC checks and a checkpoint for an explicit graceful persistence reload.
// No Lean/prover, compiler, mock certificate or market creation.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { keccak256 } from 'ethers';
const mode = process.argv[2] || '--capture';
const config = JSON.parse(fs.readFileSync('.state/deployment.json'));
const txs = JSON.parse(fs.readFileSync('.state/deployment-txs.json'));
async function rpc(method, params = []) {
  const response = await fetch('http://127.0.0.1:9547', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(3000) });
  const result = await response.json(); if (result.error) throw Error(result.error.message); return result.result;
}
assert.equal(await rpc('eth_chainId'), '0x7a8d');
assert.match(await rpc('web3_clientVersion'), /anvil/i);
if (mode === '--capture') {
  const tstore = await rpc('eth_call', [{ data: '0x602a60005d60005c60005260206000f3' }, 'latest']);
  assert.equal(BigInt(tstore), 42n);
  const snapshot = await rpc('evm_snapshot');
  try {
    const before = BigInt(await rpc('eth_blockNumber'));
    await rpc('hardhat_mine', ['0x2']);
    assert.equal(BigInt(await rpc('eth_blockNumber')), before + 2n);
    await rpc('evm_increaseTime', [1]); await rpc('evm_mine');
  } finally { assert.equal(await rpc('evm_revert', [snapshot]), true); }
}
const block = await rpc('eth_getBlockByNumber', ['latest', false]);
const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
const code = await rpc('eth_getCode', [config.addresses.Vault, 'latest']);
const firstReceipt = await rpc('eth_getTransactionReceipt', [txs[0].hash]);
const lastReceipt = await rpc('eth_getTransactionReceipt', [txs.at(-1).hash]);
assert(firstReceipt && lastReceipt); assert.equal(firstReceipt.status, '0x1'); assert.equal(lastReceipt.status, '0x1');
assert.equal((code.length - 2) / 2, 24242);
const logs = await rpc('eth_getLogs', [{ fromBlock: '0x0', toBlock: 'latest' }]);
assert(logs.length > 0);
const evidence = { instance: config.chainInstance.id, head: block.number, headHash: block.hash, genesisHash: genesis.hash,
  vaultCodeHash: keccak256(code), firstTransaction: firstReceipt.transactionHash, firstBlockHash: firstReceipt.blockHash,
  lastTransaction: lastReceipt.transactionHash, lastBlockHash: lastReceipt.blockHash, logCount: logs.length,
  balance: await rpc('eth_getBalance', [config.accounts[0], 'latest']) };
if (mode === '--capture') {
  fs.writeFileSync('.state/chain/restart-checkpoint.json', JSON.stringify(evidence, null, 2));
  console.log('PASS Cancun TSTORE/TLOAD, snapshots/revert, Hardhat mining aliases, code/receipts/logs; reload checkpoint saved');
} else if (mode === '--verify') {
  assert.deepEqual(evidence, JSON.parse(fs.readFileSync('.state/chain/restart-checkpoint.json')));
  fs.writeFileSync('.state/persistence-report.json', JSON.stringify({ status: 'passed', checkedAt: new Date().toISOString(),
    checks: ['Cancun transient storage', 'mining/snapshot/revert RPC compatibility', 'same genesis/head after graceful reload',
      'same real deployment transaction receipts and block hashes', 'same Vault runtime, logs and balance'], evidence }, null, 2));
  console.log('PASS persisted reload preserves genesis/head, real receipts, block hashes, Vault bytecode, logs and balance');
} else throw Error('Use --capture before an explicit graceful reload, then --verify');
