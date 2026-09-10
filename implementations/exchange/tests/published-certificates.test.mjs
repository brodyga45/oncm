import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedChoices, loadPublishedCertificate, assertWebJobAction } from '../web/published-certificates.mjs';
import { assertCertificateClaim, certificateClaimMatches, decodeExternalCertificate, fixtureForCertificate } from '../sdk/proof-import.mjs';
import { readProofCatalog } from '../api/proof-catalog.mjs';
import path from 'node:path';

const catalog = readProofCatalog(path.resolve(import.meta.dirname, '..'));
const profile = catalog.profiles.find(p => p.id === 'perf05');
const registrations = publishedChoices({profileId:profile.profileId,registration:true});

test('both genuine registration artifacts load their exact distinct canonical goal packages', () => {
  assert.deepEqual(registrations.map(c => c.id), ['true-registration','false-registration']);
  const goals = new Set();
  for (const choice of registrations) {
    const artifact = loadPublishedCertificate(choice.id,{profileId:profile.profileId,registration:true});
    assert.equal(artifact.case,choice.id);
    const binding = decodeExternalCertificate(artifact,profile,{outcome:0});
    const fixture = fixtureForCertificate(catalog.fixtures,binding);
    assert.equal(fixture.goalHash,choice.goalHash); goals.add(fixture.goalHash);
    assertCertificateClaim(artifact.certificate,{goalHash:fixture.goalHash,profileId:profile.profileId,outcome:0});
  }
  assert.equal(goals.size,2);
});
test('genuine YES proof and NO refutation loaders require the current goal and outcome', () => {
  for (const [goal,outcome,id] of [[registrations[0].goalHash,1,'true-proof'],[registrations[1].goalHash,2,'false-refutation']]) {
    const expected={profileId:profile.profileId,goalHash:goal,outcome};
    assert.deepEqual(publishedChoices(expected).map(c => c.id),[id]);
    const artifact=loadPublishedCertificate(id,expected);
    assert.equal(artifact.case,id);
    const decoded=decodeExternalCertificate(artifact,profile,expected);
    assert.equal(decoded.outcome,outcome);
    assert.equal(certificateClaimMatches(artifact.certificate,expected),true);
    assert.throws(() => loadPublishedCertificate(id,{...expected,outcome:outcome===1?2:1}),/does not match/);
    assert.throws(() => loadPublishedCertificate(id,{...expected,goalHash:'0x'+'00'.repeat(32)}),/does not match/);
    assert.equal(certificateClaimMatches(artifact.certificate,{...expected,outcome:0}),false);
  }
});
test('loader cannot cross profiles or interchange registration with settlement, returned data is isolated', () => {
  assert.deepEqual(publishedChoices({profileId:'0x'+'00'.repeat(32),registration:true}),[]);
  assert.throws(() => loadPublishedCertificate('false-refutation',{profileId:profile.profileId,registration:true}),/does not match/);
  const expected={profileId:profile.profileId,registration:true};
  const artifact=loadPublishedCertificate('false-registration',expected); artifact.outcome=2;
  assert.equal(loadPublishedCertificate('false-registration',expected).outcome,0);
});
test('raw certificate readiness checks exact canonical claim, not a claimed verified flag', () => {
  const artifact=loadPublishedCertificate('true-registration',{profileId:profile.profileId,registration:true});
  const expected={goalHash:artifact.goalHash,profileId:profile.profileId,outcome:0};
  assert.equal(certificateClaimMatches(artifact.certificate,expected),true);
  for (const certificate of ['', '0x1234', artifact.certificate+'00']) assert.equal(certificateClaimMatches(certificate,expected),false);
  assert.equal(certificateClaimMatches(artifact.certificate,{...expected,profileId:'0x'+'ff'.repeat(32)}),false);
  assert.equal(certificateClaimMatches(artifact.certificate,{...expected,goalHash:registrations[1].goalHash}),false);
});
test('the current web job gate permits native check only; API and CLI are not this gate', () => {
  assert.doesNotThrow(() => assertWebJobAction('check'));
  for(const action of ['register','prove','prepare','remote-prove']) assert.throws(() => assertWebJobAction(action),/outside the current website scope/);
});
