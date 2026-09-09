import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { setTimeout as sleep } from 'node:timers/promises';
import { createProofJobs, registerProofRoutes } from '../api/proof-jobs.mjs';

const input = { action: 'register', source: 'def Oncm.goal : Prop := True', profileId: 'v3' };
async function setup(t, execute, options = {}) {
  let saved;
  const jobs = createProofJobs({ root: '/private/tmp/test-exchange', save: rows => { saved = structuredClone(rows); }, execute, ...options });
  const app = express(); app.use(express.json());
  registerProofRoutes(app, { jobs, auth: (req, res, next) => {
    if (!req.headers.authorization?.startsWith('Bearer test-')) return res.status(401).json({ error: 'Sign in' });
    req.address = req.headers.authorization.slice(12); next();
  } });
  app.use((e, req, res, next) => res.status(e.statusCode ?? 400).json({ error: e.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await jobs.close(); await new Promise(r => server.close(r)); });
  const request = async (route, body, owner = 'alice') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/proof/jobs${route}`, {
      method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(owner ? { authorization: `Bearer test-${owner}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { code: response.status, body: await response.json() };
  };
  return { jobs, request, saved: () => saved };
}
test('authenticated API deduplicates per owner and preserves input/status shape', async t => {
  let runs = 0, finish;
  const f = await setup(t, () => { runs++; return new Promise(r => { finish = r; }); });
  const a = await f.request('', input), b = await f.request('', input);
  assert.equal(a.code, 202); assert.equal(a.body.id, b.body.id); assert.equal(a.body.status, 'Running'); assert.deepEqual(a.body.input, input); assert.equal(runs, 1);
  assert.equal((await f.request('', input, '')).code, 401);
  assert.equal((await f.request('/' + a.body.id, null, 'bob')).code, 404);
  assert.equal((await f.request('/' + a.body.id + '/cancel', {}, 'bob')).code, 404);
  finish({ status: 'proved' }); await sleep(5);
  assert.equal((await f.request('/' + a.body.id)).body.status, 'proved');
});
test('queue caps both owner and total pending, and cancelled queued jobs never run', async t => {
  let runs = 0, finish;
  const f = await setup(t, () => { runs++; return new Promise(r => { finish = r; }); }, { maxPending: 2, maxPerOwner: 1 });
  await f.request('', input);
  assert.equal((await f.request('', { ...input, source: 'other' })).code, 429);
  const queued = await f.request('', input, 'bob'); assert.equal(queued.body.phase, 'queued');
  assert.equal((await f.request('', input, 'charlie')).code, 429);
  assert.equal((await f.request('/' + queued.body.id + '/cancel', {}, 'bob')).body.status, 'Cancelled');
  finish({ status: 'checked' }); await sleep(10); assert.equal(runs, 1);
});
test('HTTP cancel and next worker wait for cleanup', async t => {
  const events = [];
  const f = await setup(t, async (body, { signal }) => {
    events.push(body.source);
    if (body.source === 'slow') { await new Promise(r => signal.addEventListener('abort', r, { once: true })); await sleep(30); events.push('cleanup'); signal.throwIfAborted(); }
    return { status: 'checked' };
  });
  const a = await f.request('', { ...input, source: 'slow' }); await f.request('', { ...input, source: 'next' });
  const cancel = f.request('/' + a.body.id + '/cancel', {}); await sleep(8);
  assert.deepEqual(events, ['slow']); assert.equal(f.jobs.get('alice', a.body.id).status, 'Running');
  assert.equal((await cancel).body.status, 'Cancelled'); await sleep(5); assert.deepEqual(events, ['slow', 'cleanup', 'next']);
});
test('legacy history is retained and explicitly ownerless; interrupted jobs never auto-run', async t => {
  let runs = 0;
  const history = [{ id: 'legacy', input, status: 'Failed' }, { id: 'interrupted', owner: 'alice', input, status: 'Running' }];
  const f = await setup(t, async () => { runs++; }, { history });
  const legacy = await f.request('/legacy'); assert.equal(legacy.body.legacyOwnerless, true); assert.deepEqual(legacy.body.input, input);
  assert.equal((await f.request('/legacy/cancel', {})).code, 403);
  assert.equal((await f.request('/interrupted')).body.status, 'Failed'); assert.equal(f.saved().length, 2); assert.equal(runs, 0);
});
test('oversized requests do not enter history and body owner cannot impersonate session', async t => {
  const f = await setup(t, async () => ({ status: 'checked' }));
  assert.equal((await f.request('', { ...input, source: 'a'.repeat(100_001) })).code, 400);
  const job = await f.request('', { ...input, owner: 'bob' });
  assert.equal(job.body.owner, 'alice'); assert.equal((await f.request('/' + job.body.id, null, 'bob')).code, 404);
});
