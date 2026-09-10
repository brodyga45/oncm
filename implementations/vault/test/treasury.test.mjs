import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,ZeroAddress} from 'ethers';
import {allocationWithTreasury,createTreasury} from '../sdk/treasury.mjs';
const A='0x'+'11'.repeat(20),B='0x'+'22'.repeat(20),DAO='0x'+'33'.repeat(20),G='0x'+'44'.repeat(20),W='0x'+'55'.repeat(20),C='0x'+'66'.repeat(20),T='0x'+'77'.repeat(20);
const allocationAbi=['function setConsent(uint256,bool)'];
const transferAbi=['function transfer(address,uint256) returns(bool)'];
function harness(){
 const events=[],state={epoch:3n,proposalEpoch:3n,applied:false,decreasing:true,owner:A,executor:DAO,chain:31373n,balance:50n,claimable:7n,transferResult:true};
 const at=o=>assert.equal(o.blockTag,193);
 const gov={timelock:async o=>{at(o);return state.executor;},propose:async(...args)=>{events.push(['propose',...args]);return 'tx';}};
 const warehouse={balanceOf:async(owner,id,o)=>{at(o);assert.equal(owner,DAO);assert.equal(id,BigInt(T));return state.claimable;},'withdraw(address,address[],uint256[],address)':async(...args)=>{events.push(['withdraw',...args]);return'tx';}};
 const allocation={interface:new Interface(allocationAbi),epoch:async o=>{at(o);return state.epoch;},allocation:async(e,o)=>{at(o);return{recipients:[A,B,DAO],weights:[4000n,4000n,2000n]};},proposal:async(id,o)=>{at(o);return{baseEpoch:state.proposalEpoch,applied:state.applied,recipients:[A,B,DAO],weights:[4500n,4500n,state.decreasing?1000n:2000n]};}};
 const token={balanceOf:async(owner,o)=>{at(o);assert.equal(owner,DAO);return state.balance;}};
 const timelock={PROPOSER_ROLE:async o=>{at(o);return'role';},hasRole:async(r,g,o)=>{at(o);assert.equal(g,G);return true;}};
 const contract=a=>({[G]:gov,[W]:warehouse,[C]:allocation,[T]:token,[DAO]:timelock}[a]);
 const provider={getNetwork:async()=>({chainId:state.chain}),getBlock:async()=>({number:193,hash:'0x193'}),getCode:async(a,b)=>{assert.equal(b,193);return'0x01';},getBalance:async(a,b)=>{assert.equal(a,DAO);assert.equal(b,193);return 9n;},send:async(method,args)=>{assert.equal(method,'eth_call');assert.equal(args[0].from,DAO);assert.equal(args[1],'0xc1');events.push(['eth_call',...args]);return args[0].to===T?new Interface(transferAbi).encodeFunctionResult('transfer',[state.transferResult]):'0x';}};
 const config={addresses:{Governor:G,Timelock:DAO,SplitsWarehouse:W,AllocationController:C}};
 const sdk=createTreasury({provider,config,abis:{},write:{getAddress:async()=>state.owner},send:async fn=>{events.push(['send']);return fn();},contract});
 return{sdk,state,events};
}
test('DAO20 proposal keeps exact total, relative shares and sorted unique addresses; original untouched',()=>{
 const old={epoch:2,recipients:[A,B],weights:['5000','5000']};
 assert.deepEqual(allocationWithTreasury(old,DAO),{baseEpoch:2,recipients:[A,B,DAO],weights:['4000','4000','2000']});
 assert.deepEqual(old.weights,['5000','5000']);
 const uneven=allocationWithTreasury({recipients:[A,B,DAO],weights:['3333','3334','3333']},DAO);
 assert.equal(uneven.weights.map(BigInt).reduce((a,b)=>a+b),10000n);assert.equal(uneven.weights[2],'2000');
 assert.throws(()=>allocationWithTreasury({recipients:[A,A],weights:[5000,5000]},DAO),/duplicate/);
 assert.throws(()=>allocationWithTreasury(old,ZeroAddress),/Zero address/);
});
test('treasury snapshot uses one block and actual Governor executor, not current wallet/voters',async()=>{
 const h=harness(),s=await h.sdk.snapshot([T,T]);
 assert.equal(s.treasury,DAO);assert.equal(s.shareBps,'2000');assert.equal(s.epoch,'3');assert.equal(s.nativeBalance,'9');
 assert.deepEqual(s.assets,[{token:T,balance:'50',claimable:'7'}]);assert.equal(h.events.length,0);
 h.state.executor=B;await assert.rejects(()=>h.sdk.snapshot([T]),/differs/);
 h.state.executor=DAO;h.state.chain=1n;await assert.rejects(()=>h.sdk.snapshot([T]),/31373/);
});
test('consent and revoke plan target exact Allocation ABI with Timelock caller',async()=>{
 const h=harness();for(const approved of[true,false]){
  const p=await h.sdk.prepare({kind:'consent',proposalId:'2',approved});
  assert.equal(p.target,C);assert.equal(p.detail.baseEpoch,'3');assert.equal(p.detail.oldBps,'2000');assert.equal(p.detail.newBps,'1000');
  assert.deepEqual([...new Interface(allocationAbi).decodeFunctionData('setConsent',p.data)],[2n,approved]);
 }
 assert.equal(h.events.every(e=>e[0]==='eth_call'),true);
});
test('stale/applied/non-decreasing allocation cannot prepare DAO consent',async()=>{
 for(const [change,re]of[[{proposalEpoch:2n},/stale/],[{applied:true},/applied/],[{decreasing:false},/not decreasing/]]){
  const h=harness();Object.assign(h.state,change);await assert.rejects(()=>h.sdk.prepare({kind:'consent',proposalId:'2',approved:true}),re);assert.equal(h.events.length,0);
 }
 await assert.rejects(()=>harness().sdk.prepare({kind:'consent',proposalId:'2',approved:'true'}),/must be true or false/);
});
test('transfer preflight verifies exact raw units and original ERC20 boolean result',async()=>{
 const h=harness(),p=await h.sdk.prepare({kind:'transfer',token:T,recipient:B,amount:'12'});
 assert.equal(p.target,T);assert.deepEqual([...new Interface(transferAbi).decodeFunctionData('transfer',p.data)],[B,12n]);
 h.state.transferResult=false;await assert.rejects(()=>h.sdk.prepare(p.input),/returned false/);
 h.state.transferResult=true;h.state.balance=11n;await assert.rejects(()=>h.sdk.prepare(p.input),/Insufficient/);
 await assert.rejects(()=>h.sdk.prepare({...p.input,recipient:ZeroAddress}),/Zero address/);
});
test('propose revalidates allocation after review; calls only Governor and never direct consent',async()=>{
 const h=harness(),p=await h.sdk.prepare({kind:'consent',proposalId:'2',approved:true});
 await h.sdk.propose(p,'Approve DAO reduction');
 assert.deepEqual(h.events.find(e=>e[0]==='propose'),['propose',[C],[0],[p.data],'Approve DAO reduction']);
 h.state.epoch=4n;await assert.rejects(()=>h.sdk.propose(p,'old'),/stale/);
});
test('modified call and changed draft cannot submit a treasury proposal',async()=>{
 const h=harness(),p=await h.sdk.prepare({kind:'transfer',token:T,recipient:B,amount:'12'});
 await assert.rejects(()=>h.sdk.propose({...p,data:'0xdead'},'tamper'),/changed/);
 await assert.rejects(()=>h.sdk.propose(p,'stale',{isCurrent:()=>false}),/draft, wallet or network changed/);
 assert.equal(h.events.some(e=>e[0]==='propose'),false);
});
test('Warehouse claim fixes owner AND incentive recipient to treasury, even for another caller',async()=>{
 const h=harness();await h.sdk.claim(T);
 assert.deepEqual(h.events.find(e=>e[0]==='withdraw'),['withdraw',DAO,[T],[7n],DAO]);
 h.state.claimable=0n;await assert.rejects(()=>h.sdk.claim(T),/No claimable/);
});
test('claim rejects changed UI context immediately before wallet write',async()=>{
 const h=harness();await assert.rejects(()=>h.sdk.claim(T,{isCurrent:()=>false}),/changed/);
 assert.equal(h.events.some(e=>e[0]==='withdraw'),false);
});
