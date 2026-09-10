import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {keccak256} from 'ethers';
import {externalProofCatalog} from '../server/external-proofs.mjs';
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),zero=addr(0);
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vault-catalog-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'external-proofs/perf05'),{recursive:true});fs.mkdirSync(path.join(root,'.state/additional-profiles'),{recursive:true});
 const descriptor={tag:'perf05',profileId:'0x'+'ab'.repeat(32),imageId:'0x'+'cd'.repeat(32),manifest:'exact pinned manifest'};
 const config={chainId:31373,chainInstance:{id:'same-chain'},addresses:{StatementRegistry:addr(2)}};
 const saved={chainInstance:'same-chain',registry:addr(1),profileId:descriptor.profileId,manifest:descriptor.manifest,bridge:addr(3),proposal:{targets:[addr(1)]}};
 fs.writeFileSync(path.join(root,'external-proofs/perf05/descriptor.json'),JSON.stringify(descriptor));
 fs.writeFileSync(path.join(root,'external-proofs/perf05/true-registration.json'),JSON.stringify({public:true}));
 const stateFile=path.join(root,'.state/additional-profiles/perf05.json');fs.writeFileSync(stateFile,JSON.stringify(saved));
 const reads=[],state={verifier:addr(3),manifest:descriptor.manifest,enabled:true,code:'0x1234',imageId:descriptor.imageId,profileId:descriptor.profileId};
 const provider={getNetwork:async()=>({chainId:31373n}),getBlock:async()=>({number:335,hash:'0x335'}),getCode:async(a,b)=>{reads.push(['code',a,b]);return state.code;}};
 const registry={target:config.addresses.StatementRegistry,profiles:async(id,at)=>{reads.push(['profile',id,at.blockTag]);return state;}};
 const contract=(a)=>{assert.equal(a,addr(3));return{imageId:async at=>{reads.push(['image',at.blockTag]);return state.imageId;},profileId:async at=>{reads.push(['bridge-profile',at.blockTag]);return state.profileId;}};};
 return{root,config,descriptor,saved,state,stateFile,reads,provider,registry,contract};
}
test('selected V2 registered bridge is found despite a legacy deployment record; exact block and registry are reported',async t=>{
 const h=fixture(t),before=fs.readFileSync(h.stateFile,'utf8');const [row]=await externalProofCatalog(h.root,h.config,h);
 assert.equal(row.deployment.bridge,addr(3));assert.equal(row.deployment.registry,addr(2));assert.equal(row.deployment.source,'selected-registry');
 assert.deepEqual(row.deployment.registryObservation,{registry:addr(2),blockNumber:335,blockHash:'0x335',registered:true,enabled:true});
 assert.equal(row.deployment.proposal,undefined);assert.deepEqual(h.reads,[['profile',h.descriptor.profileId,335],['code',addr(3),335],['image',335],['bridge-profile',335]]);
 assert.equal(row.deployment.bridgeCodeHash,keccak256('0x1234'));
 assert.equal(fs.readFileSync(h.stateFile,'utf8'),before);assert.equal(row.examples.length,1);
});
test('an unadmitted V2 profile never inherits bridge/admission/proposal from the legacy record',async t=>{
 const h=fixture(t);h.state.verifier=zero;h.state.enabled=false;const [row]=await externalProofCatalog(h.root,h.config,h);
 assert.equal(row.deployment,null);assert.equal(h.reads.length,1);
});
test('matching deployment candidate is distinct from actual governance admission',async t=>{
 const h=fixture(t);h.saved.registry=addr(2);fs.writeFileSync(h.stateFile,JSON.stringify(h.saved));h.state.verifier=zero;h.state.enabled=false;
 const [row]=await externalProofCatalog(h.root,h.config,h);assert.equal(row.deployment.bridge,addr(3));assert.equal(row.deployment.source,'matching-local-deployment-record');
 assert.equal(row.deployment.registryObservation.registered,false);assert.equal(row.deployment.registryObservation.enabled,false);
});
test('disabled admission stays disabled; mismatched manifest, missing code and wrong selected registry fail closed',async t=>{
 const h=fixture(t);h.state.enabled=false;const [row]=await externalProofCatalog(h.root,h.config,h);assert.equal(row.deployment.registryObservation.registered,true);assert.equal(row.deployment.registryObservation.enabled,false);
 h.state.manifest='different';await assert.rejects(()=>externalProofCatalog(h.root,h.config,h),/manifest/);h.state.manifest=h.descriptor.manifest;
 h.state.code='0x';await assert.rejects(()=>externalProofCatalog(h.root,h.config,h),/no bytecode/);h.state.code='0x1234';
 h.registry.target=addr(1);await assert.rejects(()=>externalProofCatalog(h.root,h.config,h),/selected chain\/registry/);
});
test('actual immutable image/profile and available V2 runtime pin must agree with the selected catalog',async t=>{
 const h=fixture(t);h.config.monetaryPolicy={runtimeHashes:{[addr(3)]:keccak256('0x1234')}};
 await externalProofCatalog(h.root,h.config,h);
 h.state.imageId='0x'+'ef'.repeat(32);await assert.rejects(()=>externalProofCatalog(h.root,h.config,h),/immutable image\/profile/);h.state.imageId=h.descriptor.imageId;
 h.state.profileId='0x'+'ef'.repeat(32);await assert.rejects(()=>externalProofCatalog(h.root,h.config,h),/immutable image\/profile/);h.state.profileId=h.descriptor.profileId;
 h.config.monetaryPolicy.runtimeHashes[addr(3)]=keccak256('0x9876');await assert.rejects(()=>externalProofCatalog(h.root,h.config,h),/runtime differs/);
});
