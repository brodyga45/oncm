import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decodeAbiParameters,encodeAbiParameters,parseAbiParameters,zeroAddress,zeroHash} from 'viem';

const bytesPair=parseAbiParameters('bytes,bytes');
const journalTypes=parseAbiParameters('bytes32,bytes32,bytes32,uint256');
const hash=data=>'0x'+createHash('sha256').update(data).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function loadExternalBundle(root){
 const dir=path.join(root,'proof/additional-profiles/perf05');
 const pins=JSON.parse(fs.readFileSync(path.join(dir,'bundle-pins.json')));
 for(const [file,digest] of Object.entries(pins))if(hash(fs.readFileSync(path.join(dir,file)))!==`0x${digest}`)throw Error('Additional-profile source bundle hash mismatch');
 const profile=JSON.parse(fs.readFileSync(path.join(dir,'profile.json')));
 const fixtures=Object.entries(profile.fixtures).map(([name,f])=>{
  const source=fs.readFileSync(path.join(dir,f.source),'utf8');
  if(hash(fs.readFileSync(path.join(dir,`fixtures/${name}-goal.ndjson`)))!==f.goalHash)throw Error('Pinned goal export mismatch');
  return{name,source,sourceHash:hash(Buffer.from(source)),goalHash:f.goalHash};
 });
 return{profile,fixtures,registration:JSON.parse(fs.readFileSync(path.join(dir,'registration.json'))),manifestHash:hash(fs.readFileSync(path.join(dir,'profile.json')))};
}
export function validateExternalArtifact(artifact,bundle,statement){
 if(artifact?.format!=='oncm-real-groth16-ci-v1')throw Error('Expected CI certificate format oncm-real-groth16-ci-v1');
 const p=bundle.profile;
 if(!same(artifact.profileId,p.profileId)||!same(artifact.imageId,p.imageId))throw Error('Certificate profile/image mismatch; v3 and perf05 are distinct');
 if(![0,1,2].includes(artifact.outcome))throw Error('Invalid certificate outcome');
 const fixture=bundle.fixtures.find(f=>same(f.goalHash,artifact.goalHash));
 if(!fixture)throw Error('This import supports only the exact published perf05 goal exports');
 const expectedCase=artifact.outcome===0?`${fixture.name}-registration`:artifact.outcome===1?'true-proof':'false-refutation';
 if(artifact.profile!=='perf05'||artifact.receiptKind!=='Groth16'||artifact.case!==expectedCase
   ||(artifact.outcome===1&&fixture.name!=='true')||(artifact.outcome===2&&fixture.name!=='false'))throw Error('CI case/profile/receipt metadata mismatch');
 const parameters='0x73c457ba541936f0d907daf0c7253a39a9c5c427c225ba7709e44702d3c6eedc';
 if(!same(artifact.verifierParameters,parameters)||!/^0x[0-9a-fA-F]{512}$/.test(artifact.rawSeal??'')
   ||!same(artifact.evmSeal,parameters.slice(0,10)+artifact.rawSeal.slice(2)))throw Error('CI verifier parameters or raw seal mismatch');
 if(typeof artifact.certificate!=='string'||artifact.certificate.length>4096)throw Error('Invalid certificate size');
 const [seal,journal]=decodeAbiParameters(bytesPair,artifact.certificate);
 if(seal.length!==522||journal.length!==258||!same(encodeAbiParameters(bytesPair,[seal,journal]),artifact.certificate))throw Error('Noncanonical certificate encoding');
 const [domain,goal,profile,outcome]=decodeAbiParameters(journalTypes,journal);
 if(!same(domain,hash(Buffer.from('ONCM_LEAN_CLAIM_V1')))||!same(goal,artifact.goalHash)||!same(profile,p.profileId)||outcome!==BigInt(artifact.outcome))throw Error('Certificate journal binding mismatch');
 if(!same(journal,artifact.journal)||!same(seal,artifact.evmSeal))throw Error('Artifact seal/journal mismatch');
 if(artifact.outcome!==0&&!statement)throw Error('Select a registered statement before importing a settlement certificate');
 if(statement&&(!same(statement.goalHash,goal)||!same(statement.profileId,profile)||statement.kind!==0||statement.outcome!==0))throw Error('Selected statement does not match this open mathematical goal');
 return{fixture,certificate:artifact.certificate,goalHash:goal,profileId:profile,outcome:artifact.outcome};
}
export async function verifyExternalArtifact(artifact,{bundle,statement,bridge,abi,client}){
 const result=validateExternalArtifact(artifact,bundle,statement);
 if(!bridge||same(bridge,zeroAddress))throw Error('Additional bridge has not been deployed');
 const image=await client.readContract({address:bridge,abi,functionName:'imageId'});
 const profile=await client.readContract({address:bridge,abi,functionName:'profileId'});
 if(!same(image,bundle.profile.imageId)||!same(profile,result.profileId))throw Error('Onchain immutable bridge binding mismatch');
 const accepted=await client.readContract({address:bridge,abi,functionName:result.outcome===0?'verifyGoal':'verify',args:result.outcome===0?[result.goalHash,result.profileId,result.certificate]:[statement.id??zeroHash,result.goalHash,result.profileId,result.outcome,result.certificate]});
 if(accepted!==true)throw Error('Original onchain LeanProofBridge rejected the certificate');
 return{...result,status:'verified-external',source:result.fixture.source,sourceHash:result.fixture.sourceHash,imageId:bundle.profile.imageId,bridge,registrationCertificate:result.outcome===0?result.certificate:undefined,warning:'perf05 is a distinct zero-axiom profile, not the v3 Nat profile. No local prover was run.'};
}
