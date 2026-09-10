import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {publishedCertificateCatalog,loadPublishedCertificate} from '../server/published-certificates.mjs';
import {loadExternalBundle,validateExternalArtifact} from '../server/external-certificates.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('four pinned CI choices load JSON only, retaining exact case and binding',()=>{
 const choices=publishedCertificateCatalog(root),bundle=loadExternalBundle(root);
 assert.deepEqual(choices.map(c=>c.id),['true-registration','false-registration','true-proof','false-refutation']);
 for(const choice of choices){
  const loaded=loadPublishedCertificate(root,choice.id);assert.equal(loaded.status,'loaded-unverified');assert.equal(loaded.certificate,undefined);
  const statement=choice.outcome?{id:'selected',goalHash:choice.goalHash,profileId:choice.profileId,kind:0,outcome:0}:undefined;
  assert.equal(validateExternalArtifact(loaded.artifact,bundle,statement).outcome,choice.outcome);
  assert.throws(()=>validateExternalArtifact({...loaded.artifact,case:'wrong-case'},bundle,statement));
  if(statement)assert.throws(()=>validateExternalArtifact(loaded.artifact,bundle,{...statement,goalHash:'0x'+'00'.repeat(32)}));
 }
 for(const id of ['../registration.json','registration.json','not-published'])assert.throws(()=>loadPublishedCertificate(root,id),/Unknown/);
});
test('changed certificate files and relabelled catalogue entries fail closed',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'agora-published-'));
 try{
  const dir=path.join(temp,'proof/additional-profiles/perf05');fs.cpSync(path.join(root,'proof/additional-profiles/perf05'),dir,{recursive:true});
  const manifest=path.join(dir,'published-certificates.json'),catalog=JSON.parse(fs.readFileSync(manifest));
  catalog.entries[3].outcome=1;fs.writeFileSync(manifest,JSON.stringify(catalog));
  assert.throws(()=>publishedCertificateCatalog(temp),/binding mismatch/);
  catalog.entries[3].outcome=2;fs.writeFileSync(manifest,JSON.stringify(catalog));
  fs.appendFileSync(path.join(dir,'false-refutation.json'),' ');
  assert.throws(()=>publishedCertificateCatalog(temp),/pin mismatch/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
