import { Contract, Interface, ZeroAddress, getAddress } from 'ethers';

const ERC20 = ['function balanceOf(address) view returns(uint256)', 'function transfer(address,uint256) returns(bool)'];
const tokenInterface = new Interface(ERC20);
const address = (v) => { const a = getAddress(v); if (a === ZeroAddress) throw Error('Zero address is not a treasury recipient or token'); return a; };
const uint = (v) => { if (!/^(0|[1-9][0-9]*)$/.test(String(v))) throw Error('Expected an unsigned integer'); return BigInt(v); };
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// A proposal draft only. Largest remainders preserve the relative non-DAO shares
// with exact 10,000 bps, deterministic address ordering and no float rounding.
export function allocationWithTreasury(allocation, treasury, bps = 2000) {
  treasury = address(treasury); bps = Number(uint(bps));
  if (bps < 1 || bps >= 10000) throw Error('Treasury share must be between 1 and 9999 bps');
  if (!allocation || allocation.recipients.length !== allocation.weights.length) throw Error('Invalid active allocation');
  const seen = new Set();
  const rows = allocation.recipients.map((a, i) => {
    const recipient = address(a), weight = uint(allocation.weights[i]);
    if (!weight || seen.has(recipient.toLowerCase())) throw Error('Invalid or duplicate allocation recipient');
    seen.add(recipient.toLowerCase()); return { recipient, weight };
  });
  if (rows.reduce((n, r) => n + r.weight, 0n) !== 10000n) throw Error('Active allocation must total 10000 bps');
  const others = rows.filter(r => !same(r.recipient, treasury));
  const total = others.reduce((n, r) => n + r.weight, 0n), remaining = BigInt(10000 - bps);
  if (!total || others.length >= 32) throw Error('Treasury allocation needs 1–31 other recipients');
  const scaled = others.map(r => ({ ...r, weight: r.weight * remaining / total, remainder: r.weight * remaining % total }));
  let dust = remaining - scaled.reduce((n, r) => n + r.weight, 0n);
  scaled.sort((a, b) => a.remainder === b.remainder ? a.recipient.toLowerCase().localeCompare(b.recipient.toLowerCase()) : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; dust > 0n; i++, dust--) scaled[i].weight++;
  if (scaled.some(r => !r.weight)) throw Error('A recipient would round to zero; edit the allocation explicitly');
  scaled.push({ recipient: treasury, weight: BigInt(bps) });
  scaled.sort((a, b) => a.recipient.toLowerCase().localeCompare(b.recipient.toLowerCase()));
  return { recipients: scaled.map(r => r.recipient), weights: scaled.map(r => String(r.weight)), baseEpoch: allocation.epoch };
}

export function createTreasury({ provider, config, abis, write, send,
  contract = (a, abi) => new Contract(a, abi, write || provider) }) {
  const governor = contract(config.addresses.Governor, abis.VaultGovernor);
  const warehouse = contract(config.addresses.SplitsWarehouse, abis.SplitsWarehouse);
  const allocation = contract(config.addresses.AllocationController, abis.AllocationController);
  async function context() {
    if ((await provider.getNetwork()).chainId !== 31373n) throw Error('Treasury is restricted to Vault chain 31373');
    const block = await provider.getBlock('latest'), at = { blockTag: block.number };
    const treasury = address(await governor.timelock(at));
    if (!same(treasury, config.addresses.Timelock)) throw Error('Governor executor differs from configured treasury; refresh deployment');
    if (await provider.getCode(treasury, block.number) === '0x') throw Error('Treasury executor has no bytecode');
    return { treasury, blockNumber: block.number, blockHash: block.hash, chainId: 31373, at };
  }
  function fresh(options, owner) {
    if (options?.isCurrent && !options.isCurrent()) throw Error('Treasury draft, wallet or network changed');
    return async () => {
      if (!same(await write.getAddress(), owner)) throw Error('Treasury wallet changed');
      if (options?.isCurrent && !options.isCurrent()) throw Error('Treasury draft, wallet or network changed');
    };
  }
  async function snapshot(tokens) {
    const c = await context(), timelock = contract(c.treasury, abis.TimelockController);
    const epoch = await allocation.epoch(c.at), active = await allocation.allocation(epoch, c.at);
    const unique = [...new Set(tokens.map(t => address(t).toLowerCase()))].map(getAddress);
    const assets = [];
    // Bounded sequential reads avoid an unbounded RPC burst for a long market list.
    for (const token of unique) assets.push({ token,
      balance: String(await contract(token, ERC20).balanceOf(c.treasury, c.at)),
      claimable: String(await warehouse.balanceOf(c.treasury, BigInt(token), c.at)) });
    const proposerRole = await timelock.PROPOSER_ROLE(c.at);
    return { treasury: c.treasury, blockNumber: c.blockNumber, blockHash: c.blockHash,
      governor: config.addresses.Governor, chainId: c.chainId,
      nativeBalance: String(await provider.getBalance(c.treasury, c.blockNumber)),
      governorCanSchedule: await timelock.hasRole(proposerRole, config.addresses.Governor, c.at),
      epoch: String(epoch), shareBps: String(active.weights[active.recipients.findIndex(r => same(r, c.treasury))] || 0), assets };
  }
  async function prepare(input) {
    const c = await context(); let target, data, normalized, detail;
    if (input.kind === 'consent') {
      if (typeof input.approved !== 'boolean') throw Error('Consent must be true or false');
      const id = uint(input.proposalId), epoch = await allocation.epoch(c.at), p = await allocation.proposal(id, c.at);
      if (p.applied || BigInt(p.baseEpoch) !== BigInt(epoch)) throw Error('Allocation proposal is applied or stale');
      const old = await allocation.allocation(epoch, c.at);
      const weight = a => BigInt(a.weights[a.recipients.findIndex(r => same(r, c.treasury))] || 0);
      if (weight(old) <= weight(p)) throw Error('Treasury share is not decreasing in this allocation');
      normalized = { kind: 'consent', proposalId: String(id), approved: input.approved };
      target = config.addresses.AllocationController;
      data = allocation.interface.encodeFunctionData('setConsent', [id, input.approved]);
      detail = { baseEpoch: String(epoch), oldBps: String(weight(old)), newBps: String(weight(p)) };
    } else if (input.kind === 'transfer') {
      const token = address(input.token), recipient = address(input.recipient), amount = uint(input.amount);
      if (!amount) throw Error('Transfer amount must be positive');
      if (same(recipient, c.treasury)) throw Error('Choose a recipient outside the treasury');
      if (await provider.getCode(token, c.blockNumber) === '0x') throw Error('Token has no contract bytecode');
      const balance = await contract(token, ERC20).balanceOf(c.treasury, c.at);
      if (amount > balance) throw Error('Insufficient treasury token balance; claim Warehouse revenue first');
      normalized = { kind: 'transfer', token, recipient, amount: String(amount) };
      target = token; data = tokenInterface.encodeFunctionData('transfer', [recipient, amount]);
      detail = { balance: String(balance) };
    } else throw Error('Unknown treasury action');
    const returned = await provider.send('eth_call', [{ from: c.treasury, to: target, data, value: '0x0' }, '0x' + c.blockNumber.toString(16)]);
    if (input.kind === 'transfer' && !tokenInterface.decodeFunctionResult('transfer', returned)[0]) throw Error('ERC20 transfer returned false');
    return { input: normalized, target, data, value: '0', treasury: c.treasury,
      chainId: c.chainId, blockNumber: c.blockNumber, blockHash: c.blockHash, detail,
      method: input.kind === 'consent' ? 'setConsent(uint256,bool)' : 'transfer(address,uint256)', preflight: true };
  }
  async function propose(plan, description, options = {}) {
    if (!String(description).trim()) throw Error('Explain the treasury proposal');
    const owner = await write.getAddress(), current = await prepare(plan.input);
    if (!same(current.treasury, plan.treasury) || current.target !== plan.target || current.data !== plan.data ||
      (plan.input.kind === 'consent' && current.detail.baseEpoch !== plan.detail.baseEpoch)) throw Error('Treasury call or allocation epoch changed; review again');
    return send(async () => { await fresh(options, owner)();
      return governor.propose([current.target], [0], [current.data], description); });
  }
  async function claim(token, options = {}) {
    const owner = await write.getAddress(), c = await context(); token = address(token);
    const balance = await warehouse.balanceOf(c.treasury, BigInt(token), c.at);
    if (!balance) throw Error('No claimable treasury revenue');
    // Both the owner and incentive recipient are the executor. Caller cannot
    // redirect any treasury revenue, including a future Warehouse incentive.
    return send(async () => { await fresh(options, owner)();
      return warehouse['withdraw(address,address[],uint256[],address)'](c.treasury, [token], [balance], c.treasury); });
  }
  return { snapshot, prepare, propose, claim, allocation20: a => allocationWithTreasury(a, config.addresses.Timelock, 2000) };
}
