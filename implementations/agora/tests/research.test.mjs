import test from 'node:test';import assert from 'node:assert/strict';import {createResearchStore} from '../server/research.mjs';
const a='0x1111111111111111111111111111111111111111',b='0x2222222222222222222222222222222222222222';
test('private reading lists and immutable Lean revisions are isolated by SIWE owner',()=>{
 let persisted;let db={};let s=createResearchStore(db,()=>persisted=JSON.stringify(db));s.saveBookmark(a,'goal',{notes:'Try induction'});assert.equal(s.shelf(b).length,0);assert.throws(()=>s.saveBookmark(a,'goal',{owner:b,notes:'spoof'}),/signed-in wallet/);s.saveBookmark(a,'goal',{notes:'Try a stronger induction hypothesis'});assert.equal(s.shelf(a).length,1);
 const r=s.saveRevision(a,{title:'First draft',source:'def goal : Prop := True'});const r2=s.saveRevision(a,{title:'Second draft',source:'def goal : Prop := 1 = 1',basedOn:r.id});assert.throws(()=>s.saveRevision(b,{title:'Copy hidden draft',source:'x',basedOn:r.id}),/does not belong/);assert.equal(s.revisions(a)[1].source,r.source);assert.notEqual(r2.sourceHash,r.sourceHash);
 db=JSON.parse(persisted);s=createResearchStore(db,()=>{});assert.equal(s.revisions(a)[0].basedOn,r.id);assert.equal(s.revisions(b).length,0);assert.equal(s.shelf(a)[0].notes,'Try a stronger induction hypothesis');s.removeBookmark(a,'goal');assert.equal(s.shelf(a).length,0);
});
