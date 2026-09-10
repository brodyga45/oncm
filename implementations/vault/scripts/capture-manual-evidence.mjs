#!/usr/bin/env node
// Diagnostic recorder only. No signer, private key, account unlock or write RPC.
// Nothing is captured unless --capture and an explicit final block are supplied.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AbiCoder, Interface, getAddress, toQuantity } from 'ethers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const safeMethods = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber',
  'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_call']);
const abi = AbiCoder.defaultAbiCoder();
const erc20 = new Interface(['function balanceOf(address) view returns(uint256)',
  'event Transfer(address indexed from,address indexed to,uint256 value)']);
const clean = value => typeof value === 'bigint' ? String(value)
  : Array.isArray(value) ? value.map(clean)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)])) : value;

export function argumentsObject(fragment, args) {
  return Object.fromEntries(fragment.inputs.map((parameter, i) => [parameter.name || String(i), clean(args[i])]));
}
export function balanceDifferences(before, after) {
  return Object.fromEntries(Object.keys(before).map(account => [account,
    Object.fromEntries(Object.keys(before[account]).map(token => [token,
      String(BigInt(after[account][token]) - BigInt(before[account][token]))]))]));
}
function client(url, expectedChain, expectedPort) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== String(expectedPort))
    throw Error('Only the explicitly configured local RPC is allowed');
  let requestId = 0;
  const rpc = async (method, params = []) => {
    if (!safeMethods.has(method)) throw Error('Non-read-only RPC method refused: ' + method);
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('RPC HTTP ' + response.status);
    const result = await response.json();
    if (result.error) throw Error(method + ': ' + result.error.message);
    return result.result;
  };
  return { rpc, async assertChain(finalBlock) {
    if (Number(BigInt(await rpc('eth_chainId'))) !== expectedChain) throw Error('Unexpected local chain');
    if (Number(BigInt(await rpc('eth_blockNumber'))) < finalBlock) throw Error('Final block is not mined yet');
  } };
}
function decodeCall(tx, interfaces) {
  for (const [contract, iface] of interfaces) {
    try {
      const parsed = iface.parseTransaction({ data: tx.input, value: tx.value });
      if (parsed) return { abi: contract, name: parsed.name, signature: parsed.signature,
        args: argumentsObject(parsed.fragment, parsed.args) };
    } catch { /* A different interface may match; raw input is always retained. */ }
  }
  return null;
}
function decodeLog(log, interfaces) {
  for (const [contract, iface] of interfaces) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed) return { abi: contract, name: parsed.name, signature: parsed.signature,
        args: argumentsObject(parsed.fragment, parsed.args) };
    } catch { /* Preserve undecoded logs below. */ }
  }
  return null;
}
function claimJournals(value, result = []) {
  if (typeof value === 'string' && value.startsWith('0x') && value.length > 500) {
    try {
      const [seal, journal] = abi.decode(['bytes', 'bytes'], value);
      if (journal.length === 258 && abi.encode(['bytes', 'bytes'], [seal, journal]).toLowerCase() === value.toLowerCase()) {
        const [domain, goalHash, profileId, outcome] = abi.decode(['bytes32', 'bytes32', 'bytes32', 'uint256'], journal);
        result.push({ domain, goalHash, profileId, outcome: String(outcome), journal,
          sealBytes: (seal.length - 2) / 2, certificate: value });
      }
    } catch { /* A calldata field need not be a Lean certificate. */ }
  } else if (value && typeof value === 'object') Object.values(value).forEach(child => claimJournals(child, result));
  return result;
}
async function captureBlocks(rpc, numbers, interfaces, labels = {}) {
  const blocks = [];
  for (const number of numbers) {
    const block = await rpc('eth_getBlockByNumber', [toQuantity(number), false]);
    if (!block) throw Error('Missing historical block ' + number);
    const transactions = [];
    for (const hash of block.transactions) {
      const [tx, receipt] = await Promise.all([
        rpc('eth_getTransactionByHash', [hash]), rpc('eth_getTransactionReceipt', [hash]),
      ]);
      if (!tx || !receipt || receipt.blockHash !== block.hash) throw Error('Missing/mismatched receipt ' + hash);
      const decoded = decodeCall(tx, interfaces);
      transactions.push({ tx, receipt, decoded, claimJournals: claimJournals(decoded?.args),
        decodedLogs: receipt.logs.map(log => ({ ...log, decoded: decodeLog(log, interfaces) })) });
    }
    blocks.push({ number, hash: block.hash, timestamp: Number(BigInt(block.timestamp)),
      label: labels[number] || 'manually mined transaction/block', transactions });
  }
  return blocks;
}
async function view(rpc, address, iface, method, args, block) {
  const output = await rpc('eth_call', [{ to: address, data: iface.encodeFunctionData(method, args) }, toQuantity(block)]);
  return iface.decodeFunctionResult(method, output);
}
async function holdings(rpc, accounts, tokens, block, warehouse) {
  const balances = {}, claimable = {};
  for (const account of accounts) {
    balances[account] = {}; claimable[account] = {};
    for (const [name, token] of Object.entries(tokens)) {
      balances[account][name] = String((await view(rpc, token, erc20, 'balanceOf', [account], block))[0]);
      claimable[account][name] = String((await view(rpc, warehouse.address, warehouse.iface,
        'balanceOf(address,uint256)', [account, BigInt(token)], block))[0]);
    }
  }
  return { blockNumber: block, balances, claimable };
}
function save(file, data, original) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (original) fs.writeFileSync(file + '.before-fees-' + Date.now() + '.json', original, { flag: 'wx' });
  const temporary = file + '.capture.tmp';
  fs.writeFileSync(temporary, JSON.stringify(clean(data), null, 2) + '\n'); fs.renameSync(temporary, file);
}
async function agoraEconomics(rpc, config, interfaces, blocks, finalBlock) {
  const txs = blocks.flatMap(block => block.transactions);
  const logs = txs.flatMap(tx => tx.decodedLogs);
  const registry = interfaces.find(([name]) => name === 'AgoraRegistry')[1];
  const ctf = interfaces.find(([name]) => name === 'ConditionalTokens')[1];
  const fpmm = interfaces.find(([name]) => name === 'FixedProductMarketMaker')[1];
  const registered = logs.find(log => log.address.toLowerCase() === config.registry.toLowerCase()
    && log.decoded?.name === 'StatementRegistered');
  if (!registered) throw Error('No exact registry StatementRegistered receipt in capture');
  const statementId = registered.decoded.args.statementId;
  const market = logs.find(log => log.decoded?.name === 'MarketCreated' && log.decoded.args.statementId === statementId);
  if (!market) throw Error('No MarketCreated receipt for the registered statement');
  const pool = market.decoded.args.pool;
  const s = (await view(rpc, config.registry, registry, 'getStatement', [statementId], finalBlock))[0];
  const positionIds = { YES: String((await view(rpc, pool, fpmm, 'positionIds', [0], finalBlock))[0]),
    NO: String((await view(rpc, pool, fpmm, 'positionIds', [1], finalBlock))[0]) };
  const firstFunding = logs.find(log => log.address.toLowerCase() === pool.toLowerCase() && log.decoded?.name === 'FPMMFundingAdded');
  const participants = { curator: firstFunding.decoded.args.funder, lpAccount3: config.accounts[3], traderAccount4: config.accounts[4] };
  const addresses = [...new Set(Object.values(participants).map(getAddress))];
  const historicalBalances = {};
  for (const block of [31, 33, 35, 37, 39, 41, 42, 43, 44, 45, 46].filter(n => n <= finalBlock)) {
    const balances = {};
    const supply = block >= 33 ? (await view(rpc, pool, fpmm, 'totalSupply', [], block))[0] : null;
    for (const account of addresses) {
      const [t, yes, no] = await Promise.all([
        view(rpc, config.token, erc20, 'balanceOf', [account], block),
        view(rpc, config.ctf, ctf, 'balanceOf', [account, positionIds.YES], block),
        view(rpc, config.ctf, ctf, 'balanceOf', [account, positionIds.NO], block),
      ]);
      balances[account] = { T: String(t[0]), YES: String(yes[0]), NO: String(no[0]) };
      if (block >= 33) {
        const [shares, withdrawable] = await Promise.all([
          view(rpc, pool, fpmm, 'balanceOf', [account], block),
          supply > 0n ? view(rpc, pool, fpmm, 'feesWithdrawableBy', [account], block) : [null],
        ]);
        balances[account].LPshares = String(shares[0]);
        balances[account].LPfeesWithdrawable = withdrawable[0] === null ? null : String(withdrawable[0]);
        if (withdrawable[0] === null) balances[account].feeViewUnavailable = 'Original FPMM divides by zero before first funding';
      }
    }
    const state = { accounts: balances,
      collateralHeldByCTF: String((await view(rpc, config.token, erc20, 'balanceOf', [config.ctf], block))[0]) };
    if (block >= 33) {
      state.pool = {
        T: String((await view(rpc, config.token, erc20, 'balanceOf', [pool], block))[0]),
        YES: String((await view(rpc, config.ctf, ctf, 'balanceOf', [pool, positionIds.YES], block))[0]),
        NO: String((await view(rpc, config.ctf, ctf, 'balanceOf', [pool, positionIds.NO], block))[0]),
        shares: String(supply),
        collectedFees: String((await view(rpc, pool, fpmm, 'collectedFees', [], block))[0]),
      };
    }
    historicalBalances[block] = state;
  }
  const poolEvents = logs.filter(log => log.address.toLowerCase() === pool.toLowerCase());
  const trades = poolEvents.filter(log => ['FPMMBuy', 'FPMMSell'].includes(log.decoded?.name));
  const protocol = poolEvents.filter(log => log.decoded?.name === 'ProtocolFeePaid');
  const gross = trades.reduce((sum, log) => sum + BigInt(log.decoded.args.feeAmount), 0n);
  const protocolTotal = protocol.reduce((sum, log) => sum + BigInt(log.decoded.args.amount), 0n);
  const transfers = logs.filter(log => log.address.toLowerCase() === config.token.toLowerCase()
    && log.decoded?.signature === 'Transfer(address,address,uint256)');
  const flowAccounts = [...new Set(transfers.flatMap(log => [log.decoded.args.from, log.decoded.args.to]))]
    .filter(account => BigInt(account) !== 0n);
  const conservationBalances = {};
  let sumBefore = 0n, sumAfter = 0n;
  for (const account of flowAccounts) {
    const before = (await view(rpc, config.token, erc20, 'balanceOf', [account], 28))[0];
    const after = (await view(rpc, config.token, erc20, 'balanceOf', [account], finalBlock))[0];
    sumBefore += before; sumAfter += after;
    conservationBalances[account] = { before: String(before), after: String(after), delta: String(after - before) };
  }
  const denominator = (await view(rpc, config.ctf, ctf, 'payoutDenominator', [s.conditionId], finalBlock))[0];
  const payouts = await Promise.all([0, 1].map(side => view(rpc, config.ctf, ctf, 'payoutNumerators', [s.conditionId, side], finalBlock)));
  return { statementId, profileId: s.profileId, goalHash: s.goalHash, conditionId: s.conditionId, pool, positionIds,
    statement: { outcome: String(s.outcome), resolvedAt: String(s.resolvedAt), creator: s.creator,
      payoutDenominator: String(denominator), payoutNumerators: payouts.map(value => String(value[0])) },
    participants, historicalBalances,
    fees: { fraction18: String((await view(rpc, pool, fpmm, 'fee', [], finalBlock))[0]),
      grossTradeFees: String(gross), protocolFees: String(protocolTotal), lpFeesAccrued: String(gross - protocolTotal),
      tradeEvents: trades, protocolFeeEvents: protocol },
    conservation: { asset: config.token, beforeBlock: 28, afterBlock: finalBlock,
      scope: 'T balances of every nonzero sender/receiver in actual T Transfer logs29..final, including pool/CTF/protocol Split; ERC1155 positions and LP shares are recorded separately.',
      sumBefore: String(sumBefore), sumAfter: String(sumAfter), delta: String(sumAfter - sumBefore), balances: conservationBalances } };
}
export async function main(argv) {
  const options = new Map();
  for (let i = 0; i < argv.length; i++) {
    if (['--capture', '--agora-only'].includes(argv[i])) options.set(argv[i].slice(2), true);
    else if (argv[i].startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) options.set(argv[i].slice(2), argv[++i]);
    else throw Error('Unknown or incomplete argument ' + argv[i]);
  }
  if (!options.has('capture')) {
    console.log('Prepared only. After coordinator confirms final blocks: --capture --vault-final-block N [--agora-final-block N --agora-deployment FILE --agora-artifacts DIR --agora-output FILE]');
    return;
  }
  const summaries = [];
  if (!options.has('agora-only')) {
  const finalBlock = Number(options.get('vault-final-block'));
  if (!Number.isSafeInteger(finalBlock) || finalBlock < 121 || finalBlock > 300) throw Error('Explicit Vault final block121..300 required');
  const config = readJson(path.join(root, '.state/deployment.json'));
  const abis = readJson(path.join(root, '.state/abis.json'));
  const file = path.join(root, '.state/manual-perf05-market.json');
  const original = fs.readFileSync(file, 'utf8'), evidence = JSON.parse(original);
  if (evidence.chainId !== 31373) throw Error('Wrong existing evidence chain');
  const { rpc, assertChain } = client(config.rpcUrl, 31373, 9547); await assertChain(finalBlock);
  const interfaces = Object.entries(abis).map(([name, items]) => [name, new Interface(items)]);
  const blocks = await captureBlocks(rpc, Array.from({ length: finalBlock - 118 }, (_, i) => i + 119), interfaces,
    { 119: 'creator fee collect', 120: 'epoch distribute T', 121: 'epoch distribute YES' });
  const statement = (await view(rpc, config.addresses.StatementRegistry, new Interface(abis.StatementRegistry),
    'getStatement', [evidence.statementId], finalBlock))[0];
  const accounts = config.accounts.slice(0, 2).map(getAddress);
  const tokens = { T: config.addresses.TrueToken, YES: statement.yes };
  const warehouse = { address: config.addresses.SplitsWarehouse, iface: new Interface(abis.SplitsWarehouse) };
  const before = await holdings(rpc, accounts, tokens, 121, warehouse);
  const after = await holdings(rpc, accounts, tokens, finalBlock, warehouse);
  const epochIds = [...new Set(blocks.flatMap(block => block.transactions.filter(item =>
    item.tx.to?.toLowerCase() === config.addresses.AllocationController.toLowerCase()
    && item.decoded?.name === 'distribute').map(item => Number(item.decoded.args.e))))];
  const epochResidues = [];
  for (const epoch of epochIds) {
    const allocation = (await view(rpc, config.addresses.AllocationController, new Interface(abis.AllocationController),
      'allocation', [epoch], finalBlock))[0];
    epochResidues.push({ epoch, split: allocation.split,
      beforeCollection: await holdings(rpc, [allocation.split], tokens, 118, warehouse),
      afterClaims: await holdings(rpc, [allocation.split], tokens, finalBlock, warehouse) });
  }
  const withdrawals = blocks.flatMap(block => block.transactions.filter(item =>
    item.tx.to?.toLowerCase() === warehouse.address.toLowerCase() && item.decoded?.name === 'withdraw').map(item => ({
    blockNumber: block.number, transactionHash: item.tx.hash, actor: item.tx.from,
    args: item.decoded.args, status: item.receipt.status, transfers: item.decodedLogs.filter(log =>
      Object.values(tokens).some(token => token.toLowerCase() === log.address.toLowerCase()) && log.decoded?.name === 'Transfer'),
  })));
  const byNumber = new Map(evidence.blocks.map(block => [block.number, block]));
  blocks.forEach(block => byNumber.set(block.number, block));
  const updated = { ...evidence, blocks: [...byNumber.values()].sort((a, b) => a.number - b.number),
    feeEvidence: { capturedAt: new Date().toISOString(), chainInstance: config.chainInstance.id,
      finalBlock, finalBlockHash: blocks.at(-1).hash, tokens, accounts, before, after, epochResidues,
      walletDeltas: balanceDifferences(before.balances, after.balances),
      warehouseDeltas: balanceDifferences(before.claimable, after.claimable), withdrawals,
      scope: 'Read-only historical eth_call balances at end of blocks121/final; raw canonical RPC transactions/receipts and decoded logs. No signing, mining or replay.' } };
  save(file, updated, original);
  summaries.push({ app: 'vault', finalBlock, file, withdrawals: withdrawals.length, walletDeltas: updated.feeEvidence.walletDeltas });
  }

  if (options.has('agora-final-block')) {
    const final = Number(options.get('agora-final-block'));
    if (!Number.isSafeInteger(final) || final < 35 || final > 100) throw Error('Explicit Agora final block35..100 required');
    for (const key of ['agora-deployment', 'agora-artifacts', 'agora-output']) if (!options.has(key)) throw Error('Missing --' + key);
    const deployment = readJson(options.get('agora-deployment'));
    const connection = client(deployment.rpc, 31371, 9545); await connection.assertChain(final);
    const names = ['TrueToken', 'ConditionalTokens', 'AllocationController', 'AgoraFPMMFactory',
      'FixedProductMarketMaker', 'Safe', 'AgoraTimelock', 'AgoraRegistry'];
    const agoraInterfaces = names.map(name => [name, new Interface(readJson(path.join(options.get('agora-artifacts'), name + '.json')).abi)]);
    const journal = await captureBlocks(connection.rpc, Array.from({ length: final - 28 }, (_, i) => i + 29), agoraInterfaces,
      { 29: 'manual governance schedule', 30: 'local time advance, expected no transaction', 31: 'manual governance execute',
        32: 'register exact perf05 goal', 33: 'create FPMM', 34: 'curator T approval', 35: 'curator fund100T',
        36: 'Account3 T approval', 37: 'Account3 LP20T', 38: 'Account4 T approval', 39: 'Account4 buy10T',
        40: 'Account4 CTF approval', 41: 'Account4 sell for2T', 42: 'genuine zk resolution',
        43: 'trader winning redemption', 44: 'Account3 LP fee claim', 45: 'Account3 withdraw20shares',
        46: 'Account3 outcome redemption' });
    const output = options.get('agora-output');
    if (fs.existsSync(output)) throw Error('Agora output already exists; choose an explicit new evidence filename');
    const economics = await agoraEconomics(connection.rpc, deployment, agoraInterfaces, journal, final);
    save(output, { kind: 'manual-browser-agora-governance-market-receipts', chainId: 31371,
      capturedAt: new Date().toISOString(), finalBlock: final, blocks: journal, ...economics,
      emptyAdvanceConfirmed: journal.find(block => block.number === 30)?.transactions.length === 0,
      scope: 'Read-only canonical RPC block/transaction/receipt journal; labels describe coordinator-reported actions, raw decoded data is authoritative.' });
    summaries.push({ app: 'agora', finalBlock: final, file: output, statementId: economics.statementId,
      pool: economics.pool, fees: economics.fees, conservation: economics.conservation,
      transactions: journal.flatMap(b => b.transactions).length });
  }
  console.log(JSON.stringify(summaries, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
