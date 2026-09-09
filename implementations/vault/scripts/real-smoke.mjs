// Real published Lean/Groth16 end-to-end. Consumes existing runner JSON results; never starts a prover.
// Usage: node scripts/real-smoke.mjs registration-result.json proof-result.json
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { AbiCoder, keccak256, parseEther, NonceManager } from 'ethers';
import { createSDK, localWallet } from '../sdk/index.mjs';
const [registrationPath, proofPath] = process.argv.slice(2);
if (!registrationPath || !proofPath)
  throw Error(
    'Provide existing registration and proof result JSON paths. This script sends real local-chain transactions.',
  );
const registration = JSON.parse(fs.readFileSync(registrationPath));
const proof = JSON.parse(fs.readFileSync(proofPath));
const config = JSON.parse(fs.readFileSync('.state/deployment.json'));
const abis = JSON.parse(fs.readFileSync('.state/abis.json'));
const fixture = JSON.parse(fs.readFileSync('proof/fixtures.json')).find(
  (f) => f.id === 'lean-nat-add-comm-4.33.1',
);
for (const result of [registration, proof]) {
  assert.equal(result.status, 'proved');
  assert.equal(result.profileId, config.proof.profileId);
  assert.equal(result.goalHash, fixture.goalHash);
  assert(result.certificate?.startsWith('0x'));
}
const maker = await localWallet(config, 0),
  taker = await localWallet(config, 1);
const sdk = createSDK(config, abis, new NonceManager(maker));
const trader = createSDK(config, abis, new NonceManager(taker));
const sid = keccak256(
  AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32'],
    [fixture.goalHash, config.proof.profileId],
  ),
);
assert(
  await sdk
    .c('LeanProofBridge')
    .verifyGoal(fixture.goalHash, config.proof.profileId, registration.certificate),
);
assert(
  await sdk
    .c('LeanProofBridge')
    .verify(sid, fixture.goalHash, config.proof.profileId, 1, proof.certificate),
);
assert.equal(
  (await sdk.registry.getStatement(sid)).author,
  '0x0000000000000000000000000000000000000000',
  'Published fixture already registered. Preserve existing market and use its web flow.',
);
const transactions = [],
  results = [];
async function step(label, fn) {
  const receipt = await fn();
  if (receipt?.hash) {
    const block = await sdk.provider.getBlock(receipt.blockNumber);
    transactions.push({
      label,
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: block.hash,
      timestamp: block.timestamp,
      actor: receipt.from,
    });
  }
  results.push(label);
  console.log('PASS', label);
  return receipt;
}
const beforeBlock = await sdk.provider.getBlockNumber();
await step('Published Lean goal verified and registered through real Groth16 bridge', () =>
  sdk.register({
    ...fixture,
    profileId: config.proof.profileId,
    certificate: registration.certificate,
    manifest: JSON.stringify({
      repository: fixture.repositoryUrl,
      version: fixture.version,
      upstreamDeclaration: fixture.upstreamDeclaration,
      goalDeclaration: fixture.targetDeclaration,
      proofDeclaration: fixture.proofDeclaration,
    }),
  }),
);
const statement = await sdk.statement(sid);
await step('Split 1000 T into canonical YES and NO complete sets', () =>
  sdk.split(sid, parseEther('1000')),
);
await step('Create original Balancer WeightedPool with 80% outcome weight', () =>
  sdk.createPool(sid, 0, '0.8', '0.01'),
);
const pool = (await sdk.pools()).find((p) => p.statementId === sid);
await step('Initialize real pool with 100 T and 800 YES', () =>
  sdk.initialize(
    pool.address,
    pool.tokens.map((t) =>
      parseEther(t.toLowerCase() === config.addresses.TrueToken.toLowerCase() ? '100' : '800'),
    ),
  ),
);
await step('Trader buys YES with 10 T through Permit2 and original Router', () =>
  trader.swap(pool.address, config.addresses.TrueToken, statement.yes, parseEther('10')),
);
const traderYes = await trader.erc20(statement.yes).balanceOf(taker.address);
assert(traderYes > 0n);
await step('Open participation adds and removes proportional BPT', async () => {
  await sdk.join(pool.address, parseEther('1'));
  return sdk.exit(pool.address, parseEther('1'));
});
const stress = await sdk.settlementStress(pool.address, maker.address);
await step('Creator fee collected in T into immutable epoch Split', () =>
  sdk.collect(pool.address),
);
await step('Published Lean proof finalizes CTF through real Groth16 certificate', () =>
  sdk.prove(sid, 1, proof.certificate),
);
assert.equal((await sdk.statement(sid)).outcome, 1);
await assert.rejects(() =>
  sdk.quote(pool.address, config.addresses.TrueToken, statement.yes, parseEther('1')),
);
results.push('Finality hook rejects a new swap after payout');
await step('Finalized LP exits original Balancer pool proportionally', async () =>
  sdk.exit(pool.address, await sdk.erc20(pool.address).balanceOf(maker.address)),
);
const traderTBefore = await trader.erc20(config.addresses.TrueToken).balanceOf(taker.address);
await step('Trader redeems winning YES exactly one-for-one to T', () =>
  trader.redeem(sid, traderYes, 0),
);
assert.equal(
  await trader.erc20(config.addresses.TrueToken).balanceOf(taker.address),
  traderTBefore + traderYes,
);
await step('Maker redeems returned YES and extinguishes losing NO', async () =>
  sdk.redeem(
    sid,
    await sdk.erc20(statement.yes).balanceOf(maker.address),
    await sdk.erc20(statement.no).balanceOf(maker.address),
  ),
);
await step('Epoch revenue distributes through original Splits V2', () =>
  sdk.distribute(1, config.addresses.TrueToken),
);
await step('Beneficiary pulls earned T from original SplitsWarehouse', () =>
  sdk.claim(config.addresses.TrueToken),
);
const afterBlock = await sdk.provider.getBlockNumber();
const report = {
  status: 'passed',
  proofKind: 'real RISC Zero Groth16; existing certificates reverified on-chain',
  fixture,
  profile: config.proof,
  statementId: sid,
  pool: pool.address,
  fromBlock: beforeBlock + 1,
  toBlock: afterBlock,
  transactions,
  results,
  stress,
  balances: await sdk.balances(maker.address, await sdk.statements(), await sdk.pools()),
  verifiedAt: new Date().toISOString(),
};
fs.writeFileSync(
  '.state/real-smoke-report.json',
  JSON.stringify(report, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2),
);
console.log(
  'Real smoke report written. Every transaction is visible through /api/activity and Blocks.',
);
