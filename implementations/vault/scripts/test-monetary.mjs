// Isolated in-process Hardhat only: never reads deployment.json or connects to RPC9547.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import hre from 'hardhat';
import {BrowserProvider,ContractFactory,ZeroAddress,keccak256,toUtf8Bytes} from 'ethers';

assert.equal(hre.network.name,'hardhat','Tests require the isolated in-process network');
const provider=new BrowserProvider(hre.network.provider,undefined,{cacheTimeout:-1});
provider.pollingInterval=10;
const signers=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
const accounts=await Promise.all(signers.map(s=>s.getAddress()));
const results=[],receipts=[];
const art=n=>JSON.parse(fs.readFileSync(`${['Membership','TimelockController','VaultGovernor'].includes(n)?'production/artifacts':'.state/monetary-artifacts'}/${n}.json`));
async function tx(label,p){const r=await(await p).wait();assert.equal(r.status,1);receipts.push({label,block:r.blockNumber,hash:r.hash});return r;}
async function deploy(n,args=[]){const a=art(n),c=await new ContractFactory(a.abi,a.bytecode,signers[0]).deploy(...args);await tx('deploy '+n,Promise.resolve(c.deploymentTransaction()));return c;}
async function check(label,fn){await fn();results.push(label);console.log('PASS',label);}
const mine=n=>provider.send('hardhat_mine',['0x'+n.toString(16)]);
async function now(){return Number((await provider.getBlock('latest')).timestamp);}
async function at(t){await provider.send('evm_setNextBlockTimestamp',[t]);await mine(1);}

try{
 const members=await deploy('Membership',[accounts.slice(0,3)]);
 const timelock=await deploy('TimelockController',[5,[],[ZeroAddress],accounts[0]]);
 const executor=await timelock.getAddress();
 const governor=await deploy('VaultGovernor',[await members.getAddress(),executor]);
 await tx('Governor proposer',timelock.grantRole(await timelock.PROPOSER_ROLE(),await governor.getAddress()));
 await tx('Governor canceller',timelock.grantRole(await timelock.CANCELLER_ROLE(),await governor.getAddress()));
 await tx('Membership owner',members.transferOwnership(executor));
 await tx('Remove bootstrap admin',timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(),accounts[0]));
 const token=await deploy('TrueTokenV2',[executor,[],[]]);
 const rewards=await deploy('RewardBudget',[await token.getAddress(),executor]);
 const meter=await deploy('RewardMeterHarness',[await rewards.getAddress()]);
 const rewardAddress=await rewards.getAddress(),meterAddress=await meter.getAddress();

 async function govern(calls,label,{execute=true}={}){
  const targets=calls.map(x=>x[0].target),values=calls.map(()=>0),data=calls.map(x=>x[0].interface.encodeFunctionData(x[1],x[2]));
  const description='Isolated monetary test: '+label,dh=keccak256(toUtf8Bytes(description));
  await tx('Propose '+label,governor.propose(targets,values,data,description));
  const pid=await governor.hashProposal(targets,values,data,dh);
  await mine(2);await tx('Alice vote '+label,governor.castVote(pid,1));
  await tx('Bob vote '+label,governor.connect(signers[1]).castVote(pid,1));
  await mine(10);assert.equal(await governor.state(pid),4n);
  await tx('Queue '+label,governor.queue(targets,values,data,dh));
  await assert.rejects(()=>governor.execute.staticCall(targets,values,data,dh));
  await provider.send('evm_increaseTime',[6]);await mine(1);
  const perform=()=>governor.execute(targets,values,data,dh);
  if(execute){await tx('Execute '+label,perform());assert.equal(await governor.state(pid),7n);}
  return{perform,pid,targets,values,data,dh};
 }
 const start=await now()+1000,end=start+100,deadline=end+100;
 const program=(id,budget,recipient=accounts[3],s=start,e=end,d=deadline)=>[id,meterAddress,s,e,d,budget,recipient];
 await check('No implicit genesis; only actual Timelock owns uncapped V2 mint',async()=>{
  assert.equal(await token.owner(),executor);assert.equal(await token.totalSupply(),0n);
  assert.equal(await token.monetaryVersion(),2n);
  await assert.rejects(()=>token.mint(accounts[0],1n));
  await assert.rejects(()=>rewards.createProgram(...program(0,101n)));
  assert.equal(await timelock.hasRole(await timelock.DEFAULT_ADMIN_ROLE(),accounts[0]),false);
 });
 await check('Original Governor votes + Timelock atomically mint and reserve finite budget',async()=>{
  await govern([[token,'mint',[rewardAddress,101n]],[rewards,'createProgram',program(0,101n)]],'program zero');
  assert.equal(await token.totalSupply(),101n);assert.equal(await rewards.reserved(),101n);
  const p=await rewards.programs(0);assert.equal(p.meter,meterAddress);assert.equal(p.budget,101n);
  assert.equal(p.remainderRecipient,accounts[3]);assert.equal(p.claimDeadline,BigInt(deadline));
 });
 await check('A stale expectedId reverts the entire executed mint+create batch',async()=>{
  const stale=await govern([[token,'mint',[rewardAddress,999n]],[rewards,'createProgram',program(0,999n)]],'stale CAS',{execute:false});
  await assert.rejects(()=>stale.perform());
  assert.equal(await token.totalSupply(),101n);assert.equal(await token.balanceOf(rewardAddress),101n);
  assert.equal(await rewards.programCount(),1n);assert.equal(await rewards.reserved(),101n);
  assert.equal(await governor.state(stale.pid),5n);
 });
 await check('Existing balance is reserved; unfunded budget cannot reuse it',async()=>{
  const unfunded=await govern([[rewards,'createProgram',program(1,1n)]],'unfunded',{execute:false});
  await assert.rejects(()=>unfunded.perform());assert.equal(await rewards.programCount(),1n);
 });
 await check('Invalid recipient/window and zero issuance reject in executor eth_call',async()=>{
  for(const args of[program(1,1n,rewardAddress),program(1,1n,ZeroAddress),program(1,1n,accounts[3],end,start,deadline)])
   await assert.rejects(()=>provider.call({from:executor,to:rewardAddress,data:rewards.interface.encodeFunctionData('createProgram',args)}));
  await assert.rejects(()=>provider.call({from:executor,to:token.target,data:token.interface.encodeFunctionData('mint',[rewardAddress,0])}));
 });
 await check('A second zero-participation program has an independent finite budget',async()=>{
  await govern([[token,'mint',[rewardAddress,29n]],[rewards,'createProgram',program(1,29n)]],'program one');
  assert.equal(await token.totalSupply(),130n);assert.equal(await rewards.reserved(),130n);
 });
 await check('Meter-only weights, earning boundaries and nonzero participant/weight enforced',async()=>{
  await assert.rejects(()=>meter.record(0,accounts[0],1));
  await at(start);
  await assert.rejects(()=>rewards.recordWeight(0,accounts[0],1));
  await assert.rejects(()=>meter.record(100,accounts[0],1));
  await assert.rejects(()=>meter.record(0,ZeroAddress,1));
  await assert.rejects(()=>meter.record(0,accounts[0],0));
  await tx('Alice weight1',meter.record(0,accounts[0],1));
  await tx('Bob weight2',meter.record(0,accounts[1],2));
  assert.equal((await rewards.programs(0)).totalWeight,3n);
  assert.equal(await rewards.claimable(0,accounts[0]),0n);
  await assert.rejects(()=>rewards.claim(0));
 });
 await check('Final immutable weights pay floor pro-rata; claims cannot redirect or replay',async()=>{
  await at(end);await assert.rejects(()=>meter.record(0,accounts[0],1));
  assert.equal(await rewards.claimable(0,accounts[0]),33n);assert.equal(await rewards.claimable(0,accounts[1]),67n);
  await assert.rejects(()=>rewards.connect(signers[2]).claim(0));
  await tx('Alice claim',rewards.claim(0));await tx('Bob claim',rewards.connect(signers[1]).claim(0));
  assert.equal(await token.balanceOf(accounts[0]),33n);assert.equal(await token.balanceOf(accounts[1]),67n);
  await assert.rejects(()=>rewards.claim(0));assert.equal(await rewards.reserved(),30n);
  assert.equal(await rewards.claimable(1,accounts[0]),0n);await assert.rejects(()=>rewards.close(0));
 });
 await check('Permissionless close sends dust and zero-weight budget only to voted recipient',async()=>{
  await at(deadline);await assert.rejects(()=>rewards.claim(1));
  await tx('Close dust',rewards.connect(signers[2]).close(0));
  await tx('Close zero-weight',rewards.connect(signers[2]).close(1));
  assert.equal(await token.balanceOf(accounts[3]),30n);assert.equal(await token.balanceOf(accounts[2]),0n);
  assert.equal(await rewards.reserved(),0n);assert.equal(await token.balanceOf(rewardAddress),0n);
  assert.equal((await rewards.programs(0)).reclaimed,1n);assert.equal((await rewards.programs(1)).reclaimed,29n);
  await assert.rejects(()=>rewards.close(0));
 });
 fs.writeFileSync('.state/monetary-test-report.json',JSON.stringify({status:'passed',isolation:'in-process Hardhat; no network listener or main RPC',results,receipts,programs:2,totalSupply:'130',reserved:'0',testMeter:'unrestricted RewardMeterHarness; never production'},null,2)+'\n');
}finally{await hre.network.provider.request({method:'hardhat_reset',params:[]});provider.destroy();}
