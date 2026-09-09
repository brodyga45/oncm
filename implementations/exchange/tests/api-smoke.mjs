import assert from "node:assert/strict";
import { HDNodeWallet } from "ethers";
import { SiweMessage } from "siwe";
import fs from "node:fs";
const base = "http://127.0.0.1:4172/api/",
  origin = "http://127.0.0.1:5172";
const request = async (path, body, token) => {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  return { status: r.status, data };
};
const checks = [];
let proofSession;
const test = async (n, fn) => {
  await fn();
  checks.push(n);
  console.log("PASS", n);
};
await test("Deployment and read-only market catalog reflect local chain", async () => {
  const d = await request("deployment");
  assert.equal(d.data.chainId, 31372);
  assert.equal(d.data.testHarness, false);
  const m = await request("markets");
  assert(Array.isArray(m.data.markets));
  assert(m.data.observedBlock > 0);
});
await test("SIWE validates real signature and consumes nonce exactly once", async () => {
  const c = (await request("auth/nonce", {})).data,
    w = HDNodeWallet.fromPhrase(
      "test test test test test test test test test test test junk",
    ),
    message = new SiweMessage({
      domain: c.domain,
      address: w.address,
      statement: "Local API test",
      uri: c.uri,
      version: "1",
      chainId: 31372,
      nonce: c.nonce,
    }).prepareMessage(),
    signature = await w.signMessage(message);
  const verified = await request("auth/verify", { message, signature });
  assert.equal(verified.status, 200);
  proofSession = verified.data.token;
  assert.equal(
    (await request("auth/verify", { message, signature })).status,
    400,
  );
});
await test("Unknown browser origins cannot mutate local state", async () => {
  const r = await fetch(base + "packages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.invalid",
    },
    body: JSON.stringify({ source: "def x := 1" }),
  });
  assert.equal(r.status, 403);
});
await test("Portable package roundtrips exact source and file metadata", async () => {
  const source = "def marketGoal : Prop := ∀ a b : Nat, a + b = b + a\n",
    p = (
      await request("packages", {
        source,
        title: "API package test",
        files: [{ path: "Challenge.lean", content: source }],
        toolchain: "leanprover/lean4:v4.33.1",
      })
    ).data,
    r = await request("packages/" + p.id);
  assert.equal(r.data.source, source);
  assert.equal(r.data.toolchain, "leanprover/lean4:v4.33.1");
  assert.equal(r.data.files[0].content, source);
});
await test("Unsupported Lean targets fail before launching a proof process", async () => {
  const r = await request("proof/jobs", {
    action: "register",
    source: "def unsupportedGoal : Prop := True",
    targetDeclaration: "unsupportedGoal",
  }, proofSession);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /installed profile checks Oncm.goal/);
  assert.equal(r.data.id, undefined);
});
await test("Block explorer reads actual receipts and token events", async () => {
  let r = await request("activity");
  assert.equal(r.data.chainId, 31372);
  assert(r.data.blocks.some((b) => b.transactions.length));
  let tx;
  for (let page = 0; page < 100; page++) {
    tx = r.data.blocks
      .flatMap((b) => b.transactions)
      .find((t) => t.events.some((e) => e.event === "Transfer"));
    if (tx || r.data.next === null) break;
    r = await request("activity?before=" + r.data.next);
  }
  assert(tx);
  const d = await request("activity/" + tx.hash);
  assert.equal(d.data.hash, tx.hash);
  assert(Array.isArray(d.data.balances));
});
await test("Real Palomar version metadata and commit-pinned Lean import", async () => {
  const r = await request("palomar"),
    e = r.data.data.entries[0];
  assert(e.id.startsWith("PALOMAR-"));
  const p = await request("palomar/import", { id: e.id, version: e.version });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.equal(p.data.externalRef.commit, e.source.commit);
  assert(p.data.source.length > 0);
  assert(p.data.files.some((f) => f.path.endsWith("lean-toolchain")));
  assert(p.data.files.every((f) => f.sha256.length === 64));
  assert(!p.data.registrationCertificate);
});
fs.writeFileSync(
  "data/api-test-report.json",
  JSON.stringify(
    { passed: checks.length, checks, date: new Date().toISOString() },
    null,
    2,
  ),
);
console.log("ALL", checks.length, "API checks passed");
