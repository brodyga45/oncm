import test from 'node:test';import assert from 'node:assert/strict';
import {waitForHttp} from '../scripts/http-ready.mjs';
test('ready API does not trigger early failure before the independently starting website',async()=>{
 let round=0,canceled=0;
 await waitForHttp(['api','web','proxy'],{sleep:async()=>{round++;},attempts:5,fetchImpl:async url=>{
   if(url==='web'&&round<2)throw Error('ECONNREFUSED');
   return{ok:url!=='proxy'||round>=2,body:{cancel:async()=>{canceled++;}}};
 }});assert.equal(round,2);assert.equal(canceled,7);
});
test('persistent failure and stopped startup fail explicitly without readiness success',async()=>{
 await assert.rejects(waitForHttp(['web'],{attempts:2,sleep:async()=>{},fetchImpl:async()=>({ok:false})}),/did not become ready/);
 let calls=0;await assert.rejects(waitForHttp(['web'],{isStopped:()=>true,fetchImpl:async()=>{calls++;}}),/stopped/);assert.equal(calls,0);
});
