# Exchange — mathematical prediction markets

Independent local implementation B: genuine Gnosis Conditional Tokens, canonical ERC-20 wrappers, unchanged Uniswap V2 core/periphery, OpenZeppelin Governor/Timelock, and Splits V2 fee epochs. React trading terminal; Express API; ethers SDK. All funds are local test assets.

## Run

Node 22+ and npm are required. Run from this folder:

```sh
npm ci
npm run compile
npm run dev
```

Open **http://127.0.0.1:5172**. API is **http://127.0.0.1:4172**; RPC **http://127.0.0.1:9546**, chain **31372**. `npm run dev` starts the local chain if needed, deploys if the saved protocol has no code, and starts API/Vite. Logs are `data/{chain,api,web}.log`. Ctrl+C stops processes launched by that invocation. `npm run build` builds the web bundle.

Deployment reads `proof/deployment.json` and deploys its immutable `LeanProofBridge` artifact, whose constructor deploys the original RISC Zero Groth16 verifier. Without this artifact deployment is fail-closed. The main application never deploys TestVerifier, never displays a fabricated certificate, and has no administrator resolve action.

The proof toolchain has additional native dependencies and pinned paths: see `proof/manifest.json`, `proof/runtime.local.json`, and the coordinator-provided instructions in `proof/`. Installed local binaries are currently required for proof jobs. `npm ci` by itself does not install Lean/RISC Zero or their proving keys. A successful native Lean check is separate from a zk certificate and an onchain payout.

### Wallets

Choose an injected EIP-1193 wallet or **Devnet · Alice/Bob/Carol**. Devnet keys are the public Hardhat mnemonic, accepted by this UI only on localhost and chain 31372; never fund these addresses on public networks. Each initial account receives 100,000 T and local test ETH. T has fixed genesis supply; there is no protocol mint button.

Connect is sufficient for onchain actions. Opening your address profile and choosing **Sign in** signs a SIWE message for profile/discussion writes; this does not approve spending. Profiles always display the underlying Ethereum address.

## Core workflow

1. **Create market:** upload Lean source/portable JSON or load the published `Nat.add_comm` package. Inspect the exact goal/profile. Run registration and wait for a genuine GoalWellFormed certificate. Sign the registry transaction; CTF, both canonical wrappers and two V2 pairs are created atomically.
2. **Fund:** split T into equal YES/NO using the original Seer router. Add T plus one outcome into its V2 pool. Add both pools independently; LP shares and unused amounts follow original V2 rules.
3. **Trade:** request a quote; select input, outcome and slippage; approve if needed; submit a swap. Minimum output and a chain-timestamp deadline are enforced onchain. LP calls likewise enforce minimum amounts.
4. **Prove:** submit source containing the registered goal and a solution of that exact goal (or its negation). Check, generate the genuine certificate, then submit it with the wallet. Registry verifies the immutable profile and atomically calls CTF `reportPayouts`.
5. **Redeem:** the winning wrapped token unwraps and redeems for T through the original Seer router; the losing side redeems for zero. Liquidity is unnecessary for redemption. V2 trading remains available after resolution.
6. **Block activity:** inspect block number/hash/time, transaction hash/from/to, decoded logs, amounts and historical balances. Balances compare the previous block end with the selected block end, not an invented intra-block trace.

An unresolved proposition is never automatically false. Built-in derived statements implement `ResolvedBy`, `ResolvedAs`, `ResolvedAsBy`; deadlines are inclusive and use the protocol’s recorded resolution timestamp. Versioned operators can be added through governance, with immutable adapter IDs and committed argument bytes. The bundled example is `UnresolvedByOperator`.

## Governance and fee recipients

Delegate liquid T first. T already escrowed in CTF or pools does not give the original owner direct voting power. Governor uses one-block voting delay, 12-block voting period, 4% quorum and a 10-second Timelock. These short parameters are for local demonstration. The page provides explicit local block/time advancement controls.

Governance proposals expose exact targets/calldata. Register a new proof profile or statement operator; retire new registration or disable resolution separately. Existing verifier/adapter addresses cannot be overwritten. Migration uses new IDs and explicit new markets. Governance never directly writes a mathematical payout.

When `proof/deployment.json` supplies a new immutable profile, `node scripts/install-profile.mjs` performs a local governance installation: deploy bridge, delegate local T, propose, vote, queue, advance the local Timelock, and execute. It preserves existing contract addresses and historical records, retires registration under the previous default profile, and records real receipts in `data/profile-installation.json`. It is restricted to RPC 9546 / chain 31372 and cannot install an already registered ID.

V2’s 0.30% swap fee remains original. With `feeTo` active, approximately one sixth of swap fee growth is minted as **LP tokens on liquidity events**, not immediate T per swap. Those LP tokens accumulate in AllocationController. Permissionless **Collect** assigns received LP to the current immutable Split epoch; **Distribute** credits SplitsWarehouse; beneficiaries **Withdraw** their LP. Old epochs remain independently accessible. Splits retains its original one-unit/dust conventions; the UI shows withdrawable Warehouse credit excluding the reserved unit.

Anyone can propose a sorted table of at most 32 addresses totaling 10,000 basis points. Exactly every address with a decreased share must consent; it may revoke before activation. A proposal based on an old epoch is stale. Applied splits are ownerless. Timelock controls V2’s `feeToSetter`, so governance can redirect future upstream protocol fee flow; it cannot alter previously created ownerless splits.

## Offchain research and discussion

Palomar discovery reads the real `recent.json`/versioned entry interface. Import fetches the exact GitHub commit’s challenge, solution, YAML, Comparator config, Lake config, toolchain and lockfile where available, retaining SHA-256 for each file and the full registry record. Nothing fetched is automatically accepted as a proof. The first declared theorem is selected initially; the source/profile must be supported by the installed proof pipeline. Large Mathlib/FLT imports are not promised to fit the local profile or machine.

Portable JSON packages preserve source, source hash, imported files/dependencies, registry references, selected declaration, goal/profile and attached registration result. Certificates and proof job outputs can be downloaded separately. External publication is an action for the author, not an automatic API side effect.

Profiles (`displayName`, `bio`), threaded replies, comment revisions and votes are stored in local JSON files. SIWE sessions derive authorship. One address has at most one `-1/+1` vote per comment and may switch/remove it; self-votes are rejected server-side. Top sorts by score descending, creation time descending, then ID ascending; New uses creation time and ID. These votes do not determine protocol truth, payouts or Governor power. Comment bodies use escaped text rendering.

## SDK

```js
import { JsonRpcProvider, HDNodeWallet, parseEther } from "ethers";
import fs from "node:fs";
import { ExchangeSDK } from "./sdk/index.mjs";
const provider = new JsonRpcProvider("http://127.0.0.1:9546");
const deployment = JSON.parse(fs.readFileSync("data/deployment.json"));
const abis = JSON.parse(fs.readFileSync("web/generated/abis.json"));
const signer = HDNodeWallet.fromPhrase(
  "test test test test test test test test test test test junk",
).connect(provider);
const sdk = new ExchangeSDK(provider, signer, deployment, abis, console.log);
const market = (await sdk.markets())[0];
const quote = await sdk.quote(market, 0, true, parseEther("1"));
await sdk.trade(market, 0, true, parseEther("1"), (quote * 99n) / 100n);
```

`ExchangeSDK` also implements create/split/merge/LP/redeem/resolve/operator/governance/fee actions and both extra features. `sdk/social.mjs` supplies SIWE profiles, comments, replies and votes. Proof runner JSON stdin is documented in `ARCHITECTURE.md`.

## Verification

```sh
npm test          # isolated in-process Ganache, real economic contracts, test-only verifier
npm run test:api  # running local API; actual SIWE/Palomar/package/explorer checks
npm run test:social # running local API; profiles/replies/votes/authorship persistence
npm run build
```

Economic checks: **15 passing**, including wrapper names/symbols, separate LPs, real swaps and slippage, protocol LP mint, all losing consents/revocation/stale proposals, historical fee withdrawals, derived deadlines, CTF payout/redeem, post-resolution V2 swaps/LP exits, Governor→Timelock→operator registration, atomic arbitrage success/full revert, execution journal. This test harness is **not Lean/zk coverage**.

API checks: **7 passing**, including exact live Palomar import and real SIWE signatures. Social API checks: **5 passing**. Reports are `data/{economic,api,social}-test-report.json`. Manual browser checks and proof integration status are in `docs/VERIFICATION.md`. Extra feature scenarios are in `EXTRA-FEATURES.md`; dependency provenance/licenses in `THIRD-PARTY.md`.

Current deployment uses the final v3 profile `0x190eddca14d88c2af77ea74b7ba257dcb7f9236c1cf7c8002890a992332c485e`, installed by the actual Governor and Timelock in block 112. Registrations under the former v2 profile are disabled. The site, API and bundled fixture select v3; original contract addresses, T balances and chain history are preserved. Installation receipts and post-installation assertions are in `data/profile-installation.json` and `data/profile-verification.json`.

The main chain still has no markets. End-to-end published-theorem settlement remains pending until the coordinator's actual v3 zk certificates are generated and verified; no economic harness result is substituted for that requirement.

Proof jobs now use the existing SIWE wallet login for private source/results and cancellation. A bounded p-queue scheduler deduplicates requests, allows one execution, and limits waiting work to 16 total / 4 per wallet. An outer supervisor enforces the sampled 2 GiB budget and 5/30/120-second action timeouts, waiting for descendant cleanup on cancel. Expensive generation remains disabled. Seven new scheduler/worker tests pass; see [VALIDATION.md](VALIDATION.md) for measured checks and remaining browser/proof verification.
