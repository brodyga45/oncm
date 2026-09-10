// File-only audit of the recorded Vault V2 browser cycle. No provider, signer or RPC.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {AbiCoder, Interface, getBytes, keccak256, sha256, ZeroAddress} from 'ethers';
const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'../../..');
const base='evidence/monetary-policy/', inputs={}, checks=[];
function read(relative){const bytes=fs.readFileSync(path.join(root,relative));inputs[relative]={sha256:sha256(bytes),bytes:bytes.length};return JSON.parse(bytes);}
function eq(actual,expected,why){assert.deepEqual(actual,expected,why);checks.push(why);}
function ok(value,why){assert.ok(value,why);checks.push(why);}
const lc=x=>x.toLowerCase(), same=(a,b)=>lc(a)===lc(b), sum=xs=>xs.reduce((a,b)=>a+BigInt(b),0n);
const get=(o,k)=>o[Object.keys(o).find(a=>same(a,k))];
const j=read(base+'settlement-actions-528-552.json'), earning=read(base+'earning-actions-508-527.json');
const before=read(j.snapshots.before.path), after=read(j.snapshots.after.path), resolution=read(base+'resolution-533.json');
const artifact=read('external-proofs/perf05/true-proof.json');
for(const [which,s] of [['before',before],['after',after]]){
 eq(inputs[j.snapshots[which].path].sha256.slice(2),j.snapshots[which].sha256,which+' snapshot SHA256');
 eq(s.block,j.snapshots[which].block,which+' exact numbered block');
 eq(s.chainId,31373,which+' chain31373');eq(s.chainInstance,'554c825d-6813-43bf-9bf0-6ede06acff4d',which+' instance');eq(s.protocolVersion,'2',which+' version');
}
eq(before.block.number,527,'before block527');eq(after.block.number,552,'final block552');
eq(before.addresses,after.addresses,'contract graph unchanged');eq(before.identity.codeChecks,after.identity.codeChecks,'recorded runtime checks unchanged');
eq(before.allocation,after.allocation,'beneficiary epoch and shares unchanged');
eq(before.pool.address,'0x75ba1e7c0AC567f3451D2646f1db5eAbc99d07f7','fixed observed pool');
eq(before.statement.id,'0x390403d03c5e8c37534c14ee5b1a56b9004da93d40a171ee9ba7ae8d62bbfd08','fixed statement');
const A=before.addresses, Alice='0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',Bob='0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const asset=(s,label)=>s.assets.find(a=>a.label===label), balance=(s,label,owner)=>BigInt(get(asset(s,label).balances,owner));
const txs=j.actions.flatMap(a=>a.transactions.map(t=>({...t,block:a.block}))), earnTx=earning.actions.flatMap(a=>a.transactions.map(t=>({...t,block:a.block})));
eq(txs.length,23,'23 actual successful financial transactions');eq(txs.filter(t=>t.status===1).length,23,'all receipts status1');
eq(txs.flatMap(t=>t.logs).length,78,'78 actual logs');eq(new Set(txs.map(t=>t.hash)).size,23,'unique transactions');
eq(txs.map(t=>t.block.number),Array.from({length:25},(_,i)=>528+i).filter(n=>n!==532&&n!==549),'only clock blocks532/549 omitted');
for(const t of txs)for(const l of t.logs)eq(l.transactionHash,t.hash,'raw log belongs to '+t.hash);
const at=n=>{const rows=txs.filter(t=>t.block.number===n);eq(rows.length,1,'one transaction at '+n);return rows[0];};
const abi=new Interface([
 'event Transfer(address indexed from,address indexed to,uint256 value)',
 'event RewardClaimed(uint256 indexed programId,address indexed account,uint256 weight,uint256 amount)',
 'event ProgramClosed(uint256 indexed programId,address indexed recipient,uint256 remainder)',
 'event Withdrawn(uint256 indexed programId,address indexed account,uint256 bptAmount)',
 'event Withdraw(address indexed owner,address indexed token,address indexed withdrawer,uint256 amount,uint256 reward)',
 'event LiquidityRemoved(address indexed pool,address indexed liquidityProvider,uint8 indexed kind,uint256 totalSupply,uint256[] amountsRemovedRaw,uint256[] swapFeeAmountsRaw)',
 'event Redeemed(address indexed user,bytes32 indexed statementId,uint256 yesAmount,uint256 noAmount,uint256 collateral)',
 'event PayoutRedemption(address indexed redeemer,address indexed collateralToken,bytes32 indexed parentCollectionId,bytes32 conditionId,uint256[] indexSets,uint256 payout)',
 'event ConditionResolution(bytes32 indexed conditionId,address indexed oracle,bytes32 indexed questionId,uint256 outcomeSlotCount,uint256[] payoutNumerators)',
 'event StatementResolved(bytes32 indexed statementId,uint8 outcome,uint64 resolvedAt,bytes32 evidenceHash,address indexed submitter)',
 'function claim(uint256 id)','function close(uint256 id)','function withdraw(uint256 id)',
 'function withdraw(address owner,address[] tokens,uint256[] amounts,address withdrawer)',
 'function submitProof(bytes32 id,uint8 outcome,bytes certificate)',
 'function redeem(bytes32 id,uint256 yesAmount,uint256 noAmount)',
 'function removeLiquidityProportional(address pool,uint256 exactBptAmountIn,uint256[] minAmountsOut,bool wethIsEth,bytes userData)'
]);
function events(t,emitter,name){return t.logs.filter(l=>same(l.address,emitter)&&l.topics[0]===abi.getEvent(name).topicHash).map(l=>({args:abi.parseLog(l).args,logIndex:l.index}));}
function one(t,emitter,name){const rows=events(t,emitter,name);eq(rows.length,1,name+' count at '+t.block.number);return rows[0].args;}
function call(t,target,name){eq(lc(t.to),lc(target),'target at '+t.block.number);const c=abi.parseTransaction({data:t.calldata});eq(c.name,name,'method at '+t.block.number);return c.args;}
function transfers(rows,token,from,to){return rows.flatMap(t=>events(t,token,'Transfer').map(e=>e.args)).filter(e=>(!from||same(e.from,from))&&(!to||same(e.to,to)));}
function moved(t,token,from,to,amount){eq(sum(transfers([t],token,from,to).map(e=>e.value)),BigInt(amount),'exact transfer at '+t.block.number+' '+token);}
// Account identities are normalized before comparing; each raw Transfer is counted once.
const balanceChanges=[];
for(const old of before.assets){const now=asset(after,old.label);eq(now.address,old.address,old.label+' asset identity');const tr=transfers(txs,old.address);
 for(const [owner,value] of Object.entries(old.balances)){const delta=sum(tr.filter(t=>same(t.to,owner)).map(t=>t.value))-sum(tr.filter(t=>same(t.from,owner)).map(t=>t.value));
  eq(BigInt(get(now.balances,owner))-BigInt(value),delta,old.label+' recorded balance delta '+owner);balanceChanges.push({asset:old.label,owner,before:value,after:get(now.balances,owner),delta:String(delta)});}
 eq(BigInt(now.totalSupply)-BigInt(old.totalSupply),sum(tr.filter(t=>same(t.from,ZeroAddress)).map(t=>t.value))-sum(tr.filter(t=>same(t.to,ZeroAddress)).map(t=>t.value)),old.label+' supply delta follows mint/burn logs');
}
for(const s of [before,after])eq(sum(Object.values(asset(s,'T').balances)),BigInt(asset(s,'T').totalSupply),'all captured T holdings conserve total supply at '+s.block.number);
eq(asset(after,'T').totalSupply,'1006000000000000000000','supply remains1006T');
eq(transfers(txs,A.TrueToken,ZeroAddress).length,0,'no T mint during settlement');
const claims=[];
for(const [block,id,owner] of [[534,0,Alice],[535,1,Alice],[537,0,Bob],[538,1,Bob]]){
 const t=at(block),p=before.rewards.programs[id],f=after.rewards.programs[id],a=get(p.accounts,owner),e=one(t,A.RewardBudget,'RewardClaimed');
 eq(call(t,A.RewardBudget,'claim').id,BigInt(id),'claimed program');eq(lc(t.from),lc(owner),'claim caller owns weight');
 eq(e.programId,BigInt(id),'claim event program');eq(lc(e.account),lc(owner),'claim event recipient');eq(e.weight,BigInt(a.weight),'claim recorded weight');
 const amount=BigInt(p.budget)*BigInt(a.weight)/BigInt(p.totalWeight);eq(e.amount,amount,'floor budget*weight/totalWeight');
 ok(BigInt(t.block.timestamp)>=BigInt(p.end)&&BigInt(t.block.timestamp)<BigInt(p.claimDeadline),'claim within original window');
 moved(t,A.TrueToken,A.RewardBudget,owner,amount);eq(get(f.accounts,owner).claimed,true,'claim flag stored');
 claims.push({block,transaction:t.hash,programId:id,account:owner,weight:a.weight,amount:String(amount)});
}
eq(txs.flatMap(t=>events(t,A.RewardBudget,'RewardClaimed')).length,4,'exactly four claims; fee program unclaimed');
const claimedTotal=sum(claims.map(c=>c.amount));eq(claimedTotal,4999999999999999998n,'four payouts total5T minus2raw');
const closes=[];
for(const [block,id] of [[550,2],[551,0],[552,1]]){const t=at(block),p=before.rewards.programs[id],f=after.rewards.programs[id],e=one(t,A.RewardBudget,'ProgramClosed');
 eq(call(t,A.RewardBudget,'close').id,BigInt(id),'closed program');eq(e.programId,BigInt(id),'close event program');eq(lc(e.recipient),lc(p.remainderRecipient),'fixed voted remainder recipient');eq(lc(e.recipient),lc(A.Timelock),'recipient is actual Timelock');
 const paid=sum(claims.filter(c=>c.programId===id).map(c=>c.amount)),remainder=BigInt(p.budget)-paid;eq(e.remainder,remainder,'exact unpaid budget returned');
 ok(BigInt(t.block.timestamp)>=BigInt(p.claimDeadline),'close after original deadline');moved(t,A.TrueToken,A.RewardBudget,A.Timelock,remainder);
 eq(f.paid,String(paid),'final paid counter');eq(f.reclaimed,String(remainder),'final reclaimed counter');eq(f.closed,true,'final closed flag');
 for(const key of ['meter','start','end','claimDeadline','remainderRecipient','budget','totalWeight'])eq(f[key],p[key],'immutable program '+id+'/'+key);
 for(const [owner,a] of Object.entries(p.accounts)){eq(get(f.accounts,owner).weight,a.weight,'weight unchanged '+id+'/'+owner);eq(get(f.accounts,owner).lpDeposit,'0','no final LP deposit '+id+'/'+owner);if(id===2)eq(get(f.accounts,owner).claimed,false,'fee program remains unclaimed');}
 closes.push({block,transaction:t.hash,programId:id,recipient:e.recipient,amount:String(remainder)});
}
const closedTotal=sum(closes.map(c=>c.amount));eq(closedTotal,1000000000000000002n,'close total1T plus2raw');eq(claimedTotal+closedTotal,6000000000000000000n,'entire6T budget conserved');
for(const key of ['reserved','tokenBalance','unreserved','computedOutstandingBudget'])eq(after.rewards[key],'0','RewardBudget '+key+' zero');
eq(before.hook,after.hook,'hook weights and program bindings unchanged after earning');
const principal=[];
for(const [block,owner,amount,exitBlock] of [[536,Alice,1000000000000000000n,545],[539,Bob,100000000000000n,541]]){const t=at(block),e=one(t,A.BptLockMeter,'Withdrawn');
 eq(call(t,A.BptLockMeter,'withdraw').id,1n,'actual LP meter program1 withdrawal');eq(lc(t.from),lc(owner),'LP principal owner');eq(e.programId,1n,'LP event program');eq(lc(e.account),lc(owner),'LP event owner');eq(e.bptAmount,amount,'LP principal amount');moved(t,before.pool.address,A.BptLockMeter,owner,amount);
 ok(block>533&&block<exitBlock,'principal returned after resolution and before pool exit');ok(BigInt(t.block.timestamp)>=BigInt(before.rewards.programs[1].end),'principal returned after unlock');principal.push({block,account:owner,bptAmount:String(amount),exitBlock});}
eq(balance(after,'BPT',A.BptLockMeter),0n,'no remaining locked BPT custody');
const exits=[],redemptions=[];
for(const [block,owner] of [[541,Bob],[545,Alice]]){const t=at(block),c=call(t,A.Router,'removeLiquidityProportional'),e=one(t,A.Vault,'LiquidityRemoved');
 eq(lc(c.pool),lc(before.pool.address),'exit correct pool');eq(lc(e.pool),lc(c.pool),'exit event pool');eq(lc(e.liquidityProvider),lc(owner),'exit event owner');eq(e.kind,0n,'proportional exit');eq([...e.swapFeeAmountsRaw],[0n,0n],'no exit swap fees');
 for(let i=0;i<before.pool.tokens.length;i++){ok(e.amountsRemovedRaw[i]>=c.minAmountsOut[i],'exit respects exact min amount');moved(t,before.pool.tokens[i],A.Vault,owner,e.amountsRemovedRaw[i]);}
 eq(sum(transfers([t],before.pool.address,undefined,ZeroAddress).map(e=>e.value)),c.exactBptAmountIn,'exact BPT burned at exit');
 exits.push({block,account:owner,bptIn:String(c.exactBptAmountIn),tokens:before.pool.tokens,amounts:[...e.amountsRemovedRaw].map(String)});}
for(const [block,owner] of [[543,Bob],[548,Alice]]){const t=at(block),c=call(t,A.PositionRouter,'redeem'),e=one(t,A.PositionRouter,'Redeemed'),ctf=one(t,A.ConditionalTokens,'PayoutRedemption');
 eq(c.id,before.statement.id,'redemption statement');eq(e.statementId,c.id,'redemption event statement');eq(lc(e.user),lc(owner),'redemption owner');eq(e.yesAmount,c.yesAmount,'exact YES redeemed');eq(e.noAmount,c.noAmount,'exact NO redeemed');eq(e.collateral,c.yesAmount,'TRUE payout ignores losing NO');
 eq(ctf.conditionId,before.statement.conditionId,'original CTF condition');eq(ctf.payout,e.collateral,'original CTF payout');eq([...ctf.indexSets],[1n,2n],'original CTF outcome partition');
 moved(t,A.TrueToken,A.ConditionalTokens,A.PositionRouter,e.collateral);moved(t,A.TrueToken,A.PositionRouter,owner,e.collateral);moved(t,before.statement.yes,A.PositionRouter,ZeroAddress,c.yesAmount);
 if(c.noAmount>0n)moved(t,before.statement.no,A.PositionRouter,ZeroAddress,c.noAmount);
 redemptions.push({block,account:owner,yes:String(c.yesAmount),no:String(c.noAmount),T:String(e.collateral)});}
eq(redemptions[1].no,'30000000000000000000','Alice30 losing NO burned for0T');
for(const owner of [Alice,Bob])for(const label of ['YES','NO','BPT'])eq(balance(after,label,owner),0n,'final '+label+' zero for '+owner);
eq(asset(after,'BPT').totalSupply,'1000000','original Balancer permanent minimum BPT remains');
for(let i=0;i<before.pool.tokens.length;i++)eq(BigInt(before.pool.rawBalances[i])-sum(exits.map(e=>e.amounts[i])),BigInt(after.pool.rawBalances[i]),'reserves decline only by the two exits');
// Re-bind actual resolution calldata to genuine CI4. Crypto eth_call evidence is read, not rerun here.
const rt=at(533),rc=call(rt,A.StatementRegistry,'submitProof'),coder=AbiCoder.defaultAbiCoder();eq(rc.certificate,artifact.certificate,'actual transaction uses exact published CI4 certificate');eq(rc.id,before.statement.id,'proof statement');eq(rc.outcome,1n,'proof outcome TRUE');
eq(inputs['external-proofs/perf05/true-proof.json'].sha256,resolution.artifact.sha256,'CI4 artifact file SHA');eq(rt.hash,resolution.transaction.hash,'resolution report exact transaction');
const [seal,journal]=coder.decode(['bytes','bytes'],rc.certificate);eq(coder.encode(['bytes','bytes'],[seal,journal]),rc.certificate,'canonical certificate ABI');eq(getBytes(seal).length,260,'raw Groth16 EVM seal260bytes');eq(seal.slice(0,10),'0x73c457ba','original verifier selector');eq(journal,artifact.journal,'exact128byte journal');eq(getBytes(journal).length,128,'full journal length');
const [domain,goal,profile,outcome]=coder.decode(['bytes32','bytes32','bytes32','uint256'],journal);eq(domain,resolution.binding.domain,'journal domain');eq(goal,before.statement.goalHash,'journal exact goal');eq(profile,before.statement.profileId,'journal admitted profile');eq(outcome,1n,'journal TRUE');
const ce=one(rt,A.ConditionalTokens,'ConditionResolution'),re=one(rt,A.StatementRegistry,'StatementResolved');eq(ce.conditionId,before.statement.conditionId,'resolved CTF condition');eq(lc(ce.oracle),lc(A.StatementRegistry),'CTF oracle registry');eq(ce.questionId,before.statement.id,'CTF question');eq([...ce.payoutNumerators],[1n,0n],'actual CTF payout[1,0]');eq(re.evidenceHash,keccak256(rc.certificate),'actual evidenceHash');eq(re.resolvedAt,BigInt(rt.block.timestamp),'resolvedAt exact receipt block');eq(after.statement.outcome,'1','stored outcome TRUE');eq(after.statement.resolvedAt,String(re.resolvedAt),'stored resolution time');
for(const key of ['originalAccepted','exactBridgeAccepted','changedJournalRejected','wrongOutcomeRejected','wrongGoalRejected'])eq(resolution.cryptographicReadback[key],true,'recorded historical crypto readback: '+key);
// Fee income is the original allocation share, separate from the RewardBudget remainder.
const treasuryFees=[];
for(const [block,label,distributionBlock] of [[530,'T',515],[531,'YES',516]]){const t=at(block),token=asset(before,label).address,e=one(t,A.SplitsWarehouse,'Withdraw'),c=call(t,A.SplitsWarehouse,'withdraw');
 eq(lc(c.owner),lc(A.Timelock),'Warehouse owner is Timelock');eq(lc(c.withdrawer),lc(A.Timelock),'Warehouse destination is Timelock');eq(c.tokens.map(lc),[lc(token)],'exact claimed token');eq([...c.amounts],[e.amount],'explicit whole-credit amount');eq(e.reward,0n,'no withdrawal reward diverted');
 eq(lc(e.owner),lc(A.Timelock),'fee owner actual DAO');eq(lc(e.withdrawer),lc(A.Timelock),'fee recipient actual DAO');eq(e.amount,BigInt(get(get(before.warehouseCredits,A.Timelock),token)),'claim actual previously earned credit');moved(t,token,A.SplitsWarehouse,A.Timelock,e.amount);
 const collect=earnTx.find(t=>t.block.number===514),distribution=earnTx.find(t=>t.block.number===distributionBlock),flows=transfers([collect],token,A.ProtocolFeeController,before.allocation.split);eq(flows.length,2,'both protocol and creator flows into exact Split');
 const collected=sum(flows.map(e=>e.value)),distributed=sum(transfers([distribution],token,before.allocation.split,A.SplitsWarehouse).map(e=>e.value));eq(distributed,collected-1n,'upstream Split sentinel1raw');
 eq(get(Object.fromEntries(before.allocation.recipients.map((a,i)=>[a,before.allocation.weights[i]])),A.Timelock),'1500','actual DAO allocation15%');eq(e.amount,distributed*1500n/10000n,'DAO only floor15% of distributable fees');
 eq(get(get(after.warehouseCredits,A.Timelock),token),'0','entire DAO credit withdrawn, no assumed claim dust');
 treasuryFees.push({block,token,label,collected:String(collected),distributed:String(distributed),amount:String(e.amount),warehouseRemaining:'0'});}
eq(balance(after,'T',A.Timelock)-balance(before,'T',A.Timelock),BigInt(treasuryFees[0].amount)+closedTotal,'DAO T =15%fee income plus separate reward close');eq(balance(after,'YES',A.Timelock)-balance(before,'YES',A.Timelock),BigInt(treasuryFees[1].amount),'DAO YES only15%fee income');
eq(after.fees,before.fees,'remaining fees unchanged through settlement');const pending=after.fees.assets.find(f=>same(f.token,A.TrueToken));eq(pending.aggregateSwap,'6500000000000','0.0000065T remains uncollected');eq(BigInt(pending.pendingCreator)+BigInt(pending.pendingProtocol),6500000000000n,'pending creator+protocol accounting');
eq(balance(after,'T',A.Vault),BigInt(after.pool.rawBalances[before.pool.tokens.findIndex(t=>same(t,A.TrueToken))])+BigInt(pending.aggregateSwap),'Vault T =minimum LP reserve plus pending fees');
eq(balance(after,'T',A.ConditionalTokens),BigInt(asset(after,'YES').totalSupply),'remaining TRUE collateral backs all unredeemed YES');
// The two clock fixtures changed only time-derived views. No financial pass is attributed to them.
const clocks=[];
for(const stem of ['clock-end-531','clock-close-548']){const report=read(base+stem+'.result.json'),b=read(report.beforeSnapshot),a=read(report.afterSnapshot);eq(report.onlyOneEmptyBlock,true,stem+' recorded empty block');eq(inputs[report.afterSnapshot].sha256,report.afterSnapshotSha256,stem+' snapshot SHA');
 for(const field of ['addresses','assets','warehouseCredits','membership','statement','hook','fees','allocation'])eq(a[field],b[field],stem+' unchanged '+field);
 const stored=s=>({...s.rewards,programs:s.rewards.programs.map(({earningActive,claimWindowActive,accounts,...p})=>({...p,accounts:Object.fromEntries(Object.entries(accounts).map(([who,{claimable,...v}])=>[who,v]))}))});eq(stored(a),stored(b),stem+' unchanged raw reward state');
 eq(a.block.number,b.block.number+1,stem+' single block');ok(a.block.timestamp>b.block.timestamp,stem+' forward time');clocks.push({before:b.block,after:a.block,mode:report.mode});}
const result={format:'vault-v2-final-file-only-economic-assertions-v1',status:'PASS',checks:checks.length,chainId:31373,chainInstance:before.chainInstance,before:before.block,after:after.block,inputs,scriptSha256:sha256(fs.readFileSync(fileURLToPath(import.meta.url))),
 claims,claimedTotal:String(claimedTotal),closes,closedTotal:String(closedTotal),principal,exits,redemptions,treasuryFees,treasuryFinal:{T:String(balance(after,'T',A.Timelock)),YES:String(balance(after,'YES',A.Timelock))},
 rewardsFinal:after.rewards,pendingFees:pending,remainingPoolReserves:{tokens:after.pool.tokens,raw:after.pool.rawBalances},remainingCTFCollateral:String(balance(after,'T',A.ConditionalTokens)),balanceChanges,clocks,
 scope:'Offline comparison of captured RPC snapshots and raw receipts, independently decoded with emitter-bound minimal ABIs. Rechecks exact CI4 calldata/journal and consumes the separately recorded original/bridge historical cryptographic readback. Does not rerun RPC, prove, submit, mine, infer browser clicks from logs, or claim source-to-goal semantic validation.'};
const text=JSON.stringify(result,null,2)+'\n';
if(process.argv.length>2){assert.deepEqual(process.argv.slice(2),['--write'],'Only optional --write to the sibling result.json is supported');fs.writeFileSync(path.join(here,'result.json'),text);}
console.log(JSON.stringify({status:result.status,checks:result.checks,claimedTotal:result.claimedTotal,closedTotal:result.closedTotal,treasuryFinal:result.treasuryFinal,pendingT:pending.aggregateSwap,wrote:process.argv.includes('--write')}));
