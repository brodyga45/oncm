// All arguments are read at the same onchain block by the API.
export function allocationProposalView(proposal, baseline, approvals, {epoch, timestamp}) {
  const next = new Map(proposal.payees.map((address, i) => [address.toLowerCase(), BigInt(proposal.shares[i])]));
  const requiredConsents = baseline.payees.flatMap((address, i) => {
    const previousShare = BigInt(baseline.shares[i]), newShare = next.get(address.toLowerCase()) ?? 0n;
    return newShare < previousShare ? [{address, previousShare, newShare, approved: approvals[i] === true}] : [];
  });
  const status = proposal.executed ? 'Applied'
    : BigInt(proposal.baseVersion) !== BigInt(epoch) ? 'Stale'
      : BigInt(timestamp) > BigInt(proposal.expiresAt) ? 'Expired'
        : requiredConsents.every(item => item.approved) ? 'Ready to apply' : 'Awaiting consent';
  return {...proposal, approvals, requiredConsents, status,
    active: status === 'Ready to apply' || status === 'Awaiting consent',
    canApply: status === 'Ready to apply'};
}
