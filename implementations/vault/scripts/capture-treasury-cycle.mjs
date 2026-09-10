// Read-only historical evidence. No signer or write RPC is constructed.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {Contract,Interface,JsonRpcProvider,keccak256,toUtf8Bytes} from 'ethers';
import {createSDK} from '../sdk/index.mjs';import {argumentsObject} from './capture-manual-evidence.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),config=read('.state/deployment.json'),abis=read('.state/abis.json');
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1}),sdk=createSDK(config,abis,provider);
const clean=v=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x)),at=n=>({blockTag:n});
const start=193,finish=231,DAO=config.addresses.Timelock,T=config.addresses.TrueToken,NO='0x873b5750e54339F2429C9581959874EDF887280f';
const tokenAbi=['function balanceOf(address) view returns(uint256)','function totalSupply() view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)'];
const token=t=>new Contract(t,tokenAbi,provider),warehouse=sdk.c('SplitsWarehouse'),governor=sdk.c('Governor','VaultGovernor');
try{
 assert.equal((await provider.getNetwork()).chainId,31373n);const initial=await provider.getBlock('latest');assert.equal(initial.number,finish);
 const interfaces=Object.entries(abis).map(([name,a])=>({name,iface:new Interface(a)}));
 const decodeLog=l=>{for(const{iface}of interfaces){try{const e=iface.parseLog(l);if(e)return{event:e.name,args:argumentsObject(e.fragment,e.args)};}catch{}}return null;};
 const blocks=[];
 for(let n=start+1;n<=finish;n++){
  const b=await provider.getBlock(n),transactions=[];
  for(const hash of b.transactions){const tx=await provider.getTransaction(hash),r=await provider.getTransactionReceipt(hash);assert.equal(r.status,1);
   let decoded=null;const key=Object.keys(config.addresses).find(k=>config.addresses[k].toLowerCase()===tx.to?.toLowerCase()),alias={Governor:'VaultGovernor',Timelock:'TimelockController'};
   if(key&&abis[alias[key]||key]){const p=new Interface(abis[alias[key]||key]).parseTransaction({data:tx.data,value:tx.value});if(p)decoded={contract:key,method:p.name,args:argumentsObject(p.fragment,p.args)};}
   transactions.push({hash,from:tx.from,to:tx.to,value:tx.value,nonce:tx.nonce,data:tx.data,decoded,status:r.status,gasUsed:r.gasUsed,gasPrice:r.gasPrice,logs:r.logs.map(l=>({address:l.address,index:l.index,topics:l.topics,data:l.data,decoded:decodeLog(l)}))});
  }
  blocks.push({number:n,hash:b.hash,timestamp:b.timestamp,transactions});
 }
 const snapshots={};
 for(const n of [193,194,195,196,197,198,199,200,201,202,203,204,207,208,218,219,229,230,231]){
  const epoch=await sdk.allocation.epoch(at(n)),allocation=await sdk.allocation.allocation(epoch,at(n));
  const assets={};for(const[label,t]of Object.entries({T,NO})){
   assets[label]={token:t,balances:{},warehouseCredits:{}};
   for(const[a,who]of Object.entries({Alice:config.accounts[0],Bob:config.accounts[1],Account3:config.accounts[3],DAO})){
    assets[label].balances[a]=await token(t).balanceOf(who,at(n));assets[label].warehouseCredits[a]=await warehouse.balanceOf(who,BigInt(t),at(n));
   }
  }
  snapshots[n]={epoch,allocation:{split:allocation.split,recipients:[...allocation.recipients],weights:[...allocation.weights]},assets,
   daoConsentProposal3:n>=203?await sdk.allocation.consent(3,DAO,at(n)):null};
 }
 const protectedState={};
 for(const n of[start,finish]){
  const count=Number(await sdk.registry.count(at(n))),statements=[];
  for(let i=0;i<count;i++){const id=await sdk.registry.statementIds(i,at(n)),s=await sdk.registry.getStatement(id,at(n));statements.push({id,fields:argumentsObject({inputs:[{name:'statement'}]},[s.toObject()])});}
  const pools=[];for(let i=0;i<Number(await sdk.coordinator.count(at(n)));i++){
   const p=await sdk.coordinator.getPool(i,at(n)),info=await sdk.vault.getPoolTokenInfo(p.pool,at(n));
   pools.push({pool:p.pool,statementId:p.statementId,tokens:[...info[0]],rawBalances:[...info[2]],BPTsupply:await token(p.pool).totalSupply(at(n))});
  }
  protectedState[n]={statements,pools,TtotalSupply:await token(T).totalSupply(at(n)),Tcollateral:await token(T).balanceOf(config.addresses.ConditionalTokens,at(n))};
 }
 assert.deepEqual(protectedState[start],protectedState[finish]);
 const p1=await sdk.allocation.proposal(1,at(finish)),p2=await sdk.allocation.proposal(2,at(finish)),p3=await sdk.allocation.proposal(3,at(finish));
 assert.equal(p1.applied,false);assert.equal(p1.baseEpoch,2n);assert.equal(p2.applied,true);assert.equal(p3.applied,true);
 assert.equal(snapshots[197].epoch,3n);assert.equal(snapshots[231].epoch,4n);
 assert.deepEqual([...snapshots[231].allocation.weights],[4000n,1500n,4500n]);
 assert.equal(snapshots[200].assets.T.warehouseCredits.DAO,799999999999999n);assert.equal(snapshots[200].assets.NO.warehouseCredits.DAO,199999999999999n);
 assert.equal(snapshots[202].assets.T.balances.DAO,799999999999999n);assert.equal(snapshots[202].assets.NO.balances.DAO,199999999999999n);
 assert.equal(snapshots[202].assets.T.warehouseCredits.DAO,0n);assert.equal(snapshots[202].assets.NO.warehouseCredits.DAO,0n);
 assert.equal(snapshots[229].daoConsentProposal3,false);assert.equal(snapshots[230].daoConsentProposal3,true);
 assert.equal(snapshots[231].assets.NO.balances.Account3,snapshots[193].assets.NO.balances.Account3);
 const proposalEvent=blocks.flatMap(b=>b.transactions.flatMap(t=>t.logs)).find(l=>l.decoded?.event==='ProposalCreated');
 const id=proposalEvent.decoded.args.proposalId,gp=await sdk.governanceSnapshot(config.accounts[0]),actual=gp.proposals.find(p=>p.id===String(id));assert.equal(actual.stateName,'Executed');
 assert.equal(actual.calls[0].target.toLowerCase(),config.addresses.AllocationController.toLowerCase());
 assert.equal(actual.calldatas[0],sdk.allocation.interface.encodeFunctionData('setConsent',[3,true]));
 const consentEvent=blocks.find(b=>b.number===230).transactions.flatMap(t=>t.logs).find(l=>l.decoded?.event==='ConsentChanged');assert.equal(consentEvent.decoded.args.beneficiary.toLowerCase(),DAO.toLowerCase());
 const noPaymentProposal=gp.proposals.every(p=>!p.calls.some(c=>c.target.toLowerCase()===NO.toLowerCase()&&c.data.startsWith('0xa9059cbb')));assert.equal(noPaymentProposal,true);
 const end=await provider.getBlock('latest');assert.equal(end.hash,initial.hash);
 const report={scope:'Actual normal browser DAO allocation, income and membership-consent cycle; final payment proposal rejected before execution by automatic review; historical RPC only',chainId:31373,chainInstance:config.chainInstance.id,startBlock:start,finalBlock:finish,finalBlockHash:end.hash,
 treasury:DAO,tokens:{T,NO},blocks,snapshots,protectedState,protectedMarketsUnchanged:true,
 finalProposals:{oldMath:{baseEpoch:p1.baseEpoch,applied:p1.applied,stale:p1.baseEpoch!==4n},dao20:clean(p2.toObject()),dao15:clean(p3.toObject())},governedConsent:actual,
 declinedPayment:{submitted:false,proposalAbsent:noPaymentProposal,recipient:config.accounts[3],token:NO,amount:'50000000000000',formatted:'0.00005 NO',reason:'Automatic approval review: specific NO-token payment to Account3 was not explicitly authorized by user. No retry/workaround.'},headUnchangedDuringCapture:true};
 fs.writeFileSync('evidence/treasury/dao-cycle-rpc.json',JSON.stringify(clean(report),null,2)+'\n');
 console.log(JSON.stringify(clean({start,finish,transactions:blocks.flatMap(b=>b.transactions).length,epoch:snapshots[finish].epoch,governedConsentProposal:id,treasuryBalances:snapshots[finish].assets,protectedMarketsUnchanged:true,noPaymentProposal}),null,2));
}finally{provider.destroy();}
