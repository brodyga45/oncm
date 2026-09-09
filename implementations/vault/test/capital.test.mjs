import test from 'node:test';
import assert from 'node:assert/strict';
import { settlementInventory } from '../sdk/capital.mjs';
const T = '0x' + '11'.repeat(20),
  Y = '0x' + '22'.repeat(20);
test('LP stress accounts for raw proportional inventory and side-dependent final payout', () => {
  const p = {
    tokens: [T, Y],
    balances: ['1000', '2000'],
    totalSupply: '100',
    bptBalance: '10',
    collateral: T,
    side: 0,
  };
  const r = settlementInventory(p);
  assert.equal(r.truePayout, '300');
  assert.equal(r.falsePayout, '100');
  assert.equal(settlementInventory({ ...p, side: 1 }).falsePayout, '300');
  assert.equal(
    settlementInventory({ ...p, tokens: [Y, T], balances: ['2000', '1000'] }).truePayout,
    '300',
  );
});
test('LP stress floors raw amounts and rejects impossible ownership', () => {
  const p = {
    tokens: [T, Y],
    balances: ['13', '19'],
    totalSupply: '10',
    bptBalance: '1',
    collateral: T,
    side: 0,
  };
  assert.equal(settlementInventory(p).truePayout, '2');
  assert.throws(() => settlementInventory({ ...p, totalSupply: '0' }), /initialized/);
  assert.throws(() => settlementInventory({ ...p, bptBalance: '11' }), /ownership/);
});
