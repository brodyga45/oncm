import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,toUtf8Bytes} from 'ethers';
import {verifyExternalBundle} from '../sdk/external-registration.mjs';
import {selectExternalBundleProfile} from '../sdk/external-profile-catalog.mjs';
import {externalFixture} from './external-bundle-fixture.mjs';
function harness(){
 const input=externalFixture(),profile=selectExternalBundleProfile(input,input.artifact.profileId).descriptor,trace=[];
 const sdk={deployment:{verifier:'reference'},assertCurrent(){},provider:{getNetwork:async()=>({chainId:31372n}),send:async()=> '0xc9',getBlock:async n=>({number:n,hash:'0xblock'}),getCode:async(a,n)=>{trace.push(['code',a,n]);return '0x1234';}},contract:()=>({profiles:async(id,at)=>{trace.push(['profile',at]);return{verifier:'bridge',manifest:profile.manifest,newEnabled:true,resolutionEnabled:true};}})};
 const at=(name,args,value)=>{assert.equal(args.at(-1).blockTag,201);trace.push([name]);return value;};
 const contract=address=>address==='reference'?{verifier:async(...args)=>at('reference',args,'original')}:address==='original'?{
  SELECTOR:async(...args)=>at('selector',args,profile.selector),VERSION:async(...args)=>at('version',args,'3.0.0'),verify:{staticCall:async(...args)=>at('original pairings',args,undefined)}}:{
  verifier:async(...args)=>at('underlying',args,'candidateOriginal'),imageId:async(...args)=>at('image',args,profile.imageId),profileId:async(...args)=>at('profileId',args,profile.profileId),verifyGoal:async(...args)=>at('bridge goal',args,true),verify:async(...args)=>at('bridge outcome',args,true)};
 return{sdk,input,profile,trace,contract};
}
test('Generic verifier requires independent original acceptance before exact governed bridge at one block',async()=>{
 const h=harness(),raw=JSON.stringify(h.input,null,2);const r=await verifyExternalBundle(h.sdk,raw,{profileId:h.profile.profileId,outcome:0},h.contract);
 assert.equal(r.bundleSha256,sha256(toUtf8Bytes(raw)).slice(2));assert.equal(r.available,true);assert.equal(r.sourceGoalRelation,'not-verified');
 assert.equal(r.cryptographicStatus,'original-and-bridge-verified');assert(h.trace.findIndex(x=>x[0]==='original pairings')<h.trace.findIndex(x=>x[0]==='bridge goal'));
});
test('Unknown profile, crossed goal/outcome, changed manifest/runtime and expired wallet fail closed',async()=>{
 for(const change of [h=>({profileId:'0x'+'aa'.repeat(32),outcome:0}),h=>({profileId:h.profile.profileId,outcome:2}),h=>({profileId:h.profile.profileId,goalHash:'0x'+'aa'.repeat(32)})]){
  const h=harness();await assert.rejects(verifyExternalBundle(h.sdk,h.input,change(h),h.contract));
 }
 const manifest=harness();manifest.sdk.contract=()=>({profiles:async()=>({verifier:'bridge',manifest:'other'})});await assert.rejects(verifyExternalBundle(manifest.sdk,manifest.input,{profileId:manifest.profile.profileId},manifest.contract),/manifest/);
 const code=harness();code.sdk.provider.getCode=async a=>a==='original'?'0x1234':'0x9999';await assert.rejects(verifyExternalBundle(code.sdk,code.input,{profileId:code.profile.profileId},code.contract),/runtime/);
 const stale=harness();let count=0;stale.sdk.assertCurrent=()=>{if(++count>1)throw Error('Wallet changed');};await assert.rejects(verifyExternalBundle(stale.sdk,stale.input,{profileId:stale.profile.profileId},stale.contract),/Wallet changed/);
});
test('A forged CI success flag cannot replace a rejecting original verifier',async()=>{
 const h=harness();h.input.artifact.evmVerified=true;const contracts=a=>{const c=h.contract(a);if(a==='original')c.verify.staticCall=async()=>{throw Error('Invalid Groth16 proof');};return c;};
 await assert.rejects(verifyExternalBundle(h.sdk,h.input,{profileId:h.profile.profileId},contracts),/Invalid Groth16/);assert(!h.trace.some(x=>x[0]==='bridge goal'));
});
