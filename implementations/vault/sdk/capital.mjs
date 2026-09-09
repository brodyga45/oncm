export function settlementInventory({
  tokens,
  balances,
  totalSupply,
  bptBalance,
  collateral,
  side,
}) {
  const supply = BigInt(totalSupply),
    owned = BigInt(bptBalance);
  if (supply <= 0n) throw Error('Pool is not initialized');
  if (owned < 0n || owned > supply) throw Error('Invalid LP ownership');
  if (tokens.length !== 2 || balances.length !== 2) throw Error('Expected a two-token pool');
  const baseIndex = tokens.findIndex((t) => t.toLowerCase() === collateral.toLowerCase());
  if (baseIndex < 0 || ![0, 1].includes(side)) throw Error('Invalid CTF pool');
  const inventory = balances.map((b) => (BigInt(b) * owned) / supply),
    base = inventory[baseIndex],
    outcome = inventory[1 - baseIndex];
  return {
    bptBalance: String(owned),
    totalSupply: String(supply),
    baseInventory: String(base),
    outcomeInventory: String(outcome),
    truePayout: String(base + (side === 0 ? outcome : 0n)),
    falsePayout: String(base + (side === 1 ? outcome : 0n)),
    assumption:
      'Current proportional exit inventory, then binary CTF redemption; no future swaps, gas, rounding beyond raw floor or external token prices.',
  };
}
