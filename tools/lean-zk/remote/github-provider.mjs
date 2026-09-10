import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { claimRemoteSlot, releaseRemoteSlot } from './remote-slot.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const hex = /^[0-9a-f]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const exactKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
  && Object.keys(object).sort().join(',') === [...keys].sort().join(',');

/** Transport validation supplements the CI kernel check; it cannot establish
 * that the Lean source compiles to these exports, or that the theorem is true. */
export function validateRequest(request, profiles) {
  if (!exactKeys(request, ['format', 'requestNonce', 'profile', 'profileId', 'imageId', 'goalHash', 'outcome', 'source', 'goal', 'export'])
    || request.format !== 'oncm-proof-request-v1' || !uuid.test(request.requestNonce)) throw Error('Invalid proof request envelope');
  const profile = profiles[request.profile];
  if (!profile || request.profileId !== profile.profileId || request.imageId !== profile.imageId
    || ![0, 1, 2].includes(request.outcome)) throw Error('Unknown immutable proof profile or outcome');
  if (!exactKeys(request.source, ['text', 'sha256']) || typeof request.source.text !== 'string' || !request.source.text.length
    || Buffer.byteLength(request.source.text) > 512 * 1024 || sha(request.source.text) !== request.source.sha256)
    throw Error('Source digest or size mismatch');
  function decode(part) {
    if (!exactKeys(part, ['base64', 'sha256', 'bytes']) || typeof part.base64 !== 'string'
      || part.base64.length > 1_398_104 || !hex.test(part.sha256)
      || !Number.isSafeInteger(part.bytes) || part.bytes < 1 || part.bytes > 1024 * 1024) throw Error('Invalid export descriptor');
    const bytes = Buffer.from(part.base64, 'base64');
    if (bytes.toString('base64') !== part.base64 || bytes.length !== part.bytes || sha(bytes) !== part.sha256)
      throw Error('Export bytes or digest mismatch');
    return bytes;
  }
  const goal = decode(request.goal), full = decode(request.export);
  if (request.goalHash !== `0x${request.goal.sha256}` || !full.subarray(0, goal.length).equals(goal)
    || (request.outcome === 0 && !full.equals(goal))) throw Error('Goal commitment or export prefix mismatch');
  if (Buffer.byteLength(JSON.stringify(request)) > 4 * 1024 * 1024) throw Error('Request exceeds 4 MiB');
  return request;
}

async function boundedJson(response, maxBytes = 4 * 1024 * 1024) {
  if (Number(response.headers.get('content-length')) > maxBytes) throw Error('Remote result exceeds size limit');
  const parts = []; let length = 0;
  for await (const part of response.body) {
    length += part.length;
    if (length > maxBytes) throw Error('Remote result exceeds size limit');
    parts.push(part);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

function runGit(args, { cwd, input, env = {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd, signal, timeout: 30_000, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
        SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'ONCM proof request', GIT_AUTHOR_EMAIL: 'proof@oncm.local',
        GIT_COMMITTER_NAME: 'ONCM proof request', GIT_COMMITTER_EMAIL: 'proof@oncm.local', ...env },
    }, (error, stdout) => error ? reject(Error(`Git ${args[0]} failed (${error.code ?? 'unknown'}); the saved request can be retried.`)) : resolve(stdout.trim()));
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });
}

/** A publisher uses a separate bare repository, never the application's working
 * tree. Authentication stays in the operator's existing SSH agent. Configuration
 * is server-owned; callers cannot choose the repository, base, workflow or branch.
 * A successful remote status is returned only after verifyProof checks the actual
 * certificate through the application's original verifier and governed bridge. */
export function createGithubProofProvider({ repository, baseCommit, directory, slotDirectory, profiles, verifyProof,
  git = runGit, fetchImpl = globalThis.fetch }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[0-9a-f]{40}$/.test(baseCommit)
    || typeof verifyProof !== 'function' || !path.isAbsolute(directory) || !path.isAbsolute(slotDirectory ?? '')) throw Error('Invalid server-owned GitHub prover configuration');
  const remote = `git@github.com:${repository}.git`, bare = path.join(directory, 'publisher.git');
  const indexFile = path.join(directory, 'publisher.index');
  const locks = { tail: Promise.resolve() };
  const serial = operation => {
    const pending = locks.tail.then(operation); locks.tail = pending.catch(() => {}); return pending;
  };
  const metadataPath = id => {
    if (!uuid.test(id)) throw Error('Invalid local job ID');
    return path.join(directory, 'jobs', `${id}.json`);
  };
  async function save(record) {
    const destination = metadataPath(record.jobId), tmp = `${destination}.tmp`;
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.writeFile(tmp, JSON.stringify(record), { mode: 0o600 }); await fs.rename(tmp, destination);
  }
  async function read(owner, id) {
    let record;
    try { record = JSON.parse(await fs.readFile(metadataPath(id), 'utf8')); }
    catch { throw Error('Unknown remote job'); }
    if (record.owner !== owner) throw Error('Unknown remote job');
    return record;
  }
  const publicView = record => ({ jobId: record.jobId, requestDigest: record.requestDigest,
    requestCommit: record.requestCommit, baseCommit: record.baseCommit, status: record.status,
    requestUrl: `https://github.com/${repository}/tree/${record.requestCommit}`,
    workflowUrl: `https://github.com/${repository}/actions/workflows/lean-zk-request.yml`,
    cancellationSupported: false });
  async function initialize(signal) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    try { await fs.access(path.join(bare, 'HEAD')); }
    catch { await git(['init', '--bare', bare], { signal }); }
    try { await git(['--git-dir', bare, 'cat-file', '-e', `${baseCommit}^{commit}`], { signal }); }
    catch { await git(['--git-dir', bare, 'fetch', '--depth=1', remote, baseCommit], { signal }); }
  }
  async function submit({ owner, jobId, request, publicConsent = false, signal }) {
    if (typeof owner !== 'string' || !owner || owner.length > 256) throw Error('An authenticated job owner is required');
    if (!publicConsent) throw Error('Explicit public source publication consent is required');
    metadataPath(jobId); validateRequest(request, profiles);
    if (request.requestNonce !== jobId) throw Error('Request nonce must match the owned job ID');
    const requestText = JSON.stringify(request), requestDigest = sha(requestText);
    return serial(async () => {
      signal?.throwIfAborted();
      let record;
      try { record = JSON.parse(await fs.readFile(metadataPath(jobId), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (record && (record.owner !== owner || record.requestDigest !== requestDigest || record.repository !== repository)) throw Error('Job identity already has a different request');
      if (record?.status === 'submitted' || record?.status === 'verified') return publicView(record);
      await initialize(signal);
      if (!record) {
        const args = ['--git-dir', bare], env = { GIT_INDEX_FILE: indexFile };
        await git([...args, 'read-tree', baseCommit], { env, signal });
        const blob = await git([...args, 'hash-object', '-w', '--stdin'], { input: requestText, signal });
        await git([...args, 'update-index', '--add', '--cacheinfo', `100644,${blob},oncm-request.json`], { env, signal });
        const tree = await git([...args, 'write-tree'], { env, signal });
        const requestCommit = await git([...args, 'commit-tree', tree, '-p', baseCommit], {
          input: `ONCM public proof request ${requestDigest}\n`, signal });
        if (!/^[0-9a-f]{40}$/.test(requestCommit)) throw Error('Git did not return a valid request commit');
        record = { jobId, owner, requestDigest, requestCommit, baseCommit, repository, request,
          status: 'prepared', createdAt: new Date().toISOString() };
        await save(record);
      }
      record.slot = await claimRemoteSlot(slotDirectory, record); await save(record);
      // Persist before network submission. A timeout is ambiguous; a retry first
      // inspects this exact ref and cannot start a second request with a new nonce.
      const ref = `refs/heads/codex/proof-requests/${requestDigest}`;
      const found = await git(['ls-remote', '--refs', remote, ref], { signal });
      if (found && found.split(/\s+/)[0] !== record.requestCommit) throw Error('Remote request branch has an unexpected commit');
      if (!found) await git(['--git-dir', bare, 'push', remote, `${record.requestCommit}:${ref}`], { signal });
      record.status = 'submitted'; record.submittedAt = new Date().toISOString(); await save(record);
      return publicView(record);
    });
  }
  async function status({ owner, jobId, signal }) {
    const record = await read(owner, jobId);
    if (record.status === 'prepared') return publicView(record);
    const url = `https://raw.githubusercontent.com/${repository}/refs/heads/codex/proof-results/${record.requestDigest}/result.json`;
    const timeout = AbortSignal.timeout(15_000);
    const response = await fetchImpl(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: 'error', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
    if (response.status === 404) return { ...publicView(record), status: 'awaiting-result' };
    if (!response.ok) throw Error(`GitHub result unavailable (${response.status}); the remote run was not restarted`);
    const result = await boundedJson(response);
    if (result.format !== 'oncm-public-proof-result-v1' || result.requestDigest !== record.requestDigest
      || result.requestCommit !== record.requestCommit || result.baseCommit !== record.baseCommit
      || !['verified', 'failed'].includes(result.status) || !/^\d+$/.test(String(result.runId))
      || !/^\d+$/.test(String(result.runAttempt))) throw Error('Remote result does not match this immutable request');
    if (record.slot) {
      // A previous attempt's result remains public during a manual CI rerun.
      // The artifact alone therefore cannot release the shared computation slot.
      const runResponse = await fetchImpl(`https://api.github.com/repos/${repository}/actions/runs/${result.runId}`, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
        redirect: 'error', headers: { Accept: 'application/vnd.github+json' },
      });
      if (!runResponse.ok) throw Error(`Cannot reconcile the remote run (${runResponse.status}); the shared slot remains reserved`);
      const run = await boundedJson(runResponse, 1024 * 1024);
      if (String(run.id) !== String(result.runId) || run.head_sha !== record.requestCommit
        || run.head_branch !== `codex/proof-requests/${record.requestDigest}`) throw Error('Workflow run does not match the submitted request');
      if (run.status !== 'completed' || String(run.run_attempt) !== String(result.runAttempt))
        return { ...publicView(record), status: 'awaiting-result', runId: String(run.id) };
      await releaseRemoteSlot(slotDirectory, record.slot);
      delete record.slot; await save(record);
    }
    if (result.status === 'failed') return { ...publicView(record), status: 'failed',
      error: String(result.error ?? 'Remote proving failed').slice(0, 4000), runId: String(result.runId) };
    const verified = await verifyProof({ proof: result.proof, request: record.request, signal });
    if (!verified) throw Error('Original certificate verification did not accept the result');
    record.status = 'verified'; await save(record);
    return { ...publicView(record), status: 'verified', result: verified, runId: String(result.runId) };
  }
  return { submit, status: args => serial(() => status(args)), capabilities: Object.freeze({ publicOnly: true, cancellation: false,
    localHeavyProving: false, maxRequestBytes: 4 * 1024 * 1024 }) };
}
