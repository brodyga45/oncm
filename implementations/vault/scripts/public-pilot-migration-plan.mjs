// Pure review helpers. These functions encode ordinary transactions and never send them.
import {Interface,ZeroAddress,getAddress} from 'ethers';
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
const allocationABI=new Interface(['function propose(address[],uint256[]) returns(uint256)','function setConsent(uint256,bool)','function applyAllocation(uint256)']);
export function preparePilotFeeMigration(plan,proposalCount){
 const current=plan.preserved.allocation,owner=getAddress(plan.owner),executor=plan.observed.addresses.Timelock;
 const old=current.recipients.map((address,i)=>({address,weight:BigInt(current.weights[i])}));
 const dao=old.find(r=>same(r.address,executor));
 if(!dao||dao.weight!==1500n||old.length!==3)throw Error('Expected reviewed 40/15/45 epoch');
 const devs=old.filter(r=>!same(r.address,executor));
 const expected=new Map([['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',4500n],['0x70997970c51812dc3a010c7d01b50e0d17dc79c8',4000n]]);
 if(devs.some(r=>expected.get(r.address.toLowerCase())!==r.weight))throw Error('Unexpected decreasing beneficiaries');
 if(!Number.isSafeInteger(Number(proposalCount))||BigInt(proposalCount)<0n)throw Error('Exact proposal count required');
 const rows=[{address:owner,weight:'8500'},{address:executor,weight:'1500'}].sort((a,b)=>BigInt(a.address)<BigInt(b.address)?-1:1);
 const id=String(proposalCount),to=current.controller,from=old.find(r=>r.weight===4500n).address;
 return {format:'vault-public-pilot-fee-migration-v1',chainId:31373,instance:plan.observed.chainInstance,observed:plan.observed.block,controller:to,baseEpoch:current.epoch,expectedProposalId:id,
  before:current,after:{epoch:String(BigInt(current.epoch)+1n),recipients:rows.map(r=>r.address),weights:rows.map(r=>r.weight),split:'New immutable PullSplit address is read from actual EpochActivated receipt.'},
  transactions:[{step:'propose',from,to,value:'0',calldata:allocationABI.encodeFunctionData('propose',[rows.map(r=>r.address),rows.map(r=>r.weight)])},
   ...devs.map(r=>({step:'consent',from:r.address,to,value:'0',calldata:allocationABI.encodeFunctionData('setConsent',[id,true]),decreasesFrom:String(r.weight),decreasesTo:'0'})),
   {step:'apply',from,to,value:'0',calldata:allocationABI.encodeFunctionData('applyAllocation',[id])}],
  preconditions:['Immediately before propose, reread exact epoch, old rows and proposalCount. Abort on any difference.','Confirm actual AllocationProposed receipt has the expected id, baseEpoch and exact rows before signing any consent.','Before apply, reread proposal rows/baseEpoch plus both actual consents. No Timelock consent is needed because its 15% is unchanged.'],
  preserves:'Previous epochs and accrued Split/Warehouse claims remain historical. Only future collect/sweep goes to the new epoch; no old credit claim, DAO payout, donation or token mint is part of this plan.'};
}
export function preparePilotGasFunding(plan){
 const from=getAddress('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'),balance=plan.balances.find(x=>same(x.address,from));
 const value=100n*10n**18n;if(!balance||BigInt(balance.nativeWei)<=value)throw Error('Insufficient Alice native balance with gas reserve');
 if(same(plan.owner,from)||same(plan.owner,ZeroAddress))throw Error('Invalid recipient');
 return {from,to:plan.owner,value:String(value),calldata:'0x',asset:'Native valueless pilot ETH on chain31373',amount:'100',beforeWei:balance.nativeWei,precondition:'Reread nonce and native balance immediately before ordinary EOA transfer. Leave Alice gas for the remaining handoff actions. This is not mainnet ETH.'};
}
