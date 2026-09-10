import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateSnapshot,backupSnapshot,resumeTimestamp,historicalStateArgs,initializeMiningClock} from '../scripts/state-snapshot.mjs';
import {rotatingLog} from '../ops/rotating-log.mjs';

test('pilot can omit historical-state dumps while local default preserves them; ambiguous values fail closed',()=>{
 assert.deepEqual(historicalStateArgs(),['--preserve-historical-states']);
 assert.deepEqual(historicalStateArgs('1'),['--preserve-historical-states']);
 assert.deepEqual(historicalStateArgs('0'),[]);
 for(const invalid of ['',false,0,'false','2'])assert.throws(()=>historicalStateArgs(invalid));
});

test('resume checks original genesis/head then sets persistent time before enabling interval or local automine',async()=>{
 for(const blockTime of [5,undefined]){
  const calls=[];
  const rpc=async(method,params)=>{calls.push({method,params});if(method==='eth_getBlockByNumber')return params[0]==='0x0'?{timestamp:'0x64',hash:'0xabc'}:params[0]==='latest'?{number:'0x2',timestamp:'0x7d0'}:{parentHash:'0xabc'};return null;};
  const result=await initializeMiningClock(rpc,{genesisTimestamp:100,snapshot:{blockNumber:'2',blockTimestamp:'2000'},blockTime,nowSeconds:1000});
  assert.equal(result.clockTarget,'2001');
  assert.deepEqual(calls.slice(3),[{method:'evm_setTime',params:[2001]},{method:blockTime?'evm_setIntervalMining':'evm_setAutomine',params:blockTime?[5]:[true]}]);
 }
});

test('wrong genesis refuses initialization without changing time or enabling any mining',async()=>{
 const calls=[];
 await assert.rejects(initializeMiningClock(async(method)=>{calls.push(method);return{timestamp:'0x65'};},{genesisTimestamp:100}),/genesis identity/);
 assert.deepEqual(calls,['eth_getBlockByNumber']);
});

test('streaming validator handles a long code string without assembling account state and hashes exact bytes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vault-snapshot-'));
 try{
  const file=path.join(dir,'state.json');const text=JSON.stringify({block:{number:'0x248',timestamp:'0x6aa2c6b3'},accounts:{a:{code:'0x'+'ab'.repeat(1024*1024)}},blocks:[],transactions:[]});
  await fs.writeFile(file,text);const result=await validateSnapshot(file);
  assert.equal(result.blockNumber,'584');assert.equal(result.blockTimestamp,BigInt('0x6aa2c6b3').toString());assert.equal(result.bytes,Buffer.byteLength(text));assert.equal(result.sha256,createHash('sha256').update(text).digest('hex'));
  await assert.rejects(validateSnapshot(file,{maxBytes:1024}),/byte limit/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('incomplete, duplicate or wrong-shape primary cannot replace the prior valid backup',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vault-snapshot-'));
 try{
  const file=path.join(dir,'state.json'),backup=path.join(dir,'backup.json');
  const valid='{"block":{"number":"0x1","timestamp":123},"accounts":{},"blocks":[],"transactions":[]}';
  await fs.writeFile(file,valid);await backupSnapshot(file,backup);
  assert.equal(await fs.readFile(backup,'utf8'),valid);
  for(const text of ['{"block":', '{"block":{},"block":{},"accounts":{},"blocks":[],"transactions":[]}', '{"block":{},"accounts":{},"blocks":{},"transactions":[]}']){
   await fs.writeFile(file,text);await assert.rejects(backupSnapshot(file,backup));
   assert.equal(await fs.readFile(backup,'utf8'),valid);
   await assert.rejects(fs.stat(backup+'.tmp'),{code:'ENOENT'});
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('rotation bounds log files even for oversized writes and retains the newest exact bytes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vault-logs-'));
 try{
  const file=path.join(dir,'service.log'),write=rotatingLog(file,{maxBytes:16,copies:2});
  write('a'.repeat(15));write('b'.repeat(50));write('ending');
  for(const name of await fs.readdir(dir))assert.ok((await fs.stat(path.join(dir,name))).size<=16);
  assert.equal((await fs.readdir(dir)).length,3);
  assert.equal(await fs.readFile(file,'utf8'),'bending');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});


test('resume chooses strictly after saved chain time or current wall clock, never genesis',()=>{
 assert.equal(resumeTimestamp({blockTimestamp:'2000'},1000),'2001');
 assert.equal(resumeTimestamp({blockTimestamp:'2000'},2000),'2001');
 assert.equal(resumeTimestamp({blockTimestamp:'2000'},3000),'3000');
 assert.throws(()=>resumeTimestamp({blockTimestamp:'18446744073709551615'},1000));
});

test('live dump promotion atomically replaces stable primary and retains previous primary; incomplete next dump changes neither',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vault-promote-'));
 try{
  const primary=path.join(dir,'stable.json'),writing=path.join(dir,'writing.json'),previous=path.join(dir,'previous.json');
  const snapshot=(number,timestamp)=>JSON.stringify({block:{number,timestamp},accounts:{},blocks:[],transactions:[]});
  const old=snapshot(584,2000),next=snapshot(585,2005);
  await fs.writeFile(primary,old);await fs.writeFile(writing,next);
  const report=await backupSnapshot(writing,primary,{previous});
  assert.equal(report.blockNumber,'585');assert.equal(await fs.readFile(previous,'utf8'),old);assert.equal(await fs.readFile(primary,'utf8'),next);
  await fs.writeFile(writing,'{"block":');await assert.rejects(backupSnapshot(writing,primary,{previous}));
  assert.equal(await fs.readFile(previous,'utf8'),old);assert.equal(await fs.readFile(primary,'utf8'),next);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('saved timestamp must be an explicit valid quantity; missing, duplicate and wrong types fail closed',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vault-time-'));
 try{const file=path.join(dir,'state.json');
 for(const block of ['{"number":"0x1"}','{"number":1,"timestamp":true}','{"number":1,"timestamp":"1e3"}','{"number":1,"timestamp":12,"timestamp":13}']){
 await fs.writeFile(file,'{"block":'+block+',"accounts":{},"blocks":[],"transactions":[]}');
 await assert.rejects(validateSnapshot(file));
 }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
