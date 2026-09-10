import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createSocialStore} from '../server/social.mjs';
const alice='0x1111111111111111111111111111111111111111',bob='0x2222222222222222222222222222222222222222',carol='0x3333333333333333333333333333333333333333';
test('SIWE principal owns profile/comments; votes change or remove without duplication; threaded sorting persists',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agora-social-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'store.json');let db={comments:[]};let store=createSocialStore(db,()=>fs.writeFileSync(file,JSON.stringify(db)));
 assert.throws(()=>store.updateProfile(alice,{address:bob,displayName:'Bob'}),/signed-in wallet/);
 store.updateProfile(alice,{displayName:'Ada',bio:'I study algebra.'});assert.equal(store.profile(alice).address,alice);
 assert.throws(()=>store.addComment(alice,'goal',{author:bob,text:'spoof'}),/signed-in wallet/);
 const a=store.addComment(alice,'goal',{text:'First approach'});const b=store.addComment(bob,'goal',{text:'Alternative approach'});assert.throws(()=>store.vote(alice,a.id,{value:1}),/own comment/);
 assert.equal(store.vote(bob,a.id,{value:1}).score,1);assert.equal(store.vote(bob,a.id,{value:1}).voteCount,1);assert.equal(store.vote(bob,a.id,{value:-1}).score,-1);assert.equal(store.vote(bob,a.id,{value:0}).voteCount,0);
 assert.throws(()=>store.vote(bob,a.id,{author:carol,value:1}),/signed-in wallet/);assert.throws(()=>store.vote(carol,a.id,{value:2}),/Vote must/);
 store.vote(carol,a.id,{value:1});const reply=store.addComment(bob,'goal',{text:'What about the base case?',parentId:a.id});assert.equal(reply.depth,1);assert.throws(()=>store.addComment(carol,'different',{text:'cross-market',parentId:a.id}),/same statement/);
 const sorted=store.comments('goal',{sort:'top',viewer:carol});assert.equal(sorted[0].id,a.id);assert.equal(sorted[1].id,reply.id);assert.equal(sorted[0].myVote,1);
 db=JSON.parse(fs.readFileSync(file));store=createSocialStore(db,()=>fs.writeFileSync(file,JSON.stringify(db)));assert.equal(store.profile(alice).displayName,'Ada');assert.equal(store.comments('goal',{sort:'top'})[0].score,1);assert.equal(store.profile(bob).commentCount,2);
 // Deterministic tie-breaker: identical timestamps and scores order by UUID.
 db.comments[0].createdAt=db.comments[1].createdAt;store.vote(carol,a.id,{value:0});const top=store.comments('goal',{sort:'top'}).filter(c=>!c.parentId);assert.deepEqual(top.map(c=>c.id),[a.id,b.id].sort());
});
test('Top/New rank roots only; sibling replies stay chronological even with higher scores',()=>{
 const row=(id,minute,parentId=null)=>({id,statementId:'goal',author:alice,text:id,parentId,createdAt:`2026-09-10T00:0${minute}:00Z`,history:[]});
 const db={comments:[row('old-root',0),row('late-reply',4,'old-root'),row('early-reply-b',1,'old-root'),row('early-reply-a',1,'old-root'),row('nested',3,'early-reply-a'),row('new-root',2)]};
 const store=createSocialStore(db,()=>{});store.vote(bob,'old-root',{value:1});store.vote(bob,'late-reply',{value:1});store.vote(carol,'late-reply',{value:1});
 assert.deepEqual(store.comments('goal',{sort:'top'}).map(c=>c.id),['old-root','early-reply-a','nested','early-reply-b','late-reply','new-root']);
 assert.deepEqual(store.comments('goal',{sort:'new'}).map(c=>c.id),['new-root','old-root','early-reply-a','nested','early-reply-b','late-reply']);
});
