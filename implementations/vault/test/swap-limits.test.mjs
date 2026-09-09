import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBoundedSwap, quotedSwapLimits } from '../sdk/swap-limits.mjs';

test('displayed limits survive approvals and never request another quote', async () => {
  let timestamp = 1000, approved = false;
  const shown = quotedSwapLimits(1000n, 100, timestamp);
  const result = await executeBoundedSwap({
    amount: 100n, limits: shown,
    quote: async () => { throw Error('Must not re-quote'); },
    now: async () => timestamp,
    approve: async (amount) => { assert.equal(amount, 100n); approved = true; timestamp = 2000; },
    execute: async (input) => {
      assert.ok(approved);
      // The Router will reject this expired deadline; the SDK must not extend it.
      assert.deepEqual(input, { amount: 100n, minimumAmountOut: 990n, deadline: 1600n });
      return 'receipt';
    },
  });
  assert.equal(result, 'receipt');
});

test('SDK-only convenience swap freezes its quote before approvals', async () => {
  let reads = 0, quotes = 0, approved = false;
  await executeBoundedSwap({
    amount: 25n, slippageBps: 200,
    now: async () => { reads++; return 10; },
    quote: async () => { quotes++; assert.equal(approved, false); return 100n; },
    approve: async () => { approved = true; },
    execute: async (input) => assert.deepEqual(input, {
      amount: 25n, minimumAmountOut: 98n, deadline: 610n,
    }),
  });
  assert.equal(reads, 1);
  assert.equal(quotes, 1);
});

test('expired or invalid limits cannot start approvals', async () => {
  const base = {
    amount: 1n, now: async () => 100,
    approve: async () => assert.fail('Approval must not start'),
    execute: async () => assert.fail('Execution must not start'),
  };
  await assert.rejects(executeBoundedSwap({ ...base, limits: { minimumAmountOut: 1n, deadline: 100n } }), /expired/);
  await assert.rejects(executeBoundedSwap({ ...base, limits: { minimumAmountOut: -1n, deadline: 200n } }), /uint256/);
  await assert.rejects(executeBoundedSwap({ ...base, amount: 0n }), /positive/);
  for (const bps of [-1, 10001, 1.5, NaN]) assert.throws(() => quotedSwapLimits(10n, bps, 100), /Slippage/);
});
