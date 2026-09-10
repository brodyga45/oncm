// Local test-clock fixture only. Financial/governance actions remain in the UI.
// This file was prepared without executing any clock RPC.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Contract,JsonRpcProvider,sha256} from 'ethers';
import {assertLocalConfig} from '../sdk/local-endpoints.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fileURLToPath(import.meta.url),collector=path.join(root,'scripts/capture-monetary-snapshot.mjs');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const digest=p=>sha256(fs.readFileSync(p));
const writeNew=(p,value)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n',{flag:'wx'});};
const writeJournal=(p,value)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const evidencePath=value=>{const p=path.resolve(root,value);assert.ok(p.startsWith(path.join(root,'evidence')+path.sep),'Use an output path inside this Vault evidence directory');return p;};
const args=process.argv.slice(2),isPrepare=args[0]==='--prepare',isExecute=args[0]==='--execute';
if(!(isPrepare&&args.length===6&&args[2]==='--programs'&&args[4]==='--out')&&!(isExecute&&args.length===2))
  throw Error('Prepare: node --max-old-space-size=128 scripts/monetary-test-clock.mjs --prepare start|end|claimDeadline --programs 0,1,2 --out evidence/monetary-policy/clock-start\nExecute: node --max-old-space-size=128 scripts/monetary-test-clock.mjs --execute evidence/monetary-policy/clock-start.plan.json');
const configPath=path.join(root,'.state/deployment-v2.json'),config=read(configPath),instance=read(path.join(root,'.state/chain-instance.json'));
assertLocalConfig(config);assert.equal(config.protocolVersion,'2');assert.equal(config.monetaryPolicy?.status,'deployed');assert.equal(config.chainInstance.id,instance.id);assert.equal(instance.chainId,31373);
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1}),originalSend=provider.send.bind(provider),rpcCounts={};
const allowed=new Set(['eth_chainId','eth_getBlockByNumber','eth_call']);
let verifiedReadBlock=null;
if(isExecute){allowed.add('evm_increaseTime');allowed.add('evm_mine');}
provider.send=async(method,params)=>{assert.ok(allowed.has(method),'Clock fixture refuses RPC method: '+method);if(method==='eth_call')assert.equal(BigInt(params[1]),BigInt(verifiedReadBlock),'Program reads require the verified block');rpcCounts[method]=(rpcCounts[method]??0)+1;return originalSend(method,params);};
function capture(block,file){
  const result=spawnSync(process.execPath,['--max-old-space-size=128',collector,'--block',String(block),'--out',file],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:256*1024});
  if(result.error||result.status!==0)throw Error('Read-only snapshot collector failed: '+(result.error?.message??result.stderr?.slice(-4096)??result.status));
  return read(file);
}
function rawState(s){
  // claimable and activity flags derive from time; they are expected to change.
  const programs=s.rewards.programs.map(({earningActive,claimWindowActive,accounts,...p})=>({...p,accounts:Object.fromEntries(Object.entries(accounts).map(([address,{claimable,...stored}])=>[address,stored]))}));
  return{addresses:s.addresses,participants:s.participants,holders:s.holders,assets:s.assets,warehouseCredits:s.warehouseCredits,membership:s.membership,statement:s.statement,
    pool:{address:s.pool.address,runtimeHash:s.pool.runtimeHash,tokens:s.pool.tokens,tokenInfo:s.pool.tokenInfo,normalizedWeights:s.pool.normalizedWeights,rawBalances:s.pool.rawBalances,lastBalancesLiveScaled18:s.pool.lastBalancesLiveScaled18,roles:s.pool.roles,bptZeroBalance:s.pool.bptZeroBalance},
    hook:s.hook,rewards:{...s.rewards,programs},fees:s.fees,allocation:s.allocation,codeChecks:s.identity.codeChecks};
}
function timeDerived(s){return s.rewards.programs.map(p=>({id:p.id,earningActive:p.earningActive,claimWindowActive:p.claimWindowActive,claimable:Object.fromEntries(Object.entries(p.accounts).map(([address,a])=>[address,a.claimable]))}));}
let journal=null,intentFile=null;
try{
  assert.equal((await provider.getNetwork()).chainId,31373n);
  const genesis=await provider.getBlock(0);assert.equal(genesis.timestamp,instance.genesisTimestamp,'Chain genesis differs');
  if(isPrepare){
    const phase=args[1];assert.ok(['start','end','claimDeadline'].includes(phase),'Unknown program boundary');
    assert.match(args[3],/^(0|[1-9][0-9]*)(,(0|[1-9][0-9]*)){0,19}$/,'Specify1–20 exact program IDs');
    const ids=args[3].split(',');assert.equal(new Set(ids).size,ids.length,'Duplicate program IDs');
    const prefix=evidencePath(args[5]);for(const suffix of['.plan.json','.before.json','.intent.json','.after.json','.result.json'])assert.ok(!fs.existsSync(prefix+suffix),'Use a fresh clock evidence prefix');
    const base=await provider.getBlock('latest'),before=capture(base.number,prefix+'.before.json');assert.equal(before.block.hash,base.hash);
    const programs=ids.map(id=>{const p=before.rewards.programs.find(p=>p.id===id);assert.ok(p,'Unknown actual program '+id);assert.equal(p.closed,false,'Program already closed: '+id);return p;});
    const target=programs.reduce((n,p)=>BigInt(p[phase])>n?BigInt(p[phase]):n,0n);
    const delta=target-BigInt(base.timestamp);assert.ok(delta>0n,'Boundary already reached: no positive clock delta; no clock RPC performed');assert.ok(delta<=BigInt(Number.MAX_SAFE_INTEGER),'Clock delta cannot be transported exactly');
    if(phase==='start')assert.ok(programs.every(p=>target<BigInt(p.end)),'No common earning window for the selected programs');
    if(phase==='end')assert.ok(programs.every(p=>target<BigInt(p.claimDeadline)),'No common claim window for the selected programs');
    const current=await provider.getBlock('latest');assert.equal(current.hash,base.hash,'Chain advanced during preparation; prepare a fresh plan');
    const plan={format:'vault-v2-program-clock-plan-v1',mode:'test-clock setup; not browser financial action',chainId:31373,chainInstance:instance.id,rpcUrl:config.rpcUrl,protocolVersion:'2',registry:config.addresses.StatementRegistry,rewards:config.addresses.RewardBudget,
      phase,programIds:ids,programs:programs.map(p=>({id:p.id,meter:p.meter,start:p.start,end:p.end,claimDeadline:p.claimDeadline,budget:p.budget,remainderRecipient:p.remainderRecipient})),
      before:before.block,targetTimestamp:String(target),targetUTC:new Date(Number(target)*1000).toISOString(),positiveDeltaSeconds:String(delta),beforeSnapshot:path.relative(root,prefix+'.before.json'),beforeSnapshotSha256:digest(prefix+'.before.json'),
      descriptorSha256:digest(configPath),collectorSha256:digest(collector),utilitySha256:digest(source),clockCalls:[{method:'evm_increaseTime',params:[Number(delta)]},{method:'evm_mine',params:[]}],
      exactTargetEqualityRequired:false,guard:'Execution requires unchanged head and pins. No votes, balances, impersonation, reset, financial call or blocked legacy action is performed.'};
    writeNew(prefix+'.plan.json',plan);console.log(JSON.stringify({status:'prepared-only',planFile:path.relative(root,prefix+'.plan.json'),...plan},null,2));
  }else{
    const planFile=evidencePath(args[1]);assert.ok(planFile.endsWith('.plan.json'),'Use the exact prepared .plan.json');const prefix=planFile.slice(0,-10),plan=read(planFile);
    for(const suffix of['.intent.json','.after.json','.result.json'])assert.ok(!fs.existsSync(prefix+suffix),'Prior execution evidence exists: no retry; inspect receipt/clock journal manually');
    assert.equal(plan.format,'vault-v2-program-clock-plan-v1');assert.equal(plan.chainId,31373);assert.equal(plan.chainInstance,instance.id);assert.equal(plan.rpcUrl,config.rpcUrl);assert.equal(plan.registry,config.addresses.StatementRegistry);assert.equal(plan.rewards,config.addresses.RewardBudget);
    assert.equal(plan.descriptorSha256,digest(configPath),'Descriptor changed');assert.equal(plan.collectorSha256,digest(collector),'Collector changed');assert.equal(plan.utilitySha256,digest(source),'Utility changed');
    const beforeFile=evidencePath(plan.beforeSnapshot);assert.equal(beforeFile,prefix+'.before.json');assert.equal(digest(beforeFile),plan.beforeSnapshotSha256,'Before snapshot changed');const before=read(beforeFile);
    assert.deepEqual(plan.before,before.block);assert.equal(before.chainInstance,instance.id);
    const current=await provider.getBlock('latest'),target=BigInt(plan.targetTimestamp);
    if(BigInt(current.timestamp)>=target){
      const result={format:'vault-v2-program-clock-result-v1',status:'not-executed',reason:'Target already reached; no clock RPC and no negative/zero delta',currentBlock:{number:current.number,hash:current.hash,timestamp:current.timestamp},planSha256:digest(planFile),rpcCounts};
      writeNew(prefix+'.result.json',result);console.log(JSON.stringify(result,null,2));
    }else{
      assert.equal(current.hash,plan.before.hash,'Chain head changed; prepare a new plan before executing');assert.equal(current.number,plan.before.number);
      assert.ok(['start','end','claimDeadline'].includes(plan.phase));assert.ok(Array.isArray(plan.programIds)&&plan.programIds.length>0&&plan.programIds.length<=20);
      const selected=plan.programIds.map(id=>{const p=before.rewards.programs.find(p=>p.id===id);assert.ok(p);assert.equal(p.closed,false);return p;});
      assert.equal(new Set(plan.programIds).size,selected.length);
      assert.deepEqual(plan.programs,selected.map(p=>({id:p.id,meter:p.meter,start:p.start,end:p.end,claimDeadline:p.claimDeadline,budget:p.budget,remainderRecipient:p.remainderRecipient})));
      verifiedReadBlock=current.number;
      const actualBudget=new Contract(config.addresses.RewardBudget,['function programs(uint256) view returns(address meter,uint64 start,uint64 end,uint64 claimDeadline,address remainderRecipient,uint256 budget,uint256 paid,uint256 reclaimed,uint256 totalWeight,bool closed)'],provider);
      for(const p of selected){const actual=await actualBudget.programs(p.id,{blockTag:current.number});for(const key of['meter','start','end','claimDeadline','remainderRecipient','budget','paid','reclaimed','totalWeight'])assert.equal(String(actual[key]),String(p[key]),'Actual program differs: '+p.id+'/'+key);assert.equal(actual.closed,false);}
      assert.equal(target,selected.reduce((n,p)=>BigInt(p[plan.phase])>n?BigInt(p[plan.phase]):n,0n),'Target must be the actual selected program boundary');
      const delta=target-BigInt(current.timestamp);assert.ok(delta>0n&&delta<=BigInt(Number.MAX_SAFE_INTEGER));assert.equal(String(delta),plan.positiveDeltaSeconds);
      if(plan.phase==='start')assert.ok(selected.every(p=>target<BigInt(p.end)));if(plan.phase==='end')assert.ok(selected.every(p=>target<BigInt(p.claimDeadline)));
      assert.deepEqual(plan.clockCalls,[{method:'evm_increaseTime',params:[Number(delta)]},{method:'evm_mine',params:[]}]);
      intentFile=prefix+'.intent.json';journal={format:'vault-v2-program-clock-intent-v1',planSha256:digest(planFile),before:before.block,phase:plan.phase,targetTimestamp:String(target),positiveDeltaSeconds:String(delta),operations:[],state:'started; never automatically resume'};writeNew(intentFile,journal);
      for(const call of plan.clockCalls){const op={...call,status:'request-started'};journal.operations.push(op);writeJournal(intentFile,journal);op.result=await provider.send(call.method,call.params);op.status='response-received';writeJournal(intentFile,journal);}
      const actual=await provider.getBlock('latest'),after=capture(actual.number,prefix+'.after.json');assert.equal(after.block.hash,actual.hash);
      const oldRaw=rawState(before),newRaw=rawState(after),changedStorageSections=Object.keys(oldRaw).filter(k=>!isDeepStrictEqual(oldRaw[k],newRaw[k]));
      const phaseWindowOkay=plan.phase==='start'?selected.every(p=>BigInt(actual.timestamp)<BigInt(p.end)):plan.phase==='end'?selected.every(p=>BigInt(actual.timestamp)<BigInt(p.claimDeadline)):true;
      const okay=actual.number===before.block.number+1&&actual.transactions.length===0&&BigInt(actual.timestamp)>=target&&phaseWindowOkay&&changedStorageSections.length===0;
      const result={format:'vault-v2-program-clock-result-v1',status:okay?'clock-only transition verified':'comparison-failed; manual inspection required',mode:'test-clock setup, not browser financial action',planSha256:digest(planFile),before:before.block,after:after.block,
        requestedTarget:String(target),actualTimestampDelta:String(BigInt(actual.timestamp)-BigInt(before.block.timestamp)),targetReached:BigInt(actual.timestamp)>=target,phaseWindowOkay,onlyOneEmptyBlock:actual.number===before.block.number+1&&actual.transactions.length===0,
        rawStateUnchanged:changedStorageSections.length===0,changedStorageSections,timeDerivedBefore:timeDerived(before),timeDerivedAfter:timeDerived(after),beforeSnapshot:plan.beforeSnapshot,afterSnapshot:path.relative(root,prefix+'.after.json'),afterSnapshotSha256:digest(prefix+'.after.json'),rpcCounts};
      writeNew(prefix+'.result.json',result);journal.state=okay?'completed':'comparison failed; no retry';writeJournal(intentFile,journal);console.log(JSON.stringify(result,null,2));if(!okay)process.exitCode=1;
    }
  }
}catch(e){
  if(journal&&intentFile){journal.state='error or uncertain RPC result; no automatic retry';journal.error=String(e.message);writeJournal(intentFile,journal);}
  throw e;
}finally{provider.destroy();}
