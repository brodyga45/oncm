import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseLocalDeadline,derivedReview,reviewedDerivedArguments} from '../web/derived-review.mjs';
import {DerivedReviewCard} from '../web/derived-review-card.mjs';
// This test process only; neither system timezone nor live application is changed.
process.env.TZ='Asia/Yerevan';
const id='0x'+'ab'.repeat(32),markets=[{id,metadata:{title:'Parent predicate'},outcome:0}];
const review=(extra={})=>derivedReview({kind:1,dependencyId:id,deadlineInput:'2030-01-01T00:00',targetOutcome:1,markets,...extra});
test('2030 local date is rendered as exact local/UTC/Unix values from the same immutable transaction arguments',()=>{
 const r=review();assert(r.valid);assert.equal(r.deadline.utc,'2029-12-31T20:00:00.000Z');assert.equal(r.deadline.unix,1893441600);
 const html=renderToStaticMarkup(React.createElement(DerivedReviewCard,{review:r}));
 for(const value of ['Parent predicate',id,'2030-01-01 00:00:00 UTC+04:00 (Asia/Yerevan)','2029-12-31T20:00:00.000Z','1893441600','Inclusive'])assert(html.includes(value),value);
 assert.deepEqual(reviewedDerivedArguments(r),[1,id,1893441600,0]);assert(Object.isFrozen(r.args));assert(Object.isFrozen(r.deadline));
});
test('Empty, malformed, impossible and nonpositive deadlines have a visible refusal and no submittable arguments',()=>{
 for(const input of ['', 'not-a-date','2030-02-30T00:00','2030-13-01T00:00','2030-01-01T24:00','2030-01-01T00:60','2030-01-01T00:00:60','1969-12-31T23:00']){
  const r=review({deadlineInput:input});assert.equal(r.valid,false);assert.equal(r.args,null);assert.throws(()=>reviewedDerivedArguments(r));
  assert(renderToStaticMarkup(React.createElement(DerivedReviewCard,{review:r})).includes('role="alert"'));
 }
});
test('Leap days and past positive timestamps remain legal; UI does not change contract expiry semantics',()=>{
 assert(parseLocalDeadline('2028-02-29T12:34:56').valid);assert(!parseLocalDeadline('2029-02-29T12:34').valid);
 const r=review({deadlineInput:'2000-01-01T00:00'});assert(r.valid);assert(r.deadline.unix>0);
});
test('No-deadline outcome operator sends zero; target remains exact for both True and False',()=>{
 for(const targetOutcome of [1,2]){
  const r=review({kind:2,deadlineInput:'invalid ignored field',targetOutcome});assert(r.valid);assert.equal(r.deadline,null);
  assert.deepEqual(r.args,[2,id,0,targetOutcome]);assert(renderToStaticMarkup(React.createElement(DerivedReviewCard,{review:r})).includes('None · contract argument 0'));
 }
 assert(!review({kind:3,targetOutcome:0}).valid);
});
test('Dependency changes/removal and invalid new input cannot retain the prior review',()=>{
 const previous=review(),next=review({deadlineInput:''}),other=review({dependencyId:'0x'+'cd'.repeat(32)}),removed=review({markets:[]});
 assert(previous.valid);for(const r of [next,other,removed]){assert(!r.valid);assert.equal(r.args,null);}
 assert.equal(review({kind:0}),null);assert.equal(review({kind:4}),null);
});
test('Nonexistent DST local hour is rejected; a valid adjacent hour has the displayed actual UTC binding',()=>{
 process.env.TZ='America/New_York';
 try{assert(!parseLocalDeadline('2030-03-10T02:30').valid);const r=parseLocalDeadline('2030-03-10T03:30');assert(r.valid);assert.equal(r.utc,'2030-03-10T07:30:00.000Z');}
 finally{process.env.TZ='Asia/Yerevan';}
});
