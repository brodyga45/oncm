import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {parseAbi,sha256,zeroAddress,zeroHash} from 'viem';
import {inspectExternalBundle,parseBoundedJSON} from '../sdk/external-bundle.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const verifierParameters='0x73c457ba541936f0d907daf0c7253a39a9c5c427c225ba7709e44702d3c6eedc';
const originalAbi=parseAbi(['function verify(bytes seal, bytes32 imageId, bytes32 journalDigest) view']);
export function loadGenericProfiles(root){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'.local/deployment.json'))),additionalFile=path.join(root,'.local/additional-profile.json');
 const additional=fs.existsSync(additionalFile)?JSON.parse(fs.readFileSync(additionalFile)):{};
 return[
  {name:'v3 · Lean Nat kernel',descriptor:'proof/manifest.json',foundation:'proof/lean/foundation.ndjson',bridge:manifest.verifier,manifestHash:manifest.profileManifest},
  {name:'perf05 · zero-axiom propositional kernel',descriptor:'proof/additional-profiles/perf05/profile.json',foundation:'proof/additional-profiles/perf05/fixtures/foundation.ndjson',bridge:additional.bridge,manifestHash:additional.manifestHash},
 ].map(p=>{const descriptorBytes=fs.readFileSync(path.join(root,p.descriptor)),trustedProfile=JSON.parse(descriptorBytes),foundationBytes=new Uint8Array(fs.readFileSync(path.join(root,p.foundation)));
  if(p.manifestHash&&!same(p.manifestHash,'0x'+sha(descriptorBytes)))throw Error('Supported profile descriptor differs from deployment pin');
  if(sha(foundationBytes)!==trustedProfile.foundationSha256)throw Error('Supported foundation bytes differ from immutable profile pin');
  return{...p,trustedProfile:{...trustedProfile,verifierParameters,selector:verifierParameters.slice(0,10)},foundationBytes};});
}
/** This has no fixture list: compatible immutable profile + exact goal bytes + real crypto are mandatory. */
export async function verifyGenericCertificate(input,{profiles,client,registry,registryAbi,bridgeAbi,statement,blockNumber}){
 blockNumber??=await client.getBlockNumber?.();const read=request=>client.readContract({...request,...blockNumber!==undefined&&{blockNumber}});
 const artifact=typeof input==='string'?parseBoundedJSON(input).artifact:input?.artifact;
 const descriptor=profiles.find(p=>same(p.trustedProfile.profileId,artifact?.profileId));if(!descriptor)throw Error('Unsupported immutable proof profile; governance approval alone does not install a new import adapter');
 const result=inspectExternalBundle(input,{trustedProfile:descriptor.trustedProfile,foundationBytes:descriptor.foundationBytes});
 if(result.outcome!==0&&!statement)throw Error('Select the registered statement for a settlement certificate');
 if(statement&&(!same(statement.goalHash,result.goalHash)||!same(statement.profileId,result.profileId)||Number(statement.kind)!==0||Number(statement.outcome)!==0))throw Error('Selected statement does not match this open mathematical goal');
 const [bridge,manifestHash,enabled]=await read({address:registry,abi:registryAbi,functionName:'profiles',args:[result.profileId]});
 if(!descriptor.bridge||same(bridge,zeroAddress)||!same(bridge,descriptor.bridge)||!same(manifestHash,descriptor.manifestHash))throw Error('Governed profile is not installed with this trusted immutable bridge');
 const image=await read({address:bridge,abi:bridgeAbi,functionName:'imageId'}),profile=await read({address:bridge,abi:bridgeAbi,functionName:'profileId'});
 if(!same(image,result.imageId)||!same(profile,result.profileId))throw Error('Onchain immutable bridge binding mismatch');
 const original=await read({address:bridge,abi:bridgeAbi,functionName:'verifier'});if(same(original,zeroAddress))throw Error('Original verifier missing');
 // Explicit original verifier eth_call is independent of any JSON success label.
 await read({address:original,abi:originalAbi,functionName:'verify',args:[result.evmSeal,result.imageId,sha256(result.journal)]});
 const accepted=await read({address:bridge,abi:bridgeAbi,functionName:result.outcome===0?'verifyGoal':'verify',args:result.outcome===0?[result.goalHash,result.profileId,result.certificate]:[statement.id??zeroHash,result.goalHash,result.profileId,result.outcome,result.certificate]});
 if(accepted!==true)throw Error('Original onchain bridge rejected this certificate');
 return{...result,bundleDigestEncoding:typeof input==='string'?'exact-utf8-json':'json-stringify-object',source:result.source?.text??'',sourceSha256:result.source?.sha256??null,sourceOrigin:result.source?.origin??null,
  verificationBlock:blockNumber===undefined?null:String(blockNumber),status:'verified-external',cryptographicStatus:'verified-original-evm-and-bridge',sourceGoalRelation:'not-verified',generic:true,profileLabel:descriptor.name,bridge,originalVerifier:original,enabled:!!enabled,
  registrationCertificate:result.outcome===0?result.certificate:undefined,
  warning:'The exact goal export was accepted by the original EVM verifier and immutable bridge. Source byte integrity is separate: its correspondence to this goal was not compiled or verified. No local prover ran.'};
}
