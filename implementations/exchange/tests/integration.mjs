// Economic/integration harness ONLY: TestVerifier is not a zk proof.
import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import {
  BrowserProvider,
  HDNodeWallet,
  Contract,
  AbiCoder,
  keccak256,
  toUtf8Bytes,
  parseEther,
  ZeroAddress,
} from "ethers";
import { deploy, artifact, MNEMONIC } from "../scripts/deploy.mjs";
import { ExchangeSDK } from "../sdk/index.mjs";
const chain = ganache.provider({
  wallet: { mnemonic: MNEMONIC },
  chain: { chainId: 31372, hardfork: "shanghai" },
  miner: { blockGasLimit: 30000000 },
  logging: { quiet: true },
});
const provider = new BrowserProvider(chain, undefined, { cacheTimeout: -1 });
provider.pollingInterval = 20;
const report = [];
const test = async (name, fn) => {
  await fn();
  report.push({ name, status: "passed" });
  console.log("PASS", name);
};
try {
  const manifest = await deploy(provider, {
    test: true,
    output: "data/test-deployment.json",
  });
  const abis = JSON.parse(fs.readFileSync("web/generated/abis.json")),
    wallets = [0, 1, 2].map((i) =>
      HDNodeWallet.fromPhrase(
        MNEMONIC,
        undefined,
        `m/44'/60'/0'/0/${i}`,
      ).connect(provider),
    ),
    sdk = wallets.map((w) => new ExchangeSDK(provider, w, manifest, abis));
  const coder = AbiCoder.defaultAbiCoder(),
    goal = keccak256(toUtf8Bytes("economic harness goal")),
    cert = coder.encode(
      ["string", "bytes32", "bytes32"],
      ["TEST_ONLY_GOAL", goal, manifest.profile],
    );
  let m;
  await test("US001 rejects invalid registration then creates real CTF condition/wrappers/V2 pairs", async () => {
    await assert.rejects(
      sdk[0].createMath(goal, manifest.profile, { title: "Harness" }, "0x"),
    );
    await sdk[0].createMath(
      goal,
      manifest.profile,
      { title: "Harness theorem" },
      cert,
    );
    m = (await sdk[0].markets())[0];
    assert.notEqual(m.market, ZeroAddress);
    assert.equal(await sdk[0].erc20(m.yes).name(), "Exchange YES");
    assert.equal(await sdk[0].erc20(m.yes).symbol(), "YES");
    assert.equal(await sdk[0].erc20(m.no).symbol(), "NO");
    assert.equal(await sdk[0].erc20(m.yes).decimals(), 18n);
    assert.equal(
      await sdk[0]
        .contract("ctf")
        .getOutcomeSlotCount(
          await new Contract(m.market, abis.Market, provider).conditionId(),
        ),
      2n,
    );
  });
  await test("US020 split + merge preserves escrow and rejects mismatched amounts", async () => {
    const t = sdk[0].contract("token"),
      before = await t.balanceOf(wallets[0].address);
    await sdk[0].split(m, parseEther("1000"));
    await sdk[0].merge(m, parseEther("100"));
    assert.equal(
      await t.balanceOf(wallets[0].address),
      before - parseEther("900"),
    );
    assert.equal(
      await sdk[0].erc20(m.yes).balanceOf(wallets[0].address),
      parseEther("900"),
    );
    await assert.rejects(sdk[1].merge(m, parseEther("1")));
  });
  await test("US002 independent users add liquidity through original V2 router", async () => {
    await sdk[0].addLiquidity(m, 0, parseEther("300"), parseEther("600"));
    await sdk[0].addLiquidity(m, 1, parseEther("300"), parseEther("600"));
    await sdk[1].split(m, parseEther("100"));
    await sdk[1].addLiquidity(m, 0, parseEther("50"), parseEther("100"));
    assert((await sdk[1].erc20(m.pairs[0]).balanceOf(wallets[1].address)) > 0n);
  });
  await test("US003 real swaps enforce minimum output", async () => {
    const input = parseEther("80"),
      quote = await sdk[2].quote(m, 0, true, input);
    await assert.rejects(sdk[2].trade(m, 0, true, input, quote + 1n));
    await sdk[2].trade(m, 0, true, input, (quote * 99n) / 100n);
    const b = await sdk[2].erc20(m.yes).balanceOf(wallets[2].address),
      q = await sdk[2].quote(m, 0, false, b / 3n);
    await sdk[2].trade(m, 0, false, b / 3n, (q * 99n) / 100n);
  });
  await test("EXTRA atomic full-set arbitrage is profitable or completely reverts", async () => {
    const amount = parseEther("1"),
      q = await sdk[2].quoteArbitrage(m, amount);
    assert(BigInt(q.profit) > 0n);
    await sdk[2].approve(
      manifest.contracts.token,
      manifest.contracts.arbitrage,
      amount,
    );
    const token = sdk[2].contract("token"),
      before = await token.balanceOf(wallets[2].address),
      snapshot = await sdk[2].snapshot(m, wallets[2].address);
    const failed = await sdk[2]
      .contract("arbitrage")
      .execute(m.id, amount, parseEther("1"), await sdk[2].deadline(), {
        gasLimit: 1000000,
      });
    await assert.rejects(failed.wait());
    assert.equal(await token.balanceOf(wallets[2].address), before);
    assert.deepEqual(
      (await sdk[2].snapshot(m, wallets[2].address)).pools,
      snapshot.pools,
    );
    await sdk[2].arbitrage(m, amount, (BigInt(q.profit) * 99n) / 100n);
    assert((await token.balanceOf(wallets[2].address)) > before);
    assert.equal(await token.balanceOf(manifest.contracts.arbitrage), 0n);
  });
  await test("EXTRA execution journal includes actual trader and atomic-strategy fills with CSV", async () => {
    const rows = await sdk[2].executions(wallets[2].address);
    assert.equal(rows.length, 4);
    assert.equal(new Set(rows.map((r) => r.tx)).size, 3);
    assert(rows.every((r) => r.actor === wallets[2].address));
    assert(rows.some((r) => r.side === "NO"));
    assert(sdk[2].executionsCSV(rows).includes("nominalFeeInput"));
    assert.equal((await sdk[0].executions(wallets[0].address)).length, 0);
  });
  await test("V2 protocol fee mints LP to collector on next liquidity event", async () => {
    const p = new Contract(m.pairs[0], abis.UniswapV2Pair, provider),
      r = await p.getReserves(),
      token0 = await p.token0(),
      rt =
        token0.toLowerCase() === manifest.contracts.token.toLowerCase()
          ? r[0]
          : r[1],
      ro =
        token0.toLowerCase() === manifest.contracts.token.toLowerCase()
          ? r[1]
          : r[0];
    await sdk[0].addLiquidity(
      m,
      0,
      parseEther("10"),
      (parseEther("10") * ro) / rt,
    );
    assert((await p.balanceOf(manifest.contracts.allocation)) > 0n);
  });
  await test("US010 all losing beneficiaries consent; old epoch retains received assets", async () => {
    await sdk[2].collect(m.pairs[0]);
    const a = sdk[0].contract("allocation"),
      old = await a.epoch(1);
    const rows = manifest.accounts
      .slice(0, 2)
      .map((address) => ({ address, share: 5000 }));
    await sdk[2].proposeAllocation(rows);
    await assert.rejects(sdk[2].applyAllocation(1));
    await sdk[0].consent(1, true);
    await sdk[0].consent(1, false);
    await assert.rejects(sdk[2].applyAllocation(1));
    await sdk[0].consent(1, true);
    await sdk[2].applyAllocation(1);
    assert.equal(await a.currentEpoch(), 2n);
    assert((await sdk[0].erc20(m.pairs[0]).balanceOf(old.split)) > 0n);
    await assert.rejects(sdk[2].applyAllocation(1));
  });
  await test("US011 original PullSplit distributes old epoch and Warehouse withdraws LP", async () => {
    await sdk[2].distribute(1, m.pairs[0]);
    const before = await sdk[0].erc20(m.pairs[0]).balanceOf(wallets[0].address);
    await sdk[0].withdraw(m.pairs[0]);
    assert(
      (await sdk[0].erc20(m.pairs[0]).balanceOf(wallets[0].address)) > before,
    );
  });
  await test("US006/007 derived markets preserve deadline and final-outcome semantics", async () => {
    const now = (await provider.getBlock("latest")).timestamp;
    await sdk[0].createDerived(1, m.id, now + 1000, 0, {
      title: "Resolved by",
    });
    await sdk[0].createDerived(2, m.id, 0, 1, { title: "Resolved true" });
    await sdk[0].createDerived(3, m.id, now + 1, 2, {
      title: "False by short deadline",
    });
    const ms = await sdk[0].markets();
    await assert.rejects(sdk[0].resolveDerived(ms[1]));
    await provider.send("evm_increaseTime", [2]);
    await provider.send("evm_mine", []);
    await sdk[0].resolveDerived(ms[3]);
    assert.equal(
      (await sdk[0].contract("protocol").statements(ms[3].id)).outcome,
      2n,
    );
  });
  await test("US004/008 harness-only proof binding + real CTF redeem", async () => {
    await assert.rejects(sdk[0].resolve(m, 1, cert));
    const proof = coder.encode(
      ["string", "bytes32", "bytes32", "bytes32", "uint8"],
      ["TEST_ONLY_RESOLVE", m.id, goal, manifest.profile, 1],
    );
    await assert.rejects(sdk[0].resolve(m, 2, proof));
    await sdk[0].resolve(m, 1, proof);
    await assert.rejects(sdk[0].resolve(m, 1, proof));
    const b = await sdk[2].erc20(m.yes).balanceOf(wallets[2].address),
      before = await sdk[2].contract("token").balanceOf(wallets[2].address);
    await sdk[2].redeem(m, 0, b);
    assert.equal(
      await sdk[2].contract("token").balanceOf(wallets[2].address),
      before + b,
    );
    const ms = await sdk[0].markets();
    await sdk[0].resolveDerived(ms[1]);
    await sdk[0].resolveDerived(ms[2]);
    assert.equal(
      (await sdk[0].contract("protocol").statements(ms[1].id)).outcome,
      1n,
    );
  });
  await test("US019 LP removal remains open after resolution; V2 trading also remains open", async () => {
    const lp = await sdk[1].erc20(m.pairs[0]).balanceOf(wallets[1].address);
    await sdk[1].removeLiquidity(m, 0, lp);
    assert.equal(
      await sdk[1].erc20(m.pairs[0]).balanceOf(wallets[1].address),
      0n,
    );
    const q = await sdk[2].quote(m, 0, true, parseEther("1"));
    await sdk[2].trade(m, 0, true, parseEther("1"), (q * 99n) / 100n);
  });
  await test("US005 independent false proof pays NO and zero YES", async () => {
    const g = keccak256(toUtf8Bytes("negative harness")),
      c = coder.encode(
        ["string", "bytes32", "bytes32"],
        ["TEST_ONLY_GOAL", g, manifest.profile],
      );
    await sdk[0].createMath(g, manifest.profile, { title: "False harness" }, c);
    const n = (await sdk[0].markets()).at(-1);
    await sdk[1].split(n, parseEther("5"));
    await sdk[0].resolve(
      n,
      2,
      coder.encode(
        ["string", "bytes32", "bytes32", "bytes32", "uint8"],
        ["TEST_ONLY_RESOLVE", n.id, g, manifest.profile, 2],
      ),
    );
    let b = await sdk[1].contract("token").balanceOf(wallets[1].address);
    await sdk[1].redeem(n, 0, parseEther("5"));
    assert.equal(
      await sdk[1].contract("token").balanceOf(wallets[1].address),
      b,
    );
    await sdk[1].redeem(n, 1, parseEther("5"));
    assert.equal(
      await sdk[1].contract("token").balanceOf(wallets[1].address),
      b + parseEther("5"),
    );
  });
  await test("US009/018 actual OZ Governor vote queue Timelock execute", async () => {
    await sdk[0].delegate();
    await provider.send("evm_mine", []);
    const p = sdk[0].contract("protocol"),
      data = p.interface.encodeFunctionData("setProfileEnabled", [
        manifest.profile,
        false,
        true,
      ]),
      proposal = {
        targets: [p.target, p.target],
        values: [0, 0],
        calldatas: [
          data,
          p.interface.encodeFunctionData("addOperator", [
            keccak256(toUtf8Bytes("UNRESOLVED_BY_V1")),
            manifest.contracts.operatorSample,
            "UnresolvedByV1",
          ]),
        ],
        description:
          "Retire economic-test goal registrations and add UnresolvedByV1",
      };
    const r = await sdk[0].propose(
        proposal.targets,
        proposal.values,
        proposal.calldatas,
        proposal.description,
      ),
      event = r.logs
        .map((l) => {
          try {
            return sdk[0].contract("governor").interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((e) => e?.name === "ProposalCreated"),
      id = event.args.proposalId;
    await provider.send("evm_mine", []);
    await provider.send("evm_mine", []);
    await sdk[0].vote(id, 1);
    for (let i = 0; i < 13; i++) await provider.send("evm_mine", []);
    await sdk[0].queue(proposal);
    await assert.rejects(sdk[0].execute(proposal));
    await provider.send("evm_increaseTime", [11]);
    await provider.send("evm_mine", []);
    await sdk[0].execute(proposal);
    assert.equal((await p.profiles(manifest.profile)).newEnabled, false);
    await assert.rejects(p.setProfileEnabled(manifest.profile, true, true));
  });
  await test("US009 governance registers new immutable operator and validates/finalizes derived market", async () => {
    const op = keccak256(toUtf8Bytes("UNRESOLVED_BY_V1")),
      now = (await provider.getBlock("latest")).timestamp;
    await assert.rejects(
      sdk[0].createOperator(op, "0x", { title: "Invalid operator" }),
    );
    const args = coder.encode(["bytes32", "uint64"], [m.id, now + 30]);
    await sdk[0].createOperator(op, args, {
      title: "Was not resolved by deadline",
    });
    const derived = (await sdk[0].markets()).at(-1);
    await sdk[0].resolveDerived(derived);
    assert.equal(
      (await sdk[0].contract("protocol").statements(derived.id)).outcome,
      2n,
    );
    await assert.rejects(
      sdk[0]
        .contract("protocol")
        .addOperator(op, manifest.contracts.operatorSample, "Replacement"),
    );
  });
  fs.writeFileSync(
    "data/economic-test-report.json",
    JSON.stringify(
      {
        harness: "TEST VERIFIER — not Lean/zk coverage",
        passed: report.length,
        report,
      },
      null,
      2,
    ),
  );
  console.log("ALL", report.length, "economic integration checks passed");
} finally {
  await chain.disconnect();
}
