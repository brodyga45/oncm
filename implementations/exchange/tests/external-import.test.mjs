import test from 'node:test';
import assert from 'node:assert/strict';
import {externalInput,genericRegistrationDraft} from '../web/external-import.mjs';
import {validatePublishedPackage} from '../api/package-validation.mjs';
import {selectExternalBundleProfile} from '../sdk/external-profile-catalog.mjs';
import {inspectExternalBundle} from '../sdk/external-bundle.mjs';
import {externalFixture} from './external-bundle-fixture.mjs';
const prepared=(input)=>{const p=selectExternalBundleProfile(input,input.artifact.profileId);return{...inspectExternalBundle(input,{trustedProfile:p.descriptor,foundationBytes:p.foundationBytes}),genericBundle:true,originalVerified:true,cryptographicStatus:'original-and-bridge-verified'};};
test('Generic registration has no fixture allowlist and only an independently verified review populates a draft',()=>{
 const input=externalFixture(),review=prepared(input),draft=genericRegistrationDraft(review,input);
 assert.equal(draft.fixtureId,'');assert.equal(draft.goalHash,input.artifact.goalHash);assert.equal(draft.sourceGoalRelation,'not-verified');
 assert.throws(()=>genericRegistrationDraft({...review,originalVerified:false},input));
 const changed=structuredClone(input);changed.artifact.certificate+='00';assert.throws(()=>genericRegistrationDraft(review,changed));
});
test('Exact goal-only portable package is public without inventing a Lean source, semantics remain unverified',()=>{
 const input=externalFixture();delete input.source;const draft=genericRegistrationDraft(prepared(input),input);
 assert.equal(draft.source,'');const published=validatePublishedPackage(draft);assert.equal(published.source,'');assert.equal(published.sourceGoalRelation,'not-verified');assert.equal(published.packageValidation,'binding-only-not-EVM-verification');
 assert.throws(()=>validatePublishedPackage({...draft,goalHash:'0x'+'ab'.repeat(32)}));
 assert.throws(()=>validatePublishedPackage({...draft,canonicalGoalExport:{...draft.canonicalGoalExport,bytes:1}}));
});
test('Raw generic input preserves duplicate-key checks; curated certificate bound stays small',()=>{
 const input=externalFixture(),raw=JSON.stringify(input,null,2);assert.equal(externalInput(raw).raw,raw);
 assert.throws(()=>externalInput('{"format":"a","format":"b"}'));
 assert.throws(()=>externalInput(JSON.stringify({format:'oncm-real-groth16-ci-v1',padding:'x'.repeat(128*1024)})));
});
