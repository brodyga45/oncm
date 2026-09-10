import { Interface, ZeroAddress, keccak256, toUtf8Bytes } from 'ethers';

export const GOVERNOR_STATES = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];
const aliases = { Governor: 'VaultGovernor', Timelock: 'TimelockController' };
const asJson = (value) => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? String(v) : v));

// Decode only an ABI associated with this target, never guess using a selector
// from an unrelated contract. Unknown targets retain their exact raw calldata.
export function decodeGovernanceCall(target, data, value, config, abis) {
  const key = Object.keys(config.addresses).find((k) => config.addresses[k].toLowerCase() === target.toLowerCase());
  if (!key || !abis[aliases[key] || key]) return null;
  try {
    const decoded = new Interface(abis[aliases[key] || key]).parseTransaction({ data, value });
    if (!decoded) return null;
    return { contract: key, method: decoded.name, signature: decoded.signature,
      args: decoded.fragment.inputs.map((arg, i) => ({ name: arg.name || String(i), type: arg.format('sighash'), value: asJson(decoded.args[i]) })) };
  } catch { return null; }
}

export function governanceEligibility({ state, account, proposer, hasVoted, snapshotVotes, eta, timestamp }) {
  const connected = !!account && account !== ZeroAddress;
  const yes = { eligible: true, reason: '' };
  const no = (reason) => ({ eligible: false, reason });
  return {
    vote: !connected ? no('Подключите кошелёк') : state !== 1 ? no('Голосование сейчас закрыто')
      : hasVoted ? no('Этот адрес уже проголосовал') : BigInt(snapshotVotes || 0) === 0n
        ? no('У адреса нет голосового веса на snapshot') : yes,
    queue: !connected ? no('Подключите кошелёк') : state !== 4 ? no('Нужно состояние Succeeded') : yes,
    execute: !connected ? no('Подключите кошелёк') : state !== 5 ? no('Нужно состояние Queued')
      : BigInt(eta) > BigInt(timestamp) ? no('Задержка Timelock ещё не истекла') : yes,
    cancel: !connected ? no('Подключите кошелёк') : state !== 0 ? no('Автор может отменить только Pending')
      : account.toLowerCase() !== proposer.toLowerCase() ? no('Отменить может только автор') : yes,
  };
}

export async function readGovernance({ provider, config, abis, governor: g, membership, timelockAt }, account = '') {
  const block = await provider.getBlock('latest'), at = { blockTag: block.number };
  const [clock, clockMode, countingMode, timelockAddress, votingDelay, votingPeriod, threshold, numerator, denominator, currentVotes] = await Promise.all([
    g.clock(at), g.CLOCK_MODE(at), g.COUNTING_MODE(at), g.timelock(at),
    g.votingDelay(at), g.votingPeriod(at), g.proposalThreshold(at), g['quorumNumerator()'](at), g.quorumDenominator(at),
    account ? membership.getVotes(account, at) : 0n,
  ]);
  const timelock = timelockAt(timelockAddress);
  const [delay, timelockBalance, logs] = await Promise.all([
    timelock.getMinDelay(at), provider.getBalance(timelockAddress, block.number),
    g.queryFilter(g.filters.ProposalCreated(), config.deploymentBlock || 0, block.number),
  ]);
  const proposerVotes = account && BigInt(clock) > 0n ? await g.getVotes(account, BigInt(clock) - 1n, at) : 0n;
  const proposals = await Promise.all(logs.map(async (log) => {
    const a = log.args, id = String(a.proposalId);
    // Result.values is Array.prototype.values, hence event values use index3.
    const targets = [...a.targets], values = a[3].map(String), calldatas = [...a.calldatas];
    const descriptionHash = keccak256(toUtf8Bytes(a.description));
    const [state, snapshot, deadline, eta, votes, hasVoted, hash] = await Promise.all([
      g.state(id, at), g.proposalSnapshot(id, at), g.proposalDeadline(id, at), g.proposalEta(id, at),
      g.proposalVotes(id, at), account ? g.hasVoted(id, account, at) : false,
      g.hashProposal(targets, values, calldatas, descriptionHash, at),
    ]);
    if (String(hash) !== id) throw Error('ProposalCreated payload does not match Governor.hashProposal');
    // OZ Votes rejects future/current checkpoints. Pending quorum/weight is not zero.
    const historical = BigInt(clock) > BigInt(snapshot);
    const [quorum, weight] = historical ? await Promise.all([
      g.quorum(snapshot, at), account ? g.getVotes(account, snapshot, at) : null,
    ]) : [null, null];
    const counted = BigInt(votes[1]) + BigInt(votes[2]);
    const eligibility = governanceEligibility({ state: Number(state), account, proposer: a.proposer,
      hasVoted, snapshotVotes: weight, eta, timestamp: block.timestamp });
    const actions = {};
    for (const [action, result] of Object.entries(eligibility)) {
      if (!result.eligible) { actions[action] = { available: false, reason: result.reason }; continue; }
      try {
        // Actual caller + full ordered batch through Governor/Timelock. A simulation
        // can fail when target conditions, roles or Timelock funds have changed.
        const method = action === 'vote' ? 'castVote' : action;
        const args = action === 'vote' ? [id, 1] : [targets, values, calldatas, descriptionHash];
        await g[method].staticCall(...args, { ...at, from: account });
        actions[action] = { available: true, reason: '', simulatedAt: block.number };
      } catch (e) {
        actions[action] = { available: false, reason: e.shortMessage || e.reason || e.message,
          revertData: typeof e.data === 'string' ? e.data : null };
      }
    }
    return { id, proposer: a.proposer, description: a.description, descriptionHash, targets, values, calldatas,
      calls: targets.map((target, i) => ({ target, value: values[i], data: calldatas[i],
        decoded: decodeGovernanceCall(target, calldatas[i], values[i], config, abis) })),
      state: Number(state), stateName: GOVERNOR_STATES[Number(state)], start: String(snapshot), end: String(deadline),
      eta: String(eta), votes: [...votes].map(String), quorum: quorum === null ? null : String(quorum),
      quorumVotes: String(counted), quorumReached: quorum === null ? null : counted >= quorum,
      snapshotVotes: weight === null ? null : String(weight), hasVoted, actions,
      totalValue: String(values.reduce((sum, value) => sum + BigInt(value), 0n)),
      txHash: log.transactionHash, blockNumber: log.blockNumber,
    };
  }));
  return { account, blockNumber: block.number, blockHash: block.hash, blockTimestamp: block.timestamp,
    clock: String(clock), clockMode, countingMode, states: GOVERNOR_STATES, proposals: proposals.reverse(),
    timelock: timelockAddress, timelockDelay: String(delay), timelockBalance: String(timelockBalance),
    votingDelay: String(votingDelay), votingPeriod: String(votingPeriod), proposalThreshold: String(threshold),
    quorumNumerator: String(numerator), quorumDenominator: String(denominator), currentVotes: String(currentVotes),
    proposerVotes: String(proposerVotes), canPropose: !!account && account !== ZeroAddress && BigInt(proposerVotes) >= BigInt(threshold) };
}
