import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import React from 'react';import {transformSync} from 'esbuild';
import {createProofImportGuard} from '../web/proof-import-state.mjs';
import {seedAllocationText,assertAllocationReview} from '../web/allocation-editor.mjs';
import {parseAllocationRows,allocationWithGovernance} from '../sdk/treasury.mjs';

// Run the actual Fees component and its captured seven-second interval callback
// with deterministic hooks/RPC views. Advancing that callback does not wait seven
// wall seconds or change a blockchain; the separate browser pass uses real time.
const source=fs.readFileSync(new URL('../web/main.jsx',import.meta.url),'utf8');
const fees=source.slice(source.indexOf('function Fees('),source.indexOf('function Activity('));
const body=transformSync(fees,{loader:'jsx',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'}).code;
const A='0x0000000000000000000000000000000000000001',B='0x0000000000000000000000000000000000000002',DAO='0x0000000000000000000000000000000000000003';
const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n&&typeof n==='object'&&n.props?[n,...nodes(n.props.children)]:[];

test('Actual Fees interval closure retains DAO/edited/empty text, submits the reviewed rows, and invalidates epoch changes',async()=>{
  let cursor=0,interval,epoch=2,block=265;const hooks=[],scheduled=[],sent=[];
  const useState=initial=>{const i=cursor++;if(!(i in hooks))hooks[i]=initial;return[hooks[i],v=>{hooks[i]=typeof v==='function'?v(hooks[i]):v;}];};
  const useRef=initial=>{const i=cursor++;if(!(i in hooks))hooks[i]={current:initial};return hooks[i];};
  const useEffect=(f,deps)=>{const i=cursor++,old=hooks[i];if(!old||deps.some((v,j)=>v!==old.deps[j])){old?.cleanup?.();hooks[i]={deps};scheduled.push(()=>{hooks[i].cleanup=f();});}};
  const alloc={currentEpoch:async()=>epoch,proposalCount:async()=>0,epoch:async()=>({split:A,recipients:[A,B],shares:[5000n,5000n]})};
  const sdk={provider:{send:async()=>`0x${block.toString(16)}`},contract:k=>k==='allocation'?alloc:{timelock:async()=>DAO},
    treasurySnapshot:async()=>({treasury:DAO,currentEpoch:String(epoch),blockNumber:block}),
    proposeAllocation:async(rows,current)=>{current();sent.push(rows);}};
  const create=new Function('React','useState','useEffect','useRef','createProofImportGuard','seedAllocationText','assertAllocationReview','parseAllocationRows','allocationWithGovernance','Button','Heading','fmt','short','setInterval','clearInterval',body+'\nreturn Fees;');
  const Fees=create(React,useState,useEffect,useRef,createProofImportGuard,seedAllocationText,assertAllocationReview,parseAllocationRows,allocationWithGovernance,()=>null,()=>null,String,String,(fn,delay)=>{interval={fn,delay};return 1;},()=>{});
  const props={sdk,address:A,markets:[],run:async(_,fn)=>fn(),busy:false,deployment:{contracts:{}},setPage:()=>{}};
  const render=()=>{cursor=0;const tree=Fees(props);scheduled.splice(0).forEach(f=>f());return tree;};
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const editor=tree=>nodes(tree).find(n=>n.type==='textarea');
  const button=(tree,label)=>nodes(tree).find(n=>n.props.children===label);
  let tree=render();await flush();tree=render();assert.equal(interval.delay,7000);
  assert.equal(editor(tree).props.value,`${A},50\n${B},50`);
  await button(tree,'Prepare DAO 20% table').props.onClick();tree=render();
  const prepared=editor(tree).props.value;assert.match(prepared,new RegExp(DAO+',20'));
  const capturedOriginalPoll=interval.fn;capturedOriginalPoll();await flush();tree=render();
  assert.equal(editor(tree).props.value,prepared,'old effect closure must not overwrite the new draft');
  await button(tree,'Propose distribution').props.onClick();assert.deepEqual(sent[0],parseAllocationRows(prepared));
  await flush();tree=render();
  const edited=`${A},45\n${B},35\n${DAO},20`;
  editor(tree).props.onChange({target:{value:edited}});tree=render();capturedOriginalPoll();await flush();tree=render();assert.equal(editor(tree).props.value,edited);
  editor(tree).props.onChange({target:{value:''}});tree=render();capturedOriginalPoll();await flush();tree=render();assert.equal(editor(tree).props.value,'');
  editor(tree).props.onChange({target:{value:edited}});tree=render();await button(tree,'Prepare DAO 20% table').props.onClick();tree=render();const before=editor(tree).props.value;
  epoch=3;block=266;capturedOriginalPoll();await flush();tree=render();assert.equal(editor(tree).props.value,before);
  assert.equal(button(tree,'Propose distribution').props.disabled,true);assert(nodes(tree).some(n=>typeof n.props.children==='string'&&n.props.children.includes('Your text is preserved')));
});
