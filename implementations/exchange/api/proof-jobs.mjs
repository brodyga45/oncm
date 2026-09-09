import PQueue from 'p-queue';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

export function createProofJobs({ history = [], save, execute, root, maxPending = 16, maxPerOwner = 4 }) {
  const queue = new PQueue({ concurrency: 1 }), jobs = new Map(history.map(j => [j.id, j]));
  const active = new Map(), identities = new Map(); let closing = false;
  const persist = () => save([...jobs.values()]);
  let interrupted = false;
  for (const j of jobs.values()) if (j.status === 'Running') {
    j.status = 'Failed'; j.phase = 'interrupted'; j.error = 'API restarted; interrupted work was not automatically restarted.';
    j.finishedAt = new Date().toISOString(); interrupted = true;
  }
  if (interrupted) persist();
  function submit(owner, body) {
    if (!owner) throw Object.assign(Error('Sign in with your wallet'), { statusCode: 401 });
    owner = owner.toLowerCase();
    if (closing) throw Object.assign(Error('Proof queue is shutting down'), { statusCode: 503 });
    if (!body || !['check', 'register', 'prove'].includes(body.action)
      || (body.source !== undefined && typeof body.source !== 'string')
      || Buffer.byteLength(body.source ?? '') > 100_000 || Buffer.byteLength(JSON.stringify(body)) > 200_000)
      throw Error('Invalid proof job; source limit is 100 KB');
    const safeInput = Object.fromEntries(['action', 'source', 'statementId', 'goalHash', 'profileId', 'outcome', 'fixtureId', 'targetDeclaration'].map(k => [k, body[k]]));
    safeInput.source = body.source ?? '';
    if (body.packageId && /^[0-9a-f]{64}$/.test(body.packageId)) safeInput.packagePath = path.join(root, 'data/packages', body.packageId);
    const key = createHash('sha256').update(JSON.stringify([owner, safeInput])).digest('hex');
    if (identities.has(key)) return identities.get(key).job;
    if (active.size >= maxPending) throw Object.assign(Error('Proof queue is full; try again later'), { statusCode: 429 });
    if ([...active.values()].filter(e => e.job.owner === owner).length >= maxPerOwner)
      throw Object.assign(Error('Your proof queue is full; wait for a job to finish'), { statusCode: 429 });
    const job = { id: randomUUID(), owner, status: 'Running', phase: 'queued', createdAt: new Date().toISOString(), input: structuredClone(body) };
    const entry = { job, controller: new AbortController(), key };
    jobs.set(job.id, job); active.set(job.id, entry); identities.set(key, entry); persist();
    // Existing UI polls while status is Running; phase distinguishes waiting,
    // computation and cleanup without breaking its completion detection.
    entry.completion = queue.add(async () => {
      if (entry.controller.signal.aborted) return;
      job.phase = 'executing'; job.startedAt = new Date().toISOString(); persist();
      try {
        const result = await execute(safeInput, { id: job.id, signal: entry.controller.signal,
          onDiagnostics: text => { job.diagnostics = String(text).slice(-50_000); } });
        entry.controller.signal.throwIfAborted();
        job.status = result.status || 'Complete'; job.phase = 'complete'; job.result = result;
      } catch (error) {
        job.status = entry.controller.signal.aborted ? 'Cancelled' : 'Failed'; job.phase = 'complete'; job.error = error.message;
        if (error.result) job.result = error.result;
      }
    }).finally(() => { job.finishedAt = new Date().toISOString(); active.delete(job.id); identities.delete(key); persist(); });
    entry.completion.catch(() => {});
    return job;
  }
  function get(owner, id) {
    const job = jobs.get(id);
    if (!job || (job.owner && job.owner !== owner.toLowerCase())) throw Object.assign(Error('Unknown proof job'), { statusCode: 404 });
    // Existing ownerless history is retained, but never relabelled as private.
    return job.owner ? job : { ...job, legacyOwnerless: true };
  }
  async function cancel(owner, id) {
    const job = get(owner, id);
    if (!job.owner) throw Object.assign(Error('Legacy job has no authenticated owner and cannot be controlled'), { statusCode: 403 });
    if (job.status !== 'Running') return job;
    const entry = active.get(id), queued = job.phase === 'queued';
    if (!entry) throw Error('Job is no longer active');
    entry.controller.abort(Error('Job cancelled.')); job.phase = queued ? 'complete' : 'cancelling';
    if (queued) job.status = 'Cancelled';
    job.diagnostics = queued ? 'Cancelled before execution.' : 'Waiting for worker cleanup.'; persist();
    if (!queued) await entry.completion;
    return job;
  }
  async function close() {
    closing = true;
    const entries = [...active.values()];
    await Promise.all(entries.map(e => cancel(e.job.owner, e.job.id)));
    await Promise.allSettled(entries.map(e => e.completion));
    await queue.onIdle();
  }
  return { submit, get, cancel, close, stats: () => ({ active: queue.pending, waiting: queue.size, maxPending, maxPerOwner }) };
}

export function registerProofRoutes(app, { jobs, auth, validate = () => {} }) {
  app.post('/api/proof/jobs', auth, (req, res) => { validate(req.body); res.status(202).json(jobs.submit(req.address, req.body)); });
  app.get('/api/proof/jobs/:id', auth, (req, res) => res.json(jobs.get(req.address, req.params.id)));
  app.post('/api/proof/jobs/:id/cancel', auth, async (req, res) => res.json(await jobs.cancel(req.address, req.params.id)));
}
