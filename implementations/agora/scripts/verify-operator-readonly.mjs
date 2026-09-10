import fs from 'node:fs';
import assert from 'node:assert/strict';
import { decodeEventLog, decodeFunctionData, keccak256 } from 'viem';
import { publicClient as pc } from '../sdk/chain.mjs';
const root = new URL('../', import.meta.url);
const json = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const manifest = json('.local/deployment.json');
const prepared = json('evidence/operator-governance/prepared.json');
const artifact = name => json(`artifacts/${name}.json`);
const read = (address,name,functionName,args,blockNumber) => pc.readContract({address,abi:artifact(name).abi,functionName,args,blockNumber});
const before = 90n, after = 93n;
assert.equal(await pc.getChainId(),31371);
const receipts=[];
for(let blockNumber=91n;blockNumber<=after;blockNumber++) {
  const block=await pc.getBlock({blockNumber,includeTransactions:true});
  for(const tx of block.transactions) {
    const receipt=await pc.getTransactionReceipt({hash:tx.hash});
    assert.equal(receipt.status,'success');
    assert.equal(tx.from.toLowerCase(),prepared.base.creator.toLowerCase());
    assert.equal(tx.to.toLowerCase(),manifest.registry.toLowerCase());
    assert.equal(tx.value,0n);
    receipts.push({block:blockNumber,blockHash:block.hash,timestamp:block.timestamp,hash:tx.hash,from:tx.from,to:tx.to,value:tx.value,gasUsed:receipt.gasUsed,call:decodeFunctionData({abi:artifact('AgoraRegistry').abi,data:tx.input}),events:receipt.logs.map(log=>{
      for(const name of ['AgoraRegistry','ConditionalTokens','FixedProductMarketMaker','FixedProductMarketMakerFactory','TrueToken'])try{return{address:log.address,...decodeEventLog({abi:artifact(name).abi,data:log.data,topics:log.topics})}}catch{}
      return{address:log.address,unparsed:true};
    })});
  }
}
assert.deepEqual(receipts.map(r=>r.call.functionName),['registerCustom','createPool','resolveDerived']);
assert.deepEqual(receipts[0].call.args.slice(0,3),[prepared.operatorId,prepared.newStatement.dependency,prepared.newStatement.parameters]);
const id=receipts[0].events.find(e=>e.eventName==='StatementRegistered').args.statementId;
assert.equal(receipts[2].call.args[0],id);
const statement=await read(manifest.registry,'AgoraRegistry','getStatement',[id],after);
const custom=await read(manifest.registry,'AgoraRegistry','customStatements',[id],after);
const outcome=await read(manifest.registry,'AgoraRegistry','derivedOutcome',[id],after);
assert.equal(statement.kind,4);assert.equal(statement.outcome,2);assert.equal(outcome,2);
assert.deepEqual(custom,[prepared.operatorId,prepared.newStatement.parameters]);
assert.equal(statement.dependency,prepared.base.id);
assert.deepEqual(receipts[2].events.find(e=>e.eventName==='ConditionResolution').args.payoutNumerators,[0n,1n]);
const pool=(await read(manifest.registry,'AgoraRegistry','getPools',[id],after))[0];
const poolState={address:pool,totalSupply:await read(pool,'FixedProductMarketMaker','totalSupply',[],after),balances:await read(pool,'FixedProductMarketMaker','getPoolBalances',[],after)};
assert.equal(poolState.totalSupply,0n);assert.deepEqual(poolState.balances,[0n,0n]);
const snapshots=[];
for(const block of [before,after]) {
  const bases=[];
  for(const baseId of [prepared.base.id,'0xf99268c5feca503310a5e715a06ac97184747585713ea1c5f94e0f5c1092cd41']) {
    const original=await read(manifest.registry,'AgoraRegistry','getStatement',[baseId],block);
    const pools=await read(manifest.registry,'AgoraRegistry','getPools',[baseId],block);
    bases.push({statement:original,pools:await Promise.all(pools.map(async address=>({address,totalSupply:await read(address,'FixedProductMarketMaker','totalSupply',[],block),balances:await read(address,'FixedProductMarketMaker','getPoolBalances',[],block)})))});
  }
  snapshots.push({block,bases,ownerT:await read(manifest.token,'TrueToken','balanceOf',[prepared.base.creator],block),ctfT:await read(manifest.token,'TrueToken','balanceOf',[manifest.ctf],block),operator:await read(manifest.registry,'AgoraRegistry','operators',[prepared.operatorId],block),count:await read(manifest.registry,'AgoraRegistry','count',[],block)});
}
assert.deepEqual(snapshots[0].bases,snapshots[1].bases);assert.equal(snapshots[0].ownerT,snapshots[1].ownerT);assert.equal(snapshots[0].ctfT,snapshots[1].ctfT);assert.deepEqual(snapshots[0].operator,snapshots[1].operator);assert.equal(snapshots[1].count-snapshots[0].count,1n);
const code=await pc.getCode({address:prepared.address,blockNumber:after});assert.equal(code,artifact('ResolvedAfterOperator').deployedBytecode);assert.equal(keccak256(code),prepared.runtimeHash);
const output={mode:'read-only verification of actual scoped browser transactions; no scripted writes',chainId:31371,before,after,statement,custom,poolState,computedOutcome:outcome,receipts,snapshots,checks:{existingOriginalOperatorBytecode:true,existingSafeTimelockAdmissionRecorded:'prepared.json blocks12/14; not replayed',exactCustomBinding:true,zeroFunding:true,originalCTFPayoutFalse:true,originalBasesAndPoolsUnchanged:true,ownerTAndCTFCollateralUnchanged:true,oldNOStillOpen:true},limits:['No new operator alias or second admission was fabricated','No operator disable/version migration or governance failure branch in this pass','No funding/trading of this custom market','Previously refused NO settlement and matching kind2 draft remain untouched']};
fs.writeFileSync(new URL('evidence/operator-governance/verified.json',root),JSON.stringify(output,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
console.log(JSON.stringify({statement:id,pool,blocks:receipts.map(r=>String(r.block)),transactions:receipts.map(r=>r.hash),outcome,originalMarketsUnchanged:true}));
