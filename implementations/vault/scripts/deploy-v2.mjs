// Explicit additive local deployment. Default prepares a review; --execute consumes
// that exact review. Never replaces the legacy descriptor, mints, installs a proof
// profile or alters Governor membership. No startup path calls this script.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Contract,ContractFactory,JsonRpcProvider,HDNodeWallet,NonceManager,keccak256,id,ZeroAddress} from 'ethers';
import {runtimeFiles,readRuntimeDeployment} from '../server/runtime-version.mjs';
import {assertLocalConfig} from '../sdk/local-endpoints.mjs';
import {supportedExternalProfiles} from '../sdk/external-profile-catalog.mjs';
import {ensureProductionArtifacts} from './production-bootstrap.mjs';
import {loadMonetaryBootstrap,matchesRuntime,sha256} from './monetary-bootstrap.mjs';
import {assertFreshV2Plan} from './v2-plan.mjs';

const root=process.cwd(),legacyFiles=runtimeFiles(root,'legacy'),nextFiles=runtimeFiles(root,'2');
const old=readRuntimeDeployment(legacyFiles),endpoints=assertLocalConfig(old);
const execute=process.argv.includes('--execute');
const planFile='.state/deploy-v2-plan.json',progressFile='.state/deploy-v2-progress.json';
for(const file of[nextFiles.deployment,nextFiles.abis])if(fs.existsSync(file))throw Error('V2 already exists; no automatic replacement: '+file);
if(fs.existsSync(progressFile))throw Error('A V2 deployment attempt already started. Review its intent, nonce and receipts before recovery, even if no RPC hash was returned; never redeploy silently.');
ensureProductionArtifacts(root);
const bootstrap=loadMonetaryBootstrap(root),artifacts={};
const original=n=>artifacts[n]??=JSON.parse(fs.readFileSync('production/artifacts/'+n+'.json'));
Object.assign(artifacts,bootstrap.artifacts);
const provider=new JsonRpcProvider(old.rpcUrl,undefined,{cacheTimeout:-1});provider.pollingInterval=100;
const oldABI=JSON.parse(fs.readFileSync(legacyFiles.abis));
const c=(key,name=key)=>new Contract(old.addresses[key],oldABI[name],provider);
const lower=x=>x.toLowerCase();
const equal=(a,b)=>assert.equal(lower(a),lower(b));
const frozenFiles=()=>Object.fromEntries([legacyFiles.deployment,legacyFiles.abis,legacyFiles.social].filter(f=>fs.existsSync(f)).map(f=>[f.split('/').at(-1),sha256(fs.readFileSync(f))]));
const reuse=['Membership','Timelock','Governor','ConditionalTokens','Wrapped1155Factory','SplitsWarehouse','PullSplitFactory','Permit2','WETH','ResolvedWithinWindowOperator'];
async function context(){
 assert.equal((await provider.getNetwork()).chainId,31373n);
 const local=JSON.parse(fs.readFileSync('.state/chain-instance.json'));
 assert.equal(local.id,old.chainInstance.id,'Current local chain differs from legacy deployment');
 const block=await provider.getBlock('latest');
 if(old.chainInstance.genesisTimestamp)assert.equal((await provider.getBlock(0)).timestamp,old.chainInstance.genesisTimestamp,'Chain genesis differs');
 const governor=c('Governor','VaultGovernor'),allocation=c('AllocationController'),registry=c('StatementRegistry');
 equal(await governor.timelock({blockTag:block.number}),old.addresses.Timelock);
 equal(await governor.token({blockTag:block.number}),old.addresses.Membership);
 equal(await c('Membership').owner({blockTag:block.number}),old.addresses.Timelock);
 equal(await allocation.owner({blockTag:block.number}),old.addresses.Timelock);
 const epoch=await allocation.epoch({blockTag:block.number}),shares=await allocation.allocation(epoch,{blockTag:block.number});
 const runtimeHashes={};for(const key of reuse){const code=await provider.getCode(old.addresses[key],block.number);assert.notEqual(code,'0x','Missing original '+key);runtimeHashes[old.addresses[key]]=keccak256(code);}
 const profiles=[];
 for(const d of supportedExternalProfiles()){
  const p=await registry.profiles(d.profileId,{blockTag:block.number});
  if(p.verifier===ZeroAddress)continue;
  assert.equal(p.manifest,d.manifest,'Legacy profile manifest differs from pinned adapter');
  const bridge=new Contract(p.verifier,['function imageId() view returns(bytes32)','function profileId() view returns(bytes32)'],provider);
  assert.equal(await bridge.imageId({blockTag:block.number}),d.imageId);assert.equal(await bridge.profileId({blockTag:block.number}),d.profileId);
  profiles.push({profileId:d.profileId,imageId:d.imageId,tag:d.tag,verifier:p.verifier,manifest:p.manifest,runtimeHash:keccak256(await provider.getCode(p.verifier,block.number))});
 }
 return{format:'vault-additive-v2-plan-v1',chainId:31373,chainInstance:old.chainInstance.id,rpcUrl:old.rpcUrl,
  reviewedBlock:{number:block.number,hash:block.hash},legacyFileHashes:frozenFiles(),legacyAddresses:old.addresses,
  reuse:Object.fromEntries(reuse.map(k=>[k,old.addresses[k]])),reuseRuntimeHashes:runtimeHashes,
  governance:old.addresses.Timelock,deployer:old.accounts[0],deployerNonce:await provider.getTransactionCount(old.accounts[0],'pending'),genesis:[],initialSupply:'0',
  allocation:{sourceController:old.addresses.AllocationController,sourceEpoch:String(epoch),recipients:Array.from(shares.recipients),weights:Array.from(shares.weights,String)},
  pendingProfiles:profiles,monetaryManifestSha256:sha256(fs.readFileSync('production-v2/manifest.json')),
  actions:['Deploy separate collateral/registry/Vault/fees/rewards graph','Bind coordinator once; transfer allocation ownership to existing Timelock','Install immutable scoped fee authorizer as final bootstrap action','Save separate V2 descriptor; no profiles admitted and no tokens issued'],
  preserved:'Legacy collateral, markets, positions, LP, fee epochs, social history and Governor remain at their original addresses'};
}
async function protectedState(){
 const block=await provider.getBlockNumber(),a=c('AllocationController'),r=c('StatementRegistry'),t=c('TrueToken');
 const holders=[...old.accounts,old.addresses.Timelock,old.addresses.ConditionalTokens];
 return{files:frozenFiles(),registryCount:String(await r.count({blockTag:block})),epoch:String(await a.epoch({blockTag:block})),supply:String(await t.totalSupply({blockTag:block})),balances:Object.fromEntries(await Promise.all(holders.map(async who=>[who,String(await t.balanceOf(who,{blockTag:block}))])))};
}
const current=await context();
if(!execute){fs.writeFileSync(planFile,JSON.stringify(current,null,2)+'\n');console.log(JSON.stringify({status:'prepared-only',planFile,reviewedBlock:current.reviewedBlock,initialSupply:current.initialSupply,allocation:current.allocation,pendingProfiles:current.pendingProfiles.map(p=>p.profileId),transactionsSent:0},null,2));provider.destroy();}
else{
 const reviewed=JSON.parse(fs.readFileSync(planFile));
 // Block number may advance; all policy, source, chain and code bindings must stay equal.
 assertFreshV2Plan(current,reviewed);
 assert.equal((await provider.getBlock(reviewed.reviewedBlock.number))?.hash,reviewed.reviewedBlock.hash,'Reviewed block is no longer canonical');
 const before=await protectedState(),receipts=[],addresses={...current.reuse};let pendingTransaction=null;
 const signer=new NonceManager(HDNodeWallet.fromPhrase('test test test test test test test test test test test junk',undefined,"m/44'/60'/0'/0/0").connect(provider));
 const deployer=await signer.getAddress();equal(deployer,old.accounts[0]);
 const progress=()=>{const tmp=progressFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify({format:'vault-v2-deployment-progress-v1',planSha256:sha256(fs.readFileSync(planFile)),addresses,pendingTransaction,receipts},null,2)+'\n');fs.renameSync(tmp,progressFile);};
 progress();
 async function tx(label,p){const response=await p;pendingTransaction={label,hash:response.hash,to:response.to,nonce:response.nonce,dataSha256:sha256(Buffer.from(response.data.slice(2),'hex'))};progress();const receipt=await response.wait();assert.equal(receipt.status,1);receipts.push({label,hash:receipt.hash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,contractAddress:receipt.contractAddress,status:receipt.status});pendingTransaction=null;progress();return receipt;}
 async function deploy(name,args=[],key=name){
  const artifact=artifacts[name]??original(name),contract=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(...args,{gasLimit:50000000});
  await tx('Deploy '+key,Promise.resolve(contract.deploymentTransaction()));addresses[key]=await contract.getAddress();progress();
  if(bootstrap.artifacts[name])assert.ok(matchesRuntime(await provider.getCode(addresses[key]),artifact),'New V2 runtime differs: '+name);
  return contract;
 }
 try{
  const token=await deploy('TrueTokenV2',[current.governance,[],[]],'TrueToken');
  const registry=await deploy('StatementRegistry',[addresses.ConditionalTokens,addresses.TrueToken,addresses.Wrapped1155Factory,current.governance]);
  await deploy('PositionRouter',[addresses.StatementRegistry]);
  const temporary=await deploy('VaultAuthorizer',[deployer],'BootstrapAuthorizer');
  const codes=['Vault','VaultExtension','VaultAdmin'].map(n=>original(n).bytecode);
  const factory=await deploy('VaultFactory',[temporary.target,365*86400,30*86400,1000000,1000000,...codes.map(keccak256)]);
  const salt=id('oncm.vault.additive.v2:'+old.chainInstance.id+':'+addresses.StatementRegistry);
  addresses.Vault=await factory.getDeploymentAddress(salt);
  const controller=await deploy('ProtocolFeeController',[addresses.Vault,0,0]);
  await tx('Create original Balancer Vault V2',factory.create(salt,addresses.Vault,controller.target,...codes,{gasLimit:80000000}));
  addresses.VaultAdmin=await factory.deployedVaultAdmins(addresses.Vault);addresses.VaultExtension=await factory.deployedVaultExtensions(addresses.Vault);
  const weighted=await deploy('WeightedPoolFactory',[addresses.Vault,365*86400,'ONCM Vault V2 / Balancer 1.0.0','WeightedPool 1.0.0']);
  const router=await deploy('Router',[addresses.Vault,addresses.WETH,addresses.Permit2,'ONCM Vault V2 Router / 1.0.0']);
  const allocation=await deploy('AllocationControllerV2',[controller.target,addresses.PullSplitFactory,current.allocation.recipients,current.allocation.weights,deployer],'AllocationController');
  const rewards=await deploy('RewardBudget',[token.target,current.governance]);
  const coordinator=await deploy('PoolCoordinatorV2',[registry.target,weighted.target,allocation.target,current.governance,router.target,rewards.target],'PoolCoordinator');
  await tx('Bind official V2 coordinator',allocation.setCoordinator(coordinator.target));
  await tx('V2 allocation ownership to existing Timelock',allocation.transferOwnership(current.governance));
  const lp=await deploy('BptLockMeter',[current.governance,rewards.target,allocation.target]);
  const authorizer=await deploy('FeeRoutingAuthorizer',[current.governance,addresses.Vault,controller.target,allocation.target],'Authorizer');
  const vault=new Contract(addresses.Vault,[...original('Vault').abi,...original('VaultExtension').abi,...original('VaultAdmin').abi].filter(x=>['function','event','error'].includes(x.type)),signer);
  await tx('Finalize immutable beneficiary fee permissions',vault.setAuthorizer(authorizer.target));
  equal(await vault.getAuthorizer(),authorizer.target);equal(await allocation.owner(),current.governance);
  equal(await registry.owner(),current.governance);equal(await token.owner(),current.governance);
  equal(await registry.token(),token.target);equal(await registry.ctf(),addresses.ConditionalTokens);equal(await registry.wrappers(),addresses.Wrapped1155Factory);
  equal(await rewards.token(),token.target);equal(await rewards.governance(),current.governance);
  equal(await allocation.controller(),controller.target);equal(await allocation.balancerVault(),addresses.Vault);equal(await allocation.splitFactory(),addresses.PullSplitFactory);equal(await allocation.coordinator(),coordinator.target);
  equal(await coordinator.registry(),registry.target);equal(await coordinator.factory(),weighted.target);equal(await coordinator.allocation(),allocation.target);equal(await coordinator.governance(),current.governance);equal(await coordinator.trustedRouter(),router.target);equal(await coordinator.rewards(),rewards.target);
  equal(await lp.governance(),current.governance);equal(await lp.rewards(),rewards.target);equal(await lp.pools(),allocation.target);
  equal(await authorizer.authority(),current.governance);equal(await authorizer.vault(),addresses.Vault);equal(await authorizer.controller(),controller.target);equal(await authorizer.allocation(),allocation.target);
  assert.equal(await token.totalSupply(),0n);assert.equal(await rewards.programCount(),0n);assert.equal(await registry.count(),0n);
  for(const p of current.pendingProfiles)assert.equal((await registry.profiles(p.profileId)).verifier,ZeroAddress);
  const runtimeHashes={};for(const address of new Set([...Object.values(addresses),...current.pendingProfiles.map(p=>p.verifier)]))runtimeHashes[address]=keccak256(await provider.getCode(address));
  const primary=current.pendingProfiles.find(p=>p.profileId===old.proof.profileId);
  if(!primary)throw Error('Missing reviewed original-verifier reference profile');
  addresses.LeanProofBridge=primary.verifier;
  const governanceActions=current.pendingProfiles.map(p=>({label:'Admit '+p.tag+' in V2 through Governor',target:registry.target,value:'0',calldata:registry.interface.encodeFunctionData('setProfile',[p.profileId,p.verifier,true,p.manifest]),profileId:p.profileId}));
  if(old.exampleOperator)governanceActions.push({label:'Admit existing ResolvedWithinWindow in V2 through Governor',target:registry.target,value:'0',calldata:registry.interface.encodeFunctionData('setOperator',[old.exampleOperator.id,old.exampleOperator.implementation,old.exampleOperator.specification,true])});
  const aliases={TrueToken:'TrueTokenV2',AllocationController:'AllocationControllerV2',PoolCoordinator:'PoolCoordinatorV2',FinalityHook:'IncentiveFinalityHook',VaultAuthorizer:'FeeRoutingAuthorizer'};
  const abis={...oldABI,...Object.fromEntries(Object.entries(artifacts).map(([name,a])=>[name,a.abi]))};for(const[key,name]of Object.entries(aliases))abis[key]=bootstrap.artifacts[name].abi;
  const config={...old,protocolVersion:'2',name:'Vault V2',addresses,localPortOffset:endpoints.offset,deploymentBlock:receipts[0].blockNumber,createdAt:new Date().toISOString(),
   proof:{...old.proof,status:'pending-governance',verifier:primary?.verifier??ZeroAddress},
   monetaryPolicy:{version:'vault-monetary-v1',status:'deployed',token:token.target,rewards:rewards.target,governance:current.governance,runtimeHashes,
    meters:[{address:lp.target,name:'Voluntary BPT lock',kind:'lp',metrics:[{id:'0',name:'BPT-seconds committed until program end'}]}],
    hookTemplate:{contract:'IncentiveFinalityHook',artifactSha256:bootstrap.manifest.artifacts.find(x=>x.name==='IncentiveFinalityHook').artifactSha256,deployedBytecode:bootstrap.artifacts.IncentiveFinalityHook.deployedBytecode,immutableReferences:bootstrap.artifacts.IncentiveFinalityHook.immutableReferences},
    dynamicTradeMeter:{coordinator:coordinator.target,factory:weighted.target,router:router.target,metrics:[{id:'0',name:'Actual T-leg volume'},{id:'1',name:'Exact-in T-input fee only'}]},
    initialSupply:'0',initialAllocation:current.allocation,permanentSupplyCap:null},
   pendingGovernanceActions:governanceActions,legacy:{deploymentFile:'deployment.json',addresses:old.addresses,chainInstance:old.chainInstance.id,rights:'Separate collateral/positions/LP/fee/social graph; no automatic migration'}};
  const after=await protectedState();assert.deepEqual(after,before,'Legacy protected state changed during additive deployment');
  fs.writeFileSync(nextFiles.abis,JSON.stringify(abis),{flag:'wx'});fs.writeFileSync(nextFiles.deployment,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync('.state/deployment-v2-txs.json',JSON.stringify({status:'deployed',receipts,before,after,governanceActions,profilesAdmitted:false,tokensMinted:'0',social:'Separate V2 social setup is the next explicit setup stage'},null,2)+'\n');
  console.log(JSON.stringify({status:'deployed-additive-v2',lastBlock:receipts.at(-1).blockNumber,addresses,governanceActions:governanceActions.length,initialSupply:'0',legacyPreserved:true},null,2));
 }finally{provider.destroy();}
}
