import test from 'node:test';import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadExternalBundle,validateExternalArtifact,verifyExternalArtifact} from '../server/external-certificates.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),bundle=loadExternalBundle(root),artifact=bundle.registration;
test('real CI registration binds only the pinned perf05 goal and exact source',()=>{
 const result=validateExternalArtifact(artifact,bundle);
 assert.equal(result.outcome,0);assert.equal(result.fixture.goalHash,artifact.goalHash);
 assert.match(result.fixture.source,/∀ P : Prop, P → P/);
});
test('profile, goal, outcome, image, ABI and journal edits cannot relabel a certificate',()=>{
 for(const update of [{profileId:'0x'+'01'.repeat(32)},{imageId:'0x'+'02'.repeat(32)},{goalHash:'0x'+'03'.repeat(32)},{outcome:1},{certificate:artifact.certificate+'00'},{journal:'0x'},{evmSeal:'0x'}])
  assert.throws(()=>validateExternalArtifact({...artifact,...update},bundle));
 assert.throws(()=>validateExternalArtifact(artifact,bundle,{id:'market',goalHash:artifact.goalHash,profileId:'v3',kind:0,outcome:0}));
});
test('JSON success claims never bypass original bridge verification',async()=>{
 const calls=[];const client={async readContract(req){calls.push(req.functionName);return req.functionName==='imageId'?bundle.profile.imageId:req.functionName==='profileId'?bundle.profile.profileId:false;}};
 await assert.rejects(verifyExternalArtifact({...artifact,evmVerified:true},{bundle,bridge:'0x'+'01'.repeat(20),abi:[],client}),/rejected/);
 assert.deepEqual(calls,['imageId','profileId','verifyGoal']);
});
test('CI envelope metadata must describe the exact Groth16 case',()=>{
 for(const update of [{profile:'v3'},{case:'false-registration'},{receiptKind:'Fake'},
  {verifierParameters:'0x'+'00'.repeat(32)},{rawSeal:'0x'},
  {rawSeal:'0x'+'00'.repeat(256)},{case:'false-refutation',outcome:2}])
  assert.throws(()=>validateExternalArtifact({...artifact,...update},bundle));
});
