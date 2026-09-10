// Historical RPC reads only. Browser transactions are never reproduced here.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {decodeEventLog,decodeFunctionData} from 'viem';
import {publicClient as pc} from '../sdk/chain.mjs';
const root=new URL('../',import.meta.url),json=p=>JSON.parse(fs.readFileSync(new URL(p,root))),m=json('.local/deployment.json'),abi=n=>json(`artifacts/${n}.json`).abi;
const lower=a=>a.toLowerCase(),read=(address,name,functionName,args,blockNumber)=>pc.readContract({address,abi:abi(name),functionName,args,blockNumber});
const token=(address,b)=>read(m.token,'TrueToken','balanceOf',[address],b),actors=[...m.accounts,m.timelock];
const noId='0xf99268c5feca503310a5e715a06ac97184747585713ea1c5f94e0f5c1092cd41',trueId='0x73fa8ef632b54063d2ad7902620a0ba9d225fde5021f6fddb2ade08997aa3c92',pool='0x6D544390Eb535d61e196c87d6B9c80dCD8628Acd';
assert.equal(await pc.getChainId(),31371);
const abis=['AllocationController','PaymentSplitter','TrueToken','FixedProductMarketMaker','ConditionalTokens','Safe','AgoraTimelock','AgoraRegistry'].map(n=>abi(n));
const receipts=[],blocks=[];
for(let b=98n;b<=110n;b++){
 const block=await pc.getBlock({blockNumber:b,includeTransactions:true});blocks.push({number:b,hash:block.hash,timestamp:block.timestamp,transactionCount:block.transactions.length});
 assert.equal(block.transactions.length,b===108n?0:1);
 for(const tx of block.transactions){const r=await pc.getTransactionReceipt({hash:tx.hash});assert.equal(r.status,'success');assert.equal(tx.value,0n);let call;for(const a of abis)try{call=decodeFunctionData({abi:a,data:tx.input});break;}catch{}
  const events=r.logs.map(log=>{for(const a of abis)try{return{address:log.address,logIndex:log.logIndex,...decodeEventLog({abi:a,data:log.data,topics:log.topics})}}catch{}return{address:log.address,topics:log.topics,data:log.data};});
  receipts.push({block:b,hash:tx.hash,from:tx.from,to:tx.to,value:tx.value,gasUsed:r.gasUsed,call,events});
 }
}
const at=b=>receipts.find(r=>r.block===BigInt(b)),event=(b,n)=>at(b).events.filter(e=>e.eventName===n);
assert.deepEqual(receipts.map(r=>r.call.functionName),['propose','setApproval','setApproval','setApproval','execute','approve','buyWithDeadline','release','propose','execTransaction','execute','execute']);
assert.deepEqual([99,100,101].map(b=>lower(at(b).from)),m.accounts.slice(0,3).map(lower));
for(const b of [99,100,101])assert.deepEqual(at(b).call.args,[2n,true]);
assert.equal(lower(at(104).from),lower(m.accounts[4]));assert.equal(lower(at(104).to),lower(pool));
const fee=event(104,'ProtocolFeePaid')[0],buy=event(104,'FPMMBuy')[0];assert.equal(fee.args.amount,4000000000000000n);assert.equal(fee.args.epoch,3n);assert.equal(buy.args.investmentAmount,1000000000000000000n);assert.equal(buy.args.feeAmount,20000000000000000n);assert.equal(buy.args.outcomeIndex,1n);
assert.equal(lower(at(105).from),lower(m.accounts[5]));assert.deepEqual(at(105).call.args.map(x=>typeof x==='string'?lower(x):x),[lower(m.token),lower(m.timelock)]);
const transfer=event(105,'Transfer')[0];assert.equal(lower(transfer.args.to),lower(m.timelock));assert.equal(transfer.args.value,800000000000000n);
const approval=event(109,'AllocationApproval');assert.equal(approval.length,1);assert.equal(lower(approval[0].args.beneficiary),lower(m.timelock));assert.equal(approval[0].args.proposalId,3n);assert.equal(approval[0].args.approved,true);
assert.equal(event(107,'ExecutionSuccess').length,1);assert.equal(event(107,'CallScheduled').length,1);assert.equal(event(109,'CallExecuted').length,1);
const scheduled=event(107,'CallScheduled')[0],executed=event(109,'CallExecuted')[0];assert.equal(scheduled.args.id,executed.args.id);assert.equal(lower(executed.args.target),lower(m.allocation));assert.deepEqual(decodeFunctionData({abi:abi('AllocationController'),data:executed.args.data}),{functionName:'setApproval',args:[3n,true]});
const snapshots=[];
for(const block of [97n,98n,99n,100n,101n,102n,104n,105n,106n,107n,109n,110n]){
 const epoch=await read(m.allocation,'AllocationController','currentEpoch',[],block),splits=[];
 for(let e=0n;e<=epoch;e++){
  const address=await read(m.allocation,'AllocationController','splits',[e],block);
  splits.push({epoch:e,address,balance:await token(address,block),denominator:await read(address,'PaymentSplitter','totalShares',[],block),treasuryClaimable:await read(address,'PaymentSplitter','releasable',[m.token,m.timelock],block),treasuryReleased:await read(address,'PaymentSplitter','released',[m.token,m.timelock],block),shares:await Promise.all(actors.map(a=>read(address,'PaymentSplitter','shares',[a],block)))});
 }
 const approvals={};for(const p of [2n,3n])approvals[p]=await Promise.all(actors.map(a=>read(m.allocation,'AllocationController','approved',[p,a],block)));
 snapshots.push({block,epoch,recipients:await read(m.allocation,'AllocationController','recipients',[],block),safeNonce:await read(m.safe,'Safe','nonce',[],block),balancesT:await Promise.all(actors.map(a=>token(a,block))),approvals,splits,no:await read(m.registry,'AgoraRegistry','getStatement',[noId],block),true:await read(m.registry,'AgoraRegistry','getStatement',[trueId],block)});
}
const snap=b=>snapshots.find(s=>s.block===BigInt(b)),last=snap(110);
for(const s of snapshots){assert.deepEqual(s.splits.slice(0,3),snap(97).splits);assert.deepEqual(s.no,snap(97).no);assert.deepEqual(s.true,snap(97).true);assert.equal(s.no.outcome,0);}
assert.deepEqual(snap(99).approvals[2],[true,false,false,false,false,false,false]);assert.deepEqual(snap(100).approvals[2],[true,true,false,false,false,false,false]);assert.deepEqual(snap(101).approvals[2],[true,true,true,false,false,false,false]);
assert.deepEqual(snap(106).approvals[3],[false,false,false,false,false,false,false]);assert.deepEqual(snap(109).approvals[3],[false,false,false,false,false,false,true]);assert.deepEqual(last.approvals[3],snap(109).approvals[3]);
assert.deepEqual(snap(102).recipients[1],[160000n,320000n,200000n,320000n]);assert.deepEqual(last.recipients[1],[160000n,320000n,150000n,370000n]);assert.equal(last.epoch,4n);assert.equal(snap(107).safeNonce-snap(106).safeNonce,1n);
assert.equal(lower(fee.args.split),lower(snap(104).splits[3].address));assert.equal(lower(transfer.args.from),lower(fee.args.split));assert.equal(snap(104).splits[3].balance,4000000000000000n);assert.equal(snap(104).splits[3].treasuryClaimable,800000000000000n);
assert.equal(snap(105).balancesT[5],snap(104).balancesT[5]);assert.equal(snap(105).balancesT[6]-snap(104).balancesT[6],800000000000000n);assert.equal(last.balancesT[6],800000000000000n);assert.deepEqual(snap(105).balancesT,last.balancesT);assert.deepEqual(snap(105).splits,last.splits.slice(0,4));
assert.equal(last.splits[4].balance,0n);assert.ok(last.splits.every(s=>s.denominator===1000000n));assert.equal(last.splits[3].treasuryReleased,800000000000000n);assert.equal(last.splits[3].treasuryClaimable,0n);
const proposals=await Promise.all([2n,3n].map(id=>read(m.allocation,'AllocationController','proposal',[id],110n)));assert.ok(proposals.every(p=>p.executed));
const output={mode:'Actual own-browser transactions, reconstructed and asserted read-only. No writes or signing in this script.',chainId:31371,range:[97,110],actors,addresses:{token:m.token,allocation:m.allocation,safe:m.safe,timelock:m.timelock,noPool:pool},blocks,receipts,snapshots,proposals,checks:{threeHumanConsents:true,actualProtocolIncome:true,claimPaysTreasuryNotCaller:true,onlyTimelockSecondProposalConsent:true,safeTwoOfTwoAndTimelockExecution:true,oldEpochFundsNotReallocated:true,denominator1000000:true,noBaseSettlements:true,noInternalTreasuryPayment:true},limits:['UI gate observations are in README; not inferred from RPC tests','Payment review eth_call is not a payout or a governance proposal','Only T income/consent path completed; internal distribution awaits explicit confirmation']};
fs.writeFileSync(new URL('evidence/treasury-beneficiary/browser-through-110.json',root),JSON.stringify(output,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
console.log(JSON.stringify({checks:output.checks,blocks:receipts.map(r=>String(r.block)),transactions:receipts.map(r=>r.hash),treasuryBalance:String(last.balancesT[6]),epoch:String(last.epoch)}));
