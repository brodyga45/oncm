import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {encodeBase64,sha256,ZeroAddress} from 'ethers';
import {verifyExternalBundle} from '../sdk/external-certificates.mjs';
import {selectExternalBundleProfile,supportedExternalProfiles,mergeExternalProofCatalog} from '../sdk/external-profile-catalog.mjs';
const dir=new URL('../external-proofs/perf05/',import.meta.url),read=p=>fs.readFileSync(new URL(p,dir));
function bundle(name='true-registration'){
 const record=JSON.parse(read(name+'.json')),goal=read('fixtures/'+(name.startsWith('true')?'true':'false')+'-goal.ndjson');
 return {format:'oncm-external-certificate-bundle-v1',artifact:record,goalExport:{base64:encodeBase64(goal),sha256:sha256(goal).slice(2),bytes:goal.length}};
}
function harness({enabled=true,registered=true,invalidCrypto=false}={}){
 const b=bundle(),selected=selectExternalBundleProfile(b,b.artifact.profileId),calls=[],address=n=>'0x'+String(n).padStart(40,'0');
 const defaultBridge=address(1),original=address(2),bridge=address(3),inner=address(4),at=value=>async(...args)=>{assert.equal(args.at(-1).blockTag,147);return value;};
 return {calls,args:{...selected,descriptor:{...selected.descriptor,goals:[]},defaultBridge,candidateBridge:bridge,
  provider:{getNetwork:async()=>({chainId:31373n}),getBlock:async()=>({number:147,hash:'0x147'}),getCode:async()=> '0x1234'},
  registry:{profiles:at({verifier:registered?bridge:ZeroAddress,enabled,manifest:selected.descriptor.manifest})},
  contract:address=>address===original?{SELECTOR:at(selected.descriptor.selector),VERSION:at('3.0.0'),verify:{staticCall:async(...args)=>{calls.push(['original',...args]);if(invalidCrypto)throw Error('pairing rejected');}}}:
   {verifier:at(address===defaultBridge?original:inner),imageId:at(selected.descriptor.imageId),profileId:at(selected.descriptor.profileId),
    verifyGoal:async(...args)=>{calls.push(['goal',...args]);return true;},verify:async(...args)=>{calls.push(['proof',...args]);return true;}}
 }};
}
test('generic route uses exact original verifier then bridge without fixture goal lookup',async()=>{
 const h=harness(),result=await verifyExternalBundle(h.args);
 assert.deepEqual(h.calls.map(x=>x[0]),['original','goal']);assert.equal(result.readyForRegistration,true);
 assert.equal(result.genericBundle,true);assert.equal(result.cryptographicStatus,'original-and-bridge-verified');
 assert.equal(result.sourceGoalRelation,'not-verified');assert.equal(result.goal,undefined);
});
test('pairing failure is mandatory despite imported verified flags',async()=>{
 const h=harness({invalidCrypto:true});h.args.bundle.artifact.evmVerified=true;
 await assert.rejects(()=>verifyExternalBundle(h.args),/pairing rejected/);assert.equal(h.calls.length,1);
});
test('admission remains separate from existing generic settlement',async()=>{
 const h=harness({enabled:false});const registration=await verifyExternalBundle(h.args);
 assert.equal(registration.readyForRegistration,false);assert.equal(registration.readyForResolution,false);
 h.args.bundle=bundle('false-refutation');const proof=await verifyExternalBundle(h.args);
 assert.equal(proof.outcome,2);assert.equal(proof.readyForResolution,true);assert.equal(proof.readyForRegistration,false);
 assert.equal(h.calls.at(-1)[0],'proof');assert.equal(h.calls.at(-1)[4],2);
});
test('generic registry manifest mismatch and invalid bridge are rejected',async()=>{
 const h=harness();h.args.registry.profiles=async()=>({verifier:h.args.candidateBridge,enabled:true,manifest:'altered'});
 await assert.rejects(()=>verifyExternalBundle(h.args),/manifest differs/);
});
test('both pinned profile assets reproduce app-local foundation hashes and v3 deployment',()=>{
 assert.deepEqual(supportedExternalProfiles().map(x=>x.tag),['perf05','v3']);
 for(const descriptor of supportedExternalProfiles()){
  const selected=selectExternalBundleProfile({artifact:{profileId:descriptor.profileId}},descriptor.profileId);
  assert.equal(sha256(selected.foundationBytes).slice(2),descriptor.foundationSha256);
 }
 const v3=supportedExternalProfiles().find(x=>x.tag==='v3'),manifest=JSON.parse(fs.readFileSync(new URL('../proof/manifest.json',import.meta.url))),deployment=JSON.parse(fs.readFileSync(new URL('../proof/deployment.json',import.meta.url)));
 assert.equal(v3.imageId,manifest.imageId);assert.equal(v3.profileId,manifest.profileId);assert.equal(v3.manifest,deployment.manifest);
 assert.throws(()=>selectExternalBundleProfile(bundle(),v3.profileId),/selected/);
 const wrong='0x'+'12'.repeat(32);assert.throws(()=>selectExternalBundleProfile({artifact:{profileId:wrong}},wrong),/No installed/);
 const raw=JSON.stringify(bundle(),null,2)+'\n';
 assert.equal(selectExternalBundleProfile(raw,bundle().artifact.profileId).bundle,raw,'exact upload bytes survive profile selection');
});
test('remote catalogue cannot replace trusted profile/foundation policy',()=>{
 const descriptor=supportedExternalProfiles()[0];const rows=mergeExternalProofCatalog([{descriptor:{...descriptor,imageId:'hijack'},examples:[{key:'x'}]}]);
 assert.equal(rows[0].descriptor.imageId,descriptor.imageId);assert.equal(rows[0].examples.length,1);
 const bad=mergeExternalProofCatalog([{descriptor:{...descriptor,manifest:'changed'},deployment:{bridge:'bad'},examples:[]}]);
 assert.equal(bad[0].deployment,null);
});
