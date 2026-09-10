// Read-only acceptance against the existing pilot, including historical receipts.
import {JsonRpcProvider} from 'ethers';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='https://sasquatch-impart-basil.ngrok-free.dev';
const rpc=new JsonRpcProvider(origin+'/rpc',31373,{batchMaxCount:1,cacheTimeout:-1});
try {
  const before=JSON.parse(await readFile(new URL('../evidence/public-pilot/public-transport.json',import.meta.url),'utf8'));
  const instance=JSON.parse(await readFile(new URL('../.state/chain-instance.json',import.meta.url),'utf8'));
  const genesis=await rpc.getBlock(0);assert.equal(genesis.timestamp,instance.genesisTimestamp);
  assert.equal(genesis.hash,'0x6e57f2da1aa9d1fdf5092452ca1fcb015ab3319f4b659ef1b9d7e43bd967e14a');
  const records=[],headers=[];
  for(const n of [533,584,668,753,772,840]) {
    const block=await rpc.getBlock(n);assert.ok(block);headers.push({number:n,hash:block.hash,timestamp:block.timestamp});
    for(const hash of block.transactions){const receipt=await rpc.getTransactionReceipt(hash);assert.ok(receipt);records.push({block:n,hash,status:receipt.status,logs:receipt.logs.length});}
  }
  assert.ok(records.some(x=>x.hash===before.publicProfile.hash&&x.status===1));
  const head=await rpc.getBlock('latest');assert.ok(head.number>840);
  const parent=await rpc.getBlock(head.number-1);assert.ok(head.timestamp>parent.timestamp);
  assert.ok(head.timestamp>headers.at(-1).timestamp);
  const response=await fetch(origin+'/api/config');assert.equal(response.status,200);
  const {config}=await response.json();assert.equal(config.publicWriteEnabled,true);
  const report={checkedAt:new Date().toISOString(),origin,publicWriteEnabled:config.publicWriteEnabled,
    genesis:{hash:genesis.hash,timestamp:genesis.timestamp},head:{number:head.number,timestamp:head.timestamp,parentTimestamp:parent.timestamp},restoredBlocks:headers,restoredReceipts:records};
  await writeFile(new URL('../evidence/public-pilot/restart.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {rpc.destroy();}
