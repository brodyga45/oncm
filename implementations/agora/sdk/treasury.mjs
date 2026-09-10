import {encodeFunctionData,isAddress,zeroAddress,formatEther} from 'viem';
import {parseAllocationPercent,parseTokenAmount} from './amounts.mjs';
const TOTAL=1000000n;
export function governanceTreasuryCall(body,config,abis){
 if(body.kind==='allocation-consent'){
  if(!/^(0|[1-9]\d*)$/.test(String(body.proposalId))||BigInt(body.proposalId)>((1n<<256n)-1n))throw Error('Choose an exact nonnegative allocation proposal ID');
  if(typeof body.approve!=='boolean')throw Error('Consent must be true or false');
  const action={kind:body.kind,proposalId:String(body.proposalId),approve:body.approve,controller:config.allocation,executor:config.timelock};
  return{target:config.allocation,data:encodeFunctionData({abi:abis.AllocationController,functionName:'setApproval',args:[BigInt(action.proposalId),action.approve]}),action};
 }
 if(body.kind==='treasury-transfer'){
  if(!isAddress(body.recipient??'')||body.recipient.toLowerCase()===zeroAddress||body.recipient.toLowerCase()===config.timelock.toLowerCase())throw Error('Choose a nonzero recipient other than the treasury');
  const amount=parseTokenAmount(body.amount);if(amount===0n)throw Error('Treasury transfer amount must be positive');
  const action={kind:body.kind,recipient:body.recipient,amount:String(body.amount),rawAmount:String(amount),token:config.token,executor:config.timelock};
  return{target:config.token,data:encodeFunctionData({abi:abis.TrueToken,functionName:'transfer',args:[action.recipient,amount]}),action};
 }
 throw Error('Unsupported treasury governance action');
}
export function governanceShareDraft(allocation,treasury,percentage='20'){
 const target=parseAllocationPercent(percentage);if(target<=0n||target>=TOTAL)throw Error('Draft governance share must be between0 and100%');
 const current=allocation.recipients.map((address,i)=>({address,previous:BigInt(allocation.shares[i])}));
 const people=current.filter(r=>r.address.toLowerCase()!==treasury.toLowerCase()),sum=people.reduce((v,r)=>v+r.previous,0n);
 if(!sum||people.length>31)throw Error('Current allocation cannot produce this proportional draft');
 const remainder=TOTAL-target,rows=people.map(r=>({...r,share:r.previous*remainder/sum,remainder:r.previous*remainder%sum}));
 let extra=remainder-rows.reduce((v,r)=>v+r.share,0n);for(const row of [...rows].sort((a,b)=>a.remainder===b.remainder?a.address.toLowerCase().localeCompare(b.address.toLowerCase()):a.remainder>b.remainder?-1:1)){if(extra===0n)break;row.share++;extra--;}
 rows.push({address:treasury,previous:current.find(r=>r.address.toLowerCase()===treasury.toLowerCase())?.previous??0n,share:target});
 if(rows.some(r=>r.share===0n))throw Error('A draft share rounds to zero; choose explicit recipients instead');
 return rows.sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
}
export const sharePercent=share=>{const x=BigInt(share);return`${x/10000n}.${String(x%10000n).padStart(4,'0')}`.replace(/\.?0+$/,'');};
export function allocationDraftReview(text,allocation){
 if(!text.trim())return null;try{
  const rows=text.trim().split('\n').map(line=>{const parts=line.trim().split(/[\s,]+/);if(parts.length!==2||!isAddress(parts[0])||parts[0].toLowerCase()===zeroAddress)throw Error('Each row needs one nonzero address and percentage');const share=parseAllocationPercent(parts[1]);if(!share)throw Error('Shares must be positive');return{address:parts[0],share};});
  if(rows.length>32||new Set(rows.map(r=>r.address.toLowerCase())).size!==rows.length||rows.reduce((n,r)=>n+r.share,0n)!==TOTAL)throw Error('Use unique addresses and an exact total of100%');
  const all=new Map(allocation.recipients.map((address,i)=>[address.toLowerCase(),{address,previous:BigInt(allocation.shares[i]),share:0n}]));for(const r of rows){const key=r.address.toLowerCase();all.set(key,{...all.get(key),...r,previous:all.get(key)?.previous??0n});}
  return{valid:true,baseEpoch:String(allocation.epoch),rows:[...all.values()].map(r=>({...r,loses:r.share<r.previous}))};
 }catch(e){return{valid:false,error:e.message};}
}
export async function readTreasury({read,config,blockNumber}){
 const at=(address,name,fn,args=[])=>read(address,name,fn,args,{blockNumber});
 const epoch=await at(config.allocation,'AllocationController','currentEpoch'),epochs=[];
 for(let i=0n;i<=epoch;i++){const split=await at(config.allocation,'AllocationController','splits',[i]);epochs.push({epoch:i,split,share:await at(split,'PaymentSplitter','shares',[config.timelock]),claimable:await at(split,'PaymentSplitter','releasable',[config.token,config.timelock]),released:await at(split,'PaymentSplitter','released',[config.token,config.timelock])});}
 return{address:config.timelock,mechanism:'Safe council → Timelock',token:config.token,decimals:18,observedBlock:blockNumber,balance:await at(config.token,'TrueToken','balanceOf',[config.timelock]),epochs};
}

export function assertTreasuryFunds(call,snapshot){
 if(call.action.kind!=='treasury-transfer')return;
 if(snapshot?.balance==null||snapshot.address?.toLowerCase()!==call.action.executor.toLowerCase()||snapshot.token?.toLowerCase()!==call.action.token.toLowerCase())throw Error('Refresh the current governance treasury balance before proposing');
 if(BigInt(call.action.rawAmount)>BigInt(snapshot.balance))throw Error(`Insufficient treasury balance: requested ${call.action.amount} T; available ${formatEther(BigInt(snapshot.balance))} T`);
}
