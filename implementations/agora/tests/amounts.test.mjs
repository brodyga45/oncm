import test from 'node:test';import assert from 'node:assert/strict';
import {parseTokenAmount,parseFeePercent,parseSlippagePercent,parseAllocationPercent,assertBaseUnits} from '../sdk/amounts.mjs';
import {parseEther} from '../sdk/chain.mjs';
test('edited numeric20 and decimal string20 produce identical exact token units',()=>{
 assert.equal(parseTokenAmount(20),20000000000000000000n);
 assert.equal(parseTokenAmount('20'),parseTokenAmount(20));
 assert.equal(parseEther(20),parseTokenAmount('20'));
 assert.equal(parseTokenAmount('.02'),20000000000000000n);
 assert.equal(parseTokenAmount('0.000000000000000001'),1n);
});
test('large decimal precision stays exact and unsupported values are never rounded',()=>{
 assert.equal(parseTokenAmount('12345678901234567890.123456789012345678'),12345678901234567890123456789012345678n);
 for(const input of ['',NaN,Infinity,-1,0.1,9007199254740992,'1e3','-1','1,000','abc','1.0000000000000000001','0x20',null])assert.throws(()=>parseTokenAmount(input));
 assert.throws(()=>parseTokenAmount('1'+'0'.repeat(80)),/uint256/);
});
test('fee, slippage and allocation percentages use exact integer scaling',()=>{
 assert.equal(parseFeePercent('2.01'),20100000000000000n);
 assert.equal(parseSlippagePercent('1.25'),125n);
 assert.equal(parseAllocationPercent('33.3333'),333333n);
 for(const [fn,value] of [[parseFeePercent,'10.01'],[parseSlippagePercent,'20.01'],[parseSlippagePercent,'0.001'],[parseAllocationPercent,'33.33333'],[parseAllocationPercent,'100.1']])assert.throws(()=>fn(value));
});
test('SDK base-unit API refuses ambiguous number or decimal inputs',()=>{
 assert.equal(assertBaseUnits(parseTokenAmount('20.5')),20500000000000000000n);
 for(const value of [20,'20',-1n,1n<<256n])assert.throws(()=>assertBaseUnits(value));
});
