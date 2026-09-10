// Exact future-fee consent migration for the existing valueless pilot. No treasury payouts.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {Contract,HDNodeWallet,JsonRpcProvider} from 'ethers';
const config=JSON.parse(fs.readFileSync('.state/deployment-v2.json'));
assert.equal(config.rpcUrl,'http://127.0.0.1:9547');assert.equal(config.chainInstance.id,'554c825d-6813-43bf-9bf0-6ede06acff4d');
const p=JSON.parse(fs.readFileSync('.state/public-pilot-fee-plan-563.json')).futureFeeMigration;
const handoff=JSON.parse(fs.readFileSync('.state/pilot/migration-execution.json'));assert.equal(handoff.complete,true);
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
const root=HDNodeWallet.fromPhrase('test test test test test test test test test test test junk',undefined,"m/44'/60'/0'/0");
const alice=root.deriveChild(0).connect(provider),bob=root.deriveChild(1).connect(provider);
const abis=JSON.parse(fs.readFileSync('.state/abis-v2.json'));
const allocation=new Contract(config.addresses.AllocationController,abis.AllocationControllerV2??abis.AllocationController,alice);
const token=new Contract(config.addresses.TrueToken,['function balanceOf(address) view returns(uint256)','function totalSupply() view returns(uint256)'],provider);
assert.equal(p.controller.toLowerCase(),allocation.target.toLowerCase());assert.deepEqual(p.after.weights,['8500','1500']);
assert.deepEqual(p.after.recipients.map(x=>x.toLowerCase()),[handoff.owner,config.addresses.Timelock.toLowerCase()]);
const out='.state/pilot/fee-migration-execution.json';if(fs.existsSync(out))throw Error('Existing fee execution; inspect before resuming');
const report={format:'vault-public-pilot-fee-cutover-v1',transactions:[],before:p.before,after:p.after};
const save=()=>{fs.writeFileSync(out+'.tmp',JSON.stringify(report,null,2)+'\n');fs.renameSync(out+'.tmp',out);};
async function tx(label,fn){const sent=await fn();const r={label,hash:sent.hash};report.transactions.push(r);save();const receipt=await sent.wait();assert.equal(receipt.status,1);r.block=receipt.blockNumber;save();console.log(JSON.stringify(r));return receipt;}
try{
 assert.equal((await provider.getNetwork()).chainId,31373n);assert.equal(await allocation.epoch(),1n);assert.equal(await allocation.proposalCount(),0n);
 const before=await allocation.allocation(1);assert.equal(before.split,p.before.split);assert.deepEqual([...before.recipients],p.before.recipients);assert.deepEqual([...before.weights].map(String),p.before.weights);
 const treasury=await token.balanceOf(config.addresses.Timelock),ownerT=await token.balanceOf(handoff.owner),supply=await token.totalSupply();save();
 const receipt=await tx('Propose owner85% / governance15% future fee epoch',()=>allocation.propose(p.after.recipients,p.after.weights));
 const event=receipt.logs.map(l=>{try{return allocation.interface.parseLog(l);}catch{return null;}}).find(e=>e?.name==='AllocationProposed');assert.ok(event);
 const proposal=await allocation.proposal(0);assert.equal(proposal.baseEpoch,1n);assert.deepEqual([...proposal.recipients],p.after.recipients);assert.deepEqual([...proposal.weights].map(String),p.after.weights);
 await tx('Bob consents to transfer his future40% test share',()=>allocation.connect(bob).setConsent(0,true));
 await tx('Alice consents to transfer her future45% test share',()=>allocation.setConsent(0,true));
 assert.equal(await allocation.consent(0,bob.address),true);assert.equal(await allocation.consent(0,alice.address),true);
 await tx('Activate future fee epoch2',()=>allocation.applyAllocation(0));
 assert.equal(await allocation.epoch(),2n);const after=await allocation.allocation(2);assert.deepEqual([...after.recipients],p.after.recipients);assert.deepEqual([...after.weights].map(String),p.after.weights);assert.equal((await allocation.allocation(1)).split,before.split);
 assert.equal(await token.balanceOf(config.addresses.Timelock),treasury);assert.equal(await token.balanceOf(handoff.owner),ownerT);assert.equal(await token.totalSupply(),supply);
 report.complete=true;report.after={epoch:'2',split:after.split,recipients:[...after.recipients],weights:[...after.weights].map(String)};report.finalBlock=await provider.getBlockNumber();save();console.log(JSON.stringify({complete:true,...report.after,finalBlock:report.finalBlock}));
}finally{provider.destroy();}
