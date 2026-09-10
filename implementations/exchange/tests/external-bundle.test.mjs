import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AbiCoder,encodeBase64,sha256,toUtf8Bytes} from 'ethers';
import {inspectExternalBundle,parseBoundedJSON,canonicalGoalBoundary,EXTERNAL_BUNDLE_LIMITS} from '../sdk/external-bundle.mjs';
const directory=new URL('../proof/profiles/perf05/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,directory));
import {supportedExternalProfiles} from '../sdk/external-profile-catalog.mjs';
const profile=supportedExternalProfiles().find(p=>p.id==='perf05');
const options={trustedProfile:profile,foundationBytes:read('fixtures/foundation.ndjson')};
const abi=AbiCoder.defaultAbiCoder();
function wrap(name='true-registration'){
 const kind=name.startsWith('true-')?'true':'false',goal=read(`fixtures/${kind}-goal.ndjson`);
 const text=read(`fixtures/Oncm${kind==='true'?'True':'False'}.lean`).toString('utf8');
 return {format:'oncm-external-certificate-bundle-v1',artifact:JSON.parse(read('certificates/'+name+'.json')),
  goalExport:{base64:encodeBase64(goal),sha256:sha256(goal).slice(2),bytes:goal.length},
  source:{text,sha256:sha256(toUtf8Bytes(text)).slice(2)},metadata:{title:'External package',description:'Author-supplied description'}};
}
const copy=x=>structuredClone(x);
const inspect=x=>inspectExternalBundle(x,options);
function rebindGoal(bundle,goal){
 bundle.goalExport={base64:encodeBase64(goal),sha256:sha256(goal).slice(2),bytes:goal.length};
 bundle.artifact.goalHash=sha256(goal);
 const fields=abi.decode(['bytes32','bytes32','bytes32','uint256'],bundle.artifact.journal);
 bundle.artifact.journal=abi.encode(['bytes32','bytes32','bytes32','uint256'],[fields[0],sha256(goal),fields[2],fields[3]]);
 bundle.artifact.certificate=abi.encode(['bytes','bytes'],[bundle.artifact.evmSeal,bundle.artifact.journal]);
}
test('four actual CI records bind their exact bytes without a theorem catalog',()=>{
 for(const name of ['true-registration','true-proof','false-registration','false-refutation']){
  const b=wrap(name),result=inspect(JSON.stringify(b));
  assert.equal(result.certificate,b.artifact.certificate);assert.equal(result.goalHash,b.artifact.goalHash);
  assert.equal(result.outcome,b.artifact.outcome);assert.equal(result.sourceGoalRelation,'not-verified');
  assert.equal(result.cryptographicStatus,'not-verified','transport parsing is not pairing verification');
 }
});
test('artifact profile/case labels and source descriptions are provenance, never fixture authority',()=>{
 const b=wrap();b.artifact.profile='custom imported research';b.artifact.case='different label';
 b.source.text='This text does not describe the theorem.';b.source.sha256=sha256(toUtf8Bytes(b.source.text)).slice(2);
 const result=inspect(b);assert.equal(result.provenance.caseLabel,'different label');
 assert.equal(result.sourceGoalRelation,'not-verified');assert.equal(result.source.text,b.source.text);
 delete b.source;delete b.metadata;assert.equal(inspect(b).source,null);
});
test('unknown goal with matching transport is NOT accepted as a cryptographic proof',()=>{
 const b=wrap(),goal=read('fixtures/true-goal.ndjson');
 // Add valid JSON whitespace to create new exact canonical bytes and a new hash.
 // The retained real seal DOES NOT prove the changed journal: parser must label it unverified.
 const prefix=options.foundationBytes.length;
 const altered=Buffer.concat([goal.subarray(0,prefix),Buffer.from(' '),goal.subarray(prefix)]);
 rebindGoal(b,altered);const result=inspect(b);
 assert.notEqual(result.goalHash,wrap().artifact.goalHash);
 assert.equal(result.cryptographicStatus,'not-verified');
});
test('every exact profile/image/goal/outcome and journal word is enforced',()=>{
 for(const patch of [{profileId:'0x'+'11'.repeat(32)},{imageId:'0x'+'22'.repeat(32)},
  {goalHash:'0x'+'33'.repeat(32)},{outcome:1},{outcome:'0'},{outcome:3},{receiptKind:'Succinct'}]){
  const b=wrap();Object.assign(b.artifact,patch);assert.throws(()=>inspect(b));
 }
 for(let word=0;word<4;word++){
  const b=wrap(),bytes=Buffer.from(b.artifact.journal.slice(2),'hex');bytes[word*32]^=1;
  b.artifact.journal='0x'+bytes.toString('hex');b.artifact.certificate=abi.encode(['bytes','bytes'],[b.artifact.evmSeal,b.artifact.journal]);
  assert.throws(()=>inspect(b),/Journal/);
 }
});
test('raw/selected seals, parameters and canonical ABI must agree exactly',()=>{
 for(const patch of [{rawSeal:wrap().artifact.rawSeal.slice(0,-2)},
  {evmSeal:'0x00000000'+wrap().artifact.rawSeal.slice(2)},
  {certificate:wrap().artifact.certificate+'00'},
  {verifierParameters:'0x'+'aa'.repeat(32)}]){
  const b=wrap();Object.assign(b.artifact,patch);assert.throws(()=>inspect(b));
 }
});
test('base64/size/SHA, foundation bytes and exact goal boundary are checked',()=>{
 for(const change of [b=>b.goalExport.bytes++,b=>b.goalExport.sha256='0'.repeat(64),
  b=>b.goalExport.base64+='\n',b=>b.goalExport.base64=' '+b.goalExport.base64]){
  const b=wrap();change(b);assert.throws(()=>inspect(b));
 }
 const badFoundation=Buffer.from(options.foundationBytes);badFoundation[1]^=1;
 assert.throws(()=>inspectExternalBundle(wrap(),{...options,foundationBytes:badFoundation}),/foundation asset/);
 const b=wrap(),goal=read('fixtures/true-goal.ndjson');goal[0]=32;rebindGoal(b,goal);
 assert.throws(()=>inspect(b),/foundation prefix/);
 const trailing=wrap();rebindGoal(trailing,read('fixtures/true-proof.ndjson'));
 assert.throws(()=>inspect(trailing),/end exactly/);
});
test('canonical structural goal cannot be replaced by a dotted display alias',()=>{
 const original=read('fixtures/true-goal.ndjson').toString('utf8');
 const alias=original.replace('"pre":6,"str":"goal"','"pre":0,"str":"Oncm.goal"');
 assert.notEqual(alias,original);assert.throws(()=>canonicalGoalBoundary(toUtf8Bytes(alias)),/Missing structural/);
 const duplicate=original+original.trimEnd().split('\n').at(-1)+'\n';
 assert.throws(()=>canonicalGoalBoundary(toUtf8Bytes(duplicate)),/Duplicate canonical/);
 assert.throws(()=>canonicalGoalBoundary(toUtf8Bytes(original.trimEnd())),/complete newline/);
});
test('source byte identity is required but never upgraded to source-to-goal semantics',()=>{
 const b=wrap();b.source.text+='changed';assert.throws(()=>inspect(b),/Source SHA256/);
 const origin={repository:'https://github.com/example/research',commit:'a'.repeat(40),path:'Goal.lean',declaration:'Oncm.goal'};
 const good=wrap();good.source.origin=origin;assert.equal(inspect(good).sourceGoalRelation,'not-verified');
 for(const patch of [{commit:'main'},{path:'../Goal.lean'},{repository:'https://user:pass@github.com/repo'},
  {path:'/absolute.lean'},{path:'folder//Goal.lean'}]){
  const bad=wrap();bad.source.origin={...origin,...patch};assert.throws(()=>inspect(bad));
 }
});
test('JSON rejects duplicate decoded keys, trailing data, unpaired Unicode and nonfinite numbers',()=>{
 for(const raw of ['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{} {}','{"a":1e999}',
  '{"\\ud800":0}','{"a":"\\ud800"}', '['.repeat(66)+'0'+']'.repeat(66)])
  assert.throws(()=>parseBoundedJSON(raw));
 assert.deepEqual(parseBoundedJSON('{"x":[null,false,1.2e3,"α"]}'),{x:[null,false,1200,'α']});
});
test('independent byte limits and strict outer/source/metadata fields fail closed',()=>{
 const b=wrap();b.source.text='x'.repeat(EXTERNAL_BUNDLE_LIMITS.source+1);b.source.sha256=sha256(toUtf8Bytes(b.source.text)).slice(2);
 assert.throws(()=>inspect(b),/Source exceeds/);
 const other=wrap();other.sourceGoalRelation='verified';assert.throws(()=>inspect(other),/fields/);
 const metadata=wrap();metadata.metadata.theoremVerified=true;assert.throws(()=>inspect(metadata),/Metadata fields/);
 assert.throws(()=>parseBoundedJSON(' '.repeat(EXTERNAL_BUNDLE_LIMITS.wrapper+1)),/limit/);
});
