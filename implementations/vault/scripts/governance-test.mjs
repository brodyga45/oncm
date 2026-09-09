import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  Contract,
  JsonRpcProvider,
  HDNodeWallet,
  NonceManager,
  keccak256,
  toUtf8Bytes,
} from 'ethers';
import { createSDK } from '../sdk/index.mjs';
const config = JSON.parse(fs.readFileSync('.state/deployment.json')),
  abis = JSON.parse(fs.readFileSync('.state/abis.json'));
const provider = new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 });
provider.pollingInterval = 50;
const wallets = [0, 1, 2, 3].map(
  (i) =>
    new NonceManager(
      HDNodeWallet.fromPhrase(
        'test test test test test test test test test test test junk',
        undefined,
        `m/44'/60'/0'/0/${i}`,
      ).connect(provider),
    ),
);
const sdk = createSDK(config, abis, wallets[0]);
await sdk.ensureChain();
const snap = await provider.send('evm_snapshot', []);
const results = [];
const check = async (n, fn) => {
  await fn();
  results.push(n);
  console.log('PASS', n);
};
try {
  const governor = sdk.c('Governor', 'VaultGovernor'),
    registry = sdk.registry;
  const { exampleOperator: o } = config;
  const call = registry.interface.encodeFunctionData('setOperator', [
    o.id,
    o.implementation,
    o.specification,
    true,
  ]);
  const targets = [config.addresses.StatementRegistry],
    values = [0],
    calls = [call],
    description = 'Install immutable ResolvedWithinWindow module (isolated governance test)',
    dh = keccak256(toUtf8Bytes(description));
  let proposalId;
  await check('governance preflight simulates Timelock and rejects EOA target', async () => {
    assert.equal((await sdk.governancePreflight(targets[0], call)).ok, true);
    assert.equal((await sdk.governancePreflight(await wallets[3].getAddress(), '0x')).ok, false);
  });
  await check(
    'separate membership owns votes; T transfers do not confer voting power',
    async () => {
      const mem = sdk.c('Membership');
      assert.equal(await mem.getVotes(await wallets[3].getAddress()), 0n);
      assert.equal(await mem.getVotes(await wallets[0].getAddress()), 10n ** 18n);
      const other = await wallets[3].getAddress();
      await assert.rejects(
        () => mem.transfer.staticCall(other, 1),
        /membership is non-transferable/,
      );
    },
  );
  await check('propose -> snapshot -> separate member vote -> quorum', async () => {
    await (await governor.propose(targets, values, calls, description)).wait();
    proposalId = await governor.hashProposal(targets, values, calls, dh);
    await provider.send('hardhat_mine', ['0x2']);
    await (await governor.castVote(proposalId, 1)).wait();
    await (await governor.connect(wallets[1]).castVote(proposalId, 1)).wait();
    await assert.rejects(() => governor.castVote.staticCall(proposalId, 1));
    await provider.send('hardhat_mine', ['0xa']);
    assert.equal(await governor.state(proposalId), 4n);
  });
  await check('queue -> timelock delay -> execute installs immutable operator', async () => {
    await (await governor.queue(targets, values, calls, dh)).wait();
    await assert.rejects(() => governor.execute.staticCall(targets, values, calls, dh));
    await provider.send('evm_increaseTime', [6]);
    await provider.send('evm_mine', []);
    await (await governor.execute(targets, values, calls, dh)).wait();
    assert.equal(await governor.state(proposalId), 7n);
    const stored = await registry.operators(o.id);
    assert.equal(stored.implementation, o.implementation);
    assert.equal(stored.enabled, true);
  });
  await check('bootstrap admin revoked and main resolver has no admin settlement', async () => {
    const timelock = sdk.c('Timelock', 'TimelockController');
    assert.equal(
      await timelock.hasRole(await timelock.DEFAULT_ADMIN_ROLE(), await wallets[0].getAddress()),
      false,
    );
    assert.equal(registry.interface.getFunction('adminResolve'), null);
  });
  fs.writeFileSync(
    '.state/governance-report.json',
    JSON.stringify({ status: 'passed', isolation: 'evm_snapshot reverted', results }, null, 2),
  );
} finally {
  await provider.send('evm_revert', [snap]);
}
