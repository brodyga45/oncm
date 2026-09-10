// Historical RPC reads only. No signer, transaction submission, mining or proof execution.
// Usage from this application directory: node scripts/capture-derived-manual.mjs FIRST THROUGH
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Contract, Interface, ZeroAddress} from 'ethers';
import {createLocalProvider} from '../sdk/local-provider.mjs';

const first=Number(process.argv[2]),through=Number(process.argv[3]);
assert(Number.isInteger(first)&&first>0&&Number.isInteger(through)&&through>=first&&through-first<100,'Provide an explicit historical interval of at most100 blocks.');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const deployment=read('data/deployment.json'),abis=read('web/generated/abis.json');
const provider=createLocalProvider('http://127.0.0.1:9546');
try {
 assert.equal(Number((await provider.getNetwork()).chainId),31372);
 const registry=new Contract(deployment.contracts.protocol,abis.ExchangeProtocol,provider);
 const ctf=new Contract(deployment.contracts.ctf,abis.ConditionalTokens,provider);
 const token=new Contract(deployment.contracts.token,abis.TrueToken,provider);
 const parsers=Object.entries(abis).map(([name,abi])=>[name,new Interface(abi)]);
 const registryInterface=new Interface(abis.ExchangeProtocol);
 const named=p=>Object.fromEntries(p.fragment.inputs.map((x,i)=>[x.name||String(i),p.args[i]]));
 function decodeLog(log){for(const [abi,iface]of parsers){try{const p=iface.parseLog(log);if(p)return{address:log.address,logIndex:Number(BigInt(log.logIndex)),abi,event:p.name,args:named(p)};}catch{}}return null;}
 function decodeCall(tx){for(const [abi,iface]of parsers){try{const p=iface.parseTransaction({data:tx.input,value:tx.value});if(p)return{abi,name:p.name,args:named(p)};}catch{}}return null;}
 const blocks=[],createdIds=new Set(),touchedIds=new Set(),actors=new Set();
 for(let number=first;number<=through;number++){
  const block=await provider.send('eth_getBlockByNumber',['0x'+number.toString(16),true]);assert(block,`Block${number} unavailable.`);
  const transactions=[];
  for(const transaction of block.transactions){
   const receipt=await provider.send('eth_getTransactionReceipt',[transaction.hash]);assert(receipt,`Receipt${transaction.hash} unavailable.`);
   const decodedEvents=receipt.logs.map(decodeLog).filter(Boolean);
   for(const log of receipt.logs){if(log.address.toLowerCase()!==deployment.contracts.protocol.toLowerCase())continue;try{const p=registryInterface.parseLog(log);if(p?.name==='StatementCreated'){createdIds.add(p.args.id);touchedIds.add(p.args.id);}if(p?.name==='Resolved')touchedIds.add(p.args.id);}catch{}}
   actors.add(transaction.from);
   transactions.push({transaction,receipt,call:decodeCall(transaction),decodedEvents});
  }
  blocks.push({block:{number,hash:block.hash,parentHash:block.parentHash,timestamp:Number(BigInt(block.timestamp))},transactions});
 }
 // Include the exact dependency chain, including statements created before this interval.
 const tracked=new Set(touchedIds),pending=[...tracked];
 for(let i=0;i<pending.length;i++){
  assert(pending.length<=128,'Unexpected dependency graph size.');
  const s=await registry.statements(pending[i],{blockTag:through});
  if(s.dependency!=='0x'+'0'.repeat(64)&&!tracked.has(s.dependency)){tracked.add(s.dependency);pending.push(s.dependency);}
 }
 const fields=['goal','profile','dependency','deadline','resolvedAt','kind','targetOutcome','outcome','market','creator','metadata'];
 async function snapshot(number){
  const block=await provider.send('eth_getBlockByNumber',['0x'+number.toString(16),false]);assert(block,`Snapshot block${number} unavailable.`);
  const statements={};
  for(const id of tracked){
   const s=await registry.statements(id,{blockTag:number});
   if(s.market===ZeroAddress){statements[id]={exists:false};continue;}
   const record={exists:true,...Object.fromEntries(fields.map(k=>[k,s[k]]))};
   const market=new Contract(s.market,abis.Market,provider),conditionId=await market.conditionId({blockTag:number});
   record.ctf={conditionId,payoutDenominator:await ctf.payoutDenominator(conditionId,{blockTag:number}),payoutNumerators:[]};
   for(const outcome of [0,1])record.ctf.payoutNumerators.push(await ctf.payoutNumerators(conditionId,outcome,{blockTag:number}));
   if(s.kind!==0n){try{record.evaluatedOutcome=await registry.derivedOutcome(id,{blockTag:number});}catch(error){record.evaluationError=String(error.shortMessage||error.message).slice(0,1024);}}
   statements[id]=record;
  }
  const balances={};for(const actor of actors)balances[actor]={T:await token.balanceOf(actor,{blockTag:number}),native:BigInt(await provider.send('eth_getBalance',[actor,'0x'+number.toString(16)]))};
  return{block:{number,hash:block.hash,timestamp:Number(BigInt(block.timestamp))},statements,balances,ctfCollateral:await token.balanceOf(deployment.contracts.ctf,{blockTag:number})};
 }
 const snapshots=[await snapshot(first-1)];for(const b of blocks)snapshots.push(await snapshot(b.block.number));
 const evidence={format:'oncm-exchange-derived-browser-evidence-v1',chainId:31372,registry:deployment.contracts.protocol,firstBlock:first,throughBlock:through,createdIds:[...createdIds],trackedIds:[...tracked],actors:[...actors],blocks,snapshots,scope:'Historical RPC capture of coordinator browser actions. All transactions and raw receipts in the requested interval are included. Snapshots use explicit block tags. evaluatedOutcome is the contract view at that block; stored outcome and original CTF payouts are recorded separately. No browser pass, rejected preflight call or additional action is inferred from missing receipts.'};
 const directory='docs/evidence/derived';fs.mkdirSync(directory,{recursive:true});const file=`${directory}/through-${first}-${through}.json`;
 fs.writeFileSync(file,JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({file,createdIds:[...createdIds],trackedIds:[...tracked],blocks:blocks.map(b=>[b.block.number,b.transactions.map(t=>t.call?.name)]),lastSnapshot:snapshots.at(-1)},(_,v)=>typeof v==='bigint'?String(v):v));
}finally{await provider.destroy();}
