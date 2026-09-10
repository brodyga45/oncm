import fs from 'node:fs';
import assert from 'node:assert/strict';
import {decodeEventLog,decodeFunctionData} from 'viem';
import {publicClient as pc} from '../sdk/chain.mjs';
const root=new URL('../',import.meta.url),json=p=>JSON.parse(fs.readFileSync(new URL(p,root))),m=json('.local/deployment.json'),abi=n=>json(`artifacts/${n}.json`).abi;
const read=(address,name,functionName,args,blockNumber)=>pc.readContract({address,abi:abi(name),functionName,args,blockNumber});
const [curator,reviewer,mathematician]=m.accounts,actors=m.accounts;
const proposalId=1n,before=93n,after=97n;
assert.equal(await pc.getChainId(),31371);
const receipts=[];
for(let blockNumber=94n;blockNumber<=after;blockNumber++) {
  const b=await pc.getBlock({blockNumber,includeTransactions:true});
  assert.equal(b.transactions.length,1);
  for(const tx of b.transactions) {
    const receipt=await pc.getTransactionReceipt({hash:tx.hash});assert.equal(receipt.status,'success');assert.equal(tx.to.toLowerCase(),m.allocation.toLowerCase());assert.equal(tx.value,0n);
    receipts.push({block:blockNumber,blockHash:b.hash,timestamp:b.timestamp,hash:tx.hash,from:tx.from,to:tx.to,value:tx.value,gasUsed:receipt.gasUsed,call:decodeFunctionData({abi:abi('AllocationController'),data:tx.input}),events:receipt.logs.map(log=>{
      for(const name of ['AllocationController','PaymentSplitter','TrueToken'])try{return{address:log.address,...decodeEventLog({abi:abi(name),data:log.data,topics:log.topics})}}catch{}
      return{address:log.address,unparsed:true};
    })});
  }
}
assert.deepEqual(receipts.map(r=>r.call.functionName),['propose','setApproval','setApproval','execute']);
assert.deepEqual(receipts.map(r=>r.from.toLowerCase()),[curator,curator,reviewer,mathematician].map(a=>a.toLowerCase()));
assert.deepEqual(receipts[1].call.args,[proposalId,true]);assert.deepEqual(receipts[2].call.args,[proposalId,true]);assert.deepEqual(receipts[3].call.args,[proposalId]);
const proposal=await read(m.allocation,'AllocationController','proposal',[proposalId],after);
const planned=[{address:curator,shares:400000n},{address:reviewer,shares:400000n},{address:mathematician,shares:200000n}].sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
assert.deepEqual(proposal.payees.map(a=>a.toLowerCase()),planned.map(p=>p.address.toLowerCase()));assert.deepEqual(proposal.shares,planned.map(p=>p.shares));assert.equal(proposal.baseVersion,1n);assert.equal(proposal.executed,true);
const snapshots=[];
for(const block of [93n,94n,95n,96n,97n]) {
  const epoch=await read(m.allocation,'AllocationController','currentEpoch',[],block),recipients=await read(m.allocation,'AllocationController','recipients',[],block),oldSplits=[];
  for(let e=0n;e<=1n;e++) {
    const address=await read(m.allocation,'AllocationController','splits',[e],block);
    oldSplits.push({epoch:e,address,totalShares:await read(address,'PaymentSplitter','totalShares',[],block),totalReleasedT:await read(address,'PaymentSplitter','totalReleased',[m.token],block),balanceT:await read(m.token,'TrueToken','balanceOf',[address],block),accounts:await Promise.all(actors.map(async actor=>({address:actor,shares:await read(address,'PaymentSplitter','shares',[actor],block),releasedT:await read(address,'PaymentSplitter','released',[m.token,actor],block)})))});
  }
  snapshots.push({block,epoch,recipients,proposalCount:await read(m.allocation,'AllocationController','proposalCount',[],block),proposal:block>93n?await read(m.allocation,'AllocationController','proposal',[proposalId],block):null,approvals:await Promise.all(actors.map(async address=>({address,approved:await read(m.allocation,'AllocationController','approved',[proposalId,address],block)}))),oldSplits,balancesT:await Promise.all([...actors,m.ctf,m.allocation].map(async address=>({address,value:await read(m.token,'TrueToken','balanceOf',[address],block)})))});
}
assert.deepEqual(snapshots.map(s=>s.epoch),[1n,1n,1n,1n,2n]);
assert.deepEqual(snapshots.map(s=>s.approvals.slice(0,3).map(a=>a.approved)),[[false,false,false],[false,false,false],[true,false,false],[true,true,false],[true,true,false]]);
assert.deepEqual(snapshots[0].recipients[1],[500000n,500000n]);
const required=snapshots[0].recipients[0].filter((address,i)=>{const index=proposal.payees.findIndex(p=>p.toLowerCase()===address.toLowerCase());return(index<0?0n:proposal.shares[index])<snapshots[0].recipients[1][i];});
assert.deepEqual(required.map(a=>a.toLowerCase()).sort(),[curator,reviewer].map(a=>a.toLowerCase()).sort());
for(const s of snapshots){assert.deepEqual(s.oldSplits,snapshots[0].oldSplits);assert.deepEqual(s.balancesT,snapshots[0].balancesT);}
assert.equal(snapshots.at(-1).proposalCount-snapshots[0].proposalCount,1n);
assert.deepEqual(snapshots.at(-1).recipients,[proposal.payees,proposal.shares]);
const newSplit=await read(m.allocation,'AllocationController','splits',[2n],after);
assert.ok(!snapshots[0].oldSplits.some(s=>s.address.toLowerCase()===newSplit.toLowerCase()));
const newSplitState={address:newSplit,balanceT:await read(m.token,'TrueToken','balanceOf',[newSplit],after),totalShares:await read(newSplit,'PaymentSplitter','totalShares',[],after),accounts:await Promise.all(planned.map(async p=>({address:p.address,shares:await read(newSplit,'PaymentSplitter','shares',[p.address],after)})))};
assert.equal(newSplitState.balanceT,0n);assert.equal(newSplitState.totalShares,1000000n);assert.deepEqual(newSplitState.accounts.map(a=>a.shares),planned.map(a=>a.shares));
const approvalEvents=receipts.flatMap(r=>r.events.filter(e=>e.eventName==='AllocationApproval'));
assert.equal(approvalEvents.length,2);assert.deepEqual(approvalEvents.map(e=>e.args.beneficiary.toLowerCase()).sort(),required.map(a=>a.toLowerCase()).sort());
assert.ok(receipts.every(r=>r.events.every(e=>!['Transfer','ERC20PaymentReleased'].includes(e.eventName))));
const output={mode:'read-only reconstruction/assertions of root actual browser transactions; no writes or browser claims inferred from tests',chainId:31371,before,after,proposalId,proposal,requiredConsentAddresses:required,newSplitState,receipts,snapshots,checks:{exactPayeesAndShares:true,twoDecreasingOwnersOnly:true,curatorOnlyAt95:true,bothAt96:true,noMathematicianConsent:true,permissionlessMathematicianExecution97:true,oldEpochSplitAddressesSharesReleasedAndBalancesUnchanged:true,allSixActorsTAndCTFCollateralAndControllerTUnchanged:true,noTokenMovement:true,newImmutableEpoch2:true},limits:['UI enabled/disabled observations belong to root manual README, not inferred here','ETH gas balances change; unchanged amounts here refer to T and CTF collateral','No new protocol income was generated or released in these four transactions']};
fs.writeFileSync(new URL('evidence/allocation-multiple-consents/verified.json',root),JSON.stringify(output,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
console.log(JSON.stringify({blocks:receipts.map(r=>String(r.block)),required:required,newSplit,oldSplitsUnchanged:true,TUnchanged:true,transactions:receipts.map(r=>r.hash)}));
