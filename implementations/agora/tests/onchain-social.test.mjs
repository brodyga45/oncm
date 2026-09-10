import test from 'node:test';import assert from 'node:assert/strict';import ganache from 'ganache';
import {createSocialReader} from '../sdk/social-read.mjs';
import {createPublicClient,createWalletClient,custom,zeroHash} from 'viem';
import {chain,mnemonic,devAccounts} from '../sdk/chain.mjs';import {compileSocial} from '../scripts/compile-social.mjs';import {createSocialSDK} from '../sdk/social.mjs';
const registry=`pragma solidity ^0.8.28; import {IAgoraStatementRegistry} from "contracts/AgoraSocial.sol"; contract SocialTestRegistry is IAgoraStatementRegistry {function getStatement(bytes32 id) external pure returns(Statement memory s){require(id==bytes32(uint256(1)),"unknown");s.id=id;s.creator=address(1);}}`;
test('real SSTORE2 content, immutable versions, forum rules and SDK under Shanghai (isolated chain only)',async t=>{
 const artifacts=compileSocial({'SocialTestRegistry.sol':{content:registry}}),provider=ganache.provider({chain:{chainId:31371,hardfork:'shanghai'},wallet:{mnemonic,totalAccounts:3},miner:{blockGasLimit:30_000_000},logging:{quiet:true}});t.after(()=>provider.disconnect());
 const client=createPublicClient({chain,transport:custom(provider),pollingInterval:10}),wallets=devAccounts.slice(0,3).map(account=>createWalletClient({chain,account,transport:custom(provider)}));
 async function deploy(a,args=[]){const hash=await wallets[0].deployContract({abi:a.abi,bytecode:a.bytecode,args});return(await client.waitForTransactionReceipt({hash})).contractAddress;}
 const r=await deploy(artifacts.SocialTestRegistry),address=await deploy(artifacts.AgoraSocial,[r]),sdk=wallets.map(wallet=>createSocialSDK({client,wallet,address,abi:artifacts.AgoraSocial.abi})),statement='0x'+'0'.repeat(63)+'1';
 const id=receipt=>sdk[0].events(receipt).find(e=>e.eventName==='PostPublished').args.postId;
 await t.test('profile author is transaction sender; previous full versions remain readable',async()=>{
  await sdk[0].publishProfile({displayName:'Ada',bio:'First profile',expectedVersionCount:0});await sdk[0].publishProfile({displayName:'Ada revised',bio:'Second profile',expectedVersionCount:1});
  assert.equal((await sdk[0].profile(wallets[0].account.address)).bio,'Second profile');assert.equal((await sdk[0].profile(wallets[0].account.address,{version:0})).bio,'First profile');assert.equal((await sdk[0].profile(wallets[1].account.address)).published,false);await assert.rejects(sdk[0].publishProfile({displayName:'stale',bio:'old tab',expectedVersionCount:1}));
 });
 let root,reply,blog;
 await t.test('comments enforce real statement and parent context, author edits and stale versions',async()=>{
  await assert.rejects(sdk[0].publishComment(zeroHash,'bad'));root=id(await sdk[0].publishComment(statement,'First theorem discussion'));reply=id(await sdk[1].publishComment(statement,'First reply',root));
  await assert.rejects(sdk[1].publishComment(zeroHash,'wrong market',root));await assert.rejects(sdk[1].revisePost(root,0,{text:'forged edit'}));
  await sdk[0].revisePost(root,0,{text:'Revised theorem discussion'});await assert.rejects(sdk[0].revisePost(root,0,{text:'stale edit'}));
  assert.equal((await sdk[0].revision(root,0)).text,'First theorem discussion');assert.equal((await sdk[0].post(root)).text,'Revised theorem discussion');assert.equal((await sdk[0].post(reply)).depth,1);
 });
 await t.test('votes +1/0/-1/+1 have exact score, no duplicate/self-vote and readable history',async()=>{
  await assert.rejects(sdk[0].vote(root,1));for(const value of [1,0,-1,1]){await sdk[1].vote(root,value);assert.equal((await sdk[0].post(root)).score,value);}
  await sdk[1].vote(root,1);const history=await sdk[0].voteHistory(root);assert.equal(history.total,4);assert.deepEqual(history.items.map(x=>Number(x.value)),[1,0,-1,1]);assert.equal((await sdk[0].post(root,{viewer:wallets[1].account.address})).myVote,1);
 });
 await t.test('multichunk UTF-8 blog is full onchain data; edits retain previous chunks',async()=>{
  const text='λ'.repeat(9000)+' blog';blog=id(await sdk[0].publishBlog({title:'A public mathematical notebook',text}));
  const first=await sdk[0].post(blog);assert.equal(first.text,text);assert.equal(first.chunkCount,2);const pointer=await sdk[0].read('revisionPointer',[blog,0n,0n]);const code=await client.getCode({address:pointer});assert.equal(code.slice(0,4),'0x00');assert.equal((code.length-2)/2,16385);
  await sdk[0].revisePost(blog,0,{title:'Revised blog',text:'Updated body'});assert.equal((await sdk[0].revision(blog,0)).text,text);assert.equal((await sdk[0].post(blog)).text,'Updated body');
  const blogReply=id(await sdk[1].publishComment(zeroHash,'Blog reply',blog));assert.equal((await sdk[0].post(blogReply)).parentId,String(blog));
 });
 await t.test('exact chunk boundary and histories beyond first page remain accessible',async()=>{
  const boundary=id(await sdk[0].publishBlog({title:'Boundary',text:'x'.repeat(16384)}));assert.equal((await sdk[0].post(boundary)).chunkCount,1);
  for(let n=0;n<6;n++)await sdk[0].revisePost(boundary,n,{title:'Boundary '+n,text:'Version '+(n+1)});
  const first=await sdk[0].revisionHistory(boundary,{limit:5});assert.equal(first.nextCursor,5);const next=await sdk[0].revisionHistory(boundary,{cursor:5,limit:5});assert.equal(next.items.length,2);assert.equal(next.items[1].text,'Version 6');assert.equal(next.nextCursor,null);
 });
 await t.test('author tombstones retain content, descendants, votes and readable visibility history',async()=>{
  await assert.rejects(sdk[1].setTombstone(root,true));await sdk[0].setTombstone(root,true);
  assert.equal((await sdk[0].post(root)).tombstoned,true);assert.equal((await sdk[0].post(root)).text,'Revised theorem discussion');assert.equal((await sdk[0].post(reply)).parentId,String(root));
  assert.deepEqual((await sdk[0].replies(root)).ids,[String(reply)]);assert.equal((await sdk[0].post(root)).score,1);
  await sdk[0].setTombstone(root,false);assert.equal((await sdk[0].visibilityHistory(root)).total,2);
 });
 await t.test('bounded pagination rebuilds from state; size/depth failures leave no phantom records',async()=>{
  const headers=await sdk[0].headers(0,2);assert.equal(headers.length,2);assert.deepEqual((await sdk[0].statementPosts(statement)).ids,[String(root),String(reply)]);
  const total=await sdk[0].read('postCount');await assert.rejects(sdk[0].publishBlog({title:'too big',text:'x'.repeat(65537)}));assert.equal(await sdk[0].read('postCount'),total);assert.throws(()=>sdk[0].headers(0,51));
  let parent=reply;for(let depth=2;depth<=6;depth++)parent=id(await sdk[1].publishComment(statement,'Nested '+depth,parent));await assert.rejects(sdk[1].publishComment(statement,'Too deep',parent));
  const first=await sdk[0].authorPosts(wallets[1].account.address,{limit:2});assert.equal(first.nextCursor,2);const second=await sdk[0].authorPosts(wallets[1].account.address,{cursor:2,limit:2});assert.notDeepEqual(first.ids,second.ids);
 });
 await t.test('RPC-only rebuild and threaded read preserve siblings below tombstoned parent',async()=>{
  const sibling=id(await sdk[2].publishComment(statement,'Later sibling',root));await sdk[0].vote(sibling,1);await sdk[1].vote(sibling,1);await sdk[0].setTombstone(root,true);
  const reader=createSocialReader(sdk[0]),snapshot=await sdk[0].snapshot(),view=await reader.discussion(statement,{blockNumber:snapshot.number});
  assert.equal(view.items[0].id,String(root));assert.equal(view.items[1].id,String(reply));assert.ok(view.items.findIndex(p=>p.id===String(sibling))>1);assert.equal(view.items[0].tombstoned,true);
  const children=await reader.children(root,{limit:1});assert.equal(children.nextCursor,1);const next=await reader.children(root,{cursor:1,limit:1});assert.equal(next.items[0].id,String(sibling));
  const rebuilt=[];let cursor=0;do{const page=await reader.rebuild({cursor,limit:2,blockNumber:snapshot.number});rebuilt.push(...page.headers);cursor=page.nextCursor;}while(cursor!==null);assert.equal(rebuilt.length,Number(await sdk[0].read('postCount')));assert.equal(new Set(rebuilt.map(p=>p.id)).size,rebuilt.length);
  assert.ok((await reader.blogs(wallets[0].account.address)).items.every(p=>p.kind===1));
 });

});

test('malformed UTF-8 body is isolated and exact bytes/hash remain checked',async()=>{
 const {keccak256}=await import('viem');const client={readContract:async({functionName})=>functionName==='getRevision'?['',keccak256('0xff'),1,1n,1n]:'0xff'};
 const sdk=createSocialSDK({client,address:'0x0000000000000000000000000000000000000001',abi:[]});const r=await sdk.revision(1,0);assert.equal(r.invalidUtf8,true);assert.equal(r.text,'�');assert.equal(r.byteLength,1);
});
test('global Top/New rank a later root beyond the first 50-header page',async()=>{
 const headers=Array.from({length:51},(_,i)=>({id:BigInt(i+1),score:i===50?10n:0n}));const reads=[];
 const sdk={snapshot:async()=>({number:100n}),statementRoots:async(_id,{cursor=0,limit=50})=>({ids:headers.slice(cursor,cursor+limit).map(p=>String(p.id)),total:51,nextCursor:cursor+limit<51?cursor+limit:null}),read:async(_fn,[id])=>{reads.push(Number(id));return headers[Number(id)-1];},post:async id=>({id:String(id),author:'0x0000000000000000000000000000000000000001',score:Number(headers[Number(id)-1].score)}),profile:async()=>({displayName:'author'}),replies:async()=>({ids:[],total:0,nextCursor:null})};
 const reader=createSocialReader(sdk),top=await reader.discussion('goal',{limit:10});assert.equal(top.items[0].id,'51');assert.equal(top.totalRoots,51);assert.equal(top.nextCursor,10);assert.equal(new Set(reads).size,51);const newest=await reader.discussion('goal',{sort:'new',limit:10});assert.equal(newest.items[0].id,'51');assert.equal(newest.items[1].id,'50');
});
