// Real original EVM eth_call only. Never signs, deploys, creates a market or proves.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {AbiCoder,encodeBase64,decodeBase64,sha256} from 'ethers';
import {ExchangeSDK} from '../sdk/index.mjs';
import {verifyExternalBundle} from '../sdk/external-registration.mjs';
import {createLocalProvider} from '../sdk/local-provider.mjs';
import {externalFixture} from './external-bundle-fixture.mjs';
import {selectExternalBundleProfile} from '../sdk/external-profile-catalog.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),d=read('data/deployment.json'),provider=createLocalProvider(d.rpc),sdk=new ExchangeSDK(provider,null,d,read('web/generated/abis.json'));
const before=await provider.send('eth_blockNumber',[]),results=[],abi=AbiCoder.defaultAbiCoder();
for(const name of ['true-registration','true-proof','false-registration','false-refutation']){
 const bundle=externalFixture(name),r=await verifyExternalBundle(sdk,JSON.stringify(bundle,null,2),{profileId:bundle.artifact.profileId,outcome:bundle.artifact.outcome});
 assert(r.originalVerified&&r.available);results.push({name,outcome:r.outcome,goalHash:r.goalHash,block:r.verifiedAtBlock,original:r.originalVerifier,bridge:r.verifier,bundleSha256:r.bundleSha256});
}
const bad=externalFixture();bad.artifact.rawSeal='0x'+(bad.artifact.rawSeal.slice(2,4)==='00'?'01':'00')+bad.artifact.rawSeal.slice(4);bad.artifact.evmSeal='0x73c457ba'+bad.artifact.rawSeal.slice(2);bad.artifact.certificate=abi.encode(['bytes','bytes'],[bad.artifact.evmSeal,bad.artifact.journal]);
await assert.rejects(verifyExternalBundle(sdk,bad,{profileId:bad.artifact.profileId}),undefined,'Changed cryptographic seal must fail original verifier');
const changed=externalFixture(),goal=decodeBase64(changed.goalExport.base64),prefix=selectExternalBundleProfile(changed,changed.artifact.profileId).foundationBytes.length;
const next=Uint8Array.from([...goal.slice(0,prefix),32,...goal.slice(prefix)]);changed.goalExport={base64:encodeBase64(next),sha256:sha256(next).slice(2),bytes:next.length};changed.artifact.goalHash=sha256(next);
const words=Array.from(abi.decode(['bytes32','bytes32','bytes32','uint256'],changed.artifact.journal));words[1]=sha256(next);changed.artifact.journal=abi.encode(['bytes32','bytes32','bytes32','uint256'],words);changed.artifact.certificate=abi.encode(['bytes','bytes'],[changed.artifact.evmSeal,changed.artifact.journal]);
await assert.rejects(verifyExternalBundle(sdk,changed,{profileId:changed.artifact.profileId}),undefined,'Self-consistent new export with old proof must fail original verifier');
const after=await provider.send('eth_blockNumber',[]);assert.equal(after,before);fs.writeFileSync('data/generic-bundle-live.json',JSON.stringify({readOnly:true,before:Number(BigInt(before)),after:Number(BigInt(after)),results,alteredSealRejected:true,newSelfConsistentGoalWithOldSealRejected:true},null,2)+'\n');console.log(JSON.stringify({passed:6,head:Number(BigInt(after)),readOnly:true}));await provider.destroy();
