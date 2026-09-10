// Read-only real EVM verification of the generic bundle route. No signer, sends,
// local prover, new market, deployment, or state-changing RPC method is used.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {AbiCoder,JsonRpcProvider,encodeBase64,sha256,toUtf8Bytes} from 'ethers';
import {createSDK} from '../sdk/index.mjs';
const base=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,base)),json=p=>JSON.parse(read(p));
const config=json('.state/deployment.json'),abis=json('.state/abis.json');
if(config.chainId!==31373||config.rpcUrl!=='http://127.0.0.1:9547')throw Error('Read-only QA limited to existing local Vault31373');
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1}),sdk=createSDK(config,abis,provider),coder=AbiCoder.defaultAbiCoder();
const descriptor=sdk.supportedExternalProfiles().find(p=>p.tag==='perf05');
const output={scope:'read-only actual original EVM + governed bridge; no proving or transactions',chainId:31373,results:[],negative:[]};
try{
 output.startBlock=(await provider.getBlock('latest')).number;
 fs.mkdirSync(new URL('external-proofs/generic-examples/',base),{recursive:true});
 let registration;
 for(const name of ['true-registration','true-proof','false-registration','false-refutation']){
  const kind=name.startsWith('true')?'true':'false',artifact=json('external-proofs/perf05/'+name+'.json'),goal=read(`external-proofs/perf05/fixtures/${kind}-goal.ndjson`),source=read(`external-proofs/perf05/fixtures/Oncm${kind==='true'?'True':'False'}.lean`).toString('utf8');
  const bundle={format:'oncm-external-certificate-bundle-v1',artifact,goalExport:{base64:encodeBase64(goal),sha256:sha256(goal).slice(2),bytes:goal.length},source:{text:source,sha256:sha256(toUtf8Bytes(source)).slice(2)},metadata:{title:`External ${kind} goal (published CI sample)`,description:'Exact previously published CI record wrapped in the generic input format; not a newly proved theorem.'}};
  const raw=JSON.stringify(bundle,null,2),r=await sdk.verifyExternalBundle(raw,{...descriptor,goals:[]});
  assert.equal(r.originalVerified,true);assert.equal(r.bridgeVerified,true);assert.equal(r.sourceGoalRelation,'not-verified');
  output.results.push({case:name,profileId:r.profileId,imageId:r.imageId,goalHash:r.goalHash,outcome:r.outcome,blockNumber:r.blockNumber,blockHash:r.blockHash,bundleSha256:r.bundleSha256,originalVerifier:r.originalVerifier,bridge:r.bridge,bridgeVerifier:r.bridgeVerifier,verifierCodeHash:r.verifierCodeHash,cryptographicStatus:r.cryptographicStatus,sourceGoalRelation:r.sourceGoalRelation,readyForRegistration:r.readyForRegistration,readyForResolution:r.readyForResolution});
  fs.writeFileSync(new URL('external-proofs/generic-examples/'+name+'.json',base),raw);
  if(name==='true-registration')registration=bundle;
 }
 async function reject(label,change){const b=structuredClone(registration);change(b);await assert.rejects(()=>sdk.verifyExternalBundle(b,descriptor));output.negative.push({label,rejected:true});}
 await reject('altered seal, canonical ABI and forged evmVerified flag rejected by real verifier',b=>{
  const bytes=Buffer.from(b.artifact.rawSeal.slice(2),'hex');bytes[3]^=1;b.artifact.rawSeal='0x'+bytes.toString('hex');b.artifact.evmSeal=descriptor.selector+b.artifact.rawSeal.slice(2);
  b.artifact.certificate=coder.encode(['bytes','bytes'],[b.artifact.evmSeal,b.artifact.journal]);b.artifact.evmVerified=true;
 });
 await reject('new self-consistent goal hash with old seal rejected by real verifier',b=>{
  const goal=Buffer.from(b.goalExport.base64,'base64'),foundationSize=1073,changed=Buffer.concat([goal.subarray(0,foundationSize),Buffer.from(' '),goal.subarray(foundationSize)]);
  b.goalExport={base64:encodeBase64(changed),sha256:sha256(changed).slice(2),bytes:changed.length};b.artifact.goalHash=sha256(changed);
  const words=coder.decode(['bytes32','bytes32','bytes32','uint256'],b.artifact.journal);
  b.artifact.journal=coder.encode(['bytes32','bytes32','bytes32','uint256'],[words[0],b.artifact.goalHash,words[2],words[3]]);
  b.artifact.certificate=coder.encode(['bytes','bytes'],[b.artifact.evmSeal,b.artifact.journal]);
 });
 const v3=sdk.supportedExternalProfiles().find(x=>x.tag==='v3'),registered=await sdk.registry.profiles(v3.profileId);
 assert.equal(registered.manifest,v3.manifest);output.v3={profileId:v3.profileId,imageId:v3.imageId,manifestMatches:true,enabled:registered.enabled,certificateTested:false};
 output.endBlock=(await provider.getBlock('latest')).number;assert.equal(output.endBlock,output.startBlock);
 fs.mkdirSync(new URL('evidence/generic-external/',base),{recursive:true});fs.writeFileSync(new URL('evidence/generic-external/real-evm.json',base),JSON.stringify(output,null,2));
 console.log(JSON.stringify({genuine:output.results.length,rejected:output.negative.length,start:output.startBlock,end:output.endBlock,v3:output.v3}));
}finally{provider.destroy();}
