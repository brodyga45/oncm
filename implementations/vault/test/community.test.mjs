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

const stored = (id, minute, parentId = null, statementId = S) => ({
  id, statementId, author: A, text: id, parentId,
  createdAt: `2026-09-10T00:${String(minute).padStart(2, '0')}:00.000Z`, history: [],
});
test('Top ranks only roots; high-score replies stay in chronological nested branches', () => {
  const db = { comments: [stored('root-low', 1), stored('late-reply', 4, 'root-low'),
    stored('early-reply', 2, 'root-low'), stored('nested', 3, 'early-reply'), stored('root-top', 0)],
    votes: { 'late-reply': { [B]: 1, [C]: 1 }, nested: { [B]: 1 }, 'root-top': { [B]: 1 } } };
  const rows = community(db).list(S, 'top');
  assert.deepEqual(rows.map(c => c.id), ['root-top', 'root-low', 'early-reply', 'nested', 'late-reply']);
  assert.deepEqual(rows.map(c => c.depth), [0, 0, 1, 2, 1]);
  assert.equal(rows[3].threadParentId, 'early-reply');assert.equal(rows[3].threadRootId, 'root-low');
});
test('New orders root creation time; a new reply never bumps the older root', () => {
  const rows = community({ comments: [stored('old-root', 1), stored('new-root', 3),
    stored('newest-reply', 5, 'old-root'), stored('first-reply', 2, 'old-root')] }).list(S, 'new');
  assert.deepEqual(rows.map(c => c.id), ['new-root', 'old-root', 'first-reply', 'newest-reply']);
});
test('equal timestamps and scores use stable IDs for roots and replies', () => {
  const comments = [stored('root-b', 1), stored('reply-z', 2, 'root-a'), stored('root-a', 1), stored('reply-a', 2, 'root-a')];
  for (const sort of ['top', 'new']) {
    const expected = ['root-a', 'reply-a', 'reply-z', 'root-b'];
    assert.deepEqual(community({ comments }).list(S, sort).map(c => c.id), expected);
    assert.deepEqual(community({ comments: [...comments].reverse() }).list(S, sort).map(c => c.id), expected);
  }
});
test('historical orphan, cross-statement, self-cycle and multi-node cycle retain all rows without mutation', () => {
  const other = '0x' + 'ef'.repeat(32);
  const comments = [stored('orphan', 1, 'absent'), stored('cross', 2, 'external'), stored('external', 0, null, other),
    stored('self', 3, 'self'), stored('cycle-b', 4, 'cycle-a'), stored('cycle-a', 5, 'cycle-b'), stored('branch', 6, 'cycle-b')];
  const db = { comments };const original = JSON.stringify(comments), c = community(db), rows = c.list(S, 'new');
  assert.equal(rows.length, 6);assert.equal(new Set(rows.map(c => c.id)).size, 6);
  for (const id of ['orphan', 'cross']) {const row = rows.find(c => c.id === id);assert.equal(row.depth, 0);assert.equal(row.threadFallback, 'missing-parent');}
  for (const id of ['self', 'cycle-a']) {const row = rows.find(c => c.id === id);assert.equal(row.depth, 0);assert.equal(row.threadFallback, 'cycle');assert.equal(row.threadParentId, null);}
  const a = rows.findIndex(c => c.id === 'cycle-a');assert.deepEqual(rows.slice(a, a + 3).map(c => c.id), ['cycle-a', 'cycle-b', 'branch']);
  assert.equal(rows[a].parentId, 'cycle-b');assert.equal(JSON.stringify(comments), original);
  const global = c.list(undefined, 'new');assert.deepEqual(global.map(c => c.id), ['branch', 'cycle-a', 'cycle-b', 'self', 'cross', 'orphan', 'external']);
  assert.equal(global[0].depth, undefined);assert.equal(global.length, 7);
});
test('a long historical branch is flattened iteratively with bounded depth metadata', () => {
  const comments = Array.from({ length: 512 }, (_, i) => stored(`c${String(i).padStart(4, '0')}`, 0, i ? `c${String(i - 1).padStart(4, '0')}` : null));
  const rows = community({ comments }).list(S, 'top');assert.equal(rows.length, 512);
  assert.equal(rows.at(-1).depth, 511);assert.equal(rows.at(-1).threadRootId, 'c0000');
});
