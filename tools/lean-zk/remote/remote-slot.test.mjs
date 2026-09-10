import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { claimRemoteSlot, releaseRemoteSlot } from './remote-slot.mjs';

test('one shared slot survives provider restarts and refuses stale or foreign release', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'oncm-slot-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const a = { repository: 'example/test', requestDigest: 'a'.repeat(64), requestCommit: 'a'.repeat(40) };
  const b = { ...a, requestDigest: 'b'.repeat(64), requestCommit: 'b'.repeat(40) };
  const attempt = await Promise.allSettled([claimRemoteSlot(directory, a), claimRemoteSlot(directory, b)]);
  assert.equal(attempt.filter(r => r.status === 'fulfilled').length, 1);
  const slot = attempt.find(r => r.status === 'fulfilled').value;
  const request = slot.requestDigest === a.requestDigest ? a : b;
  const other = request === a ? b : a;
  assert.deepEqual(await claimRemoteSlot(directory, request), slot);
  await assert.rejects(claimRemoteSlot(directory, other), { code: 'REMOTE_SLOT_BUSY' });
  await assert.rejects(releaseRemoteSlot(directory, { ...slot, token: 'wrong' }), /different remote request/);
  assert.deepEqual(await claimRemoteSlot(directory, request), slot);
  assert.equal(await releaseRemoteSlot(directory, slot), true);
  const next = await claimRemoteSlot(directory, other);
  await assert.rejects(releaseRemoteSlot(directory, slot), /different remote request/);
  assert.deepEqual(await claimRemoteSlot(directory, other), next);
});
