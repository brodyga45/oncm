// Read-only reconstruction of the coordinator's three browser transactions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Contract, JsonRpcProvider} from 'ethers';
import {argumentsObject} from './capture-manual-evidence.mjs';
const root=new URL('../',import.meta.url),read=path=>JSON.parse(fs.readFileSync(new URL(path,root)));
const config=read('.state/deployment.json'),abis=read('.state/abis.json');
assert.equal(config.chainId,31373);assert.equal(config.rpcUrl,'http://127.0.0.1:9547');
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
const allocation=new Contract(config.addresses.AllocationController,abis.AllocationController,provider);
const registry=new Contract(config.addresses.StatementRegistry,abis.StatementRegistry,provider);
const token=new Contract(config.addresses.TrueToken,abis.TrueToken,provider);
const actors=config.accounts.slice(0,3),at=blockTag=>({blockTag});
const clean=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));
const parent='0x161806b1b25836962733c2e0c99f9979479784352a7a8b12110bf055e5654684';
const child='0x3c68f27129c8ccde312815a490ca534c86e222f289f2c248697f973d0773662e';
try {
 assert.equal((await provider.getNetwork()).chainId,31373n);
 const receipts=[];
 for(const number of [191,192,193]){
  const block=await provider.getBlock(number);assert.equal(block.transactions.length,1);
  const hash=block.transactions[0],tx=await provider.getTransaction(hash),receipt=await provider.getTransactionReceipt(hash);
  assert.equal(receipt.status,1);assert.equal(tx.to.toLowerCase(),config.addresses.AllocationController.toLowerCase());
  const call=allocation.interface.parseTransaction({data:tx.data,value:tx.value});
  const events=receipt.logs.map(log=>{const event=allocation.interface.parseLog(log);assert(event);return {address:log.address,event:event.name,args:argumentsObject(event.fragment,event.args)};});
  receipts.push({block:number,blockHash:block.hash,timestamp:block.timestamp,hash,from:tx.from,to:tx.to,data:tx.data,value:tx.value,method:call.name,args:argumentsObject(call.fragment,call.args),status:receipt.status,gasUsed:receipt.gasUsed,events});
 }
 assert.deepEqual(receipts.map(r=>r.method),['propose','setConsent','setConsent']);
 assert.deepEqual(receipts.map(r=>r.from.toLowerCase()),[actors[0],actors[0],actors[1]].map(a=>a.toLowerCase()));
 const snapshots=[];
 for(const block of [190,191,192,193]){
  const epoch=await allocation.epoch(at(block)),active=await allocation.allocation(epoch,at(block));
  const consents=await Promise.all(actors.map(a=>allocation.consent(1,a,at(block))));
  const balances=await Promise.all([...actors,config.addresses.ConditionalTokens].map(a=>token.balanceOf(a,at(block))));
  const states=await Promise.all([parent,child].map(id=>registry.getStatement(id,at(block))));
  snapshots.push({block,epoch,active:{split:active.split,recipients:[...active.recipients],weights:[...active.weights]},consents,balances,states:states.map(s=>({dependency:s.dependency,outcome:s.outcome,resolvedAt:s.resolvedAt,conditionId:s.conditionId}))});
 }
 assert.deepEqual(snapshots.map(s=>s.consents),[[false,false,false],[false,false,false],[true,false,false],[true,true,false]]);
 for(const snapshot of snapshots){assert.equal(snapshot.epoch,2n);assert.deepEqual(snapshot.active,snapshots[0].active);assert.deepEqual(snapshot.balances,snapshots[0].balances);assert.deepEqual(snapshot.states,snapshots[0].states);assert(snapshot.states.every(s=>s.outcome===0n));}
 const proposal=await allocation.proposal(1,at(193));
 assert.equal(proposal.baseEpoch,2n);assert.equal(proposal.applied,false);
 assert.deepEqual([...proposal.recipients].map(a=>a.toLowerCase()),[actors[2],actors[1],actors[0]].map(a=>a.toLowerCase()));
 assert.deepEqual([...proposal.weights],[2000n,4000n,4000n]);
 const report={chainId:31373,chainInstance:config.chainInstance.id,throughBlock:193,actors,receipts,snapshots,proposal:{id:1,baseEpoch:proposal.baseEpoch,recipients:[...proposal.recipients],weights:[...proposal.weights],applied:proposal.applied},checks:{exactTwoRequiredConsents:true,thirdActorNeverConsented:true,allocationNotApplied:true,oldAllocationAndTBalancesUnchanged:true,previouslyBlockedDeadlineRecordsUntouched:true},scope:'Read-only historical receipts. Browser disabled/ready observations are separately recorded in README. User added governance-beneficiary requirement before this proposal was applied; it remains ready and untouched.'};
 fs.mkdirSync(new URL('evidence/allocation-consents/',root),{recursive:true});
 fs.writeFileSync(new URL('evidence/allocation-consents/verified.json',root),JSON.stringify(clean(report),null,2)+'\n');
 console.log(JSON.stringify({blocks:receipts.map(r=>r.block),applied:false,checks:report.checks}));
}finally{provider.destroy();}
