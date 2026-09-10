import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Contract,Interface,JsonRpcProvider,keccak256,toUtf8Bytes} from 'ethers';
import {MONETARY_ABI} from '../../../sdk/monetary-policy.mjs';
const d=JSON.parse(fs.readFileSync('.state/deployment-v2.json')),abis=JSON.parse(fs.readFileSync('.state/abis-v2.json'));
const provider=new JsonRpcProvider(d.rpcUrl,undefined,{cacheTimeout:-1}),a=d.addresses;
const erc=['function totalSupply() view returns(uint256)','function balanceOf(address) view returns(uint256)'];
const t=new Contract(a.TrueToken,erc,provider),budget=new Contract(a.RewardBudget,abis.RewardBudget,provider),gov=new Contract(a.Governor,abis.VaultGovernor,provider);
const pool='0x75ba1e7c0AC567f3451D2646f1db5eAbc99d07f7',hook='0x32e0cbE412b5bF260A6337395CBB9AC7a1a3ccA0',lp=d.monetaryPolicy.meters.find(m=>m.kind==='lp').address;
const actors=['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266','0x70997970C51812dc3A010C7d01b50e0d17dc79C8','0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC','0x90F79bf6EB2c4f870365E785982E1f101E93b906'];
const finalBlock=506,baseline=425,stages=[{id:0,budget:'3',meter:hook,metric:0,proposal:426,votes:[429,430],queue:441,execute:452},{id:1,budget:'2',meter:lp,proposal:453,votes:[456,457],queue:468,execute:479},{id:2,budget:'1',meter:hook,metric:1,proposal:480,votes:[483,484],queue:495,execute:506}];
const interfaces={governor:new Interface(abis.VaultGovernor),timelock:new Interface(abis.TimelockController),budget:new Interface(abis.RewardBudget),token:new Interface(abis.TrueToken),hook:new Interface(abis.IncentiveFinalityHook),lp:new Interface(abis.BptLockMeter)};
const json=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
async function receiptAt(n){const b=await provider.getBlock(n,true);assert.equal(b.transactions.length,1);const tx=b.prefetchedTransactions[0],r=await provider.getTransactionReceipt(tx.hash);assert.equal(r.status,1);const events=[];for(const log of r.logs)for(const[name,i]of Object.entries(interfaces)){try{const p=i.parseLog(log);if(p){events.push({contract:name,address:log.address,name:p.name,args:[...p.args]});break;}}catch{}}return json({block:n,blockHash:b.hash,timestamp:b.timestamp,hash:r.hash,from:tx.from,to:tx.to,input:tx.data,status:r.status,gasUsed:r.gasUsed,events});}
async function state(n){const at={blockTag:n};return json({block:n,blockHash:(await provider.getBlock(n)).hash,timestamp:(await provider.getBlock(n)).timestamp,totalSupply:await t.totalSupply(at),programCount:await budget.programCount(at),reserved:await budget.reserved(at),rewardBalance:await t.balanceOf(a.RewardBudget,at)});}
try{
 const before=await state(baseline),after=await state(finalBlock);assert.equal(before.programCount,'0');assert.equal(before.totalSupply,'1000000000000000000000');assert.equal(after.programCount,'3');assert.equal(after.totalSupply,'1006000000000000000000');assert.equal(after.reserved,'6000000000000000000');assert.equal(after.rewardBalance,after.reserved);
 const results=[];
 for(const s of stages){
  const records=[];for(const n of[s.proposal,...s.votes,s.queue,s.execute])records.push(await receiptAt(n));
  const created=records[0].events.find(e=>e.name==='ProposalCreated'),proposalId=created.args[0],targets=created.args[2],values=created.args[3],calldatas=created.args[5],description=created.args[8];
  assert.deepEqual(targets.map(v=>v.toLowerCase()),[a.TrueToken,a.RewardBudget,s.meter].map(v=>v.toLowerCase()));assert.deepEqual(values,['0','0','0']);
  const mint=[...new Interface(MONETARY_ABI.token).decodeFunctionData('mint',calldatas[0])],program=[...new Interface(MONETARY_ABI.rewards).decodeFunctionData('createProgram',calldatas[1])],configure=[...new Interface(s.id===1?MONETARY_ABI.lp:MONETARY_ABI.meter).decodeFunctionData('configureProgram',calldatas[2])];
  assert.equal(mint[0],a.RewardBudget);assert.equal(mint[1],BigInt(s.budget)*10n**18n);assert.equal(program[0],BigInt(s.id));assert.equal(program[1],s.meter);assert.equal(program[2],1789050027n);assert.equal(program[3],1789050927n);assert.equal(program[4],1789051827n);assert.equal(program[5],mint[1]);assert.equal(program[6],a.Timelock);assert.equal(configure[0],BigInt(s.id));assert.equal(configure[1],pool);if(s.metric!==undefined)assert.equal(configure[2],BigInt(s.metric));
  assert.equal(await gov.hashProposal(targets,values,calldatas,keccak256(toUtf8Bytes(description))),BigInt(proposalId));assert.equal(await gov.state(proposalId,{blockTag:finalBlock}),7n);
  assert.equal(records[1].from.toLowerCase(),actors[0].toLowerCase());assert.equal(records[2].from.toLowerCase(),actors[1].toLowerCase());assert.equal(records[1].events.find(e=>e.name==='VoteCast').args[2],'1');assert.equal(records[2].events.find(e=>e.name==='VoteCast').args[2],'1');
  const p=[...await budget.programs(s.id,{blockTag:finalBlock})];assert.equal(p[0],s.meter);assert.equal(p[5],mint[1]);assert.equal(p[6],0n);assert.equal(p[7],0n);assert.equal(p[8],0n);assert.equal(p[9],false);
  for(const who of actors){assert.equal(await budget.weights(s.id,who,{blockTag:finalBlock}),0n);assert.equal(await budget.claimed(s.id,who,{blockTag:finalBlock}),false);}
  const binding=s.id===1?await new Contract(lp,abis.BptLockMeter,provider).programPool(s.id,{blockTag:finalBlock}):[...await new Contract(hook,abis.IncentiveFinalityHook,provider).programBinding(s.id,{blockTag:finalBlock})];
  results.push(json({...s,proposalId,description,targets,values,calldatas,decoded:{mint,createProgram:program,configure},records,actualProgram:p,binding,afterExecute:await state(s.execute)}));
 }
 const tokens=[...new Set([a.TrueToken,pool,...await new Contract(a.Vault,['function getPoolTokens(address) view returns(address[])'],provider).getPoolTokens(pool,{blockTag:finalBlock})])],balances=[];
 for(const token of tokens){const c=new Contract(token,erc,provider);for(const owner of actors){const x=await c.balanceOf(owner,{blockTag:baseline}),y=await c.balanceOf(owner,{blockTag:finalBlock});assert.equal(x,y);balances.push({token,owner,before:String(x),after:String(y)});}}
 assert.ok(after.timestamp<1789050027);const output={format:'oncm-vault-three-reward-programs-browser-v1',source:'Actual scoped Chrome tab102825431 normal GovernorUI; collector only reads historical RPC, no signer',chainId:31373,pool,baseline:before,final:after,stages:results,actorTAndPoolTokenBalancesUnchanged:balances,window:{start:1789050027,end:1789050927,claimDeadline:1789051827,remainderRecipient:a.Timelock},mutationsExcluded:['no stake','no trade','no claim','no close','no settlement','no large clock jump to earning period'],chainHandoff:'Root received sole mutation slot after Execute506; all subsequent collector reads are pinned <=506'};
 fs.writeFileSync('evidence/monetary-policy/programs-browser/through-506.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({programs:3,before:before.programCount,final:after,receiptCount:15,actorsAndTokens:balances.length,allAssertions:'PASS'}));
}finally{provider.destroy();}
