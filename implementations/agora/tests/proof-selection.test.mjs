import test from 'node:test';
import assert from 'node:assert/strict';
import {createProofSelection,assertProofBinding} from '../src/proof-selection.mjs';

test('navigation invalidates a pending import, including returning to its market',()=>{
 const selection=createProofSelection();selection.select('A');const request=selection.begin();
 assert.equal(selection.current(request),true);
 selection.select('B');assert.equal(selection.current(request),false);
 selection.select('A');assert.equal(selection.current(request),false);
});
test('only the latest concurrent certificate import can populate the editor',()=>{
 const selection=createProofSelection();selection.select('A');
 const first=selection.begin(),second=selection.begin();
 assert.equal(selection.current(first),false);assert.equal(selection.current(second),true);
});
test('submission preserves imported goal/profile/outcome/certificate binding',()=>{
 const statement={id:'A',goalHash:'goal',profileId:'profile'};
 const binding={statementId:'A',goalHash:'goal',profileId:'profile',outcome:2,certificate:'seal'};
 assert.doesNotThrow(()=>assertProofBinding(binding,statement,'2','seal'));
 for(const update of [{id:'B'},{goalHash:'other'},{profileId:'other'}])
  assert.throws(()=>assertProofBinding(binding,{...statement,...update},2,'seal'));
 assert.throws(()=>assertProofBinding(binding,statement,1,'seal'));
 assert.throws(()=>assertProofBinding(binding,statement,2,'changed'));
 assert.throws(()=>assertProofBinding(binding,undefined,2,'seal'));
});
