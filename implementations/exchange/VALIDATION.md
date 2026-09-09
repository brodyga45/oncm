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
