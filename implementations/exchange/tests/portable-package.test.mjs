import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {sha256,toUtf8Bytes} from 'ethers';
import {preparePortablePackage,retainPackageMetadata} from '../web/portable-package.mjs';
import {externalFixture} from './external-bundle-fixture.mjs';
import {validatePublishedPackage} from '../api/package-validation.mjs';
import {readProofCatalog} from '../api/proof-catalog.mjs';
const root=path.resolve(import.meta.dirname,'..');
function portable(name='false-registration'){
 const b=externalFixture(name);
 return{schema:'exchange-lean-package-v1',source:b.source.text,sourceSha256:b.source.sha256,title:b.metadata.title,
  profileId:b.artifact.profileId,goalHash:b.artifact.goalHash,canonicalGoalExport:b.goalExport,externalCertificate:b.artifact,
  registrationCertificate:b.artifact.certificate,targetDeclaration:'Oncm.goal',sourceGoalRelation:'verified',
  files:[{path:'Challenge.lean',content:b.source.text,sha256:b.source.sha256}]};
}
test('Generic portable package roundtrips through actual API serializer in an isolated filesystem; readiness never restored',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'exchange-package-'));
 try{
  const server=fs.readFileSync(path.join(root,'api/server.mjs'),'utf8'),body=server.slice(server.indexOf('function storePackage(input)'),server.indexOf('app.post("/api/packages"'));
  assert(body.startsWith('function storePackage(input)'));
  const isolated={...fs,mkdirSync:(file,options)=>fs.mkdirSync(path.join(temp,file),options),writeFileSync:(file,...args)=>fs.writeFileSync(path.join(temp,file),...args)};
  const store=new Function('fs','crypto','readProofCatalog','root','validatePublishedPackage',body+';return storePackage;')(isolated,crypto,readProofCatalog,root,validatePublishedPackage);
  const original=portable(),saved=store(original),read=JSON.parse(fs.readFileSync(path.join(temp,'data/packages',saved.id,'package.json'),'utf8'));
  const r=preparePortablePackage(JSON.stringify(read),{fallbackProfileId:'0x'+'11'.repeat(32)});
  assert.equal(r.draft.profileId,original.profileId);assert.equal(r.draft.goalHash,original.goalHash);assert.equal(r.draft.source,original.source);
  assert.deepEqual(r.draft.canonicalGoalExport,original.canonicalGoalExport);assert.deepEqual(r.draft.files,original.files);
  assert.equal(r.certificate,'');assert.equal(r.draft.sourceGoalRelation,'not-verified');assert(r.requiresExternalVerification);
  assert.equal(JSON.parse(r.externalJSON).artifact.certificate,original.registrationCertificate);
  assert.match(r.status,/unverified draft/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('Goal-only generic package retains canonical bytes without source invention or fallback profile substitution',()=>{
 const p=portable();delete p.source;delete p.sourceSha256;delete p.files;
 const r=preparePortablePackage(p,{fallbackProfileId:'0x'+'11'.repeat(32)});
 assert.equal(r.draft.source,'');assert.equal(r.draft.profileId,p.profileId);assert.equal(r.certificate,'');
 assert.equal(JSON.parse(r.externalJSON).source,undefined);
});
test('Claimed source/file hashes and canonical profile/goal/certificate mismatches fail before draft adoption',()=>{
 for(const mutate of [p=>p.source+=' ',p=>p.files[0].content+=' ',p=>p.files.push({...p.files[0]}),p=>p.files[0].path='../secret',
  p=>p.profileId='0x'+'11'.repeat(32),p=>p.goalHash='0x'+'22'.repeat(32),p=>p.registrationCertificate+='00',p=>p.targetDeclaration='Other.goal']){
  const p=portable();mutate(p);assert.throws(()=>preparePortablePackage(p));
 }
});
test('Changed source with honestly recomputed hash remains provenance, never claimed source-to-goal verification',()=>{
 const p=portable();p.source='def unrelated : Nat := 7\n';p.sourceSha256=sha256(toUtf8Bytes(p.source)).slice(2);delete p.files;
 const r=preparePortablePackage(p);assert.equal(r.draft.source,p.source);assert.equal(r.draft.sourceGoalRelation,'not-verified');assert.equal(r.certificate,'');
});
test('Legacy source and Palomar drafts keep files/declarations but cannot reactivate a saved registration certificate',()=>{
 const p={source:'def proposition : Prop := True\n',sourceGoalRelation:'verified',targetDeclaration:'External.proposition',registrationCertificate:'0x1234',
  externalRef:{registry:'Palomar',repository:'org/repo',commit:'a'.repeat(40)},files:[{path:'project/Challenge.lean',content:'source'}]};
 const r=preparePortablePackage(p,{fallbackProfileId:'0x'+'11'.repeat(32)});
 assert.equal(r.draft.targetDeclaration,p.targetDeclaration);assert.deepEqual(r.draft.externalRef,p.externalRef);assert.deepEqual(r.draft.files,p.files);
 assert.equal(r.certificate,'');assert.equal(r.externalJSON,'');assert(r.requiresExternalVerification);assert.equal(r.draft.sourceGoalRelation,'not-verified');
});
test('Verification retains exact imported package files/provenance, never an older differently bound package',()=>{
 const original=portable(),adopted=preparePortablePackage(original).draft,verified={source:original.source,goalHash:original.goalHash,profileId:original.profileId,sourceGoalRelation:'not-verified'};
 assert.deepEqual(retainPackageMetadata(adopted,verified).files,original.files);
 for(const changed of [{...verified,source:'different'},{...verified,goalHash:'0x'+'33'.repeat(32)},{...verified,profileId:'0x'+'44'.repeat(32)}])assert.equal(retainPackageMetadata(adopted,changed).files,undefined);
});
