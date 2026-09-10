// Read-only receipt journal for explicitly listed, already completed browser actions.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Interface,JsonRpcProvider} from 'ethers';
import {assertLocalConfig} from '../sdk/local-endpoints.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const clean=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const keys=(x,allowed)=>{assert.ok(x&&typeof x==='object'&&!Array.isArray(x));for(const k of Object.keys(x))assert.ok(allowed.includes(k),'Unknown field '+k);};
function evidencePath(x){assert.ok(typeof x==='string'&&/^evidence\/monetary-policy\/[A-Za-z0-9_./-]+\.json$/.test(x)&&!x.split('/').includes('..'),'Use a JSON path under evidence/monetary-policy');return x;}
export function validateSpec(s){
 keys(s,['format','beforeBlock','afterBlock','actions','out','snapshots']);assert.equal(s.format,'vault-v2-monetary-actions-spec-v1');
 for(const k of ['beforeBlock','afterBlock'])assert.ok(Number.isSafeInteger(s[k])&&s[k]>0,'Positive safe block required');
 assert.ok(s.beforeBlock<s.afterBlock);assert.ok(Array.isArray(s.actions)&&s.actions.length>0&&s.actions.length<=100,'1–100 actual action blocks required');
 let prior=s.beforeBlock;for(const a of s.actions){keys(a,['block','label','transactionHash']);assert.ok(Number.isSafeInteger(a.block)&&a.block>prior&&a.block<=s.afterBlock,'Action blocks must be unique, increasing and inside the interval');prior=a.block;
  assert.ok(typeof a.label==='string'&&a.label.trim()&&a.label.length<=180,'Short action annotation required');if(a.transactionHash!==undefined)assert.match(a.transactionHash,/^0x[0-9a-f]{64}$/i);
 }
 evidencePath(s.out);if(s.snapshots){keys(s.snapshots,['before','after']);evidencePath(s.snapshots.before);evidencePath(s.snapshots.after);assert.equal(new Set([s.out,s.snapshots.before,s.snapshots.after].map(p=>path.posix.normalize(p))).size,3,'Journal and snapshot paths must be distinct');}
 return s;
}
export function assertReadRPC(method){assert.ok(new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getTransactionByHash','eth_getTransactionReceipt']).has(method),'Receipt collector refuses non-read RPC: '+method);}
export function decodeABI(interfaces,input,isEvent=false){
 const variants=new Map();for(const [name,iface]of interfaces){try{const parsed=isEvent?iface.parseLog(input):iface.parseTransaction(input);if(!parsed)continue;
   const decoded={name:parsed.name,signature:parsed.signature,args:Object.fromEntries(parsed.fragment.inputs.map((f,i)=>[f.name||String(i),clean(parsed.args[i])]))};
   const key=JSON.stringify(decoded);if(!variants.has(key))variants.set(key,{...decoded,matchedABIs:[]});variants.get(key).matchedABIs.push(name);
  }catch{}}
 return{variants:[...variants.values()],unknown:variants.size===0,ambiguous:variants.size>1};
}
export function validateSnapshot(s,number,blockHash,config){
 assert.equal(s.format,'vault-v2-monetary-historical-snapshot-v1');assert.equal(s.chainId,31373);assert.equal(s.chainInstance,config.chainInstance.id);assert.equal(s.protocolVersion,'2');assert.equal(s.block.number,number);assert.equal(s.block.hash,blockHash);
 for(const k of ['TrueToken','StatementRegistry','Vault','PoolCoordinator','RewardBudget'])assert.ok(same(s.addresses[k],config.addresses[k]),'Snapshot graph differs: '+k);
 assert.equal(s.capture.contractStateBlock,number);return s;
}
async function main(specPath){
 const specBytes=fs.readFileSync(specPath);assert.ok(specBytes.length<=65536,'Spec limit 64KiB');const spec=validateSpec(JSON.parse(specBytes));
 const out=path.resolve(root,spec.out);assert.ok(!fs.existsSync(out),'Refusing to overwrite a historical receipt journal');
 const config=read(path.join(root,'.state/deployment-v2.json')),abis=read(path.join(root,'.state/abis-v2.json'));assertLocalConfig(config);assert.equal(config.protocolVersion,'2');
 const interfaces=Object.entries(abis).map(([name,abi])=>[name,new Interface(abi.filter(f=>['function','event','error'].includes(f.type)))]);
 const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1}),originalSend=provider.send.bind(provider),rpcCounts={};
 provider.send=async(method,args)=>{assertReadRPC(method);rpcCounts[method]=(rpcCounts[method]??0)+1;return originalSend(method,args);};
 try{
  assert.equal((await provider.getNetwork()).chainId,31373n);const before=await provider.getBlock(spec.beforeBlock),after=await provider.getBlock(spec.afterBlock);assert.ok(before&&after,'Both historical endpoints must already exist');
  const actions=[];
  for(const requested of spec.actions){const b=await provider.getBlock(requested.block);assert.ok(b,'Action block missing');assert.ok(b.transactions.length,'Listed action block has no transaction');
   let hashes=b.transactions;if(requested.transactionHash){assert.ok(hashes.some(h=>same(h,requested.transactionHash)),'Specified transaction is absent from block');hashes=hashes.filter(h=>same(h,requested.transactionHash));}
   else assert.equal(hashes.length,1,'Multi-transaction blocks require an exact transactionHash');
   const transactions=[];for(const txHash of hashes){const[t,r]=await Promise.all([provider.getTransaction(txHash),provider.getTransactionReceipt(txHash)]);assert.ok(t&&r);assert.equal(r.blockNumber,b.number);assert.equal(r.blockHash,b.hash);assert.equal(t.blockHash,b.hash);assert.ok([0,1].includes(r.status));
    assert.ok(!same(t.to,config.addresses.Governor)&&!same(t.to,config.addresses.Timelock),'Governor/Timelock transactions belong to the separate program/governance journal');
    transactions.push({hash:txHash,from:t.from,to:t.to,nonce:t.nonce,value:String(t.value),status:r.status,gasUsed:String(r.gasUsed),calldata:t.data,decoded:decodeABI(interfaces,{data:t.data,value:t.value}),
     logs:r.logs.map(l=>({address:l.address,index:l.index,transactionHash:l.transactionHash,topics:l.topics,data:l.data,decoded:decodeABI(interfaces,l,true)}))});
   }
   actions.push({label:requested.label,labelAuthority:'Caller-provided browser annotation, not independently observed by this collector',block:{number:b.number,hash:b.hash,timestamp:b.timestamp},transactions});
  }
  fs.mkdirSync(path.dirname(out),{recursive:true});
  const snapshotPaths=spec.snapshots??{before:spec.out.replace(/\.json$/,'.before.json'),after:spec.out.replace(/\.json$/,'.after.json')};
  const snapshots={};
  for(const[side,number,b]of[['before',spec.beforeBlock,before],['after',spec.afterBlock,after]]){
   const p=path.resolve(root,snapshotPaths[side]),existed=fs.existsSync(p);
   if(!existed)execFileSync(process.execPath,['--max-old-space-size=128',path.join(root,'scripts/capture-monetary-snapshot.mjs'),'--block',String(number),'--out',snapshotPaths[side]],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']});
   const bytes=fs.readFileSync(p),s=validateSnapshot(JSON.parse(bytes),number,b.hash,config);
   snapshots[side]={path:snapshotPaths[side],sha256:hash(bytes),bytes:bytes.length,block:s.block,reusedExisting:existed,collectorSourceSha256:s.capture.sourceSha256};
  }
  for(const b of[before,after,...actions.map(a=>a.block)])assert.equal((await provider.getBlock(b.number)).hash,b.hash,'Historical block changed during capture');
  const all=actions.flatMap(a=>a.transactions),report={format:'vault-v2-monetary-action-receipts-v1',chainId:31373,chainInstance:config.chainInstance.id,protocolVersion:'2',beforeBlock:spec.beforeBlock,afterBlock:spec.afterBlock,
   spec:{path:path.relative(root,path.resolve(specPath)),sha256:hash(specBytes)},abiSha256:hash(fs.readFileSync(path.join(root,'.state/abis-v2.json'))),snapshots,actions,
   observedCounts:{transactions:all.length,status1:all.filter(t=>t.status===1).length,status0:all.filter(t=>t.status===0).length,logs:all.reduce((n,t)=>n+t.logs.length,0)},
   capture:{mode:'Read-only receipt and historical state collection; not browser execution',coverage:'Only listed transaction hashes/blocks. Other activity between endpoints is not excluded.',result:'Observed receipts and snapshot binding checks only; action labels do not assert semantic success.',abiDecoding:'All matching selected deployment ABI interpretations are retained. ABI signature matching alone is not proof of an unpinned emitter identity.',governanceExcluded:true,rpcCounts,sourceSha256:hash(fs.readFileSync(fileURLToPath(import.meta.url)))}};
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({out:spec.out,...report.observedCounts,snapshots,readOnly:true},null,2));
 }finally{provider.destroy();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==4||process.argv[2]!=='--spec')throw Error('Usage: node --max-old-space-size=128 scripts/capture-monetary-actions.mjs --spec evidence/monetary-policy/ACTUAL-actions-spec.json');
 await main(path.resolve(process.argv[3]));
}
