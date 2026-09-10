import { palomarRecent, palomarSnapshot } from './palomar.mjs';
import { community } from './community.mjs';
import { publications, preparePackage, packageZip } from './publications.mjs';
import { externalProofCatalog } from './external-proofs.mjs';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createProofJobs, createProofWorker } from './proof-jobs.mjs';
import { fileURLToPath } from 'node:url';
import { SiweMessage } from 'siwe';
import { Interface, isAddress, formatEther, ZeroAddress } from 'ethers';
import { createSDK } from '../sdk/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const app = express();
const PORT = 4173;
const ALLOWED = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED.has(origin)) return res.status(403).json({ error: 'Origin denied' });
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
const dbFile = '.state/community.json';
fs.mkdirSync('.state', { recursive: true });
const db = fs.existsSync(dbFile)
  ? JSON.parse(fs.readFileSync(dbFile))
  : { comments: [], jobs: [], packages: [] };
function save() {
  fs.writeFileSync(dbFile + '.tmp', JSON.stringify(db, null, 2));
  fs.renameSync(dbFile + '.tmp', dbFile);
}
const proofJobs = createProofJobs({ db, save, execute: createProofWorker(root) });
const social = community(db, save);
const publicationFile = '.state/publications.json';
const publicationDB = fs.existsSync(publicationFile) ? JSON.parse(fs.readFileSync(publicationFile)) : { records: [] };
const publicSources = publications(publicationDB, () => {
  fs.writeFileSync(publicationFile + '.tmp', JSON.stringify(publicationDB, null, 2));
  fs.renameSync(publicationFile + '.tmp', publicationFile);
});
const sessions = new Map(),
  nonces = new Map();
const json = (x) =>
  JSON.parse(JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
function ctx() {
  const config = JSON.parse(fs.readFileSync('.state/deployment.json'));
  const abis = JSON.parse(fs.readFileSync('.state/abis.json'));
  return { config, abis, sdk: createSDK(config, abis) };
}
async function packageContext(statementId) {
  const { sdk, config } = ctx();
  const descriptor = JSON.parse(fs.readFileSync('proof/manifest.json'));
  const statement = statementId ? await sdk.statement(statementId) : null;
  if (statement && statement.author === ZeroAddress) throw Error('Unknown statement');
  const profile = statement?.kind === 0 ? await sdk.registry.profiles(statement.profileId) : null;
  return {
    chainId: config.chainId,
    chainInstance: config.chainInstance.id,
    registry: config.addresses.StatementRegistry,
    statement,
    profile: profile ? { verifier: profile.verifier, manifest: profile.manifest, enabled: profile.enabled } : null,
    descriptor: !statement || statement.profileId === descriptor.profileId ? descriptor : null,
  };
}
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
function auth(req, res, next) {
  const session = sessions.get(req.cookies.vault_session);
  if (!session || session.expires < Date.now())
    return res.status(401).json({ error: 'Sign in with your wallet first' });
  req.session = session;
  next();
}
app.get(
  '/api/health',
  route(async (req, res) => {
    const { sdk, config } = ctx();
    res.json({
      ok: true,
      chainId: config.chainId,
      block: Number(await sdk.provider.getBlockNumber()),
      proof: config.proof,
    });
  }),
);
app.get(
  '/api/config',
  route(async (req, res) => {
    const { config, abis } = ctx();
    res.json({ config, abis });
  }),
);
app.get(
  '/api/snapshot',
  route(async (req, res) => {
    const { sdk, config } = ctx();
    const [statements, pools, block, epoch] = await Promise.all([
      sdk.statements(),
      sdk.pools(),
      sdk.provider.getBlock('latest'),
      sdk.allocation.epoch(),
    ]);
    const allocations = await Promise.all(
      Array.from({ length: Number(epoch) }, async (_, i) => {
        const a = await sdk.allocation.allocation(i + 1);
        return {
          epoch: i + 1,
          split: a.split,
          recipients: [...a.recipients],
          weights: a.weights.map(String),
        };
      }),
    );
    const n = Number(await sdk.allocation.proposalCount());
    const proposals = await Promise.all(
      Array.from({ length: n }, async (_, i) => {
        const p = await sdk.allocation.proposal(i);
        const current = allocations.at(-1);
        const decreasing = current.recipients.filter(
          (r, j) => BigInt(current.weights[j]) > BigInt(p.weights[p.recipients.indexOf(r)] || 0),
        );
        return {
          id: i,
          baseEpoch: Number(p.baseEpoch),
          proposer: p.proposer,
          recipients: [...p.recipients],
          weights: p.weights.map(String),
          applied: p.applied,
          decreasing,
          consents: await Promise.all(decreasing.map((r) => sdk.allocation.consent(i, r))),
        };
      }),
    );
    const balances =
      req.query.account && isAddress(req.query.account)
        ? await sdk.balances(req.query.account, statements, pools)
        : {};
    res.json(
      json({
        config,
        statements,
        pools,
        allocations,
        allocationProposals: proposals,
        balances,
        block: { number: block.number, hash: block.hash, timestamp: block.timestamp },
      }),
    );
  }),
);
app.get('/api/auth/nonce', (req, res) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  nonces.set(nonce, Date.now() + 300000);
  res.json({ nonce });
});
app.post(
  '/api/auth/verify',
  route(async (req, res) => {
    const { message, signature } = req.body;
    if (typeof message !== 'string' || typeof signature !== 'string')
      return res.status(400).json({ error: 'Message and signature required' });
    const siwe = new SiweMessage(message);
    const expiry = nonces.get(siwe.nonce);
    nonces.delete(siwe.nonce);
    if (
      !expiry ||
      expiry < Date.now() ||
      siwe.chainId !== 31373 ||
      !['127.0.0.1:5173', 'localhost:5173'].includes(siwe.domain) ||
      !ALLOWED.has(new URL(siwe.uri).origin)
    )
      return res.status(400).json({ error: 'SIWE nonce, domain or chain mismatch' });
    await siwe.verify({ signature, nonce: siwe.nonce, domain: siwe.domain });
    const sid = crypto.randomBytes(32).toString('hex');
    sessions.set(sid, { address: siwe.address, expires: Date.now() + 3600000 });
    res
      .cookie('vault_session', sid, {
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 3600000,
        path: '/',
      })
      .json({ address: siwe.address });
  }),
);
app.get('/api/auth/me', (req, res) => {
  const s = sessions.get(req.cookies.vault_session);
  res.json({ address: s && s.expires > Date.now() ? s.address : null });
});
app.post('/api/auth/logout', (req, res) => {
  sessions.delete(req.cookies.vault_session);
  res.clearCookie('vault_session').json({ ok: true });
});
app.get(
  '/api/profiles/:address',
  route(async (req, res) => res.json(social.profile(req.params.address))),
);
app.put(
  '/api/profile',
  auth,
  route(async (req, res) => res.json(social.updateProfile(req.session.address, req.body))),
);
app.get(
  '/api/comments',
  route(async (req, res) =>
    res.json(social.list(req.query.statementId, req.query.sort === 'new' ? 'new' : 'top')),
  ),
);
app.post(
  '/api/comments',
  auth,
  route(async (req, res) => {
    const { sdk } = ctx();
    if ((await sdk.statement(req.body.statementId)).author === ZeroAddress)
      return res.status(404).json({ error: 'Unknown statement' });
    res.status(201).json(social.create(req.session.address, req.body));
  }),
);
app.patch(
  '/api/comments/:id',
  auth,
  route(async (req, res) =>
    res.json(social.edit(req.session.address, req.params.id, req.body.text)),
  ),
);
app.post(
  '/api/comments/:id/vote',
  auth,
  route(async (req, res) =>
    res.json(social.vote(req.session.address, req.params.id, req.body.value)),
  ),
);
app.get('/api/jobs', auth, (req, res) =>
  res.json(proofJobs.list(req.session.address).map(({ input, ...job }) => ({
    ...job,
    input: { action: input.action, statementId: input.statementId, fixtureId: input.fixtureId },
  }))),
);
app.get('/api/jobs/:id', auth, (req, res) => {
  const job = proofJobs.list(req.session.address).find(j => j.id === req.params.id);
  res.status(job ? 200 : 404).json(job || { error: 'Unknown job' });
});
app.post('/api/jobs', auth, route(async (req, res) => {
  res.status(202).json(proofJobs.submit(req.session.address, req.body));
}));
app.post('/api/jobs/:id/cancel', auth, route(async (req, res) => {
  res.json(await proofJobs.cancel(req.session.address, req.params.id));
}));
app.get(
  '/api/fixtures',
  route(async (req, res) => {
    const f = 'proof/fixtures.json';
    res.json(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : []);
  }),
);
app.get('/api/external-proofs', route(async (_, res) => {
  res.json(externalProofCatalog(root, ctx().config));
}));
app.get(
  '/api/palomar',
  route(async (req, res) =>
    res.json({
      source: 'https://data.palomar-registry.org/recent.json',
      data: await palomarRecent(),
    }),
  ),
);
app.post(
  '/api/palomar/import',
  auth,
  route(async (req, res) => {
    const p = await palomarSnapshot(req.body.id, Number(req.body.version));
    p.author = req.session.address;
    db.packages.push(p);
    save();
    res.json(p);
  }),
);
app.get('/api/packages', (_, res) => res.json(db.packages));
app.post(
  '/api/import',
  auth,
  route(async (req, res) => {
    const { repository, commit, challengePath = 'Challenge.lean' } = req.body;
    const m = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(
      repository || '',
    );
    if (
      !m ||
      !/^[a-f0-9]{40}$/i.test(commit) ||
      !/^[A-Za-z0-9_./-]+\.lean$/.test(challengePath) ||
      challengePath.includes('..')
    )
      return res.status(400).json({
        error: 'GitHub repository, exact 40-character commit and safe .lean path required',
      });
    const owner = m[1],
      repo = m[2];
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${challengePath}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error(`Source HTTP ${response.status}`);
    const source = await response.text();
    if (source.length > 200000) throw Error('Challenge too large');
    const p = {
      id: crypto.randomUUID(),
      repository,
      commit,
      challengePath,
      source,
      sourceUrl: url,
      importedAt: new Date().toISOString(),
      author: req.session.address,
      verification: 'unverified import; Lean job and on-chain certificate still required',
    };
    db.packages.push(p);
    save();
    res.json(p);
  }),
);
app.post('/api/packages/prepare', auth, route(async (req, res) => {
  const context = await packageContext(req.body.statementId);
  res.json(preparePackage(req.body, context));
}));
app.post('/api/packages/download', auth, route(async (req, res) => {
  const context = await packageContext(req.body.statementId);
  const pkg = preparePackage(req.body, context);
  res.attachment('vault-lean-package.zip').type('application/zip').send(packageZip(pkg));
}));
app.get('/api/statements/:id/publications', route(async (req, res) => {
  const context = await packageContext(req.params.id);
  res.json(publicSources.list(context.chainInstance, req.params.id));
}));
app.post('/api/statements/:id/publications', auth, route(async (req, res) => {
  const context = await packageContext(req.params.id);
  res.status(201).json(publicSources.publish(req.session.address, req.body, context));
}));
app.get('/api/statements/:id/publications/:publicationId/package.zip', route(async (req, res) => {
  const context = await packageContext(req.params.id);
  const record = publicSources.list(context.chainInstance, req.params.id).find((p) => p.id === req.params.publicationId);
  if (!record) return res.status(404).json({ error: 'Unknown public revision' });
  res.attachment('vault-public-' + record.id + '.zip').type('application/zip').send(packageZip(record));
}));
app.get(
  '/api/export/:id',
  route(async (req, res) => {
    const { sdk, config } = ctx();
    const statement = await sdk.statement(req.params.id);
    if (statement.author === ZeroAddress)
      return res.status(404).json({ error: 'Unknown statement' });
    const evidence = await sdk.statementEvidence(req.params.id);
    const session = sessions.get(req.cookies.vault_session);
    const owner = session?.expires > Date.now() ? session.address.toLowerCase() : '';
    const jobs = db.jobs.filter(
      (j) =>
        j.author.toLowerCase() === owner &&
        (j.input.statementId === req.params.id || j.result?.goalHash === statement.goalHash),
    );
    res.attachment(`vault-${req.params.id.slice(2, 12)}.json`).json({
      format: 'oncm-vault-reproducible-v1',
      chainId: 31373,
      registry: config.addresses.StatementRegistry,
      statement,
      profile: evidence.profile,
      operator: evidence.operator,
      chainEvidence: evidence.transactions,
      publicSources: publicSources.list(config.chainInstance.id, req.params.id),
      jobs,
      packages: db.packages.filter((p) => jobs.some((j) => j.input.source === p.source)),
      instructions:
        'Run node proof/runner.mjs with each job.input. Compare committed goal/profile and certificates. Human descriptions and comments are not settlement evidence.',
    });
  }),
);
app.get(
  '/api/governance',
  route(async (req, res) => {
    const { sdk } = ctx();
    const g = sdk.c('Governor', 'VaultGovernor');
    const logs = await g.queryFilter(g.filters.ProposalCreated(), 0);
    const proposals = await Promise.all(
      logs.map(async (l) => {
        const a = l.args;
        return {
          id: String(a.proposalId),
          proposer: a.proposer,
          targets: [...a.targets],
          values: a[3].map(String),
          calldatas: [...a.calldatas],
          description: a.description,
          start: String(a.voteStart),
          end: String(a.voteEnd),
          state: Number(await g.state(a.proposalId)),
          votes: json(await g.proposalVotes(a.proposalId)),
          txHash: l.transactionHash,
          blockNumber: l.blockNumber,
        };
      }),
    );
    res.json({
      proposals,
      states: [
        'Pending',
        'Active',
        'Canceled',
        'Defeated',
        'Succeeded',
        'Queued',
        'Expired',
        'Executed',
      ],
      timelockDelay: String(await sdk.c('Timelock', 'TimelockController').getMinDelay()),
    });
  }),
);
app.get(
  '/api/activity',
  route(async (req, res) => {
    const { sdk, abis, config } = ctx();
    const head = Number(await sdk.provider.getBlockNumber());
    const to = Math.min(Number(req.query.to) || head, head);
    const from = Math.max(config.deploymentBlock, to - 24);
    const interfaces = Object.entries(abis).map(([name, abi]) => ({
      name,
      interface: new Interface(abi),
    }));
    const blocks = [];
    for (let number = to; number >= from; number--) {
      const block = await sdk.provider.getBlock(number, true);
      const transactions = [];
      for (const hash of block.transactions) {
        const [tx, receipt] = await Promise.all([
          sdk.provider.getTransaction(hash),
          sdk.provider.getTransactionReceipt(hash),
        ]);
        const events = [];
        const deltas = {};
        for (const log of receipt.logs) {
          let decoded = null;
          for (const i of interfaces) {
            try {
              const p = i.interface.parseLog(log);
              if (p) {
                decoded = {
                  contract: i.name,
                  event: p.name,
                  args: Object.fromEntries(
                    p.fragment.inputs.map((input, k) => [input.name || String(k), json(p.args[k])]),
                  ),
                };
                break;
              }
            } catch {}
          }
          const event = {
            address: log.address,
            index: log.index,
            ...(decoded || { event: 'Unknown', topics: log.topics, data: log.data }),
          };
          events.push(event);
          if (decoded?.event === 'Transfer' && decoded.args.value !== undefined) {
            const { from, to, value } = decoded.args;
            for (const [a, sign] of [
              [from, -1n],
              [to, 1n],
            ])
              if (a && a !== ZeroAddress) {
                const key = log.address + ':' + a;
                deltas[key] = (deltas[key] || 0n) + sign * BigInt(value);
              }
          }
        }
        let call = null;
        for (const i of interfaces) {
          try {
            const p = i.interface.parseTransaction({ data: tx.data, value: tx.value });
            if (p) {
              call = { contract: i.name, method: p.name };
              break;
            }
          } catch {}
        }
        transactions.push({
          hash,
          from: tx.from,
          to: tx.to,
          status: receipt.status,
          gasUsed: String(receipt.gasUsed),
          gasCost: String(receipt.fee),
          value: String(tx.value),
          call,
          events,
          balanceDeltas: Object.entries(deltas).map(([key, value]) => {
            const [token, account] = key.split(':');
            return {
              token,
              account,
              delta: String(value),
              source: 'ERC20 Transfer events in this receipt',
            };
          }),
        });
      }
      blocks.push({
        number,
        hash: block.hash,
        parentHash: block.parentHash,
        timestamp: block.timestamp,
        transactions,
      });
    }
    res.json({ head, from, to, previous: from > config.deploymentBlock ? from - 1 : null, blocks });
  }),
);
app.use((err, req, res, next) => {
  console.error(err.shortMessage || err.message);
  res.status(err.statusCode || 400).json({ error: err.shortMessage || err.message || 'Request failed' });
});
const server = app.listen(PORT, '127.0.0.1', () => console.log(`Vault API http://127.0.0.1:${PORT}`));
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  await proofJobs.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
