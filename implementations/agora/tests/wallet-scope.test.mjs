import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createWalletScope,StaleWalletContext,visibleOwnerJobs,polledJobState,bindInjectedEvents} from '../src/wallet-scope.mjs';
import {createSessionClient} from '../src/session-client.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
test('late old-owner HTTP result is aborted and cannot restore private data across A→B→A',async()=>{
 const scope=createWalletScope(),d=deferred();let options,token='owner-A',privateState='empty';
 const api=createSessionClient({scope,getToken:()=>token,fetchImpl:async(_,o)=>{options=o;return d.promise;}});
 const pending=api('/jobs').then(v=>{privateState=v;});
 assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,'Bearer owner-A');
 scope.invalidate();token='owner-B';scope.invalidate();token='owner-A';
 assert.equal(options.signal.aborted,true);d.resolve({ok:true,json:async()=>['old private source']});
 await assert.rejects(pending,StaleWalletContext);assert.equal(privateState,'empty');
});
test('late wallet signature/file read is discarded and poll timers cannot reschedule after logout',async()=>{
 const pendingTimers=new Map();let n=0,calls=0;const scope=createWalletScope({setTimer:fn=>{pendingTimers.set(++n,fn);return n;},clearTimer:id=>pendingTimers.delete(id)});
 const d=deferred(),pending=scope.wait(d.promise),ticket=scope.capture();scope.schedule(()=>calls++,1,ticket);const queuedCallback=[...pendingTimers.values()][0];
 scope.invalidate();assert.equal(pendingTimers.size,0);queuedCallback();scope.schedule(()=>calls++,1,ticket);assert.equal(calls,0);assert.equal(pendingTimers.size,0);
 d.resolve('old signed message');await assert.rejects(pending,StaleWalletContext);
});
test('explicit session tokens replace cookie fallback; caller cannot re-enable credentials',async()=>{
 let observed,token='';const api=createSessionClient({scope:createWalletScope(),getToken:()=>token,fetchImpl:async(_,o)=>{observed=o;return{ok:true,json:async()=>({ok:true})};}});
 await api('/public',{credentials:'include'});assert.equal(observed.credentials,'omit');assert.equal(observed.headers.Authorization,undefined);
 token='new-owner';await api('/private',{method:'POST',body:{source:'private'}});assert.equal(observed.headers.Authorization,'Bearer new-owner');assert.equal(observed.body,'{"source":"private"}');
});
test('missing/ownerless/foreign jobs stop polling safely without exposing source',()=>{
 const a={id:'a',owner:'0xAA',input:{source:'mine'},status:'running'},b={id:'b',owner:'0xbb',input:{source:'other'}};
 const visible=visibleOwnerJobs([a,b,{id:'legacy',input:{source:'legacy'}},null,{owner:'0xaa'}],'0xaa');assert.deepEqual(visible,[a]);
 assert.equal(polledJobState(visible,'b').state,'missing');assert.equal(polledJobState(visible,'a').state,'pending');
 assert.equal(polledJobState([{...a,status:'cancelled'}],'a').state,'terminal');assert.equal(polledJobState([{...a,status:'succeeded'}],'a').state,'succeeded');
 assert.throws(()=>visibleOwnerJobs(undefined,'0xaa'),/Invalid job-list/);
});
test('injected account/network/disconnect subscriptions invalidate and are removed on local switch',()=>{
 const provider=new EventEmitter(),scope=createWalletScope();let resets=0;
 const reset=()=>{scope.invalidate();resets++;};const detach=bindInjectedEvents(provider,{accountsChanged:reset,chainChanged:reset,disconnect:reset});
 const ticket=scope.capture();provider.emit('accountsChanged',['0xnew']);provider.emit('chainChanged','0x1');provider.emit('disconnect');assert.equal(scope.current(ticket),false);assert.equal(resets,3);
 detach();provider.emit('accountsChanged',[]);assert.equal(resets,3);assert.equal(provider.listenerCount('accountsChanged'),0);
});
