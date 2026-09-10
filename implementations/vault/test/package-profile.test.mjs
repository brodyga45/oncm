import test from 'node:test';import assert from 'node:assert/strict';
import {supportedExternalProfiles} from '../sdk/external-profile-catalog.mjs';
import {packageProfileDescriptor,assertPackageContext} from '../server/package-profile.mjs';
import {preparePackage} from '../server/publications.mjs';
test('both immutable known profiles select exact Lean/foundation without treating v3 hex manifest as JSON',()=>{
 for(const d of supportedExternalProfiles()){
  const descriptor=packageProfileDescriptor(d.profileId,{manifest:d.manifest,enabled:false});
  assert.equal(descriptor.lean,'4.33.1');assert.equal(descriptor.foundationSha256,d.foundationSha256);assert.equal(descriptor.sourceGoalRelation,'not-verified');assert.ok(!descriptor.goals);
  const pkg=preparePackage({challengeSource:'def Oncm.goal : Prop := True',leanVersion:'1.0.0'},{profileId:d.profileId,descriptor});
  assert.equal(pkg.files.find(x=>x.path==='lean-toolchain').content,'leanprover/lean4:v4.33.1\n');
  assert.equal(JSON.parse(pkg.files.find(x=>x.path==='runner-input.json').content).profileId,d.profileId);
  assert.throws(()=>packageProfileDescriptor(d.profileId,{manifest:'changed'}),/manifest differs/);
 }
 assert.equal(packageProfileDescriptor('unknown',null),null);
});
test('server rejects mismatched captured actor/network/statement/profile while preserving explicit SDK calls',()=>{
 const d=supportedExternalProfiles()[0],account='0x'+'11'.repeat(20),registry='0x'+'22'.repeat(20),id='0x'+'33'.repeat(32),goal='0x'+'44'.repeat(32);
 const context={chainId:31373,chainInstance:'a',registry,profileId:d.profileId,statement:{id,goalHash:goal,profileId:d.profileId}};
 const expectedContext={account,chainId:31373,chainInstance:'a',registry,statementId:id,goalHash:goal,profileId:d.profileId};
 const input={statementId:id,profileId:d.profileId,expectedContext};assert.doesNotThrow(()=>assertPackageContext(input,context,account));assert.doesNotThrow(()=>assertPackageContext({},context,account));
 for(const field of Object.keys(expectedContext))assert.throws(()=>assertPackageContext({...input,expectedContext:{...expectedContext,[field]:'changed'}},context,account),/context changed/);
 assert.throws(()=>assertPackageContext({...input,statementId:'another'},context,account),/request route/);
 assert.throws(()=>assertPackageContext({...input,profileId:'another'},context,account),/immutable profile/);
});
