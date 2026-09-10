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

/** Derived semantics use immutable registry fields, not an inherited Lean editor draft. */
export function derivedRuleText(statement){
 const kind=Number(statement.kind),dependency=statement.dependency,deadline=String(statement.deadline),outcome=Number(statement.expectedOutcome)===1?'TRUE':'FALSE';
 if(kind===1)return `ResolvedBy(${dependency}, ${deadline}): TRUE if the dependency resolved at or before the deadline; FALSE after the deadline otherwise. An unresolved dependency stays pending at the exact deadline.`;
 if(kind===2)return `ResolvedAs(${dependency}, ${outcome}): pending while the dependency is open; TRUE for the specified outcome, FALSE for its opposite.`;
 if(kind===3)return `ResolvedAsBy(${dependency}, ${outcome}, ${deadline}): TRUE only for the specified outcome resolved at or before the deadline; pending until resolution or expiry, then FALSE otherwise.`;
 if(kind===4)return `Governance-approved operator on ${dependency}. The immutable registered evaluator and parameters define its result.`;
 return '';
}
