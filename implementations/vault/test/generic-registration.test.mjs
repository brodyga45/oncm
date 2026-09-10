import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,toUtf8Bytes} from 'ethers';
import {genericRegistrationFields} from '../web/generic-registration.mjs';
const origin={repository:'https://example.org/'+'r'.repeat(1950),commit:'a'.repeat(40),path:'p'.repeat(1000),declaration:'Oncm.goal'};
const review={genericBundle:true,originalVerified:true,bridgeVerified:true,outcome:0,bundleSha256:'a'.repeat(64),goalExport:{sha256:'b'.repeat(64),bytes:1024*1024},imageId:'0x'+'c'.repeat(64),source:{text:'Author text',sha256:'d'.repeat(64),origin},metadata:{title:'Author title'}};
test('complete large origin stays in bundle while exact digest fits registry1500bytes',()=>{
 const fields=genericRegistrationFields(review),m=JSON.parse(fields.manifest);
 assert.ok(toUtf8Bytes(fields.manifest).length<=1500);assert.equal(m.sourceGoalRelation,'not-verified');
 assert.equal(m.sourceOriginSha256,sha256(toUtf8Bytes(JSON.stringify(origin))).slice(2));assert.equal(fields.source,'Author text');
 assert.equal(review.source.origin.repository,origin.repository);
});
test('source is optional, an unverified or outcome proof cannot populate registration',()=>{
 const fields=genericRegistrationFields({...review,source:null,metadata:{}});assert.equal(fields.source,'');assert.equal(fields.title,'');
 for(const patch of [{originalVerified:false},{bridgeVerified:false},{outcome:1},{genericBundle:false}])assert.throws(()=>genericRegistrationFields({...review,...patch}));
});
