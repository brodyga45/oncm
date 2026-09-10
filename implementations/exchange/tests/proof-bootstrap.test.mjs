import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ensureProofBootstrap} from '../scripts/proof-bootstrap.mjs';
const root=path.resolve(import.meta.dirname,'..');
function temporary(fn){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'exchange-bootstrap-'));
 try{for(const file of ['proof/manifest.json','proof/bootstrap-deployment.json','proof/bootstrap/LeanProofBridge.json']){const to=path.join(temp,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,file),to);}return fn(temp);}finally{fs.rmSync(temp,{recursive:true,force:true});}
}
test('Tracked-only bootstrap restores original verifier descriptor without native/prover binaries',()=>temporary(temp=>{
 const r=ensureProofBootstrap(temp);assert(r.bootstrapCreated);assert.equal(r.artifact,'bootstrap/LeanProofBridge.json');
 const first=fs.readFileSync(path.join(temp,'proof/deployment.json'));
 assert.equal(ensureProofBootstrap(temp).bootstrapCreated,false);assert.deepEqual(fs.readFileSync(path.join(temp,'proof/deployment.json')),first);
 assert(!fs.existsSync(path.join(temp,'proof/bin')));
}));
test('Modified manifest, image/profile or verifier bytes fail before descriptor materialization',()=>{
 for(const file of ['proof/manifest.json','proof/bootstrap-deployment.json','proof/bootstrap/LeanProofBridge.json'])temporary(temp=>{
  const p=path.join(temp,file),data=JSON.parse(fs.readFileSync(p));
  if(file.endsWith('manifest.json'))data.profileId='0x'+'11'.repeat(32);
  else if(file.endsWith('bootstrap-deployment.json'))data.args[0]='0x'+'11'.repeat(32);
  else data.bytecode+='00';
  fs.writeFileSync(p,JSON.stringify(data));assert.throws(()=>ensureProofBootstrap(temp));assert(!fs.existsSync(path.join(temp,'proof/deployment.json')));
 });
});
test('Existing runtime descriptor is never silently relabelled or overwritten',()=>temporary(temp=>{
 ensureProofBootstrap(temp);const p=path.join(temp,'proof/deployment.json'),d=JSON.parse(fs.readFileSync(p));d.profileId='0x'+'11'.repeat(32);fs.writeFileSync(p,JSON.stringify(d));const bytes=fs.readFileSync(p);
 assert.throws(()=>ensureProofBootstrap(temp),/differs/);assert.deepEqual(fs.readFileSync(p),bytes);
}));
