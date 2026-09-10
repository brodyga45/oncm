import {assertLocalConfig} from './local-endpoints.mjs';
import {selectWalletChain, publicWalletProvider} from './public-transport.mjs';
import {withPublicLogs} from './public-logs.mjs';
import { settlementInventory } from './capital.mjs';
import { executeBoundedSwap } from './swap-limits.mjs';
import { liquidityLimits, validateLiquidityQuote } from './liquidity.mjs';
import { creatorFromAggregate, protocolFromAggregate, revenueCollectionMethod } from './revenue.mjs';
import { readGovernance, decodeGovernanceCall } from './governance.mjs';
import { createMonetaryPolicy } from './monetary-policy.mjs';
import { createTreasury } from './treasury.mjs';
import { verifyExternalCertificate, verifyExternalBundle } from './external-certificates.mjs';
import { supportedExternalProfiles, selectExternalBundleProfile } from './external-profile-catalog.mjs';
import { createOnchainSocial } from './social.mjs';
import { readDerivedReadiness } from './derived-readiness.mjs';
import {
  Interface,
  Contract,
  JsonRpcProvider,
  BrowserProvider,
  HDNodeWallet,
  parseEther,
  formatEther,
  MaxUint256,
  keccak256,
  toUtf8Bytes,
  AbiCoder,
  ZeroAddress,
} from 'ethers';
export const CHAIN_ID = 31373;
export const LOCAL_RPC = 'http://127.0.0.1:9547';
export function createSDK(config, abis, runner) {
  const provider = withPublicLogs(
    runner?.provider ||
    runner ||
    new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 }), config);
  const write = runner || provider;
  const c = (key, name = key) => new Contract(config.addresses[key] || key, abis[name], write);
  const erc20 = (address) => new Contract(address, abis.TrueToken, write);
  const queryRouter = new Contract(config.addresses.Router, abis.Router, provider);
  const registry = c('StatementRegistry'),
    coordinator = c('PoolCoordinator'),
    router = c('Router'),
    position = c('PositionRouter'),
    allocation = c('AllocationController');
  const vault = new Contract(
    config.addresses.Vault,
    [...abis.Vault, ...abis.VaultExtension, ...abis.VaultAdmin].filter((f) =>
      ['function', 'event', 'error'].includes(f.type),
    ),
    write,
  );
  async function ensureChain() {
    if ((await provider.getNetwork()).chainId !== 31373n)
      throw Error('Switch wallet to Vault local chain 31373');
  }
  async function send(p) {
    await ensureChain();
    return await (await (typeof p === 'function' ? p() : p)).wait();
  }
  async function approve(token, spender, amount) {
    const user = await write.getAddress();
    if ((await erc20(token).allowance(user, spender)) < amount)
      await send(() => erc20(token).approve(spender, amount));
  }
  async function permit(token, amount) {
    await approve(token, config.addresses.Permit2, amount);
    const p = c('Permit2');
    const user = await write.getAddress();
    const allowance = await p.allowance(user, token, config.addresses.Router);
    const now = (await provider.getBlock('latest')).timestamp;
    if (allowance[0] < amount || allowance[1] < now + 600)
      await send(() =>
        p.approve(token, config.addresses.Router, (1n << 160n) - 1n, BigInt(now + 86400 * 30)),
      );
  }
  async function statement(id) {
    const s = await registry.getStatement(id);
    const operation =
      Number(s.kind) === 4
        ? {
            operatorId: await registry.statementOperator(id),
            operatorParams: await registry.operationParams(id),
          }
        : {};
    return {
      ...operation,
      id,
      goalHash: s.goalHash,
      profileId: s.profileId,
      conditionId: s.conditionId,
      dependency: s.dependency,
      deadline: Number(s.deadline),
      resolvedAt: Number(s.resolvedAt),
      kind: Number(s.kind),
      expected: Number(s.expected),
      outcome: Number(s.outcome),
      author: s.author,
      yes: s.yes,
      no: s.no,
      title: s.title,
      manifest: s.manifest,
    };
  }
  async function statements() {
    const n = Number(await registry.count());
    return Promise.all(
      Array.from({ length: n }, async (_, i) => statement(await registry.statementIds(i))),
    );
  }
  async function pools() {
    const n = Number(await coordinator.count());
    return Promise.all(
      Array.from({ length: n }, async (_, i) => {
        const p = await coordinator.getPool(i);
        const info = await vault.getPoolTokenInfo(p.pool);
        const tokenAddresses = [...info[0]];
        const balances = info[2].map(String);
        const weighted = new Contract(p.pool, abis.WeightedPool, write);
        const totalSupply = String(await weighted.totalSupply());
        return {
          address: p.pool,
          statementId: p.statementId,
          side: Number(p.side),
          outcomeWeight: String(p.outcomeWeight),
          creator: p.creator,
          hook: await coordinator.hooks(p.statementId),
          tokens: tokenAddresses,
          balances,
          totalSupply,
          initialized: BigInt(totalSupply) > 0n,
        };
      }),
    );
  }
  async function balances(account, ss, ps) {
    const tokens = [
      config.addresses.TrueToken,
      ...ss.flatMap((s) => [s.yes, s.no]),
      ...ps.map((p) => p.address),
    ];
    return Object.fromEntries(
      await Promise.all(
        [...new Set(tokens)].map(async (t) => [t, String(await erc20(t).balanceOf(account))]),
      ),
    );
  }
  async function quoteLiquidity(kind, pool, value, slippageBps = 100) {
    const account = write.getAddress ? await write.getAddress() : ZeroAddress;
    const block = await provider.getBlock('latest'), at = { blockTag: block.number };
    const tokens = [...await vault.getPoolTokens(pool, at)];
    if (kind === 'initialize') {
      const statementId = await coordinator.statementOfPool(pool, at);
      if (BigInt(statementId) === 0n || await registry.outcomeOf(statementId, at) !== 0n)
        throw Error('Only open official pools can be initialized');
      const amounts = value.map(BigInt);
      if (amounts.length !== tokens.length || amounts.some((a) => a <= 0n)) throw Error('Positive exact amount for every pool token required');
      const weighted = new Contract(pool, abis.WeightedPool, provider);
      if (await weighted.totalSupply(at) !== 0n) throw Error('Pool is already initialized');
      // Official pools contain only 18-decimal standard T/outcome tokens with
      // no rate provider. Thus raw amounts equal liveScaled18 at initialization.
      const invariant = await weighted.computeInvariant(amounts, 1, at);
      const minimumSupply = await vault.getPoolMinimumTotalSupply(at);
      if (invariant <= minimumSupply) throw Error('Initial liquidity is below minimum supply');
      const bpt = invariant - minimumSupply;
      return { kind, pool, account, tokens, amounts, limits: amounts, bpt,
        minimumBpt: liquidityLimits([bpt], slippageBps, 'exit')[0], blockNumber: block.number, blockHash: block.hash };
    }
    const bpt = BigInt(value);
    if (bpt <= 0n) throw Error('BPT amount must be positive');
    const method = kind === 'join' ? 'queryAddLiquidityProportional' : 'queryRemoveLiquidityProportional';
    const amounts = [...await queryRouter[method].staticCall(pool, bpt, account, '0x', { ...at, from: ZeroAddress })];
    return { kind, pool, account, tokens, bpt, amounts, limits: liquidityLimits(amounts, slippageBps, kind), blockNumber: block.number, blockHash: block.hash };
  }
  return {
    social: createOnchainSocial(config, write),
    monetaryPolicy: createMonetaryPolicy({provider,config,write,send}),
    config,
    abis,
    provider,
    c,
    erc20,
    vault,
    registry,
    coordinator,
    router,
    position,
    allocation,
    ensureChain,
    verifyExternalCertificate: (record, descriptor, candidateBridge) => verifyExternalCertificate({
      provider, registry, defaultBridge: config.addresses.LeanProofBridge, record, descriptor, candidateBridge,
    }),
    supportedExternalProfiles,
    verifyExternalBundle: (input, expectedDescriptor, candidateBridge) => {
      const selected=selectExternalBundleProfile(input,expectedDescriptor.profileId);
      return verifyExternalBundle({provider,registry,defaultBridge:config.addresses.LeanProofBridge,
        ...selected,candidateBridge});
    },
    send,
    approve,
    permit,
    statement,
    statements,
    pools,
    balances,
    treasury: createTreasury({ provider, config, abis, write, send }),
    governanceSnapshot: (account = '') => readGovernance({ provider, config, abis,
      governor: new Contract(config.addresses.Governor, abis.VaultGovernor, provider),
      membership: new Contract(config.addresses.Membership, abis.Membership, provider),
      timelockAt: (address) => new Contract(address, abis.TimelockController, provider),
    }, account),
    quoteInitialize: (pool, amounts, bps = 100) => quoteLiquidity('initialize', pool, amounts, bps),
    quoteJoin: (pool, bpt, bps = 100) => quoteLiquidity('join', pool, bpt, bps),
    quoteExit: (pool, bpt, bps = 100) => quoteLiquidity('exit', pool, bpt, bps),
    async revenueSnapshot(account = ZeroAddress) {
      const ss = await statements(), ps = await pools();
      const block = await provider.getBlock('latest'), at = { blockTag: block.number };
      const controller = c('ProtocolFeeController'), warehouse = c('SplitsWarehouse');
      const tokens = [...new Set([config.addresses.TrueToken, ...ss.flatMap((s) => [s.yes, s.no])])];
      const poolFees = await Promise.all(ps.map(async (pool) => {
        const poolTokens = [...await vault.getPoolTokens(pool.address, at)];
        const [held, heldProtocol, swapInfo, yieldInfo, creatorSwap, creatorYield] = await Promise.all([
          controller.getPoolCreatorFeeAmounts(pool.address, at),
          controller.getProtocolFeeAmounts(pool.address, at),
          controller.getPoolProtocolSwapFeeInfo(pool.address, at),
          controller.getPoolProtocolYieldFeeInfo(pool.address, at),
          controller.getPoolCreatorSwapFeePercentage(pool.address, at),
          controller.getPoolCreatorYieldFeePercentage(pool.address, at),
        ]);
        const [aggregateSwap, aggregateYield] = await Promise.all([
          controller.computeAggregateFeePercentage(swapInfo[0], creatorSwap, at),
          controller.computeAggregateFeePercentage(yieldInfo[0], creatorYield, at),
        ]);
        const assets = await Promise.all(poolTokens.map(async (token, i) => {
          const [swap, yieldFee] = await Promise.all([
            vault.getAggregateSwapFeeAmount(pool.address, token, at),
            vault.getAggregateYieldFeeAmount(pool.address, token, at),
          ]);
          return { token, aggregateSwap: String(swap), aggregateYield: String(yieldFee),
            pendingCreator: String(creatorFromAggregate(swap, swapInfo[0], creatorSwap, aggregateSwap)
              + creatorFromAggregate(yieldFee, yieldInfo[0], creatorYield, aggregateYield)),
            controllerCreator: String(held[i]),
            pendingProtocol: String(protocolFromAggregate(swap,swapInfo[0],creatorSwap,aggregateSwap)+protocolFromAggregate(yieldFee,yieldInfo[0],creatorYield,aggregateYield)),
            controllerProtocol: String(heldProtocol[i]),
          };
        }));
        return { pool: pool.address, assets, swapRates:{protocol:String(swapInfo[0]),creator:String(creatorSwap),aggregate:String(aggregateSwap)} };
      }));
      const epochCount = Number(await allocation.epoch(at));
      const epochs = await Promise.all(Array.from({ length: epochCount }, async (_, i) => {
        const a = await allocation.allocation(i + 1, at);
        return { epoch: i + 1, split: a.split, assets: await Promise.all(tokens.map(async (token) => ({
          token, undistributed: String(await erc20(token).balanceOf(a.split, at)),
        }))) };
      }));
      const assets = await Promise.all(tokens.map(async (token) => ({
        token, forwarded: String(await erc20(token).balanceOf(config.addresses.AllocationController, at)),
        claimable: account === ZeroAddress ? '0' : String(await warehouse.balanceOf(account, BigInt(token), at)),
      })));
      return { blockNumber: block.number, blockHash: block.hash, account, activeEpoch: epochCount, pools: poolFees, epochs, assets,collectionMethod:revenueCollectionMethod(config),globalProtocolToBeneficiaries:revenueCollectionMethod(config)==='collectAll' };
    },
    async statementEvidence(statementId) {
      const s = await statement(statementId);
      if (s.author === ZeroAddress) throw Error('Unknown statement');
      const profile = s.kind === 0 ? await registry.profiles(s.profileId) : null;
      const operator = s.kind === 4 ? await registry.operators(s.operatorId) : null;
      const lists = await Promise.all([
        registry.queryFilter(
          registry.filters.StatementCreated(statementId),
          config.deploymentBlock,
        ),
        registry.queryFilter(
          registry.filters.StatementResolved(statementId),
          config.deploymentBlock,
        ),
      ]);
      const transactions = await Promise.all(
        lists.flat().map(async (event) => {
          const [tx, block] = await Promise.all([
            provider.getTransaction(event.transactionHash),
            provider.getBlock(event.blockNumber),
          ]);
          const call =
            tx.to?.toLowerCase() === config.addresses.StatementRegistry.toLowerCase()
              ? registry.interface.parseTransaction({ data: tx.data, value: tx.value })
              : null;
          return {
            event: event.eventName,
            hash: tx.hash,
            blockNumber: block.number,
            blockHash: block.hash,
            timestamp: block.timestamp,
            from: tx.from,
            to: tx.to,
            calldata: tx.data,
            method: call?.name || null,
            certificate: ['register', 'submitProof'].includes(call?.name)
              ? call.args.certificate
              : null,
            evidenceHash: event.eventName === 'StatementResolved' ? event.args.evidenceHash : null,
          };
        }),
      );
      return {
        statement: s,
        profile: profile
          ? {
              profileId: s.profileId,
              verifier: profile.verifier,
              enabled: profile.enabled,
              manifest: profile.manifest,
            }
          : null,
        operator: operator
          ? {
              operatorId: s.operatorId,
              implementation: operator.implementation,
              specification: operator.specification,
              enabled: operator.enabled,
              params: s.operatorParams,
            }
          : null,
        transactions,
      };
    },
    async settlementStress(poolAddress, account) {
      const all = await pools();
      const pool = all.find((p) => p.address.toLowerCase() === poolAddress.toLowerCase());
      if (!pool) throw Error('Unknown official pool');
      const block = await provider.getBlock('latest'),
        at = { blockTag: block.number };
      const [info, bptBalance, totalSupply] = await Promise.all([
        vault.getPoolTokenInfo(poolAddress, at),
        erc20(poolAddress).balanceOf(account, at),
        erc20(poolAddress).totalSupply(at),
      ]);
      return {
        pool: poolAddress,
        account,
        blockNumber: block.number,
        blockHash: block.hash,
        ...settlementInventory({
          ...pool,
          tokens: [...info[0]],
          balances: info[2].map(String),
          totalSupply,
          bptBalance,
          collateral: config.addresses.TrueToken,
        }),
      };
    },
    async governancePreflight(target, data, value = 0n) {
      const block = await provider.getBlock('latest');
      const decoded = decodeGovernanceCall(target, data, value, config, abis);
      const authority = await c('Governor', 'VaultGovernor').timelock({ blockTag: block.number });
      const base = {
        target,
        data,
        value: String(value),
        from: authority,
        blockNumber: block.number,
        decoded,
      };
      try {
        if ((await provider.getCode(target, block.number)) === '0x')
          throw Error('Target has no contract bytecode');
        const result = await provider.send('eth_call', [
          {
            to: target,
            from: authority,
            data,
            value: '0x' + BigInt(value).toString(16),
          },
          '0x' + block.number.toString(16),
        ]);
        return { ...base, ok: true, returnData: result };
      } catch (e) {
        return {
          ...base,
          ok: false,
          error: e.shortMessage || e.reason || e.message,
          revertData: e.data || e.info?.error?.data || null,
        };
      }
    },
    async register({ goalHash, profileId, title, manifest, registrationCertificate, certificate },options={}) {
      return send(() => {
        if(options.isCurrent&&!options.isCurrent())throw Error('Registration selection or wallet changed');
        return registry.register(
          goalHash,
          profileId,
          title,
          manifest || '',
          registrationCertificate || certificate,
        );
      });
    },
    async createPool(id, side, weight, fee) {
      return send(() =>
        coordinator.create(
          id,
          side,
          parseEther(String(weight)),
          parseEther(String(fee)),
          keccak256(toUtf8Bytes(crypto.randomUUID())),
        ),
      );
    },
    async split(id, amount) {
      amount = BigInt(amount);
      await approve(config.addresses.TrueToken, config.addresses.PositionRouter, amount);
      return send(() => position.split(id, amount));
    },
    async merge(id, amount) {
      amount = BigInt(amount);
      const s = await statement(id);
      for (const t of [s.yes, s.no]) await approve(t, config.addresses.PositionRouter, amount);
      return send(() => position.merge(id, amount));
    },
    async redeem(id, yes, no) {
      const s = await statement(id);
      for (const [t, a] of [
        [s.yes, BigInt(yes)],
        [s.no, BigInt(no)],
      ])
        if (a) await approve(t, config.addresses.PositionRouter, a);
      return send(() => position.redeem(id, yes, no));
    },
    async initialize(pool, amounts, quote) {
      await ensureChain();
      const statementId = await coordinator.statementOfPool(pool);
      if (BigInt(statementId) === 0n || (await registry.outcomeOf(statementId)) !== 0n)
        throw Error('Only open official pools can be initialized');
      const tokens = [...(await vault.getPoolTokens(pool))];
      const q = validateLiquidityQuote(quote || await quoteLiquidity('initialize', pool, amounts), {
        kind: 'initialize', pool, account: await write.getAddress(), tokens, amounts,
      });
      for (let i = 0; i < tokens.length; i++) await permit(tokens[i], BigInt(amounts[i]));
      return send(() => router.initialize(pool, tokens, amounts, q.minimumBpt, false, '0x'));
    },
    async join(pool, bptOut, slippageBps = 100, quote) {
      await ensureChain();
      const tokens = [...(await vault.getPoolTokens(pool))];
      const user = await write.getAddress();
      const q = validateLiquidityQuote(quote || await quoteLiquidity('join', pool, bptOut, slippageBps), {
        kind: 'join', pool, account: user, tokens, bpt: bptOut,
      });
      const maximum = q.limits;
      for (let i = 0; i < tokens.length; i++) await permit(tokens[i], maximum[i]);
      return send(() => router.addLiquidityProportional(pool, maximum, bptOut, false, '0x'));
    },
    async exit(pool, bptIn, slippageBps = 100, quote) {
      await ensureChain();
      const user = await write.getAddress();
      const tokens = [...await vault.getPoolTokens(pool)];
      const q = validateLiquidityQuote(quote || await quoteLiquidity('exit', pool, bptIn, slippageBps), {
        kind: 'exit', pool, account: user, tokens, bpt: bptIn,
      });
      const minimum = q.limits;
      await approve(pool, config.addresses.Router, BigInt(bptIn));
      return send(() => router.removeLiquidityProportional(pool, bptIn, minimum, false, '0x'));
    },
    async quote(pool, tokenIn, tokenOut, amount) {
      return queryRouter.querySwapSingleTokenExactIn.staticCall(
        pool,
        tokenIn,
        tokenOut,
        amount,
        write.getAddress ? await write.getAddress() : ZeroAddress,
        '0x',
        { from: ZeroAddress },
      );
    },
    async swap(pool, tokenIn, tokenOut, amount, slippageBps = 100, limits) {
      await ensureChain();
      return executeBoundedSwap({
        amount, slippageBps, limits,
        now: async () => (await provider.getBlock('latest')).timestamp,
        quote: async () => queryRouter.querySwapSingleTokenExactIn.staticCall(
          pool, tokenIn, tokenOut, amount, await write.getAddress(), '0x', { from: ZeroAddress },
        ),
        approve: (input) => permit(tokenIn, input),
        execute: ({ amount: input, minimumAmountOut, deadline }) => send(() =>
          router.swapSingleTokenExactIn(
            pool, tokenIn, tokenOut, input, minimumAmountOut, deadline, false, '0x',
          ),
        ),
      });
    },
    async prove(id, outcome, certificate) {
      return send(() => registry.submitProof(id, outcome, certificate));
    },
    async derived(id, kind, expected, deadline, title) {
      return send(() => registry.registerDerived(id, kind, expected, deadline, title));
    },
    derivedReadiness: id => readDerivedReadiness({provider,registry},id),
    async resolveDerived(id,options={}) {
      const preflight=await readDerivedReadiness({provider,registry},id);
      if(!preflight.ready)throw Error(preflight.reason);
      return send(() => {
        if(options.isCurrent&&!options.isCurrent())throw Error('Derived statement selection or wallet changed');
        return registry.resolveDerived(id);
      });
    },
    async collect(pool) {
      return send(() => allocation[revenueCollectionMethod(config)](pool));
    },
    async distribute(epoch, token) {
      return send(() => allocation.distribute(epoch, token));
    },
    async claim(token) {
      const who = await write.getAddress(),
        warehouse = c('SplitsWarehouse');
      const balance = await warehouse.balanceOf(who, BigInt(token));
      if (balance === 0n) throw Error('No claimable revenue');
      return send(() =>
        warehouse['withdraw(address,address[],uint256[],address)'](who, [token], [balance], who),
      );
    },
  };
}
export async function localWallet(config, index = 0) {
  assertLocalConfig(config);
  if (
    config.chainId !== CHAIN_ID ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 3
  )
    throw Error('Dev wallet is restricted to the Vault local chain');
  const provider = new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 100;
  if ((await provider.getNetwork()).chainId !== 31373n) throw Error('Wrong network');
  return HDNodeWallet.fromPhrase(
    'test test test test test test test test test test test junk',
    undefined,
    `m/44'/60'/0'/0/${index}`,
  ).connect(provider);
}
export async function injectedWallet(ethereum, config) {
  if (!ethereum) throw Error('Install an EIP-1193 wallet');
  if (config) await selectWalletChain(ethereum, config);
  const provider = new BrowserProvider(publicWalletProvider(ethereum, config), undefined, { cacheTimeout: -1 });
  await provider.send('eth_requestAccounts', []);
  if ((await provider.getNetwork()).chainId !== 31373n)
    throw Error('Switch to chain31373 using the RPC of this Vault instance');
  await verifyInjectedDeployment(provider, config);
  return provider.getSigner();
}
export async function verifyInjectedDeployment(provider, config) {
  if (config?.publicMode) {
    for (const key of ['StatementRegistry', 'TrueToken']) {
      const address = config.addresses[key];
      const expected = Object.entries(config.monetaryPolicy?.runtimeHashes || {})
        .find(([a]) => a.toLowerCase() === address.toLowerCase())?.[1];
      const code = await provider.getCode(address);
      if (!expected || code === '0x' || keccak256(code).toLowerCase() !== expected.toLowerCase())
        throw Error('Wallet RPC does not match this Vault V2 deployment: ' + key);
    }
  }
}
export { parseEther, formatEther, keccak256, toUtf8Bytes, AbiCoder };
