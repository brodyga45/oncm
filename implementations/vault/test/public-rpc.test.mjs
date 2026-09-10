import test from 'node:test';
import assert from 'node:assert/strict';
import {Wallet,Transaction} from 'ethers';
import {createRpcGateway,validateRpcEnvelope,validateRawTransaction,PUBLIC_DEV_SENDERS,RPC_LIMITS,createWindowLimiter} from '../server/rpc-gateway.mjs';

const address='0x'+'12'.repeat(20),hash='0x'+'34'.repeat(32);
const request=(method,params=[],id=1)=>({jsonrpc:'2.0',id,method,params});
const wallet=new Wallet('0x'+'11'.repeat(32)); // Public test vector, not a deployed/funded account.
const sign=(overrides={})=>wallet.signTransaction({chainId:31373,type:2,to:address,nonce:0,gasLimit:21000,maxFeePerGas:2,maxPriorityFeePerGas:1,...overrides});
function fake(records,{result='0x1',error}={}){
  return async(_url,options)=>{const call=JSON.parse(options.body);records.push(call);return Response.json({jsonrpc:'2.0',id:call.id,...(error?{error}:{result})});};
}
const gateway=(options={})=>createRpcGateway({upstream:'http://127.0.0.1:9547',...options});

test('exact method allowlist rejects node writes, filter resources, arbitrary namespaces and whole mixed batches',async()=>{
  const seen=[],g=gateway({fetchImpl:fake(seen)});
  for(const method of ['eth_sendTransaction','eth_sign','eth_signTypedData_v4','personal_unlockAccount','anvil_impersonateAccount','anvil_setBalance','anvil_mine','evm_mine','evm_increaseTime','evm_snapshot','hardhat_reset','admin_addPeer','debug_traceTransaction','txpool_content','eth_newFilter','eth_subscribe','ETH_chainId','eth_chainId ']){
    const r=await g(JSON.stringify(request(method)));assert.equal(r.status,400,method);assert.equal(r.body.error.code,-32601,method);
  }
  const batch=await g(JSON.stringify([request('eth_blockNumber',[],1),request('anvil_mine',[],2)]));
  assert.equal(batch.status,400);assert.equal(seen.length,0);
});

test('parses bounded exact JSON and rejects duplicate keys, notifications, duplicate IDs, oversized/deep batches',async()=>{
  const g=gateway({fetchImpl:fake([])});
  for(const raw of ['{"jsonrpc":"2.0","id":1,"method":"eth_chainId","method":"anvil_mine"}',
    JSON.stringify({jsonrpc:'2.0',method:'eth_chainId'}),JSON.stringify([]),JSON.stringify([request('eth_chainId'),request('eth_chainId')]),
    JSON.stringify(Array.from({length:11},(_,i)=>request('eth_chainId',[],i))),'{"x":'+ '['.repeat(65)+'0'+']'.repeat(65)+'}', ' '.repeat(RPC_LIMITS.body+1)]){
    assert.equal((await g(raw)).status,400);
  }
});

test('real signature recovery gates chain, test sender, signature, encoding, gas and broadcast shape',async()=>{
  const raw=await sign();assert.equal(validateRawTransaction(raw,{writesEnabled:true}).sender,wallet.address);
  assert.throws(()=>validateRawTransaction(raw),/disabled pending/);
  assert.throws(()=>validateRawTransaction(Transaction.from(raw).unsignedSerialized,{writesEnabled:true}),/Signed/);
  assert.throws(()=>validateRawTransaction(raw+'00',{writesEnabled:true}),/Invalid signed|Noncanonical/);
  assert.throws(()=>validateRpcEnvelope([request('eth_sendRawTransaction',[raw])],{writesEnabled:true}),/single request/);
  for(const chainId of [0,1,31337])assert.throws(()=>validateRawTransaction(Transaction.from({type:2,chainId,to:address,gasLimit:21000}).unsignedSerialized,{writesEnabled:true}),/Signed/);
  assert.throws(()=>validateRawTransaction('0xdeadbeef',{writesEnabled:true}),/Invalid signed/);
  const wrong=await sign({chainId:1});assert.throws(()=>validateRawTransaction(wrong,{writesEnabled:true}),/chain 31373/);
  const unprotected=await sign({type:0,chainId:0,maxFeePerGas:null,maxPriorityFeePerGas:null,gasPrice:1});assert.throws(()=>validateRawTransaction(unprotected,{writesEnabled:true}),/chain 31373/);
  const high=await sign({gasLimit:RPC_LIMITS.gas+1n});assert.throws(()=>validateRawTransaction(high,{writesEnabled:true}),/Gas/);
  const dev=Wallet.fromPhrase('test test test test test test test test test test test junk');
  assert(PUBLIC_DEV_SENDERS.has(dev.address.toLowerCase()));
  const devRaw=await dev.signTransaction({type:2,chainId:31373,to:address,gasLimit:21000,maxFeePerGas:2,maxPriorityFeePerGas:1});
  assert.throws(()=>validateRawTransaction(devRaw,{writesEnabled:true}),/development sender/);
  const seen=[],g=gateway({writesEnabled:()=>true,fetchImpl:fake(seen,{result:Transaction.from(raw).hash})});
  assert.equal((await g(JSON.stringify(request('eth_sendRawTransaction',[raw])))).status,200);
  assert.deepEqual(seen,[request('eth_sendRawTransaction',[raw])]);
});

test('bounded call simulation cannot introduce state overrides, creation, extra fields or excessive gas',()=>{
  const p=validateRpcEnvelope(request('eth_call',[{to:address,data:'0x'},'latest']));
  assert.equal(BigInt(p.calls[0].params[0].gas),RPC_LIMITS.gas);
  for(const req of [request('eth_call',[{to:address},'latest',{}]),request('eth_estimateGas',[{data:'0x'}]),
    request('eth_call',[{to:address,gas:'0xffffffff'}]),request('eth_call',[{to:address,stateOverride:{}}]),
    request('eth_call',[{to:address,data:'0x',input:'0x'}]),request('eth_call',[{to:address,type:'0x4'}])])assert.throws(()=>validateRpcEnvelope(req));
});

test('log range is fixed against a bounded head and disallowed unfiltered/oversized ranges never reach getLogs',async()=>{
  const seen=[],g=gateway({fetchImpl:async(u,o)=>{const r=JSON.parse(o.body);seen.push(r);return Response.json({jsonrpc:'2.0',id:r.id,result:r.method==='eth_blockNumber'?'0x2328':[]});}});
  const bad=await g(JSON.stringify(request('eth_getLogs',[{address,fromBlock:'0x0',toBlock:'latest'}])));
  assert.equal(bad.status,502);assert.equal(seen.length,1);assert.equal(seen[0].method,'eth_blockNumber');
  assert.throws(()=>validateRpcEnvelope(request('eth_getLogs',[{}])),/Address|address/);
  const good=await g(JSON.stringify(request('eth_getLogs',[{address,fromBlock:'0x2320',toBlock:'latest',topics:[hash]}])));
  assert.equal(good.status,200);assert.equal(seen.at(-1).params[0].toBlock,'0x2328');
});

test('node accounts are hidden; read requests never invoke write-readiness checks',async()=>{
  const seen=[],g=gateway({writesEnabled:()=>{throw Error('must not call');},fetchImpl:fake(seen)});
  const result=await g(JSON.stringify([request('eth_accounts',[],1),request('eth_chainId',[],2)]));
  assert.equal(result.status,200);assert.deepEqual(result.body[0].result,[]);assert.equal(seen.length,1);
});

test('gateway rejects non-loopback upstream and caps concurrent work, response size and request rate',async()=>{
  for(const upstream of ['https://evil.invalid','http://127.0.0.1:9547/private','http://user:pass@localhost:9547/'])assert.throws(()=>createRpcGateway({upstream}),/loopback/);
  let release;const g=gateway({limits:{inflight:1},fetchImpl:async(_u,o)=>new Promise(resolve=>{release=()=>resolve(Response.json({jsonrpc:'2.0',id:JSON.parse(o.body).id,result:'0x1'}));})});
  const pending=g(JSON.stringify(request('eth_chainId')));await new Promise(r=>setImmediate(r));
  assert.equal((await g(JSON.stringify(request('eth_chainId')))).status,429);release();assert.equal((await pending).status,200);
  const tooBig=gateway({fetchImpl:fake([],{result:'x'.repeat(RPC_LIMITS.response+1)})});assert.equal((await tooBig(JSON.stringify(request('eth_chainId')))).status,502);
  const limited=gateway({limits:{perMinute:1},fetchImpl:fake([])});assert.equal((await limited(JSON.stringify(request('eth_chainId')))).status,200);assert.equal((await limited(JSON.stringify(request('eth_chainId')))).status,429);
  let now=0;const limit=createWindowLimiter({limit:1,keys:1,now:()=>now});assert(limit('a'));assert(!limit('b'));now=61_000;assert(limit('b'));
});

test('a broadcast timeout reports the real signed hash and never retries upstream',async()=>{
  const raw=await sign();let attempts=0;
  const keepAlive=setTimeout(()=>{},1000);
  try{
    const g=gateway({writesEnabled:()=>true,limits:{timeout:20},fetchImpl:async(_u,{signal})=>{attempts++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
    const r=await g(JSON.stringify(request('eth_sendRawTransaction',[raw])));
    assert.equal(r.status,502);assert.match(r.body.error.message,/outcome unknown/);assert.equal(r.body.error.data.transactionHash,Transaction.from(raw).hash);assert.equal(attempts,1);
  }finally{clearTimeout(keepAlive);}
});

test('slow or failed migration readiness cannot broadcast or accumulate work outside admission limits',async()=>{
  const raw=await sign(),seen=[];let release;const keepAlive=setTimeout(()=>{},1000);
  try{
    const denied=gateway({fetchImpl:fake(seen)});
    assert.equal((await denied(JSON.stringify(request('eth_sendRawTransaction',[raw])))).status,403);assert.equal(seen.length,0);
    const g=gateway({limits:{inflight:1,timeout:20},writesEnabled:()=>new Promise(r=>{release=r;}),fetchImpl:fake(seen)});
    const result=await g(JSON.stringify(request('eth_sendRawTransaction',[raw])));
    assert.equal(result.status,502);assert.equal(result.body.error.data,undefined);assert.equal(seen.length,0);
    assert.equal((await g(JSON.stringify(request('eth_chainId')))).status,429);
    release(false);await new Promise(r=>setImmediate(r));assert.equal((await g(JSON.stringify(request('eth_chainId')))).status,200);
  }finally{clearTimeout(keepAlive);}
});

test('populated wallet estimates support nonce, chain binding and contract creation within gas cap',()=>{
  const envelope=validateRpcEnvelope({jsonrpc:'2.0',id:1,method:'eth_estimateGas',params:[{from:'0x'+'11'.repeat(20),nonce:'0x0',chainId:'0x7a8d',data:'0x60016000'}]});
  assert.equal(envelope.calls[0].params[0].nonce,'0x0');
  assert.throws(()=>validateRpcEnvelope({jsonrpc:'2.0',id:2,method:'eth_estimateGas',params:[{chainId:'0x1',data:'0x6000'}]}),/chain 31373/);
});
