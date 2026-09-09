// Complete the two already-running smoke proofs, sequentially, using the
// pinned native Groth16 adapter. This never starts another Lean/STARK job.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=path.dirname(fileURLToPath(import.meta.url));
const policy=JSON.parse(await fs.readFile(path.join(root,'execution-policy.local.json'),'utf8'));
if(policy.allowExpensiveProving!==true)throw Error('Expensive proving is disabled by the local memory policy; no waiting or compression was started');
const runtime=JSON.parse(await fs.readFile(path.join(root,'runtime.local.json'),'utf8'));
const env={...process.env,...runtime.env,RISC0_DEV_MODE:'',RISC0_PROVER:'ipc',RISC0_SERVER_PATH:runtime.r0vm,RAYON_NUM_THREADS:'2',GOMAXPROCS:'2',ONCM_NATIVE_GROTH16_CONFIG:path.join(root,'runtime.local.json'),PATH:[path.join(root,'native-adapter'),path.dirname(runtime.r0vm),process.env.PATH].join(path.delimiter)};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const name of ['registration','proof']){
  const input=path.join(root,`${name}-succinct.receipt`);
  const output=path.join(root,`${name}-groth16.receipt`);
  const temporary=output+'.partial';
  console.log(`${new Date().toISOString()} Waiting for verified ${name} succinct receipt`);
  const deadline=Date.now()+3*60*60*1000;
  while(!(await fs.stat(input).catch(()=>null))?.size){
    if(Date.now()>deadline)throw Error(`Timed out waiting for ${name}; no certificate published`);
    await pause(5000);
  }
  await pause(1000);
  const existing=(await fs.stat(output).catch(()=>null))?.size;
  console.log(`${new Date().toISOString()} ${existing?'Inspecting':'Compressing'} ${name}`);
  const args=existing?['inspect',path.join(root,'lean-checker.bin'),output]:['compress',path.join(root,'lean-checker.bin'),input,temporary];
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(path.join(root,'bin/oncm-proof-host'),args,{cwd:root,env,stdio:['ignore','pipe','inherit']});
    let out='';child.stdout.on('data',data=>{out+=data;process.stdout.write(data);});
    child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(Error(`${name} compression exited ${code}`)));
  });
  const inspected=JSON.parse(result.trim().split('\n').at(-1));
  if(!inspected.seal||!inspected.journal)throw Error('Missing verified receipt result');
  if(!existing)await fs.rename(temporary,output);
  await fs.writeFile(path.join(root,`${name}-groth16.json`),JSON.stringify(inspected,null,2)+'\n');
  console.log(`${new Date().toISOString()} Verified ${name} Groth16 receipt saved`);
}
