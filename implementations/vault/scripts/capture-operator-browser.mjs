// Read-only evidence for the actual ordinary-browser operator admission260.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {Contract,Interface,JsonRpcProvider,AbiCoder,keccak256,ZeroAddress} from 'ethers';
import {createSDK} from '../sdk/index.mjs';import {argumentsObject} from './capture-manual-evidence.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),config=read('.state/deployment.json'),abis=read('.state/abis.json'),before=read('evidence/operator-browser/before-231.json');
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1}),sdk=createSDK(config,abis,provider),at=n=>({blockTag:n});
const clean=v=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x));
const tokenAbi=['function balanceOf(address) view returns(uint256)','function totalSupply() view returns(uint256)'],token=t=>new Contract(t,tokenAbi,provider);
const start=231,finish=260,interfaces=Object.values(abis).map(a=>new Interface(a));
try{
 assert.equal((await provider.getNetwork()).chainId,31373n);const first=await provider.getBlock('latest');assert.equal(first.number,finish);
 const blocks=[];
 for(let n=start+1;n<=finish;n++){
  const b=await provider.getBlock(n),transactions=[];
  for(const hash of b.transactions){const tx=await provider.getTransaction(hash),r=await provider.getTransactionReceipt(hash);assert.equal(r.status,1);
   const key=Object.keys(config.addresses).find(k=>config.addresses[k].toLowerCase()===tx.to?.toLowerCase()),alias={Governor:'VaultGovernor',Timelock:'TimelockController'};let decoded=null;
   if(key&&abis[alias[key]||key]){const p=new Interface(abis[alias[key]||key]).parseTransaction({data:tx.data,value:tx.value});if(p)decoded={contract:key,method:p.name,args:argumentsObject(p.fragment,p.args)};}
   transactions.push({hash,from:tx.from,to:tx.to,data:tx.data,value:tx.value,nonce:tx.nonce,status:r.status,gasUsed:r.gasUsed,gasPrice:r.gasPrice,decoded,logs:r.logs.map(l=>{let decoded=null;for(const i of interfaces){try{const e=i.parseLog(l);if(e){decoded={event:e.name,args:argumentsObject(e.fragment,e.args)};break;}}catch{}}return{address:l.address,index:l.index,topics:l.topics,data:l.data,decoded};})});
  }
  blocks.push({number:n,hash:b.hash,timestamp:b.timestamp,transactions});
 }
 const op=before.operator,id=before.operationId,implementation=new Contract(op.implementation,abis.ResolvedWithinWindowOperator,provider);
 const mappingBefore=(await sdk.registry.operators(op.id,at(start))).toObject(),mappingAfter=(await sdk.registry.operators(op.id,at(finish))).toObject();
 assert.equal(mappingBefore.implementation,ZeroAddress);assert.equal(mappingBefore.enabled,false);assert.equal(mappingAfter.implementation,op.implementation);assert.equal(mappingAfter.specification,op.specification);assert.equal(mappingAfter.enabled,true);
 const runtimeBefore=keccak256(await provider.getCode(op.implementation,start)),runtimeAfter=keccak256(await provider.getCode(op.implementation,finish));assert.equal(runtimeBefore,before.runtimeHash);assert.equal(runtimeAfter,runtimeBefore);
 const operands=await sdk.registry.operationParams(id,at(finish));assert.equal(operands,before.params);assert.equal(await sdk.registry.statementOperator(id,at(finish)),op.id);
 const decodedOperands=AbiCoder.defaultAbiCoder().decode(['bytes32','uint64','uint64','uint8'],operands);
 assert.deepEqual([...decodedOperands],[before.base,1577836800n,1893456000n,1n]);
 assert.equal(await implementation.validate(config.addresses.StatementRegistry,operands,at(finish)),true);assert.equal(await implementation.evaluate(config.addresses.StatementRegistry,operands,at(finish)),1n);
 const states={};for(const n of[231,258,259,260])states[n]=(await sdk.registry.getStatement(id,at(n))).toObject();
 assert.equal(states[258].author,ZeroAddress);assert.equal(states[259].kind,4n);assert.equal(states[259].outcome,0n);assert.equal(states[260].outcome,1n);assert.equal(states[260].author,config.accounts[1]);
 const ctf=new Contract(config.addresses.ConditionalTokens,abis.ConditionalTokens,provider),payouts={};
 for(const n of[259,260])payouts[n]={denominator:await ctf.payoutDenominator(states[260].conditionId,at(n)),numerators:[await ctf.payoutNumerators(states[260].conditionId,0,at(n)),await ctf.payoutNumerators(states[260].conditionId,1,at(n))]};
 assert.equal(payouts[259].denominator,0n);assert.equal(payouts[260].denominator,1n);assert.deepEqual(payouts[260].numerators,[1n,0n]);
 const newPositions={};for(const side of['yes','no']){const t=token(states[260][side]);newPositions[side]={address:states[260][side],totalSupply:await t.totalSupply(at(finish)),balances:await Promise.all(config.accounts.map(async a=>({account:a,balance:await t.balanceOf(a,at(finish))})))};assert.equal(newPositions[side].totalSupply,0n);}
 const protectedState={};
 for(const n of[start,finish]){
  const oldStatements=[];for(let i=0;i<8;i++){const id=await sdk.registry.statementIds(i,at(n));oldStatements.push({id,statement:(await sdk.registry.getStatement(id,at(n))).toObject()});}
  const pools=[];for(let i=0;i<Number(await sdk.coordinator.count(at(n)));i++){const p=await sdk.coordinator.getPool(i,at(n)),info=await sdk.vault.getPoolTokenInfo(p.pool,at(n));pools.push({pool:p.pool,statementId:p.statementId,tokens:[...info[0]],rawBalances:[...info[2]],BPTsupply:await token(p.pool).totalSupply(at(n))});}
  const balances={};for(const[label,t]of Object.entries({T:config.addresses.TrueToken,NO:'0x873b5750e54339F2429C9581959874EDF887280f'})){balances[label]={token:t,totalSupply:await token(t).totalSupply(at(n)),wallets:{}};for(const a of[...config.accounts,config.addresses.Timelock,config.addresses.ConditionalTokens])balances[label].wallets[a]=await token(t).balanceOf(a,at(n));}
  protectedState[n]={oldStatements,pools,balances,allocationEpoch:await sdk.allocation.epoch(at(n))};
 }
 assert.deepEqual(protectedState[start],protectedState[finish]);assert.equal(await sdk.registry.count(at(start)),8n);assert.equal(await sdk.registry.count(at(finish)),9n);
 const event=blocks.flatMap(b=>b.transactions.flatMap(t=>t.logs)).find(l=>l.decoded?.event==='ProposalCreated'),proposalId=String(event.decoded.args.proposalId),g=await sdk.governanceSnapshot(config.accounts[1]),proposal=g.proposals.find(p=>p.id===proposalId);assert.equal(proposal.stateName,'Executed');assert.equal(proposal.calldatas[0],before.governanceCall);
 const admission=blocks.find(b=>b.number===258).transactions.flatMap(t=>t.logs).find(l=>l.decoded?.event==='OperatorRegistered');assert.equal(admission.decoded.args.operatorId,op.id);assert.equal(admission.decoded.args.enabled,true);
 const end=await provider.getBlock('latest');assert.equal(end.hash,first.hash);
 const report={scope:'Actual independent browser tab102825394; normal membership Governor/Timelock, existing operator, new zero-funded condition; no proof/deploy/blocked-operation retry',chainId:31373,chainInstance:config.chainInstance.id,startBlock:start,finalBlock:finish,finalBlockHash:end.hash,blocks,proposal,
 operator:op,mappingBefore,mappingAfter,runtimeBefore,runtimeAfter,decodedOperands:{dependency:decodedOperands[0],start:String(decodedOperands[1]),end:String(decodedOperands[2]),expected:String(decodedOperands[3]),startUTC:'2020-01-01T00:00:00.000Z',endUTC:'2030-01-01T00:00:00.000Z',bounds:'inclusive'},operands,operationId:id,states,payouts,newPositions,protectedState,existingMarketsAndTreasuryUnchanged:true,newPoolCreated:false,headUnchangedDuringCapture:true};
 fs.writeFileSync('evidence/operator-browser/receipts-state.json',JSON.stringify(clean(report),null,2)+'\n');
 console.log(JSON.stringify(clean({finalBlock:finish,transactions:blocks.flatMap(b=>b.transactions).length,proposalId,operationId:id,outcome:states[260].outcome,payouts:payouts[260],existingMarketsAndTreasuryUnchanged:true}),null,2));
}finally{provider.destroy();}
