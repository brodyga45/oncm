import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AbiCoder, ZeroAddress, keccak256, sha256, toUtf8Bytes } from 'ethers';
import { CLAIM_DOMAIN, inspectExternalCertificate, verifyExternalCertificate } from '../sdk/external-certificates.mjs';
const descriptor = JSON.parse(fs.readFileSync(new URL('../external-proofs/perf05/descriptor.json', import.meta.url)));
const record = JSON.parse(fs.readFileSync(new URL('../external-proofs/perf05/true-registration.json', import.meta.url)));
const coder = AbiCoder.defaultAbiCoder();
const addr = n => '0x' + String(n).padStart(40, '0');
// Encoding fixtures only: the original registration seal does NOT prove these
// changed journals. They never leave unit tests; cryptographic acceptance is a
// separate call tested against the original EVM in the validation record.
function encodingFixture(key, outcome, caseName = `${key}-${outcome === 0 ? 'registration' : outcome === 2 ? 'refutation' : 'proof'}`) {
  const goalHash = descriptor.goals.find(g => g.key === key).goalHash;
  const journal = coder.encode(['bytes32', 'bytes32', 'bytes32', 'uint256'], [CLAIM_DOMAIN, goalHash, descriptor.profileId, outcome]);
  return { ...record, goalHash, outcome, case: caseName, journal,
    certificate: coder.encode(['bytes', 'bytes'], [record.evmSeal, journal]) };
}

test('genuine CI record has exact independent perf05 binding and registration purpose', () => {
  const review = inspectExternalCertificate(record, descriptor);
  assert.equal(review.goalHash, descriptor.goals[0].goalHash);
  assert.equal(review.outcome, 0);
  assert.equal(review.certificate, record.certificate);
  assert.equal(record.evmVerified, false, 'CI flag is not local verification authority');
});
test('profile relabel, wrong case, selector and every journal word fail closed', () => {
  for (const patch of [
    { profile: 'v3' }, { profileId: '0x' + '11'.repeat(32) }, { imageId: '0x' + '22'.repeat(32) },
    { case: 'true-proof' }, { outcome: 1 }, { verifierParameters: '0x' + '33'.repeat(32) },
    { evmSeal: '0x00000000' + record.rawSeal.slice(2) },
  ]) assert.throws(() => inspectExternalCertificate({ ...record, ...patch }, descriptor));
  for (let word = 0; word < 4; word++) {
    const bytes = Buffer.from(record.journal.slice(2), 'hex'); bytes[word * 32] ^= 1;
    const journal = '0x' + bytes.toString('hex');
    const certificate = coder.encode(['bytes', 'bytes'], [record.evmSeal, journal]);
    assert.throws(() => inspectExternalCertificate({ ...record, journal, certificate }, descriptor), /Journal/);
  }
});
test('noncanonical certificate, inclusion and truncated seal are rejected', () => {
  for (const patch of [{ certificate: record.certificate + '00' }, { receiptKind: 'SetInclusion' },
    { rawSeal: record.rawSeal.slice(0, -2) }])
    assert.throws(() => inspectExternalCertificate({ ...record, ...patch }, descriptor));
});
test('both goal registrations and their exact proof/refutation case names are supported', () => {
  for (const [key, outcome] of [['true', 0], ['true', 1], ['false', 0], ['false', 2]]) {
    const parsed = inspectExternalCertificate(encodingFixture(key, outcome), descriptor);
    assert.equal(parsed.goal.key, key); assert.equal(parsed.outcome, outcome);
  }
  for (const [key, outcome, caseName] of [
    ['false', 2, 'false-proof'], ['false', 2, 'true-proof'], ['false', 2, 'false-registration'],
    ['false', 1, 'false-proof'], ['true', 2, 'true-refutation'], ['false', 0, 'false-refutation'],
  ]) assert.throws(() => inspectExternalCertificate(encodingFixture(key, outcome, caseName), descriptor), /Case\/outcome/);
  assert.throws(() => inspectExternalCertificate({ ...encodingFixture('false', 2), outcome: '2' }, descriptor), /Case\/outcome/);
});
test('standalone false Lean source and exact goal export match descriptor pins', () => {
  const f = descriptor.goals.find(g => g.key === 'false');
  const source = fs.readFileSync(new URL('../external-proofs/perf05/fixtures/OncmFalse.lean', import.meta.url), 'utf8');
  const goal = fs.readFileSync(new URL('../external-proofs/perf05/fixtures/false-goal.ndjson', import.meta.url));
  assert.equal(source, f.source); assert.match(source, /goal : Prop := ∀ P : Prop, P\n/);
  assert.equal(sha256(toUtf8Bytes(source)).slice(2), f.sourceSha256);
  assert.equal(sha256(goal), f.goalHash); assert.equal(sha256(goal).slice(2), f.goalExportSha256);
});
function harness({ registered = false, enabled = true, invalidCrypto = false, candidateCode = '0x1234' } = {}) {
  const calls = [], bridge = addr(1), underlying = addr(2), candidate = addr(3), candidateVerifier = addr(4);
  const at = value => async (...args) => {
    assert.equal(args.at(-1).blockTag, 63); return value;
  };
  const adapter = { imageId: at(descriptor.imageId), profileId: at(descriptor.profileId), verifyGoal: at(true), verify: at(true) };
  return { calls, args: {
    record, descriptor, defaultBridge: bridge, candidateBridge: candidate,
    provider: { getNetwork: async () => ({ chainId: 31373n }), getBlock: async () => ({ number: 63, hash: '0xblock' }), getCode: async address => address === candidateVerifier ? candidateCode : '0x1234' },
    registry: { profiles: at({ verifier: registered ? candidate : ZeroAddress, enabled, manifest: descriptor.manifest }) },
    contract: (address) => address === underlying ? {
      SELECTOR: at(descriptor.selector), VERSION: at('3.0.0'), verify: { staticCall: async (...args) => {
        calls.push(args); if (invalidCrypto) throw Error('pairing rejected');
      } },
    } : { ...adapter, verifier: at(address === candidate ? candidateVerifier : underlying) },
  } };
}
test('original EVM acceptance never bypasses governance admission', async () => {
  const h = harness(), review = await verifyExternalCertificate(h.args);
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0][1], descriptor.imageId);
  assert.equal(review.originalVerified, true); assert.equal(review.bridgeVerified, true);
  assert.equal(review.readyForRegistration, false); assert.equal(review.registered, false);
  const admitted = await verifyExternalCertificate(harness({ registered: true }).args);
  assert.equal(admitted.readyForRegistration, true);
  const disabled = await verifyExternalCertificate(harness({ registered: true, enabled: false }).args);
  assert.equal(disabled.readyForRegistration, false);
});
test('different original verifier instances are accepted only with identical runtime code', async () => {
  const review = await verifyExternalCertificate(harness().args);
  assert.notEqual(review.originalVerifier, review.bridgeVerifier);
  assert.equal(review.verifierCodeHash, keccak256('0x1234'));
  await assert.rejects(verifyExternalCertificate(harness({ candidateCode: '0x4321' }).args), /verifier runtime/);
});
test('disabled admission still permits exact NO settlement of existing profile', async () => {
  const h = harness({ registered: true, enabled: false });
  h.args.record = encodingFixture('false', 2);
  const review = await verifyExternalCertificate(h.args);
  assert.equal(review.profileEnabled, false); assert.equal(review.readyForRegistration, false);
  assert.equal(review.readyForResolution, true); assert.equal(review.outcome, 2);
});
test('underlying cryptographic rejection propagates despite evmVerified field', async () => {
  const h = harness({ invalidCrypto: true }); h.args.record = { ...record, evmVerified: true };
  await assert.rejects(verifyExternalCertificate(h.args), /pairing rejected/);
});
