import test from 'node:test';import assert from 'node:assert/strict';
import {snapshotDraft,snapshotDraftReset,createSnapshotImport} from '../web/snapshot-draft.mjs';
const record=(source='theorem X : True := True.intro')=>({source,repository:'https://github.com/owner/repo',commit:'a'.repeat(40),challengePath:'Challenge.lean'});
const wait=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('Imported B cannot inherit registration/outcome/fixture/profile/old-job readiness from verified A',async()=>{
 let state={certificate:'old',registrationCertificate:'old',profileId:'old',goalHash:'old',fixtureId:'shortcut',latestJob:{id:'old'},registrationImport:{ready:true}};
 const ctl=createSnapshotImport({reset:fields=>state={...state,...fields},accept:fields=>state={...state,...fields}}),d=wait();ctl.setContext({account:'a',client:1});const done=ctl.load(()=>d.promise,'4.33.1');
 for(const k of ['certificate','registrationCertificate','profileId','goalHash','fixtureId'])assert.equal(state[k],'');assert.equal(state.latestJob,undefined);assert.equal(state.registrationImport,null);
 d.resolve(record('new B'));await done;assert.equal(state.source,'new B');assert.equal(state.snapshotInfo.sourceGoalRelation,'not-verified');assert.equal(state.profileId,'');
});
test('Late imported A cannot overwrite B; wallet/context ABA and manual input invalidate pending results',async()=>{
 let state;const ctl=createSnapshotImport({reset:()=>{},accept:x=>state=x}),client={};ctl.setContext({account:'A',client});const a=wait(),b=wait(),pa=ctl.load(()=>a.promise,'4.33.1'),pb=ctl.load(()=>b.promise,'4.33.1');b.resolve(record('B'));assert(await pb);a.resolve(record('A'));assert.equal(await pa,false);assert.equal(state.source,'B');
 const c=wait(),pc=ctl.load(()=>c.promise,'4.33.1');ctl.setContext({account:'B',client});ctl.setContext({account:'A',client});c.resolve(record('stale'));assert.equal(await pc,false);
 const d=wait(),pd=ctl.load(()=>d.promise,'4.33.1');ctl.invalidate();d.resolve(record('manual'));assert.equal(await pd,false);
});
test('Version equality is not dependency/kernel verification; missing and different versions are distinct',()=>{
 assert.equal(snapshotDraft(record(),'4.33.1').snapshotInfo.compatibility,'unknown');
 for(const [version,status]of [['4.33.1','version-matches-only'],['4.19.0','incompatible']]){const r=snapshotDraft({...record(),files:[{path:'x/lean-toolchain',content:'leanprover/lean4:v'+version}]},'4.33.1');assert.equal(r.snapshotInfo.compatibility,status);assert.equal(r.snapshotInfo.dependenciesChecked,false);assert.equal(r.profileId,'');}
});
test('Failed import has already revoked old readiness and cannot supply a success record',async()=>{let reset=false,accepted=false;const ctl=createSnapshotImport({reset:()=>reset=true,accept:()=>accepted=true});await assert.rejects(ctl.load(async()=>{throw Error('HTTP404');},'4.33.1'),/HTTP404/);assert(reset);assert(!accepted);assert.equal(snapshotDraftReset().registrationImport,null);});

test('Late failed A does not overwrite B success or its error state',async()=>{let fail;const a=new Promise((_,reject)=>fail=reject);let accepted;const ctl=createSnapshotImport({reset:()=>{},accept:x=>accepted=x});const old=ctl.load(()=>a,'4.33.1');await ctl.load(async()=>record('B'),'4.33.1');fail(Error('late A'));assert.equal(await old,false);assert.equal(accepted.source,'B');});
