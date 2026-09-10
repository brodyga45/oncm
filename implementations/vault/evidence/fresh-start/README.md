# Actual independent Vault startup,2026-09-10

A fresh source copy at `/private/tmp/oncm-vault-fresh-dga1z6u_` contained649 files/18,131,192bytes and no saved chain, deployment, runtime proof descriptor or `.state/artifacts`. It reused only this app's already installed `node_modules` dependency cache and official Anvil binary. It did not import another application's SDK/runtime/config. The exact source inventory is in `source-copy.json`; these are file paths/hashes, not private file contents. The test does not claim a clean-machine `npm ci` installation.

The ordinary production `scripts/start.mjs`, with `VAULT_PORT_OFFSET=10000`, restored the pinned27 production artifacts and proof descriptor, deployed the original protocol/v3 bridge, then added3 social contracts. The isolated endpoints were RPC19547/API14173/web15173, chain31373, **instance bcc3a899-61ea-40dc-90da-61f136b07f79**, block33. Source/default endpoints stayed9547/4173/5173.

The actual terminal sequence is saved in `startup-sequence.log`:

1. `Vault onchain social deployed-new` with verified resolver.
2. API14173 listening.
3. Vite ready in363ms at15173.
4. `Vault persistent devnet ready` after matching API deployment/social identity and webHTTP readiness.

The launcher has no automatic stop after this ready line. It stayed running through SDK and browser reads; the QA driver later explicitly sent SIGTERM to its owned launcher during cleanup. The launcher exited0 and all3 isolated ports closed. The whole invocation, including waiting for a human/browser acknowledgment, was53.702s, peak473,868,840B (451.92MiB), below1GiB; no memory limit hit or cleanup errors. See `attempt-02-resources.json`.

**Runtime checks passed; raw QA invocation did not return success.** `actual-start.json` records `runtimeChecksPassed:true`, `success:false`, `overallSuccess:false`, and the original `Browser QA handoff timed out` error. The old success field meant only checks before handoff; it was renamed explicitly, not used to hide exit1. Its40s acknowledgment deadline expired before the independent browser observations were written at about50s. `browser-observations.json` separately records actual scoped Playwright reads of our own tab102825306: fresh overview block33/zero markets/pools, Lean Lab's four external certificate loaders, generic bundle import, native check and no certificate-generation controls. The tab was explicitly closed; no other tab was touched. No further deployment was performed merely to obtain a green harness flag.

SDK/API checks: HTTP200 for website and API proxy; v3 profile enabled with exact immutable verifier/manifest; new local-wallet offset guard returned the expected public test address; no markets/pools; original EAS/resolver/schema runtime checks and a reconstructed empty public social snapshot. The **original generic RISC Zero verifier** deployed by the v3 bridge accepted the real CI3 **perf05** receipt and rejected a modified journal. The **v3 bridge itself was not passed that receipt**, and is not claimed compatible with perf05. There is still no genuine v3 receipt in this evidence. Fresh perf05 bridge/admission requires its separate ordinary deployment/governance; UI explicitly showed that it was not deployed.

The live original chain was read before/after only: block188 and hash `0x569b6a07ff01c1217bc1e79b7f862e1327e70e6ac4edbd5f7a1210c1f80e18d0` unchanged. No existing market, profile, wallet balance, session or social content was reset.

Earlier failures are retained: full Solidity compilation60s timeout; first QA attempt waited for API only, requested web too early and explicitly stopped its own startup. Isolated Vite diagnostic then returnedHTTP200 in0.858s/142,555,728B. `waitForHttp` now waits for independent web/proxy readiness;2 tiny regression tests cover delayed web, persistent failure and stop. No crypto change was made. Large repetitive logs were reduced to startup/error lines for publication; full original diagnostics remain in the isolated temporary copies. No environment tokens or source drafts are in these compact logs.

Agent production build before the final derived-review UI addition: **PASS**, Vite1.38s, whole1.813s, peak327,873,672B, under1GiB/30s; `final-web-build.json`. Bundle571.39kB (210.69kB gzip) retains Vite's advisory500kB chunk warning. Compiler/native/prover rebuilds were not repeated.

Coordinator then compiled the actual latest derived-review UI and passed9 focused tests (calendar binding, bootstrap and readiness). Latest Vite3.32s; whole4.269s/324,662,672B; bundle574.85kB. See `root-final-ui-build-resources.json` and `root-final-targeted-resources.json`. This adds code/build evidence, not a new browser deadline run.
