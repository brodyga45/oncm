import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const base='http://127.0.0.1:4173/api',results=[];
for(const path of ['/health','/config','/social/snapshot']) {
  const response=await fetch(base+path,{signal:AbortSignal.timeout(10_000)}),data=await response.json();assert.equal(response.status,200);
  if(path==='/health')assert.equal(data.chainId,31373);
  if(path==='/config')assert.equal(data.config.social.format,'oncm-vault-eas-social-v1');
  results.push({path,status:response.status,block:data.block?.number??data.block});
}
// These routes are now unconditional 410; this check cannot publish a chain or local social record.
for(const [method,path] of [['PUT','/profile'],['POST','/comments'],['PATCH','/comments/disabled'],['POST','/comments/disabled/vote']]) {
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:5173'},body:'{}',signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,410);assert.match((await response.json()).error,/direct wallet transaction/);
  results.push({method,path,status:response.status});
}
fs.writeFileSync(fileURLToPath(new URL('../evidence/onchain-social/api-health.json',import.meta.url)),JSON.stringify({at:new Date().toISOString(),scope:'HTTP reads and disabled 410 routes only; no wallet transaction',results},null,2));
console.log('PASS',results.length,'API health / retired offchain write checks');
