import test from 'node:test';import assert from 'node:assert/strict';
import {assertFreshV2Plan} from '../scripts/v2-plan.mjs';
const addr=n=>'0x'+n.toString(16).padStart(40,'0');
const plan=()=>({format:'vault-additive-v2-plan-v1',chainId:31373,initialSupply:'0',genesis:[],reviewedBlock:{number:260,hash:'0xabc'},chainInstance:'one',deployerNonce:42,legacyFileHashes:{'deployment.json':'sha'},monetaryManifestSha256:'manifest',reuseRuntimeHashes:{[addr(3)]:'code'},allocation:{sourceEpoch:'4',recipients:[addr(1),addr(2)],weights:['8500','1500']},pendingProfiles:[{profileId:'profile',imageId:'image',verifier:addr(4),manifest:'policy'}]});
test('An advanced head alone preserves the exact reviewed V2 plan',()=>{const reviewed=plan(),current=plan();current.reviewedBlock={number:261,hash:'0xdef'};assert.doesNotThrow(()=>assertFreshV2Plan(current,reviewed));});
test('Changed recipient/weight, deployer nonce, bytecode, profile or legacy descriptor invalidates review',()=>{
 for(const mutate of[p=>p.allocation.weights=['8400','1600'],p=>p.allocation.recipients[1]=addr(5),p=>p.deployerNonce++,p=>p.reuseRuntimeHashes[addr(3)]='changed',p=>p.pendingProfiles[0].imageId='other',p=>p.legacyFileHashes['deployment.json']='changed',p=>p.chainInstance='other',p=>p.monetaryManifestSha256='other']){
  const current=plan();mutate(current);assert.throws(()=>assertFreshV2Plan(current,plan()));
 }
});
test('Even identical documents cannot enable implicit genesis or invalid allocation',()=>{
 for(const mutate of[p=>p.initialSupply='1',p=>p.genesis=[{recipient:addr(1),amount:'1'}],p=>p.allocation.weights=['8499','1500'],p=>p.allocation.recipients=[addr(1),addr(1)]]){
  const both=plan();mutate(both);assert.throws(()=>assertFreshV2Plan(both,structuredClone(both)));
 }
});
