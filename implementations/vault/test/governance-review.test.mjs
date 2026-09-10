import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface, ZeroAddress } from 'ethers';
import { decodeGovernanceCall, governanceEligibility, readGovernance } from '../sdk/governance.mjs';

const account = '0x0000000000000000000000000000000000000001';
const target = '0x0000000000000000000000000000000000000002';
const config = { addresses: { Membership: target }, deploymentBlock: 7 };
const abis = { Membership: ['function setMember(address member,bool enabled)'] };
const data = new Interface(abis.Membership).encodeFunctionData('setMember', [account, true]);

test('ABI review is target-bound and preserves exact arguments', () => {
  const decoded = decodeGovernanceCall(target, data, 0, config, abis);
  assert.equal(decoded.signature, 'setMember(address,bool)');
  assert.deepEqual(decoded.args.map((a) => a.value), [account, true]);
  assert.equal(decodeGovernanceCall(account, data, 0, config, abis), null);
  assert.equal(decodeGovernanceCall(target, '0x01020304', 0, config, abis), null);
});

test('wallet actions respect repeat votes, snapshot power and inclusive ETA', () => {
  const base = { state: 1, account, proposer: account, hasVoted: false, snapshotVotes: '1', eta: '100', timestamp: 99 };
  assert.equal(governanceEligibility(base).vote.eligible, true);
  assert.equal(governanceEligibility({ ...base, hasVoted: true }).vote.eligible, false);
  assert.equal(governanceEligibility({ ...base, snapshotVotes: '0' }).vote.eligible, false);
  assert.equal(governanceEligibility({ ...base, state: 5 }).execute.eligible, false);
  assert.equal(governanceEligibility({ ...base, state: 5, timestamp: 100 }).execute.eligible, true);
  assert.equal(governanceEligibility({ ...base, state: 4, snapshotVotes: '0' }).queue.eligible, true);
  assert.equal(governanceEligibility({ ...base, state: 0, account: target }).cancel.eligible, false);
  assert.equal(governanceEligibility({ ...base, state: 0 }).cancel.eligible, true);
});

function harness({ state = 0, snapshot = 100n, failExecute = false } = {}) {
  const views = [], simulations = [];
  const view = (name, value) => async (...args) => {
    assert.equal(args.at(-1).blockTag, 110, name + ' must share blockTag');
    views.push(name); return value;
  };
  const governor = {
    clock: view('clock', 100n), CLOCK_MODE: view('mode', 'mode=blocknumber&from=default'),
    COUNTING_MODE: view('counting', 'support=bravo&quorum=for,abstain'),
    timelock: view('timelock', target), votingDelay: view('delay', 1n), votingPeriod: view('period', 8n),
    proposalThreshold: view('threshold', 0n), 'quorumNumerator()': view('numerator', 50n),
    quorumDenominator: view('denominator', 100n), state: view('state', BigInt(state)),
    proposalSnapshot: view('snapshot', snapshot), proposalDeadline: view('deadline', 108n),
    proposalEta: view('eta', state === 5 ? 1000n : 0n), proposalVotes: view('votes', [5n, 1n, 1n]),
    hasVoted: view('voted', false), hashProposal: view('hash', 1n),
    quorum: view('quorum', 2n), getVotes: view('pastVotes', 1n),
    filters: { ProposalCreated: () => 'created' },
    queryFilter: async (_, from, to) => {
      assert.deepEqual([from, to], [7, 110]);
      return [{ args: { proposalId: 1n, proposer: account, description: 'Reviewed change',
        targets: [target], 3: [7n], calldatas: [data] }, blockNumber: 90, transactionHash: '0xabc' }];
    },
  };
  const pastVotes = governor.getVotes;
  governor.getVotes = async (who, timepoint, at) => {
    assert.ok(BigInt(timepoint) < 100n, 'OZ getVotes must never read current/future timepoint');
    return pastVotes(who, timepoint, at);
  };
  for (const method of ['castVote', 'queue', 'execute', 'cancel']) governor[method] = {
    staticCall: async (...args) => {
      assert.equal(args.at(-1).from, account);
      assert.equal(args.at(-1).blockTag, 110);
      simulations.push({ method, args });
      if (method === 'execute' && failExecute) throw Error('Timelock insufficient funds');
      return 1n;
    },
  };
  const context = { config, abis, governor,
    provider: { getBlock: async () => ({ number: 110, hash: '0xblock', timestamp: 1000 }),
      getBalance: async (_, block) => { assert.equal(block, 110); return 0n; } },
    membership: { getVotes: view('currentVotes', 1n) },
    timelockAt: () => ({ getMinDelay: view('minDelay', 5n) }),
  };
  return { context, views, simulations };
}

test('current/future snapshot never queries historical votes or turns unknown quorum into zero', async () => {
  const h = harness(), result = await readGovernance(h.context, account);
  assert.equal(result.proposals[0].quorum, null);
  assert.equal(result.proposals[0].snapshotVotes, null);
  assert.equal(h.views.includes('quorum'), false);
  // One historical read is permitted: proposal threshold uses clock-1, never
  // the not-yet-historical proposal snapshot. Proposal weight remains null.
  assert.equal(h.views.filter((v) => v === 'pastVotes').length, 1);
  assert.deepEqual(h.simulations.map((s) => s.method), ['cancel']);
});

test('zero address is never an actionable wallet even with proposal threshold zero', async () => {
  const result = await readGovernance(harness().context, ZeroAddress);
  assert.equal(result.canPropose, false);
  assert.equal(result.proposals[0].actions.cancel.available, false);
});

test('historical quorum counts for+abstain, and preserves event value instead of Array.values method', async () => {
  const h = harness({ state: 1, snapshot: 99n }), result = await readGovernance(h.context, account);
  const p = result.proposals[0];
  assert.equal(p.quorumReached, true);
  assert.equal(p.quorumVotes, '2');
  assert.deepEqual(p.values, ['7']);
  assert.equal(p.calls[0].value, '7');
  assert.equal(p.actions.vote.available, true);
});

test('ready ETA still requires full Governor execution simulation; target failure disables execute', async () => {
  const h = harness({ state: 5, snapshot: 99n, failExecute: true });
  const result = await readGovernance(h.context, account);
  assert.equal(result.proposals[0].actions.execute.available, false);
  assert.match(result.proposals[0].actions.execute.reason, /insufficient funds/);
  const invocation = h.simulations.find((s) => s.method === 'execute');
  assert.deepEqual(invocation.args.slice(0, 3), [[target], ['7'], [data]]);
});
