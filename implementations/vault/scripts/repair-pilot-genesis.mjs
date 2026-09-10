// Explicit offline repair of duplicate synthetic genesis headers introduced by
// the old resume --timestamp flag. Never resets accounts, transactions or head.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodeRlp,keccak256,toBeHex} from 'ethers';
import {validateSnapshot} from './state-snapshot.mjs';
const base=new URL('../.state/chain/',import.meta.url);
const file=new URL('anvil-state.json',base);
const report=await validateSnapshot(file,{maxBytes:64*1024*1024});
const state=JSON.parse(await fs.readFile(file,'utf8'));
const instance=JSON.parse(await fs.readFile(new URL('../.state/chain-instance.json',import.meta.url),'utf8'));
const genesis=state.blocks.filter(b=>BigInt(b.header.number)===0n);
const original=genesis.filter(b=>BigInt(b.header.timestamp)===BigInt(instance.genesisTimestamp));
assert.equal(original.length,1,'Exactly one original genesis must remain available');
assert.ok(genesis.length>1,'Repair is unnecessary');
assert.ok(genesis.every(b=>b.transactions.length===0),'Never remove a transaction-bearing block');
const h=original[0].header,q=x=>BigInt(x)===0n?'0x':toBeHex(BigInt(x));
const fields=[h.parentHash,h.sha3Uncles,h.miner,h.stateRoot,h.transactionsRoot,h.receiptsRoot,h.logsBloom,q(h.difficulty),q(h.number),q(h.gasLimit),q(h.gasUsed),q(h.timestamp),h.extraData,h.mixHash,h.nonce,q(h.baseFeePerGas),h.withdrawalsRoot,q(h.blobGasUsed),q(h.excessBlobGas),h.parentBeaconBlockRoot];
const originalHash=keccak256(encodeRlp(fields));
assert.equal(originalHash,state.blocks.find(b=>BigInt(b.header.number)===1n).header.parentHash,'Original header must match unchanged block1 parent');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const unchanged=({blocks,...rest})=>({otherFields:digest(rest),blocksAboveZero:digest(blocks.filter(b=>BigInt(b.header.number)!==0n))});
const before=unchanged(state);
state.blocks=state.blocks.filter(b=>BigInt(b.header.number)!==0n||b===original[0]);
assert.deepEqual(unchanged(state),before);
if(!process.argv.includes('--apply')){console.log(JSON.stringify({plan:true,checkpoint:report.blockNumber,removedSyntheticHeaders:genesis.length-1,originalHash,sourceSha256:report.sha256}));process.exit(0);}
// Stop the actual chain first; an unexpected listening RPC aborts the repair.
try{await fetch('http://127.0.0.1:9547',{signal:AbortSignal.timeout(1000)});throw Error('Stop the chain before repair');}
catch(e){if(e.cause?.code!=='ECONNREFUSED')throw e;}
const backup=new URL('pre-genesis-repair-'+report.blockNumber+'.json',base);
await fs.copyFile(file,backup,fs.constants.COPYFILE_EXCL);
const temp=new URL('anvil-state.genesis-repair.tmp',base);
await fs.writeFile(temp,JSON.stringify(state));
const repaired=await validateSnapshot(temp,{maxBytes:64*1024*1024});
assert.equal((await validateSnapshot(file)).sha256,report.sha256,'Primary changed during offline repair');
const handle=await fs.open(temp,'r');try{await handle.sync();}finally{await handle.close();}
await fs.rename(temp,file);
await fs.writeFile(new URL('anvil-state.json.validation.json',base),JSON.stringify(repaired,null,2)+'\n');
const evidence={format:'vault-explicit-genesis-header-repair-v1',checkedAt:new Date().toISOString(),checkpoint:report.blockNumber,originalHash,removedSyntheticTimestamps:genesis.filter(b=>b!==original[0]).map(b=>Number(BigInt(b.header.timestamp))),before:report,after:repaired,unchanged:before,transactionsRemoved:0};
await fs.writeFile(new URL('../evidence/public-pilot/genesis-repair.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
