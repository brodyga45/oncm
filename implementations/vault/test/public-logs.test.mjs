import test from 'node:test';import assert from 'node:assert/strict';
import {paginatedLogs,withPublicLogs} from '../sdk/public-logs.mjs';
test('public ranges use sequential1000-block chunks and one latest snapshot, preserving filters and order',async()=>{
 const calls=[];let heads=0;const filter={address:'0x123',topics:['0xabc'],fromBlock:261,toBlock:'latest'};
 const query=paginatedLogs(async f=>{calls.push(f);return[{blockNumber:f.fromBlock}];},{head:async()=>{heads++;return 2500;}});
 const logs=await query(filter);
 assert.equal(heads,1);assert.deepEqual(calls.map(f=>[BigInt(f.fromBlock),BigInt(f.toBlock)]),[[261n,1260n],[1261n,2260n],[2261n,2500n]]);
 assert.ok(calls.every(f=>f.address===filter.address&&f.topics===filter.topics));assert.equal(logs.length,3);assert.equal(filter.toBlock,'latest');
});
test('literal blockHash query is not rewritten or expanded',async()=>{
 const filter={blockHash:'0xab',address:'0x12'};let count=0;
 const query=paginatedLogs(async f=>{assert.equal(f,filter);count++;return[];},{head:()=>{throw Error('Must not read head');}});
 assert.deepEqual(await query(filter),[]);assert.equal(count,1);
});
test('aggregate response/pages bounded, rejection is explicit and no partial history is returned',async()=>{
 const make=limits=>paginatedLogs(async()=>[{data:'abc'}],{head:async()=>5000},limits);
 await assert.rejects(make({maxPages:2})({fromBlock:0,toBlock:'latest'}),/page limit/);
 await assert.rejects(make({maxLogs:1})({fromBlock:0,toBlock:1001}),/browser limits/);
 await assert.rejects(make({maxBytes:2})({fromBlock:0,toBlock:0}),/browser limits/);
});
test('one provider is wrapped once only in public mode; local provider remains unchanged',()=>{
 const provider={getLogs:async()=>[],getBlockNumber:async()=>1};const original=provider.getLogs;
 assert.equal(withPublicLogs(provider,{}).getLogs,original);
 withPublicLogs(provider,{publicMode:true});const once=provider.getLogs;assert.notEqual(once,original);
 assert.equal(withPublicLogs(provider,{publicMode:true}).getLogs,once);
});
