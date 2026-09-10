import {test} from 'node:test';
import assert from 'node:assert/strict';
import {socialWriteRetired} from '../api/onchain-social.mjs';
import {ExchangeSocialSDK,socialMetadata,rankSocial,decodeSocialRevision} from '../sdk/social.mjs';
import {AbiCoder,ZeroHash} from 'ethers';
test('Old authenticated social writes cease to be authority after activation; jobs stay available',()=>{
 for(const method of ['POST','PATCH','DELETE'])for(const url of ['/api/profile','/api/comments/id','/api/comments/id/vote'])assert(socialWriteRetired(method,url,true));
 for(const url of ['/api/proof/jobs','/api/auth/verify','/api/packages'])assert.equal(socialWriteRetired('POST',url,true),false);
 assert.equal(socialWriteRetired('GET','/api/comments/id',true),false);assert.equal(socialWriteRetired('POST','/api/profile',false),false);
});
test('Canonical metadata has independent nonce and fixed context, Unicode text is byte encoded',()=>{
 const a=socialMetadata(2,ZeroHash,'α'),b=socialMetadata(2,ZeroHash,'α');assert.equal(a.length,4);assert.equal(a[0].value,'0x02');assert.equal(a[1].value,ZeroHash);assert.equal(a[2].value,'0xceb1');assert.notEqual(a[3].value,b[3].value);
});
test('Large exact integer scores and deterministic ties never use float subtraction',()=>{
 const rows=[{id:'z',score:'9007199254740993',timestamp:1},{id:'a',score:'9007199254740992',timestamp:2}];assert.equal(rankSocial(rows)[0].id,'z');assert.equal(rankSocial(rows,'new')[0].id,'a');
});
test('Revision decoder preserves original complete body/tombstone and rejects unknown format',()=>{
 const encode=v=>AbiCoder.defaultAbiCoder().encode(['uint8','uint8','address','bytes32','bytes32','string','string','uint64','bool'],[v,2,'0x'+'1'.repeat(40),ZeroHash,ZeroHash,'title','body\nα',123,true]);const r=decodeSocialRevision(encode(1));assert.equal(r.text,'body\nα');assert.equal(r.deleted,true);assert.equal(r.timestamp,123);assert.throws(()=>decodeSocialRevision(encode(2)));
});

test('Invalid UTF-8 from a direct contract caller preserves raw bytes without breaking the feed',()=>{
 const raw=AbiCoder.defaultAbiCoder().encode(['uint8','uint8','address','bytes32','bytes32','bytes','bytes','uint64','bool'],[1,2,'0x'+'1'.repeat(40),ZeroHash,ZeroHash,'0xff','0xfe',1,false]);
 const r=decodeSocialRevision(raw);assert.equal(r.utf8Valid,false);assert.equal(r.titleBytes,'0xff');assert.equal(r.textBytes,'0xfe');assert(r.text.length>0);
});

test('Post-receipt refresh bypasses cached latest and pins all social reads to the current numbered block',async()=>{
 const seen=[];const registry='0x'+'1'.repeat(40);
 const client={deployment:{contracts:{protocol:registry}},provider:{
  getNetwork:async()=>({chainId:31372n}),send:async(method,args)=>{seen.push([method,args]);return '0x9f';},
  getBlock:async tag=>{seen.push(['block',tag]);return {number:tag==='latest'?158:tag,hash:'0xcurrent'};}
 }};
 const social=new ExchangeSocialSDK(client,{status:'ready',chainId:31372,registry},{});
 assert.equal((await social.block()).number,159);assert.deepEqual(seen,[['eth_blockNumber',[]],['block',159]]);
 client.provider.getBlock=async()=>null;await assert.rejects(social.block(),/unavailable/);
});
