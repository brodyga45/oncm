import {getAddress, ZeroAddress, Interface, parseUnits, formatUnits} from 'ethers';

const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const address=value=>{const result=getAddress(value);assert(result!==ZeroAddress,'Zero address is not a recipient');return result;};
export function parseAllocationRows(text){
  const rows=String(text).trim().split('\n').map(line=>{
    const fields=line.split(',');assert(fields.length===2,'Use one address,percentage per line');
    const percent=fields[1].trim();assert(/^\d+(?:\.\d{1,2})?$/.test(percent),'Percentages require at most two decimal places');
    const share=Number(parseUnits(percent,2));assert(Number.isSafeInteger(share)&&share>0&&share<=10000,'Invalid percentage');
    return{address:address(fields[0].trim()),share};
  }).sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
  assert(rows.length<=32,'At most 32 recipients');assert(new Set(rows.map(r=>r.address.toLowerCase())).size===rows.length,'Duplicate recipient');
  assert(rows.reduce((sum,r)=>sum+r.share,0)===10000,'Percentages must total exactly 100%');return rows;
}

// Draft only. Existing recipients are scaled proportionally using exact basis
// points; the largest remainders (then address order) receive residual points.
export function allocationWithGovernance(rows,treasury,share=2000){
  treasury=address(treasury);assert(Number.isSafeInteger(share)&&share>0&&share<10000,'DAO share must be between 0 and 100%');
  const validated=parseAllocationRows(rows.map(r=>`${r.address},${formatUnits(r.share,2)}`).join('\n'));
  const others=validated.filter(r=>!same(r.address,treasury));assert(others.length&&others.length<32,'DAO allocation requires 1–31 other recipients');
  const total=others.reduce((sum,r)=>sum+BigInt(r.share),0n),remaining=BigInt(10000-share);
  const scaled=others.map(r=>({...r,share:Number(BigInt(r.share)*remaining/total),remainder:BigInt(r.share)*remaining%total}));
  const ranked=[...scaled].sort((a,b)=>a.remainder===b.remainder?a.address.toLowerCase().localeCompare(b.address.toLowerCase()):a.remainder>b.remainder?-1:1);
  let missing=10000-share-scaled.reduce((sum,r)=>sum+r.share,0);for(let i=0;i<missing;i++)ranked[i].share++;
  assert(scaled.every(r=>r.share>0),'A recipient would round to zero; enter an explicit allocation instead');
  return[...scaled.map(({address,share})=>({address,share})),{address:treasury,share}].sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
}

export async function readTreasury(sdk,assets=[]){
  assert(Number((await sdk.provider.getNetwork()).chainId)===31372,'DAO treasury requires local chain 31372');
  const block=await sdk.provider.getBlock('latest'),at={blockTag:block.number};
  const governor=sdk.contract('governor').connect(sdk.provider),allocation=sdk.contract('allocation').connect(sdk.provider),warehouse=sdk.contract('warehouse').connect(sdk.provider);
  const treasury=address(await governor.timelock(at));
  const [currentEpoch,count,withdrawConfig]=await Promise.all([allocation.currentEpoch(at),allocation.proposalCount(at),warehouse.withdrawConfig(treasury,at)]);
  const epoch=await allocation.epoch(currentEpoch,at),idx=epoch.recipients.findIndex(r=>same(r,treasury));
  const proposals=[];
  for(let id=1;id<=Number(count);id++){
    const p=await allocation.proposal(id,at),[losing,consent]=await Promise.all([allocation.isLosing(id,treasury,at),allocation.consent(id,treasury,at)]);
    proposals.push({id,baseEpoch:String(p.base),applied:p.applied,losing,consent,current:String(p.base)===String(currentEpoch),recipients:[...p.recipients],shares:[...p.shares].map(String)});
  }
  const unique=new Map([[sdk.deployment.contracts.token.toLowerCase(),{address:sdk.deployment.contracts.token,label:'T · collateral',kind:'T'}]]);
  for(const input of assets){const asset=address(input.address);if(!unique.has(asset.toLowerCase()))unique.set(asset.toLowerCase(),{...input,address:asset,kind:'LP'});}
  const balances=await Promise.all([...unique.values()].map(async asset=>{
    const token=sdk.erc20(asset.address).connect(sdk.provider),[balance,credit,decimals,symbol]=await Promise.all([token.balanceOf(treasury,at),warehouse.balanceOf(treasury,BigInt(asset.address),at),token.decimals(at),token.symbol(at)]);
    assert(Number.isInteger(Number(decimals))&&Number(decimals)>=0&&Number(decimals)<=255,'Invalid token decimals');
    return{...asset,decimals:Number(decimals),symbol,balance:String(balance),warehouseBalance:String(credit),claimable:String(credit>0n?credit-1n:0n)};
  }));
  sdk.assertCurrent?.();
  return{chainId:31372,blockNumber:block.number,blockHash:block.hash,blockTimestamp:block.timestamp,treasury,governor:sdk.deployment.contracts.governor,
    allocation:sdk.deployment.contracts.allocation,warehouse:sdk.deployment.contracts.warehouse,currentEpoch:String(currentEpoch),
    recipients:[...epoch.recipients],shares:[...epoch.shares].map(String),share:idx<0?'0':String(epoch.shares[idx]),
    withdrawalPaused:Boolean(withdrawConfig.paused??withdrawConfig[1]),withdrawalIncentive:String(withdrawConfig.incentive??withdrawConfig[0]),proposals,assets:balances};
}

export function treasuryCall(snapshot,input,abis){
  const treasury=address(snapshot.treasury);let target,data,description,review={kind:input.kind,treasury,observedBlock:snapshot.blockNumber};
  if(input.kind==='consent'||input.kind==='revoke'){
    assert(/^\d+$/.test(String(input.proposalId)),'Choose an allocation proposal');
    const p=snapshot.proposals.find(p=>String(p.id)===String(input.proposalId));
    assert(p&&p.current&&!p.applied&&p.losing,'DAO must be a losing recipient of a current unapplied proposal');
    const approved=input.kind==='consent';assert(p.consent!==approved,approved?'DAO already consented':'DAO consent is already absent');
    target=snapshot.allocation;data=new Interface(abis.AllocationController).encodeFunctionData('setConsent',[p.id,approved]);
    review={...review,proposalId:String(p.id),baseEpoch:p.baseEpoch,approved,recipients:p.recipients,shares:p.shares};
    description=`DAO ${approved?'consent to':'revoke consent for'} allocation #${p.id}, base epoch ${p.baseEpoch}; beneficiary ${treasury}`;
  }else{
    const asset=snapshot.assets.find(a=>same(a.address,input.asset));assert(asset,'Choose a known T or market LP asset');
    review={...review,asset:asset.address,assetLabel:asset.label,assetKind:asset.kind,decimals:asset.decimals};
    if(input.kind==='claim'){
      assert(BigInt(asset.claimable)>0n,'No withdrawable DAO Warehouse credit');
      target=snapshot.warehouse;data=new Interface(abis.SplitsWarehouse).encodeFunctionData('withdraw(address,address)',[treasury,asset.address]);
      description=`Claim DAO Warehouse credit to ${treasury}: ${asset.label} (${asset.address})`;
      review={...review,owner:treasury,recipient:treasury,observedClaimable:asset.claimable,amountPolicy:'entire current credit minus one raw unit at execution'};
    }else{
      assert(input.kind==='transfer','Unknown DAO action');const recipient=address(input.recipient);assert(!same(recipient,treasury),'Choose a recipient outside this treasury');
      assert(/^\d+(?:\.\d+)?$/.test(String(input.amount)),'Enter an exact positive token amount');
      const amount=parseUnits(input.amount,asset.decimals);assert(amount>0n&&amount<=BigInt(asset.balance),'Amount exceeds the DAO token balance or is zero');
      target=asset.address;data=new Interface(abis.TrueToken).encodeFunctionData('transfer',[recipient,amount]);
      description=`DAO distribution: ${formatUnits(amount,asset.decimals)} ${asset.kind} (${asset.address}) to ${recipient}`;
      review={...review,recipient,amount:String(amount),formattedAmount:formatUnits(amount,asset.decimals)};
    }
  }
  return{targets:[target],values:['0'],calldatas:[data],description,review};
}

export function refreshTreasuryCall(previous,snapshot,input,abis){
  assert(same(previous.review.treasury,snapshot.treasury),'Governor executor changed; prepare the call again');
  const fresh=treasuryCall(snapshot,input,abis);
  assert(JSON.stringify([previous.targets,previous.values,previous.calldatas])===JSON.stringify([fresh.targets,fresh.values,fresh.calldatas]),'DAO call changed; prepare it again');
  if(previous.review.baseEpoch!==undefined)assert(previous.review.baseEpoch===fresh.review.baseEpoch,'Allocation epoch changed');
  return fresh;
}
