import test from 'node:test';import assert from 'node:assert/strict';
import {readDerivedReadiness} from '../sdk/derived-readiness.mjs';
import {ExchangeSDK} from '../sdk/index.mjs';
const market='0x'+'ab'.repeat(20),id='child',parent='parent';
function fixture({kind=1,outcome=0,evaluated=0,error}={}){
 const calls=[],block={number:42,hash:'0xblock42',timestamp:100};
 const registry={statements:async(who,at)=>{calls.push(['statement',who,at]);return{market,kind,outcome:who===id?outcome:0,dependency:parent,deadline:200,targetOutcome:1,resolvedAt:0};},
  derivedOutcome:async(who,at)=>{calls.push(['evaluate',who,at]);if(error)throw error;return evaluated;}};
 return{provider:{getBlock:async()=>block},registry,calls};
}
test('pending uses the registry result and all explanations are pinned to one block',async()=>{
 const f=fixture(),r=await readDerivedReadiness(f,id);assert.equal(r.status,'pending');assert.equal(r.ready,false);assert.match(r.reason,/No transaction was sent/);
 assert.equal(r.blockHash,'0xblock42');assert.deepEqual(f.calls,[['statement',id,{blockTag:42}],['evaluate',id,{blockTag:42}],['statement',parent,{blockTag:42}]]);
});
test('ready outcome comes from Solidity even when the local descriptive fields would suggest waiting',async()=>{
 for(const evaluated of [1,2]){const f=fixture({evaluated});const r=await readDerivedReadiness(f,id);assert.equal(r.ready,true);assert.equal(r.outcome,evaluated);assert.equal(f.calls.length,2);}
});
test('settled and Lean records do not invoke derived evaluation; custom pending does not read a fake dependency',async()=>{
 for(const spec of [{outcome:2},{kind:0}]){const f=fixture(spec);assert.equal((await readDerivedReadiness(f,id)).ready,false);assert.equal(f.calls.length,1);}
 const f=fixture({kind:4});assert.match((await readDerivedReadiness(f,id)).reason,/governance operator/);assert.equal(f.calls.length,2);
});
test('provider/disabled-operator failures remain errors rather than false pending statuses',async()=>{
 const error=Error('Operator disabled');await assert.rejects(readDerivedReadiness(fixture({error}),id),e=>e===error);
});
test('SDK sends nothing on pending or a changed wallet while readiness was being read',async()=>{
 let sent=0;const sdk=new ExchangeSDK(null,null,{},{});sdk.tx=async()=>{sent++;};
 sdk.derivedReadiness=async()=>({ready:false,reason:'Waiting for dependency'});
 await assert.rejects(sdk.resolveDerived({id}),/Waiting for dependency/);assert.equal(sent,0);
 sdk.derivedReadiness=async()=>({ready:true,outcome:1});
 await assert.rejects(sdk.resolveDerived({id},{isCurrent:()=>false}),/wallet changed/);assert.equal(sent,0);
});
