import test from 'node:test';import assert from 'node:assert/strict';
import {createPackageEditor} from '../web/package-editor.mjs';
const A='0x'+'11'.repeat(20),B='0x'+'22'.repeat(20),id='0x'+'aa'.repeat(32),profile='0x'+'bb'.repeat(32),goal='0x'+'cc'.repeat(32);
const context={account:A,client:{},chainId:31373,chainInstance:'chain-a',registry:'0x'+'33'.repeat(20),profileId:profile,statement:{id,author:A,kind:0,profileId:profile,goalHash:goal}};
const draft={challengeSource:'def Oncm.goal : Prop := True',solutionSource:'',outcome:1};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function harness(){const calls=[];let state,resets=0;const controller=createPackageEditor({request:(url,options)=>{const d=deferred();calls.push({url,options,...d});return d.promise;},download:async(body,current)=>{const d=deferred();calls.push({body,current,...d});await d.promise;if(current())calls.push({saved:true});},onChange:s=>state=s,onReset:()=>resets++});controller.setContext(context);controller.setDraft(draft);return {controller,calls,get state(){return state;},get resets(){return resets;}};}
test('public list follows statement/client context and rejects late responses after context ABA',async()=>{
 const h=harness();h.controller.setContext({...context,statement:{...context.statement,id:'other'}});h.controller.setContext(context);
 h.calls[2].resolve([{id:'current'}]);await Promise.resolve();h.calls[0].resolve([{id:'obsolete'}]);h.calls[1].reject(Error('obsolete read'));
 await Promise.resolve();assert.equal(h.state.records[0].id,'current');assert.equal(h.state.error,'');assert.equal(h.resets,3);
});
test('form ABA removes consent and refuses older preview; public list survives typing',async()=>{
 const h=harness();h.controller.setConsent(true);assert.equal(h.state.consent,true);const pending=h.controller.prepare();
 h.controller.setDraft({...draft,solutionSource:'edited'});h.controller.setDraft(draft);assert.equal(h.state.consent,false);
 h.calls[1].resolve({files:['old']});await pending;assert.equal(h.state.prepared,null);
 h.calls[0].resolve([{id:'public'}]);await Promise.resolve();assert.equal(h.state.records[0].id,'public');
 await assert.rejects(()=>h.controller.publish(),/consent/);
});
test('wallet/network/profile/client switches clear consent and prevent stale download side effects',async()=>{
 for(const changed of [{account:B},{chainInstance:'other-chain'},{profileId:'other-profile'},{client:{}}]){
  const h=harness();h.controller.setConsent(true);const download=h.controller.download();h.controller.setContext({...context,...changed});
  h.calls[1].resolve();await download;assert.equal(h.calls.some(x=>x.saved),false);assert.equal(h.state.consent,false);assert.equal(h.state.prepared,null);
 }
});
test('publication captures exact actor/goal/profile and cannot refresh a newer statement on completion',async()=>{
 const h=harness();h.controller.setConsent(true);const publish=h.controller.publish(),request=h.calls[1];
 const input=JSON.parse(request.options.body);assert.deepEqual(input.expectedContext,{account:A,chainId:31373,chainInstance:'chain-a',registry:context.registry,statementId:id,goalHash:goal,profileId:profile});assert.equal(input.publish,true);
 h.controller.setContext({...context,account:B});request.resolve({id:'published-by-A'});await publish;
 assert.equal(h.calls.length,3);assert.equal(h.state.consent,false);assert.equal(h.state.records.length,0);
});
test('unmount and overlapping downloads discard late effects/errors/finally',async()=>{
 const h=harness();const first=h.controller.download(),second=h.controller.prepare();h.calls[1].resolve();await first;assert.ok(!h.calls.some(x=>x.saved));assert.equal(h.state.working,true);
 h.controller.dispose();h.calls[2].reject(Error('late'));await second;assert.equal(h.state.error,'');
});
