import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform, Writable} from 'node:stream';
import {createHash} from 'node:crypto';
import parserPackage from 'stream-json';

export const MAX_SNAPSHOT_BYTES=1024*1024*1024;
export function historicalStateArgs(value='1') {
  if(!['0','1'].includes(value))throw Error('VAULT_PRESERVE_HISTORICAL_STATES must be 0 or 1');
  return value==='1'?['--preserve-historical-states']:[];
}
const identity=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}`;
// Token-only parsing: strings, numbers and keys are never assembled into state.
export async function validateSnapshot(file,{maxBytes=MAX_SNAPSHOT_BYTES,signal}={}) {
  const before=await fs.promises.stat(file,{bigint:true});
  if(before.size>BigInt(maxBytes)||before.size===0n)throw Error('Snapshot exceeds disk byte limit or is empty');
  let bytes=0,depth=0,key='',readingKey=false,keyDepth=0,topKey='',blockKey='',root=false,capture=null;
  const fields=new Map(),blockFields=new Map(),hash=createHash('sha256');
  await pipeline(fs.createReadStream(file,{highWaterMark:64*1024}),
    new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>maxBytes)return callback(Error('Snapshot byte limit exceeded'));hash.update(chunk);callback(null,chunk);}}),
    parserPackage.parser({packValues:false,streamValues:true}),
    new Writable({objectMode:true,write(token,_encoding,callback){try{
      const {name,value}=token;
      if(name==='startKey'&&(depth===1||depth===2&&topKey==='block')){key='';readingKey=true;keyDepth=depth;}
      else if(name==='stringChunk'&&readingKey){key+=value;if(key.length>128)throw Error('Oversized top-level snapshot key');}
      else if(name==='endKey'&&readingKey){
        readingKey=false;const target=keyDepth===1?fields:blockFields;
        if(target.has(key)||target.size>=64)throw Error('Duplicate/excessive snapshot fields');target.set(key,null);
        if(keyDepth===1)topKey=key;else blockKey=key;
      }
      else if((name==='startString'||name==='startNumber')&&depth===2&&topKey==='block'&&['number','timestamp'].includes(blockKey))capture={key:blockKey,text:''};
      else if((name==='stringChunk'||name==='numberChunk')&&capture){capture.text+=value;if(capture.text.length>80)throw Error('Oversized snapshot block quantity');}
      else if((name==='endString'||name==='endNumber')&&capture){
        if(!/^(?:0x[0-9a-f]+|0|[1-9][0-9]*)$/i.test(capture.text))throw Error('Invalid snapshot block quantity');
        const n=BigInt(capture.text);if(n>0xffffffffffffffffn)throw Error('Snapshot block quantity exceeds uint64');
        blockFields.set(capture.key,n.toString());capture=null;
      }
      else if(name==='startObject'||name==='startArray'){
        if(depth===0){if(root||name!=='startObject')throw Error('Snapshot must have one object root');root=true;}
        else if(depth===1)fields.set(topKey,name==='startObject'?'object':'array');
        if(++depth>256)throw Error('Snapshot nesting limit exceeded');
      } else if(name==='endObject'||name==='endArray')depth--;
      callback();
    }catch(error){callback(error);}}}),{signal});
  const after=await fs.promises.stat(file,{bigint:true});
  if(identity(before)!==identity(after)||bytes!==Number(before.size))throw Error('Snapshot changed during validation; retry after a stable dump');
  for(const [name,type] of [['block','object'],['accounts','object'],['blocks','array'],['transactions','array']])
    if(fields.get(name)!==type)throw Error('Missing or invalid snapshot field: '+name);
  for(const name of ['number','timestamp'])if(typeof blockFields.get(name)!=='string')throw Error('Missing snapshot block '+name);
  return {bytes,sha256:hash.digest('hex'),blockNumber:blockFields.get('number'),blockTimestamp:blockFields.get('timestamp'),validatedAt:new Date().toISOString()};
}

export function resumeTimestamp(snapshot,nowSeconds=Math.floor(Date.now()/1000)) {
  const saved=BigInt(snapshot.blockTimestamp),now=BigInt(nowSeconds);
  if(saved<0n||saved>=0xffffffffffffffffn||now<0n||now>0xffffffffffffffffn)throw Error('Invalid resume timestamp');
  // A restored development chain can be ahead of wall clock. Never restart its
  // time manager from the original genesis, nor move its next block backwards.
  return (saved+1n>now?saved+1n:now).toString();
}

export async function initializeMiningClock(rpc,{genesisTimestamp,snapshot,blockTime,nowSeconds}) {
  const genesis=await rpc('eth_getBlockByNumber',['0x0',false]);
  if(!genesis||BigInt(genesis.timestamp)!==BigInt(genesisTimestamp))throw Error('Loaded genesis identity does not match the original chain');
  const head=await rpc('eth_getBlockByNumber',['latest',false]);
  if(snapshot&&(BigInt(head.number)!==BigInt(snapshot.blockNumber)||BigInt(head.timestamp)!==BigInt(snapshot.blockTimestamp)))throw Error('Loaded head differs from validated snapshot');
  if(BigInt(head.number)>0n){
    const first=await rpc('eth_getBlockByNumber',['0x1',false]);
    if(!first||first.parentHash.toLowerCase()!==genesis.hash.toLowerCase())throw Error('Genesis hash differs from the original first block parent');
  }
  const target=resumeTimestamp(snapshot??{blockTimestamp:head.timestamp},nowSeconds);
  // Installed Anvil 1.7.1 accepts seconds below 1e12; larger input is treated as
  // milliseconds. Refuse an ambiguous far-future epoch instead of coercing it.
  if(BigInt(target)>=1_000_000_000_000n)throw Error('Resume epoch exceeds unambiguous Anvil seconds range');
  await rpc('evm_setTime',[Number(target)]);
  // RPC setters replace the mining mode; combining them would NOT be mixed.
  if(blockTime)await rpc('evm_setIntervalMining',[blockTime]);
  else await rpc('evm_setAutomine',[true]);
  return {genesisHash:genesis.hash,genesisTimestamp:String(genesisTimestamp),restoredBlockNumber:String(BigInt(head.number)),clockTarget:target,mining:blockTime?'interval':'automine',blockTime:blockTime??0};
}

export async function backupSnapshot(source,destination,options={}) {
  const temporary=destination+'.tmp';
  const previousTemporary=options.previous?options.previous+'.tmp':null;
  try {
    const before=await fs.promises.stat(source,{bigint:true});
    if(before.size>BigInt(options.maxBytes??MAX_SNAPSHOT_BYTES))throw Error('Snapshot backup disk byte limit exceeded');
    await fs.promises.copyFile(source,temporary,options.copyMode??fs.constants.COPYFILE_FICLONE);
    if(identity(before)!==identity(await fs.promises.stat(source,{bigint:true})))throw Error('Source dump changed while copying');
    const report=await validateSnapshot(temporary,options);
    options.signal?.throwIfAborted();
    const handle=await fs.promises.open(temporary,'r');try{await handle.sync();}finally{await handle.close();}
    if(options.previous&&fs.existsSync(destination)){
      // destination is the previously validated stable primary, never Anvil's
      // live dump. Preserve it without reopening the whole JSON into memory.
      const prior=await fs.promises.stat(destination,{bigint:true});
      if(prior.size>BigInt(options.maxBytes??MAX_SNAPSHOT_BYTES))throw Error('Prior primary exceeds snapshot byte limit');
      await fs.promises.copyFile(destination,previousTemporary,fs.constants.COPYFILE_FICLONE);
      if(identity(prior)!==identity(await fs.promises.stat(destination,{bigint:true})))throw Error('Stable primary changed during checkpoint');
      const old=await fs.promises.open(previousTemporary,'r');try{await old.sync();}finally{await old.close();}
      await fs.promises.rename(previousTemporary,options.previous);
      // Sidecar is diagnostic only; never retain metadata for an older file.
      await fs.promises.unlink(options.previous+'.validation.json').catch(()=>{});
    }
    options.signal?.throwIfAborted();
    await fs.promises.rename(temporary,destination);
    await fs.promises.writeFile(destination+'.validation.json.tmp',JSON.stringify(report,null,2)+'\n');
    await fs.promises.rename(destination+'.validation.json.tmp',destination+'.validation.json');
    return report;
  } catch(error){await fs.promises.unlink(temporary).catch(()=>{});if(previousTemporary)await fs.promises.unlink(previousTemporary).catch(()=>{});throw error;}
}
