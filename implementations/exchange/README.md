# Exchange — mathematical prediction markets

Independent local implementation B: genuine Gnosis Conditional Tokens, canonical ERC-20 wrappers, unchanged Uniswap V2 core/periphery, OpenZeppelin Governor/Timelock, and Splits V2 fee epochs. React trading terminal; Express API; ethers SDK. All funds are local test assets.

## Current scope

Certificates are prepared externally. The website loads or accepts the resulting certificate, checks its exact goal/profile/outcome with the immutable onchain bridge, and lets the wallet register or resolve the market. Ordering or generating certificates from the website is explicitly deferred. Optional native Lean **Check only** remains available for the installed v3 runtime; it is not a certificate and cannot resolve a market. Existing API/CLI job interfaces, private history and cancellation are preserved; expensive local proving remains disabled.

The standalone app bundles all four genuine perf05 artifacts: True-goal registration (CI3), False-goal registration (CI5), YES proof (CI4), and NO refutation (CI6). **Load → Verify → Submit** are separate actions; the bundled buttons require neither file-picker permission nor a remote job. It also accepts generic external bundles containing a canonical goal export and a genuine certificate under either pinned v3 or perf05 policy, without a theorem-hash allowlist. The original RISC Zero verifier and governance-admitted immutable bridge both verify the claim at one observed block. Uploaded source and prose remain unverified descriptions of that export; this import does not compile them or establish their semantic correspondence. See [EXTERNAL-CERTIFICATES.md](EXTERNAL-CERTIFICATES.md) for the exact workflow and limits.

## Run

Node 22+ and npm are required. Run from this folder:

```sh
npm ci
npm run compile
npm run dev
```

Open **http://127.0.0.1:5172**. API is **http://127.0.0.1:4172**; RPC **http://127.0.0.1:9546**, chain **31372**. `npm run dev` starts the local chain if needed, creates an initial protocol/ECP deployment when no saved deployment exists, and starts API/Vite. A saved deployment whose bytecode is missing or bound to another registry is an error requiring recovery; startup does not silently replace it. Logs are `data/{chain,api,web}.log`. Ctrl+C or a startup failure stops only processes launched by that invocation. `npm run build` builds the web bundle after generated ABI/deployment files exist.

Startup validates tracked `proof/bootstrap-deployment.json` and `proof/bootstrap/LeanProofBridge.json` against the pinned artifact SHA-256, v3 image/profile and manifest hash, materializing the ignored `proof/deployment.json` only if absent. An existing different descriptor is rejected rather than relabelled. Deployment uses the immutable bridge artifact, whose constructor deploys the original RISC Zero Groth16 verifier. The main application never deploys TestVerifier, never displays a fabricated certificate, and has no administrator resolve action. This compact bootstrap needs no native Lean/prover binary. Fresh deployment initially admits v3; installing the additional perf05 profile still requires its explicit governance lifecycle.

For a separate local instance, use a separate application directory and `EXCHANGE_PORT_OFFSET=10000 npm run dev`: RPC19546, API14172, web15172, still chain31372. Only port numbers change; endpoints remain loopback and dev-wallet chain checks remain active. Startup supplies the matching Vite variable automatically. Each directory retains its own Ganache database, generated files and Vite cache. Never point two instances at the same `data/chain` directory. Optional historical installation/evidence scripts retain their explicit original9546 gates; they are not part of the offset startup path.

The proof toolchain has additional native dependencies and pinned paths: see `proof/manifest.json`, `proof/runtime.local.json`, and the coordinator-provided instructions in `proof/`. Installed local binaries are currently required for proof jobs. `npm ci` by itself does not install Lean/RISC Zero or their proving keys. A successful native Lean check is separate from a zk certificate and an onchain payout.

### Wallets

Choose an injected EIP-1193 wallet or **Devnet · Alice/Bob/Carol**. Devnet keys are the public Hardhat mnemonic, accepted by this UI only on localhost and chain 31372; never fund these addresses on public networks. Each initial account receives 100,000 T and local test ETH. T has fixed genesis supply; there is no protocol mint button.

Connect is sufficient for onchain actions, including profiles, wallet blogs, comments and votes. Each social write is a transaction to the original Ethereum Comments Protocol; full text and history remain onchain. SIWE sign-in is used only by private source/job tools. Profiles always display the underlying Ethereum address. See [ONCHAIN-SOCIAL.md](ONCHAIN-SOCIAL.md).

Injected account/network/disconnect events clear private forms and sign-in and require an explicit reconnect. **Log out of SIWE** revokes the server session and clears private drafts while retaining the connected wallet. Late sign-in, proof-import and SDK continuations cannot restore an earlier wallet session. Already submitted transactions remain onchain; logout does not cancel them.

## Core workflow

1. **Create market:** select the exact goal/profile and load or import an externally prepared GoalWellFormed certificate. Verify it against the immutable bridge, inspect the canonical goal package, then sign the registry transaction. CTF, both canonical wrappers and two V2 pairs are created atomically. Source/package import by itself is not registration approval.
2. **Fund:** split T into equal YES/NO using the original Seer router. Add T plus one outcome into its V2 pool. Add both pools independently; LP shares and unused amounts follow original V2 rules.
3. **Trade:** request a quote; select input, outcome and slippage; approve if needed; submit a swap. Minimum output and a chain-timestamp deadline are enforced onchain. LP calls likewise enforce minimum amounts.
4. **Resolve:** open Proof lab, choose YES or NO, and load or import an externally prepared certificate for that exact market goal/profile/outcome. Verify it, then submit it with the wallet. Registry rechecks the genuine certificate and atomically calls CTF `reportPayouts`. Changing the selected binding invalidates previous readiness.
5. **Redeem:** the winning wrapped token unwraps and redeems for T through the original Seer router; the losing side redeems for zero. Liquidity is unnecessary for redemption. V2 trading remains available after resolution.
6. **Block activity:** inspect block number/hash/time, transaction hash/from/to, decoded logs, amounts and historical balances. Balances compare the previous block end with the selected block end, not an invented intra-block trace.

An unresolved proposition is never automatically false. Built-in derived statements implement `ResolvedBy`, `ResolvedAs`, `ResolvedAsBy`; deadlines are inclusive and use the protocol’s recorded resolution timestamp. Versioned operators can be added through governance, with immutable adapter IDs and committed argument bytes. The bundled example is `UnresolvedByOperator`.

## Governance and fee recipients

Delegate liquid T first. T already escrowed in CTF or pools does not give the original owner direct voting power. Governor uses one-block voting delay, 12-block voting period, 4% quorum and a 10-second Timelock. These short parameters are for local demonstration. The page provides explicit local block/time advancement controls.

Governance proposals expose exact targets/calldata. Register a new proof profile or statement operator; retire new registration or disable resolution separately. Existing verifier/adapter addresses cannot be overwritten. Migration uses new IDs and explicit new markets. Governance never directly writes a mathematical payout.

The page now reads a single-block original Governor snapshot with exact ordered call values, ETA, quorum, historical wallet weight and `hasVoted`. Buttons show stage/permission/preflight refusals and recheck before requesting a transaction. Current delegated T differs from historical voting power. Use **Mine 1 block** to enter Active; a14-block jump can skip the entire voting window. SDK `governanceSnapshot(address)` exposes the same review. These new UI controls have targeted tests and a bounded successful build; their browser retest is recorded separately in `VALIDATION.md`.

When `proof/deployment.json` supplies a new immutable profile, `node scripts/install-profile.mjs` performs a local governance installation: deploy bridge, delegate local T, propose, vote, queue, advance the local Timelock, and execute. It preserves existing contract addresses and historical records, retires registration under the previous default profile, and records real receipts in `data/profile-installation.json`. It is restricted to RPC 9546 / chain 31372 and cannot install an already registered ID.

V2’s 0.30% swap fee remains original. With `feeTo` active, approximately one sixth of swap fee growth is minted as **LP tokens on liquidity events**, not immediate T per swap. Those LP tokens accumulate in AllocationController. Permissionless **Collect** assigns received LP to the current immutable Split epoch; **Distribute** credits SplitsWarehouse; beneficiaries **Withdraw** their LP. Old epochs remain independently accessible. Splits retains its original one-unit/dust conventions; the UI shows withdrawable Warehouse credit excluding the reserved unit.

Anyone can propose a sorted table of at most 32 addresses totaling 10,000 basis points. Exactly every address with a decreased share must consent; it may revoke before activation. A proposal based on an old epoch is stale. Applied splits are ownerless. Timelock controls V2’s `feeToSetter`, so governance can redirect future upstream protocol fee flow; it cannot alter previously created ownerless splits.

## Research import and onchain discussion

Palomar discovery reads the real `recent.json`/versioned entry interface. Import fetches the exact GitHub commit’s challenge, solution, YAML, Comparator config, Lake config, toolchain and lockfile where available, retaining SHA-256 for each file and the full registry record. Nothing fetched is automatically accepted as a proof. The first declared theorem is selected initially; the source/profile must be supported by the installed proof pipeline. Large Mathlib/FLT imports are not promised to fit the local profile or machine.

Portable JSON packages preserve explicitly submitted source, source hash, imported files/dependencies, registry references, selected declaration, goal/profile and attached registration result. Generic external packages also preserve the exact canonical goal export and certificate; source is optional, and the package explicitly records `sourceGoalRelation: not-verified`. Package API validation checks binding and encoding, not EVM pairings; the registry still checks the certificate in the registration transaction. Certificates and proof job outputs can be downloaded separately. External publication is an action for the author, not an automatic API side effect.

Reimporting a package restores an unverified draft with its profile and exact source/export bytes. Advertised source/file hashes are checked, while source-to-goal semantics remain unverified. Its external artifact fills the verification field; Create remains unavailable until explicit original-verifier/bridge verification. Legacy packages containing only an ABI certificate need the corresponding external artifact to use this reviewed flow. Private check/job results are not automatically attached to newly published packages.

Profiles (`displayName`, `bio`), personal full-text blogs, threaded replies, revisions and votes use the pinned original ECP contracts plus a locked-channel policy hook and Solady SSTORE2 archives. Wallet signatures establish authorship; no API session can post for an address. One address has at most one current `-1/+1` vote per entry and may switch/remove it; the hook rejects self-votes. Top sorts by exact score, creation time and ID; New uses creation time and ID. These votes do not determine protocol truth, payouts or Governor power. Deletion is a tombstone and preserves historical full text. Old JSON records remain explicitly legacy, not onchain truth; old mutation endpoints return410.

## SDK

```js
import { HDNodeWallet, parseEther } from "ethers";
import fs from "node:fs";
import { ExchangeSDK } from "./sdk/index.mjs";
import { createLocalProvider } from "./sdk/local-provider.mjs";
const provider = createLocalProvider("http://127.0.0.1:9546");
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

`ExchangeSDK` also implements create/split/merge/LP/redeem/resolve/operator/governance/fee actions and both extra features. `ExchangeSocialSDK` in `sdk/social.mjs` takes this wallet-aware client, `data/social-deployment.json` and `web/generated/social-abis.json`; it supplies direct ECP profiles/blogs/comments/replies/votes and chain-state archive rebuild. Proof runner JSON stdin is documented in `ARCHITECTURE.md`.

## Verification

```sh
npm test          # isolated in-process Ganache, real economic contracts, test-only verifier
npm run test:api  # running local API; actual SIWE/Palomar/package/explorer checks
npm run test:social # current read/codec policy + isolated Shanghai ECP invariants
npm run build
```

Economic checks: **15 passing**, including wrapper names/symbols, separate LPs, real swaps and slippage, protocol LP mint, all losing consents/revocation/stale proposals, historical fee withdrawals, derived deadlines, CTF payout/redeem, post-resolution V2 swaps/LP exits, Governor→Timelock→operator registration, atomic arbitrage success/full revert, execution journal. This test harness is **not Lean/zk coverage**.

Historical API checks: **7 passing**, including exact live Palomar import and real SIWE signatures. The former5 social API tests/report describe the superseded offchain design; they do not validate the active onchain social layer. Current social contract checks are **9/9**, policy/codec checks **6/6**; raw live deployment and 11 browser-initiated transactions are documented in [ONCHAIN-SOCIAL.md](ONCHAIN-SOCIAL.md). Manual proof/economic checks remain separate. Extra feature scenarios are in `EXTRA-FEATURES.md`; dependency provenance/licenses in `THIRD-PARTY.md`.

Historical v3 installation: the final v3 profile `0x190eddca14d88c2af77ea74b7ba257dcb7f9236c1cf7c8002890a992332c485e` was installed by the actual Governor and Timelock in block 112. Registrations under the former v2 profile are disabled. The additional perf05 profile has its own immutable ID and bridge; current registration/resolution availability is read from the chain. Installation receipts and post-installation assertions are in `data/profile-installation.json` and `data/profile-verification.json`.

Genuine perf05 CI certificates are bundled for both True and False goals. Their cryptographic evidence is separate from the isolated economic harness. Exact manual browser transactions and remaining scenario coverage are recorded in the project manual validation journal; this README does not treat artifact availability or unit tests as a completed browser cycle.

The preserved API/CLI job subsystem uses the existing SIWE wallet login for private source/results and cancellation. A bounded p-queue scheduler deduplicates requests, allows one execution, and limits waiting work to 16 total / 4 per wallet. An outer supervisor enforces the sampled 2 GiB budget and 5/30/120-second action timeouts, waiting for descendant cleanup on cancel. Expensive generation remains disabled. Seven new scheduler/worker tests pass; see [VALIDATION.md](VALIDATION.md) for measured checks and remaining browser/proof verification.
