import test from 'node:test';
import assert from 'node:assert/strict';
import {allocationProposalView} from '../server/allocation-view.mjs';
import {marketProbability,marketProbabilityLabel,derivedRuleText} from '../src/market-view.mjs';

const baseline={payees:['0xA','0xB'],shares:[600000n,400000n]};
const proposal={baseVersion:0n,expiresAt:100n,executed:false,payees:['0xa','0xB'],shares:[500000n,500000n]};
const snapshot={epoch:0,timestamp:100n};
test('only decreased shares require consent; exact expiry remains applicable',()=>{
  const pending=allocationProposalView(proposal,baseline,[false,false],snapshot);
  assert.equal(pending.canApply,false);assert.equal(pending.active,true);
  assert.deepEqual(pending.requiredConsents,[{address:'0xA',previousShare:600000n,newShare:500000n,approved:false}]);
  assert.equal(allocationProposalView(proposal,baseline,[true,false],snapshot).canApply,true);
});
test('removal requires consent and both losses require both approvals',()=>{
  const removal={...proposal,payees:['0xB'],shares:[1000000n]};
  assert.equal(allocationProposalView(removal,baseline,[false,false],snapshot).requiredConsents[0].newShare,0n);
  const twoLosses={...proposal,payees:['0xA','0xB','0xC'],shares:[400000n,300000n,300000n]};
  assert.equal(allocationProposalView(twoLosses,baseline,[true,false],snapshot).canApply,false);
  assert.equal(allocationProposalView(twoLosses,baseline,[true,true],snapshot).canApply,true);
});
test('revoked, stale, expired and applied proposals cannot be applied',()=>{
  assert.equal(allocationProposalView(proposal,baseline,[false,true],snapshot).canApply,false);
  for(const [p,s,status] of [[proposal,{...snapshot,epoch:1},'Stale'],[proposal,{...snapshot,timestamp:101n},'Expired'],[{...proposal,executed:true},snapshot,'Applied']]){
    const result=allocationProposalView(p,baseline,[true,true],s);
    assert.equal(result.status,status);assert.equal(result.canApply,false);assert.equal(result.active,false);
    assert.equal(result.requiredConsents.length,1);
  }
});
test('unfunded pools have no invented price; huge funded amounts stay finite',()=>{
  const market=(yes,no)=>({pools:[{balances:[yes,no]}]});
  assert.equal(marketProbability({pools:[]}),null);
  assert.equal(marketProbabilityLabel(market('0','0')),'No quote');
  assert.equal(marketProbabilityLabel(market('0','0'),1),'No quote');
  assert.equal(marketProbability(market(10n**400n,10n**400n)),50);
  assert.equal(marketProbabilityLabel(market(1n,3n)), '75%');
  assert.equal(marketProbabilityLabel(market(1n,3n),1), '25%');
});

test('derived display renders registry predicates and never inherited Lean source',()=>{
 for(const kind of [1,2,3,4]){const s={kind,dependency:'dependency-id',deadline:'123',expectedOutcome:2,metadata:{source:'unrelated Nat draft'}};const text=derivedRuleText(s);assert.match(text,/dependency-id/);assert.doesNotMatch(text,/Nat draft/);if(kind===2||kind===3)assert.match(text,/FALSE/);}
 assert.match(derivedRuleText({kind:1,dependency:'d',deadline:123}),/exact deadline/);
});
