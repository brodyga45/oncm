const UINT256_MAX = (1n << 256n) - 1n;

function uint(value, label) {
  const result = BigInt(value);
  if (result < 0n || result > UINT256_MAX) throw Error(`${label} is outside uint256`);
  return result;
}

export function quotedSwapLimits(output, slippageBps, timestamp) {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10000)
    throw Error('Slippage must be an integer between 0 and 10000 bps');
  return Object.freeze({
    minimumAmountOut: uint(output, 'Quoted output') * (10000n - BigInt(slippageBps)) / 10000n,
    deadline: uint(timestamp, 'Timestamp') + 600n,
  });
}

// Capture all limits before approvals. The original Router enforces both limits
// at execution, even if approvals take time or the pool moves in between.
export async function executeBoundedSwap({ amount, slippageBps, limits, quote, now, approve, execute }) {
  const input = uint(amount, 'Swap amount');
  if (input === 0n) throw Error('Swap amount must be positive');
  const timestamp = uint(await now(), 'Timestamp');
  const fixed = limits
    ? Object.freeze({
        minimumAmountOut: uint(limits.minimumAmountOut, 'Minimum output'),
        deadline: uint(limits.deadline, 'Deadline'),
      })
    : quotedSwapLimits(await quote(), slippageBps, timestamp);
  if (fixed.deadline <= timestamp) throw Error('Quote expired; request a new quote');
  await approve(input);
  return execute(Object.freeze({ amount: input, ...fixed }));
}
