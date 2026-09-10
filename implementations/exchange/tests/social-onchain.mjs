// Isolated Ganache chain only. No local RPC connection, markets, Lean jobs or proof mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import solc from 'solc';
import {BrowserProvider,ContractFactory,AbiCoder,ZeroHash,ZeroAddress,keccak256,toUtf8Bytes} from 'ethers';
import {deploySocial} from '../scripts/deploy-social.mjs';
import {ExchangeSDK} from '../sdk/index.mjs';
import {ExchangeSocialSDK,socialMetadata,rankSocial} from '../sdk/social.mjs';
const chain=ganache.provider({wallet:{totalAccounts:4},chain:{chainId:31372,hardfork:'shanghai'},miner:{blockGasLimit:30000000},logging:{quiet:true}});
const provider=new BrowserProvider(chain,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
const results=[];async function test(name,fn){await fn();results.push({name,status:'passed'});console.log('PASS',name);}
try{
 const source='pragma solidity ^0.8.20; contract SocialTestRegistry { function statements(bytes32 id) external pure returns(bytes32,bytes32,bytes32,uint64,uint64,uint8,uint8,uint8,address,address,string memory) {return(id,bytes32(0),bytes32(0),0,0,0,0,0,id==bytes32(uint256(1))?address(1):address(0),address(0),"");}}';
 const o=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Fixture.sol':{content:source}},settings:{evmVersion:'shanghai',viaIR:true,optimizer:{enabled:true,runs:100},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}))).contracts['Fixture.sol'].SocialTestRegistry;
 const wallets=await Promise.all([0,1,2].map(i=>provider.getSigner(i))),addresses=await Promise.all(wallets.map(w=>w.getAddress()));
 const registry=await new ContractFactory(o.abi,'0x'+o.evm.bytecode.object, wallets[0]).deploy();await registry.waitForDeployment();
 const deployment=await deploySocial(provider,wallets[0],registry.target),abis=JSON.parse(fs.readFileSync('web/generated/social-abis.json'));
 const clients=wallets.map(w=>new ExchangeSDK(provider,w,{contracts:{protocol:registry.target}},{},()=>{}));
 const social=clients.map(c=>new ExchangeSocialSDK(c,deployment,abis)),h=social[0].contract('hook'),cm=social[0].contract('comments'),ch=social[0].contract('channels');
 const context='0x'+'0'.repeat(63)+'1';let profile,blog,comment,reply;
 await test('Original ECP managers deployed on Shanghai, zero fees, immutable manager and locked channel',async()=>{
  assert.equal(await cm.owner(),ZeroAddress);assert.equal(await ch.owner(),ZeroAddress);assert.equal(await cm.channelManager(),ch.target);assert.equal(await ch.ownerOf(deployment.channelId),h.target);
  assert.equal(await ch.getChannelCreationFee(),0n);assert.equal(await ch.getHookTransactionFee(),0n);
  await assert.rejects(social[0].contract('comments',true).updateChannelContract(registry.target));await assert.rejects(social[0].contract('channels',true).setHook(deployment.channelId,ZeroAddress));
 });
 await test('Wallet profile full text and edits persist in state with original and current revisions',async()=>{
  await social[0].saveProfile('Researcher α','A fully onchain bio');profile=await social[0].profile(addresses[0]);assert.equal(profile.bio,'A fully onchain bio');
  await social[0].saveProfile('Researcher β','Edited bio');const history=await social[0].history(profile.id);assert.equal(history.length,2);assert.equal(history[0].text,'A fully onchain bio');assert.equal(history[1].title,'Researcher β');
  await assert.rejects(social[1].edit(profile.id,'spoofed','name'));
  await social[0].saveProfile('','');assert.equal((await social[0].profile(addresses[0])).bio,'');
 });
 await test('Personal blog posts, exact market context and nested replies use original ECP',async()=>{
  await social[0].publishBlog('Market notes','Full blog article\nSecond paragraph');blog=(await social[0].blogs(addresses[0]))[0];assert.equal(blog.text,'Full blog article\nSecond paragraph');
  await social[1].reply(blog.id,'Question about the article');reply=(await social[0].thread(blog.id))[0];assert.equal(reply.parentId,blog.id);
  await social[2].reply(reply.id,'Nested answer');assert.equal((await social[0].thread(blog.id)).length,2);
  await social[0].postComment(context,'Mathematical observation');comment=(await social[0].comments(context))[0];assert.equal((await cm.getComment(comment.id)).content,'Mathematical observation');
  await assert.rejects(social[0].postComment(ZeroHash,'Unknown market'));
 });
 await test('Actual original reaction API +1→0→−1→+1, duplicate/selfvote refused; batch switch atomic',async()=>{
  await social[1].vote(comment.id,1);assert.equal(await h.voteOf(comment.id,addresses[1]),1n);
  await assert.rejects(social[1].create(5,context,'1','',comment.id));await assert.rejects(social[0].create(5,context,'1','',comment.id));
  await social[1].vote(comment.id,0);assert.equal(await h.voteOf(comment.id,addresses[1]),0n);
  await social[1].vote(comment.id,-1);assert.equal(await h.voteOf(comment.id,addresses[1]),-1n);
  await social[1].vote(comment.id,1);assert.equal(await h.voteOf(comment.id,addresses[1]),1n);assert.equal((await h.entries(comment.id)).score,1n);
  const mine=await social[0].comments(context,{viewer:addresses[1]});assert.equal(mine[0].myVote,1);
 });
 await test('Native core calls cannot spoof author, rebind profile/blog topics, context or kind',async()=>{
  const data=await social[1].createData(2,ZeroHash,'body','title');
  await assert.rejects(social[1].contract('comments',true).postComment({...data,author:addresses[0]},'0x'));
  await assert.rejects(social[1].contract('comments',true).postComment({...data,targetUri:await h.targetUri(2,addresses[0],ZeroHash)},'0x'));
  const b=await provider.getBlock('latest'),nonce=await cm.getNonce(addresses[0],addresses[0]);
  await assert.rejects(social[0].contract('comments',true).editComment(comment.id,{app:addresses[0],nonce,deadline:b.timestamp+3600,content:'rebound',metadata:socialMetadata(2,ZeroHash,'title')},'0x'));
  await assert.rejects(social[1].create(4,ZeroHash,'bad context','',comment.id));
  await assert.rejects(social[0].create(1,ZeroHash,'duplicate profile','duplicate'));
 });
 await test('Failing second native batch leg reverts vote deletion and every history change',async()=>{
  const reaction=await h.reactionOf(comment.id,addresses[1]),old=await h.entries(reaction),data=await social[1].createData(5,context,'9','',comment.id),coder=AbiCoder.defaultAbiCoder();
  const ops=[{operationType:4,value:0,data:coder.encode(['bytes32'],[reaction]),signatures:[]},{operationType:0,value:0,data:coder.encode([cm.interface.getFunction('postComment').inputs[0]],[data]),signatures:['0x']}];
  const tx=await social[1].contract('comments',true).batchOperations(ops,{gasLimit:4000000});await assert.rejects(tx.wait());
  assert.equal(await h.reactionOf(comment.id,addresses[1]),reaction);assert.equal((await h.entries(reaction)).revisionCount,old.revisionCount);assert.equal((await h.entries(comment.id)).score,1n);
 });
 await test('Editing then tombstoning retains full original/current text in SSTORE2 state',async()=>{
  await social[1].vote(blog.id,1);await social[0].edit(blog.id,'New full blog article','Revised title');await social[0].remove(blog.id);
  await social[1].vote(blog.id,0);assert.equal(await h.voteOf(blog.id,addresses[1]),0n);await assert.rejects(social[1].vote(blog.id,1));
  const history=await social[0].history(blog.id);assert.equal(history.length,3);assert.equal(history[0].text,'Full blog article\nSecond paragraph');assert.equal(history[1].text,'New full blog article');assert.equal(history[2].deleted,true);
  assert.equal((await social[0].entry(blog.id)).deleted,true);await assert.rejects(social[1].reply(blog.id,'reply after tombstone'));
  for(const r of history)assert.notEqual(await provider.getCode(r.pointer),'0x');
 });
 await test('Full chain-derived export rebuilds profiles/blog/replies/votes/history; deterministic ranking',async()=>{
  const index=await social[0].rebuildIndex();assert.equal(index.chainId,31372);assert.equal(index.block.hash,(await provider.getBlock(index.block.number)).hash);
  assert(index.entries.some(e=>e.kind===5&&e.deleted));assert(index.entries.every(e=>e.history.length===e.revisionCount));
  const a={id:'b',score:'1',timestamp:1},b={id:'a',score:'1',timestamp:1};assert.deepEqual(rankSocial([a,b]).map(e=>e.id),['a','b']);
  fs.writeFileSync('data/social-isolated-index.json',JSON.stringify(index,null,2));
 });
 await test('Stale wallet generation blocks social writes before transaction request',async()=>{
  clients[2].assertCurrent=()=>{throw Error('Stale wallet generation')};await assert.rejects(social[2].publishBlog('stale','body'),/Stale wallet/);
 });
}finally{fs.writeFileSync('data/social-onchain-test-report.json',JSON.stringify({scope:'isolated Ganache Shanghai; no localhost RPC; original ECP',results},null,2));await chain.disconnect();}
