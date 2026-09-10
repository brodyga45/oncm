// Read-only public deployment evidence. No signer, transactions or source uploads.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {JsonRpcProvider,Contract,keccak256,Interface} from 'ethers';
import {assertLocalConfig} from '../sdk/local-endpoints.mjs';
import {sha256} from './monetary-bootstrap.mjs';
const config=JSON.parse(fs.readFileSync('.state/deployment-v2.json')),execution=JSON.parse(fs.readFileSync('.state/deployment-v2-txs.json'));
assertLocalConfig(config);assert.equal(config.protocolVersion,'2');assert.equal(execution.status,'deployed');
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1}),abis=JSON.parse(fs.readFileSync('.state/abis-v2.json'));
const interfaces=Object.values(abis).map(a=>new Interface(a.filter(x=>['event','function','error'].includes(x.type))));
const destination='evidence/monetary-policy';fs.mkdirSync(destination,{recursive:true});
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n';
try{
 assert.equal((await provider.getNetwork()).chainId,31373n);const receipts=[];
 for(const record of execution.receipts){
  const [receipt,transaction,block]=await Promise.all([provider.getTransactionReceipt(record.hash),provider.getTransaction(record.hash),provider.getBlock(record.blockNumber)]);
  assert.equal(receipt.status,1);assert.equal(receipt.blockHash,record.blockHash);assert.equal(block.hash,record.blockHash);
  const events=receipt.logs.map(log=>{let decoded=null;for(const abi of interfaces){try{const p=abi.parseLog(log);if(p){decoded={name:p.name,args:Array.from(p.args,(_,i)=>p.args[i])};break;}}catch{}}
   return{address:log.address,logIndex:log.index,topics:log.topics,data:log.data,decoded};});
  receipts.push({...record,timestamp:block.timestamp,from:transaction.from,to:transaction.to,nonce:transaction.nonce,value:String(transaction.value),gasUsed:String(receipt.gasUsed),calldataSha256:sha256(Buffer.from(transaction.data.slice(2),'hex')),events});
 }
 const block=execution.receipts.at(-1).blockNumber,at={blockTag:block},token=new Contract(config.addresses.TrueToken,abis.TrueToken,provider),rewards=new Contract(config.addresses.RewardBudget,abis.RewardBudget,provider),registry=new Contract(config.addresses.StatementRegistry,abis.StatementRegistry,provider);
 const codeChecks=[];for(const[address,expected]of Object.entries(config.monetaryPolicy.runtimeHashes)){const actual=keccak256(await provider.getCode(address,block));assert.equal(actual,expected);codeChecks.push({address,runtimeHash:actual});}
 const pending=[];for(const action of config.pendingGovernanceActions){const decoded=registry.interface.parseTransaction({data:action.calldata});pending.push({...action,decoded:{function:decoded.name,args:Array.from(decoded.args)}});if(action.profileId)assert.equal((await registry.profiles(action.profileId,at)).enabled,false);}
 const report={format:'vault-additive-v2-deployment-evidence-v1',chainId:31373,chainInstance:config.chainInstance.id,firstBlock:receipts[0].blockNumber,lastBlock:block,addresses:config.addresses,
  initialAllocation:config.monetaryPolicy.initialAllocation,atFinalBlock:{supply:String(await token.totalSupply(at)),tokenOwner:await token.owner(at),programCount:String(await rewards.programCount(at)),reserved:String(await rewards.reserved(at)),statementCount:String(await registry.count(at)),registryOwner:await registry.owner(at)},
  receipts,codeChecks,legacy:{before:execution.before,after:execution.after,comparisonPassed:JSON.stringify(execution.before)===JSON.stringify(execution.after)},pendingGovernanceActions:pending,
  scope:'17 additive local deployment transactions only. No token issuance, profile/operator admission, reward program, market, payment, source publication or prover. Historical legacy evidence remains unchanged.'};
 assert.equal(report.atFinalBlock.supply,'0');assert.equal(report.atFinalBlock.programCount,'0');assert.equal(report.atFinalBlock.statementCount,'0');assert.equal(report.legacy.comparisonPassed,true);
 fs.writeFileSync(destination+'/deployment-261-277.json',json(report));
 fs.copyFileSync('.state/deployment-v2-resources.json',destination+'/deployment-resources.json');
 fs.writeFileSync(destination+'/pending-governance-calls.json',json({chainId:31373,registry:config.addresses.StatementRegistry,governor:config.addresses.Governor,timelock:config.addresses.Timelock,actions:pending,submitted:false}));
 console.log(json({receipts:receipts.length,first:report.firstBlock,last:report.lastBlock,runtimeChecks:codeChecks.length,legacyPreserved:true,atFinalBlock:report.atFinalBlock,pendingActions:pending.length}));
}finally{provider.destroy();}
