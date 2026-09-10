// Read-only US023 state evidence. Every contract read uses the requested block.
// No signer, account impersonation, transaction, mining or timestamp operation.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Contract,JsonRpcProvider,ZeroAddress,keccak256,sha256,getAddress} from 'ethers';
import {assertLocalConfig} from '../sdk/local-endpoints.mjs';
import {creatorFromAggregate,protocolFromAggregate} from '../sdk/revenue.mjs';
import {matchesRuntime} from './monetary-bootstrap.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cli=process.argv.slice(2);
if(cli.length!==4||cli[0]!=='--block'||cli[2]!=='--out'||!/^[1-9][0-9]*$/.test(cli[1]))
  throw Error('Usage: node --max-old-space-size=128 scripts/capture-monetary-snapshot.mjs --block NUMBER --out evidence/monetary-policy/snapshot-NUMBER.json');
const blockNumber=Number(cli[1]);assert.ok(Number.isSafeInteger(blockNumber),'Safe integer block required');
const output=path.resolve(root,cli[3]);assert.ok(output.startsWith(root+path.sep),'Output must be within this standalone Vault app');
assert.ok(!fs.existsSync(output),'Refusing to overwrite an existing historical report');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const clean=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const equalAddress=(a,b,label)=>assert.ok(same(a,b),label);
const config=read('.state/deployment-v2.json'),abis=read('.state/abis-v2.json'),instance=read('.state/chain-instance.json');
assertLocalConfig(config);assert.equal(config.protocolVersion,'2');assert.equal(config.monetaryPolicy?.status,'deployed');
assert.equal(config.chainInstance.id,instance.id);assert.equal(instance.chainId,31373);
const POOL='0x75ba1e7c0AC567f3451D2646f1db5eAbc99d07f7';
const STATEMENT='0x390403d03c5e8c37534c14ee5b1a56b9004da93d40a171ee9ba7ae8d62bbfd08';
const a=config.addresses,at={blockTag:blockNumber};
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
const originalSend=provider.send.bind(provider),rpcCounts={};
const readMethods=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_getTransactionReceipt']);
provider.send=async(method,params)=>{
  assert.ok(readMethods.has(method),'Collector refuses non-read RPC method: '+method);
  if(method==='eth_call'||method==='eth_getCode')assert.equal(BigInt(params[1]),BigInt(blockNumber),'Every state read must use the requested block');
  rpcCounts[method]=(rpcCounts[method]??0)+1;return originalSend(method,params);
};
const c=(address,abi)=>new Contract(address,abi,provider);
const erc20ABI=['function totalSupply() view returns(uint256)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)'];
const token=address=>c(address,erc20ABI);
const registry=c(a.StatementRegistry,abis.StatementRegistry),coordinator=c(a.PoolCoordinator,abis.PoolCoordinator),budget=c(a.RewardBudget,abis.RewardBudget);
const allocation=c(a.AllocationController,abis.AllocationController),controller=c(a.ProtocolFeeController,abis.ProtocolFeeController),lp=c(a.BptLockMeter,abis.BptLockMeter);
const vault=c(a.Vault,[...abis.Vault,...abis.VaultExtension,...abis.VaultAdmin].filter(x=>['function','event','error'].includes(x.type)));
const codeChecks={};
async function pinnedCode(address){
  const key=getAddress(address);if(codeChecks[key])return codeChecks[key];
  const expected=Object.entries(config.monetaryPolicy.runtimeHashes).find(([p])=>same(address,p))?.[1];assert.ok(expected,'Missing selected V2 runtime pin: '+key);
  const bytecode=await provider.getCode(address,blockNumber);assert.notEqual(bytecode,'0x');const observed=keccak256(bytecode);assert.equal(observed,expected,'Runtime differs: '+key);
  codeChecks[key]={sha3:observed,pinned:true};return codeChecks[key];
}
function uniqueAddresses(entries){const seen=new Map();for(const [label,address]of entries){const id=getAddress(address),key=id.toLowerCase();if(!seen.has(key))seen.set(key,{label,address:id});}return [...seen.values()];}
try{
  assert.equal((await provider.getNetwork()).chainId,31373n);
  const block=await provider.getBlock(blockNumber);assert.ok(block,'Requested block is unavailable');
  const genesis=await provider.getBlock(0);assert.equal(genesis.timestamp,instance.genesisTimestamp,'Genesis differs from recorded chain instance');
  const deployment=read('.state/deployment-v2-txs.json'),anchor=deployment.receipts.find(r=>same(r.contractAddress,a.TrueToken));assert.ok(anchor,'Missing V2 deployment receipt anchor');
  const receipt=await provider.getTransactionReceipt(anchor.hash);assert.ok(receipt);assert.equal(receipt.status,1);assert.equal(receipt.blockHash,anchor.blockHash);equalAddress(receipt.contractAddress,a.TrueToken,'Deployment anchor token');
  assert.ok(receipt.blockNumber<=blockNumber,'V2 did not exist at requested block');
  const required=['TrueToken','StatementRegistry','PoolCoordinator','Vault','VaultAdmin','VaultExtension','ProtocolFeeController','AllocationController','RewardBudget','BptLockMeter','Router','Authorizer','Timelock','Governor','Membership','ConditionalTokens','SplitsWarehouse','WeightedPoolFactory'];
  await Promise.all(required.map(k=>pinnedCode(a[k])));
  equalAddress(await coordinator.statementOfPool(POOL,at),STATEMENT,'Observed pool/statement differs');
  assert.equal(await allocation.officialPool(POOL,at),true);
  const statement=await registry.getStatement(STATEMENT,at);assert.notEqual(statement.author,ZeroAddress);
  equalAddress(await registry.token(at),a.TrueToken,'Registry collateral');
  equalAddress(await budget.token(at),a.TrueToken,'Budget token');equalAddress(await budget.governance(at),a.Timelock,'Budget authority');
  equalAddress(await c(a.TrueToken,abis.TrueToken).owner(at),a.Timelock,'T issuance authority');
  equalAddress(await c(a.Governor,abis.VaultGovernor).timelock(at),a.Timelock,'Governor executor');
  equalAddress(await allocation.owner(at),a.Timelock,'Allocation owner');equalAddress(await controller.vault(at),a.Vault,'Fee controller Vault');
  equalAddress(await vault.getAuthorizer(at),a.Authorizer,'Active fee authorizer');
  equalAddress(await lp.governance(at),a.Timelock,'LP meter governance');equalAddress(await lp.rewards(at),a.RewardBudget,'LP reward budget');equalAddress(await lp.pools(at),a.AllocationController,'LP official-pool source');

  const hookAddress=await coordinator.hooks(STATEMENT,at),hook=c(hookAddress,abis.IncentiveFinalityHook);
  const hookCode=await provider.getCode(hookAddress,blockNumber);assert.ok(matchesRuntime(hookCode,read('production-v2/artifacts/IncentiveFinalityHook.json')),'Hook must match immutable-aware production template');
  const bindings={registry:a.StatementRegistry,vault:a.Vault,factory:a.WeightedPoolFactory,statementId:STATEMENT,governance:a.Timelock,feeSink:a.AllocationController,trustedRouter:a.Router,rewards:a.RewardBudget};
  for(const [getter,expected]of Object.entries(bindings))equalAddress(await hook[getter](at),expected,'Hook '+getter);
  const trustedRouterCodeHash=await hook.trustedRouterCodeHash(at);assert.equal(trustedRouterCodeHash,codeChecks[getAddress(a.Router)].sha3);
  assert.equal(await hook.registeredPool(POOL,at),true);const hooks=await vault.getHooksConfig(POOL,at);equalAddress(hooks.hooksContract,hookAddress,'Actual Vault hook');
  const roles=await vault.getPoolRoleAccounts(POOL,at);equalAddress(roles.poolCreator,a.AllocationController,'Creator revenue sink');equalAddress(roles.swapFeeManager,a.AllocationController,'Swap fee setter');
  const poolTokenInfo=await vault.getPoolTokenInfo(POOL,at),poolTokens=Array.from(poolTokenInfo.tokens);
  assert.deepEqual(new Set(poolTokens.map(x=>x.toLowerCase())),new Set([a.TrueToken,statement.yes].map(x=>x.toLowerCase())),'Observed YES/T assets');
  const poolContract=c(POOL,abis.WeightedPool),poolCode=await provider.getCode(POOL,blockNumber);assert.notEqual(poolCode,'0x');equalAddress(await poolContract.getVault(at),a.Vault,'BPT Vault binding');
  const epoch=await allocation.epoch(at),active=await allocation.allocation(epoch,at);assert.equal(active.recipients.length,active.weights.length);
  const participants=uniqueAddresses([...config.accounts.slice(0,4).map((x,i)=>['Account'+i,x]),['Timelock',a.Timelock],['Governor',a.Governor]]);
  const holders=uniqueAddresses([...participants.map(p=>[p.label,p.address]),['ConditionalTokens',a.ConditionalTokens],['RewardBudget',a.RewardBudget],['CurrentSplit',active.split],['BptLockMeter',a.BptLockMeter],['Vault',a.Vault],['FeeController',a.ProtocolFeeController],['AllocationController',a.AllocationController],['SplitsWarehouse',a.SplitsWarehouse],['YESWrapper',statement.yes],['NOWrapper',statement.no]]);
  const assets=[{label:'T',address:a.TrueToken},{label:'YES',address:statement.yes},{label:'NO',address:statement.no},{label:'BPT',address:POOL}];
  const assetBalances=await Promise.all(assets.map(async asset=>{
    const t=token(asset.address);return{...asset,decimals:String(await t.decimals(at)),totalSupply:String(await t.totalSupply(at)),balances:Object.fromEntries(await Promise.all(holders.map(async p=>[p.address,String(await t.balanceOf(p.address,at))])))};
  }));
  const bptZeroBalance=String(await token(POOL).balanceOf(ZeroAddress,at));
  const warehouse=c(a.SplitsWarehouse,abis.SplitsWarehouse);
  const warehouseCredits=Object.fromEntries(await Promise.all(participants.map(async p=>[p.address,Object.fromEntries(await Promise.all(assets.slice(0,3).map(async t=>[t.address,String(await warehouse.balanceOf(p.address,BigInt(t.address),at))])))])));
  const programCount=await budget.programCount(at);assert.ok(programCount<=20n,'Snapshot limit is20 programs; explicit collector revision required above20');
  const programs=[];let computedReserved=0n;
  for(let id=0n;id<programCount;id++){
    const p=await budget.programs(id,at),fields=Object.fromEntries(['meter','start','end','claimDeadline','remainderRecipient','budget','paid','reclaimed','totalWeight','closed'].map((k,i)=>[k,clean(p[i])]));
    assert.ok(p.paid+p.reclaimed<=p.budget,'Program accounting exceeds original budget');if(!p.closed)computedReserved+=p.budget-p.paid;
    const observedHookBinding=await hook.programBinding(id,at),lpPool=await lp.programPool(id,at);
    const accounts=Object.fromEntries(await Promise.all(participants.map(async u=>{
      const [weight,claimed,claimable,deposit]=await Promise.all([budget.weights(id,u.address,at),budget.claimed(id,u.address,at),budget.claimable(id,u.address,at),lp.deposits(id,u.address,at)]);
      return[u.address,{weight:String(weight),claimed,claimable:String(claimable),lpDeposit:String(deposit)}];
    })));
    programs.push({id:String(id),...fields,accounts,observedHookBinding:{hook:hookAddress,pool:observedHookBinding.pool,metric:String(observedHookBinding.metric),configured:observedHookBinding.configured},lpMeterBinding:{meter:a.BptLockMeter,pool:lpPool},earningActive:block.timestamp>=Number(p.start)&&block.timestamp<Number(p.end)&&!p.closed,claimWindowActive:block.timestamp>=Number(p.end)&&block.timestamp<Number(p.claimDeadline)&&!p.closed});
  }
  const reserved=await budget.reserved(at),budgetTokenBalance=await token(a.TrueToken).balanceOf(a.RewardBudget,at);assert.equal(reserved,computedReserved,'Reserved equals outstanding original program budgets');assert.ok(budgetTokenBalance>=reserved,'Reserved exceeds actual funded T');
  const [swapInfo,yieldInfo,creatorSwap,creatorYield,heldCreator,heldProtocol]=await Promise.all([controller.getPoolProtocolSwapFeeInfo(POOL,at),controller.getPoolProtocolYieldFeeInfo(POOL,at),controller.getPoolCreatorSwapFeePercentage(POOL,at),controller.getPoolCreatorYieldFeePercentage(POOL,at),controller.getPoolCreatorFeeAmounts(POOL,at),controller.getProtocolFeeAmounts(POOL,at)]);
  const [aggregateSwap,aggregateYield]=await Promise.all([controller.computeAggregateFeePercentage(swapInfo[0],creatorSwap,at),controller.computeAggregateFeePercentage(yieldInfo[0],creatorYield,at)]);
  const feeAssets=await Promise.all(poolTokens.map(async(t,i)=>{
    const [swap,yieldFee]=await Promise.all([vault.getAggregateSwapFeeAmount(POOL,t,at),vault.getAggregateYieldFeeAmount(POOL,t,at)]);
    return{token:t,aggregateSwap:String(swap),aggregateYield:String(yieldFee),controllerCreator:String(heldCreator[i]),controllerProtocol:String(heldProtocol[i]),
      pendingCreator:String(creatorFromAggregate(swap,swapInfo[0],creatorSwap,aggregateSwap)+creatorFromAggregate(yieldFee,yieldInfo[0],creatorYield,aggregateYield)),pendingProtocol:String(protocolFromAggregate(swap,swapInfo[0],creatorSwap,aggregateSwap)+protocolFromAggregate(yieldFee,yieldInfo[0],creatorYield,aggregateYield))};
  }));
  const membership=c(a.Membership,abis.Membership);
  const memberBalances=Object.fromEntries(await Promise.all(participants.map(async u=>[u.address,{balance:String(await membership.balanceOf(u.address,at)),votes:String(await membership.getVotes(u.address,at))}])));
  const report={format:'vault-v2-monetary-historical-snapshot-v1',chainId:31373,chainInstance:instance.id,protocolVersion:'2',block:{number:blockNumber,hash:block.hash,timestamp:block.timestamp},
    identity:{genesis:{number:0,hash:genesis.hash,timestamp:genesis.timestamp},deploymentAnchor:{transactionHash:anchor.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,token:receipt.contractAddress},descriptorSha256:sha256(fs.readFileSync(path.join(root,'.state/deployment-v2.json'))),abiSha256:sha256(fs.readFileSync(path.join(root,'.state/abis-v2.json'))),codeChecks},
    addresses:a,participants,holders,assets:assetBalances,warehouseCredits,membership:{totalSupply:String(await membership.totalSupply(at)),accounts:memberBalances},
    statement:{id:STATEMENT,goalHash:statement.goalHash,profileId:statement.profileId,conditionId:statement.conditionId,author:statement.author,yes:statement.yes,no:statement.no,outcome:String(statement.outcome),resolvedAt:String(statement.resolvedAt)},
    pool:{address:POOL,runtimeHash:keccak256(poolCode),normalizedWeights:Array.from(await poolContract.getNormalizedWeights(at),String),tokens:poolTokens,tokenInfo:clean(poolTokenInfo.tokenInfo),rawBalances:Array.from(poolTokenInfo.balancesRaw,String),lastBalancesLiveScaled18:Array.from(poolTokenInfo.lastBalancesLiveScaled18,String),roles:clean(roles),config:clean(await vault.getPoolConfig(POOL,at)),bptZeroBalance},
    hook:{address:hookAddress,runtimeHash:keccak256(hookCode),productionTemplateMatches:true,bindings:{...bindings,trustedRouterCodeHash},totalTVolume:String(await hook.totalTVolume(POOL,at)),totalExactInTFees:String(await hook.totalExactInTFees(POOL,at)),programSlots:Array.from(await hook.poolPrograms(POOL,at),String)},
    rewards:{address:a.RewardBudget,programCount:String(programCount),programLimit:20,reserved:String(reserved),tokenBalance:String(budgetTokenBalance),unreserved:String(budgetTokenBalance-reserved),computedOutstandingBudget:String(computedReserved),programs},
    fees:{staticSwapFee:String(await vault.getStaticSwapFeePercentage(POOL,at)),globalProtocolSwapShare:String(await controller.getGlobalProtocolSwapFeePercentage(at)),globalProtocolYieldShare:String(await controller.getGlobalProtocolYieldFeePercentage(at)),poolProtocolSwap:{fraction:String(swapInfo[0]),isOverride:swapInfo[1]},poolProtocolYield:{fraction:String(yieldInfo[0]),isOverride:yieldInfo[1]},creatorSwap:String(creatorSwap),creatorYield:String(creatorYield),aggregateSwap:String(aggregateSwap),aggregateYield:String(aggregateYield),assets:feeAssets},
    allocation:{epoch:String(epoch),split:active.split,recipients:Array.from(active.recipients),weights:Array.from(active.weights,String)},
    capture:{mode:'Historical read-only RPC, no signer',contractStateBlock:blockNumber,identityReads:'Genesis and original V2 deployment receipt are explicit identity anchors only',rpcCounts,sourceSha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url))),expectedResults:'None fabricated. Report contains observed state and contract bookkeeping/binding assertions, not a browser pass.'}};
  const endingBlock=await provider.getBlock(blockNumber);assert.equal(endingBlock.hash,block.hash,'Requested historical block changed during capture');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(clean(report),null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({output,blockNumber,blockHash:block.hash,timestamp:block.timestamp,supply:assetBalances[0].totalSupply,programCount:String(programCount),reserved:String(reserved),pool:POOL,rawBalances:report.pool.rawBalances,fees:report.fees,readOnly:true},null,2));
}finally{provider.destroy();}
