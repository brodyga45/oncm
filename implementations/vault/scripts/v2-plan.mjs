import assert from 'node:assert/strict';
/** Only the observed head may advance. Every reviewed policy, code, nonce and
 * legacy-file binding is checked again immediately before starting deployment. */
export function assertFreshV2Plan(current,reviewed){
 assert.equal(current.format,'vault-additive-v2-plan-v1');assert.equal(current.chainId,31373);
 assert.equal(current.initialSupply,'0');assert.deepEqual(current.genesis,[]);
 const rows=current.allocation;assert.equal(rows.recipients.length,rows.weights.length);
 let previous='';let total=0n;
 for(let i=0;i<rows.recipients.length;i++){
  const who=rows.recipients[i].toLowerCase();assert.match(who,/^0x[0-9a-f]{40}$/);
  assert.ok(who>previous,'Beneficiaries must be sorted and unique');previous=who;
  const weight=BigInt(rows.weights[i]);assert.ok(weight>0n);total+=weight;
 }
 assert.equal(total,10000n,'Allocation must equal 100%');
 const policy=x=>({...x,reviewedBlock:undefined});
 assert.deepEqual(policy(current),policy(reviewed),'V2 review became stale; prepare and review again');
}
