import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fileURLToPath} from 'node:url';import {ensureProofDescriptor} from '../scripts/proof-bootstrap.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'vault-proof-bootstrap-'));fs.mkdirSync(path.join(root,'proof/artifacts'),{recursive:true});for(const file of ['bootstrap-deployment.json','artifacts/LeanProofBridge.json'])fs.copyFileSync(path.join(app,'proof',file),path.join(root,'proof',file));return{root,close:()=>fs.rmSync(root,{recursive:true,force:true})};}
test('missing ignored runtime descriptor restores exact tracked v3 constructor arguments without compilation',()=>{
 const h=fixture();try{const first=ensureProofDescriptor(h.root);assert.equal(first.mode,'restored-missing-descriptor');assert.equal(first.definition.profileId,'0x190eddca14d88c2af77ea74b7ba257dcb7f9236c1cf7c8002890a992332c485e');const before=fs.readFileSync(path.join(h.root,'proof/deployment.json'),'utf8');assert.equal(ensureProofDescriptor(h.root).mode,'verified-existing-descriptor');assert.equal(fs.readFileSync(path.join(h.root,'proof/deployment.json'),'utf8'),before);}finally{h.close();}
});
test('existing divergent descriptor is preserved and stops startup instead of silent migration',()=>{
 const h=fixture();try{ensureProofDescriptor(h.root);const file=path.join(h.root,'proof/deployment.json');const changed=JSON.stringify({artifact:'evil',args:[],profileId:'other',manifest:'other'});fs.writeFileSync(file,changed);assert.throws(()=>ensureProofDescriptor(h.root),/never overwritten/);assert.equal(fs.readFileSync(file,'utf8'),changed);}finally{h.close();}
});
test('missing/tampered artifact and mismatched immutable pins fail before local descriptor creation',()=>{
 for(const mutation of ['artifact','profile']){const h=fixture();try{if(mutation==='artifact')fs.appendFileSync(path.join(h.root,'proof/artifacts/LeanProofBridge.json'),' ');else{const file=path.join(h.root,'proof/bootstrap-deployment.json'),pin=JSON.parse(fs.readFileSync(file));pin.deployment.profileId='wrong';fs.writeFileSync(file,JSON.stringify(pin));}assert.throws(()=>ensureProofDescriptor(h.root),/differs/);assert.equal(fs.existsSync(path.join(h.root,'proof/deployment.json')),false);}finally{h.close();}}
});
