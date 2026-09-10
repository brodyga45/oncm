import test from 'node:test';
import assert from 'node:assert/strict';
import {activityBalanceRows,balanceAssetKey,historicalDelta,uniqueBalanceActors,uniqueBalanceAssets} from '../api/activity-balances.mjs';
const actor='0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',asset='0x21dF544947ba3E8b3c32561399E88B52Dc8b2823',other='0xB38864ee9Cf4ea5eacCC605B3F01D30535198F00';
const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',indexed=a=>'0x'+a.slice(2).toLowerCase().padStart(64,'0');
test('Checksum/topic variants are deduplicated before reads; two assets keep exact independent snapshots',async()=>{
 const calls=[],big=9007199254740993123456789n;
 const rows=await activityBalanceRows({transaction:{from:actor,to:actor.toLowerCase()},receipt:{blockNumber:242,logs:[
  {address:asset.toLowerCase(),topics:[topic,indexed(actor),indexed(actor)]},
  {address:other,topics:[topic,indexed(actor),indexed(actor)]},
 ]},collateral:asset,hasCode:async()=>true,readBalance:async(a,who,block)=>{calls.push([a,who,block]);return big+(a.toLowerCase()===asset.toLowerCase()?(block===242?7n:0n):(block===242?-3n:0n));}});
 assert.equal(rows.length,2);assert.equal(calls.length,4);assert(rows.every(r=>r.actor===actor));
 assert.equal(rows[0].asset,asset);assert.equal(rows[0].before,String(big));assert.equal(rows[0].after,String(big+7n));assert.equal(rows[0].delta,'7');
 assert.equal(rows[1].asset,other);assert.equal(rows[1].delta,'-3');
 for(const row of rows)assert.equal(BigInt(row.before)+BigInt(row.delta),BigInt(row.after));
});
test('Identity preserves first display casing and separates contracts, asset kinds and exact position IDs',()=>{
 assert.deepEqual(uniqueBalanceActors([actor,actor.toLowerCase()]),[actor]);
 assert.deepEqual(uniqueBalanceAssets([asset,asset.toLowerCase(),other]),[asset,other]);
 const one={address:asset,kind:'erc1155',positionId:'0x01'},same={address:asset.toLowerCase(),kind:'erc1155',positionId:'1'};
 assert.equal(balanceAssetKey(one),balanceAssetKey(same));
 const list=[one,same,{...one,positionId:'2'},{address:asset,kind:'erc721',tokenId:'1'},asset,other];
 assert.equal(uniqueBalanceAssets(list).length,5);assert.deepEqual(uniqueBalanceAssets(list)[0],one);
 assert.notEqual(balanceAssetKey({...one,positionId:'9007199254740993'}),balanceAssetKey({...one,positionId:'9007199254740992'}));
 assert.throws(()=>balanceAssetKey({...one,tokenId:'1'}),/Ambiguous/);
});
test('Newly deployed token has zero previous balance; no unavailable historical read or duplicate summation',async()=>{
 const calls=[];const rows=await activityBalanceRows({transaction:{from:actor},receipt:{blockNumber:1,logs:[]},collateral:asset,hasCode:async()=>false,readBalance:async(a,who,b)=>{calls.push(b);return 123456789012345678901n;}});
 assert.deepEqual(calls,[1]);assert.equal(rows[0].before,'0');assert.equal(rows[0].delta,'123456789012345678901');
 assert.equal(historicalDelta('123456789012345678902','123456789012345678901'),'-1');
});
