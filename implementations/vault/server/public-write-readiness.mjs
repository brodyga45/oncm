// Read-only, same-block authority audit for the existing V2 public pilot.
// No readiness result from a file is trusted; live checks use the supplied local provider.
import {Contract,Interface,ZeroAddress,ZeroHash,getAddress,id,keccak256} from 'ethers';
import {PUBLIC_DEV_SENDERS} from './rpc-gateway.mjs';
export const PUBLIC_DEV_ADDRESSES=Object.freeze([...PUBLIC_DEV_SENDERS].map(getAddress));
const lower=x=>x.toLowerCase(), same=(a,b)=>typeof a==='string'&&typeof b==='string'&&lower(a)===lower(b);
const normal=x=>getAddress(x.toLowerCase()), serial=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
const memberABI=['function owner() view returns(address)','function balanceOf(address) view returns(uint256)','function totalSupply() view returns(uint256)','function getVotes(address) view returns(uint256)','function delegates(address) view returns(address)','event Transfer(address indexed from,address indexed to,uint256 value)'];
const governorABI=['function token() view returns(address)','function timelock() view returns(address)','function votingDelay() view returns(uint256)','function votingPeriod() view returns(uint256)','function proposalThreshold() view returns(uint256)','function state(uint256) view returns(uint8)','function proposalSnapshot(uint256) view returns(uint256)','function proposalDeadline(uint256) view returns(uint256)','function proposalEta(uint256) view returns(uint256)','event ProposalCreated(uint256 proposalId,address proposer,address[] targets,uint256[] values,string[] signatures,bytes[] calldatas,uint256 voteStart,uint256 voteEnd,string description)'];
const timeABI=['function getMinDelay() view returns(uint256)','function hasRole(bytes32,address) view returns(bool)','event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)','event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)'];
const cached=new WeakMap();
async function logs(provider,address,topics,end){
 const result=[];for(let from=0;from<=end;from+=2000){result.push(...await provider.getLogs({address,topics,fromBlock:from,toBlock:Math.min(end,from+1999)}));if(result.length>5000)throw Error('Public control audit exceeds5000 logs; archive/checkpoint review required');}
 return result;
}
export function publicControlViolations(s){
 const errors=[],need=(v,message)=>{if(!v)errors.push(message);},a=s.addresses,o=s.owner;
 need(s.chainId===31373&&s.protocolVersion==='2','Selected network is not Vault V2 chain31373');
 need(!PUBLIC_DEV_ADDRESSES.some(x=>same(x,o)),'Owner is a public development address');
 need(s.runtimeVerified===true,'Runtime pins were not verified');
 need(s.memberSupply==='1000000000000000000','Membership must have exactly one MEMBER');
 const own=s.members.find(m=>same(m.address,o));need(own?.balance==='1000000000000000000'&&own?.votes==='1000000000000000000'&&same(own?.delegate,o),'Owner must hold one self-delegated MEMBER');
 for(const m of s.members.filter(m=>!same(m.address,o)))need(m.balance==='0'&&m.votes==='0','Residual member or votes at '+m.address);
 for(const [key,address]of Object.entries(s.owners))need(same(address,a.Timelock),key+' authority is not the actual Timelock');
 need(same(s.governor.token,a.Membership)&&same(s.governor.timelock,a.Timelock),'Governor points to a different membership or executor');
 const expected={DEFAULT_ADMIN_ROLE:[a.Timelock],PROPOSER_ROLE:[a.Governor],CANCELLER_ROLE:[a.Governor],EXECUTOR_ROLE:[ZeroAddress]};
 for(const [role,holders]of Object.entries(expected))need(JSON.stringify((s.timelock.roles[role]??[]).map(lower).sort())===JSON.stringify(holders.map(lower).sort()),'Unexpected Timelock '+role+' holders');
 need(same(s.bindings.vaultAuthorizer,a.Authorizer)&&same(s.bindings.vaultController,a.ProtocolFeeController),'Active Vault authorizer/controller differs');
 for(const [key,value]of Object.entries(s.bindings.expected))need(same(s.bindings.actual[key],value),'Binding differs: '+key);
 need(Array.isArray(s.beneficiaries?.recipients)&&s.beneficiaries.recipients.length>0,'Current fee epoch was not verified');
 for(const who of s.beneficiaries?.recipients??[])need(!PUBLIC_DEV_ADDRESSES.some(dev=>same(dev,who)),'Current fee beneficiary is a public dev address: '+who);
 need(Number.isInteger(s.cutoverBlock)&&s.cutoverBlock>0,'No current owner membership cutover observed');
 // Revoking members does not erase old historical votes or a queued operation.
 for(const p of s.proposals)if(BigInt(p.snapshot)<BigInt(s.cutoverBlock??0)&&[0,1,4,5].includes(p.state))errors.push('Pre-cutover proposal remains actionable: '+p.id+' ('+p.stateName+')');
 return errors;
}
export async function readPublicPilotControlState({config,provider,owner}){
 const o=normal(owner),a=config.addresses;if(config.chainId!==31373||config.protocolVersion!=='2'||!config.chainInstance?.id||config.monetaryPolicy?.status!=='deployed')throw Error('Actual deployed Vault V2 config required');
 if(PUBLIC_DEV_ADDRESSES.some(x=>same(x,o)))throw Error('Owner cannot be a public dev account');
 const [chain,raw,genesis]=await Promise.all([provider.send('eth_chainId',[]),provider.send('eth_getBlockByNumber',['latest',false]),provider.getBlock(0)]);
 if(BigInt(chain)!==31373n||genesis.timestamp!==config.chainInstance.genesisTimestamp)throw Error('Chain identity/genesis differs');
 const block={number:Number(BigInt(raw.number)),hash:raw.hash,timestamp:Number(BigInt(raw.timestamp))},at={blockTag:block.number};
 const cacheKey=id(JSON.stringify({owner:o,block:block.hash,chain:config.chainInstance,addresses:a,pins:config.monetaryPolicy.runtimeHashes}));
 if(cached.get(provider)?.key===cacheKey)return structuredClone(cached.get(provider).value);
 const pins=config.monetaryPolicy.runtimeHashes;if(!pins||Object.keys(pins).length<20)throw Error('Missing V2 runtime pins');
 for(const key of ['Membership','Governor','Timelock','TrueToken','StatementRegistry','Vault','ProtocolFeeController','AllocationController','Authorizer','RewardBudget','PoolCoordinator','BptLockMeter'])if(!Object.keys(pins).some(x=>same(x,a[key])))throw Error('Missing runtime pin '+key);
 for(const [address,expected]of Object.entries(pins)){const code=await provider.getCode(address,block.number);if(code==='0x'||keccak256(code)!==expected)throw Error('Runtime mismatch '+address);}
 const member=new Contract(a.Membership,memberABI,provider),gov=new Contract(a.Governor,governorABI,provider),time=new Contract(a.Timelock,timeABI,provider);
 const mi=new Interface(memberABI),gi=new Interface(governorABI),ti=new Interface(timeABI);
 const [memberLogs,roleLogs,proposalLogs]=await Promise.all([
  logs(provider,a.Membership,[mi.getEvent('Transfer').topicHash],block.number),
  logs(provider,a.Timelock,[[ti.getEvent('RoleGranted').topicHash,ti.getEvent('RoleRevoked').topicHash]],block.number),
  logs(provider,a.Governor,[gi.getEvent('ProposalCreated').topicHash],block.number)]);
 const mintOwners=new Set(PUBLIC_DEV_ADDRESSES.map(lower));mintOwners.add(lower(o));let cutoverBlock=0;
 for(const log of memberLogs){const e=mi.parseLog(log).args;for(const who of[e.from,e.to])if(who!==ZeroAddress)mintOwners.add(lower(who));if(same(e.to,o)&&e.from===ZeroAddress)cutoverBlock=Math.max(cutoverBlock,log.blockNumber);if(PUBLIC_DEV_ADDRESSES.some(who=>same(who,e.from))&&e.to===ZeroAddress)cutoverBlock=Math.max(cutoverBlock,log.blockNumber);}
 const members=[];for(const address of mintOwners){const[b,v,d]=await Promise.all([member.balanceOf(address,at),member.getVotes(address,at),member.delegates(address,at)]);members.push({address:normal(address),balance:String(b),votes:String(v),delegate:d});}
 const roleIds={DEFAULT_ADMIN_ROLE:ZeroHash,PROPOSER_ROLE:id('PROPOSER_ROLE'),CANCELLER_ROLE:id('CANCELLER_ROLE'),EXECUTOR_ROLE:id('EXECUTOR_ROLE')},roles={};
 for(const [name,role]of Object.entries(roleIds)){const candidates=new Set([a.Timelock,a.Governor,o,ZeroAddress,...PUBLIC_DEV_ADDRESSES].map(lower));for(const log of roleLogs){const e=ti.parseLog(log).args;if(e.role===role)candidates.add(lower(e.account));}roles[name]=[];for(const who of candidates)if(await time.hasRole(role,who,at))roles[name].push(normal(who));}
 const proposals=[];const names=['Pending','Active','Canceled','Defeated','Succeeded','Queued','Expired','Executed'];
 for(const log of proposalLogs){const e=gi.parseLog(log).args;const[state,snapshot,deadline,eta]=await Promise.all([gov.state(e.proposalId,at),gov.proposalSnapshot(e.proposalId,at),gov.proposalDeadline(e.proposalId,at),gov.proposalEta(e.proposalId,at)]);proposals.push({id:String(e.proposalId),proposer:e.proposer,state:Number(state),stateName:names[Number(state)],snapshot:String(snapshot),deadline:String(deadline),eta:String(eta),createdBlock:log.blockNumber,targets:[...e.targets],values:[...e[3]].map(String),calldatas:[...e.calldatas],description:e.description});}
 const owners={};for(const key of['Membership','TrueToken','StatementRegistry','AllocationController'])owners[key]=await new Contract(a[key],['function owner() view returns(address)'],provider).owner(at);
 for(const key of['RewardBudget','PoolCoordinator','BptLockMeter'])owners[key]=await new Contract(a[key],['function governance() view returns(address)'],provider).governance(at);
 owners.Authorizer=await new Contract(a.Authorizer,['function authority() view returns(address)'],provider).authority(at);
 const vault=new Contract(a.Vault,['function getAuthorizer() view returns(address)','function getProtocolFeeController() view returns(address)'],provider);
 const bindingSpecs=[['authorizer.vault','Authorizer','vault','Vault'],['authorizer.controller','Authorizer','controller','ProtocolFeeController'],['authorizer.allocation','Authorizer','allocation','AllocationController'],['budget.token','RewardBudget','token','TrueToken'],['coordinator.registry','PoolCoordinator','registry','StatementRegistry'],['coordinator.allocation','PoolCoordinator','allocation','AllocationController'],['coordinator.rewards','PoolCoordinator','rewards','RewardBudget'],['lp.rewards','BptLockMeter','rewards','RewardBudget'],['lp.pools','BptLockMeter','pools','AllocationController']];
 const bindings={vaultAuthorizer:await vault.getAuthorizer(at),vaultController:await vault.getProtocolFeeController(at),expected:{},actual:{}};
 for(const[label,key,method,target]of bindingSpecs){bindings.expected[label]=a[target];bindings.actual[label]=await new Contract(a[key],[`function ${method}() view returns(address)`],provider)[method](at);}
 const allocation=new Contract(a.AllocationController,['function epoch() view returns(uint256)','function allocation(uint256) view returns(tuple(address split,address[] recipients,uint256[] weights))'],provider);
 const epoch=await allocation.epoch(at),row=await allocation.allocation(epoch,at),beneficiaries={epoch:String(epoch),split:row.split,recipients:[...row.recipients],weights:[...row.weights].map(String)};
 const governor={token:await gov.token(at),timelock:await gov.timelock(at),votingDelay:String(await gov.votingDelay(at)),votingPeriod:String(await gov.votingPeriod(at)),proposalThreshold:String(await gov.proposalThreshold(at))};
 const tail=await provider.send('eth_getBlockByNumber',['0x'+block.number.toString(16),false]);if(tail.hash!==block.hash)throw Error('Control snapshot block reorged');
 const result=serial({format:'vault-public-control-readiness-v1',chainId:31373,protocolVersion:'2',chainInstance:config.chainInstance.id,block,owner:o,addresses:a,runtimeVerified:true,memberSupply:await member.totalSupply(at),members,owners,governor,timelock:{minDelay:String(await time.getMinDelay(at)),roles},bindings,beneficiaries,cutoverBlock:cutoverBlock||null,proposals});
 result.violations=publicControlViolations(result);result.ready=result.violations.length===0;cached.set(provider,{key:cacheKey,value:result});return structuredClone(result);
}

// The one-owner rule is this pilot's launch policy, not a limitation of Governor.
// A legitimate change of membership requires an explicit public policy update.
// Between full audits, inspect logs from the pinned implementations which emit
// every relevant authority change. There is no blind 60-second allow cache.
export function createPublicReadinessVerifier({fullAudit=readPublicPilotControlState,now=Date.now,ttlMs=60000}={}){
 const states=new WeakMap();
 return async function verify(input){
  const {provider,config,owner}=input,a=config.addresses;
  const identity=id(JSON.stringify({owner:normal(owner),version:config.protocolVersion,chain:config.chainInstance,addresses:a,pins:config.monetaryPolicy?.runtimeHashes}));
  let entry=states.get(provider);
  if(entry?.task){if(entry.identity===identity)return entry.task;await entry.task.catch(()=>{});return verify(input);}
  if(entry?.identity!==identity){entry={identity};states.set(provider,entry);}
  const work=async()=>{
   const raw=await provider.send('eth_getBlockByNumber',['latest',false]);
   const head={number:Number(BigInt(raw.number)),hash:raw.hash,timestamp:Number(BigInt(raw.timestamp))};
   if(BigInt(await provider.send('eth_chainId',[]))!==31373n)throw Error('Public upstream chain changed');
   let refresh=!entry.state||now()-entry.fullAt>=ttlMs||head.number<entry.checked.number;
   if(!refresh){
    const previous=await provider.send('eth_getBlockByNumber',['0x'+entry.checked.number.toString(16),false]);
    refresh=previous?.hash!==entry.checked.hash;
   }
   if(!refresh&&head.number>entry.checked.number){
    const range={fromBlock:entry.checked.number+1,toBlock:head.number};
    const changes=await Promise.all([
     provider.getLogs({...range,address:[a.Membership,a.Timelock,a.Governor]}),
     provider.getLogs({...range,address:[a.TrueToken,a.StatementRegistry,a.AllocationController],topics:[[id('OwnershipTransferred(address,address)'),id('EpochActivated(uint256,address,address[],uint256[])')]]}),
     provider.getLogs({...range,address:a.Vault,topics:[[id('AuthorizerChanged(address)'),id('ProtocolFeeControllerChanged(address)')]]})
    ]);
    refresh=changes.some(rows=>rows.length>0);
   }
   if(refresh){entry.state=await fullAudit(input);entry.fullAt=now();entry.checked=entry.state.block;}
   else entry.checked=head;
   // Historical fields retain their full-audit block; checkedBlock is the later
   // event-validated authority observation, not a fabricated fresh storage read.
   const value={...structuredClone(entry.state),checkedBlock:{...entry.checked},auditMode:refresh?'full':'event-validated',fullAuditAt:entry.fullAt};
   if(!value.ready)throw Error('Public writes remain closed: '+value.violations.join('; '));
   return value;
  };
  entry.task=work();
  try{return await entry.task;}catch(error){entry.state=undefined;throw error;}finally{entry.task=undefined;}
 };
}
export const verifyPublicWriteReadiness=createPublicReadinessVerifier();
