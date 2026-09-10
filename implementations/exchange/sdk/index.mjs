import {
  Contract,
  parseEther,
  formatEther,
  MaxUint256,
  ZeroHash,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { verifyExternalCertificate } from "./proof-import.mjs";
import { verifyExternalBundle } from "./external-registration.mjs";
import { readGovernance } from "./governance.mjs";
export { decodeExternalCertificate, fixtureForCertificate } from "./proof-import.mjs";
export { parseEther, formatEther };
export class ExchangeSDK {
  constructor(provider, signer, deployment, abis, onTx = () => {}) {
    Object.assign(this, { provider, signer, deployment, abis, onTx });
  }
  verifyExternalCertificate(artifact, profile, expected) {
    return verifyExternalCertificate(this, artifact, profile, expected);
  }
  verifyExternalBundle(input, expected) {
    return verifyExternalBundle(this,input,expected);
  }
  contract(key) {
    const names = {
      ctf: "ConditionalTokens",
      token: "TrueToken",
      factory: "UniswapV2Factory",
      v2router: "UniswapV2Router02",
      router: "Router",
      protocol: "ExchangeProtocol",
      governor: "ExchangeGovernor",
      timelock: "TimelockController",
      allocation: "AllocationController",
      warehouse: "SplitsWarehouse",
      arbitrage: "FullSetArbitrage",
    };
    return new Contract(
      this.deployment.contracts[key],
      this.abis[names[key]],
      this.signer || this.provider,
    );
  }
  erc20(address) {
    return new Contract(
      address,
      this.abis.TrueToken,
      this.signer || this.provider,
    );
  }
  async guard() {
    this.assertCurrent?.();
    if (Number((await this.provider.getNetwork()).chainId) !== 31372)
      throw Error("Wrong network: Exchange requires local chain 31372");
    this.assertCurrent?.();
    if (!this.signer) throw Error("Connect a wallet");
  }
  async tx(label, promise) {
    await this.guard();
    const t = await promise();
    this.onTx({ label, hash: t.hash, status: "submitted" });
    const r = await t.wait();
    this.onTx({
      label,
      hash: t.hash,
      block: r.blockNumber,
      status: "confirmed",
    });
    return r;
  }
  async approve(address, spender, amount) {
    await this.guard();
    const owner = await this.signer.getAddress(),
      token = this.erc20(address);
    if ((await token.allowance(owner, spender)) < amount)
      await this.tx(
        "Approve " + formatEther(amount) + " " + (await token.symbol()),
        () => token.approve(spender, amount),
      );
  }
  async markets() {
    const p = this.contract("protocol"),
      n = Number(await p.count()),
      result = [];
    for (let i = 0; i < n; i++) {
      const id = await p.statementIds(i),
        s = await p.statements(id),
        m = new Contract(s.market, this.abis.Market, this.provider);
      let metadata;
      try {
        metadata = JSON.parse(s.metadata);
      } catch {
        metadata = { title: s.metadata };
      }
      const yes = await m.outcomeTokens(0),
        no = await m.outcomeTokens(1);
      const pairs = await Promise.all(
        [yes, no].map((t) =>
          this.contract("factory").getPair(t, this.deployment.contracts.token),
        ),
      );
      result.push({
        id,
        goal: s.goal,
        profile: s.profile,
        dependency: s.dependency,
        deadline: Number(s.deadline),
        resolvedAt: Number(s.resolvedAt),
        kind: Number(s.kind),
        targetOutcome: Number(s.targetOutcome),
        outcome: Number(s.outcome),
        market: s.market,
        creator: s.creator,
        metadata,
        yes,
        no,
        pairs,
      });
    }
    return result;
  }
  async snapshot(m, address) {
    const tokens = [this.deployment.contracts.token, m.yes, m.no, ...m.pairs];
    const balances = address
      ? await Promise.all(tokens.map((a) => this.erc20(a).balanceOf(address)))
      : [0n, 0n, 0n, 0n, 0n];
    const pools = await Promise.all(
      m.pairs.map(async (a) => {
        const p = new Contract(a, this.abis.UniswapV2Pair, this.provider),
          r = await p.getReserves();
        return {
          address: a,
          token0: await p.token0(),
          reserve0: r[0].toString(),
          reserve1: r[1].toString(),
          supply: (await p.totalSupply()).toString(),
          protocolLP: (
            await p.balanceOf(this.deployment.contracts.allocation)
          ).toString(),
        };
      }),
    );
    return { balances: balances.map(String), pools };
  }
  async createMath(goal, profile, metadata, certificate) {
    return this.tx("Register mathematical market", async () =>
      this.contract("protocol").createMath(
        goal,
        profile,
        JSON.stringify(metadata),
        certificate,
      ),
    );
  }
  async createOperator(operatorId, args, metadata) {
    return this.tx("Register versioned operator market", async () =>
      this.contract("protocol").createOperator(
        operatorId,
        args,
        JSON.stringify(metadata),
      ),
    );
  }
  async createDerived(kind, dep, deadline, target, metadata) {
    return this.tx("Register derived market", async () =>
      this.contract("protocol").createDerived(
        kind,
        dep,
        deadline,
        target,
        JSON.stringify(metadata),
      ),
    );
  }
  async split(m, amount) {
    await this.guard();
    await this.approve(
      this.deployment.contracts.token,
      this.deployment.contracts.router,
      amount,
    );
    return this.tx("Split T into YES + NO", async () =>
      this.contract("router").splitPosition(
        this.deployment.contracts.token,
        m.market,
        amount,
      ),
    );
  }
  async merge(m, amount) {
    for (const a of [m.yes, m.no])
      await this.approve(a, this.deployment.contracts.router, amount);
    return this.tx("Merge full set into T", async () =>
      this.contract("router").mergePositions(
        this.deployment.contracts.token,
        m.market,
        amount,
      ),
    );
  }
  async redeem(m, side, amount) {
    await this.approve(
      side === 0 ? m.yes : m.no,
      this.deployment.contracts.router,
      amount,
    );
    return this.tx("Redeem outcome for T", async () =>
      this.contract("router").redeemPositions(
        this.deployment.contracts.token,
        m.market,
        [side],
        [amount],
      ),
    );
  }
  async v2Send(method, args) {
    const router = this.contract("v2router"),
      gas = await router[method].estimateGas(...args);
    return router[method](...args, { gasLimit: (gas * 130n) / 100n + 20000n });
  }
  async deadline() {
    return (await this.provider.getBlock("latest")).timestamp + 300;
  }
  async quote(m, side, buy, amount) {
    return (
      await this.contract("v2router").getAmountsOut(
        amount,
        buy
          ? [this.deployment.contracts.token, side === 0 ? m.yes : m.no]
          : [side === 0 ? m.yes : m.no, this.deployment.contracts.token],
      )
    )[1];
  }
  async trade(m, side, buy, amount, minOutput) {
    const path = buy
      ? [this.deployment.contracts.token, side === 0 ? m.yes : m.no]
      : [side === 0 ? m.yes : m.no, this.deployment.contracts.token];
    await this.approve(path[0], this.deployment.contracts.v2router, amount);
    return this.tx(
      (buy ? "Buy " : "Sell ") + (side === 0 ? "YES" : "NO"),
      async () =>
        this.v2Send("swapExactTokensForTokens", [
          amount,
          minOutput,
          path,
          await this.signer.getAddress(),
          await this.deadline(),
        ]),
    );
  }
  async addLiquidity(m, side, tAmount, outcomeAmount, slippage = 100n) {
    const token = side === 0 ? m.yes : m.no;
    await this.approve(
      token,
      this.deployment.contracts.v2router,
      outcomeAmount,
    );
    await this.approve(
      this.deployment.contracts.token,
      this.deployment.contracts.v2router,
      tAmount,
    );
    return this.tx("Add liquidity", async () =>
      this.v2Send("addLiquidity", [
        this.deployment.contracts.token,
        token,
        tAmount,
        outcomeAmount,
        (tAmount * (10000n - slippage)) / 10000n,
        (outcomeAmount * (10000n - slippage)) / 10000n,
        await this.signer.getAddress(),
        await this.deadline(),
      ]),
    );
  }
  async removeLiquidity(m, side, amount, minT = 0n, minOutcome = 0n) {
    await this.approve(
      m.pairs[side],
      this.deployment.contracts.v2router,
      amount,
    );
    return this.tx("Remove liquidity", async () =>
      this.v2Send("removeLiquidity", [
        this.deployment.contracts.token,
        side === 0 ? m.yes : m.no,
        amount,
        minT,
        minOutcome,
        await this.signer.getAddress(),
        await this.deadline(),
      ]),
    );
  }
  async resolve(m, outcome, certificate) {
    return this.tx("Submit verified mathematical proof", async () =>
      this.contract("protocol").resolveProof(m.id, outcome, certificate),
    );
  }
  async resolveDerived(m) {
    return this.tx("Resolve chain-state predicate", async () =>
      this.contract("protocol").resolveDerived(m.id),
    );
  }
  async quoteArbitrage(m, amount) {
    const yesT = await this.quote(m, 0, false, amount),
      noT = await this.quote(m, 1, false, amount);
    return {
      amount: amount.toString(),
      yesT: yesT.toString(),
      noT: noT.toString(),
      output: (yesT + noT).toString(),
      profit: (yesT + noT - amount).toString(),
      block: await this.provider.getBlockNumber(),
    };
  }
  async arbitrage(m, amount, minProfit) {
    await this.approve(
      this.deployment.contracts.token,
      this.deployment.contracts.arbitrage,
      amount,
    );
    return this.tx("Atomic full-set arbitrage", async () => {
      const c = this.contract("arbitrage"),
        args = [m.id, amount, minProfit, await this.deadline()],
        gas = await c.execute.estimateGas(...args);
      return c.execute(...args, { gasLimit: (gas * 130n) / 100n + 30000n });
    });
  }
  async executions(address) {
    const rows = [];
    for (const m of await this.markets())
      for (let side = 0; side < 2; side++) {
        const pair = new Contract(
            m.pairs[side],
            this.abis.UniswapV2Pair,
            this.provider,
          ),
          token0 = await pair.token0(),
          tFirst =
            token0.toLowerCase() ===
            this.deployment.contracts.token.toLowerCase(),
          logs = await pair.queryFilter(
            pair.filters.Swap(),
            this.deployment.deploymentBlock,
          );
        for (const log of logs) {
          const tx = await this.provider.getTransaction(log.transactionHash);
          if (tx.from.toLowerCase() !== address.toLowerCase()) continue;
          const a = log.args,
            tIn = tFirst ? a.amount0In : a.amount1In,
            tOut = tFirst ? a.amount0Out : a.amount1Out,
            oIn = tFirst ? a.amount1In : a.amount0In,
            oOut = tFirst ? a.amount1Out : a.amount0Out,
            buy = tIn > 0n && oOut > 0n,
            sell = oIn > 0n && tOut > 0n,
            amountIn = buy ? tIn : oIn,
            amountOut = buy ? oOut : tOut;
          const block = await this.provider.getBlock(log.blockNumber);
          rows.push({
            statementId: m.id,
            title: m.metadata.title,
            pool: pair.target,
            side: side === 0 ? "YES" : "NO",
            direction: buy ? "Buy" : sell ? "Sell" : "Complex",
            actor: tx.from,
            tx: log.transactionHash,
            block: log.blockNumber,
            logIndex: log.index,
            timestamp: block.timestamp,
            amountIn: amountIn.toString(),
            inputAsset: buy ? "T" : side === 0 ? "YES" : "NO",
            amountOut: amountOut.toString(),
            outputAsset: buy ? (side === 0 ? "YES" : "NO") : "T",
            nominalFeeInput: ((amountIn * 3n) / 1000n).toString(),
            tAmount: (buy ? tIn : tOut).toString(),
            outcomeAmount: (buy ? oOut : oIn).toString(),
          });
        }
      }
    return rows.sort(
      (a, b) =>
        b.block - a.block ||
        b.logIndex - a.logIndex ||
        a.tx.localeCompare(b.tx),
    );
  }
  executionsCSV(rows) {
    const columns = [
      "statementId",
      "title",
      "pool",
      "side",
      "direction",
      "actor",
      "tx",
      "block",
      "logIndex",
      "timestamp",
      "amountIn",
      "inputAsset",
      "amountOut",
      "outputAsset",
      "nominalFeeInput",
      "tAmount",
      "outcomeAmount",
    ];
    const q = (v) => {
      const s = String(v ?? "");
      return (
        '"' +
        (/^[=+@\-\t\r]/.test(s) ? "'" : "") +
        s.replaceAll('"', '""') +
        '"'
      );
    };
    return [
      columns.join(","),
      ...rows.map((r) => columns.map((c) => q(r[c])).join(",")),
    ].join("\n");
  }
  async delegate() {
    return this.tx("Delegate T voting power", async () =>
      this.contract("token").delegate(await this.signer.getAddress()),
    );
  }
  governanceSnapshot(account = "") {
    return readGovernance({ provider: this.provider, config: this.deployment, abis: this.abis,
      governor: this.contract("governor").connect(this.provider),
      token: this.contract("token").connect(this.provider),
      timelockAt: address => new Contract(address, this.abis.TimelockController, this.provider),
    }, account);
  }
  async cancelProposal(p) {
    return this.tx("Cancel pending proposal", () => this.contract("governor").cancel(
      p.targets, p.values, p.calldatas, keccak256(toUtf8Bytes(p.description)),
    ));
  }
  async propose(targets, values, calldatas, description) {
    return this.tx("Create governance proposal", async () =>
      this.contract("governor").propose(
        targets,
        values,
        calldatas,
        description,
      ),
    );
  }
  async vote(id, support) {
    return this.tx("Vote on governance proposal", async () =>
      this.contract("governor").castVote(id, support),
    );
  }
  async queue(p) {
    return this.tx("Queue proposal", async () =>
      this.contract("governor").queue(
        p.targets,
        p.values,
        p.calldatas,
        keccak256(toUtf8Bytes(p.description)),
      ),
    );
  }
  async execute(p) {
    return this.tx("Execute proposal", async () =>
      this.contract("governor").execute(
        p.targets,
        p.values,
        p.calldatas,
        keccak256(toUtf8Bytes(p.description)),
      ),
    );
  }
  async proposeAllocation(rows) {
    const sorted = [...rows].sort((a, b) =>
      a.address.toLowerCase().localeCompare(b.address.toLowerCase()),
    );
    return this.tx("Propose fee allocation", async () =>
      this.contract("allocation").propose(
        sorted.map((r) => r.address),
        sorted.map((r) => r.share),
      ),
    );
  }
  async consent(id, value) {
    return this.tx(
      value ? "Consent to reduction" : "Revoke consent",
      async () => this.contract("allocation").setConsent(id, value),
    );
  }
  async applyAllocation(id) {
    return this.tx("Apply allocation", async () =>
      this.contract("allocation").applyAllocation(id),
    );
  }
  async collect(asset) {
    return this.tx("Collect received protocol LP", async () =>
      this.contract("allocation").collect(asset),
    );
  }
  async distribute(epoch, asset) {
    return this.tx("Distribute epoch income", async () =>
      this.contract("allocation").distribute(epoch, asset),
    );
  }
  async withdraw(asset) {
    return this.tx("Withdraw warehouse balance", async () =>
      this.contract("warehouse")["withdraw(address,address)"](
        await this.signer.getAddress(),
        asset,
      ),
    );
  }
}
