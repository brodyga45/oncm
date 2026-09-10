import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface,keccak256} from 'ethers';
import { parseMonetaryAmount, monetaryUint, monetaryAddress, formatMonetaryAmount, createMonetaryPolicy, MONETARY_ABI, parseMonetaryPercent } from '../sdk/monetary-policy.mjs';

test('T display input preserves exact 18-decimal supply and reward amounts without numeric coercion', () => {
  assert.equal(parseMonetaryAmount('0.000000000000000001'), 1n);
  assert.equal(parseMonetaryAmount('9007199254740993.123456789012345678'), 9007199254740993123456789012345678n);
  assert.equal(formatMonetaryAmount('9007199254740993123456789012345678'), '9007199254740993.123456789012345678');
  assert.equal(parseMonetaryAmount('0'), 0n);
  for (const value of [20, 0.1, '1e18', '01', '1.', '.1', '-1', '+1', ' 1', '1 ', '0.0000000000000000001']) {
    assert.throws(() => parseMonetaryAmount(value), /exact decimal/);
  }
  assert.throws(() => parseMonetaryAmount('9'.repeat(80)), /uint256/);
});
test('legacy deployment only reads actual supply and never infers a mint capability from a new ABI', async () => {
  const token='0x'+'12'.repeat(20),reads=[];
  const provider={getNetwork:async()=>({chainId:31373n}),getBlock:async()=>({number:260,hash:'0x260'})};
  const sdk=createMonetaryPolicy({provider,config:{chainId:31373,addresses:{TrueToken:token}},
    contract:(a,abi)=>{assert.equal(a,token);return {totalSupply:async at=>{reads.push(at);return 6000000n*10n**18n;}}}});
  const snapshot=await sdk.snapshot();assert.equal(snapshot.supported,false);assert.equal(snapshot.status,'legacy');assert.match(snapshot.reason,/genesis/);assert.equal(snapshot.totalSupply,'6000000000000000000000000');
  assert.deepEqual(reads,[{blockTag:260}]);await assert.rejects(()=>sdk.prepare({kind:'create-program'}),/genesis/);
});
test('raw policy integers require exact transport and bounded range; targets reject zero/invalid addresses', () => {
  assert.equal(monetaryUint('9007199254740993'), 9007199254740993n);
  assert.equal(monetaryUint('10000', 'Bps', 10000n), 10000n);
  for (const value of [10000, '1.5', '-1', '1e3', '01']) assert.throws(() => monetaryUint(value));
  assert.throws(() => monetaryUint('10001', 'Bps', 10000n), /range/);
  assert.throws(() => monetaryAddress('0x' + '00'.repeat(20)), /zero address/);
  assert.throws(() => monetaryAddress('not a wallet'), /invalid/);
});

const addr=n=>'0x'+n.toString(16).padStart(40,'0');
function harness(){
 const addresses={TrueToken:addr(1),RewardBudget:addr(2),Timelock:addr(3),Governor:addr(4),AllocationController:addr(5),ProtocolFeeController:addr(6),PoolCoordinator:addr(10),StatementRegistry:addr(11),WeightedPoolFactory:addr(12),Router:addr(13),Vault:addr(14)},meter=addr(7),pool=addr(8),account=addr(9),calls=[],state={supply:1000n*10n**18n,count:0n,time:100n,owner:account,claimed:false,claimable:6n,reserved:0n,rewardBalance:0n,code:'0x1234',kind:'trade'};
 const config={chainId:31373,protocolVersion:'2',addresses,monetaryPolicy:{version:'vault-monetary-v1',status:'deployed',token:addresses.TrueToken,rewards:addresses.RewardBudget,governance:addresses.Timelock,runtimeHashes:Object.fromEntries([...Object.values(addresses),meter].map(a=>[a,keccak256('0x1234')])),meters:[{address:meter,name:'Actual Balancer hook',kind:'trade'}]}};
 const block=o=>assert.equal(o.blockTag,260);
 const token={totalSupply:async o=>{block(o);return state.supply;},owner:async()=>addresses.Timelock,decimals:async()=>18n,balanceOf:async()=>state.rewardBalance};
 const reward={token:async()=>addresses.TrueToken,governance:async()=>addresses.Timelock,reserved:async()=>state.reserved,programCount:async()=>state.count,programs:async()=>[meter,101n,200n,300n,addresses.Timelock,10n,0n,0n,10n,false],weights:async()=>6n,claimed:async()=>state.claimed,claimable:async()=>state.claimable,claim:async id=>{calls.push(['claim',id]);return'tx';}};
 const gov={timelock:async()=>addresses.Timelock,propose:async(...a)=>{calls.push(['propose',...a]);return'tx';}};
 const statementId='0x'+'23'.repeat(32);const met={registeredPool:async()=>true,programBinding:async()=>[pool,0n,true],registry:async()=>addresses.StatementRegistry,vault:async()=>addresses.Vault,factory:async()=>addresses.WeightedPoolFactory,governance:async()=>addresses.Timelock,feeSink:async()=>addresses.AllocationController,trustedRouter:async()=>addresses.Router,trustedRouterCodeHash:async()=>keccak256('0x1234'),rewards:async()=>addresses.RewardBudget,statementId:async()=>statementId};
 const contracts={[addresses.TrueToken]:token,[addresses.RewardBudget]:reward,[addresses.Governor]:gov,[meter]:met,[addresses.Vault]:{getStaticSwapFeePercentage:async()=>20000000000000000n,getHooksConfig:async()=>[false,true,false,false,true,true,true,false,false,false,meter]},[addresses.ProtocolFeeController]:{getGlobalProtocolSwapFeePercentage:async()=>0n,getPoolCreatorSwapFeePercentage:async()=>100000000000000000n},[addresses.PoolCoordinator]:{statementOfPool:async()=>statementId,hooks:async()=>meter},[addresses.AllocationController]:{officialPool:async()=>true}};
 const provider={getNetwork:async()=>({chainId:31373n}),getBlock:async()=>({number:260,hash:'0x260',timestamp:Number(state.time)}),getCode:async()=>state.code,call:async tx=>{calls.push(['eth_call',tx]);return'0x';}};
 const sdk=createMonetaryPolicy({provider,config,write:{getAddress:async()=>state.owner},send:async fn=>{calls.push(['send']);return fn();},contract:a=>contracts[a]});
 const input={kind:'create-program',meter,pool,metric:'0',start:'110',end:'200',claimDeadline:'300',budgetT:'10',remainderRecipient:addresses.Timelock};
 return{sdk,input,config,state,calls,addresses,account,meter,pool,contracts,provider};
}
test('create-program review preserves mint/create/configure order and exact CAS budget; preparation never sends',async()=>{
 const h=harness(),p=await h.sdk.prepare(h.input);
 assert.deepEqual(p.targets,[h.addresses.TrueToken,h.addresses.RewardBudget,h.meter]);assert.deepEqual(p.values,['0','0','0']);
 assert.deepEqual([...new Interface(MONETARY_ABI.token).decodeFunctionData('mint',p.calldatas[0])],[h.addresses.RewardBudget,10n*10n**18n]);
 const program=[...new Interface(MONETARY_ABI.rewards).decodeFunctionData('createProgram',p.calldatas[1])];assert.equal(program[0],0n);assert.equal(program[5],10n*10n**18n);assert.equal(program[6],h.addresses.Timelock);
 assert.equal(p.review.totalSupplyBefore,'1000000000000000000000');assert.equal(p.review.hypotheticalTotalSupplyAfter,'1010000000000000000000');assert.match(p.review.simulation,/full ordered batch/);assert.equal(h.calls.length,0);
 await h.sdk.propose(p,'Ten T emission to a finite measured program',{isCurrent:()=>true});assert.equal(h.calls.filter(c=>c[0]==='propose').length,1);assert.deepEqual(h.calls.at(-1).slice(1,4),[p.targets,p.values,p.calldatas]);
});
test('program preparation fails closed on windows, counter drift, unknown meter, recipient, source pins and authority',async()=>{
 const h=harness();for(const changed of[{start:'100'},{end:'110'},{claimDeadline:'200'},{expectedId:'1'},{budgetT:'0'},{meter:addr(88)},{remainderRecipient:h.addresses.RewardBudget}])await assert.rejects(()=>h.sdk.prepare({...h.input,...changed}));
 h.state.code='0x1235';await assert.rejects(()=>h.sdk.prepare(h.input),/runtime/);h.state.code='0x1234';h.contracts[h.addresses.TrueToken].owner=async()=>h.account;await assert.rejects(()=>h.sdk.prepare(h.input),/authority binding/);assert.equal(h.calls.length,0);
});
test('immutable prepared plan rejects changed supply, expected program ID, calldata and wallet fences before proposal',async()=>{
 for(const change of ['supply','counter','bytes','wallet']){const h=harness(),p=await h.sdk.prepare(h.input);if(change==='supply')h.state.supply++;if(change==='counter')h.state.count++;if(change==='bytes')p.calldatas[0]='0x';
 await assert.rejects(()=>h.sdk.propose(p,'description',{isCurrent:()=>change!=='wallet'}));assert.equal(h.calls.some(c=>c[0]==='send'),false);}
});
test('fee percentages keep exact ratio and original target; no direct treasury income destination',async()=>{
 assert.equal(parseMonetaryPercent('20'),200000000000000000n);assert.equal(parseMonetaryPercent('0.01'),100000000000000n);assert.throws(()=>parseMonetaryPercent('100.1'));assert.throws(()=>parseMonetaryPercent('0.00000000000000001'));
 const h=harness(),p=await h.sdk.prepare({kind:'creator-fee',pool:h.pool,percent:'20'});assert.equal(p.targets[0],h.addresses.AllocationController);assert.match(p.review.incomeDestination,/beneficiary/);assert.equal(h.calls[0][0],'eth_call');assert.equal(h.calls[0][1].from,h.addresses.Timelock);assert.equal(h.calls[0][1].blockTag,260);
 await assert.rejects(()=>h.sdk.prepare({kind:'global-protocol-fee',percent:'50.00000000000001'}),/50%/);
});
test('program page shows onchain participant weight and actual claim; duplicate claims never send',async()=>{
 const h=harness();h.state.count=1n;h.state.rewardBalance=10n;h.state.reserved=10n;h.state.time=210n;
 const page=await h.sdk.snapshot(h.account);assert.equal(page.supported,true);assert.equal(page.programs[0].claimable,'6');assert.equal(page.programs[0].accountWeight,'6');assert.equal(page.programs[0].totalWeight,'10');assert.equal(page.nextOffset,null);
 await h.sdk.claim('0',{isCurrent:()=>true});assert.deepEqual(h.calls.at(-1),['claim','0']);h.state.claimed=true;const n=h.calls.length;await assert.rejects(()=>h.sdk.claim('0'),/No claimable/);assert.equal(h.calls.length,n);
});

test('new statement hook is discovered through pinned coordinator without a static fixture allowlist',async()=>{
 const h=harness();h.config.monetaryPolicy.meters=[];delete h.config.monetaryPolicy.runtimeHashes[h.meter];
 const meter=await h.sdk.discoverMeter(h.pool);assert.equal(meter.address,h.meter);assert.match(meter.validation,/creation path/);assert.equal(meter.observedRuntimeHash,keccak256('0x1234'));
 const plan=await h.sdk.prepare(h.input);assert.equal(plan.targets[2],h.meter);assert.equal(h.calls.length,0);
 h.contracts[h.meter].trustedRouter=async()=>h.account;await assert.rejects(()=>h.sdk.prepare(h.input),/trustedRouter/);
});

test('zero-genesis bootstrap issuance is a Governor draft to an exact recipient, never an EOA mint',async()=>{
 const h=harness();h.state.supply=0n;const p=await h.sdk.prepare({kind:'mint',recipient:h.account,amountT:'100.000000000000000001'});
 assert.equal(p.review.totalSupplyBefore,'0');assert.equal(p.review.hypotheticalTotalSupplyAfter,'100000000000000000001');assert.equal(p.targets[0],h.addresses.TrueToken);
 assert.deepEqual([...new Interface(MONETARY_ABI.token).decodeFunctionData('mint',p.calldatas[0])],[h.account,100000000000000000001n]);assert.equal(h.calls.filter(c=>c[0]==='send').length,0);assert.equal(h.calls[0][1].from,h.addresses.Timelock);
 await h.sdk.propose(p,'Initial T access through membership governance');assert.equal(h.calls.at(-1)[0],'propose');
});

test('LP program config and staking preserve exact pool, allowance and wallet fences; no early withdrawal',async()=>{
 const h=harness();h.config.monetaryPolicy.meters[0].kind='lp';const meter=h.contracts[h.meter];
 Object.assign(meter,{programPool:async()=>h.pool,deposits:async()=>2n*10n**18n,stake:async(...args)=>{h.calls.push(['stake',...args]);return'tx';},withdraw:async id=>{h.calls.push(['withdraw',id]);return'tx';}});
 h.contracts[h.pool]={balanceOf:async()=>10n*10n**18n,allowance:async()=>0n,approve:async(...args)=>{h.calls.push(['approve',...args]);return'tx';}};
 const plan=await h.sdk.prepare(h.input);assert.deepEqual([...new Interface(MONETARY_ABI.lp).decodeFunctionData('configureProgram',plan.calldatas[2])],[0n,h.pool]);
 h.state.count=1n;h.state.time=150n;await assert.rejects(()=>h.sdk.withdraw('0'),/locked/);await h.sdk.stake('0','2.000000000000000001');
 assert.deepEqual(h.calls.filter(c=>['approve','stake'].includes(c[0])),[['approve',h.meter,2000000000000000001n],['stake','0',2000000000000000001n]]);
 h.contracts[h.pool].approve=async()=>{h.state.owner=addr(88);return'tx';};const before=h.calls.filter(c=>c[0]==='stake').length;await assert.rejects(()=>h.sdk.stake('0','1'),/wallet changed/);assert.equal(h.calls.filter(c=>c[0]==='stake').length,before);
 h.state.owner=h.account;h.state.time=200n;await h.sdk.withdraw('0');assert.deepEqual(h.calls.at(-1),['withdraw','0']);
});


test('expired reward close fixes the original remainder recipient and rejects stale amounts, deadline and wallet',async()=>{
 const h=harness();h.state.count=1n;h.state.time=300n;
 let paid=3n,closed=false;
 h.contracts[h.addresses.RewardBudget].programs=async()=>[h.meter,101n,200n,300n,h.addresses.Timelock,10n,paid,0n,10n,closed];
 h.contracts[h.addresses.RewardBudget].close=async id=>{h.calls.push(['close',id]);return'tx';};
 h.provider.call=async tx=>{assert.equal(tx.to,h.addresses.RewardBudget);assert.equal(tx.blockTag,260);return new Interface(MONETARY_ABI.rewards).encodeFunctionResult('close',[10n-paid]);};
 const plan=await h.sdk.prepareClose('0');assert.equal(plan.remainderRecipient,h.addresses.Timelock);assert.equal(plan.remainder,'7');assert.equal(h.calls.length,0);
 await assert.rejects(()=>h.sdk.close({...plan,remainderRecipient:h.account}),/changed/);
 paid=4n;await assert.rejects(()=>h.sdk.close(plan),/changed/);paid=3n;
 await assert.rejects(()=>h.sdk.close(plan,{isCurrent:()=>false}),/changed/);
 h.state.time=299n;await assert.rejects(()=>h.sdk.prepareClose('0'),/deadline/);h.state.time=300n;
 await h.sdk.close(plan,{isCurrent:()=>true});assert.deepEqual(h.calls.at(-1),['close','0']);
 closed=true;await assert.rejects(()=>h.sdk.prepareClose('0'),/closed/);
 closed=false;paid=10n;const empty=await h.sdk.prepareClose('0');assert.equal(empty.remainder,'0');await h.sdk.close(empty);assert.deepEqual(h.calls.at(-1),['close','0']);
});
