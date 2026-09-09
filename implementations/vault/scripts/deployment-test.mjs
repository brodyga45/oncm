// Read-only final-deployment checks. No markets, transactions or proof jobs are created.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { AbiCoder, ZeroAddress, ZeroHash } from 'ethers';
import { createSDK } from '../sdk/index.mjs';
const config = JSON.parse(fs.readFileSync('.state/deployment.json'));
const abis = JSON.parse(fs.readFileSync('.state/abis.json'));
const descriptor = JSON.parse(fs.readFileSync('proof/deployment.json'));
const manifest = JSON.parse(fs.readFileSync('proof/manifest.json'));
const fixture = JSON.parse(fs.readFileSync('proof/fixtures.json'))[0];
const sdk = createSDK(config, abis),
  results = [];
async function check(name, fn) {
  await fn();
  results.push(name);
  console.log('PASS', name);
}
await check('RPC has own chain 31373 and every configured contract contains code', async () => {
  assert.equal((await sdk.provider.getNetwork()).chainId, 31373n);
  for (const [name, address] of Object.entries(config.addresses))
    assert.notEqual(await sdk.provider.getCode(address), '0x', name);
});
await check(
  'Immutable on-chain v3 image/profile match shipped descriptor and fixture',
  async () => {
    const bridge = sdk.c('LeanProofBridge'),
      profile = await sdk.registry.profiles(descriptor.profileId);
    assert.equal(manifest.adapterVersion, 3);
    assert.equal(config.proof.profileId, descriptor.profileId);
    assert.equal(fixture.profileId, descriptor.profileId);
    assert.equal(await bridge.imageId(), manifest.imageId);
    assert.equal(await bridge.profileId(), descriptor.profileId);
    assert.equal(profile.verifier, config.addresses.LeanProofBridge);
    assert.equal(profile.manifest, descriptor.manifest);
    assert(profile.enabled);
    assert.notEqual(await sdk.provider.getCode(await bridge.verifier()), '0x');
  },
);
await check('Invalid Groth16 seal cannot register a statement', async () => {
  const journal = AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32', 'bytes32', 'uint256'],
    [await sdk.c('LeanProofBridge').DOMAIN(), fixture.goalHash, descriptor.profileId, 0],
  );
  const certificate = AbiCoder.defaultAbiCoder().encode(
    ['bytes', 'bytes'],
    ['0x' + '00'.repeat(260), journal],
  );
  assert.equal(
    await sdk.c('LeanProofBridge').verifyGoal(fixture.goalHash, descriptor.profileId, certificate),
    false,
  );
  await assert.rejects(() =>
    sdk.registry.register.staticCall(
      fixture.goalHash,
      descriptor.profileId,
      'Invalid QA seal',
      '',
      certificate,
    ),
  );
});
await check(
  'Original Balancer Vault fits EIP-170; coordinator exposes per-statement hooks',
  async () => {
    assert.equal((await sdk.provider.getCode(config.addresses.Vault)).slice(2).length / 2, 24242);
    assert.equal(await sdk.coordinator.registry(), config.addresses.StatementRegistry);
    assert.equal(await sdk.coordinator.factory(), config.addresses.WeightedPoolFactory);
    assert.equal(await sdk.coordinator.hooks(ZeroHash), ZeroAddress);
    assert.equal(await sdk.coordinator.statementOfPool(ZeroAddress), ZeroHash);
    assert.equal(await sdk.allocation.coordinator(), config.addresses.PoolCoordinator);
  },
);
await check('Timelock owns governance targets and bootstrap admin is absent', async () => {
  for (const target of [sdk.registry, sdk.allocation, sdk.c('Membership')])
    assert.equal(await target.owner(), config.addresses.Timelock);
  const timelock = sdk.c('Timelock', 'TimelockController');
  assert.equal(
    await timelock.hasRole(await timelock.DEFAULT_ADMIN_ROLE(), config.accounts[0]),
    false,
  );
  assert.equal(
    await timelock.hasRole(await timelock.PROPOSER_ROLE(), config.addresses.Governor),
    true,
  );
});
await check('API serves the same deployment and actual block receipts', async () => {
  const snapshot = await fetch(config.apiUrl + '/api/snapshot').then((r) => r.json());
  assert.equal(snapshot.config.addresses.PoolCoordinator, config.addresses.PoolCoordinator);
  assert.equal(snapshot.config.proof.profileId, descriptor.profileId);
  const activity = await fetch(config.apiUrl + '/api/activity').then((r) => r.json());
  assert(activity.blocks.some((b) => b.transactions.length));
  assert(activity.blocks.every((b) => b.hash.startsWith('0x') && b.timestamp > 0));
  const web = await fetch(config.webUrl);
  assert(web.ok);
  assert((await web.text()).includes('Vault'));
});
const counts = {
  statements: String(await sdk.registry.count()),
  pools: String(await sdk.coordinator.count()),
};
assert.equal(counts.statements, '0');
assert.equal(counts.pools, '0');
fs.writeFileSync(
  '.state/deployment-report.json',
  JSON.stringify(
    {
      status: 'passed',
      profileId: descriptor.profileId,
      imageId: manifest.imageId,
      counts,
      results,
      checkedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
await sdk.provider.destroy();
