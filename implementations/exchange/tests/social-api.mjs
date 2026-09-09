import assert from "node:assert/strict";
import { HDNodeWallet, keccak256, toUtf8Bytes } from "ethers";
import fs from "node:fs";
import { ExchangeSocialSDK } from "../sdk/social.mjs";
const wallets = [0, 1, 2].map((i) =>
    HDNodeWallet.fromPhrase(
      "test test test test test test test test test test test junk",
      undefined,
      `m/44'/60'/0'/0/${i}`,
    ),
  ),
  clients = wallets.map(() => new ExchangeSocialSDK()),
  checks = [];
const test = async (n, f) => {
  await f();
  checks.push(n);
  console.log("PASS", n);
};
for (let i = 0; i < 3; i++) await clients[i].signIn(wallets[i]);
let a, b, reply;
const id = keccak256(
  toUtf8Bytes("Exchange isolated API social thread " + Date.now()),
);
await test("Profile author comes from SIWE session; text survives stored read", async () => {
  const p = await clients[0].request("profile", {
    displayName: "Ada, test researcher",
    bio: "Formal mathematics and market mechanisms.",
    address: wallets[1].address,
  });
  assert.equal(p.address, wallets[0].address);
  assert.equal(
    (await clients[2].profile(wallets[0].address)).displayName,
    p.displayName,
  );
  assert.equal(
    JSON.parse(fs.readFileSync("data/profiles.json"))[
      wallets[0].address.toLowerCase()
    ].bio,
    p.bio,
  );
  assert.notEqual(
    (await clients[1].profile(wallets[1].address)).displayName,
    p.displayName,
  );
});
await test("Comment and reply authors cannot be spoofed", async () => {
  a = await clients[0].request("comments/" + id, {
    text: "API test: proof refers to the exact registered goal.",
    address: wallets[1].address,
  });
  b = await clients[1].postComment(
    id,
    "API test: checking the foundation commitment.",
  );
  reply = await clients[2].postComment(
    id,
    "API test reply: agree on checking the pinned profile.",
    a.id,
  );
  assert.equal(a.address, wallets[0].address);
  assert.equal(reply.parentId, a.id);
  await assert.rejects(
    clients[2].postComment(
      keccak256(toUtf8Bytes("other")),
      "Cross-thread reply",
      a.id,
    ),
  );
  await assert.rejects(clients[1].editComment(a.id, "Spoofed edit"));
  await clients[0].editComment(
    a.id,
    "API test: exact goal and immutable profile.",
  );
  assert.equal(
    (await clients[0].comments(id)).find((c) => c.id === a.id).history.length,
    1,
  );
});
await test("One vote per address, switching/removing and self-vote rejection", async () => {
  await assert.rejects(clients[0].vote(a.id, 1));
  assert.equal((await clients[1].vote(a.id, 1)).score, 1);
  assert.equal((await clients[1].vote(a.id, 1)).score, 1);
  assert.equal((await clients[1].vote(a.id, -1)).score, -1);
  assert.equal((await clients[2].vote(a.id, 1)).score, 0);
  assert.equal((await clients[1].vote(a.id, 0)).score, 1);
  assert.equal((await clients[2].vote(a.id, 0)).score, 0);
  await assert.rejects(clients[1].vote(a.id, 5));
  await clients[2].vote(a.id, 1);
});
await test("Top/New ordering deterministic and profile names publicly readable", async () => {
  const top = await clients[1].comments(id, "top"),
    recent = await clients[1].comments(id, "new");
  assert.equal(top[0].id, a.id);
  const sorted = [...recent].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
  assert.deepEqual(
    recent.map((c) => c.id),
    sorted.map((c) => c.id),
  );
  assert.equal(top[0].profile.displayName, "Ada, test researcher");
  assert.equal(
    JSON.parse(fs.readFileSync("data/comment-votes.json"))[a.id][
      wallets[2].address.toLowerCase()
    ],
    1,
  );
});
await test("Logout revokes session writes", async () => {
  await clients[0].logout();
  await assert.rejects(clients[0].saveProfile("Unauthorized", ""));
  await assert.rejects(clients[0].vote(b.id, 1));
});
fs.writeFileSync(
  "data/social-test-report.json",
  JSON.stringify(
    {
      passed: checks.length,
      checks,
      isolatedOffchainThread: id,
      comments: [a.id, b.id, reply.id],
    },
    null,
    2,
  ),
);
console.log("ALL", checks.length, "social API checks passed");
