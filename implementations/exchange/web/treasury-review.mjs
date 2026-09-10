import React from 'react';
const h=React.createElement;
export function TreasuryCallReview({call}){
  if(!call)return null;
  const r=call.review;
  return h('section',{className:'panel','aria-label':'Exact DAO governance call'},
    h('h3',null,'Review DAO proposal'),
    h('p',null,'Governor execution uses Timelock ',h('code',null,r.treasury),'. No voter receives an automatic payout.'),
    h('p',null,call.description),
    r.baseEpoch!==undefined&&h('p',null,`Allocation #${r.proposalId} · base epoch ${r.baseEpoch} · consent ${r.approved?'true':'false'}. This affects only this allocation proposal.`),
    r.asset&&h('p',null,`${r.assetLabel} · ${r.assetKind} units · decimals ${r.decimals} · `,h('code',null,r.asset)),
    r.amount&&h('p',null,`Exact amount ${r.formattedAmount} ${r.assetKind}; raw units ${r.amount}. Recipient `,h('code',null,r.recipient)),
    r.kind==='claim'&&h('p',null,'Warehouse owner and destination are both ',h('code',null,r.recipient),`. Observed withdrawable raw units ${r.observedClaimable}; execution withdraws the then-current credit minus one raw unit, with zero withdrawal reward.`),
    h('p',null,`Observed block #${r.observedBlock}. Targets and calldata below are immutable within this prepared draft; final execution rechecks all contract conditions.`),
    h('pre',null,JSON.stringify({targets:call.targets,values:call.values,calldatas:call.calldatas},null,2)),
    h('p',{className:'note'},'This creates a Governor proposal only. Voting, queueing and the timelock delay still precede execution. LP transfers do not convert LP to T.'));
}
