# Independent clean-source startup

The publication ignore rules intentionally omit `proof/deployment.json`, runtime toolchain paths, generated `artifacts/` and local chain/application state. Previously a fresh checkout therefore silently installed `UnavailableProofVerifier`. This is corrected by a source-controlled bootstrap, without proving or borrowing a different application's runtime.

## Pinned bootstrap

- `proof/bootstrap-deployment.json`: initial v3 profile/image/manifest hash and exact bridge artifact SHA256.
- `proof/bootstrap/LeanProofBridge.json`:30,294 bytes, SHA256 `8cd96a8eaa81417b8c696d1aa142fac60d6f1e53220457823d3770a221fa6916`; compiled immutable bridge containing the original RISC Zero Groth16 verifier creation code.
- `scripts/proof-bootstrap.mjs`: same small verified bootstrap pattern reused independently from Exchange; verifies artifact bytes, constructor arguments, own manifest image/profile/hash, and ABI/bytecode presence before use. It creates missing descriptor and the legacy artifact path needed by existing adapters. Existing incompatible files are rejected, never overwritten.
- Sources and GPL-3.0 bridge / upstream notices remain in `proof/contracts/`; compiler settings and regeneration are in `proof/compile.mjs`. Startup uses the pinned existing artifact; it does not run Lean, create keys or prove a theorem.

`npm run dev` and direct `npm run deploy` ensure the real bootstrap before deployment. Core CTF/FPMM/OZ contracts are compiled with pinned npm dependencies; social is compiled and added to the new registry. A normal subsequent start checks/reuses recorded registry and social runtime. No `--reset` is needed. The bootstrap is the genesis v3 profile, not approval of perf05 by governance. To use the four perf05 examples on a new chain, run `node scripts/prepare-additional-profile.mjs` to deploy the candidate and then use the existing ordinary Safe/Timelock installation flow. This is separate from genesis startup.

## Isolated ports

```sh
npm ci --no-audit --no-fund
AGORA_PORT_OFFSET=10000 ./run.sh
```

This selects RPC19545, API14171 and web15171, all127.0.0.1. ChainId remains31371 and the public dev-wallet guard is unchanged. `sdk/local-network.mjs` validates offset/range. The server, manifest RPC, SDK default, Vite proxy/browser RPC, CORS, SIWE domain/URI and local time utility use the same offset. Default offset0 preserves9545/4171/5171. Use a separate directory/state copy when running two instances; a port offset does not create a new state directory by itself.

## Validation status

Nine bootstrap/port/governance-origin/shutdown tests pass. Clean-bootstrap unit test verifies missing descriptor/artifact creation, byte-identical repeat, wrong artifact and incompatible existing descriptor rejection. An actual source-copy runtime test passed under `evidence/fresh-start/`: core+original verifier+social deployed to separate chain31371/block12, API/SDK/RPC and actual browser catalog/profile/SIWE shelf passed. The real original verifier accepted the existing CI certificate; initial v3 bridge rejected the different perf05 profile. All3isolated ports were confirmed closed afterward. Whole guarded session including browser inspection69.987s, peak518,120,792bytes (494MiB), below1GiB. Current main instance stayedblock78. The guard was intentionally interrupted after acceptance, reporting cancelled/130 with no cleanupErrors; this is not labelled exit0. Its source inventory explicitly distinguishes shared installed dependency files from copied application source; network `npm ci` is not inferred from reused installed modules. No native Lean/prover binaries are required for external certificate verification; optional native checks need separately configured tooling.

## Review recommendation for previously blocked browser actions

The next matching-outcome derivative remains unsubmitted. `evidence/claims-derived/blocked-action.json` pins chain31371/block78, Reviewer wallet, kind2, exact already-TRUE dependency, expectedTRUE, canonical deadline0, initial0T and fee2%. The denial concerned absent pre-submission evidence within a combined tool operation. A review can inspect those exact fields, registered dependency outcome and the unsigned register/createPool calls, then obtain a separate decision for the final action. Preparing those data does not itself authorize sending. No alternate SDK/script/endpoint should be used to evade the rejection, and no assumptions should be made that the next review must approve.

The earlier NO settlement denial is a separate consequential-settlement handoff. Successful unrelated claims or social actions do not override it. Neither rejected action was retried during this startup audit; current chain78 and the browser draft remain untouched by the fresh instance.

## Shutdown finding and scope of final fix

The successful fresh startup exposed shutdown-only noise: Ctrl-C reached Ganache and wrapper, causing `Server is already closing or closed.` and a large minified stack. `scripts/shutdown.mjs` now makes cleanup idempotent and treats only this precise already-closed condition as successful; unrelated close failures are still reported. Two targeted regressions passed. This final shutdown-only correction was unit-tested, not followed by a second full compilation/start. The earlier run did terminate every process and close every isolated port. A Ganache MaxListeners warning was also observed during the bounded read-heavy pass; no measured leak is asserted or hidden.

Source inventory contains289 initially copied intended source files (~2.56MB), plus the added read-only smoke script. Every ignored runtime descriptor/artifact and .local directory was absent before start. Installed node_modules were reused through a dependency symlink, including transient Vite dependency cache; no other app source or old chain data was imported. A network-clean npm installation was not tested. Optional local native Lean remains unconfigured in this clean source copy, and no local proof generation was enabled.
