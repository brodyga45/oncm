import test from'node:test';import assert from'node:assert/strict';import React from'react';import{renderToStaticMarkup}from'react-dom/server';import{readOperatorDetails,OperatorDetails}from'../web/operator-details.mjs';
test('custom details use exact same-block registry operands, not zero built-in dependency/deadline',async()=>{
 const calls=[],at={blockTag:265},registry={statements:async(id,a)=>{calls.push(['statement',id,a]);return{kind:4n,goal:'operator-id',dependency:'zero',deadline:0n};},operatorArguments:async(id,a)=>{calls.push(['params',id,a]);return'0x123456';},operators:async(id,a)=>{calls.push(['operator',id,a]);return{verifier:'0xadapter',manifest:'Example <untrusted>',newEnabled:false,resolutionEnabled:true};}};
 const d=await readOperatorDetails(registry,'condition-id',265);assert.deepEqual(calls,[['statement','condition-id',at],['params','condition-id',at],['operator','operator-id',at]]);
 const html=renderToStaticMarkup(React.createElement(OperatorDetails,{details:d}));for(const text of['operator-id','0xadapter','0x123456','block #265','ABI-encoded operands','Example &lt;untrusted&gt;','Disabled','Enabled'])assert(html.includes(text),text);assert(!html.includes('No deadline'));assert(!html.includes('>zero<'));assert(!html.includes('<untrusted>'));
});
test('noncustom and failed operand reads do not manufacture plausible operator fields',async()=>{
 await assert.rejects(readOperatorDetails({statements:async()=>({kind:1})},'id',1),/not a governed/);
 await assert.rejects(readOperatorDetails({statements:async()=>({kind:4,goal:'op'}),operatorArguments:async()=>{throw Error('unavailable')},operators:async()=>({})},'id',1),/unavailable/);
 const html=renderToStaticMarkup(React.createElement(OperatorDetails,{}));assert(html.includes('Reading'));assert(!html.includes('No deadline'));
});
