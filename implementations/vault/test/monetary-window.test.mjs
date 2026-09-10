import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface} from 'ethers';
import {monetaryWindow} from '../web/monetary-window.mjs';
import {MONETARY_ABI} from '../sdk/monetary-policy.mjs';

const input={start:'2030-01-01 12:34:56',end:'2030-01-08 12:34:56',claimDeadline:'2030-02-01 12:34:56'};
test('local program dates preserve seconds through visible UTC review and the actual ordered createProgram ABI',()=>{
  const review=monetaryWindow(input,'1');assert.equal(review.valid,true);
  const expected=[new Date(2030,0,1,12,34,56),new Date(2030,0,8,12,34,56),new Date(2030,1,1,12,34,56)];
  review.rows.forEach((row,i)=>{assert.equal(row.utc,expected[i].toISOString());assert.equal(row.unix,expected[i].getTime()/1000);assert.equal(review.values[row.key],String(row.unix));});
  const abi=new Interface(MONETARY_ABI.rewards),address='0x'+'12'.repeat(20);
  const bytes=abi.encodeFunctionData('createProgram',['0',address,review.values.start,review.values.end,review.values.claimDeadline,'1',address]);
  const decoded=abi.decodeFunctionData('createProgram',bytes);
  assert.deepEqual([...decoded].slice(2,5),expected.map(d=>BigInt(d.getTime()/1000)));
});
test('invalid calendar, numeric timestamps, reversed windows and a start equal to the observed block fail closed',()=>{
  for(const changed of [{start:'2030-02-30 12:00'},{start:'1893456000'},{end:input.start},{claimDeadline:input.end},{start:'2030-01-01T12:34:56Z'}])assert.equal(monetaryWindow({...input,...changed}).valid,false);
  const good=monetaryWindow(input);assert.equal(monetaryWindow(input,good.values.start).valid,false);assert.equal(monetaryWindow(input,String(BigInt(good.values.start)-1n)).valid,true);
});
