import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, keccak256 } from 'ethers';
import { createMonetaryPolicy, MONETARY_ABI } from '../sdk/monetary-policy.mjs';

const addr=n=>'0x'+n.toString(16).padStart(40,'0');
const fee=100000000000000000n;
function harness(){
  const addresses={TrueToken:addr(1),RewardBudget:addr(2),Timelock:addr(3),Governor:addr(4),AllocationController:addr(5),ProtocolFeeController:addr(6),Vault:addr(7)};
  const pool=addr(8),account=addr(9),reads=[],calls=[];
  const state={cached:0n,global:fee,override:false,official:true,owner:account,chainId:31373n,code:'0x1234',afterGlobal:fee};
  const config={chainId:31373,protocolVersion:'2',addresses,monetaryPolicy:{version:'vault-monetary-v1',status:'deployed',token:addresses.TrueToken,rewards:addresses.RewardBudget,governance:addresses.Timelock,runtimeHashes:Object.fromEntries(Object.values(addresses).map(a=>[a,keccak256('0x1234')]))}};
  const at=(name,o)=>{assert.ok([260,261].includes(o.blockTag));reads.push([name,o.blockTag]);};
  const contracts={
    [addresses.TrueToken]:{totalSupply:async o=>{at('supply',o);return 1000n*10n**18n;},owner:async o=>{at('owner',o);return addresses.Timelock;},decimals:async o=>{at('decimals',o);return 18n;}},
    [addresses.RewardBudget]:{token:async o=>{at('token',o);return addresses.TrueToken;},governance:async o=>{at('governance',o);return addresses.Timelock;},programCount:async o=>{at('count',o);return 0n;}},
    [addresses.Governor]:{timelock:async o=>{at('timelock',o);return addresses.Timelock;}},
    [addresses.AllocationController]:{officialPool:async(p,o)=>{assert.equal(p,pool);at('official',o);return state.official;}},
    [addresses.ProtocolFeeController]:{
      vault:async o=>{at('vault',o);return addresses.Vault;},
      getPoolProtocolSwapFeeInfo:async(p,o)=>{assert.equal(p,pool);at('cached',o);return [o.blockTag===261?fee:state.cached,state.override];},
      getGlobalProtocolSwapFeePercentage:async o=>{at('global',o);return o.blockTag===261?state.afterGlobal:state.global;},
      updateProtocolSwapFeePercentage:async p=>{calls.push(['update',p]);return {blockNumber:261,hash:'0xreceipt'};},
    },
  };
  const provider={getNetwork:async()=>({chainId:state.chainId}),getBlock:async tag=>({number:tag==='latest'?260:tag,hash:tag===261?'0x261':'0x260',timestamp:100}),getCode:async(a,block)=>{assert.equal(block,260);reads.push(['code',block,a]);return state.code;},call:async tx=>{calls.push(['eth_call',tx]);state.onCall?.();return '0x';}};
  const sdk=createMonetaryPolicy({provider,config,write:{getAddress:async()=>state.owner},send:async fn=>{state.beforeSend?.();return fn();},contract:a=>{assert.ok(contracts[a],`Unexpected contract ${a}`);return contracts[a];}});
  return{sdk,pool,account,addresses,config,state,reads,calls,contracts,provider};
}

test('fee synchronization review uses one block, the original method and the connected ordinary wallet; preparation never writes',async()=>{
  const h=harness(),plan=await h.sdk.prepareProtocolFeeSync(h.pool);
  assert.equal(plan.blockNumber,260);assert.equal(plan.cachedFraction,'0');assert.equal(plan.globalFraction,String(fee));assert.equal(plan.globalPercent,'10.0');
  assert.equal(plan.target,h.addresses.ProtocolFeeController);assert.equal(plan.value,'0');assert.equal(plan.isOverride,false);
  const parsed=new Interface(MONETARY_ABI.controller).parseTransaction({data:plan.calldata});
  assert.equal(parsed.name,'updateProtocolSwapFeePercentage');assert.deepEqual([...parsed.args],[h.pool]);
  assert.match(plan.simulation,/previous rates/);assert.match(plan.simulation,/No withdrawal recipient/);
  assert.deepEqual(h.calls,[['eth_call',{from:h.account,to:h.addresses.ProtocolFeeController,data:plan.calldata,value:0n,blockTag:260}]]);
  assert.ok(h.reads.every(r=>r[1]===260));
});

test('permissionless sync sends exactly one original update and reports historical receipt-block values',async()=>{
  const h=harness(),plan=await h.sdk.prepareProtocolFeeSync(h.pool);
  // A concurrently changed later global default must not be inferred as the pool cache.
  h.state.afterGlobal=2n*fee;
  const result=await h.sdk.syncProtocolFee(plan,{isCurrent:()=>true});
  assert.deepEqual(h.calls.filter(c=>c[0]==='update'),[['update',h.pool]]);
  assert.equal(result.before.blockNumber,260);assert.equal(result.before.cachedFraction,'0');
  assert.equal(result.receipt.blockNumber,261);assert.equal(result.after.blockNumber,261);assert.equal(result.after.blockHash,'0x261');
  assert.equal(result.after.cachedFraction,String(fee));assert.equal(result.after.globalFraction,String(2n*fee));
  assert.deepEqual(h.reads.filter(r=>r[1]===261),[['cached',261],['global',261]]);
});

test('overridden and already-current pools expose an explicit reason and cannot prepare a write',async()=>{
  for(const kind of['override','already-current']){
    const h=harness();if(kind==='override')h.state.override=true;else h.state.cached=fee;
    const view=await h.sdk.protocolFeeSyncSnapshot(h.pool);assert.equal(view.available,false);
    assert.match(view.reason,kind==='override'?/override/:/already uses/);
    await assert.rejects(()=>h.sdk.prepareProtocolFeeSync(h.pool),kind==='override'?/override/:/already uses/);assert.equal(h.calls.length,0);
  }
});

test('unofficial pool, mismatched controller Vault and changed pinned runtime fail closed',async()=>{
  for(const kind of['official','vault','code']){
    const h=harness();if(kind==='official')h.state.official=false;
    if(kind==='vault')h.contracts[h.addresses.ProtocolFeeController].vault=async()=>addr(99);
    if(kind==='code')h.state.code='0x1235';
    await assert.rejects(()=>h.sdk.prepareProtocolFeeSync(h.pool),kind==='official'?/official pool/:kind==='vault'?/another Vault/:/runtime/);
    assert.equal(h.calls.length,0);
  }
});

test('changed global or cached fee and modified target/calldata cannot reuse a prior reviewed plan',async()=>{
  for(const kind of['global','cached','target','calldata','override']){
    const h=harness(),plan=await h.sdk.prepareProtocolFeeSync(h.pool);
    if(kind==='global')h.state.global=2n*fee;if(kind==='cached')h.state.cached=1n;
    if(kind==='target')plan.target=h.account;if(kind==='calldata')plan.calldata='0x';if(kind==='override')h.state.override=true;
    await assert.rejects(()=>h.sdk.syncProtocolFee(plan),/changed|override/);
    assert.equal(h.calls.some(c=>c[0]==='update'),false);
  }
});

test('wallet and UI/network changes during preflight or just before send prevent any controller write',async()=>{
  for(const kind of['wallet-preflight','ui-presend','network-presend']){
    const h=harness(),plan=await h.sdk.prepareProtocolFeeSync(h.pool);let isCurrent=true;
    if(kind==='wallet-preflight')h.state.onCall=()=>{h.state.owner=addr(99);};
    if(kind==='ui-presend')h.state.beforeSend=()=>{isCurrent=false;};
    if(kind==='network-presend')h.state.beforeSend=()=>{h.state.chainId=1n;};
    await assert.rejects(()=>h.sdk.syncProtocolFee(plan,{isCurrent:()=>isCurrent}),/changed/);
    assert.equal(h.calls.some(c=>c[0]==='update'),false);
  }
});
