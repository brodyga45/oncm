const wrapped=new WeakSet();
// Preserve ethers Log objects and query semantics; only split numbered ranges.
export function paginatedLogs(query,{head,block}, {pageSize=1000,maxLogs=10000,maxBytes=8*1024*1024,maxPages=128}={}) {
  return async filter=>{
    let latest;
    const number=async value=>{
      if(value===undefined||value==='latest'||value==='pending')return latest??=BigInt(await head());
      if(value==='earliest')return 0n;
      if(value==='safe'||value==='finalized')return BigInt((await block(value)).number);
      const n=BigInt(value);if(n<0n)throw Error('Public log range requires nonnegative block numbers');return n;
    };
    const logs=[];let bytes=0;
    const append=page=>{
      if(!Array.isArray(page))throw Error('Invalid public log response');
      for(const log of page){bytes+=new TextEncoder().encode(JSON.stringify(log,(_key,value)=>typeof value==='bigint'?String(value):value)).length;
        if(logs.length>=maxLogs||bytes>maxBytes)throw Error('Public log history exceeds browser limits; narrow the range');logs.push(log);}
    };
    if(filter.blockHash!==undefined){append(await query(filter));return logs;}
    const from=await number(filter.fromBlock),to=await number(filter.toBlock);
    if(to<from)throw Error('Public log range ends before it starts');
    const size=BigInt(pageSize);
    if((to-from)/size+1n>BigInt(maxPages))throw Error('Public log history exceeds page limit; narrow the range');
    for(let start=from;start<=to;start+=size){const end=start+size-1n>to?to:start+size-1n;
      append(await query({...filter,fromBlock:'0x'+start.toString(16),toBlock:'0x'+end.toString(16)}));}
    return logs;
  };
}

export function withPublicLogs(provider,config){
  if(!config?.publicMode||wrapped.has(provider))return provider;
  provider.getLogs=paginatedLogs(provider.getLogs.bind(provider),{head:()=>provider.getBlockNumber(),block:tag=>provider.getBlock(tag)});
  wrapped.add(provider);return provider;
}
