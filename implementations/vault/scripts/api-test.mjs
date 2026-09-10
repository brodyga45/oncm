import fs from 'node:fs';
import assert from 'node:assert/strict';
import { HDNodeWallet } from 'ethers';
import { SiweMessage } from 'siwe';
const base = 'http://127.0.0.1:4173/api',
  origin = 'http://127.0.0.1:5173',
  checks = [];
let cookie = '';
const wallet = HDNodeWallet.fromPhrase(
  'test test test test test test test test test test test junk',
);
async function request(
  path,
  { method = 'GET', body, cookie: session = cookie, origin: requestOrigin = origin } = {},
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: requestOrigin,
      ...(session ? { Cookie: session } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get('set-cookie')?.split(';')[0],
  };
}
async function check(name, fn) {
  await fn();
  checks.push(name);
  console.log('PASS', name);
}
await check('real configured profile and on-chain snapshot are visible', async () => {
  const r = await request('/snapshot');
  assert.equal(r.status, 200);
  assert.equal(r.data.config.chainId, 31373);
  assert.equal(r.data.config.proof.status, 'configured');
  assert(r.data.block.number > 0);
});
await check('HTTP social writes are retired and foreign origins are rejected', async () => {
  assert.equal(
    (
      await request('/profile', {
        method: 'PUT',
        body: { displayName: 'spoof', bio: '' },
        cookie: '',
      })
    ).status,
    410,
  );
  assert.equal((await request('/auth/nonce', { origin: 'https://evil.invalid' })).status, 403);
});
await check('SIWE signature and one-use nonce', async () => {
  const n = (await request('/auth/nonce')).data.nonce;
  const message = new SiweMessage({
    domain: '127.0.0.1:5173',
    address: wallet.address,
    statement: 'Vault local API integration test',
    uri: origin,
    version: '1',
    chainId: 31373,
    nonce: n,
  }).prepareMessage();
  const signature = await wallet.signMessage(message);
  const r = await request('/auth/verify', { method: 'POST', body: { message, signature } });
  assert.equal(r.status, 200);
  cookie = r.cookie;
  assert(cookie);
  assert.equal(
    (await request('/auth/verify', { method: 'POST', body: { message, signature } })).status,
    400,
  );
});
await check('SIWE never authorizes an offchain replacement social write', async () => {
  assert.equal((await request('/profile', {method:'PUT',body:{displayName:'not-published',bio:''}})).status,410);
  assert.equal((await request('/comments', {method:'POST',body:{text:'not-published'}})).status,410);
  const snapshot=await request('/social/snapshot');assert.equal(snapshot.status,200);assert(snapshot.data.block.hash);
});
await check('actual blocks, receipts and ERC20 deltas are decoded', async () => {
  const r = await request('/activity');
  assert.equal(r.status, 200);
  assert(r.data.blocks.some((b) => b.transactions.length));
  for (const b of r.data.blocks) {
    assert(b.hash.startsWith('0x'));
    assert(b.timestamp > 0);
    for (const tx of b.transactions) {
      assert(tx.hash.startsWith('0x'));
      assert(Array.isArray(tx.events));
      assert(Array.isArray(tx.balanceDeltas));
    }
  }
});
await check(
  'published Palomar snapshot imports exact file hashes without certificate',
  async () => {
    const r = await request('/palomar');
    assert.equal(r.status, 200);
    const entry = r.data.data.entries[0];
    const imported = await request('/palomar/import', {
      method: 'POST',
      body: { id: entry.id, version: entry.version },
    });
    assert.equal(imported.status, 200, JSON.stringify(imported.data));
    assert.equal(imported.data.commit, entry.source.commit);
    assert(imported.data.files.length > 0);
    assert(imported.data.files.every((f) => f.sha256.length === 64));
    assert(!imported.data.registrationCertificate);
  },
);
async function poll(id) {
  for (let i = 0; i < 120; i++) {
    const r = (await request('/jobs/' + id)).data;
    if (!['queued', 'running'].includes(r.status)) return r;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error('Native Lean job timed out');
}
await check('real Lean/NanoDa check executes through authenticated jobs', async () => {
  const f = (await request('/fixtures')).data[0];
  const start = await request('/jobs', {
    method: 'POST',
    body: {
      action: 'check',
      source: f.source,
      fixtureId: f.id,
      goalHash: f.goalHash,
      profileId: f.profileId,
      outcome: 1,
    },
  });
  assert.equal(start.status, 202);
  const result = await poll(start.data.id);
  assert.equal(result.status, 'completed', JSON.stringify(result.result));
  assert.equal(result.result.status, 'checked');
  assert.equal(result.result.goalHash, f.goalHash);
  assert(!result.result.certificate);
});
await check('Lean accepting sorry never creates a valid checked proof', async () => {
  const f = (await request('/fixtures')).data[0];
  const source = f.source.replace(':= Nat.add_comm', ':= by sorry');
  const start = await request('/jobs', {
    method: 'POST',
    body: { action: 'check', source, profileId: f.profileId, outcome: 1 },
  });
  const result = await poll(start.data.id);
  assert.equal(result.status, 'failed');
  assert(!result.result.certificate);
});
fs.writeFileSync(
  '.state/api-report.json',
  JSON.stringify({ status: 'passed', checks, date: new Date().toISOString() }, null, 2),
);
console.log('ALL', checks.length, 'API checks passed');
