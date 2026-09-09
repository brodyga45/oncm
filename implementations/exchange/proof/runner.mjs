import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {goalPrefix} from './goal-prefix.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const activeChildren=new Set();
const stopChild=child=>{try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}};
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const child of activeChildren)stopChild(child);process.exit(signal==='SIGINT'?130:143);});
const readJson=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const digest=b=>'0x'+createHash('sha256').update(b).digest('hex');
const word=n=>BigInt(n).toString(16).padStart(64,'0');
function certificate(seal,journal){
  // ABI encode (bytes seal, bytes journal); no chain-specific SDK dependency.
  seal=seal.replace(/^0x/,'');journal=journal.replace(/^0x/,'');
  const a=word(seal.length/2)+seal.padEnd(Math.ceil(seal.length/64)*64,'0');
  const b=word(journal.length/2)+journal.padEnd(Math.ceil(journal.length/64)*64,'0');
  return '0x'+word(64)+word(64+a.length/2)+a+b;
}
async function run(command,args,{cwd=root,env={},timeout=7200000,isolation}={}){
  if(isolation){
    if(process.platform!=='darwin')throw Error('Configure an isolated Lean worker for this operating system before executing source');
    const readRoots=[cwd,...isolation,'/System','/usr/lib','/usr/bin','/bin','/Library/Apple','/private/var/db/dyld'];
    const profile=`(version 1) (deny default)
      (allow process-exec) (allow process-fork) (allow sysctl-read)
      (allow file-read-metadata)
      (allow file-read* ${readRoots.map(p=>`(subpath ${JSON.stringify(p)})`).join(' ')}
        (literal "/") (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom"))
      (allow file-write* (subpath ${JSON.stringify(cwd)}) (literal "/dev/null"))
      (allow mach-lookup (global-name "com.apple.system.logger") (global-name "com.apple.logd") (global-name "com.apple.notifyd"))`;
    args=['-p',profile,command,...args];command='/usr/bin/sandbox-exec';
  }
  const reports=path.join(root,'.resource-reports');await fs.mkdir(reports,{recursive:true});
  const report=path.join(reports,randomUUID()+'.json');
  args=[path.join(root,'resource-guard.py'),'--memory-mib',isolation?'512':'2048','--timeout',String(Math.min(timeout/1000,120)),'--report',report,'--lock-file',`/private/tmp/oncm-worker-${process.getuid()}.lock`,'--',command,...args];
  command='/usr/bin/python3';
  return new Promise((resolve,reject)=>{
    const inherited=isolation?{LANG:'en_US.UTF-8',TMPDIR:cwd}:process.env;
    const child=spawn(command,args,{cwd,detached:true,env:{...inherited,...env,RISC0_DEV_MODE:''},stdio:['ignore','pipe','pipe']});
    activeChildren.add(child);
    let out='',err='';
    const timer=setTimeout(()=>{stopChild(child);reject(Error('Proof job timed out'));},timeout);
    child.stdout.on('data',b=>{out+=b;if(out.length>33554432)stopChild(child);});
    child.stderr.on('data',b=>{err=(err+b).slice(-65536);});
    child.on('error',e=>{activeChildren.delete(child);clearTimeout(timer);reject(e);});
    child.on('close',(code,signal)=>{activeChildren.delete(child);clearTimeout(timer);if(code===0)resolve(out);else reject(Error(`${path.basename(command)} failed (${signal??code}): ${err||out}`));});
  });
}
async function main(input){
  if(!['check','register','prove'].includes(input.action))throw Error('Expected action check, register or prove');
  const manifest=await readJson(path.join(root,'manifest.json'));
  if(input.profileId && input.profileId.toLowerCase()!==manifest.profileId)throw Error('Unsupported proof profile');
  if(input.targetDeclaration && input.targetDeclaration!==manifest.goalDeclaration)throw Error('This profile checks only the canonical Oncm.goal declaration');
  const runtime=await readJson(path.join(root,'runtime.local.json'));
  let source=input.source;
  if(input.fixtureId){
    const fixture=(await readJson(path.join(root,'fixtures.json'))).find(f=>f.id===input.fixtureId);
    if(!fixture)throw Error('Unknown fixtureId');
    if(!source)source=fixture.source;
  }
  if(typeof source!=='string'||Buffer.byteLength(source)>524288)throw Error('Provide Lean source (maximum 512 KiB)');
  const job=path.join(root,'.jobs',randomUUID());await fs.mkdir(job,{recursive:true});
  const sourcePath=path.join(job,'OncmInput.lean');await fs.writeFile(sourcePath,source);
  const toolEnv={PATH:path.dirname(runtime.lean)+':/usr/bin:/bin',LEAN_PATH:job,LEAN_NUM_THREADS:'2'};
  const leanOptions={cwd:job,env:toolEnv,timeout:120000,isolation:[path.resolve(runtime.lean,'../..'),path.dirname(runtime.exporter)]};
  // Lean compiles the supplied source; NanoDa below checks the exported terms
  // independently. In particular Lean accepting `sorry` never implies a pass.
  const diagnostics=await run(runtime.lean,['-j','2','-o',path.join(job,'OncmInput.olean'),sourcePath],leanOptions);
  const outcome=input.action==='register'?0:Number(input.outcome??1);
  if(input.action!=='register' && ![1,2].includes(outcome))throw Error('Outcome must be 1 (proof) or 2 (refutation)');
  const constants=manifest.foundationConstants;
  const roots=[...constants,'Oncm.goal',...(outcome===0?[]:['Oncm.solution'])];
  const exported=Buffer.from(await run(runtime.exporter,['OncmInput','--',...roots],leanOptions));
  // Preserve the original canonical bytes; match structural name records only.
  const goal=goalPrefix(exported,{registration:outcome===0});
  const goalHash=digest(goal);
  if(input.goalHash && input.goalHash.toLowerCase()!==goalHash)throw Error('Supplied source does not match registered goalHash');
  const goalPath=path.join(job,'goal.ndjson');await fs.writeFile(goalPath,goal);
  const exportPath=outcome===0?goalPath:path.join(job,'proof.ndjson');
  if(outcome!==0)await fs.writeFile(exportPath,exported);
  const native=path.join(root,'bin','check-native');
  // This unchanged checker verifies the goal prefix for every outcome, then the
  // full proof/refutation when present; a separate goal invocation is redundant.
  await run(native,[exportPath,String(goal.length),String(outcome)]);
  const result={status:'checked',diagnostics,goalHash,profileId:manifest.profileId,sourceHash:digest(Buffer.from(source)),exportHash:digest(exported),targetDeclaration:manifest.goalDeclaration,jobId:path.basename(job)};
  if(input.action==='check')return result;
  const cache=path.join(root,'.cache',manifest.imageId.slice(2),manifest.profileId.slice(2),digest(exported).slice(2)+'-'+outcome);
  await fs.mkdir(cache,{recursive:true});
  const receipt=path.join(cache,'groth16.receipt');
  const host=path.join(root,'bin','oncm-proof-host'),binary=path.join(root,'lean-checker.bin');
  const proofEnv={...runtime.env,RISC0_SERVER_PATH:runtime.r0vm,RISC0_PROVER:'ipc',RAYON_NUM_THREADS:'2',GOMAXPROCS:'2',PATH:[...(runtime.groth16?[path.join(root,'native-adapter')]:[]),path.dirname(runtime.r0vm),process.env.PATH].join(path.delimiter),ONCM_NATIVE_GROTH16_CONFIG:path.join(root,'runtime.local.json')};
  let inspected;
  try{await fs.access(receipt);}catch{
    const policy=await readJson(path.join(root,'execution-policy.local.json')).catch(()=>({allowExpensiveProving:false}));
    if(policy.allowExpensiveProving!==true)throw Error('Local certificate generation is paused after excessive memory use. Lean checks remain available. Resource-limited proving is being prepared; no certificate was generated.');
    const succinct=path.join(cache,'succinct.receipt');
    try{await fs.access(succinct);}catch{
      await run(host,['succinct',binary,exportPath,String(goal.length),String(outcome),succinct],{env:proofEnv});
    }
    await run(host,['compress',binary,succinct,receipt],{env:proofEnv});
  }
  // Cached receipts are cryptographically reverified against this exact image.
  inspected=JSON.parse(await run(host,['inspect',binary,receipt],{env:proofEnv}));
  const journal=Buffer.from(inspected.journal,'hex');
  if(journal.length!==128||'0x'+journal.subarray(32,64).toString('hex')!==goalHash||journal[127]!==outcome)throw Error('Receipt journal mismatch');
  result.status='proved';result.certificate=certificate(inspected.seal,inspected.journal);result.journal='0x'+inspected.journal;result.imageId=inspected.imageId;result.receiptPath=receipt;
  if(input.action==='register')result.registrationCertificate=result.certificate;
  return result;
}
try{
  let raw='';for await(const b of process.stdin){raw+=b;if(raw.length>1048576)throw Error('Request too large');}
  console.log(JSON.stringify(await main(JSON.parse(raw))));
}catch(e){console.log(JSON.stringify({status:'failed',diagnostics:e.message}));process.exitCode=1;}
