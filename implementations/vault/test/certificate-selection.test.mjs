import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AbiCoder } from 'ethers';
import { createCertificateImporter } from '../web/certificate-import.mjs';
import { bindOutcomeCertificate, bindProofJob, proofBindingMatches } from '../web/proof-binding.mjs';
import { CLAIM_DOMAIN } from '../sdk/external-certificates.mjs';

const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const catalog = [{ descriptor: { tag: 'perf05', imageId: 'exact-image' }, deployment: { bridge: 'exact-bridge' }, examples: [] }];
function harness(verify = async () => ({ outcome: 1 }), loadCatalog = async () => catalog) {
  const states = [], calls = [];
  const sdk = { verifyExternalCertificate: (...args) => { calls.push(args); return verify(...args); } };
  const importer = createCertificateImporter({ publish: value => states.push(value), loadCatalog });
  importer.setClient(sdk); importer.setInput('{"record":"one"}');
  return { importer, states, calls, sdk };
}

test('overlapping file reads retain newest input, including late failure and edits', async () => {
  const { importer } = harness(), old = defer();
  const pending = importer.readFile({ size: 10, text: () => old.promise });
  await importer.readFile({ size: 10, text: async () => 'newest' });
  old.reject(Error('obsolete read failure')); await pending;
  assert.equal(importer.state.input, 'newest'); assert.equal(importer.state.error, '');
  const later = defer(), reading = importer.readFile({ size: 10, text: () => later.promise });
  importer.setInput('typed by user'); later.resolve('old file'); await reading;
  assert.equal(importer.state.input, 'typed by user');
});

test('input/profile/client ABA changes invalidate an in-flight verification', async () => {
  for (const change of [
    h => { h.importer.setInput('{}'); h.importer.setInput('{"record":"one"}'); },
    h => { h.importer.setProfile('other'); h.importer.setProfile('perf05'); },
    h => { h.importer.setClient({}); h.importer.setClient(h.sdk); },
  ]) {
    const pending = defer(), h = harness(() => pending.promise);
    const work = h.importer.verify(); await Promise.resolve();
    change(h); pending.resolve({ outcome: 1 }); await work;
    assert.equal(h.importer.state.review, null); assert.equal(h.importer.state.verifiedEntry, null);
  }
});

test('older request cannot clear loading or overwrite a newer verified descriptor', async () => {
  const old = defer(), next = defer(); let index = 0;
  const h = harness(() => (++index === 1 ? old.promise : next.promise));
  const first = h.importer.verify(); await Promise.resolve();
  h.importer.setInput('{"record":"two"}');
  const second = h.importer.verify(); await Promise.resolve();
  old.reject(Error('old request rejected')); await first;
  assert.equal(h.importer.state.loading, true); assert.equal(h.importer.state.error, '');
  next.resolve({ outcome: 2, exact: true }); await second;
  assert.deepEqual(h.importer.state.review, { outcome: 2, exact: true });
  assert.equal(h.importer.state.verifiedEntry, catalog[0]);
  assert.deepEqual(h.calls[1], [{ record: 'two' }, catalog[0].descriptor, 'exact-bridge']);
});

test('profile change before catalog resolves never calls SDK with a different descriptor', async () => {
  const pending = defer(), h = harness(undefined, () => pending.promise);
  const work = h.importer.verify(); h.importer.setProfile('other'); pending.resolve(catalog); await work;
  assert.equal(h.calls.length, 0); assert.equal(h.importer.state.review, null);
});

test('initial public catalog survives input/client changes without replacing them', async () => {
  const pending = defer(), h = harness(undefined, () => pending.promise);
  const refreshing = h.importer.refresh();
  h.importer.setInput('new input before catalog arrives'); h.importer.setClient({});
  pending.resolve(catalog); await refreshing;
  assert.equal(h.importer.state.catalog, catalog);
  assert.equal(h.importer.state.input, 'new input before catalog arrives');
  assert.equal(h.importer.state.review, null); assert.equal(h.importer.state.loading, false);
});

test('unmounted component and oversized files cannot publish a late result', async () => {
  const pending = defer(), h = harness(() => pending.promise);
  await h.importer.readFile({ size: 2*1024*1024+1, text: () => assert.fail('oversized file must not be read') });
  assert.match(h.importer.state.error, /2 MiB/);
  const work = h.importer.verify(); await Promise.resolve();
  h.importer.dispose(); const before = h.states.length;
  pending.resolve({ outcome: 1 }); await work;
  assert.equal(h.states.length, before);
});

const descriptor = JSON.parse(fs.readFileSync(new URL('../external-proofs/perf05/descriptor.json', import.meta.url)));
const proof = JSON.parse(fs.readFileSync(new URL('../external-proofs/perf05/true-proof.json', import.meta.url)));
const registration = JSON.parse(fs.readFileSync(new URL('../external-proofs/perf05/true-registration.json', import.meta.url)));
const statement = { id: '0x' + '12'.repeat(32), kind: 0, outcome: 0, goalHash: proof.goalHash, profileId: proof.profileId };

test('genuine true proof is bound to exact statement, profile, outcome and certificate bytes', () => {
  const binding = bindOutcomeCertificate(statement, 1, proof.certificate);
  assert.ok(proofBindingMatches(binding, statement, '1', proof.certificate));
  for (const patch of [{ id: '0x' + '13'.repeat(32) }, { goalHash: '0x' + '14'.repeat(32) },
    { profileId: '0x' + '15'.repeat(32) }, { outcome: 1 }, { kind: 1 }])
    assert.equal(proofBindingMatches(binding, { ...statement, ...patch }, 1, proof.certificate), false);
  assert.equal(proofBindingMatches(binding, statement, 2, proof.certificate), false);
  assert.equal(proofBindingMatches(binding, statement, 1, registration.certificate), false);
  assert.equal(bindOutcomeCertificate(statement, 2, proof.certificate), null);
  assert.equal(bindOutcomeCertificate(statement, 1, registration.certificate), null);
});

test('NO certificate encoding binds only the exact false goal and outcome2', () => {
  // Encoding fixture only; no claim of a real refutation seal or EVM acceptance.
  const noStatement = { ...statement, goalHash: descriptor.goals.find(g => g.key === 'false').goalHash };
  const abi = AbiCoder.defaultAbiCoder();
  const journal = abi.encode(['bytes32', 'bytes32', 'bytes32', 'uint256'], [CLAIM_DOMAIN, noStatement.goalHash, noStatement.profileId, 2]);
  const certificate = abi.encode(['bytes', 'bytes'], [proof.evmSeal, journal]);
  assert.ok(bindOutcomeCertificate(noStatement, 2, certificate));
  assert.equal(bindOutcomeCertificate(statement, 2, certificate), null);
  assert.equal(bindOutcomeCertificate(noStatement, 1, certificate), null);
  assert.equal(bindOutcomeCertificate(noStatement, 2, certificate + '00'), null);
});

test('late local job cannot bind to another statement/outcome or replace a registration', () => {
  const job = { input: { action: 'prove', statementId: statement.id, goalHash: statement.goalHash,
    profileId: statement.profileId, outcome: 1 }, result: proof };
  assert.ok(bindProofJob(job, statement, 1));
  assert.equal(bindProofJob(job, { ...statement, id: 'other' }, 1), null);
  assert.equal(bindProofJob(job, statement, 2), null);
  assert.equal(bindProofJob({ ...job, input: { ...job.input, action: 'register' } }, statement, 1), null);
  assert.equal(bindProofJob({ ...job, result: { ...proof, profileId: 'other' } }, statement, 1), null);
});

test('generic file uses bounded raw JSON route and late wallet result cannot replace input',async()=>{
  const pending=defer(),h=harness(),calls=[];
  h.sdk.verifyExternalBundle=(...args)=>{calls.push(args);return pending.promise;};
  const raw=JSON.stringify({format:'oncm-external-certificate-bundle-v1',artifact:{profileId:'test'},padding:'x'.repeat(70000)});
  await h.importer.readFile({size:raw.length,text:async()=>raw});
  assert.equal(h.importer.state.input,raw);
  const work=h.importer.verify();await Promise.resolve();
  assert.equal(calls.length,1);assert.equal(calls[0][0],raw);
  h.importer.setClient({});pending.resolve({genericBundle:true});await work;
  assert.equal(h.importer.state.review,null);
});

test('oversized curated records and duplicate JSON fields never reach verifier',async()=>{
  const h=harness();h.importer.setInput(JSON.stringify({padding:'x'.repeat(65536)}));await h.importer.verify();
  assert.match(h.importer.state.error,/64 KiB/);assert.equal(h.calls.length,0);
  h.importer.setInput('{"format":"one","format":"two"}');await h.importer.verify();
  assert.match(h.importer.state.error,/Duplicate/);assert.equal(h.calls.length,0);
});
