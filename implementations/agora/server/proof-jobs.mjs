import PQueue from 'p-queue';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

export const proofBudgets = Object.freeze({ check: 5, register: 30, prove: 120 });
const terminal = new Set(['succeeded', 'failed', 'cancelled']);
const keyFor = (owner, input) => createHash('sha256').update(JSON.stringify([
  owner.toLowerCase(), input.action, input.source ?? null, input.fixtureId ?? null,
  input.goalHash ?? null, input.profileId ?? null, input.targetDeclaration ?? null,
  input.outcome ?? 1, input.statementId ?? null,
])).digest('hex');

/** No receipt fast-cache here. The pinned runner retains its own policy and
 * cryptographic checks. The outer guard has no lock; inner guards alone acquire
 * oncm-worker-UID.lock, avoiding nested acquisition of the same OS lock. */
export function createProofWorker(root) {
  return async (input, { signal, onDiagnostics, id }) => {
    signal.throwIfAborted();
    const runner = path.join(root, 'proof/runner.mjs'), guard = path.join(root, 'proof/resource-guard.py');
    await fs.access(runner); await fs.access(guard);
    const reports = path.join(root, '.local/proof-resource-reports');
    await fs.mkdir(reports, { recursive: true });
    const report = path.join(reports, `${id}.json`);
    const args = [guard, '--memory-mib', '2048', '--timeout', String(proofBudgets[input.action]), '--report', report,
      '--', process.execPath, runner];
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/python3', args, {
        cwd: root, env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
          RAYON_NUM_THREADS: '2', GOMAXPROCS: '2', RISC0_DEV_MODE: '' }, stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '', err = '', fault;
      const abort = () => child.kill('SIGTERM');
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(input));
      child.stdout.on('data', b => {
        if (Buffer.byteLength(out) + b.length > 2_000_000) { fault = Error('Proof runner output exceeded 2 MB'); abort(); }
        else out += b.toString();
      });
      child.stderr.on('data', b => { err = (err + b.toString()).slice(-50_000); onDiagnostics(err); });
      child.on('error', e => { fault = e; });
      // The supervisor's close follows descendant cleanup. Abort alone must
      // never resolve/reject this Promise and release the p-queue slot early.
      child.on('close', code => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) return reject(signal.reason);
        if (fault) return reject(fault);
        let result;
        try { result = JSON.parse(out.trim()); } catch {}
        if (code !== 0 || !result || ['failed', 'error'].includes(result.status)) {
          const message = code === 124 ? `Proof job exceeded its ${proofBudgets[input.action]} second budget; worker stopped.`
            : code === 125 ? 'Proof job exceeded the 2 GiB memory budget; worker stopped.'
              : result?.diagnostics || err || out || `Runner exited ${code}`;
          return reject(Object.assign(Error(message), { result, report }));
        }
        resolve(result);
      });
    });
  };
}

export function createProofJobs({ db, save, execute, maxPending = 16, maxPerOwner = 4 }) {
  const queue = new PQueue({ concurrency: 1 }), active = new Map(), identities = new Map();
  let closed = false;
  // Keep old history and source fields, but never resurrect interrupted work.
  let changed = false;
  for (const job of db.jobs) if (['queued', 'running', 'cancelling'].includes(job.status)) {
    job.status = 'failed'; job.diagnostics = 'API restarted; this job was interrupted and was not automatically restarted.';
    job.finishedAt = new Date().toISOString(); changed = true;
  }
  if (changed) save();
  function submit(owner, input) {
    if (closed) throw Object.assign(Error('Proof queue is shutting down'), { statusCode: 503 });
    if (!input || !['check', 'register', 'prove'].includes(input.action)
      || (input.source !== undefined && typeof input.source !== 'string')
      || Buffer.byteLength(input.source ?? '') > 100_000 || Buffer.byteLength(JSON.stringify(input)) > 200_000)
      throw Error('Invalid proof job');
    const key = keyFor(owner, input), existing = identities.get(key);
    if (existing) return existing.job;
    if (active.size >= maxPending) throw Object.assign(Error('Proof queue is full; try again later'), { statusCode: 429 });
    if ([...active.values()].filter(e => e.job.owner.toLowerCase() === owner.toLowerCase()).length >= maxPerOwner)
      throw Object.assign(Error('Your proof queue is full; wait for a job to finish'), { statusCode: 429 });
    const job = { id: randomUUID(), owner, input: structuredClone(input), status: 'queued', createdAt: new Date().toISOString(), diagnostics: '' };
    const entry = { job, key, controller: new AbortController() };
    active.set(job.id, entry); identities.set(key, entry); db.jobs.push(job); save();
    // Deliberately omit p-queue timeout/signal: those can release a slot before
    // a running subprocess has acknowledged cancellation.
    entry.completion = queue.add(async () => {
      if (entry.controller.signal.aborted) return;
      job.status = 'running'; job.startedAt = new Date().toISOString(); save();
      try {
        const result = await execute(job.input, { id: job.id, signal: entry.controller.signal,
          onDiagnostics: text => { job.diagnostics = String(text).slice(-50_000); } });
        if (entry.controller.signal.aborted) throw entry.controller.signal.reason;
        job.result = result; job.status = 'succeeded'; job.diagnostics = result.diagnostics ?? job.diagnostics;
      } catch (error) {
        job.status = entry.controller.signal.aborted ? 'cancelled' : 'failed';
        job.diagnostics = error.message;
        if (error.result) job.result = error.result;
      }
    }).finally(() => {
      job.finishedAt = new Date().toISOString(); active.delete(job.id); identities.delete(key); save();
    });
    entry.completion.catch(() => {});
    return job;
  }
  async function cancel(owner, id) {
    const job = db.jobs.find(j => j.id === id && typeof j.owner === 'string' && j.owner.toLowerCase() === owner.toLowerCase());
    if (!job) throw Error('Unknown job');
    if (terminal.has(job.status)) return job;
    const entry = active.get(id);
    if (!entry) throw Error('Job is not active');
    const wasQueued = job.status === 'queued';
    // Keep existing UI states. Running means cancellation cleanup is still
    // active; cancelled is published only after worker close.
    job.diagnostics = wasQueued ? 'Job cancelled before execution.' : 'Cancelling job; waiting for worker cleanup.';
    if (wasQueued) job.status = 'cancelled';
    entry.controller.abort(Error('Job cancelled.')); save();
    if (!wasQueued) await entry.completion;
    return job;
  }
  return { submit, cancel,
    list: owner => db.jobs.filter(j => typeof j.owner === 'string' && j.owner.toLowerCase() === owner.toLowerCase()),
    stats: () => ({ active: queue.pending, waiting: queue.size, maxPending, maxPerOwner }),
    close: async () => {
      closed = true;
      await Promise.all([...active.values()].map(e => cancel(e.job.owner, e.job.id)));
      await queue.onIdle();
    },
  };
}

export function registerProofJobRoutes(app, { jobs, session }) {
  app.post('/api/jobs', async req => jobs.submit(session(req).address, req.body));
  app.get('/api/jobs', async req => jobs.list(session(req).address));
  app.post('/api/jobs/:id/cancel', async req => jobs.cancel(session(req).address, req.params.id));
  app.addHook('onClose', async () => jobs.close());
}
