// Public JSON-RPC transport. No signer, unlocked-account method, or node admin API.
import {HDNodeWallet, Transaction, isAddress} from 'ethers';
import {parseBoundedJSON} from '../sdk/external-bundle.mjs';

export const RPC_LIMITS=Object.freeze({body:512*1024,response:2*1024*1024,batch:10,
  raw:128*1024,data:128*1024,gas:15_000_000n,logBlocks:2000n,timeout:10_000,inflight:4,perMinute:1200});
// This chain was started with the public Anvil mnemonic and ten accounts. Block
// its first twenty derivations defensively; never treat this as role migration.
const testRoot=HDNodeWallet.fromPhrase('test test test test test test test test test test test junk',undefined,"m/44'/60'/0'/0");
export const PUBLIC_DEV_SENDERS=new Set(Array.from({length:20},(_,i)=>testRoot.deriveChild(i).address.toLowerCase()));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function fail(message,code=-32602){throw Object.assign(Error(message),{rpcCode:code});}
function requireThat(condition,message){if(!condition)fail(message);}
function fields(x,allowed){requireThat(object(x)&&Object.keys(x).every(k=>allowed.includes(k)),'Unexpected object fields');}
function quantity(x){requireThat(typeof x==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(x)&&x.length<=66,'Canonical hex quantity required');return BigInt(x);}
function bytes(x,max,exact){requireThat(typeof x==='string'&&/^0x(?:[0-9a-f]{2})*$/i.test(x)&&x.length<=2+max*2&&(exact===undefined||x.length===2+exact*2),'Invalid or oversized hex bytes');return x;}
function address(x){requireThat(typeof x==='string'&&isAddress(x),'Address required');return x;}
function block(x){if(['latest','pending','earliest','safe','finalized'].includes(x))return x;quantity(x);return x;}
function count(params,min,max=min){requireThat(Array.isArray(params)&&params.length>=min&&params.length<=max,'Invalid parameter count');}
function call(x){
  fields(x,['from','to','data','input','value','gas','gasPrice','maxFeePerGas','maxPriorityFeePerGas','accessList','type','nonce','chainId']);
  if(x.to!==undefined&&x.to!==null)address(x.to);if(x.from!==undefined)address(x.from);
  requireThat(!(x.data!==undefined&&x.input!==undefined),'Use one calldata field');
  if(x.data!==undefined)bytes(x.data,RPC_LIMITS.data);if(x.input!==undefined)bytes(x.input,RPC_LIMITS.data);
  if(x.to===undefined||x.to===null)requireThat((x.data??x.input??'0x').length>2,'Creation estimate requires initcode');
  for(const key of ['value','gasPrice','maxFeePerGas','maxPriorityFeePerGas','nonce'])if(x[key]!==undefined)quantity(x[key]);
  if(x.chainId!==undefined)requireThat(quantity(x.chainId)===31373n,'Estimate/call must bind chain 31373');
  if(x.type!==undefined)requireThat(quantity(x.type)<=2n,'Unsupported transaction type');
  const gas=x.gas===undefined?RPC_LIMITS.gas:quantity(x.gas);requireThat(gas>0n&&gas<=RPC_LIMITS.gas,'Gas exceeds public execution cap');
  if(x.accessList!==undefined){
    requireThat(Array.isArray(x.accessList)&&x.accessList.length<=64,'Access list limit');
    for(const entry of x.accessList){fields(entry,['address','storageKeys']);address(entry.address);requireThat(Array.isArray(entry.storageKeys)&&entry.storageKeys.length<=64,'Storage key limit');for(const key of entry.storageKeys)bytes(key,32,32);}
  }
  return {...x,gas:'0x'+gas.toString(16)};
}

export function validateRawTransaction(raw,{writesEnabled=false}={}){
  if(!writesEnabled)fail('Public wallet transactions are disabled pending administrator migration review',-32004);
  bytes(raw,RPC_LIMITS.raw);let tx;
  try{tx=Transaction.from(raw);}catch{fail('Invalid signed transaction');}
  requireThat([0,1,2].includes(tx.type)&&tx.signature&&tx.from,'Signed legacy/EIP-2930/EIP-1559 transaction required');
  requireThat(tx.chainId===31373n,'Signed transaction must bind chain 31373');
  requireThat(tx.serialized.toLowerCase()===raw.toLowerCase(),'Noncanonical signed transaction');
  requireThat(!PUBLIC_DEV_SENDERS.has(tx.from.toLowerCase()),'Publicly known development sender is forbidden');
  requireThat(tx.gasLimit>0n&&tx.gasLimit<=RPC_LIMITS.gas,'Gas exceeds public transaction cap');
  bytes(tx.data,RPC_LIMITS.data);
  return {sender:tx.from,hash:tx.hash};
}

// Validates the WHOLE envelope before forwarding any element. Notifications and
// mixed/write batches are rejected so a rejected batch cannot partly transact.
export function validateRpcEnvelope(input,{writesEnabled=false}={}){
  const batch=Array.isArray(input);const calls=batch?input:[input];
  requireThat(calls.length>0&&calls.length<=RPC_LIMITS.batch,'Batch must contain 1..10 requests');
  const ids=new Set();
  const checked=calls.map(req=>{
    fields(req,['jsonrpc','id','method','params']);
    requireThat(req.jsonrpc==='2.0'&&(typeof req.id==='string'&&req.id.length<=128||Number.isSafeInteger(req.id)),'JSON-RPC 2.0 request with explicit string/integer id required');
    const id=typeof req.id+':'+req.id;requireThat(!ids.has(id),'Duplicate request id');ids.add(id);
    requireThat(typeof req.method==='string','RPC method required');
    let params=req.params??[];const m=req.method;
    if(['eth_chainId','net_version','eth_blockNumber','eth_gasPrice','eth_maxPriorityFeePerGas','eth_syncing','eth_accounts'].includes(m))count(params,0);
    else if(['eth_getBalance','eth_getCode','eth_getTransactionCount'].includes(m)){count(params,2);address(params[0]);block(params[1]);}
    else if(m==='eth_getStorageAt'){count(params,3);address(params[0]);quantity(params[1]);block(params[2]);}
    else if(['eth_getTransactionByHash','eth_getTransactionReceipt'].includes(m)){count(params,1);bytes(params[0],32,32);}
    else if(['eth_getBlockByNumber','eth_getBlockByHash'].includes(m)){count(params,2);m.endsWith('Hash')?bytes(params[0],32,32):block(params[0]);requireThat(typeof params[1]==='boolean','Full-transactions flag must be boolean');}
    else if(m==='eth_call'||m==='eth_estimateGas'){count(params,1,2);params=[call(params[0]),...(params.length===2?[block(params[1])]:[])];}
    else if(m==='eth_feeHistory'){
      count(params,3);const n=quantity(params[0]);requireThat(n>0n&&n<=20n,'Fee history block limit');block(params[1]);
      requireThat(Array.isArray(params[2])&&params[2].length<=20&&params[2].every((x,i,a)=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100&&(i===0||x>=a[i-1])),'Invalid reward percentiles');
    } else if(m==='eth_getLogs'){
      count(params,1);const f=params[0];fields(f,['address','topics','fromBlock','toBlock','blockHash']);
      const aa=Array.isArray(f.address)?f.address:[f.address];requireThat(aa.length>0&&aa.length<=16,'Log address filter required (max 16)');aa.forEach(address);
      if(f.topics!==undefined){requireThat(Array.isArray(f.topics)&&f.topics.length<=4,'Topic limit');for(const topic of f.topics){if(topic===null)continue;const list=Array.isArray(topic)?topic:[topic];requireThat(list.length<=64,'Topic OR limit');list.forEach(x=>bytes(x,32,32));}}
      if(f.blockHash!==undefined){bytes(f.blockHash,32,32);requireThat(f.fromBlock===undefined&&f.toBlock===undefined,'blockHash cannot be combined with a range');}
      else for(const key of ['fromBlock','toBlock'])if(f[key]!==undefined)block(f[key]);
    } else if(m==='eth_sendRawTransaction'){
      requireThat(!batch,'Signed transactions must use a single request');count(params,1);validateRawTransaction(params[0],{writesEnabled});
    } else fail('RPC method is not available on the public gateway',-32601);
    return {jsonrpc:'2.0',id:req.id,method:m,params};
  });
  return {batch,calls:checked};
}

export function createWindowLimiter({limit=120,windowMs=60_000,keys=1024,now=Date.now}={}){
  const seen=new Map();
  return (key,cost=1)=>{
    const t=now();for(const [k,v] of seen)if(v.until<=t)seen.delete(k);
    let bucket=seen.get(key);if(!bucket){if(seen.size>=keys)return false;bucket={until:t+windowMs,used:0};seen.set(key,bucket);}
    if(bucket.used+cost>limit)return false;bucket.used+=cost;return true;
  };
}

async function boundedResponse(response,signal){
  requireThat(response.ok,'Upstream RPC HTTP failure');
  const reader=response.body.getReader();let total=0;const parts=[];
  try{for(;;){signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>RPC_LIMITS.response)fail('RPC response exceeds public byte limit',-32005);parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  return parseBoundedJSON(Buffer.concat(parts).toString('utf8'),RPC_LIMITS.response);
}
function untilDeadline(promise,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
    if(signal.aborted)abort();
  });
}

export function createRpcGateway({upstream,writesEnabled=()=>false,fetchImpl=fetch,limits={}}){
  const url=new URL(upstream);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Public RPC upstream must be a fixed loopback HTTP URL');
  const policy={...RPC_LIMITS,...limits};let inflight=0;
  const rate=createWindowLimiter({limit:policy.perMinute,keys:1});
  return async function dispatch(raw){
    let parsed,shape;
    // Cryptographic/shape checks first; the live permission check happens only
    // after acquiring a bounded slot. No user request is forwarded yet.
    try{parsed=parseBoundedJSON(raw,policy.body);shape=validateRpcEnvelope(parsed,{writesEnabled:!Array.isArray(parsed)&&parsed?.method==='eth_sendRawTransaction'});}
    catch(e){return {status:400,body:{jsonrpc:'2.0',id:object(parsed)?parsed.id??null:null,error:{code:e.rpcCode??-32600,message:e.message}}};}
    if(inflight>=policy.inflight||!rate('global',shape.calls.length))return {status:429,body:{jsonrpc:'2.0',id:null,error:{code:-32005,message:'Public RPC capacity exceeded; retry later'}}};
    inflight++;
    const signal=AbortSignal.timeout(policy.timeout);
    let readinessPending=null,broadcastStarted=false;
    async function forward(req){
      const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req),signal});
      const body=await boundedResponse(response,signal);
      requireThat(object(body)&&body.jsonrpc==='2.0'&&body.id===req.id&&Object.hasOwn(body,'result')!==Object.hasOwn(body,'error'),'Invalid upstream JSON-RPC response');
      return body;
    }
    try{
      if(shape.calls[0].method==='eth_sendRawTransaction'){
        const readiness=Promise.resolve().then(()=>writesEnabled());readinessPending=readiness;
        const allowed=await untilDeadline(readiness,signal);readinessPending=null;
        if(allowed!==true)fail('Public wallet transactions are disabled pending administrator migration review',-32004);
      }
      let head;
      // Complete log-range admission before forwarding ANY user request.
      for(const req of shape.calls)if(req.method==='eth_getLogs'&&!req.params[0].blockHash){
        const f=req.params[0];
        async function number(tag){if(tag==='earliest')return 0n;if(tag===undefined||['latest','pending','safe','finalized'].includes(tag)){
          if(head===undefined){const r=await forward({jsonrpc:'2.0',id:'gateway-head',method:'eth_blockNumber',params:[]});head=quantity(r.result);}return head;
        }return quantity(tag);}
        const from=await number(f.fromBlock),to=await number(f.toBlock);
        requireThat(to>=from&&to-from<RPC_LIMITS.logBlocks,'Log range exceeds 2000 blocks');
        req.params=[{...f,fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16)}];
      }
      const out=[];
      for(const req of shape.calls){
        signal.throwIfAborted();
        if(req.method==='eth_sendRawTransaction')broadcastStarted=true;
        // Never reveal the node's unlocked development accounts.
        out.push(req.method==='eth_accounts'?{jsonrpc:'2.0',id:req.id,result:[]}:await forward(req));
      }
      const body=shape.batch?out:out[0];
      requireThat(Buffer.byteLength(JSON.stringify(body))<=policy.response,'RPC batch response exceeds public byte limit');
      return {status:200,body};
    }catch(e){
      const submitted=broadcastStarted;
      return {status:e.rpcCode===-32004?403:502,body:{jsonrpc:'2.0',id:shape.batch?null:shape.calls[0].id,error:{code:e.rpcCode??-32002,
        message:submitted?'Broadcast outcome unknown; query transaction hash before retrying':signal.aborted?'Upstream RPC timed out':e.message,
        ...(submitted?{data:{transactionHash:Transaction.from(shape.calls[0].params[0]).hash,outcome:'unknown-query-by-hash'}}:{})}}};
    }
    finally{
      // Ethers readiness reads may not be abortable. Retain the slot after an
      // HTTP timeout until they actually finish, instead of piling up work.
      if(readinessPending)readinessPending.then(()=>{inflight--;},()=>{inflight--;});else inflight--;
    }
  };
}
