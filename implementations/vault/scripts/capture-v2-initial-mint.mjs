// Historical public RPC reads only. Records the actual browser Governor cycle.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {Contract,Interface,JsonRpcProvider,ZeroAddress,keccak256,toUtf8Bytes,parseEther} from 'ethers';
import {assertLocalConfig} from '../sdk/local-endpoints.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),config=read('.state/deployment-v2.json'),legacy=read('.state/deployment.json'),abis=read('.state/abis-v2.json'),oldABI=read('.state/abis.json');
assertLocalConfig(config);const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
const clean=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
const at=n=>({blockTag:n}),before=277,finish=307,account=config.accounts[0],amount=parseEther('1000');
const description='Vault V2 local test: issue 1000 valueless T to Account 0 for initial market liquidity; no MEMBER issuance and no beneficiary fees spent.';
const contract=(address,abi)=>new Contract(address,abi,provider),token=contract(config.addresses.TrueToken,abis.TrueToken),governor=contract(config.addresses.Governor,abis.VaultGovernor);
const interfaces=Object.values(abis).map(a=>new Interface(a.filter(x=>['function','event','error'].includes(x.type))));
function args(fragment,values){return Object.fromEntries(fragment.inputs.map((f,i)=>[f.name||String(i),clean(values[i])]));}
async function state(block){
 const registry=contract(config.addresses.StatementRegistry,abis.StatementRegistry),budget=contract(config.addresses.RewardBudget,abis.RewardBudget);
 return{supply:String(await token.totalSupply(at(block))),balances:Object.fromEntries(await Promise.all(config.accounts.map(async a=>[a,String(await token.balanceOf(a,at(block)))]))),owner:await token.owner(at(block)),programs:String(await budget.programCount(at(block))),reserved:String(await budget.reserved(at(block))),markets:String(await registry.count(at(block)))};
}
async function protectedState(block){
 const members=contract(legacy.addresses.Membership,oldABI.Membership),reg=contract(legacy.addresses.StatementRegistry,oldABI.StatementRegistry),oldT=contract(legacy.addresses.TrueToken,oldABI.TrueToken),allocation=contract(legacy.addresses.AllocationController,oldABI.AllocationController),coordinator=contract(legacy.addresses.PoolCoordinator,oldABI.PoolCoordinator);
 const vault=contract(legacy.addresses.Vault,[...oldABI.Vault,...oldABI.VaultExtension,...oldABI.VaultAdmin].filter(x=>['function','event','error'].includes(x.type)));
 const membersState={supply:String(await members.totalSupply(at(block))),owner:await members.owner(at(block)),accounts:{}};
 for(const a of legacy.accounts)membersState.accounts[a]={balance:String(await members.balanceOf(a,at(block))),votes:String(await members.getVotes(a,at(block)))};
 const holders=[...legacy.accounts,legacy.addresses.Timelock,legacy.addresses.ConditionalTokens],assets=[legacy.addresses.TrueToken,'0x873b5750e54339F2429C9581959874EDF887280f'];
 const balances={};for(const asset of assets){const t=contract(asset,oldABI.TrueToken);balances[asset]={supply:String(await t.totalSupply(at(block))),holders:{}};for(const who of holders)balances[asset].holders[who]=String(await t.balanceOf(who,at(block)));}
 const count=await reg.count(at(block)),statements=[];
 for(let i=0n;i<count;i++){const statementId=await reg.statementIds(i,at(block)),s=await reg.getStatement(statementId,at(block));statements.push({statementId,outcome:String(s.outcome),stateHash:keccak256(reg.interface.encodeFunctionResult('getStatement',[s]))});}
 const pools=[];for(let i=0n;i<await coordinator.count(at(block));i++){const p=await coordinator.getPool(i,at(block)),bpt=contract(p.pool,['function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)']),data=await vault.getPoolTokenInfo(p.pool,at(block));
  pools.push({pool:p.pool,totalSupply:String(await bpt.totalSupply(at(block))),balanceInfoHash:keccak256(vault.interface.encodeFunctionResult('getPoolTokenInfo',Array.from(data))),wallets:Object.fromEntries(await Promise.all(legacy.accounts.map(async a=>[a,String(await bpt.balanceOf(a,at(block)))])))});
 }
 const epoch=await allocation.epoch(at(block)),share=await allocation.allocation(epoch,at(block));
 return{membership:membersState,oldAssets:balances,statementCount:String(count),statements,pools,allocation:{epoch:String(epoch),split:share.split,recipients:Array.from(share.recipients),weights:Array.from(share.weights,String)}};
}
try{
 assert.equal((await provider.getNetwork()).chainId,31373n);const headBefore=await provider.getBlockNumber(),blocks=[];
 for(let n=281;n<=finish;n++){
  const b=await provider.getBlock(n),transactions=[];
  for(const hash of b.transactions){const [t,r]=await Promise.all([provider.getTransaction(hash),provider.getTransactionReceipt(hash)]);assert.equal(r.status,1);
   const decoded=governor.interface.parseTransaction({data:t.data,value:t.value});assert.ok(decoded,'Expected Governor transaction');assert.equal(t.to.toLowerCase(),config.addresses.Governor.toLowerCase());
   const events=r.logs.map(l=>{let decoded=null;for(const abi of interfaces){try{const e=abi.parseLog(l);if(e){decoded={name:e.name,args:args(e.fragment,e.args)};break;}}catch{}}return{address:l.address,index:l.index,topics:l.topics,data:l.data,decoded};});
   transactions.push({hash,from:t.from,to:t.to,nonce:t.nonce,value:String(t.value),calldata:t.data,status:r.status,gasUsed:String(r.gasUsed),decoded:{method:decoded.name,args:args(decoded.fragment,decoded.args)},events});
  }
  blocks.push({number:n,hash:b.hash,timestamp:b.timestamp,transactions});
 }
 const transactions=blocks.flatMap(b=>b.transactions);assert.equal(transactions.length,5);assert.deepEqual(blocks.filter(b=>b.transactions.length).map(b=>b.number),[281,284,285,296,307]);
 const calldata=token.interface.encodeFunctionData('mint',[account,amount]),dh=keccak256(toUtf8Bytes(description)),proposalId=await governor.hashProposal([token.target],[0],[calldata],dh);
 const proposalEvent=transactions[0].events.find(e=>e.decoded?.name==='ProposalCreated').decoded.args;
 assert.equal(proposalEvent.proposalId,String(proposalId));assert.equal(proposalEvent.description,description);assert.deepEqual(proposalEvent.targets,[token.target]);assert.deepEqual(proposalEvent.calldatas,[calldata]);
 const mint=transactions.at(-1).events.find(e=>e.address.toLowerCase()===token.target.toLowerCase()&&e.decoded?.name==='Transfer').decoded.args;
 assert.equal(mint.from,ZeroAddress);assert.equal(mint.to,account);assert.equal(mint.value,String(amount));
 assert.equal(await governor.state(proposalId,at(finish)),7n);
 const newBefore=await state(before),newAfter=await state(finish),oldBefore=await protectedState(before),oldAfter=await protectedState(finish);
 assert.equal(newBefore.supply,'0');assert.equal(newAfter.supply,String(amount));assert.equal(newAfter.balances[account],String(amount));
 for(const other of config.accounts.slice(1))assert.equal(newAfter.balances[other],'0');
 assert.equal(newAfter.programs,'0');assert.equal(newAfter.markets,'0');assert.equal(newAfter.reserved,'0');assert.deepEqual(oldAfter,oldBefore);
 const snapshot=await governor.proposalSnapshot(proposalId,at(finish)),deadline=await governor.proposalDeadline(proposalId,at(finish)),votes=await governor.proposalVotes(proposalId,at(finish));
 const report={format:'vault-v2-browser-initial-issuance-v1',chainId:31373,chainInstance:config.chainInstance.id,beforeBlock:before,finalBlock:finish,finalBlockHash:blocks.at(-1).hash,blocks,
  proposal:{id:String(proposalId),description,target:token.target,calldata,recipient:account,rawAmount:String(amount),displayAmount:'1000 T (V2)',snapshot:String(snapshot),deadline:String(deadline),quorum:String(await governor.quorum(snapshot,at(finish))),votes:clean(votes),state:'Executed'},
  newToken:{before:newBefore,after:newAfter},protectedLegacy:{before:oldBefore,after:oldAfter,comparisonPassed:true},membershipUnchanged:true,
  capture:{mode:'read-only historical RPC; no signer',headBefore,headAfter:await provider.getBlockNumber()},scope:'Actual root browser proposal/votes/queue/execute. Only V2 initial issuance fulfilled; no program, market, treasury-fee spend or MEMBER issuance.'};
 fs.writeFileSync('evidence/monetary-policy/initial-mint-281-307.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({proposalId:String(proposalId),transactions:transactions.length,executedBlock:finish,tx:transactions.at(-1).hash,supply:newAfter.supply,recipientBalance:newAfter.balances[account],membershipUnchanged:true,legacyUnchanged:true,programs:newAfter.programs,markets:newAfter.markets},null,2));
}finally{provider.destroy();}
