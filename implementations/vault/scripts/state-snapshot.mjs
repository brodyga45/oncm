import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform, Writable} from 'node:stream';
import {createHash} from 'node:crypto';
import parserPackage from 'stream-json';

export const MAX_SNAPSHOT_BYTES=1024*1024*1024;
const identity=s=>`${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}`;
// Token-only parsing: strings, numbers and keys are never assembled into state.
export async function validateSnapshot(file,{maxBytes=MAX_SNAPSHOT_BYTES,signal}={}) {
  const before=await fs.promises.stat(file,{bigint:true});
  if(before.size>BigInt(maxBytes)||before.size===0n)throw Error('Snapshot exceeds disk byte limit or is empty');
  let bytes=0,depth=0,key='',readingKey=false,topKey='',root=false;
  const fields=new Map(),hash=createHash('sha256');
  await pipeline(fs.createReadStream(file,{highWaterMark:64*1024}),
    new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>maxBytes)return callback(Error('Snapshot byte limit exceeded'));hash.update(chunk);callback(null,chunk);}}),
    parserPackage.parser({packValues:false,streamValues:true}),
    new Writable({objectMode:true,write(token,_encoding,callback){try{
      const {name,value}=token;
      if(name==='startKey'&&depth===1){key='';readingKey=true;}
      else if(name==='stringChunk'&&readingKey){key+=value;if(key.length>128)throw Error('Oversized top-level snapshot key');}
      else if(name==='endKey'&&readingKey){readingKey=false;topKey=key;if(fields.has(key)||fields.size>=64)throw Error('Duplicate/excessive snapshot root fields');fields.set(key,null);}
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
  return {bytes,sha256:hash.digest('hex'),validatedAt:new Date().toISOString()};
}

export async function backupSnapshot(source,destination,options={}) {
  const temporary=destination+'.tmp';
  try {
    const before=await fs.promises.stat(source,{bigint:true});
    if(before.size>BigInt(options.maxBytes??MAX_SNAPSHOT_BYTES))throw Error('Snapshot backup disk byte limit exceeded');
    await fs.promises.copyFile(source,temporary,options.copyMode??fs.constants.COPYFILE_FICLONE);
    if(identity(before)!==identity(await fs.promises.stat(source,{bigint:true})))throw Error('Source dump changed while copying');
    const report=await validateSnapshot(temporary,options);
    const handle=await fs.promises.open(temporary,'r');try{await handle.sync();}finally{await handle.close();}
    await fs.promises.rename(temporary,destination);
    await fs.promises.writeFile(destination+'.validation.json.tmp',JSON.stringify(report,null,2)+'\n');
    await fs.promises.rename(destination+'.validation.json.tmp',destination+'.validation.json');
    return report;
  } catch(error){await fs.promises.unlink(temporary).catch(()=>{});throw error;}
}
