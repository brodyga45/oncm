# Governance state and local time controls

Root's manual perf05 installation scheduled proposal
`804911b8-a481-42a0-bbe3-b14a3b0a74bb` through the existing Safe at block29,
advancing its nonce3→4. The idle Ganache chain stayed at timestamp1788999954;
the timelock operation's ready timestamp was1788999959. Previously the UI
mislabelled this state as collecting signatures and enabled Execute, whose
simulation then returned an opaque error.

`server/governance-view.mjs` now reads a latest block once, then uses that
explicit blockNumber for all Safe owners/threshold/nonce, timelock delay and
operation timestamps. `getTimestamp` distinguishes unset0, completed1,
scheduled future timestamp and elapsed timestamp. Unscheduled proposals with
an obsolete Safe nonce are shown as stale. Signature counts deduplicate
current owners; duplicate/outsider records do not meet the threshold.

The UI shows collecting signatures, ready to schedule, stale nonce, scheduled,
ready or executed. Sign/Schedule/Execute are gated by the corresponding
state, and each action refreshes the snapshot before submitting the ordinary
wallet call. Executed operations cannot be scheduled or executed again via
these controls. The displayed delay is read from the timelock, not hardcoded.

An explicit **Local devnet: +10 seconds & mine one block** button calls
`POST /api/dev/advance-time`. The helper requires the configured RPC to be
HTTP on exact loopback hostname (`127.0.0.1`, `localhost`, `[::1]`), no URL
credentials, and actual chain31371. It supports exactly10seconds, then one
`evm_mine`. It does not call any governance operation, reset state, remove
the timelock, alter signatures or enable profiles. Governance reading never
advances the clock. This utility is deliberately separate from Execute.

## Evidence

- 13/13 lightweight tests passed: all state transitions including exact ready
 boundary, deduplicated owner signatures, same-block contract reads,
 loopback/chain/count rejection before RPC mutation, plus Ix and certificate
 regressions. The mining requests in tests use a mock client only.
- Read-only live API at block29 showed proposal804911b8… **scheduled** with
 all action gates false; prior proposal809a9f5e… **executed**, also all false.
 The chain was still block29 after validation. No mining endpoint was called
 by this implementation task.
- Vite build passed under1GiB/30s guard:1.603s, peak318,875,832bytes (~304.1MiB),
 exit0 and no cleanup errors. Reports:
 `/private/tmp/agora-governance-state-http-validation.json` and
 `/private/tmp/agora-governance-state-vite-resources.json`.

Root's next manual steps: open Governance (reload if needed), inspect
**SCHEDULED**, click the local time button, observe **READY**, then execute
the existing proposal through the normal wallet/timelock path. Successful
mining/execution from that later manual pass is not claimed by this document.

## Guard synchronization

The independently reviewed shared guard was copied byte-for-byte into all
three `proof/resource-guard.py` paths. SHA256:
`e5b832f5f86f151e986385dfbe3a0dac07621c2c332a5bd2f844b996ec0cb9f3`.
Each app contains its own copy, a provenance file, and the reviewed12/12
synthetic lifecycle test report. Exact equality and Python AST parsing were
checked; lifecycle/native/prover jobs were not rerun during the copy. The
successful Ix checks used this same shared guard. Local expensive proving
policy remains false for Agora, Exchange and Vault. No explicit API restart
or chain reset was performed.

### Origin and wallet authorization follow-up

Independent review identified that CORS alone does not prevent a cross-origin
POST from causing an effect. The local time endpoint now requires an exact
Origin `http://127.0.0.1:5171` and the existing verified SIWE wallet session,
before invoking any RPC utility. The UI signs in through the existing flow
before that explicit click. Missing/foreign origins are rejected; this
browser utility intentionally does not accept an Origin-less SDK request.

Pure authorization tests cover missing/foreign origins before session access,
missing session, and successful existing-session authorization. The broader
small suite passed17/17. A live HTTP negative diagnostic did not establish the
expected403/401 statuses (its first status assertion failed and response was
not retained); those statuses are not claimed as live test evidence. Automatic
approval review rejected a repeated POST diagnostic because a stale server
could mutate the dev chain. It was not retried or bypassed. A subsequent
read-only health request confirmed block35 remained unchanged. Root's browser
can continue ordinary LP/trading actions; no clock action was needed here.
