// Lightweight dummy workers only. No Lean, zk prover or live API/chain mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createProofJobs, createProofWorker, proofBudgets } from '../server/proof-jobs.mjs';
import { proofNotice } from '../web/proof-status.mjs';

const input = source => ({ action: 'check', source });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(execute, options = {}) {
  const db = { jobs: [] };
  const jobs = createProofJobs({ db, save() {}, execute, ...options });
  return { db, jobs };
}

test('one worker, owner-scoped stable deduplication, preserved author and full inputs', async () => {
  const gate = deferred(); let running = 0, peak = 0, executions = 0;
  const { jobs } = setup(async () => {
    running++; executions++; peak = Math.max(peak, running);
    await gate.promise; running--; return { status: 'checked' };
  });
  const first = jobs.submit('Alice', { source: 'private', action: 'check', author: 'Mallory' });
  const same = jobs.submit('ALICE', { action: 'check', source: 'private' });
  const second = jobs.submit('Bob', input('private'));
  assert.equal(first.id, same.id); assert.notEqual(first.id, second.id);
  assert.equal(first.author, 'Alice'); assert.equal(first.input.author, undefined);
  assert.equal(jobs.list('alice')[0].input.source, 'private');
  assert.equal(jobs.list('bob').length, 1); assert.equal(jobs.list('mallory').length, 0);
  gate.resolve(); await jobs.idle(); await delay(0);
  assert.equal(peak, 1); assert.equal(executions, 2); assert.equal(first.status, 'completed');
  await jobs.close();
});

test('16 reserved jobs globally, four per owner; duplicate does not consume capacity', async () => {
  const gate = deferred();
  const { jobs } = setup(async () => { await gate.promise; return { status: 'checked' }; });
  for (let owner = 0; owner < 4; owner++) for (let n = 0; n < 4; n++) jobs.submit('user' + owner, input('source' + n));
  assert.equal(jobs.stats().pending, 16);
  assert.equal(jobs.submit('user0', input('source0')).input.source, 'source0');
  assert.throws(() => jobs.submit('user4', input('new')), e => e.statusCode === 429);
  gate.resolve(); await jobs.idle(); await jobs.close();
  const otherGate = deferred();
  const { jobs: limited } = setup(async () => { await otherGate.promise; return { status: 'checked' }; });
  for (let n = 0; n < 4; n++) limited.submit('same', input(String(n)));
  assert.throws(() => limited.submit('same', input('fifth')), e => e.statusCode === 429);
  otherGate.resolve(); await limited.idle(); await limited.close();
});

test('running cancellation waits for cleanup before acknowledging or starting next worker', async () => {
  const cleanup = deferred(), started = deferred(); let secondStarted = false;
  const { jobs } = setup(async (data, { signal }) => {
    if (data.source === 'first') {
      started.resolve();
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      await cleanup.promise;
      throw signal.reason;
    }
    secondStarted = true; return { status: 'checked' };
  });
  const first = jobs.submit('Alice', input('first'));
  jobs.submit('Bob', input('second')); await started.promise;
  await assert.rejects(jobs.cancel('Bob', first.id), e => e.statusCode === 404);
  let acknowledged = false;
  const cancelled = jobs.cancel('Alice', first.id).then(() => { acknowledged = true; });
  await delay(15);
  assert.equal(first.status, 'cancelling'); assert.equal(acknowledged, false); assert.equal(secondStarted, false);
  cleanup.resolve(); await cancelled; await jobs.idle();
  assert.equal(first.status, 'cancelled'); assert.equal(secondStarted, true);
  await jobs.close();
});

test('queued cancellation never runs; repeated cancel does not grow reserved capacity', async () => {
  const gate = deferred(), seen = [];
  const { jobs } = setup(async data => { seen.push(data.source); await gate.promise; return { status: 'checked' }; });
  jobs.submit('a', input('first'));
  const queued = jobs.submit('b', input('cancel-me'));
  await jobs.cancel('b', queued.id);
  assert.equal(queued.status, 'cancelled'); assert.equal(jobs.stats().pending, 2);
  await jobs.cancel('b', queued.id); assert.equal(jobs.stats().pending, 2);
  gate.resolve(); await jobs.idle(); await delay(0);
  assert.deepEqual(seen, ['first']); assert.equal(jobs.stats().pending, 0);
  await jobs.close();
});

test('restart preserves sources/results and fails stale jobs without restarting them', async () => {
  const db = { jobs: [
    { id: 'old', author: 'a', input: input('private history'), status: 'completed', result: { status: 'checked' } },
    { id: 'stale', author: 'a', input: input('interrupted source'), status: 'running', result: { detail: 'preserve' } },
  ] };
  let runs = 0, saves = 0;
  const jobs = createProofJobs({ db, save() { saves++; }, execute() { runs++; } });
  assert.equal(db.jobs.length, 2); assert.equal(db.jobs[0].status, 'completed');
  assert.equal(db.jobs[1].status, 'failed'); assert.equal(db.jobs[1].input.source, 'interrupted source');
  assert.deepEqual(db.jobs[1].result, { detail: 'preserve' }); assert.equal(runs, 0); assert.equal(saves, 1);
  await jobs.close(); assert.throws(() => jobs.submit('a', input('new')), e => e.statusCode === 503);
});

test('UI distinguishes queued/running/check-only from actual certificate output', () => {
  assert.match(proofNotice({ status: 'queued' }), /принята в очередь/);
  assert.match(proofNotice({ status: 'running' }), /выполняется/);
  assert.match(proofNotice({ status: 'cancelling' }), /ожидаем/);
  assert.equal(proofNotice({ status: 'completed', input: input(''), result: { status: 'checked' } }), 'Проверка Lean завершена.');
  assert.doesNotMatch(proofNotice({ status: 'completed', result: {} }), /Сертификат доступен/);
  // UI-only envelope; this is not fed to any verifier or represented as a proof.
  assert.match(proofNotice({ status: 'completed', result: { certificate: 'test-ui-only' } }), /Сертификат доступен/);
  assert.deepEqual(proofBudgets, { check: 5, register: 30, prove: 120 });
});

test('outer guard runs a tiny dummy worker and cancellation cleans its descendant', { skip: process.platform !== 'darwin' }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-proof-queue-test-'));
  await fs.mkdir(path.join(root, 'proof'));
  await fs.copyFile(new URL('../proof/resource-guard.py', import.meta.url), path.join(root, 'proof/resource-guard.py'));
  const runner = path.join(root, 'dummy.mjs');
  await fs.writeFile(runner, `import { spawn } from 'node:child_process';
let s=''; for await(const b of process.stdin) s+=b;
const input=JSON.parse(s);
if(input.source==='finish') console.log(JSON.stringify({status:'checked',diagnostics:''}));
else { const c=spawn(process.execPath,['-e',"setInterval(()=>{},1000)"],{stdio:'ignore'});
process.stderr.write('DUMMY_CHILD:'+c.pid+'\\n'); setInterval(()=>{},1000); }
`);
  try {
    const execute = createProofWorker(root, { runner });
    const result = await execute(input('finish'), { id: 'success', signal: new AbortController().signal, onDiagnostics() {} });
    assert.equal(result.status, 'checked'); assert.equal(result.certificate, undefined);
    const report = JSON.parse(await fs.readFile(path.join(root, '.state/proof-resource-reports/success.json')));
    assert.equal(report.reason, 'completed'); assert.equal(report.memoryLimitBytes, 2 * 1024 ** 3);
    assert(report.peakTreeFootprintBytes > 0 && report.peakTreeFootprintBytes < report.memoryLimitBytes);
    const controller = new AbortController(), ready = deferred(); let childPid;
    const cancelled = execute(input('wait'), { id: 'cancel', signal: controller.signal,
      onDiagnostics(text) { const match = /DUMMY_CHILD:(\d+)/.exec(text); if (match) { childPid = Number(match[1]); ready.resolve(); } } });
    const rejection = assert.rejects(cancelled, /test cancellation/);
    await ready.promise; controller.abort(Error('test cancellation')); await rejection;
    const cancelledReport = JSON.parse(await fs.readFile(path.join(root, '.state/proof-resource-reports/cancel.json')));
    assert.equal(cancelledReport.reason, 'cancelled');
    for (let n = 0; n < 20; n++) {
      try { process.kill(childPid, 0); await delay(25); } catch { break; }
    }
    assert.throws(() => process.kill(childPid, 0), e => e.code === 'ESRCH');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
