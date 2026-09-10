import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {validateSourcePackage,withFileHashes} from '../sdk/source-package.mjs';
import {sourceDraft} from '../src/import-draft.mjs';import {fixtures} from '../server/imports.mjs';
const source='import Init\nnamespace Oncm\ndef goal : Prop := True\nend Oncm\n';
const fixture=()=>withFileHashes({source,sourceFile:'Statement.lean',files:{'Statement.lean':source,'lean-toolchain':'leanprover/lean4:v4.19.0\n'},goalHash:'0x'+'12'.repeat(32),metadata:{source,title:'Source package'}});
test('file integrity is checked separately from the semantic goal and certificate admission',()=>{
 const p=fixture(),d=sourceDraft({...p,registrationCertificate:'0x1234',artifacts:[{status:'verified'}]});
 assert.notEqual(d.integrity.sourceHash,p.goalHash);assert.equal(d.integrity.semanticGoal,'not-verified');assert.equal(d.integrity.certificate,'not-accepted');assert.equal(d.registration,null);assert.equal(d.source,source);
 assert.equal(validateSourcePackage({...p,sourceFile:undefined}).sourceFile,'Statement.lean');
});
test('tampered files, hashes, sources, paths, type and resource limits fail before draft use',()=>{
 for(const alter of [
 p=>p.files['Statement.lean']+='-- changed',p=>p.fileHashes['Statement.lean']='0x'+'00'.repeat(32),p=>delete p.fileHashes['lean-toolchain'],p=>p.fileHashes.extra=p.fileHashes['Statement.lean'],
 p=>p.source+='--changed',p=>p.sourceFile='absent.lean',p=>p.metadata.source='different',p=>p.metadata.sourceHash='0x'+'33'.repeat(32),p=>p.sourceHash='0x'+'33'.repeat(32),
 p=>p.files['Statement.lean']=3,p=>p.schemaVersion=1,p=>p.source='😀'.repeat(30000),p=>p.extra='x'.repeat(16*1024*1024),
 p=>{p.files['../escape.lean']=source;p.fileHashes['../escape.lean']=p.fileHashes['Statement.lean'];},
 p=>{Object.defineProperty(p.files,'__proto__',{enumerable:true,value:source});Object.defineProperty(p.fileHashes,'__proto__',{enumerable:true,value:p.fileHashes['Statement.lean']});},
 ]){const p=fixture();alter(p);assert.throws(()=>sourceDraft(p));}
 assert.throws(()=>sourceDraft({id:'nat-add-comm',source}));
});
test('trusted server normalizes its actual static and Ix catalogs, without trusting caller ids',()=>{
 const items=fixtures(fileURLToPath(new URL('..',import.meta.url)));assert.ok(items.length>=5);
 for(const p of items){assert.equal(sourceDraft(p).integrity.status,'verified-file-integrity');assert.equal(sourceDraft(p).registration,null);}
 const spoof={id:items[0].id,source:items[0].source};assert.throws(()=>sourceDraft(spoof),/schema/);
});

test('maximum externally accepted source/title survives source-package duplication and UTF-8 boundaries',()=>{
 const source='é'.repeat(256*1024),title='é'.repeat(90),raw=withFileHashes({schemaVersion:2,source,sourceFile:'Statement.lean',files:{'Statement.lean':source},metadata:{title,source},title});
 const result=sourceDraft(raw);assert.equal(result.source,source);assert.equal(result.title,title);assert.equal(result.registration,null);
 const escaped='\u0001'.repeat(300000),control=withFileHashes({source:escaped,files:{'Statement.lean':escaped},metadata:{source:escaped,title}});assert.equal(sourceDraft(JSON.parse(JSON.stringify(control))).source,escaped);
 assert.throws(()=>sourceDraft(withFileHashes({...raw,source:source+'é',files:{'Statement.lean':source+'é'},metadata:{source:source+'é',title}})),/512 KiB/);
 assert.throws(()=>sourceDraft({...raw,title:title+'é'}),/title/);
});
