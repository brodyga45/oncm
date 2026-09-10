import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGithubProofProvider, validateRequest } from './github-provider.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const jobId = 'bde931f0-1d59-4d59-9737-21a6d1a044bb';
const profile = JSON.parse(await fs.readFile(new URL('../ci/profiles/perf05/profile.json', import.meta.url)));
const profiles = { perf05: profile };
const goalBytes = await fs.readFile(new URL('../ci/profiles/perf05/fixtures/true-goal.ndjson', import.meta.url));
const part = bytes => ({ base64: bytes.toString('base64'), sha256: sha(bytes), bytes: bytes.length });
const makeRequest = () => ({ format: 'oncm-proof-request-v1', requestNonce: jobId, profile: 'perf05',
  profileId: profile.profileId, imageId: profile.imageId, goalHash: `0x${sha(goalBytes)}`, outcome: 0,
  source: { text: 'example (P : Prop) : P → P := fun h => h', sha256: sha('example (P : Prop) : P → P := fun h => h') },
  goal: part(goalBytes), export: part(goalBytes) });

function gitExec(args, { input, env = {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      signal, timeout: 5000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'ONCM transport test', GIT_AUTHOR_EMAIL: 'test@oncm.local',
        GIT_COMMITTER_NAME: 'ONCM transport test', GIT_COMMITTER_EMAIL: 'test@oncm.local', ...env },
    }, (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
    child.stdin.on('error', () => {}); child.stdin.end(input ?? '');
  });
}

test('transport rejects source/export mutation, noncanonical bytes and unknown profile', () => {
  assert.equal(validateRequest(makeRequest(), profiles).outcome, 0);
  for (const mutate of [r => r.source.text += 'x', r => r.goal.base64 += '\n',
    r => r.source = { text: '', sha256: sha('') },
    r => r.imageId = `0x${'1'.repeat(64)}`, r => r.goalHash = `0x${'2'.repeat(64)}`,
    r => r.outcome = '0', r => r.export.bytes--, r => r.command = 'unrecognized']) {
    const request = makeRequest(); mutate(request); assert.throws(() => validateRequest(request, profiles));
  }
});

test('actual isolated Git publication is narrow, retryable after ambiguous push, and owner-bound', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oncm-remote-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const origin = path.join(root, 'origin.git');
  await gitExec(['init', '--bare', origin]);
  const tree = await gitExec(['--git-dir', origin, 'mktree']);
  const baseCommit = await gitExec(['--git-dir', origin, 'commit-tree', tree], { input: 'Trusted local transport-test base\n' });
  await gitExec(['--git-dir', origin, 'update-ref', 'refs/heads/main', baseCommit]);
  let pushes = 0, loseResponse = true, responses = [], verifierCalls = 0, verificationGate = null, remoteRun;
  const runLocal = async (args, opts) => {
    const localArgs = args.map(v => v === 'git@github.com:example/oncm-test.git' ? origin : v);
    const result = await gitExec(localArgs, opts);
    if (args.includes('push')) { pushes++; if (loseResponse) { loseResponse = false; throw Error('Simulated lost push response after actual local update'); } }
    return result;
  };
  const provider = createGithubProofProvider({ repository: 'example/oncm-test', baseCommit, profiles,
    directory: path.join(root, 'publisher'), slotDirectory: path.join(root, 'shared-slot'), git: runLocal,
    fetchImpl: async url => url.startsWith('https://api.github.com/') ? new Response(JSON.stringify(remoteRun), { status: 200 })
      : responses.shift() ?? new Response('', { status: 404 }),
    // This is a transport test stub, deliberately not cryptographic evidence.
    verifyProof: async ({ proof, request }) => { verifierCalls++; await verificationGate; assert.equal(request.goalHash, makeRequest().goalHash); return proof?.accepted === true ? { certificate: 'test-only' } : false; } });
  const submission = { owner: 'alice', jobId, request: makeRequest(), publicConsent: true };
  await assert.rejects(provider.submit({ ...submission, publicConsent: false }), /consent/);
  await assert.rejects(provider.submit(submission), /lost push response/);
  const prepared = await provider.status({ owner: 'alice', jobId });
  assert.equal(prepared.status, 'prepared');
  const sent = await provider.submit(submission);
  assert.equal(sent.requestCommit, prepared.requestCommit); assert.equal(pushes, 1);
  assert.equal((await provider.submit(submission)).requestCommit, sent.requestCommit); assert.equal(pushes, 1);
  assert.equal(await gitExec(['--git-dir', origin, 'diff-tree', '--no-commit-id', '--name-only', '-r', sent.requestCommit]), 'oncm-request.json');
  const published = await gitExec(['--git-dir', origin, 'show', `${sent.requestCommit}:oncm-request.json`]);
  assert.equal(published, JSON.stringify(submission.request));
  assert.equal(sha(published), sent.requestDigest);
  await assert.rejects(provider.submit({ ...submission, owner: 'bob' }), /different request/);
  await assert.rejects(provider.status({ owner: 'bob', jobId }), /Unknown remote job/);
  assert.equal((await provider.status({ owner: 'alice', jobId })).status, 'awaiting-result');
  assert.equal(verifierCalls, 0);
  const result = { format: 'oncm-public-proof-result-v1', status: 'verified', requestDigest: sent.requestDigest,
    requestCommit: sent.requestCommit, baseCommit, runId: '123', runAttempt: '1', proof: { accepted: true }, error: null };
  const respond = value => responses.push(new Response(JSON.stringify(value), { status: 200 }));
  remoteRun = { id: 123, head_sha: sent.requestCommit, head_branch: `codex/proof-requests/${sent.requestDigest}`, status: 'in_progress', run_attempt: 2 };
  respond(result);
  assert.equal((await provider.status({ owner: 'alice', jobId })).status, 'awaiting-result');
  assert.equal(verifierCalls, 0);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'shared-slot/active.json'))).requestCommit, sent.requestCommit);
  remoteRun.status = 'completed'; remoteRun.run_attempt = 1;
  respond({ ...result, requestCommit: '0'.repeat(40) });
  await assert.rejects(provider.status({ owner: 'alice', jobId }), /immutable request/); assert.equal(verifierCalls, 0);
  respond({ ...result, proof: { accepted: false } });
  await assert.rejects(provider.status({ owner: 'alice', jobId }), /verification did not accept/); assert.equal(verifierCalls, 1);
  respond(result);
  const accepted = await provider.status({ owner: 'alice', jobId });
  assert.equal(accepted.status, 'verified'); assert.equal(verifierCalls, 2);
  assert.equal(accepted.cancellationSupported, false); assert.equal(pushes, 1);
  let finishVerification;
  verificationGate = new Promise(resolve => { finishVerification = resolve; });
  respond(result); respond(result);
  const simultaneousPolls = [provider.status({ owner: 'alice', jobId }), provider.status({ owner: 'alice', jobId })];
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(verifierCalls, 3, 'the second poll must wait for the first state transition');
  finishVerification();
  assert.deepEqual((await Promise.all(simultaneousPolls)).map(r => r.status), ['verified', 'verified']);
  assert.equal(verifierCalls, 4);
  responses.push(new Response('', { status: 503 }));
  await assert.rejects(provider.status({ owner: 'alice', jobId }), /not restarted/); assert.equal(pushes, 1);
});
