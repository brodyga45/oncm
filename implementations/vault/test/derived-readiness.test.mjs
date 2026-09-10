import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,ZeroAddress} from 'ethers';
import {readDerivedReadiness} from '../sdk/derived-readiness.mjs';
const iface=new Interface(['error NotResolvableYet()','error AlreadyResolved()','error UnknownStatement()']);
function harness({kind=2,outcome=0,author='0x'+'11'.repeat(20),error='NotResolvableYet',parentOutcome=0}={}){
 const calls=[],statement={kind,outcome,author,dependency:'parent',deadline:200},parent={outcome:parentOutcome,resolvedAt:150};
 const registry={interface:iface,getStatement:async(id,at)=>{calls.push([id,at]);assert.equal(at.blockTag,160);return id==='child'?statement:parent;},resolveDerived:{staticCall:async(id,at)=>{calls.push(['staticCall',id,at]);assert.equal(at.blockTag,160);if(error)throw {data:iface.encodeErrorResult(error)};}}};
 return {calls,args:[{provider:{getNetwork:async()=>({chainId:31373n}),getBlock:async()=>({number:160,hash:'0x160',timestamp:180})},registry},'child']};
}
test('pending ResolvedAs explains unresolved parent after actual same-block rejection',async()=>{
 const h=harness(),r=await readDerivedReadiness(...h.args);
 assert.equal(r.ready,false);assert.equal(r.status,'pending');assert.equal(r.parentOutcome,0);assert.equal(r.blockNumber,160);
 assert.match(r.reason,/Родительское утверждение ещё не разрешено/);assert.match(r.reason,/транзакция не отправлена/);
 assert.deepEqual(h.calls.map(x=>x[0]),['child','staticCall','parent']);
});
test('readiness comes from actual operator call, not browser reimplementation',async()=>{
 for(const kind of [1,2,3,4]){
  const h=harness({kind,error:null}),r=await readDerivedReadiness(...h.args);assert.equal(r.ready,true);assert.equal(r.status,'ready');
  assert.equal(h.calls.filter(x=>x[0]==='staticCall').length,1);
 }
 const h=harness({kind:4}),r=await readDerivedReadiness(...h.args);assert.equal(r.status,'pending');assert.match(r.reason,/оператора/);
});
test('unknown, base and resolved goals do not attempt settlement simulation',async()=>{
 for(const [patch,status]of [[{author:ZeroAddress},'unknown'],[{kind:0},'base'],[{outcome:2},'resolved']]){
  const h=harness(patch),r=await readDerivedReadiness(...h.args);assert.equal(r.status,status);assert.equal(h.calls.length,1);
 }
});
test('nested provider custom error data is decoded, network failures remain failures',async()=>{
 const h=harness();h.args[0].registry.resolveDerived.staticCall=async()=>{throw{info:{error:{data:{result:iface.encodeErrorResult('NotResolvableYet')}}}};};
 assert.equal((await readDerivedReadiness(...h.args)).status,'pending');
 h.args[0].registry.resolveDerived.staticCall=async()=>{throw Error('RPC disconnected');};await assert.rejects(()=>readDerivedReadiness(...h.args),/RPC disconnected/);
 h.args[0].provider.getNetwork=async()=>({chainId:1n});await assert.rejects(()=>readDerivedReadiness(...h.args),/31373/);
});
