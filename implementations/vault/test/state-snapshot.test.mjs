import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateSnapshot,backupSnapshot} from '../scripts/state-snapshot.mjs';
import {rotatingLog} from '../ops/rotating-log.mjs';

test('streaming validator handles a long code string without assembling account state and hashes exact bytes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vault-snapshot-'));
 try{
  const file=path.join(dir,'state.json');const text=JSON.stringify({block:{number:'0x233'},accounts:{a:{code:'0x'+'ab'.repeat(1024*1024)}},blocks:[],transactions:[]});
  await fs.writeFile(file,text);const result=await validateSnapshot(file);
  assert.equal(result.bytes,Buffer.byteLength(text));assert.equal(result.sha256,createHash('sha256').update(text).digest('hex'));
  await assert.rejects(validateSnapshot(file,{maxBytes:1024}),/byte limit/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('incomplete, duplicate or wrong-shape primary cannot replace the prior valid backup',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vault-snapshot-'));
 try{
  const file=path.join(dir,'state.json'),backup=path.join(dir,'backup.json');
  const valid='{"block":{},"accounts":{},"blocks":[],"transactions":[]}';
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
