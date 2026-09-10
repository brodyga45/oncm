// Read-only capture of coordinator browser transactions170–188. No signer/prover.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {Contract,Interface,JsonRpcProvider} from 'ethers';import {createSDK} from '../sdk/index.mjs';
import {argumentsObject} from './capture-manual-evidence.mjs';
import {readDerivedReadiness} from '../sdk/derived-readiness.mjs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root))),config=read('.state/deployment.json'),abis=read('.state/abis.json');
if(config.chainId!==31373||config.rpcUrl!=='http://127.0.0.1:9547')throw Error('Existing localVault only');
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1}),sdk=createSDK(config,abis,provider),ercAbi=['function balanceOf(address) view returns(uint256)','function totalSupply() view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)'],erc=new Interface(ercAbi);
const clean=v=>JSON.parse(JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x));
try{
 if((await provider.getNetwork()).chainId!==31373n||(await provider.getBlock('latest')).number<188)throw Error('Expected chain/final188');
 async function created(n){const b=await provider.getBlock(n);for(const hash of b.transactions){const r=await provider.getTransactionReceipt(hash);for(const l of r.logs){if(l.address.toLowerCase()!==config.addresses.StatementRegistry.toLowerCase())continue;try{const e=sdk.registry.interface.parseLog(l);if(e.name==='StatementCreated')return e.args.statementId;}catch{}}}throw Error('Missing StatementCreated at'+n);}
 const parentId=await created(170),childId=await created(171),parent=await sdk.registry.getStatement(parentId,{blockTag:188}),child=await sdk.registry.getStatement(childId,{blockTag:188});
 assert.equal(child.dependency,parentId);assert.equal(Number(parent.kind),2);assert.equal(Number(parent.expected),1);assert.equal(Number(child.kind),2);assert.equal(Number(child.expected),2);assert.equal(Number(parent.outcome),2);assert.equal(Number(child.outcome),1);
 const n=Number(await sdk.coordinator.count({blockTag:188}));let pool;for(let i=0;i<n;i++){const p=await sdk.coordinator.getPool(i,{blockTag:188});if(p.statementId===childId)pool=p;}assert.ok(pool);assert.equal(Number(pool.side),0);
 const tokens={T:config.addresses.TrueToken,YES:child.yes,NO:child.no,BPT:pool.pool},accounts=config.accounts.slice(0,2),interfaces=Object.fromEntries(Object.entries(abis).map(([n,a])=>[n,new Interface(a)]));
 const known=new Map(Object.entries({...config.addresses,ChildYES:child.yes,ChildNO:child.no,ChildPool:pool.pool}).map(([n,a])=>[a.toLowerCase(),n]));
 const resolveIface=name=>interfaces[name]||(name==='ChildPool'?interfaces.WeightedPool:erc);
 const blocks=[];for(let number=170;number<=188;number++){
  const b=await provider.getBlock(number),transactions=[];for(const hash of b.transactions){const tx=await provider.getTransaction(hash),r=await provider.getTransactionReceipt(hash);assert.equal(r.status,1);let decoded=null;const name=tx.to&&known.get(tx.to.toLowerCase());try{const e=resolveIface(name).parseTransaction({data:tx.data,value:tx.value});if(e)decoded={contract:name,method:e.name,args:argumentsObject(e.fragment,e.args)};}catch{}
   const logs=r.logs.map(l=>{let decoded=null;const name=known.get(l.address.toLowerCase());for(const iface of [resolveIface(name),erc]){try{const e=iface.parseLog(l);if(e){decoded={contract:name,event:e.name,args:argumentsObject(e.fragment,e.args)};break;}}catch{}}return{address:l.address,index:l.index,topics:l.topics,data:l.data,decoded};});
   transactions.push({hash,from:tx.from,to:tx.to,data:tx.data,value:tx.value,nonce:tx.nonce,status:r.status,blockNumber:number,blockHash:r.blockHash,gasUsed:r.gasUsed,gasPrice:r.gasPrice,decoded,logs});
  }blocks.push({number,hash:b.hash,timestamp:b.timestamp,transactions});
 }
 const states=[];for(const number of [171,173,174,177,179,181,182,183,185,188]){
  const at={blockTag:number},balances={};for(const[name,address]of Object.entries(tokens)){
   if(await provider.getCode(address,number)==='0x'){balances[name]={address,deployed:false};continue;}
   const c=new Contract(address,ercAbi,provider),[totalSupply,...b]=await Promise.all([c.totalSupply(at),...accounts.map(a=>c.balanceOf(a,at))]);
   balances[name]={address,deployed:true,totalSupply,balances:Object.fromEntries(accounts.map((a,i)=>[a,b[i]]))};
  }
  const p=await sdk.registry.getStatement(parentId,at),c=await sdk.registry.getStatement(childId,at),v=await sdk.vault.getPoolTokenInfo(pool.pool,at).catch(()=>null);
  states.push({blockNumber:number,parentOutcome:Number(p.outcome),childOutcome:Number(c.outcome),tokens:balances,pool:v?{tokens:[...v[0]],rawBalances:[...v[2]]}:null});
 }
 const ctf=new Contract(config.addresses.ConditionalTokens,abis.ConditionalTokens,provider),payouts={};for(const[name,s]of Object.entries({parent,child}))payouts[name]={conditionId:s.conditionId,numerators:[await ctf.payoutNumerators(s.conditionId,0,{blockTag:188}),await ctf.payoutNumerators(s.conditionId,1,{blockTag:188})],denominator:await ctf.payoutDenominator(s.conditionId,{blockTag:188})};
 assert.deepEqual(payouts.parent.numerators,[0n,1n]);assert.deepEqual(payouts.child.numerators,[1n,0n]);
 const balanceDeltas={};for(const[number,previous]of [[179,177],[181,179],[185,183],[188,185]]){
  const before=states.find(s=>s.blockNumber===previous),after=states.find(s=>s.blockNumber===number);balanceDeltas[number]=Object.fromEntries(accounts.map(a=>[a,Object.fromEntries(Object.keys(tokens).map(t=>[t,after.tokens[t].balances[a]-before.tokens[t].balances[a]]))]));
 }
 const final=states.at(-1);for(const a of accounts)for(const t of ['YES','NO','BPT'])assert.equal(final.tokens[t].balances[a],0n);
 const pending=await readDerivedReadiness({provider:{getNetwork:()=>provider.getNetwork(),getBlock:()=>provider.getBlock(171)},registry:sdk.registry},childId);assert.equal(pending.status,'pending');
 const expectedAdd=1000000000000020003n;assert.equal(balanceDeltas[179][accounts[0]].T,-expectedAdd);assert.equal(balanceDeltas[179][accounts[0]].YES,-expectedAdd);assert.equal(balanceDeltas[179][accounts[0]].BPT,1000000000000000000n);assert.equal(balanceDeltas[181][accounts[0]].BPT,-1000000000000000000n);
 const report={scope:'read-only capture of root browser loop170–188; no transactions, proving or reset',chainId:31373,chainInstance:config.chainInstance.id,parentId,childId,parentDependency:parent.dependency,pool:clean(pool),tokens,accounts,blocks,states,payouts,balanceDeltas,pendingAt171:pending,
  reportedBrowserScenario:{blockNumber:177,account:accounts[0],T:'5',YES:'5',True:'10',False:'5',ownershipSwitchPassed:true,note:'Coordinator browser observation: switching to Bob cleared prior result immediately; explicit new read showed0/0 for Bob; switching back cleared again.'},finalBlock:188,finalBlockHash:blocks.at(-1).hash};
 fs.mkdirSync(new URL('evidence/derivative-lp-cycle/',root),{recursive:true});fs.writeFileSync(new URL('evidence/derivative-lp-cycle/browser-rpc.json',root),JSON.stringify(clean(report),null,2));console.log(JSON.stringify(clean({parentId,childId,pool:pool.pool,payouts,balanceDeltas,finalBlockHash:report.finalBlockHash})));
}finally{provider.destroy();}
