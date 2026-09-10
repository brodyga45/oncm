// One-shot cutover of this existing, valueless local pilot to its user-specified wallet.
// No private owner key, impersonation, mint, treasury spend, or chain reset.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Contract,HDNodeWallet,JsonRpcProvider,Interface,parseEther,keccak256,toUtf8Bytes} from 'ethers';
const owner='0x4b5d2b35f36a3ac018d5c9a9c394fadae667fb2f';
const plan=JSON.parse(fs.readFileSync('.state/public-pilot-plan-563.json'));
const config=JSON.parse(fs.readFileSync('.state/deployment-v2.json'));
assert.equal(config.chainInstance.id,'554c825d-6813-43bf-9bf0-6ede06acff4d');
assert.equal(config.rpcUrl,'http://127.0.0.1:9547');assert.equal(plan.owner.toLowerCase(),owner);
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
const root=HDNodeWallet.fromPhrase('test test test test test test test test test test test junk',undefined,"m/44'/60'/0'/0");
const wallets=[0,1,2,3].map(i=>root.deriveChild(i).connect(provider));
const abis=JSON.parse(fs.readFileSync('.state/abis-v2.json'));
const gov=new Contract(config.addresses.Governor,abis.VaultGovernor,wallets[0]);
const token=new Contract(config.addresses.TrueToken,abis.TrueToken,provider);
const member=new Contract(config.addresses.Membership,abis.Membership,provider);
const p=plan.membership.proposal;
const expected=[member.interface.encodeFunctionData('setMember',[owner,true]),...wallets.map(w=>member.interface.encodeFunctionData('setMember',[w.address,false]))];
assert.deepEqual(p.calldatas,expected);assert.ok(p.targets.every(a=>a.toLowerCase()===member.target.toLowerCase()));assert.ok(p.values.every(v=>BigInt(v)===0n));
assert.equal(keccak256(toUtf8Bytes(p.description)),p.descriptionHash);
const out='.state/pilot/migration-execution.json';
if(fs.existsSync(out))throw Error('Existing execution evidence; inspect it before resuming. Never rerun blindly.');
const report={format:'vault-public-pilot-cutover-v1',owner,chainInstance:config.chainInstance.id,chainId:31373,reviewedBlock:563,transactions:[],clockSteps:[]};
const save=()=>{fs.writeFileSync(out+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(out+'.tmp',out);};
async function tx(label,fn){const sent=await fn();const record={label,hash:sent.hash};report.transactions.push(record);save();const receipt=await sent.wait();assert.equal(receipt.status,1);record.block=receipt.blockNumber;record.gasUsed=String(receipt.gasUsed);save();console.log(JSON.stringify(record));}
async function mine(count){for(let i=0;i<count;i++)await provider.send('evm_mine',[]);report.clockSteps.push({method:'evm_mine',count});save();}
try{
 assert.equal((await provider.getNetwork()).chainId,31373n);
 assert.equal(await provider.getBlockNumber(),563);assert.equal((await provider.getBlock(563)).hash,plan.observed.block.hash);
 assert.equal(await token.totalSupply(),BigInt(plan.preserved.totalSupply));
 assert.equal(await token.balanceOf(config.addresses.Timelock),BigInt(plan.preserved.treasuryT));
 assert.equal(await member.totalSupply(),parseEther('4'));
 for(const x of plan.transfers.transactions){
  assert.equal(x.to.toLowerCase(),token.target.toLowerCase());assert.equal(x.recipient.toLowerCase(),owner);
  const signer=wallets.find(w=>w.address.toLowerCase()===x.from.toLowerCase());assert.ok(signer);
  assert.equal(await token.balanceOf(signer.address),BigInt(x.amount));assert.equal(await provider.getTransactionCount(signer.address,'pending'),x.nonceAtReview);
  assert.equal(x.calldata,token.interface.encodeFunctionData('transfer',[owner,x.amount]));
 }
 save();
 for(const x of plan.transfers.transactions){const signer=wallets.find(w=>w.address.toLowerCase()===x.from.toLowerCase());await tx('Transfer existing V2 T to pilot owner',()=>token.connect(signer).transfer(owner,x.amount));}
 const ownerEthBefore=await provider.getBalance(owner);report.ownerNativeBefore=String(ownerEthBefore);save();
 await tx('Fund owner with 100 valueless local test ETH',()=>wallets[0].sendTransaction({to:owner,value:parseEther('100')}));
 await tx('Propose atomic membership handoff',()=>gov.propose(p.targets,p.values,p.calldatas,p.description));
 const proposalId=await gov.hashProposal(p.targets,p.values,p.calldatas,p.descriptionHash);assert.equal(String(proposalId),p.proposalId);report.proposalId=String(proposalId);save();
 const snapshot=Number(await gov.proposalSnapshot(proposalId));await mine(Math.max(0,snapshot+1-await provider.getBlockNumber()));
 await tx('Existing Alice member votes FOR handoff',()=>gov.castVote(proposalId,1));
 await tx('Existing Bob member votes FOR handoff',()=>gov.connect(wallets[1]).castVote(proposalId,1));
 const deadline=Number(await gov.proposalDeadline(proposalId));await mine(Math.max(0,deadline+1-await provider.getBlockNumber()));
 assert.equal(await gov.state(proposalId),4n);
 await tx('Queue handoff through existing Timelock',()=>gov.queue(p.targets,p.values,p.calldatas,p.descriptionHash));
 const eta=Number(await gov.proposalEta(proposalId)),head=await provider.getBlock('latest');
 if(head.timestamp<eta){const seconds=eta-head.timestamp;await provider.send('evm_increaseTime',[seconds]);report.clockSteps.push({method:'evm_increaseTime',seconds});await mine(1);}
 await tx('Execute atomic membership handoff',()=>gov.execute(p.targets,p.values,p.calldatas,p.descriptionHash));
 assert.equal(await member.balanceOf(owner),parseEther('1'));assert.equal(await member.getVotes(owner),parseEther('1'));assert.equal(await member.totalSupply(),parseEther('1'));
 for(const w of wallets)assert.equal(await member.balanceOf(w.address),0n);
 assert.equal(await token.totalSupply(),BigInt(plan.preserved.totalSupply));assert.equal(await token.balanceOf(config.addresses.Timelock),BigInt(plan.preserved.treasuryT));
 assert.equal(await token.balanceOf(owner),BigInt(plan.transfers.expectedOwnerAfterT));assert.equal(await provider.getBalance(owner),ownerEthBefore+parseEther('100'));
 report.complete=true;report.finalBlock=await provider.getBlockNumber();report.ownerT=String(await token.balanceOf(owner));report.ownerNative=String(await provider.getBalance(owner));save();
 console.log(JSON.stringify({complete:true,block:report.finalBlock,owner,T:report.ownerT,native:report.ownerNative}));
}finally{provider.destroy();}
