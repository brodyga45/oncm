import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettlementScenario,scenarioMatches} from '../web/settlement-scenario.mjs';
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const account='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20),pool='0x'+'33'.repeat(20);
function harness(read=async(p,a)=>({pool:p,account:a,baseInventory:'20',outcomeInventory:'80',blockNumber:154})){
 const updates=[],client={provider:{getNetwork:async()=>({chainId:31373n})},settlementStress:read},context={client,account,pool,chainId:31373};
 const reader=createSettlementScenario({publish:value=>updates.push(value)});reader.setContext(context);return{reader,updates,context,client};
}
test('visible scenario belongs to exact wallet, pool, chain and SDK',async()=>{
 const h=harness(),r=await h.reader.load();assert.equal(r.account,account);assert.equal(r.blockNumber,154);assert.ok(scenarioMatches(r,h.context));
 for(const patch of [{account:other},{pool:other},{chainId:1},{client:{}}])assert.equal(scenarioMatches(r,{...h.context,...patch}),false);
 h.reader.setContext({...h.context,account:other});assert.equal(h.reader.value,null);assert.equal(h.updates.at(-1),null);
});
test('wallet/pool/network/SDK ABA changes discard delayed old inventory and errors',async()=>{
 for(const patch of [{account:other},{pool:other},{chainId:1},{client:{}}]){
  const pending=defer(),h=harness(()=>pending.promise),work=h.reader.load();await Promise.resolve();
  h.reader.setContext({...h.context,...patch});h.reader.setContext(h.context);
  pending.resolve({pool,account,baseInventory:'20'});assert.equal(await work,null);assert.equal(h.reader.value,null);
 }
 const pending=defer(),h=harness(()=>pending.promise),work=h.reader.load();await Promise.resolve();
 h.reader.setContext({...h.context,account:''});pending.reject(Error('old provider failed'));
 assert.equal(await work,null);assert.equal(h.reader.value,null);
});
test('newer read owns inventory even if an older read finishes later',async()=>{
 const a=defer(),b=defer();let n=0;const h=harness(()=>++n===1?a.promise:b.promise);
 const old=h.reader.load();await Promise.resolve();const newer=h.reader.load();await Promise.resolve();
 b.resolve({pool,account,baseInventory:'7',blockNumber:155});await newer;
 a.resolve({pool,account,baseInventory:'20',blockNumber:154});await old;
 assert.equal(h.reader.value.baseInventory,'7');assert.equal(h.reader.value.blockNumber,155);
});
test('wrong live network, result actor or pool cannot be published',async()=>{
 const h=harness();h.client.provider.getNetwork=async()=>({chainId:1n});await assert.rejects(()=>h.reader.load(),/different chain/);
 for(const changed of [{account:other},{pool:other}]){
  const bad=harness(async()=>({pool,account,...changed}));await assert.rejects(()=>bad.reader.load(),/another wallet or pool/);assert.equal(bad.reader.value,null);
 }
});
test('unmounted scenario reader ignores pending completion',async()=>{
 const pending=defer(),h=harness(()=>pending.promise),work=h.reader.load();await Promise.resolve();h.reader.dispose();const count=h.updates.length;
 pending.resolve({pool,account});assert.equal(await work,null);assert.equal(h.updates.length,count);
});
