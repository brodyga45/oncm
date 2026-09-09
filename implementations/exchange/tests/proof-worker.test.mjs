import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createProofWorker } from '../api/proof-worker.mjs';

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'exchange-live-worker-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'proof'));
  await fs.copyFile(new URL('../proof/resource-guard.py', import.meta.url), path.join(root, 'proof/resource-guard.py'));
  await fs.writeFile(path.join(root, 'proof/runner.mjs'), `let data='';for await(const b of process.stdin)data+=b;
    const input=JSON.parse(data);if(input.source==='wait')setInterval(()=>{},1000);
    else console.log(JSON.stringify({status:'checked',threads:process.env.RAYON_NUM_THREADS}));`);
  return { root, worker: createProofWorker(root) };
}
test('live worker adapter uses bounded supervisor for a tiny dummy and writes its report', async t => {
  const { root, worker } = await setup(t);
  const result = await worker({ action: 'check', source: 'dummy' }, { id: 'small', signal: new AbortController().signal, onDiagnostics() {} });
  assert.deepEqual(result, { status: 'checked', threads: '2' });
  const report = JSON.parse(await fs.readFile(path.join(root, 'data/proof-resource-reports/small.json')));
  assert.equal(report.reason, 'completed'); assert.ok(report.peakTreeFootprintBytes < 100 * 1024 * 1024);
});
test('live worker adapter settles cancellation only after supervisor cleanup', async t => {
  const { root, worker } = await setup(t), controller = new AbortController();
  const job = worker({ action: 'check', source: 'wait' }, { id: 'cancel', signal: controller.signal, onDiagnostics() {} });
  const rejected = assert.rejects(job, /cancel dummy/);
  await sleep(250); controller.abort(Error('cancel dummy')); await rejected;
  const report = JSON.parse(await fs.readFile(path.join(root, 'data/proof-resource-reports/cancel.json')));
  assert.equal(report.reason, 'cancelled');
});
