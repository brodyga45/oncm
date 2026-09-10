// Isolated in-process Hardhat Cancun only. No HTTP RPC, main chain, proof or application state mutation.
import fs from 'node:fs';import assert from 'node:assert/strict';import hre from 'hardhat';
import {BrowserProvider,Contract,ContractFactory,NonceManager,ZeroAddress,ZeroHash,MaxUint256,parseEther,id,keccak256,AbiCoder} from 'ethers';
const provider=new BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
const raw=await provider.getSigner(0),other=await provider.getSigner(1),third=await provider.getSigner(2),signer=new NonceManager(raw);
const accounts=await Promise.all([raw,other,third].map(s=>s.getAddress())),results=[];
const art=n=>JSON.parse(fs.readFileSync((fs.existsSync(`.state/monetary-artifacts/${n}.json`)?'.state/monetary-artifacts/':'.state/artifacts/')+n+'.json'));
async function deploy(n,args=[]){const a=art(n),c=await new ContractFactory(a.abi,a.bytecode,signer).deploy(...args,{gasLimit:80000000});await c.waitForDeployment();return c;}
const tx=async promise=>(await promise).wait();const at=async()=>Number((await provider.getBlock('latest')).timestamp);
const advance=async n=>{await hre.network.provider.send('evm_setNextBlockTimestamp',[n]);await hre.network.provider.send('evm_mine');};
async function pass(name,fn){await fn();results.push(name);console.log('PASS',name);}
try{
 const executor=await deploy('MeterExecutorHarness'),gov=await executor.getAddress();
 const exec=(c,method,args)=>tx(executor.execute(c.target,c.interface.encodeFunctionData(method,args)));
 const token=await deploy('TrueTokenV2',[gov,accounts,[parseEther('1000'),parseEther('1000'),parseEther('1000')]]);
 const yes=await deploy('TrueToken',[accounts]),no=await deploy('TrueToken',[accounts]);
 const registry=await deploy('MeterRegistryHarness',[token.target]),sid=id('EXPLICIT TEST ONLY, no proof');await tx(registry.seed(sid,yes.target,no.target));
 const bootstrap=await deploy('VaultAuthorizer',[accounts[0]]),codes=['Vault','VaultExtension','VaultAdmin'].map(n=>art(n).bytecode);
 const factory=await deploy('VaultFactory',[bootstrap.target,365*86400,30*86400,1000000,1000000,...codes.map(keccak256)]),salt=id('isolated-meter-v2');
 const va=await factory.getDeploymentAddress(salt),controller=await deploy('ProtocolFeeController',[va,parseEther('0.1'),0]);
 await tx(factory.create(salt,va,controller.target,...codes,{gasLimit:90000000}));const vault=new Contract(va,['Vault','VaultExtension','VaultAdmin'].flatMap(n=>art(n).abi).filter(f=>['function','event','error'].includes(f.type)),signer);
 const weighted=await deploy('WeightedPoolFactory',[va,365*86400,'isolated pinned1.0.0','WeightedPool1.0.0']);
 const weth=await deploy('WETH'),permit=await deploy('Permit2'),router=await deploy('Router',[va,weth.target,permit.target,'isolated original1.0.0']);
 const warehouse=await deploy('SplitsWarehouse',['Ether','ETH']),splits=await deploy('PullSplitFactory',[warehouse.target]);
 const rows=accounts.slice(0,2).sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
 const allocation=await deploy('AllocationControllerV2',[controller.target,splits.target,rows,[6000,4000],accounts[0]]);
 const reward=await deploy('RewardBudget',[token.target,gov]);
 const coordinator=await deploy('PoolCoordinatorV2',[registry.target,weighted.target,allocation.target,gov,router.target,reward.target]);
 await tx(allocation.setCoordinator(coordinator.target));await tx(allocation.transferOwnership(gov));
 const authorizer=await deploy('FeeRoutingAuthorizer',[gov,va,controller.target,allocation.target]);await tx(vault.setAuthorizer(authorizer.target));
 await tx(coordinator.create(sid,0,parseEther('0.5'),parseEther('0.03'),id('pool')));
 const pool=(await coordinator.getPool(0)).pool,bpt=new Contract(pool,art('WeightedPool').abi,signer);
 const hook=new Contract(await coordinator.hooks(sid),art('IncentiveFinalityHook').abi,signer);
 const tokens=Array.from(await vault.getPoolTokens(pool)),lp=await deploy('BptLockMeter',[gov,reward.target,allocation.target]);
 for(const actor of [signer,other])for(const asset of[token,yes]){await tx(asset.connect(actor).approve(permit.target,MaxUint256));await tx(permit.connect(actor).approve(asset.target,router.target,(1n<<160n)-1n,(1n<<48n)-1n));}
 await tx(router.initialize(pool,tokens,tokens.map(()=>parseEther('100')),0,false,'0x'));
 await pass('A newly initialized official pool trades normally before any reward program exists',async()=>{
   await tx(router.connect(other).swapSingleTokenExactIn(pool,token.target,yes.target,parseEther('0.01'),0,(await at())+1000,false,'0x'));
   assert.equal(await reward.programCount(),0n);assert.equal(await hook.totalTVolume(pool),parseEther('0.01'));
 });
 const start=await at()+100,end=start+100,deadline=end+100;
 for(let n=0;n<3;n++){await exec(token,'mint',[reward.target,parseEther('100')]);await exec(reward,'createProgram',[n,n<2?hook.target:lp.target,start,end,deadline,parseEther('100'),gov]);await exec(n<2?hook:lp,'configureProgram',n<2?[n,pool,n]:[n,pool]);}
 await pass('A directly factory-created unofficial pool cannot receive a configured reward budget',async()=>{
   const configs=tokens.map(t=>[t,0,ZeroAddress,false]),args=['Unofficial fixture','ufBPT',configs,[parseEther('0.5'),parseEther('0.5')],[gov,gov,gov],parseEther('0.03'),hook.target,false,true,id('unofficial')];
   const unofficial=await weighted.create.staticCall(...args);await tx(weighted.create(...args));assert.equal(await hook.registeredPool(unofficial),true);assert.equal(await allocation.officialPool(unofficial),false);
   await exec(token,'mint',[reward.target,parseEther('1')]);await exec(reward,'createProgram',[3,hook.target,start,end,deadline,parseEther('1'),gov]);
   await assert.rejects(()=>executor.execute.staticCall(hook.target,hook.interface.encodeFunctionData('configureProgram',[3,unofficial,0])));
   assert.equal((await hook.programBinding(3)).configured,false);
 });
 await pass('Original authentication action IDs match fixed allowlist; no DAO withdrawal or authorizer/controller upgrade',async()=>{
   for(const method of ['withdrawProtocolFees','withdrawProtocolFeesForToken']){const selector=controller.interface.getFunction(method).selector;assert.equal(await authorizer.canPerform(await controller.getActionId(selector),gov,controller.target),false);}
   assert.equal(await authorizer.canPerform(await controller.getActionId(controller.interface.getFunction('withdrawProtocolFees').selector),allocation.target,controller.target),true);
   assert.equal(await authorizer.canPerform(await controller.getActionId(controller.interface.getFunction('setGlobalProtocolSwapFeePercentage').selector),gov,controller.target),true);
   for(const method of ['setAuthorizer','setProtocolFeeController']){const selector=vault.interface.getFunction(method).selector;assert.equal(await authorizer.canPerform(await vault.getActionId(selector),gov,va),false);}
   await assert.rejects(()=>executor.execute.staticCall(va,vault.interface.encodeFunctionData('setAuthorizer',[bootstrap.target])));
   await assert.rejects(()=>executor.execute.staticCall(va,vault.interface.encodeFunctionData('setProtocolFeeController',[controller.target])));
   await assert.rejects(()=>executor.execute.staticCall(controller.target,controller.interface.encodeFunctionData('withdrawProtocolFees',[pool,gov])));
   await assert.rejects(()=>executor.execute.staticCall(controller.target,controller.interface.encodeFunctionData('withdrawProtocolFeesForToken',[pool,gov,token.target])));
 });
 await pass('Governed original fee setters, pool role management and immutable program configuration',async()=>{
   await exec(allocation,'setPoolSwapFee',[pool,parseEther('0.03')]);await exec(allocation,'setCreatorFee',[pool,parseEther('0.2')]);
   assert.equal(await vault.getStaticSwapFeePercentage(pool),parseEther('0.03'));
   await assert.rejects(()=>allocation.setPoolSwapFee.staticCall(pool,parseEther('0.01')));
   await assert.rejects(()=>executor.execute.staticCall(hook.target,hook.interface.encodeFunctionData('configureProgram',[0,pool,1])));
   assert.equal(await hook.trustedRouterCodeHash(),keccak256(await provider.getCode(router.target)));
 });
 await advance(start);
 const forge=AbiCoder.defaultAbiCoder().encode(['address'],[accounts[2]]);
 await pass('Actual original Router swap ignores forged userData payee; records exact fee and gross T volume',async()=>{
   await tx(router.connect(other).swapSingleTokenExactIn(pool,token.target,yes.target,parseEther('1'),0,deadline,false,forge));
   assert.equal(await reward.weights(0,accounts[1]),parseEther('1'));assert.equal(await reward.weights(0,accounts[2]),0n);
   assert.equal(await reward.weights(1,accounts[1]),parseEther('0.03'));assert.equal(await hook.totalTVolume(pool),parseEther('1.01'));
 });
 await pass('Original query arbitrary sender cannot persist rewards; transaction query rejects',async()=>{
   const before=await reward.weights(0,accounts[2]),volume=await hook.totalTVolume(pool);
   const data=router.interface.encodeFunctionData('querySwapSingleTokenExactIn',[pool,token.target,yes.target,parseEther('1'),accounts[2],forge]);
   const response=await provider.call({from:ZeroAddress,to:router.target,data});assert(response.length>2);
   await assert.rejects(async()=>tx(signer.sendTransaction({to:router.target,data,gasLimit:8000000})));
   assert.equal(await reward.weights(0,accounts[2]),before);assert.equal(await hook.totalTVolume(pool),volume);
 });
 await pass('A real untrusted Vault router is measured but earns no address reward',async()=>{
   const direct=await deploy('UntrustedMeterRouter',[va]);await tx(token.connect(other).approve(direct.target,parseEther('1')));
   const w=await reward.weights(0,accounts[1]),volume=await hook.totalTVolume(pool);
   await tx(direct.connect(other).swap(pool,token.target,yes.target,parseEther('1'),forge));
   assert.equal(await reward.weights(0,accounts[1]),w);assert.equal(await reward.weights(0,accounts[2]),0n);assert.equal(await hook.totalTVolume(pool),volume+parseEther('1'));
 });
 await pass('Sell T-output counts actual volume but never T-input fee reward',async()=>{
   const before=await reward.weights(0,accounts[1]),fee=await reward.weights(1,accounts[1]),t=await token.balanceOf(accounts[1]);
   await tx(router.connect(other).swapSingleTokenExactIn(pool,yes.target,token.target,parseEther('0.25'),0,deadline,false,'0x'));
   assert.equal(await reward.weights(0,accounts[1])-before,(await token.balanceOf(accounts[1]))-t);assert.equal(await reward.weights(1,accounts[1]),fee);
 });
 await pass('EXACT_OUT T input earns volume only; no falsely reconstructed fee',async()=>{
   const before=await reward.weights(0,accounts[1]),fee=await reward.weights(1,accounts[1]),t=await token.balanceOf(accounts[1]);
   await tx(router.connect(other).swapSingleTokenExactOut(pool,token.target,yes.target,parseEther('0.25'),parseEther('5'),deadline,false,'0x'));
   assert.equal(await reward.weights(0,accounts[1])-before,t-(await token.balanceOf(accounts[1])));assert.equal(await reward.weights(1,accounts[1]),fee);
 });
 await pass('Global and creator fees both flow exactly into current beneficiary Split; no DAO capture',async()=>{
   await tx(controller.collectAggregateFees(pool));const global=Array.from(await controller.getProtocolFeeAmounts(pool)),creator=Array.from(await controller.getPoolCreatorFeeAmounts(pool)),split=(await allocation.allocation(1)).split;
   assert(global.some(n=>n>0n)&&creator.some(n=>n>0n));const before=await Promise.all(tokens.map(t=>new Contract(t,art('TrueToken').abi,provider).balanceOf(split)));
   await tx(allocation.collectAll(pool));
   for(let i=0;i<tokens.length;i++)assert.equal((await new Contract(tokens[i],art('TrueToken').abi,provider).balanceOf(split))-before[i],global[i]+creator[i]);
   assert((await controller.getProtocolFeeAmounts(pool)).every(n=>n===0n));assert((await controller.getPoolCreatorFeeAmounts(pool)).every(n=>n===0n));assert.equal(await token.balanceOf(gov),0n);
 });
 await pass('Inherited allocation retains losing EOA consent; governance cannot override it',async()=>{
   const next=[{a:gov,w:2000},{a:rows[0],w:4000},{a:rows[1],w:4000}].sort((a,b)=>a.a.toLowerCase().localeCompare(b.a.toLowerCase()));
   await tx(allocation.propose(next.map(x=>x.a),next.map(x=>x.w)));
   await assert.rejects(()=>executor.execute.staticCall(allocation.target,allocation.interface.encodeFunctionData('applyAllocation',[0])));
   await assert.rejects(()=>executor.execute.staticCall(allocation.target,allocation.interface.encodeFunctionData('setConsent',[0,true])));
   const loser=rows[0].toLowerCase()===accounts[0].toLowerCase()?signer:other;await tx(allocation.connect(loser).setConsent(0,true));await tx(allocation.applyAllocation(0));assert.equal(await allocation.epoch(),2n);
 });
 await pass('Voluntary BPT custody records exact committed seconds and rejects early withdrawal',async()=>{
   await tx(bpt.approve(lp.target,parseEther('1')));const receipt=await tx(lp.stake(2,parseEther('1'))),time=Number((await provider.getBlock(receipt.blockNumber)).timestamp);
   assert.equal(await reward.weights(2,accounts[0]),parseEther('1')*BigInt(end-time));assert.equal(await lp.deposits(2,accounts[0]),parseEther('1'));assert.equal(await bpt.balanceOf(lp.target),parseEther('1'));
   await assert.rejects(()=>lp.withdraw.staticCall(2));await assert.rejects(()=>reward.recordWeight.staticCall(2,accounts[2],1));
 });
 // Uninitialized pool tests the separate beforeInitialize gate that is easy to omit.
 await tx(coordinator.create(sid,1,parseEther('0.5'),parseEther('0.03'),id('uninitialized')));const unopened=(await coordinator.getPool(1)).pool;
 await advance(end);await tx(registry.resolve(sid));
 await pass('End-of-program weights freeze; resolved pools reject swaps and initialization while BPT unlock/exit remains possible',async()=>{
   await assert.rejects(()=>router.swapSingleTokenExactIn.staticCall(pool,token.target,yes.target,parseEther('1'),0,deadline,false,'0x'));
   const ordered=Array.from(await vault.getPoolTokens(unopened));await assert.rejects(()=>router.initialize.staticCall(unopened,ordered,ordered.map(()=>parseEther('1')),0,false,'0x'));assert.equal(await vault.totalSupply(unopened),0n);
   const before=await bpt.balanceOf(accounts[0]);await tx(lp.withdraw(2));assert.equal((await bpt.balanceOf(accounts[0]))-before,parseEther('1'));assert.equal(await lp.deposits(2,accounts[0]),0n);
   await tx(bpt.approve(router.target,parseEther('1')));await tx(router.removeLiquidityProportional(pool,parseEther('1'),[0,0],false,'0x'));
   await tx(reward.claim(2));assert.equal(await reward.claimed(2,accounts[0]),true);assert.equal(await reward.claimable(2,accounts[0]),0n);await assert.rejects(()=>reward.claim.staticCall(2));
 });
 const report={format:'vault-meter-isolated-v1',scope:'Ephemeral in-process Hardhat Cancun, original Balancer1.0.0 Vault/Router/WeightedPool/Controller and Splits, explicit mocked statement validity/executor for policy tests, no main RPC or Lean claim',results,passed:results.length,legacyChainTouched:false};
 fs.mkdirSync('docs/evidence/monetary-policy',{recursive:true});fs.writeFileSync('docs/evidence/monetary-policy/meters-contract-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{provider.destroy();}
