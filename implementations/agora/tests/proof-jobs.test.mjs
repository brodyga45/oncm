import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { setTimeout as sleep } from 'node:timers/promises';
import { createProofJobs, registerProofJobRoutes } from '../server/proof-jobs.mjs';

const input = { action: 'register', source: 'def Oncm.goal : Prop := True', profileId: 'v3', outcome: 1 };
async function setup(t, execute, options = {}) {
  const db = { jobs: options.history ?? [] }, app = Fastify();
  const jobs = createProofJobs({ db, save() {}, execute, ...options });
  registerProofJobRoutes(app, { jobs, session: req => {
    if (!req.headers['x-test-owner']) throw Object.assign(Error('Sign in'), { statusCode: 401 });
    return { address: req.headers['x-test-owner'] };
  } });
  t.after(() => app.close());
  return { jobs, db, app, post: (body = input, owner = 'alice') => app.inject({ method: 'POST', url: '/api/jobs', headers: { 'x-test-owner': owner }, payload: body }),
    cancel: (id, owner = 'alice') => app.inject({ method: 'POST', url: `/api/jobs/${id}/cancel`, headers: { 'x-test-owner': owner } }) };
}
test('API deduplicates simultaneous owner requests and preserves input/source shape', async t => {
  let executions = 0, finish;
  const f = await setup(t, () => { executions++; return new Promise(resolve => { finish = resolve; }); });
  const a = (await f.post()).json(), b = (await f.post(input, 'ALICE')).json();
  assert.equal(a.id, b.id); assert.deepEqual(a.input, input); assert.equal(f.db.jobs.length, 1); assert.equal(executions, 1);
  finish({ status: 'proved', diagnostics: 'mock queue test only' }); await sleep(5);
  const response = await f.app.inject({ method: 'GET', url: '/api/jobs', headers: { 'x-test-owner': 'alice' } });
  assert.equal(response.json()[0].status, 'succeeded'); assert.deepEqual(response.json()[0].input, input);
});
test('API admits at most one worker, enforces owner/global caps, and never launches cancelled queued job', async t => {
  let active = 0, peak = 0, runs = 0, finish;
  const f = await setup(t, async () => { runs++; active++; peak = Math.max(peak, active);
    await new Promise(resolve => { finish = resolve; }); active--; return { status: 'checked' }; }, { maxPending: 2, maxPerOwner: 1 });
  const first = (await f.post()).json();
  assert.equal((await f.post({ ...input, source: 'different' })).statusCode, 429);
  const second = (await f.post(input, 'bob')).json();
  assert.equal((await f.post(input, 'charlie')).statusCode, 429);
  assert.equal((await f.cancel(second.id, 'bob')).json().status, 'cancelled');
  finish(); await sleep(5); assert.equal(runs, 1); assert.equal(peak, 1);
  assert.equal(f.db.jobs.find(j => j.id === first.id).status, 'succeeded');
});
test('running cancel HTTP response and next worker both wait for actual cleanup', async t => {
  const events = [];
  const f = await setup(t, async (data, { signal }) => {
    events.push(`start:${data.source}`);
    if (data.source === 'slow') {
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      await sleep(35); events.push('cleanup'); signal.throwIfAborted();
    }
    return { status: 'checked' };
  });
  const slow = (await f.post({ ...input, source: 'slow' })).json();
  await f.post({ ...input, source: 'next' });
  const cancelling = f.cancel(slow.id); await sleep(10);
  assert.equal(f.db.jobs[0].status, 'running'); assert.deepEqual(events, ['start:slow']);
  assert.equal((await cancelling).json().status, 'cancelled'); await sleep(5);
  assert.deepEqual(events, ['start:slow', 'cleanup', 'start:next']);
});
test('API authentication/ownership and terminal state remain intact', async t => {
  const f = await setup(t, async () => ({ status: 'checked' }));
  assert.equal((await f.app.inject({ method: 'POST', url: '/api/jobs', payload: input })).statusCode, 401);
  const job = (await f.post()).json(); await sleep(2);
  assert.notEqual((await f.cancel(job.id, 'bob')).statusCode, 200);
  const other = await f.app.inject({ method: 'GET', url: '/api/jobs', headers: { 'x-test-owner': 'bob' } });
  assert.deepEqual(other.json(), []);
  assert.equal((await f.cancel(job.id)).json().status, 'succeeded');
});
test('restart preserves all old jobs/source and marks interrupted jobs without restarting them', async t => {
  let runs = 0;
  const history = [{ id: 'old-ok', owner: 'alice', status: 'succeeded', input: { ...input }, result: { status: 'proved' } },
    { id: 'old-running', owner: 'alice', status: 'running', input: { ...input } }];
  const f = await setup(t, async () => { runs++; }, { history });
  assert.equal(f.db.jobs.length, 2); assert.equal(f.db.jobs[0].status, 'succeeded'); assert.equal(f.db.jobs[1].status, 'failed');
  assert.deepEqual(f.db.jobs[1].input, input); assert.equal(runs, 0);
});
test('input size limits apply before retaining a new job', async t => {
  const f = await setup(t, async () => ({ status: 'checked' }));
  assert.notEqual((await f.post({ ...input, source: 'x'.repeat(100_001) })).statusCode, 200);
  assert.notEqual((await f.post({ ...input, arbitrary: 'x'.repeat(200_001) })).statusCode, 200);
  assert.equal(f.db.jobs.length, 0);
});
