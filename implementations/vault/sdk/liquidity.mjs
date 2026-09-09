const sameAddress = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export function liquidityLimits(amounts, bps, kind) {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw Error('Slippage must be 0–10000 integer bps');
  return amounts.map((amount) => {
    const n = BigInt(amount);
    if (n < 0n) throw Error('Negative liquidity amount');
    return kind === 'join' ? (n * (10000n + BigInt(bps)) + 9999n) / 10000n
      : n * (10000n - BigInt(bps)) / 10000n;
  });
}

export function validateLiquidityQuote(quote, { kind, pool, account, tokens, bpt, amounts }) {
  if (!quote || quote.kind !== kind || !sameAddress(quote.pool, pool) || !sameAddress(quote.account, account))
    throw Error('Liquidity quote belongs to different operation, pool or wallet');
  if (quote.tokens.length !== tokens.length || tokens.some((t, i) => !sameAddress(t, quote.tokens[i])))
    throw Error('Liquidity quote token order differs');
  if (kind === 'initialize') {
    if (quote.amounts.length !== amounts.length || amounts.some((a, i) => BigInt(a) !== BigInt(quote.amounts[i])))
      throw Error('Initial amounts changed; request a new quote');
    if (BigInt(quote.minimumBpt) < 0n) throw Error('Invalid minimum BPT');
  } else if (BigInt(quote.bpt) !== BigInt(bpt) || BigInt(bpt) <= 0n) {
    throw Error('BPT amount changed; request a new quote');
  }
  if (quote.limits.length !== tokens.length || quote.limits.some((x) => BigInt(x) < 0n))
    throw Error('Invalid per-token liquidity limits');
  return { ...quote, amounts: quote.amounts.map(BigInt), limits: quote.limits.map(BigInt) };
}
