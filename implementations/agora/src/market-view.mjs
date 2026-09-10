export function marketProbability(market, side = 0) {
  const balances = market?.pools?.[0]?.balances;
  if (!balances || balances.length !== 2) return null;
  const yes = BigInt(balances[0]), no = BigInt(balances[1]), total = yes + no;
  if (total <= 0n) return null;
  // Integer arithmetic stays finite even for amounts too large for JS Number.
  const yesPercent = Number((no * 100n + total / 2n) / total);
  return side === 0 ? yesPercent : 100 - yesPercent;
}
export function marketProbabilityLabel(market, side = 0) {
  const value = marketProbability(market, side);
  return value === null ? 'No quote' : `${value}%`;
}
