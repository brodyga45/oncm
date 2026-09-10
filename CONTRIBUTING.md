# Contributing to ONCM

**Vault is the active implementation.** Open PRs against `main`, with application changes in `implementations/vault/`. Agora and Exchange remain frozen comparison prototypes; their source, historical evidence and unresolved acceptance notes are preserved. Do not duplicate new Vault features across them. The selected architecture and scope are in [vault-focus](docs/vault-focus.md) and the [scenario matrix](docs/remaining-scenarios.md).

There is no root npm workspace. Run npm commands inside `implementations/vault`; the sibling applications' packages and runtime directories are independent.

## Source-only development and PR checks

Use the Node version in [Vault's .node-version](implementations/vault/.node-version): **22.23.2**, also pinned in the new source CI. The package engine permits Node `>=22 <24`; earlier local evidence used Node 22.5.1 and is not relabelled as a run on the new CI pin. [Official Node 22.23.2 release and checksums](https://nodejs.org/en/blog/release/v22.23.2).

```sh
git clone https://github.com/brodyga45/oncm.git
cd oncm/implementations/vault
npm ci --no-audit --no-fund
node --input-type=module -e "import {ensureProofDescriptor} from './scripts/proof-bootstrap.mjs'; ensureProofDescriptor(process.cwd())"
node --test --test-concurrency=1 test/*.test.mjs
npm run build
```

The descriptor helper restores only a missing `proof/deployment.json` from the tracked, hash-checked v3 bootstrap. It does not compile, deploy, register a profile, install Lean or compute a certificate. A differing existing descriptor is rejected instead of overwritten. Test fixtures create their own temporary files; no saved local chain or private database is needed. `dist/` is a build output, not a deployment.

Use `npm ci`, retaining `package-lock.json`. Dependencies are exact in the app manifest and lockfile. The lock currently includes install hooks for esbuild, keccak and macOS-only fsevents; normal npm installation may prepare their platform binaries. It does not invoke ONCM's Lean/Rust toolchain, Solidity compilation or Anvil installer. The separate `social/` and `proof/` npm packages are only needed for their explicit rebuild/tooling paths, not these source checks or a normal artifact-based start.

[Vault source CI](.github/workflows/vault-source.yml) runs on PRs, relevant `main` pushes and manual dispatch. It has one Ubuntu job with sequential Node tests and a Vite build, read-only repository permissions, no repository secrets, no dependency cache, and no deployment/prover invocation. Node heap is limited to 512 MiB per process, native build concurrency to two and job duration to ten minutes; these settings are not an aggregate RSS containment guarantee. The Apple-only dummy process-guard regression is skipped on Linux and must be tested separately when changing macOS guard code.

The two existing Lean workflows remain separate: `lean-zk-smoke.yml` is manual; `lean-zk-request.yml` reacts only to `oncm-request.json` pushes on `codex/proof-requests/**`. They perform expensive real proving and share a serial group. They are not PR validation and must not be triggered as a substitute for the source CI. The request publisher has its own write permission; the new source CI does not.

## First standalone Vault V2 on a Mac

The complete stack currently has an **explicit two-stage bootstrap**. First create the base contracts and governance, then add V2 on that same local chain. A fresh clone has no `.state/deployment-v2.json`; `VAULT_PROTOCOL_VERSION=2 npm run dev` alone therefore intentionally refuses to start it. An existing operator's deployment addresses or snapshots are not part of the source clone.

1. In `implementations/vault`, after `npm ci`, install the pinned local node and start the base stack:

   ```sh
   npm run setup:anvil
   npm run dev
   ```

   Wait for the “persistent devnet ready” message, then stop this invocation normally with Ctrl+C. It saves its chain and stops only its own processes. This first start restores verified production artifacts and deploys base contracts and legacy EAS; it does not run Solidity compilation or proving. Legacy genesis T belongs only to the legacy token.

2. Keep the same saved chain running in one terminal:

   ```sh
   npm run chain
   ```

3. In another terminal, from the same Vault directory, prepare and inspect the additive deployment plan. Only after inspecting the exact graph, zero initial supply, copied allocation and reused governance, execute it:

   ```sh
   node scripts/deploy-v2.mjs
   # Review .state/deploy-v2-plan.json before the following explicit action.
   node scripts/deploy-v2.mjs --execute
   VAULT_PROTOCOL_VERSION=2 npm run dev
   ```

   The last command selects the newly written V2 descriptor and adds its separate EAS resolver. V2 starts with **zero T**, no markets and no admitted mathematical profiles. Membership and the Governor/Timelock already exist from stage 1; initial T issuance and profile admission are ordinary voted proposals. Existing V2 files or a started deployment intent stop a repeat deployment. Review recorded receipts and nonces if execution was interrupted; do not delete the barrier or reset the chain to “retry”.

4. Use the web's governance and external-certificate workflows for the required setup. Never copy an example deployed address from historical evidence as the address of your fresh chain. The deployed v3 bridge can be reused through the generated V2 admission plan. To use the bundled perf05 CI certificates, a compatible separate perf05 bridge must also exist and be admitted in the **selected V2 registry**.

   The current `prepare-external-profile.mjs` helper operates on the base descriptor and default local RPC9547; it is not a version-aware/port-offset helper. Its default is a read-only review; explicit `--deploy` adds only that immutable bridge on the same chain. Its generated proposal targets the **legacy registry**, so do not submit it as a V2 admission. In the V2 governance UI use the observed bridge plus the pinned profile/image/manifest and the actual selected V2 registry. Merely loading one of the four public CI artifacts does not admit a profile, mint T or register a market.

The default web/API/RPC are `127.0.0.1:5173`, `127.0.0.1:4173`, `127.0.0.1:9547`, chain **31373**. To keep a second *separate source copy* beside an existing operator stack, consistently set `VAULT_PORT_OFFSET=10000` for that copy's starts; its ports become 15173/14173/19547 and its `.state` remains independent. Do not point a fresh checkout at an unrelated process with the same numeric chain ID. See the full [Vault README](implementations/vault/README.md), [protocol versions](implementations/vault/docs/protocol-versions.md) and [V2 deployment](implementations/vault/MONETARY-POLICY-V2.md).

### Node binary and persistence pins

`npm run setup:anvil` uses [install-anvil.py](implementations/vault/scripts/install-anvil.py), installing **only Anvil 1.7.1 for macOS ARM64** from the official Foundry release. It streams the 88,161,744-byte archive and checks SHA256 `eacdc67718fac857cad9e19c7f6729dd80de731d09df81856391d093cfcab547`. It is not a Linux/Intel/Windows installer; on another platform install an official compatible Anvil explicitly and set `VAULT_ANVIL` to that binary. Native Windows full-stack support is not established by the Linux source CI. [Official pinned release](https://github.com/foundry-rs/foundry/releases/tag/v1.7.1).

The launcher requires Cancun support for Balancer transient storage, uses two threads, periodic disk state every ten seconds, and a validated last-good snapshot. Its 64 MiB EVM execution limit is not total process memory. Abrupt failure may lose changes since the last saved snapshot, and retained history is bounded. Stop the separate chain terminal normally after stopping your V2 web/API terminal. Never delete `.state`, change genesis, copy another chain's deployment or replace a live node as a normal upgrade step. A source clone is not a backup of the persistent pilot.

The public pilot is maintained separately; its operator configuration and current address are documented in [public-pilot.md](docs/public-pilot.md). A merged PR does not automatically restart or deploy that pilot. Use an injected wallet there; public local development account credentials are confined to valueless loopback test networks.

## What belongs in a PR

Keep changes reviewable around an actual user scenario: web action → SDK/API call → contract behavior, with role and asset amounts explicit. Include the relevant source tests. For stateful validation identify whether evidence comes from a mocked harness, original contracts in isolation, numbered live RPC blocks or a manual browser run. A native Lean check is not a ZK proof; source/imported metadata does not establish the exact formal claim by itself. Preserve certificate profile, foundation, goal, journal and original-verifier bindings.

Solidity and dependency changes may intentionally invalidate production artifact pins. Review and regenerate the relevant [base distribution](implementations/vault/production/README.md) or V2 distribution with their explicit rebuild scripts when resources are available; do not edit a hash merely to accept changed source. Keep upstream licenses/notices and provenance. The small PR job validates metadata/source binding but does not recompile the whole contract graph or perform genuine new proving.

Never commit private keys, tunnel credentials, `.env` files, `runtime.local.json`, local execution policy, `.state`, chain dumps, databases, private drafts/jobs or large proving keys. The source CI checks tracked path boundaries, not all possible secret content. Public test mnemonics already present are explicit local fixtures. Compact public receipts, proof artifacts and pinned deployment **code** are intentional source-distribution inputs; they are distinct from a private runtime deployment and its balances.

For a rollout-affecting PR, describe the explicit new version or governance proposal, how balances/LP positions/beneficiary consent remain valid, and interrupted-operation recovery. Do not treat a frontend toggle as contract authority. Use the [PR template](.github/pull_request_template.md) and record any untested or blocked step plainly.
