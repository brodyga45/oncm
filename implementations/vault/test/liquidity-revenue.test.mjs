import test from 'node:test';
import assert from 'node:assert/strict';
import { liquidityLimits, validateLiquidityQuote } from '../sdk/liquidity.mjs';
import { creatorFromAggregate } from '../sdk/revenue.mjs';
const A = '0x' + '11'.repeat(20), B = '0x' + '22'.repeat(20), P = '0x' + '33'.repeat(20);
test('per-token liquidity bounds use conservative integer rounding', () => {
  assert.deepEqual(liquidityLimits([100n, 1n], 100, 'join'), [101n, 2n]);
  assert.deepEqual(liquidityLimits([100n, 1n], 100, 'exit'), [99n, 0n]);
  assert.throws(() => liquidityLimits([1n], -1, 'join'), /Slippage/);
});
test('captured LP quote is bound to pool, actor, token order, BPT and initialization input', () => {
  const q = { kind: 'join', pool: P, account: A, tokens: [A, B], bpt: '10', amounts: ['5', '8'], limits: ['6', '9'] };
  const request = { kind: 'join', pool: P, account: A, tokens: [A, B], bpt: 10n };
  assert.deepEqual(validateLiquidityQuote(q, request).limits, [6n, 9n]);
  for (const changed of [{ pool: A }, { account: B }, { tokens: [B, A] }, { bpt: 11n }]) assert.throws(() => validateLiquidityQuote(q, { ...request, ...changed }));
  const initial = { ...q, kind: 'initialize', minimumBpt: 9n };
  assert.throws(() => validateLiquidityQuote(initial, { ...request, kind: 'initialize', amounts: [5n, 9n] }), /Initial amounts/);
});
test('creator preview keeps zero-fee cases and upstream round-up protocol portion', () => {
  const one = 10n ** 18n;
  assert.equal(creatorFromAggregate(100n, 0n, one / 5n, one / 5n), 100n);
  assert.equal(creatorFromAggregate(100n, one / 2n, 0n, one / 2n), 0n);
  assert.equal(creatorFromAggregate(60n, one / 2n, one / 5n, one * 6n / 10n), 10n);
  assert.equal(creatorFromAggregate(61n, one / 2n, one / 5n, one * 6n / 10n), 10n);
});


test('V2 collection includes protocol plus creator, legacy keeps original creator-only method',async()=>{
 const {revenueCollectionMethod,protocolFromAggregate}=await import('../sdk/revenue.mjs');
 assert.equal(revenueCollectionMethod({}),'collect');assert.equal(revenueCollectionMethod({protocolVersion:'2',monetaryPolicy:{status:'deployed'}}),'collectAll');
 assert.equal(revenueCollectionMethod({protocolVersion:'2',monetaryPolicy:{status:'prepared'}}),'collect');
 // Protocol50%, creator20% of the remaining50% -> total60%; 60 aggregate:50protocol+10creator.
 assert.equal(protocolFromAggregate(60n,500000000000000000n,200000000000000000n,600000000000000000n),50n);
 assert.equal(protocolFromAggregate(20n,0n,200000000000000000n,200000000000000000n),0n);
 assert.equal(protocolFromAggregate(50n,500000000000000000n,0n,500000000000000000n),50n);
});
