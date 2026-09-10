import test from 'node:test';import assert from 'node:assert/strict';
import {proposalView,governanceSnapshot,isLocalDevnet,advanceLocalTime,authorizeDevTime} from '../server/governance-view.mjs';
const context={timestamp:100n,nonce:3n,threshold:2n,owners:['A','B']};
const proposal={id:'proposal',operationId:'operation',nonce:'3',signatures:[{address:'A'},{address:'B'}]};
test('timelock statuses distinguish waiting, ready and executed from signing',()=>{
 assert.equal(proposalView({...proposal,signatures:[]},context,0n).status,'collecting-signatures');
 const ready=proposalView(proposal,context,0n);assert.equal(ready.status,'ready-to-schedule');assert.equal(ready.canSchedule,true);
 const stale=proposalView(proposal,{...context,nonce:4n},0n);assert.equal(stale.status,'stale-nonce');assert.equal(stale.canSchedule,false);
 const pending=proposalView(proposal,{...context,nonce:4n},105n);assert.equal(pending.status,'scheduled');assert.equal(pending.canExecute,false);assert.equal(pending.canSign,false);assert.equal(pending.canSchedule,false);
 assert.equal(proposalView(proposal,{...context,timestamp:105n},105n).canExecute,true);
 const done=proposalView(proposal,context,1n);assert.equal(done.status,'executed');assert.equal(done.canExecute,false);assert.equal(done.canSchedule,false);
 assert.equal(proposalView({...proposal,signatures:[{address:'a'},{address:'A'},{address:'outsider'}]},context,0n).signatureCount,1);
});
test('every governance contract read uses the same mined block snapshot',async()=>{
 const seen=[];const values={getThreshold:2n,getOwners:['A','B'],nonce:4n,getMinDelay:5n,getTimestamp:105n};
 const snapshot=await governanceSnapshot({client:{getBlock:async()=>({number:29n,timestamp:100n,hash:'blockhash'}),getChainId:async()=>31371},read:async(address,name,fn,args,extra)=>{seen.push(extra.blockNumber);return values[fn];},manifest:{safe:'safe',timelock:'timelock'},proposals:[proposal],rpcUrl:'http://127.0.0.1:9545'});
 assert.deepEqual(seen,[29n,29n,29n,29n,29n]);assert.equal(snapshot.proposals[0].status,'scheduled');assert.equal(snapshot.localTimeControls,true);
});
test('time utility rejects nonlocal/wrongchain inputs before RPC mutation',async()=>{
 for(const url of ['https://mainnet.example','http://127.0.0.1.evil.example','http://user@localhost:9545','https://localhost:9545'])assert.equal(isLocalDevnet(url,31371),false);
 assert.equal(isLocalDevnet('http://127.0.0.1:9545',1),false);
 const requests=[];const client={getChainId:async()=>31371,request:async q=>requests.push(q),getBlock:async()=>({number:30n,timestamp:110n})};
 await assert.rejects(advanceLocalTime({client,rpcUrl:'https://example.com'}));
 await assert.rejects(advanceLocalTime({client,rpcUrl:'http://localhost:9545',seconds:1000}));assert.equal(requests.length,0);
 const result=await advanceLocalTime({client,rpcUrl:'http://127.0.0.1:9545'});
 assert.deepEqual(requests,[{method:'evm_increaseTime',params:[10]},{method:'evm_mine',params:[]}]);assert.equal(result.observedBlock,30n);
});
test('dev time authorization requires both exact browser Origin and an existing wallet session',()=>{
 let sessionReads=0;const session=()=>{sessionReads++;return{address:'wallet'};};
 for(const origin of [undefined,'null','https://evil.example','http://localhost:5171','http://127.0.0.1:5171.evil'])assert.throws(()=>authorizeDevTime({headers:{origin}},session),e=>e.statusCode===403);
 assert.equal(sessionReads,0);
 const request={headers:{origin:'http://127.0.0.1:5171'}};
 assert.throws(()=>authorizeDevTime(request,()=>{throw Object.assign(Error('Sign in'),{statusCode:401});}),e=>e.statusCode===401);
 assert.deepEqual(authorizeDevTime(request,session),{address:'wallet'});
});
