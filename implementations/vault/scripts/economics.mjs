// Isolated mock-proof ECONOMIC harness. Snapshot is reverted; never seeds the application registry.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import solc from 'solc';
import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  HDNodeWallet,
  NonceManager,
  id,
  AbiCoder,
  keccak256,
  parseEther,
  ZeroAddress,
} from 'ethers';
import { createSDK } from '../sdk/index.mjs';
const config = JSON.parse(fs.readFileSync('.state/deployment.json')),
  abis = JSON.parse(fs.readFileSync('.state/abis.json'));
const provider = new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 });
provider.pollingInterval = 50;
if ((await provider.getNetwork()).chainId !== 31373n) throw Error('Local Vault chain required');
const wallets = [0, 1, 2].map((i) =>
  HDNodeWallet.fromPhrase(
    'test test test test test test test test test test test junk',
    undefined,
    `m/44'/60'/0'/0/${i}`,
  ).connect(provider),
);
const signer = new NonceManager(wallets[0]);
const snap = await provider.send('evm_snapshot', []);
const results = [];
const art = (n) => JSON.parse(fs.readFileSync('.state/artifacts/' + n + '.json'));
// Exercise the latest local glue artifacts even before the next public devnet deployment.
for (const name of ['PoolCoordinator', 'FinalityHook']) abis[name] = art(name).abi;
async function deploy(n, args = [], a = art(n)) {
  const c = await new ContractFactory(a.abi, a.bytecode, signer).deploy(...args, {
    gasLimit: 40000000,
  });
  await c.waitForDeployment();
  return c;
}
async function ok(name, fn) {
  await fn();
  results.push(name);
  console.log('PASS', name);
}
try {
  const mockSource =
    'pragma solidity ^0.8.28; contract EconomicTestVerifier {function verifyGoal(bytes32,bytes32,bytes calldata certificate) external pure returns(bool){return keccak256(certificate)==keccak256(hex"cafe");}function verify(bytes32,bytes32,bytes32,uint8,bytes calldata certificate) external pure returns(bool){return keccak256(certificate)==keccak256(hex"beef");}}';
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources: { 'Mock.sol': { content: mockSource } },
        settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
      }),
    ),
  );
  const m = output.contracts['Mock.sol'].EconomicTestVerifier;
  const mock = await deploy('Mock', [], { abi: m.abi, bytecode: '0x' + m.evm.bytecode.object });
  const r = await deploy('StatementRegistry', [
    config.addresses.ConditionalTokens,
    config.addresses.TrueToken,
    config.addresses.Wrapped1155Factory,
    wallets[0].address,
  ]);
  const p = await deploy('PositionRouter', [await r.getAddress()]);
  const recipients = wallets
    .slice(0, 2)
    .map((w) => w.address)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const a = await deploy('AllocationController', [
    config.addresses.ProtocolFeeController,
    config.addresses.PullSplitFactory,
    recipients,
    [6000, 4000],
    wallets[0].address,
  ]);
  const f = await deploy('PoolCoordinator', [
    await r.getAddress(),
    config.addresses.WeightedPoolFactory,
    await a.getAddress(),
    config.addresses.Timelock,
  ]);
  await (await a.setCoordinator(await f.getAddress())).wait();
  const testConfig = {
    ...config,
    addresses: {
      ...config.addresses,
      StatementRegistry: await r.getAddress(),
      PositionRouter: await p.getAddress(),
      AllocationController: await a.getAddress(),
      PoolCoordinator: await f.getAddress(),
    },
  };
  const sdk = createSDK(testConfig, abis, signer),
    trader = createSDK(testConfig, abis, new NonceManager(wallets[1]));
  const pid = id('ISOLATED ECONOMIC MOCK profile'),
    goal = id('ISOLATED MOCK goal'),
    sid = keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32', 'bytes32'], [goal, pid]));
  await (
    await r.setProfile(pid, await mock.getAddress(), true, 'EXPLICIT TEST MOCK - not Lean proof')
  ).wait();
  await ok('invalid registration certificate rejected', async () => {
    await assert.rejects(() => r.register.staticCall(goal, pid, 'Mock', 'test', '0x00'));
  });
  await ok('register -> canonical CTF positions and wrappers', async () => {
    await sdk.register({
      goalHash: goal,
      profileId: pid,
      title: 'ISOLATED MOCK economic test',
      manifest: 'not a Lean proof',
      certificate: '0xcafe',
    });
    const s = await sdk.statement(sid);
    assert.notEqual(s.yes, ZeroAddress);
    assert.equal(await sdk.erc20(s.yes).symbol(), 'vYES');
  });
  const statement = await sdk.statement(sid);
  await ok('complete sets split/merge conserve T', async () => {
    const before = await sdk.erc20(config.addresses.TrueToken).balanceOf(wallets[0].address);
    await sdk.split(sid, parseEther('2000'));
    assert.equal(await sdk.erc20(statement.yes).balanceOf(wallets[0].address), parseEther('2000'));
    await sdk.merge(sid, parseEther('10'));
    assert.equal(
      await sdk.erc20(config.addresses.TrueToken).balanceOf(wallets[0].address),
      before - parseEther('1990'),
    );
  });
  await ok('real weighted factory + creator fee + finality hook registered', async () => {
    await sdk.createPool(sid, 0, '0.8', '0.01');
  });
  let pool = (await sdk.pools())[0];
  // Create a second pool without initialization while the statement is still open.
  await sdk.createPool(sid, 1, '0.5', '0.01');
  const emptyPool = (await sdk.pools())[1];
  const boundHook = new Contract(await f.hooks(sid), abis.FinalityHook, provider);
  assert.equal(await boundHook.statementId(), sid);
  assert.equal(await boundHook.statementOf(emptyPool.address), sid);
  await ok('real Permit2 / Balancer Router initialize', async () => {
    await sdk.initialize(
      pool.address,
      pool.tokens.map((t) =>
        t.toLowerCase() === config.addresses.TrueToken.toLowerCase()
          ? parseEther('500')
          : parseEther('1000'),
      ),
    );
    assert((await sdk.erc20(pool.address).balanceOf(wallets[0].address)) > 0n);
  });
  await ok('real exact-in swap transfers and creator fee accrues', async () => {
    await trader.swap(pool.address, config.addresses.TrueToken, statement.yes, parseEther('10'));
    assert((await trader.erc20(statement.yes).balanceOf(wallets[1].address)) > 0n);
    await sdk.collect(pool.address);
    const old = await a.allocation(1);
    assert.equal(
      await sdk.erc20(config.addresses.TrueToken).balanceOf(old.split),
      parseEther('0.02'),
    );
  });
  await ok('open LP proportional join / partial exit', async () => {
    await sdk.join(pool.address, parseEther('1'));
    await sdk.exit(pool.address, parseEther('1'));
  });
  await ok('reallocation requires every decreasing holder; consent revocable', async () => {
    await (await a.propose(recipients, [5000, 5000])).wait();
    await assert.rejects(() => a.applyAllocation.staticCall(0));
    const decreasing = wallets.find((w) => w.address === recipients[0]);
    const consentA = a.connect(new NonceManager(decreasing));
    await (await consentA.setConsent(0, true)).wait();
    await (await consentA.setConsent(0, false)).wait();
    await assert.rejects(() => a.applyAllocation.staticCall(0));
    await (await consentA.setConsent(0, true)).wait();
    await (await a.applyAllocation(0)).wait();
    assert.equal(await a.epoch(), 2n);
  });
  await ok('old epoch Splits distribution + public pull claim remains intact', async () => {
    await sdk.distribute(1, config.addresses.TrueToken);
    const warehouse = sdk.c('SplitsWarehouse');
    const bal = await warehouse.balanceOf(wallets[0].address, BigInt(config.addresses.TrueToken));
    assert(bal > 0n);
    await sdk.claim(config.addresses.TrueToken);
    assert.equal(
      await warehouse.balanceOf(wallets[0].address, BigInt(config.addresses.TrueToken)),
      0n,
    );
  });
  let modular;
  await ok(
    'governed immutable operator validates operands and records a derived statement',
    async () => {
      const op = await deploy('ResolvedWithinWindowOperator');
      const opId = id('ISOLATED resolved window'),
        spec = id('inclusive interval');
      await (await r.setOperator(opId, await op.getAddress(), spec, true)).wait();
      const block = await provider.getBlock('latest');
      const params = AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'uint64', 'uint64', 'uint8'],
        [sid, 0, block.timestamp + 1000, 1],
      );
      const receipt = await (
        await r.registerOperation(opId, params, 'TEST modular derived')
      ).wait();
      modular = receipt.logs
        .map((l) => {
          try {
            return r.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((l) => l?.name === 'StatementCreated').args.statementId;
      await assert.rejects(() => r.resolveDerived.staticCall(modular));
      await assert.rejects(() =>
        r.setOperator.staticCall(opId, config.addresses.TrueToken, spec, true),
      );
    },
  );
  await ok('false outcome pays NO and leaves YES at zero', async () => {
    const falseGoal = id('ISOLATED mock false goal'),
      falseId = keccak256(
        AbiCoder.defaultAbiCoder().encode(['bytes32', 'bytes32'], [falseGoal, pid]),
      );
    await sdk.register({
      goalHash: falseGoal,
      profileId: pid,
      title: 'ISOLATED MOCK false',
      certificate: '0xcafe',
    });
    await sdk.split(falseId, parseEther('7'));
    const s = await sdk.statement(falseId);
    await sdk.prove(falseId, 2, '0xbeef');
    const before = await sdk.erc20(config.addresses.TrueToken).balanceOf(wallets[0].address);
    await sdk.redeem(falseId, parseEther('7'), parseEther('7'));
    assert.equal(
      await sdk.erc20(config.addresses.TrueToken).balanceOf(wallets[0].address),
      before + parseEther('7'),
    );
    assert.equal((await sdk.statement(falseId)).outcome, 2);
  });
  let derived;
  await ok('derived ResolvedBy condition registered', async () => {
    const block = await provider.getBlock('latest');
    const receipt = await sdk.derived(sid, 1, 1, block.timestamp + 1000, 'TEST derived by');
    derived = receipt.logs
      .map((l) => {
        try {
          return r.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((l) => l?.name === 'StatementCreated').args.statementId;
    await assert.rejects(() => r.resolveDerived.staticCall(derived));
  });
  await ok('profile admission disable preserves existing proof resolution', async () => {
    await (
      await r.setProfile(pid, await mock.getAddress(), false, 'EXPLICIT TEST MOCK - not Lean proof')
    ).wait();
    await assert.rejects(() =>
      r.register.staticCall(id('blocked goal'), pid, 'blocked', '', '0xcafe'),
    );
  });
  await ok('invalid settlement rejected; valid isolated mock finalizes exactly once', async () => {
    await assert.rejects(() => r.submitProof.staticCall(sid, 1, '0x00'));
    await sdk.prove(sid, 1, '0xbeef');
    await assert.rejects(() => r.submitProof.staticCall(sid, 2, '0xbeef'));
    assert.equal((await sdk.statement(sid)).outcome, 1);
  });
  await ok(
    'direct canonical Router initialization after payout is rejected by immutable statement hook',
    async () => {
      const amounts = emptyPool.tokens.map(() => parseEther('10'));
      for (let i = 0; i < emptyPool.tokens.length; i++)
        await sdk.permit(emptyPool.tokens[i], amounts[i]);
      await assert.rejects(
        () =>
          sdk.router.initialize.staticCall(
            emptyPool.address,
            emptyPool.tokens,
            amounts,
            0,
            false,
            '0x',
          ),
        (e) => e.data?.slice(0, 10) === id('BeforeInitializeHookFailed()').slice(0, 10),
      );
      assert.equal(await sdk.erc20(emptyPool.address).totalSupply(), 0n);
    },
  );
  await ok('finalized pool forbids swap; proportional LP exit stays available', async () => {
    await assert.rejects(() =>
      sdk.quote(pool.address, config.addresses.TrueToken, statement.yes, parseEther('1')),
    );
    await sdk.exit(pool.address, await sdk.erc20(pool.address).balanceOf(wallets[0].address));
  });
  await ok(
    'public evidence preserves historical profile and exact published chain certificates',
    async () => {
      const evidence = await sdk.statementEvidence(sid);
      assert.equal(evidence.profile.profileId, pid);
      assert.equal(evidence.profile.enabled, false);
      assert.equal(evidence.profile.verifier, await mock.getAddress());
      assert.equal(
        evidence.transactions.find((t) => t.method === 'register').certificate,
        '0xcafe',
      );
      const proofTx = evidence.transactions.find((t) => t.method === 'submitProof');
      assert.equal(proofTx.certificate, '0xbeef');
      assert.equal(proofTx.evidenceHash, keccak256('0xbeef'));
      assert(evidence.transactions.every((t) => t.blockNumber > 0 && t.timestamp > 0));
    },
  );
  await ok('winning wrapper redemption converts 1:1 T; losing side zero', async () => {
    const t = sdk.erc20(config.addresses.TrueToken);
    const before = await t.balanceOf(wallets[0].address),
      yes = await sdk.erc20(statement.yes).balanceOf(wallets[0].address),
      no = await sdk.erc20(statement.no).balanceOf(wallets[0].address);
    await sdk.redeem(sid, yes, no);
    assert.equal(await t.balanceOf(wallets[0].address), before + yes);
    assert.equal(await sdk.erc20(statement.no).balanceOf(wallets[0].address), 0n);
  });
  await ok('derived finality computed from on-chain timestamp', async () => {
    await sdk.resolveDerived(derived);
    assert.equal((await sdk.statement(derived)).outcome, 1);
    await sdk.resolveDerived(modular);
    assert.equal((await sdk.statement(modular)).outcome, 1);
  });
  fs.writeFileSync(
    '.state/economic-report.json',
    JSON.stringify(
      {
        status: 'passed',
        isolation: 'evm_snapshot reverted; proof verifier is explicitly mocked for economics only',
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await provider.send('evm_revert', [snap]);
}
