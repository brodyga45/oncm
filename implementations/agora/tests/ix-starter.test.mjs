import test from 'node:test';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {ixStarterFixtures} from '../server/ix-starter.mjs';
import {sourceDraft,runnerFixtureId} from '../src/import-draft.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('three pinned Ix drafts are independently loadable and never certified fixtures',()=>{
 const items=ixStarterFixtures(root);assert.equal(items.length,3);
 for(const item of items){
  assert.equal(item.commit,'4c91254346284dcd984f1940f2c527114b1c5190');
  assert.equal(item.status,'imported-source');assert.equal(item.validation.native,'passed-v3');assert.match(item.validation.nativeLabel,/Lean \+ NanoDa/);assert.match(item.validation.goalHash,/^0x[0-9a-f]{64}$/);
  assert.equal(item.validation.zk,'not-generated');assert.equal(runnerFixtureId(item),undefined);
  assert.equal(sourceDraft(item).registration,null);assert.match(sourceDraft(item).source,/namespace Oncm/);
  assert.equal(item.registrationCertificate,undefined);assert.equal(item.goalHash,undefined);
  assert.ok(item.files['LICENSE-MIT']);assert.ok(item.files['LICENSE-APACHE']);
 }
 assert.match(items[0].mathKind,/Standard Lean Nat/);
 assert.match(items[1].mathKind,/Custom Peano/);assert.match(items[2].source,/theorem tnAddSucc/);
 assert.equal(runnerFixtureId({id:'legacy-fixture'}),'legacy-fixture');
 // Untrusted source-package metadata cannot smuggle a registration certificate.
 assert.equal(sourceDraft({...items[0],registrationCertificate:'0xfake'}).registration,null);
});
test('tampered independent bundle is rejected before source is offered',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'agora-ix-test-'));
 try{
  fs.cpSync(path.join(root,'imports/ix-starter'),path.join(temp,'imports/ix-starter'),{recursive:true});
  assert.equal(ixStarterFixtures(temp).length,3);
  fs.appendFileSync(path.join(temp,'imports/ix-starter/packages/nat-reflexivity/Oncm.lean'),'\n--changed');
  assert.throws(()=>ixStarterFixtures(temp),/integrity mismatch/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
