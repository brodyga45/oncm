import test from 'node:test';
import assert from 'node:assert/strict';
import { community } from '../server/community.mjs';
const A = '0x' + '11'.repeat(20),
  B = '0x' + '22'.repeat(20),
  C = '0x' + '33'.repeat(20),
  S = '0x' + 'ab'.repeat(32);
test('profiles persist and a request address cannot impersonate another actor', () => {
  const db = {};
  let persisted;
  const c = community(db, () => (persisted = JSON.stringify(db)));
  c.updateProfile(A, { address: B, displayName: 'Ada', bio: 'Lean researcher' });
  assert.equal(c.profile(B).displayName, '');
  assert.equal(c.profile(A).displayName, 'Ada');
  assert.equal(community(JSON.parse(persisted)).profile(A).bio, 'Lean researcher');
});
test('comment ownership, replies, immutable author and history', () => {
  const db = {};
  const c = community(db);
  const parent = c.create(A, { statementId: S, text: 'Claim', author: B });
  assert.equal(parent.author, A);
  assert.throws(() => c.edit(B, parent.id, 'spoof'), /author/);
  const reply = c.create(B, { statementId: S, text: 'Reply', parentId: parent.id });
  assert.equal(reply.parentId, parent.id);
  assert.throws(
    () =>
      c.create(C, { statementId: '0x' + 'cc'.repeat(32), text: 'wrong root', parentId: parent.id }),
    /same statement/,
  );
  c.edit(A, parent.id, 'Edited');
  assert.equal(c.list(S).find((x) => x.id === parent.id).history[0].text, 'Claim');
});
test('one wallet one vote; change, remove, self-vote rejection and deterministic sort', () => {
  const c = community({});
  const x = c.create(A, { statementId: S, text: 'X' }),
    y = c.create(B, { statementId: S, text: 'Y' });
  assert.throws(() => c.vote(A, x.id, 1), /Self-votes/);
  assert.equal(c.vote(B, x.id, 1).score, 1);
  assert.equal(c.vote(B, x.id, 1).score, 1);
  assert.equal(c.vote(B, x.id, -1).score, -1);
  assert.equal(c.vote(B, x.id, 0).score, 0);
  c.vote(C, x.id, 1);
  assert.equal(c.list(S, 'top')[0].id, x.id);
  assert.deepEqual(c.list(S, 'top'), c.list(S, 'top'));
  assert.equal(c.list(S, 'new').length, 2);
});
