import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {Interface,parseEther,ZeroAddress} from 'ethers';
import {allocationWithGovernance,parseAllocationRows,readTreasury,treasuryCall,refreshTreasuryCall} from '../sdk/treasury.mjs';
import {ExchangeSDK} from '../sdk/index.mjs';import {TreasuryCallReview} from '../web/treasury-review.mjs';
import {createProofImportGuard} from '../web/proof-import-state.mjs';
import {seedAllocationText,assertAllocationReview} from '../web/allocation-editor.mjs';
const abis=JSON.parse(fs.readFileSync(new URL('../web/generated/abis.json',import.meta.url)));
const A='0x0000000000000000000000000000000000000001',B='0x0000000000000000000000000000000000000002',DAO='0x0000000000000000000000000000000000000003',T='0x0000000000000000000000000000000000000004',LP='0x0000000000000000000000000000000000000005',ALLOC='0x0000000000000000000000000000000000000006',WH='0x0000000000000000000000000000000000000007';
const snapshot=()=>({blockNumber:265,treasury:DAO,allocation:ALLOC,warehouse:WH,currentEpoch:'3',
  proposals:[{id:4,baseEpoch:'3',current:true,losing:true,applied:false,consent:false,recipients:[A,B,DAO],shares:['4500','4500','1000']}],
  assets:[{address:T,label:'T · collateral',kind:'T',decimals:18,balance:String(parseEther('5')),claimable:'0'},
    {address:LP,label:'Known market YES/T LP',kind:'LP',decimals:18,balance:'999999999999999999',claimable:'12345'}]});
test('DAO20 draft preserves total, deterministic proportional remainder, and rejects duplicate/rounded percentages',()=>{
  const r=allocationWithGovernance(parseAllocationRows(`${B},50\n${A},50`),DAO);
  assert.deepEqual(r,[{address:A,share:4000},{address:B,share:4000},{address:DAO,share:2000}]);
  const again=allocationWithGovernance(r,DAO);assert.deepEqual(again,r);
  const thirds=allocationWithGovernance(parseAllocationRows(`${A},33.33\n${B},66.67`),DAO);assert.equal(thirds.reduce((s,r)=>s+r.share,0),10000);assert.deepEqual(thirds.map(r=>r.share),[2666,5334,2000]);
  for(const text of [`${A},50\n${A},50`,`${A},99.999`,`${A},0\n${B},100`,`${ZeroAddress},100`,`${A},1e2`,`${A},99.99`])assert.throws(()=>parseAllocationRows(text));
});
test('Repeated polling initializes an editor once and never overwrites prepared or intentionally empty text',()=>{
  const recipients=[A,B],shares=[5000,5000];
  const applyPoll=current=>seedAllocationText(current,recipients,shares);
  let editor=applyPoll(null);assert.equal(editor,`${A},50\n${B},50`);
  const draft=allocationWithGovernance(parseAllocationRows(editor),DAO),prepared=draft.map(r=>`${r.address},${r.share/100}`).join('\n');
  editor=prepared;for(let i=0;i<3;i++)editor=applyPoll(editor);assert.equal(editor,prepared);
  assertAllocationReview(parseAllocationRows(editor),{rows:draft});
  assert.throws(()=>assertAllocationReview(parseAllocationRows(`${A},50\n${B},50`),{rows:draft}),/differs/);
  assert.equal(applyPoll(''),'');
});
test('DAO consent/revoke use exact original ABI and current losing proposal; stale/applied/nonlosing plans reject',()=>{
  const s=snapshot(),consent=treasuryCall(s,{kind:'consent',proposalId:'4'},abis),iface=new Interface(abis.AllocationController);
  assert.deepEqual(consent.targets,[ALLOC]);assert.deepEqual(consent.values,['0']);assert.deepEqual([...iface.decodeFunctionData('setConsent',consent.calldatas[0])],[4n,true]);
  for(const change of [{current:false},{applied:true},{losing:false},{consent:true}]){const bad=snapshot();Object.assign(bad.proposals[0],change);assert.throws(()=>treasuryCall(bad,{kind:'consent',proposalId:'4'},abis));}
  const revoked=snapshot();revoked.proposals[0].consent=true;const c=treasuryCall(revoked,{kind:'revoke',proposalId:'4'},abis);assert.deepEqual([...iface.decodeFunctionData('setConsent',c.calldatas[0])],[4n,false]);
  assert.throws(()=>treasuryCall(s,{kind:'revoke',proposalId:'4'},abis),/already absent/);
  const moved=snapshot();moved.proposals[0].baseEpoch='4';assert.throws(()=>refreshTreasuryCall(consent,moved,{kind:'consent',proposalId:'4'},abis),/epoch changed/);
});
test('Warehouse claim uses genuine two-argument selector, DAO owner/destination and zero ETH value',()=>{
  const call=treasuryCall(snapshot(),{kind:'claim',asset:LP},abis),iface=new Interface(abis.SplitsWarehouse);
  assert.equal(call.calldatas[0].slice(0,10),'0xf940e385');assert.deepEqual(call.targets,[WH]);assert.deepEqual(call.values,['0']);
  assert.deepEqual([...iface.decodeFunctionData('withdraw(address,address)',call.calldatas[0])],[DAO,LP]);
  assert.equal(call.review.recipient,DAO);assert.equal(call.review.owner,DAO);assert.equal(call.review.assetKind,'LP');assert.equal(call.review.observedClaimable,'12345');
  assert.throws(()=>treasuryCall(snapshot(),{kind:'claim',asset:T},abis),/No withdrawable/);
});
test('Internal transfers preserve token/raw amount and never use LP as T; changed executor or insufficient funds rejects',()=>{
  const input={kind:'transfer',asset:LP,recipient:B,amount:'0.123456789012345678'},call=treasuryCall(snapshot(),input,abis);
  assert.deepEqual(call.targets,[LP]);assert.deepEqual([...new Interface(abis.TrueToken).decodeFunctionData('transfer',call.calldatas[0])],[B,123456789012345678n]);
  assert.equal(call.review.assetKind,'LP');assert.equal(call.review.amount,'123456789012345678');
  assert.throws(()=>treasuryCall(snapshot(),{...input,amount:'1'},abis),/exceeds/);
  for(const recipient of [DAO,ZeroAddress])assert.throws(()=>treasuryCall(snapshot(),{...input,recipient},abis));
  assert.throws(()=>refreshTreasuryCall(call,{...snapshot(),treasury:A},input,abis),/executor changed/);
  assert.throws(()=>refreshTreasuryCall(call,snapshot(),{...input,recipient:A},abis),/call changed/);
});
test('Treasury snapshot reads actual Governor executor and every authority/balance at one block, with Warehouse sentinel',async()=>{
  const calls=[];const v=(name,value)=>async(...args)=>{assert.equal(args.at(-1).blockTag,265,name);calls.push(name);return value;};
  const connected=o=>Object.assign(o,{connect(){return this;}});
  const contracts={governor:connected({timelock:v('executor',DAO)}),allocation:connected({currentEpoch:v('epoch',3n),proposalCount:v('count',1n),epoch:v('table',{recipients:[A,DAO],shares:[8000n,2000n]}),proposal:v('proposal',{base:3n,recipients:[A,DAO],shares:[9000n,1000n],applied:false}),isLosing:v('losing',true),consent:v('consent',false)}),warehouse:connected({withdrawConfig:v('withdrawConfig',[100n,true]),balanceOf:v('warehouseCredit',1n)})};
  const sdk={provider:{getNetwork:async()=>({chainId:31372n}),getBlock:async()=>({number:265,hash:'0xblock',timestamp:100})},deployment:{contracts:{token:T,governor:A,allocation:ALLOC,warehouse:WH}},contract:key=>contracts[key],erc20:()=>connected({balanceOf:v('held',1234567890123456789n),decimals:v('decimals',18n),symbol:v('symbol','UNI-V2')})};
  const result=await readTreasury(sdk,[{address:LP,label:'LP'},{address:LP.toLowerCase(),label:'duplicate'}]);
  assert.equal(result.treasury,DAO);assert.equal(result.share,'2000');assert.equal(result.assets.length,2);assert.equal(result.assets[0].kind,'T');assert.equal(result.assets[1].kind,'LP');assert.equal(result.assets[0].claimable,'0');assert.equal(result.withdrawalPaused,true);assert.equal(result.withdrawalIncentive,'100');assert(calls.length>10);
});
test('DAO SDK sends only a Governor proposal and rechecks UI ticket immediately before sending',async()=>{
  const input={kind:'claim',asset:LP},plan=treasuryCall(snapshot(),input,abis),s=Object.create(ExchangeSDK.prototype),sent=[];
  Object.assign(s,{abis,treasurySnapshot:async()=>snapshot(),tx:async(_,f)=>f(),contract:key=>{assert.equal(key,'governor');return{propose:async(...args)=>{sent.push(args);return 'proposal';}};}});
  assert.equal(await s.proposeTreasuryCall(plan,input,[]),'proposal');assert.equal(sent.length,1);assert.deepEqual(sent[0].slice(0,3),[plan.targets,plan.values,plan.calldatas]);
  const guard=createProofImportGuard();guard.select('wallet/A/LP',s);const ticket=guard.begin();
  s.tx=async(_,fn)=>{guard.select('wallet/B/LP',s);return fn();};
  await assert.rejects(s.proposeTreasuryCall(plan,input,[],()=>{if(!guard.current(ticket))throw Error('Stale form');}),/Stale form/);assert.equal(sent.length,1);
});
test('Prepared governance review visibly distinguishes actual addresses, LP raw units, and no automatic payouts',()=>{
  const input={kind:'transfer',asset:LP,recipient:B,amount:'0.1'},call=treasuryCall(snapshot(),input,abis);
  const html=renderToStaticMarkup(React.createElement(TreasuryCallReview,{call}));
  for(const text of [DAO,LP,B,'raw units 100000000000000000','LP units','0.1 LP','No voter receives an automatic payout','Voting, queueing'])assert(html.includes(text),text);
  assert(html.includes(call.calldatas[0]));
});
