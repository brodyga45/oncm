import {installOnchainSocialRoutes} from "./onchain-social.mjs";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {createProofJobs,registerProofRoutes} from "./proof-jobs.mjs";
import {createProofWorker} from "./proof-worker.mjs";
import {readProofCatalog, catalogWithChain} from "./proof-catalog.mjs";
import {validatePublishedPackage} from './package-validation.mjs';
import {
  JsonRpcProvider,
  Interface,
  Contract,
  formatEther,
  isAddress,
  getAddress,
} from "ethers";
import { SiweMessage, generateNonce } from "siwe";
import { ExchangeSDK } from "../sdk/index.mjs";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
fs.mkdirSync("data/packages", { recursive: true });
const app = express(),
  provider = new JsonRpcProvider("http://127.0.0.1:9546"),
  nonces = new Map(),
  sessions = new Map();
const allowed = ["http://127.0.0.1:5172", "http://localhost:5172"];
app.set("json replacer", (_, v) => (typeof v === "bigint" ? v.toString() : v));
app.use((req, res, next) => {
  if (
    req.method !== "GET" &&
    req.headers.origin &&
    !allowed.includes(req.headers.origin)
  )
    return res.status(403).json({ error: "Unknown browser origin" });
  if (allowed.includes(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "2mb" }));
installOnchainSocialRoutes(app,{root,provider});
function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync("data/" + name + ".json"));
  } catch {
    return fallback;
  }
}
function save(name, value) {
  fs.writeFileSync("data/" + name + ".tmp", JSON.stringify(value, null, 2));
  fs.renameSync("data/" + name + ".tmp", "data/" + name + ".json");
}
function context() {
  const deployment = load("deployment", null);
  if (!deployment) throw Error("Deploy contracts first");
  const abis = JSON.parse(fs.readFileSync("web/generated/abis.json"));
  if(fs.existsSync("data/social-deployment.json")) {
    const social=JSON.parse(fs.readFileSync("data/social-deployment.json")), extra=JSON.parse(fs.readFileSync("web/generated/social-abis.json"));
    for(const name of ["CommentManager","ChannelManager","ExchangeSocialHook"]) abis[name]=extra[name];
  }
  return {
    deployment,
    abis,
    sdk: new ExchangeSDK(provider, null, deployment, abis),
  };
}
function auth(req, res, next) {
  const session = sessions.get(
    (req.headers.authorization || "").replace(/^Bearer /, ""),
  );
  if (!session || session.expires < Date.now())
    return res.status(401).json({ error: "Sign in with your wallet" });
  req.address = session.address;
  next();
}
app.get("/api/deployment", (_, res) => res.json(context().deployment));
app.get("/api/markets", async (_, res) => {
  const { sdk } = context();
  res.json({
    observedBlock: await provider.getBlockNumber(),
    markets: await sdk.markets(),
  });
});
app.post("/api/auth/nonce", (req, res) => {
  const origin = allowed.includes(req.headers.origin)
      ? req.headers.origin
      : allowed[0],
    nonce = generateNonce();
  nonces.set(nonce, {
    expires: Date.now() + 300000,
    domain: new URL(origin).host,
    uri: origin,
  });
  res.json({
    nonce,
    domain: new URL(origin).host,
    uri: origin,
    chainId: 31372,
  });
});
app.post("/api/auth/verify", async (req, res) => {
  const message = new SiweMessage(req.body.message),
    n = nonces.get(message.nonce);
  if (
    !n ||
    n.expires < Date.now() ||
    message.chainId !== 31372 ||
    message.uri !== n.uri
  )
    throw Error("Invalid or expired nonce");
  nonces.delete(message.nonce);
  await message.verify({
    signature: req.body.signature,
    nonce: message.nonce,
    domain: n.domain,
  });
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    address: message.address,
    expires: Date.now() + 86400000,
  });
  res.json({ token, address: message.address });
});
app.post("/api/auth/logout", auth, (req, res) => {
  sessions.delete((req.headers.authorization || "").replace(/^Bearer /, ""));
  res.json({ ok: true });
});
function sessionAddress(req) {
  const s = sessions.get(
    (req.headers.authorization || "").replace(/^Bearer /, ""),
  );
  return s && s.expires > Date.now() ? s.address : null;
}
function profileFor(address) {
  if (!isAddress(address)) throw Error("Invalid Ethereum address");
  const normalized = getAddress(address),
    p = load("profiles", {})[normalized.toLowerCase()];
  return (
    p || {
      address: normalized,
      displayName: "",
      bio: "",
      createdAt: null,
      updatedAt: null,
    }
  );
}
function commentView(c, address) {
  const votes = load("comment-votes", {})[c.id] || {};
  return {
    ...c,
    score: Object.values(votes).reduce((a, b) => a + b, 0),
    voteCount: Object.keys(votes).length,
    myVote: address ? votes[address.toLowerCase()] || 0 : 0,
    profile: profileFor(c.address),
  };
}
app.get("/api/profiles/:address", (req, res) =>
  res.json(profileFor(req.params.address)),
);
app.post("/api/profile", auth, (req, res) => {
  const displayName = String(req.body.displayName || "").trim(),
    bio = String(req.body.bio || "").trim();
  if (displayName.length > 50 || bio.length > 1000)
    throw Error("Name max 50 and bio max 1000 characters");
  const profiles = load("profiles", {}),
    key = req.address.toLowerCase(),
    now = new Date().toISOString();
  profiles[key] = {
    address: getAddress(req.address),
    displayName,
    bio,
    createdAt: profiles[key]?.createdAt || now,
    updatedAt: now,
  };
  save("profiles", profiles);
  res.json(profiles[key]);
});
app.get("/api/comments/:id", (req, res) => {
  const address = sessionAddress(req),
    sort = req.query.sort === "new" ? "new" : "top",
    items = load("comments", [])
      .filter((c) => c.statementId === req.params.id)
      .map((c) => commentView(c, address));
  items.sort(
    (a, b) =>
      (sort === "top" ? b.score - a.score : 0) ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
  res.json(items);
});
app.post("/api/comments/:id", auth, (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(req.params.id) || !text || text.length > 5000)
    throw Error("Statement ID and 1–5000 character comment required");
  const all = load("comments", []),
    parentId = req.body.parentId || null;
  if (parentId) {
    let p = all.find(
      (c) => c.id === parentId && c.statementId === req.params.id,
    );
    if (!p) throw Error("Parent must be in this statement discussion");
    let depth = 1;
    while (p.parentId) {
      p = all.find((c) => c.id === p.parentId);
      if (!p || ++depth > 4) throw Error("Maximum reply depth is four");
    }
  }
  const c = {
    id: crypto.randomUUID(),
    statementId: req.params.id,
    address: req.address,
    parentId,
    text,
    createdAt: new Date().toISOString(),
    history: [],
  };
  all.push(c);
  save("comments", all);
  res.json(commentView(c, req.address));
});
app.patch("/api/comments/:id", auth, (req, res) => {
  const all = load("comments", []),
    c = all.find((c) => c.id === req.params.id);
  if (!c || c.address.toLowerCase() !== req.address.toLowerCase())
    return res.sendStatus(403);
  const text = String(req.body.text || "").trim();
  if (!text || text.length > 5000) throw Error("Invalid text");
  c.history.push({ text: c.text, at: new Date().toISOString() });
  c.text = text;
  c.updatedAt = new Date().toISOString();
  save("comments", all);
  res.json(commentView(c, req.address));
});
app.post("/api/comments/:id/vote", auth, (req, res) => {
  const c = load("comments", []).find((c) => c.id === req.params.id),
    vote = Number(req.body.vote);
  if (!c || ![-1, 0, 1].includes(vote))
    throw Error("Unknown comment / vote must be -1, 0 or 1");
  if (c.address.toLowerCase() === req.address.toLowerCase())
    return res
      .status(403)
      .json({ error: "You cannot vote on your own comment" });
  const votes = load("comment-votes", {}),
    key = req.address.toLowerCase();
  votes[c.id] ??= {};
  if (vote === 0) delete votes[c.id][key];
  else votes[c.id][key] = vote;
  save("comment-votes", votes);
  res.json(commentView(c, req.address));
});
app.get("/api/proof/fixtures", (req, res) => res.json(readProofCatalog(root).fixtures));
app.get("/api/proof/catalog", async (req, res) => res.json(await catalogWithChain(root, context().sdk)));
app.get("/api/proof/certificates/perf05/:caseName", (req, res) => {
  if (!["true-registration", "true-proof"].includes(req.params.caseName)) return res.status(404).json({error: "Published certificate not found"});
  res.json(JSON.parse(fs.readFileSync(`proof/profiles/perf05/certificates/${req.params.caseName}.json`, "utf8")));
});
app.get("/api/proof/profile", (req, res) =>
  res.json(
    fs.existsSync("proof/manifest.json")
      ? JSON.parse(fs.readFileSync("proof/manifest.json"))
      : {},
  ),
);
function storePackage(input) {
  input=validatePublishedPackage(input);
  const source = input.source;
  const payload = { schema: "exchange-lean-package-v1", ...input, source };
  const profile = readProofCatalog(root).profiles.find(p => p.profileId.toLowerCase() === input.profileId?.toLowerCase());
  if (profile) payload.proofProfile = profile;
  delete payload.id;
  delete payload.createdAt;
  const serialized = JSON.stringify(payload),
    id = crypto.createHash("sha256").update(serialized).digest("hex"),
    dir = "data/packages/" + id;
  fs.mkdirSync(dir, { recursive: true });
  if(source)fs.writeFileSync(dir + "/Challenge.lean", source);
  const pkg = {
    ...payload,
    id,
    sourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(dir + "/package.json", JSON.stringify(pkg, null, 2));
  return pkg;
}
app.post("/api/packages", (req, res) => res.json(storePackage(req.body)));
async function externalJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error("Published source returned HTTP " + r.status);
  return r.json();
}
async function palomarEntry(id, version) {
  if (
    !/^PALOMAR-\d{4}-\d{2}-\d{2}-\d{6}$/.test(id) ||
    !Number.isInteger(version) ||
    version < 1
  )
    throw Error("Exact Palomar ID and version required");
  return externalJSON(
    "https://data.palomar-registry.org/entries/" +
      id +
      "-v" +
      version +
      ".json",
  );
}
async function snapshotFile(repository, commit, file, optional = false) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(commit) ||
    !file ||
    file.startsWith("/") ||
    file.split("/").some((p) => !p || p === "." || p === "..") ||
    /[?#%\\]/.test(file)
  )
    throw Error("Invalid pinned repository path");
  const url =
    "https://raw.githubusercontent.com/" +
    repository +
    "/" +
    commit +
    "/" +
    file.split("/").map(encodeURIComponent).join("/");
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (optional && r.status === 404) return null;
  if (!r.ok) throw Error(file + " returned HTTP " + r.status);
  const content = await r.text();
  if (content.length > 1000000)
    throw Error("File exceeds local 1 MB import limit");
  return {
    path: file,
    url,
    content,
    sha256: crypto.createHash("sha256").update(content).digest("hex"),
  };
}
app.get("/api/palomar/:id/:version", async (req, res) =>
  res.json(await palomarEntry(req.params.id, Number(req.params.version))),
);
app.post("/api/palomar/import", async (req, res) => {
  const e = await palomarEntry(req.body.id, Number(req.body.version)),
    f = e.formalization,
    src = e.source,
    base = src.project_path ? src.project_path.replace(/\/$/, "") + "/" : "";
  if (!f.challenge_path) throw Error("Registry entry lacks a challenge path");
  const paths = [
    f.challenge_path,
    f.solution_path,
    f.formalization_metadata_path,
    f.comparator_config_path,
    f.lakefile_path,
    "lean-toolchain",
    "lake-manifest.json",
  ].filter(Boolean);
  const files = [];
  for (const p of [...new Set(paths)]) {
    const file = await snapshotFile(
      src.repository,
      src.commit,
      base + p,
      p === "lake-manifest.json",
    );
    if (file) files.push(file);
  }
  const challenge = files.find((x) => x.path === base + f.challenge_path),
    solution = files.find((x) => x.path === base + f.solution_path);
  const target = req.body.targetDeclaration || f.theorem_names?.[0] || "";
  if (f.theorem_names?.length && !f.theorem_names.includes(target))
    throw Error("Select a declared theorem");
  res.json(
    storePackage({
      title: e.title,
      description: e.abstract,
      source: challenge.content,
      solution: solution?.content || "",
      targetDeclaration: target,
      externalRef: {
        registry: "Palomar",
        id: e.id,
        version: e.version,
        repository: src.repository,
        commit: src.commit,
        projectPath: src.project_path,
      },
      formalization: f,
      files,
      registryRecord: e,
    }),
  );
});
app.get("/api/packages/:id", (req, res) => {
  if (!/^[0-9a-f]{64}$/.test(req.params.id)) return res.sendStatus(400);
  res.json(
    JSON.parse(
      fs.readFileSync("data/packages/" + req.params.id + "/package.json"),
    ),
  );
});
const proofJobs = createProofJobs({
  history: load("proof-jobs", []), save: rows => save("proof-jobs", rows),
  execute: createProofWorker(root), root,
});
registerProofRoutes(app, {
  jobs: proofJobs, auth,
  validate: body => {
    if (!fs.existsSync("proof/runner.mjs")) throw Object.assign(Error("Real Lean/zk runner is unavailable"), {statusCode:503});
    const supported = JSON.parse(fs.readFileSync("proof/manifest.json", "utf8"));
    if (body?.profileId && body.profileId.toLowerCase() !== supported.profileId.toLowerCase())
      throw Error("The local runner supports v3 only. Import an external certificate for the selected additional profile.");
    if (body?.targetDeclaration && supported.goalDeclaration && body.targetDeclaration !== supported.goalDeclaration)
      throw Error(`This installed profile checks ${supported.goalDeclaration}. Wrap the selected proposition in that declaration.`);
  },
});
app.get("/api/palomar", async (req, res) => {
  const response = await fetch(
    "https://data.palomar-registry.org/recent.json",
    { signal: AbortSignal.timeout(12000) },
  );
  if (!response.ok) throw Error("Palomar " + response.status);
  res.json({
    source: "https://data.palomar-registry.org/recent.json",
    data: await response.json(),
  });
});
app.get("/api/governance", async (_, res) => {
  const { deployment, abis, sdk } = context(),
    g = sdk.contract("governor"),
    logs = await g.queryFilter(
      g.filters.ProposalCreated(),
      deployment.deploymentBlock,
    );
  const items = [];
  for (const log of logs) {
    const a = log.args;
    items.push({
      id: a.proposalId.toString(),
      proposer: a.proposer,
      targets: [...a.targets],
      values: [...a.getValue("values")].map(String),
      calldatas: [...a.calldatas],
      description: a.description,
      state: Number(await g.state(a.proposalId)),
      snapshot: Number(await g.proposalSnapshot(a.proposalId)),
      deadline: Number(await g.proposalDeadline(a.proposalId)),
      votes: [...(await g.proposalVotes(a.proposalId))].map(String),
      tx: log.transactionHash,
      block: log.blockNumber,
    });
  }
  res.json(items);
});
app.post("/api/devnet/advance", async (req, res) => {
  if (Number((await provider.getNetwork()).chainId) !== 31372)
    throw Error("Local Exchange chain only");
  const blocks = Math.max(1, Math.min(100, Number(req.body.blocks) || 1)),
    seconds = Math.max(0, Math.min(86400, Number(req.body.seconds) || 0));
  if (seconds) await provider.send("evm_increaseTime", [seconds]);
  for (let i = 0; i < blocks; i++) await provider.send("evm_mine", []);
  res.json({ block: await provider.getBlockNumber(), seconds });
});
app.get("/api/activity", async (req, res) => {
  const { deployment, abis } = context(),
    latest = await provider.getBlockNumber(),
    end = Math.min(Number(req.query.before || latest), latest),
    start = Math.max(0, end - 19),
    interfaces = Object.entries(abis).map(([n, a]) => [n, new Interface(a)]);
  const blocks = [];
  for (let n = end; n >= start; n--) {
    const block = await provider.getBlock(n, true);
    if (!block) continue;
    const transactions = [];
    for (const hash of block.transactions) {
      const r = await provider.getTransactionReceipt(hash),
        tx = await provider.getTransaction(hash),
        events = [];
      for (const log of r.logs) {
        for (const [contract, iface] of interfaces) {
          try {
            const p = iface.parseLog(log);
            if (!p) continue;
            const args = Object.fromEntries(
              p.fragment.inputs.map((i, x) => [
                i.name || String(x),
                typeof p.args[x] === "bigint"
                  ? p.args[x].toString()
                  : p.args[x],
              ]),
            );
            events.push({
              address: log.address,
              contract,
              event: p.name,
              args,
            });
            break;
          } catch {}
        }
      }
      transactions.push({
        hash,
        from: tx.from,
        to: tx.to,
        status: r.status,
        gasUsed: r.gasUsed.toString(),
        events,
      });
    }
    blocks.push({
      number: n,
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      transactions,
    });
  }
  res.json({
    chainId: 31372,
    latest,
    next: start > 0 ? start - 1 : null,
    blocks,
  });
});
app.get("/api/activity/:hash", async (req, res) => {
  const { deployment, abis } = context(),
    tx = await provider.getTransaction(req.params.hash),
    receipt = await provider.getTransactionReceipt(req.params.hash);
  if (!tx || !receipt) return res.sendStatus(404);
  const actorSet = new Set([tx.from, tx.to].filter(Boolean));
  for (const l of receipt.logs) {
    if (
      l.topics[0] ===
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" &&
      l.topics.length === 3
    ) {
      for (const topic of l.topics.slice(1))
        if (!/^0x0+$/.test(topic)) actorSet.add("0x" + topic.slice(-40));
    }
  }
  const actors = [...actorSet];
  const assets = new Set([deployment.contracts.token]);
  for (const l of receipt.logs)
    if (
      l.topics[0] ===
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
    )
      assets.add(l.address);
  const balances = [];
  for (const asset of assets)
    for (const actor of actors) {
      try {
        const c = new Contract(asset, abis.TrueToken, provider);
        balances.push({
          asset,
          actor,
          before:
            (await provider.getCode(
              asset,
              Math.max(0, receipt.blockNumber - 1),
            )) === "0x"
              ? "0"
              : String(
                  await c.balanceOf(actor, {
                    blockTag: Math.max(0, receipt.blockNumber - 1),
                  }),
                ),
          after: String(
            await c.balanceOf(actor, { blockTag: receipt.blockNumber }),
          ),
        });
      } catch {}
    }
  res.json({
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    block: receipt.blockNumber,
    balances,
  });
});
app.use((err, req, res, next) => {
  console.error(err.shortMessage || err.message);
  res.status(err.statusCode ?? 400).json({ error: err.shortMessage || err.message });
});
const server = app.listen(4172, "127.0.0.1", () =>
  console.log("Exchange API http://127.0.0.1:4172"),
);

for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, async () => {
  server.close();
  await proofJobs.close();
  provider.destroy();
  process.exit(signal === "SIGINT" ? 130 : 143);
});
