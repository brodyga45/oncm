import { Contract, Interface, ZeroAddress, getAddress, formatEther, keccak256 } from 'ethers';

const MAX_UINT256 = (1n << 256n) - 1n;
export function monetaryUint(value, label = 'Amount', max = MAX_UINT256) {
  if (typeof value !== 'string' && typeof value !== 'bigint') throw Error(`${label}: use an exact integer string`);
  if (!/^(0|[1-9][0-9]*)$/.test(String(value))) throw Error(`${label}: expected an unsigned integer`);
  const amount = BigInt(value);
  if (amount > max) throw Error(`${label}: outside the supported integer range`);
  return amount;
}
export function parseMonetaryAmount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(value)) {
    throw Error('T amount must be an exact decimal string with at most 18 decimal places');
  }
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  if (amount > MAX_UINT256) throw Error('T amount exceeds uint256');
  return amount;
}
export function formatMonetaryAmount(value) { return formatEther(monetaryUint(value)); }
export function monetaryAddress(value, label = 'Address') {
  let address; try { address = getAddress(value); } catch { throw Error(`${label}: invalid EVM address`); }
  if (address === ZeroAddress) throw Error(`${label}: zero address is not supported`);
  return address;
}

const LEGACY_REASON = 'Текущий Vault T имеет только genesis-выпуск. Управляемая эмиссия требует отдельной явно выбранной версии развёртывания; текущие рынки не изменены.';
export const MONETARY_ABI = {
  token:['function totalSupply() view returns(uint256)','function decimals() view returns(uint8)','function owner() view returns(address)','function balanceOf(address) view returns(uint256)','function mint(address,uint256)'],
  rewards:['function governance() view returns(address)','function token() view returns(address)','function reserved() view returns(uint256)','function programCount() view returns(uint256)',
    'function programs(uint256) view returns(address meter,uint64 start,uint64 end,uint64 claimDeadline,address remainderRecipient,uint256 budget,uint256 paid,uint256 reclaimed,uint256 totalWeight,bool closed)',
    'function weights(uint256,address) view returns(uint256)','function claimed(uint256,address) view returns(bool)','function claimable(uint256,address) view returns(uint256)',
    'function createProgram(uint256 expectedId,address meter,uint64 start,uint64 end,uint64 claimDeadline,uint256 budget,address remainderRecipient)',
    'function claim(uint256)','function close(uint256) returns(uint256 remainder)'],
  governor:['function timelock() view returns(address)','function propose(address[],uint256[],bytes[],string) returns(uint256)'],
  meter:['function configureProgram(uint256 programId,address pool,uint8 metric)','function registeredPool(address) view returns(bool)','function programBinding(uint256) view returns(address pool,uint8 metric,bool configured)'],
  lp:['function configureProgram(uint256 programId,address pool)','function programPool(uint256) view returns(address)','function deposits(uint256,address) view returns(uint256)','function stake(uint256,uint256)','function withdraw(uint256)'],
  bpt:['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'],
  allocation:['function setPoolSwapFee(address,uint256)','function setCreatorFee(address,uint256)','function officialPool(address) view returns(bool)'],
  controller:['function setGlobalProtocolSwapFeePercentage(uint256)','function getGlobalProtocolSwapFeePercentage() view returns(uint256)','function getPoolCreatorSwapFeePercentage(address) view returns(uint256)',
    'function vault() view returns(address)','function getPoolProtocolSwapFeeInfo(address) view returns(uint256 protocolSwapFeePercentage,bool isOverride)','function updateProtocolSwapFeePercentage(address)'],
  vault:['function getStaticSwapFeePercentage(address) view returns(uint256)',
    'function getHooksConfig(address) view returns(tuple(bool enableHookAdjustedAmounts,bool shouldCallBeforeInitialize,bool shouldCallAfterInitialize,bool shouldCallComputeDynamicSwapFee,bool shouldCallBeforeSwap,bool shouldCallAfterSwap,bool shouldCallBeforeAddLiquidity,bool shouldCallAfterAddLiquidity,bool shouldCallBeforeRemoveLiquidity,bool shouldCallAfterRemoveLiquidity,address hooksContract))'],
  coordinator:['function count() view returns(uint256)','function getPool(uint256) view returns(tuple(address pool,bytes32 statementId,uint8 side,uint256 outcomeWeight,address creator))','function statementOfPool(address) view returns(bytes32)','function hooks(bytes32) view returns(address)'],
  hookBindings:['function registry() view returns(address)','function vault() view returns(address)','function factory() view returns(address)','function statementId() view returns(bytes32)','function governance() view returns(address)','function feeSink() view returns(address)','function trustedRouter() view returns(address)','function trustedRouterCodeHash() view returns(bytes32)','function rewards() view returns(address)'],
};
const same=(a,b)=>a?.toLowerCase()===b?.toLowerCase();
const asJSON=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));
const uint64=v=>monetaryUint(v,'Unix time',(1n<<64n)-1n);
const encoded=(abi,method,args)=>new Interface(abi).encodeFunctionData(method,args);
export function parseMonetaryPercent(value){
  const scaled=parseMonetaryAmount(value);
  if(scaled>100n*10n**18n||scaled%100n!==0n)throw Error('Percentage must be 0–100 with at most 16 decimal places');
  return scaled/100n;
}
export function createMonetaryPolicy({provider, config, write, send,
  contract=(address,abi)=>new Contract(address,abi,write||provider)}) {
  // Capability comes from an explicit deployment descriptor, never from an ABI
  // file changed on disk. The initial legacy deployment has no mint entrypoint.
  async function base() {
    if ((await provider.getNetwork()).chainId !== BigInt(config.chainId)) throw Error('Vault monetary snapshot network differs from its deployment');
    if(BigInt(config.chainId)!==31373n)throw Error('This Vault monetary SDK requires chain31373');
    const block=await provider.getBlock('latest'),at={blockTag:block.number};
    const token=monetaryAddress(config.addresses.TrueToken,'T token');
    const totalSupply=await contract(token,['function totalSupply() view returns(uint256)']).totalSupply(at);
    return{token,totalSupply:String(totalSupply),blockNumber:block.number,blockHash:block.hash,timestamp:block.timestamp,at};
  }
  async function code(address,c){
    c.verifiedCodes??=new Set();if(c.verifiedCodes.has(address.toLowerCase()))return;
    const expected=Object.entries(config.monetaryPolicy.runtimeHashes||{}).find(([a])=>same(a,address))?.[1];
    if(!expected||!/^0x[0-9a-fA-F]{64}$/.test(expected))throw Error(`Missing pinned monetary runtime hash for ${address}`);
    const bytecode=await provider.getCode(address,c.blockNumber);
    if(bytecode==='0x'||!same(keccak256(bytecode),expected))throw Error(`Monetary runtime code differs from deployment pin: ${address}`);
    c.verifiedCodes.add(address.toLowerCase());
  }
  async function context(){
    const c=await base(),d=config.monetaryPolicy;
    if(!d||String(config.protocolVersion)!=='2'||d.version!=='vault-monetary-v1'||d.status!=='deployed')throw Error(LEGACY_REASON);
    const rewards=monetaryAddress(d.rewards,'RewardBudget'),executor=monetaryAddress(d.governance,'Timelock');
    if(!same(d.token,c.token)||!same(executor,config.addresses.Timelock)||!same(rewards,config.addresses.RewardBudget))throw Error('Monetary descriptor differs from the selected deployment');
    for(const address of[c.token,rewards,executor,config.addresses.Governor])await code(address,c);
    const token=contract(c.token,MONETARY_ABI.token),budget=contract(rewards,MONETARY_ABI.rewards),governor=contract(config.addresses.Governor,MONETARY_ABI.governor);
    if(!same(await governor.timelock(c.at),executor)||!same(await token.owner(c.at),executor)||!same(await budget.governance(c.at),executor)||!same(await budget.token(c.at),c.token))throw Error('Monetary token, reward budget or governance authority binding failed');
    if(BigInt(await token.decimals(c.at))!==18n)throw Error('The selected monetary T must have18 decimals');
    return{...c,rewards,executor,descriptor:d,budget,governor,tokenContract:token,programCount:BigInt(await budget.programCount(c.at))};
  }
  async function discoverTradeMeter(c,pool){
    pool=monetaryAddress(pool,'Balancer pool');const a=config.addresses;
    for(const address of[a.PoolCoordinator,a.StatementRegistry,a.AllocationController,a.WeightedPoolFactory,a.Router,a.Vault])await code(address,c);
    const coordinator=contract(a.PoolCoordinator,MONETARY_ABI.coordinator),statementId=await coordinator.statementOfPool(pool,c.at);
    if(/^0x0{64}$/.test(statementId))throw Error('Pool is not registered by the pinned V2 coordinator');
    const address=monetaryAddress(await coordinator.hooks(statementId,c.at),'Created hook');
    const hooks=await contract(a.Vault,MONETARY_ABI.vault).getHooksConfig(pool,c.at);
    if(!same(hooks[10],address)||!hooks[4]||!hooks[5]||hooks[0])throw Error('Original Vault hook binding/flags differ from the metered pool policy');
    const hook=contract(address,[...MONETARY_ABI.hookBindings,...MONETARY_ABI.meter]);
    const bindings={registry:a.StatementRegistry,vault:a.Vault,factory:a.WeightedPoolFactory,governance:c.executor,feeSink:a.AllocationController,trustedRouter:a.Router,rewards:c.rewards};
    for(const [getter,expected]of Object.entries(bindings))if(!same(await hook[getter](c.at),expected))throw Error(`Created hook immutable ${getter} differs from the selected deployment`);
    if(!same(await hook.statementId(c.at),statementId)||!await hook.registeredPool(pool,c.at))throw Error('Created hook does not bind this exact pool/statement');
    const routerHash=keccak256(await provider.getCode(a.Router,c.blockNumber));if(!same(await hook.trustedRouterCodeHash(c.at),routerHash))throw Error('Created hook router code binding changed');
    const observedCode=await provider.getCode(address,c.blockNumber);if(observedCode==='0x')throw Error('Created hook has no bytecode');
    return{address,kind:'trade',name:`Balancer statement hook ${statementId.slice(0,10)}`,pool,statementId,metrics:['0','1'],observedRuntimeHash:keccak256(observedCode),validation:'Pinned coordinator creation path and exact immutable links; observed hook hash is not a static fixture pin'};
  }
  async function program(c,id,account){
    id=monetaryUint(String(id),'Program ID');if(id>=c.programCount)throw Error('Unknown reward program');
    const p=await c.budget.programs(id,c.at);let meter=c.descriptor.meters?.find(m=>same(m.address,p[0]));
    const totalWeight=BigInt(p[8]),weight=account?BigInt(await c.budget.weights(id,account,c.at)):0n;
    const details={};
    if(!meter)try{const binding=await contract(p[0],MONETARY_ABI.meter).programBinding(id,c.at);const discovered=await discoverTradeMeter(c,binding[0]);if(same(discovered.address,p[0]))meter=discovered;}catch(e){details.meterValidationError=e.message;}
    if(meter){if(!meter.validation)await code(meter.address,c);if(meter.kind==='lp'){
      const meterContract=contract(meter.address,MONETARY_ABI.lp);details.pool=await meterContract.programPool(id,c.at);details.deposit=account?String(await meterContract.deposits(id,account,c.at)):'0';
      details.canStake=BigInt(c.timestamp)>=BigInt(p[1])&&BigInt(c.timestamp)<BigInt(p[2])&&!p[9];details.canWithdraw=BigInt(c.timestamp)>=BigInt(p[2])&&BigInt(details.deposit)>0n;
    }else if(meter.kind==='trade'){const binding=await contract(meter.address,MONETARY_ABI.meter).programBinding(id,c.at);details.pool=binding[0];details.metric=String(binding[1]);details.configured=binding[2];}}
    return{id:String(id),meter:p[0],kind:meter?.kind||'external',name:meter?.name||'External configured meter',start:String(p[1]),end:String(p[2]),claimDeadline:String(p[3]),remainderRecipient:p[4],budget:String(p[5]),paid:String(p[6]),reclaimed:String(p[7]),totalWeight:String(totalWeight),closed:p[9],accountWeight:String(weight),...details,
      claimed:account?await c.budget.claimed(id,account,c.at):false,claimable:account?String(await c.budget.claimable(id,account,c.at)):'0',
      formula:'After end: floor(budget × participant weight / total weight); one claim per account; unclaimed remainder closes to the fixed recipient after the deadline.'};
  }
  async function snapshot(account='',{offset='0',limit='20'}={}){
    if(account)account=monetaryAddress(account,'Participant');
    if(!config.monetaryPolicy)return{...asJSON(await base()),supported:false,status:'legacy',reason:LEGACY_REASON,account};
    const c=await context(),first=monetaryUint(offset,'Page offset'),size=monetaryUint(limit,'Page size',50n);
    if(size===0n)throw Error('Page size must be positive');
    const end=first+size<c.programCount?first+size:c.programCount,programs=[];
    for(let id=first;id<end;id++)programs.push(await program(c,id,account));
    const balance=BigInt(await c.tokenContract.balanceOf(c.rewards,c.at)),reserved=BigInt(await c.budget.reserved(c.at));
    if(reserved>balance)throw Error('Reward budget reserve exceeds actual T balance');
    return{supported:true,status:'deployed',version:c.descriptor.version,token:c.token,rewards:c.rewards,executor:c.executor,totalSupply:c.totalSupply,blockNumber:c.blockNumber,blockHash:c.blockHash,timestamp:c.timestamp,account,
      balance:String(balance),reserved:String(reserved),unreserved:String(balance-reserved),programCount:String(c.programCount),programs,meters:c.descriptor.meters||[],nextOffset:end<c.programCount?String(end):null};
  }
  async function prepare(input){
    const c=await context();let normalized,targets=[],calldatas=[],review;
    if(input.kind==='mint'){
      const amount=parseMonetaryAmount(input.amountT),recipient=monetaryAddress(input.recipient,'Issuance recipient');
      if(!amount||BigInt(c.totalSupply)+amount>MAX_UINT256)throw Error('Issuance must be positive and fit uint256 totalSupply');
      normalized={kind:'mint',recipient,amountT:input.amountT};targets=[c.token];calldatas=[encoded(MONETARY_ABI.token,'mint',[recipient,amount])];
      await provider.call({from:c.executor,to:c.token,data:calldatas[0],blockTag:c.blockNumber});
      review={method:'Governed initial or additional T issuance',recipient,amount:String(amount),totalSupplyBefore:c.totalSupply,hypotheticalTotalSupplyAfter:String(BigInt(c.totalSupply)+amount),simulation:'Exact mint call passed eth_call from the actual Timelock; no tokens were issued',incomeDestination:'Issuance to the chosen recipient. This is not protocol fee income and creates no MEMBER votes.'};
    }else if(input.kind==='create-program'){
      const budget=parseMonetaryAmount(input.budgetT);if(!budget)throw Error('Program budget must be positive');
      if(BigInt(c.totalSupply)+budget>MAX_UINT256)throw Error('Mint would overflow totalSupply');
      const expectedId=input.expectedId===undefined?c.programCount:monetaryUint(input.expectedId,'Expected program ID');
      if(expectedId!==c.programCount)throw Error('Program count changed; review a new exact program ID');
      const meterAddress=monetaryAddress(input.meter,'Meter');let meter=c.descriptor.meters?.find(m=>same(m.address,meterAddress));
      if(!meter||meter.kind==='trade'){const discovered=await discoverTradeMeter(c,input.pool);if(!same(discovered.address,meterAddress))throw Error('Meter does not match the hook created for this pool');meter=discovered;}else await code(meterAddress,c);
      const start=uint64(input.start),end=uint64(input.end),claimDeadline=uint64(input.claimDeadline),remainderRecipient=monetaryAddress(input.remainderRecipient,'Remainder recipient');
      if(same(remainderRecipient,c.rewards))throw Error('RewardBudget cannot receive its own remainder');
      if(start<=BigInt(c.timestamp)||end<=start||claimDeadline<=end)throw Error('Require future start < end < claim deadline');
      normalized={kind:input.kind,expectedId:String(expectedId),meter:meterAddress,start:String(start),end:String(end),claimDeadline:String(claimDeadline),budgetT:input.budgetT,remainderRecipient};
      targets=[c.token,c.rewards];calldatas=[encoded(MONETARY_ABI.token,'mint',[c.rewards,budget]),encoded(MONETARY_ABI.rewards,'createProgram',[expectedId,meterAddress,start,end,claimDeadline,budget,remainderRecipient])];
      const pool=monetaryAddress(input.pool,'Balancer pool');
        if((await provider.getCode(pool,c.blockNumber))==='0x')throw Error('Trade reward pool has no bytecode');
      normalized.pool=pool;targets.push(meterAddress);
      if(meter.kind==='trade'){
        const metric=monetaryUint(input.metric,'Trade metric',1n);
        if(!await contract(meterAddress,MONETARY_ABI.meter).registeredPool(pool,c.at))throw Error('Pool is not registered to this pinned reward hook');
        normalized.metric=String(metric);calldatas.push(encoded(MONETARY_ABI.meter,'configureProgram',[expectedId,pool,metric]));
      }else if(meter.kind==='lp'){
        if(!await contract(config.addresses.AllocationController,MONETARY_ABI.allocation).officialPool(pool,c.at))throw Error('LP rewards require an official pool');
        calldatas.push(encoded(MONETARY_ABI.lp,'configureProgram',[expectedId,pool]));
      }else throw Error('Unsupported deployed meter kind');
      review={method:'mint + createProgram + configureProgram',totalSupplyBefore:c.totalSupply,hypotheticalTotalSupplyAfter:String(BigInt(c.totalSupply)+budget),mintRecipient:c.rewards,budget:String(budget),programId:String(expectedId),formula:meter.kind==='trade'?(normalized.metric==='0'?'Actual T-leg amount: T input or T output':'Actual EXACT_IN T-input swap-fee weight; sells and EXACT_OUT swaps earn no weight'):'Locked BPT × remaining program time; withdrawal after end',
        remainderRecipient,simulation:'Exact bindings and state reads; full ordered batch is checked by Governor.execute simulation when queued. Separate eth_call cannot carry mint state into createProgram.'};
    }else{
      const fee=parseMonetaryPercent(input.percent);let target,method,args,previous;
      if(input.kind==='global-protocol-fee'){
        if(fee>5n*10n**17n)throw Error('Balancer global protocol swap fee cannot exceed50%');target=config.addresses.ProtocolFeeController;method='setGlobalProtocolSwapFeePercentage';args=[fee];previous=await contract(target,MONETARY_ABI.controller).getGlobalProtocolSwapFeePercentage(c.at);
      }else if(['swap-fee','creator-fee'].includes(input.kind)){
        const pool=monetaryAddress(input.pool,'Balancer pool');target=config.addresses.AllocationController;method=input.kind==='swap-fee'?'setPoolSwapFee':'setCreatorFee';args=[pool,fee];
        previous=input.kind==='swap-fee'?await contract(config.addresses.Vault,MONETARY_ABI.vault).getStaticSwapFeePercentage(pool,c.at):await contract(config.addresses.ProtocolFeeController,MONETARY_ABI.controller).getPoolCreatorSwapFeePercentage(pool,c.at);
      }else throw Error('Unsupported monetary policy action');
      target=monetaryAddress(target,'Policy target');await code(target,c);
      const data=encoded(input.kind==='global-protocol-fee'?MONETARY_ABI.controller:MONETARY_ABI.allocation,method,args);
      await provider.call({from:c.executor,to:target,data,blockTag:c.blockNumber});
      normalized={kind:input.kind,percent:input.percent,...(input.pool?{pool:monetaryAddress(input.pool)}:{})};targets=[target];calldatas=[data];
      review={method,previousFraction:String(previous),fraction:String(fee),previousPercent:formatEther(BigInt(previous)*100n),proposedPercent:input.percent,simulation:'Single policy call passed eth_call at the stated block',incomeDestination:'Active beneficiary allocation; governance receives only its own share. LP fee is separate.'};
    }
    return{input:normalized,targets,values:targets.map(()=> '0'),calldatas,executor:c.executor,token:c.token,rewards:c.rewards,version:c.descriptor.version,blockNumber:c.blockNumber,blockHash:c.blockHash,review};
  }
  async function protocolFeeState(c,pool){
    pool=monetaryAddress(pool,'Balancer pool');const controllerAddress=monetaryAddress(config.addresses.ProtocolFeeController,'Protocol fee controller'),vaultAddress=monetaryAddress(config.addresses.Vault,'Vault');
    for(const address of[controllerAddress,vaultAddress,config.addresses.AllocationController])await code(address,c);
    const controller=contract(controllerAddress,MONETARY_ABI.controller);
    if(!same(await controller.vault(c.at),vaultAddress))throw Error('Protocol fee controller belongs to another Vault');
    if(!await contract(config.addresses.AllocationController,MONETARY_ABI.allocation).officialPool(pool,c.at))throw Error('Protocol fee synchronization requires an official pool');
    if(await provider.getCode(pool,c.blockNumber)==='0x')throw Error('Official pool has no bytecode');
    const [info,global]=await Promise.all([controller.getPoolProtocolSwapFeeInfo(pool,c.at),controller.getGlobalProtocolSwapFeePercentage(c.at)]);
    const cachedFraction=String(info[0]),globalFraction=String(global),isOverride=Boolean(info[1]);
    return{kind:'protocol-fee-sync',version:c.descriptor.version,pool,controller:controllerAddress,vault:vaultAddress,blockNumber:c.blockNumber,blockHash:c.blockHash,cachedFraction,globalFraction,isOverride,
      cachedPercent:formatEther(BigInt(cachedFraction)*100n),globalPercent:formatEther(BigInt(globalFraction)*100n),available:!isOverride&&cachedFraction!==globalFraction,
      reason:isOverride?'Pool has an explicit protocol-fee override; synchronizing the global default cannot change it':cachedFraction===globalFraction?'Pool already uses the current global protocol fee':''};
  }
  async function protocolFeeSyncSnapshot(pool){return protocolFeeState(await context(),pool);}
  async function prepareProtocolFeeSync(pool){
    const view=await protocolFeeSyncSnapshot(pool);if(!view.available)throw Error(view.reason);
    const data=encoded(MONETARY_ABI.controller,'updateProtocolSwapFeePercentage',[view.pool]);
    const caller=write?.getAddress?await write.getAddress():ZeroAddress;
    await provider.call({from:caller,to:view.controller,data,value:0n,blockTag:view.blockNumber});
    return{...view,target:view.controller,value:'0',calldata:data,simulation:'Permissionless original controller call passed eth_call. It first collects pending aggregate fees under the previous rates, then updates this non-overridden pool to the current global default. No withdrawal recipient is selected.'};
  }
  async function syncProtocolFee(plan,options={}){
    if(!write?.getAddress||!send)throw Error('Connect a wallet before synchronizing pool fees');
    const owner=await write.getAddress();await current(options,owner);
    const fresh=await prepareProtocolFeeSync(plan.pool);await current(options,owner);
    for(const field of['kind','version','pool','controller','vault','target','value','calldata','cachedFraction','globalFraction','isOverride'])
      if(JSON.stringify(plan[field])!==JSON.stringify(fresh[field]))throw Error('Pool or global fee policy changed; review synchronization again');
    const controller=contract(fresh.controller,MONETARY_ABI.controller);
    const receipt=await send(async()=>{await current(options,owner);return controller.updateProtocolSwapFeePercentage(fresh.pool);});
    const afterBlock=await provider.getBlock(receipt.blockNumber),at={blockTag:receipt.blockNumber};
    const [info,global]=await Promise.all([controller.getPoolProtocolSwapFeeInfo(fresh.pool,at),controller.getGlobalProtocolSwapFeePercentage(at)]);
    return{receipt,before:fresh,after:{blockNumber:receipt.blockNumber,blockHash:afterBlock.hash,pool:fresh.pool,controller:fresh.controller,cachedFraction:String(info[0]),globalFraction:String(global),isOverride:Boolean(info[1]),cachedPercent:formatEther(BigInt(info[0])*100n),globalPercent:formatEther(BigInt(global)*100n)}};
  }
  async function current(options,owner){
    if(options.isCurrent?.()===false)throw Error('Monetary draft, wallet or network changed');
    if(!write?.getAddress||!same(await write.getAddress(),owner))throw Error('Monetary wallet changed');
    if((await provider.getNetwork()).chainId!==BigInt(config.chainId))throw Error('Monetary network changed');
    if(options.isCurrent?.()===false)throw Error('Monetary draft, wallet or network changed');
  }
  async function propose(plan,description,options={}){
    if(!String(description).trim())throw Error('Explain the monetary proposal');
    if(!write?.getAddress||!send)throw Error('Connect a wallet before proposing');
    const owner=await write.getAddress();await current(options,owner);
    const fresh=await prepare(plan.input);await current(options,owner);
    for(const field of['targets','values','calldatas','executor','token','rewards','version'])if(JSON.stringify(fresh[field])!==JSON.stringify(plan[field]))throw Error('Monetary call binding changed; review again');
    if(plan.review.totalSupplyBefore!==fresh.review.totalSupplyBefore)throw Error('T supply changed; review the new supply before proposing');
    if(plan.review.previousFraction!==fresh.review.previousFraction)throw Error('Fee policy changed; review the current rate before proposing');
    const governor=contract(config.addresses.Governor,MONETARY_ABI.governor);
    return send(async()=>{await current(options,owner);return governor.propose(fresh.targets,fresh.values,fresh.calldatas,description);});
  }
  async function prepareClose(id){
    id=String(monetaryUint(id,'Program ID'));const c=await context();
    if(BigInt(id)>=c.programCount)throw Error('Unknown reward program');
    const p=await c.budget.programs(id,c.at);
    if(p[9])throw Error('Reward program is already closed');
    if(BigInt(c.timestamp)<BigInt(p[3]))throw Error('Reward claim deadline has not elapsed');
    const remainder=BigInt(p[5])-BigInt(p[6]);if(remainder<0n||BigInt(p[7])!==0n)throw Error('Unexpected reward remainder accounting');
    const caller=write?.getAddress?await write.getAddress():ZeroAddress;
    const calldata=encoded(MONETARY_ABI.rewards,'close',[id]);
    const result=await provider.call({from:caller,to:c.rewards,data:calldata,value:0n,blockTag:c.blockNumber});
    if(new Interface(MONETARY_ABI.rewards).decodeFunctionResult('close',result)[0]!==remainder)throw Error('Actual close result differs from the reviewed remainder');
    return{kind:'reward-close',version:c.descriptor.version,programId:id,caller,token:c.token,target:c.rewards,value:'0',calldata,
      remainderRecipient:monetaryAddress(p[4],'Fixed remainder recipient'),remainder:String(remainder),budget:String(p[5]),paid:String(p[6]),claimDeadline:String(p[3]),blockNumber:c.blockNumber,blockHash:c.blockHash};
  }
  async function close(plan,options={}){
    if(!write?.getAddress||!send)throw Error('Connect a wallet before closing the reward program');
    const owner=await write.getAddress();await current(options,owner);
    const fresh=await prepareClose(plan.programId);await current(options,owner);
    for(const field of ['kind','version','programId','caller','token','target','value','calldata','remainderRecipient','remainder','budget','paid','claimDeadline'])
      if(JSON.stringify(plan[field])!==JSON.stringify(fresh[field]))throw Error('Reward close recipient, amount or policy changed; review again');
    return send(async()=>{await current(options,owner);return contract(fresh.target,MONETARY_ABI.rewards).close(fresh.programId);});
  }
  async function claim(id,options={}){
    if(!write?.getAddress||!send)throw Error('Connect the reward participant wallet');
    const owner=await write.getAddress();await current(options,owner);const c=await context(),p=await program(c,monetaryUint(id,'Program ID'),owner);await current(options,owner);
    if(p.closed||p.claimed||BigInt(p.claimable)===0n)throw Error('No claimable reward for this wallet');
    return send(async()=>{await current(options,owner);return c.budget.claim(id);});
  }
  async function lpPosition(kind,id,amountT,options={}){
    if(!write?.getAddress||!send)throw Error('Connect the LP wallet');const owner=await write.getAddress();await current(options,owner);
    const c=await context(),p=await program(c,monetaryUint(id,'Program ID'),owner);await current(options,owner);
    if(p.kind!=='lp')throw Error('This is not a BPT lock program');const meter=contract(p.meter,MONETARY_ABI.lp);
    if(kind==='withdraw'){
      if(!p.canWithdraw)throw Error('BPT remains locked until program end or no deposit exists');
      return send(async()=>{await current(options,owner);return meter.withdraw(id);});
    }
    if(!p.canStake)throw Error('LP earning period is not active');const amount=parseMonetaryAmount(amountT);if(!amount)throw Error('Stake must be positive');
    const bpt=contract(p.pool,MONETARY_ABI.bpt);if(BigInt(await bpt.balanceOf(owner,c.at))<amount)throw Error('Insufficient BPT balance');await current(options,owner);
    if(BigInt(await bpt.allowance(owner,p.meter,c.at))<amount)await send(async()=>{await current(options,owner);return bpt.approve(p.meter,amount);});
    return send(async()=>{await current(options,owner);return meter.stake(id,amount);});
  }
  return {snapshot,prepare,propose,claim,prepareClose,close,protocolFeeSyncSnapshot,prepareProtocolFeeSync,syncProtocolFee,discoverMeter:async pool=>discoverTradeMeter(await context(),pool),stake:(id,amount,options)=>lpPosition('stake',id,amount,options),withdraw:(id,options)=>lpPosition('withdraw',id,undefined,options)};
}
