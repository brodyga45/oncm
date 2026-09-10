# Proof job scheduler and access control

The live API uses its own copy of the bounded scheduler and worker adapter in
`api/proof-jobs.mjs` and `api/proof-worker.mjs`. It has no runtime import from
Agora, Vault, or a shared application service. The scheduler reuses MIT
[p-queue 8.1.0](https://github.com/sindresorhus/p-queue/tree/v8.1.0), pinned in the
application lockfile.

New proof jobs require the existing wallet/SIWE session. Source, diagnostics,
results and cancellation are restricted to the verified owner; body fields
cannot select the owner. The existing frontend signs in through its original
SIWE flow, supplies the bearer token to submit/poll/cancel, and clears job display
and polling when the connected wallet changes. A session expiring before submit
prompts that same sign-in flow again. There is no separate identity mechanism.

Historical ownerless records remain on disk and keep their original fields.
After authentication, they are returned with `legacyOwnerless: true`, so they
cannot be mistaken for previously private wallet records. Their original API
was publicly readable by job ID. They cannot be cancelled or claimed by a wallet.
New owned records are never returned to another wallet, even with a known ID.

## Resource behavior

- One executing job per API, at most 16 active/pending jobs, at most 4 per verified wallet.
- An identical pending/running request from the same wallet returns the existing
  job ID. Distinct wallets have distinct jobs.
- Existing UI `status: Running` remains while waiting/executing/cleaning up;
  `phase` adds `queued`, `executing`, `cancelling`. Existing completion statuses
  `checked`/`proved` remain unchanged. Cancel produces `Cancelled` after cleanup.
- `job.input`, including source, and the full old history are preserved.
  On restart, unfinished historical jobs become `Failed`/`interrupted`; they
  are not automatically relaunched. A subsequent completion no longer overwrites
  the entire saved history with only this API process's new jobs.
- The API runs its worker through an **outer** macOS supervisor: tree footprint
  2 GiB, wall-time budgets check 5 s, registration 30 s, proof 120 s.
- The outer supervisor does **not** take a lock. Existing inner guards retain
  the single `oncm-worker-UID.lock`; no nested acquisition of that lock occurs.
- Queue timeout/cancel never frees an executing slot before supervisor close.
  Output buffering is capped at 2 MB, diagnostics at 50 KB.
- `RAYON_NUM_THREADS=2` and `GOMAXPROCS=2` limit those runtime pools; these are not
  claims of a kernel-enforced total OS-thread cap. The 100 ms memory watchdog can
  briefly overshoot between samples; it is not a kernel hard memory limit.
- Resource reports are in `data/proof-resource-reports/`. Expensive proving stays
  disabled by the unchanged `proof/execution-policy.local.json`.

No fast cryptographic cache has been added to the live API. Existing runner
receipt verification and immutable onchain proof profile remain unchanged.
Cold registration/proof speed targets have not been achieved or claimed here.

## Checks performed

`node --test tests/proof-jobs.test.mjs tests/proof-worker.test.mjs`: **7/7 passing**,
1.11 seconds in the recorded run. Five HTTP tests use an ephemeral Express API
with the same production routes, a test session provider and small mocked workers.
They cover owner dedupe, status/input preservation, 401/404 ownership rejection,
per-owner/global 429 admission limits, queued cancellation, wait-for-cleanup,
old-history retention, no auto-resume, input size bounds, and body-owner rejection.

Two tests run the actual API worker adapter and actual supervisor with tiny dummy
Node processes. They check threads=2, measured footprint below 100 MiB, and a
completed cancellation report before the cancellation Promise settles. Neither
Lean nor a prover is invoked.

`node tests/api-smoke.mjs`: **7/7 passing** against the live API after restart.
Includes real SIWE signature and nonce consumption, authenticated unsupported
target rejection **before a proof process starts**, chain reads, package roundtrip,
and live commit-pinned Palomar import. `data/api-test-report.json` records this run.

`npm run build`: passes, 1.88 seconds; existing SIWE bundle-size advisory remains.
Both API modules pass `node --check`.

Only the idle API listener was restarted, after checking that it had no proof
workers. The blockchain and Vite process stayed running. Live checks afterwards:

```json
{"unauthenticatedSubmit":401,"unauthenticatedRead":401,"observedBlock":112,"marketCount":0}
```

No proof jobs were generated and no blockchain transactions were submitted by
these scheduler checks. Browser verification of the new sign-in/cancel wiring
and real proof performance measurements are still required separately.

## External perf05 certificates: CI3 registration and CI4 true proof

The standalone Exchange bundle now includes the exact reviewed CI4 artifact at
`proof/profiles/perf05/certificates/true-proof.json` (5,199 bytes, SHA256
`65a54ad884fad55139b830cbeb83f551191c1d954382036c03a5006b3c5683b1`).
It proves outcome 1 under the distinct zero-axiom perf05 profile. It is not a v3
certificate. The existing CI3 artifact remains the separate outcome-0 registration
certificate for the same canonical goal.

`node --test tests/proof-import.test.mjs tests/proof-import-state.test.mjs`:
**19/19 passed**. Coverage includes exact image/profile/goal/outcome/ABI binding,
mutated artifact rejection, wrong-purpose registration/proof rejection, and
pending verification invalidation across A → B → A navigation, outcome/wallet
changes, unmount and overlapping imports. An ordinary unchanged-form rerender
preserves the pending verification. `npm run build`: passed (1.67 seconds).

`node tests/proof-import-live.mjs`: **PASS**, read-only at Exchange block 122.
The actual immutable bridge `0xCace1b78160AE76398F486c8a18044da0d66d86D`
accepted both genuine artifacts and rejected a coherently ABI-encoded mutated
seal. Existing v3 remained enabled. At that observation perf05 was not yet
installed in the registry, so readiness to create was correctly false.

HTTP reads after reloading the idle API only: both allowlisted certificate
routes return 200 with the exact stored artifact, an unknown case returns 404.
No blockchain transaction or proof job was run for these checks. The API reload
does not reset the chain or stored data; the API's in-memory SIWE sessions reset.

The Proof lab button **Load published YES certificate · CI4** only fills the
JSON field. The user separately clicks **Verify pasted proof certificate** and
**3 · Submit proof onchain**. Actual Governor installation, browser market
creation, LP/trading and final settlement are separate root-owned browser QA;
these read-only checks do not claim those scenarios have completed.
# Governance and injected-wallet lifecycle correction — 2026-09-10

This entry is code/targeted-test evidence. No browser action, RPC read or write, transaction, mining, API/chain restart, profile/deployment change or prover was performed for this correction. Coordinator-owned earlier market/governance receipts remain unchanged. Browser retesting of these new controls is still required.

- `sdk/governance.mjs` reads original Governor/Timelock/token at one explicit block tag, including actual ETA, quorum, historical snapshot weight, current delegated weight, `hasVoted`, proposer threshold/checkpoint and settings. Future/current historical checkpoints remain unknown instead of being queried or displayed as zero. Quorum uses For + Abstain. `ProposalCreated` ordered targets/values/calldatas are checked against `hashProposal`, with ABI decoding only for known targets.
- `web/main.jsx Governance` displays this SDK snapshot directly; the older API list is unchanged and is no longer the source of this page. Vote/queue/execute/pending-proposer-cancel availability includes a full original Governor `eth_call` from the selected wallet. Execute before ETA, a duplicate vote or missing snapshot weight has an explicit reason and disabled button. Action submission obtains another current snapshot. These views are UI preflight; actual contracts remain authoritative. Existing SDK batches are reviewed exactly; this composer and Execute send zero additional native ETH.
- The existing devnet helper now has **Mine 1 block** alongside Mine 14. The UI explains that 14 may skip Active. Timelock advancement uses its actual configured delay + 1 second. The helper checks the actual provider chain is31372 and bounded integer steps before calling the unchanged local endpoint. No helper was invoked during this change.
- `web/wallet-lifecycle.mjs` gives signer/SIWE/private forms/SDK continuations a generation. Injected `accountsChanged`, `chainChanged`, `disconnect`, explicit disconnection or SIWE logout revoke the old bearer token and clear private drafts/modal state, proof forms/tickets, transaction notifications and loading/errors. Logout retains the connected signer with a new generation. Injected changes require an explicit reconnect and never auto-sign. Intentionally switching chains while connecting is followed by exact final chain/account validation.
- Late nonce/signature/verification replies cannot authenticate the old identity. A server session returned after logout is revoked, not installed. Old SDK calls fail before/after an awaited network check, preventing the next transaction leg after wallet change; an already broadcast transaction is not reversed. Remounting the private component subtree disposes existing proof-import/job generations, while local job history remains server-side. A late sign-in cannot start an old unmounted proof form's job. Normal unchanged deployment refresh now preserves SDK identity.

Executed from this independent folder:

```sh
node --test tests/governance-review.test.mjs tests/wallet-lifecycle.test.mjs tests/proof-import-state.test.mjs
```

**19/19 PASS, 171.887ms.** Tests cover actual generated ABI method availability; same-block orchestration; unknown checkpoints; value/ordered payload binding; quorum/ETA/vote eligibility and rejected execution simulation; wrong-network refusal; wallet event cleanup; A→B→A/logout; delayed nonce/signature/SIWE response; mismatched principal revocation; and no SDK broadcast after identity changes during network lookup. Simulated views and signatures in these unit tests are explicitly not browser or onchain success claims.

First bounded production build was stopped cleanly by the512MiB outer guard at567,018,456B after2.339s. Its report is `data/governance-wallet-build-resources.json`, reason `memory-limit`, exit125, no cleanup errors. This was a Vite build, not proof generation. One failure-driven retry bounded the V8 heap to256MiB with768MiB outer limit/30s:

```sh
python3 proof/resource-guard.py --memory-mib 768 --timeout 30 --report data/governance-wallet-build-retry-resources.json -- node --max-old-space-size=256 node_modules/vite/bin/vite.js build
```

**PASS:** Vite2.04s; measured tree499,047,232B (475.93MiB), guard2.340s, exit0, no cleanup errors. Existing SIWE chunk-size warning remains. Reports preserve both attempts. Expensive proving remains disabled; no local cryptographic workload was started.

Next manual verification: reopen the real proposal and inspect historical votes/ETA/quorum; confirm Mine1 can enter Active, already-voted/too-early actions are unavailable; connect injected wallet, change account/network, reject or delay SIWE, log out/reconnect and check private forms remain cleared. Only the coordinator should perform any desired new governance transactions.
