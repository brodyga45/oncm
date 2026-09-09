// Adapted from the independent Agora p-queue adapter. No cross-app runtime import.
import PQueue from 'p-queue';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

export const proofBudgets = Object.freeze({ check: 5, register: 30, prove: 120 });
const terminal = new Set(['completed', 'failed', 'cancelled']);
const ownerOf = job => (job.author || job.owner || '').toLowerCase();
const fail = (message, statusCode = 400) => Object.assign(Error(message), { statusCode });
const fields = ['action', 'source', 'statementId', 'goalHash', 'profileId', 'outcome', 'fixtureId', 'targetDeclaration'];

function normalize(input) {
  if (!input || !Object.hasOwn(proofBudgets, input.action)) throw fail('Action check, register or prove required');
  if (typeof input.source !== 'string' || Buffer.byteLength(input.source) > 200_000)
    throw fail('Lean source required (maximum 200 KB)');
  for (const key of fields.filter(k => !['action', 'source', 'outcome'].includes(k)))
    if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 1024))
      throw fail('Invalid ' + key);
  if (input.outcome !== undefined && ![1, 2].includes(input.outcome)) throw fail('Outcome must be 1 or 2');
  return Object.fromEntries(fields.filter(k => input[k] !== undefined).map(k => [k, input[k]]));
}

/** Outer guard deliberately has NO --lock-file. The inner runner owns the
 * shared oncm-worker lock. Only guard close acknowledges descendant cleanup. */
export function createProofWorker(root, { runner = path.join(root, 'proof/runner.mjs') } = {}) {
  return async (input, { signal, onDiagnostics, id }) => {
    signal.throwIfAborted();
    const guard = path.join(root, 'proof/resource-guard.py');
    await fs.access(runner); await fs.access(guard);
    const directory = path.join(root, '.state/proof-resource-reports');
    await fs.mkdir(directory, { recursive: true });
    const report = path.join(directory, `${id}.json`);
    const args = [guard, '--memory-mib', '2048', '--timeout', String(proofBudgets[input.action]),
      '--report', report, '--', process.execPath, runner];
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/python3', args, { cwd: root,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
          RAYON_NUM_THREADS: '2', GOMAXPROCS: '2', RISC0_DEV_MODE: '' },
        stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', diagnostics = '', fault;
      const abort = () => child.kill('SIGTERM');
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify(input));
      child.stdout.on('data', bytes => {
        if (Buffer.byteLength(output) + bytes.length > 2_000_000) {
          fault = Error('Proof runner output exceeded 2 MB'); abort();
        } else output += bytes.toString();
      });
      child.stderr.on('data', bytes => {
        diagnostics = (diagnostics + bytes.toString()).slice(-50_000);
        onDiagnostics(diagnostics);
      });
      child.on('error', error => { fault = error; });
      child.on('close', code => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) return reject(signal.reason);
        if (fault) return reject(fault);
        let result;
        try { result = JSON.parse(output.trim()); } catch {}
        if (code !== 0 || !result || ['failed', 'error', 'rejected'].includes(result.status)) {
          const message = code === 124 ? `Job exceeded ${proofBudgets[input.action]} seconds; worker stopped.`
            : code === 125 ? 'Job exceeded the 2 GiB memory budget; worker stopped.'
              : result?.diagnostics || diagnostics || output || `Runner exited ${code}`;
          return reject(Object.assign(Error(message), { result, report }));
        }
        resolve(result);
      });
    });
  };
}

export function createProofJobs({ db, save, execute, maxPending = 16, maxPerOwner = 4 }) {
  const queue = new PQueue({ concurrency: 1 }), active = new Map(), identities = new Map();
  let closed = false, changed = false;
  // Preserve historical records, source and results; never auto-replay old work.
  for (const job of db.jobs) if (['queued', 'running', 'cancelling'].includes(job.status)) {
    job.status = 'failed';
    job.diagnostics = 'API restarted; interrupted job was not automatically restarted.';
    job.finishedAt = new Date().toISOString(); changed = true;
  }
  if (changed) save();
  function submit(owner, rawInput) {
    if (closed) throw fail('Proof queue is shutting down', 503);
    const input = normalize(rawInput), author = owner.toLowerCase();
    const key = createHash('sha256').update(JSON.stringify([author, input])).digest('hex');
    const existing = identities.get(key);
    if (existing) return existing.job;
    // Count reserved entries, including a cancelled queued item until it drains,
    // so repeated submit/cancel cannot grow the underlying queue without bound.
    if (active.size >= maxPending) throw fail('Proof queue full; wait for a job to finish', 429);
    if ([...active.values()].filter(e => ownerOf(e.job) === author).length >= maxPerOwner)
      throw fail('Your proof queue is full; maximum four pending jobs', 429);
    const job = { id: randomUUID(), author: owner, input, status: 'queued',
      createdAt: new Date().toISOString(), diagnostics: '' };
    const entry = { job, key, controller: new AbortController() };
    active.set(job.id, entry); identities.set(key, entry); db.jobs.push(job); save();
    // No p-queue timeout or running AbortSignal: either can release a slot while
    // the subprocess is still cleaning up. The outer guard owns the budget.
    entry.completion = queue.add(async () => {
      if (entry.controller.signal.aborted) return;
      job.status = 'running'; job.startedAt = new Date().toISOString(); save();
      try {
        const result = await execute(job.input, { id: job.id, signal: entry.controller.signal,
          onDiagnostics: text => { job.diagnostics = String(text).slice(-50_000); } });
        if (entry.controller.signal.aborted) throw entry.controller.signal.reason;
        job.result = result; job.status = 'completed';
        job.diagnostics = result.diagnostics ?? job.diagnostics;
      } catch (error) {
        job.status = entry.controller.signal.aborted ? 'cancelled' : 'failed';
        job.diagnostics = error.message;
        if (error.result) job.result = error.result;
        if (error.report) job.resourceReport = path.basename(error.report);
      }
    }).finally(() => {
      job.finishedAt = new Date().toISOString(); active.delete(job.id);
      if (identities.get(key) === entry) identities.delete(key);
      save();
    });
    entry.completion.catch(() => {});
    return job;
  }
  async function cancel(owner, id) {
    const job = db.jobs.find(j => j.id === id && ownerOf(j) === owner.toLowerCase());
    if (!job) throw fail('Unknown job', 404);
    if (terminal.has(job.status)) return job;
    const entry = active.get(id);
    if (!entry) throw fail('Job is not active');
    const wasQueued = job.status === 'queued';
    job.status = wasQueued ? 'cancelled' : 'cancelling';
    if (wasQueued && identities.get(entry.key) === entry) identities.delete(entry.key);
    job.diagnostics = wasQueued ? 'Job cancelled before execution.' : 'Cancelling; waiting for worker cleanup.';
    entry.controller.abort(Error('Job cancelled.')); save();
    if (!wasQueued) await entry.completion;
    return job;
  }
  return { submit, cancel,
    list: owner => db.jobs.filter(job => ownerOf(job) === owner.toLowerCase()),
    stats: () => ({ running: queue.pending, pending: active.size, waiting: queue.size, maxPending, maxPerOwner }),
    idle: () => queue.onIdle(),
    close: async () => {
      closed = true;
      await Promise.all([...active.values()].map(e => cancel(e.job.author, e.job.id)));
      await queue.onIdle();
    },
  };
}
