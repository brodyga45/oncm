// Historical read-only Governor fee-policy evidence. No signer or chain writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Contract,Interface,JsonRpcProvider,keccak256,toUtf8Bytes} from 'ethers';
import {assertLocalConfig} from '../sdk/local-endpoints.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const spec=read(process.argv[2]),config=read('.state/deployment-v2.json'),legacy=read('.state/deployment.json'),abis=read('.state/abis-v2.json');
const pool='0x75ba1e7c0AC567f3451D2646f1db5eAbc99d07f7',market=read('evidence/monetary-policy/profile-market-308-335.json').market;
assertLocalConfig(config);
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1}),at=n=>({blockTag:n});
const clean=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
const c=(a,abi)=>new Contract(a,abi,provider),erc=['function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)'];
const governor=c(config.addresses.Governor,abis.VaultGovernor),allocation=c(config.addresses.AllocationController,abis.AllocationController),controller=c(config.addresses.ProtocolFeeController,abis.ProtocolFeeController);
const vault=c(config.addresses.Vault,[...abis.Vault,...abis.VaultExtension,...abis.VaultAdmin].filter(x=>['function','event','error'].includes(x.type)));
const interfaces=Object.values(abis).map(a=>new Interface(a.filter(x=>['function','event','error'].includes(x.type))));
const args=(fragment,values)=>Object.fromEntries(fragment.inputs.map((f,i)=>[f.name||String(i),clean(values[i])]));
async function fees(block){return{staticSwapFee:String(await vault.getStaticSwapFeePercentage(pool,at(block))),creatorShare:String(await controller.getPoolCreatorSwapFeePercentage(pool,at(block))),globalProtocolShare:String(await controller.getGlobalProtocolSwapFeePercentage(at(block))),cachedProtocolInfo:clean(await controller.getPoolProtocolSwapFeeInfo(pool,at(block))),poolConfig:clean(await vault.getPoolConfig(pool,at(block)))};}
async function protectedState(block){
 const holders=[...config.accounts,config.addresses.Timelock,config.addresses.ConditionalTokens,config.addresses.Vault,config.addresses.RewardBudget];
 const assets={};for(const asset of[config.addresses.TrueToken,market.positions.yes,market.positions.no,pool,legacy.addresses.TrueToken,'0x873b5750e54339F2429C9581959874EDF887280f',config.addresses.Membership]){const token=c(asset,erc);assets[asset]={totalSupply:String(await token.totalSupply(at(block))),holders:{}};for(const who of holders)assets[asset].holders[who]=String(await token.balanceOf(who,at(block)));}
 const rewards=c(config.addresses.RewardBudget,abis.RewardBudget),registry=c(config.addresses.StatementRegistry,abis.StatementRegistry),epoch=await allocation.epoch(at(block)),shares=await allocation.allocation(epoch,at(block));
 return{assets,poolTokenInfo:clean(await vault.getPoolTokenInfo(pool,at(block))),roles:clean(await vault.getPoolRoleAccounts(pool,at(block))),programs:String(await rewards.programCount(at(block))),reserved:String(await rewards.reserved(at(block))),outcome:String(await registry.outcomeOf(market.statementId,at(block))),allocation:{epoch:String(epoch),split:shares.split,recipients:Array.from(shares.recipients),weights:Array.from(shares.weights,String)}};
}
try{
 assert.equal((await provider.getNetwork()).chainId,31373n);
 const target=spec.target==='AllocationController'?allocation:controller,call=target.interface.encodeFunctionData(spec.method,spec.args);
 const isSync=spec.kind==='sync',proposalId=isSync?null:await governor.hashProposal([target.target],[0],[call],keccak256(toUtf8Bytes(spec.description)));
 const blocks=[];
 for(const n of spec.transactionBlocks){const b=await provider.getBlock(n),transactions=[];assert.equal(b.transactions.length,1);for(const hash of b.transactions){const[t,r]=await Promise.all([provider.getTransaction(hash),provider.getTransactionReceipt(hash)]);assert.equal(r.status,1);assert.equal(t.to,isSync?target.target:governor.target);const p=(isSync?target:governor).interface.parseTransaction({data:t.data,value:t.value});
  transactions.push({hash,from:t.from,to:t.to,nonce:t.nonce,status:r.status,gasUsed:String(r.gasUsed),calldata:t.data,decoded:{method:p.name,args:args(p.fragment,p.args)},events:r.logs.map(l=>{let decoded=null;for(const abi of interfaces){try{const e=abi.parseLog(l);if(e){decoded={name:e.name,args:args(e.fragment,e.args)};break;}}catch{}}return{address:l.address,index:l.index,topics:l.topics,data:l.data,decoded};})});}blocks.push({number:n,hash:b.hash,timestamp:b.timestamp,transactions});}
 const tx=blocks.flatMap(b=>b.transactions);let proposal=null;
 if(isSync){assert.equal(tx.length,1);assert.equal(tx[0].calldata,call);assert.equal(tx[0].decoded.method,'updateProtocolSwapFeePercentage');assert.equal(tx[0].from,config.accounts[0]);}
 else{
  assert.deepEqual(tx.map(x=>x.decoded.method),['propose','castVote','castVote','queue','execute']);
  const created=tx[0].events.find(e=>e.decoded?.name==='ProposalCreated').decoded.args;assert.equal(created.proposalId,String(proposalId));assert.equal(created.description,spec.description);assert.deepEqual(created.targets,[target.target]);assert.deepEqual(created.calldatas,[call]);
  assert.equal(await governor.state(proposalId,at(spec.afterBlock)),7n);
  const snapshot=await governor.proposalSnapshot(proposalId,at(spec.afterBlock)),votes=await governor.proposalVotes(proposalId,at(spec.afterBlock)),quorum=await governor.quorum(snapshot,at(spec.afterBlock));assert.equal(votes.forVotes,2000000000000000000n);assert.equal(quorum,2000000000000000000n);
  proposal={id:String(proposalId),description:spec.description,target:target.target,method:spec.method,calldata:call,snapshot:String(snapshot),deadline:String(await governor.proposalDeadline(proposalId,at(spec.afterBlock))),quorum:String(quorum),votes:clean(votes),state:'Executed'};
 }
 const beforeFees=await fees(spec.beforeBlock),afterFees=await fees(spec.afterBlock);for(const[k,v]of Object.entries(spec.expectedBefore))assert.deepEqual(beforeFees[k],v);for(const[k,v]of Object.entries(spec.expectedAfter))assert.deepEqual(afterFees[k],v);
 const before=await protectedState(spec.beforeBlock),after=await protectedState(spec.afterBlock);assert.deepEqual(after,before);
 const report={format:isSync?'vault-v2-browser-protocol-fee-sync-v1':'vault-v2-browser-governed-fee-policy-v1',chainId:31373,chainInstance:config.chainInstance.id,pool,beforeBlock:spec.beforeBlock,finalBlock:spec.afterBlock,blocks,proposal,action:isSync?{target:target.target,method:spec.method,calldata:call,actor:tx[0].from}:null,fees:{before:beforeFees,after:afterFees},protectedState:{before,after,unchanged:true},scope:isSync?'Actual explicit browser permissionless original-controller sync after separate Governor global-rate execution; no withdrawal recipient. Historical eth_call only, no collector transaction.':'Actual ordinary browser Governor receipts; historical eth_call state only. No capture transaction, trade, issuance, reward, resolution or impersonation.'};
 fs.writeFileSync(spec.output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output:spec.output,proposalId:String(proposalId),transactions:tx.length,fees:report.fees,protectedUnchanged:true},null,2));
}finally{provider.destroy();}
