import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {fileURLToPath} from 'node:url';import {ensureProductionArtifacts} from '../scripts/production-bootstrap.mjs';
import {metadataIpfsDigest} from '../scripts/metadata-ipfs.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),manifest=JSON.parse(fs.readFileSync(path.join(app,'production/manifest.json')));
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'vault-production-'));fs.cpSync(path.join(app,'production'),path.join(root,'production'),{recursive:true});for(const pin of manifest.sourcePins){const target=path.join(root,pin.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,pin.path),target);}return{root,close:()=>fs.rmSync(root,{recursive:true,force:true})};}
test('fresh source copy restores exactly27 production artifacts without compiler/mock/overwrite',()=>{
 const h=fixture();try{assert.deepEqual(ensureProductionArtifacts(h.root),{restored:27,verified:27,sourcePins:181});assert.equal(ensureProductionArtifacts(h.root).restored,0);const files=fs.readdirSync(path.join(h.root,'.state/artifacts'));assert.equal(files.length,27);assert.ok(files.every(x=>!/Test|Mock|Unconfigured/.test(x)));}finally{h.close();}
});
test('source/ABI bytecode tampering and divergent existing artifacts stop before restoring anything',()=>{
 for(const change of ['source','artifact','existing']){const h=fixture();try{
  if(change==='source')fs.appendFileSync(path.join(h.root,'contracts/Protocol.sol'),'\n');
  else if(change==='artifact')fs.appendFileSync(path.join(h.root,'production/artifacts/TrueToken.json'),' ');
  else{fs.mkdirSync(path.join(h.root,'.state/artifacts'),{recursive:true});fs.writeFileSync(path.join(h.root,'.state/artifacts/TrueToken.json'),'wrong');}
  assert.throws(()=>ensureProductionArtifacts(h.root),/differs/);assert.ok(!fs.existsSync(path.join(h.root,'.state/artifacts/Vault.json')));
 }finally{h.close();}}
});
test('standard UnixFS metadata digest matches embedded provenance for every compiled production artifact',()=>{
 for(const pin of manifest.artifacts.filter(x=>x.metadataSha256)){
  const metadata=fs.readFileSync(path.join(app,'production/metadata',pin.name+'.json'),'utf8');assert.equal(metadataIpfsDigest(metadata),pin.metadataIpfsDigest);
  assert.notEqual(metadataIpfsDigest(metadata+' '),pin.metadataIpfsDigest);
 }
 assert.throws(()=>metadataIpfsDigest('x'.repeat(262145)),/bound/);
});
