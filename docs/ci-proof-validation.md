# Real proof validation in GitHub Actions

On 2026-09-10 the user authorized publishing to `brodyga45/oncm` and starting the free CI proof smoke path. A subsequent request to make the repository private was immediately withdrawn before any visibility change; the final instruction keeps it public.

Initial publication: commit `ec7f248c35b833f94d279cf408d63114087391fa`, 1,175 reviewed files / 25,492,856 source bytes. Local runtime state and configuration were excluded. Existing SSH authentication was used; no new credential was created.

## Current result: first genuine certificate accepted on EVM

[CI run 34416918326](https://github.com/brodyga45/oncm/actions/runs/34416918326), commit `d79a177f4c162eefe9e6e197fdafad09b9ab5a8d`, completed successfully on 2026-09-10 (local date). The original RISC Zero prover generated and verified a **perf05 / true-registration** Groth16 receipt. The downloaded ZIP is 349,895 bytes, SHA-256 `aec6a8c6a4e8d420667778107a145902affd5aac1363baa662e32d266b974e89`.

Measured on four CPU cores, with unchanged cryptography:

| Phase | Observed duration |
|---|---:|
| Guest execution | 13.103 ms |
| Base segment proving, until lift begins | about 230.46 s |
| Recursive lift | 38.89 s |
| identity_p254 stage, until Groth16 preparation | about 162.35 s |
| Groth16 container invocation, until parsing proof | about 32.95 s |
| Full prove-and-verify operation | 465.694 s |

Aggregate kernel memory peak was 7,829,020,672 bytes (7.291 GiB); OOM and swap counters stayed zero. Host peak was 4,917,469,184 bytes. These are phase-boundary measurements from debug logs, not isolated microbenchmarks.

The coordinator downloaded the artifact, checked ZIP SHA-256 and exact image/profile/goal/journal bindings, and ran `verify-ci-proof.mjs --record`. The original generic RISC Zero EVM verifier accepted the proof and rejected changed image and journal values. Local chain **31372, block 120**, transaction `0x7b42337d460b66f1a9fc944bed4fb91a1f8657ba8310ed335793667a649b7676`, receipt status **1**, gas **251,802**. Compact proof and full evidence are preserved in [evidence/ci3-perf05-registration](evidence/ci3-perf05-registration/verified.json) and [the EVM report](evidence/ci3-perf05-registration/evm-verification.json).

**Scope:** this proves registration validation for the small zero-axiom perf05 goal. It is not a theorem-resolution certificate, does not match the currently installed v3 application bridges, and does not complete market end-to-end scenarios. Subsequent sections preserve historical failures; their “not yet” statements describe those trials, not this current result. No local heavy proving was restarted.

## First real remote trial

- [GitHub Actions run 34414002347](https://github.com/brodyga45/oncm/actions/runs/34414002347), manually dispatched by the coordinator through the user's authenticated GitHub UI.
- Workflow `Real Lean zk smoke`, job `proof` (`102674652016`).
- Inputs: `profile=perf05`, `case=true-registration`.
- Source commit: `ec7f248c35b833f94d279cf408d63114087391fa`.
- Result: failed during proving after 78.28 seconds. Installation and the four lightweight CI checks passed; cleanup and diagnostic upload succeeded. A completed proof and EVM acceptance have **not** yet been observed.

### Failure evidence

Diagnostic artifact `10128393496` contains five files, 4,346 ZIP bytes, SHA-256 `8c1d23ead9dc9bc011ed1cf68c8ec668feb667d557291e1e29b227da9c3409ed`. Its `prover.log` reaches the guest's `goal_check_declarations`, `goal_canonical_claim`, `checker_return`, and `commit`; the original executor reports **17.280306 ms** execution time. This is guest execution, not cryptographic proof generation.

`failure.json` records `SIGKILL (9)` for the scope limited to **4 GiB**, after 78.28 seconds. No Docker invocation record or receipt was produced. The runner had 16,766,414,848 bytes of total memory and about 83 GiB of disk free after the image pull. The failure therefore occurred after guest execution and before observable Groth16 container execution. The leading diagnosis is exhaustion of the host scope's memory budget; it is **not yet confirmed by an OOM counter**, because this first version did not capture `memory.events` or `memory.peak`.

The initial allocation reserved separate upper bounds of 4 GiB for the host and 9 GiB for Docker, leaving host memory unavailable even while Docker was idle. The correction puts both under a shared **13 GiB** cgroup-v2 systemd slice. Its host child can use up to 12 GiB and its Docker child up to 9 GiB, but their aggregate remains capped at 13 GiB, with no swap and at most two CPUs. The external observer persists kernel memory peaks and OOM events. Local proving limits, mathematical guest/profile, original proving binaries and the 600-second case deadline remain unchanged. The corrected runtime still needs a new CI trial; source review is not evidence that proving fits this budget.

This first profile is the separate zero-axiom logical smoke `∀ P : Prop, P → P`. Its image/profile differ from the deployed v3 profile in the three apps. A result from this trial must never be relabelled or loaded as a v3 certificate.

The workflow uses the standard public Ubuntu runner, one job at a time, the pinned original Linux RISC Zero binary and original Groth16 Docker image. No local prover runs as part of this remote trial. Its resource limits are documented in [the CI bundle](../tools/lean-zk/ci/README.md).

Acceptance requires retrieving the real receipt, independently verifying its exact image and 128-byte journal, and then checking the corresponding certificate through the correct EVM verifier. A green CI status or JSON metadata alone is not the final acceptance criterion. End-to-end market scenarios remain open until the matching deployed profile's receipts have been verified and used in each implementation.

## Prepared independent EVM check

The corrected workflow was dispatched as [run 34415338599](https://github.com/brodyga45/oncm/actions/runs/34415338599), job `102678854175`, commit `861792a532c809de9fbc2266c5fda0bc138a483c`, with the same single `perf05 / true-registration` input. Its seven lightweight tests and tool installation passed. The real proving step then **hit its 600-second deadline**; no receipt or Docker invocation record was produced. Cleanup and artifact upload completed.

Artifact `10129135692`, 70,456 ZIP bytes, SHA-256 `487ff2f4a3af115d6236c0a2f8a22a7fecf5ca6cc9aefd46a4d47f7fb3aa63e5`, contains the preserved kernel counters. Shared peak memory was **4,925,534,208 bytes (4.587 GiB)**, swap zero, memory max/OOM/OOM-kill counters all zero. CPU usage reached **1,195.22 CPU-seconds**, consistent with approximately two busy cores for the ten-minute run. Guest execution took 16.02 ms. The host therefore exceeded the old 4 GiB allowance but fit the corrected shared budget in this trial.

Observed memory moved from approximately 3.1 GiB at 30–60 seconds, to 4.3 GiB at 90–360 seconds, then 0.5–1.2 GiB at 420–599 seconds. This supports continued work through multiple phases, but the old info-level log does not identify their exact boundaries. The next measured adjustment uses the standard runner's four CPUs, a bounded 1,800-second case deadline, unchanged 13 GiB aggregate memory, and original prover debug messages plus a compact progress line every 30 seconds. It does not change the mathematical guest, certificates, cryptography or local proving policy. No completed real receipt or EVM acceptance is claimed.

`implementations/exchange/scripts/verify-ci-proof.mjs` accepts a downloaded `verified.json` with explicit `--profile perf05|v3` and `--case`. It rechecks pinned assets, image/profile/goal/outcome, the entire journal and canonical ABI certificate before calling the original verifier. It requires rejection of changed image and journal values. Optional `--record` submits one zero-value verification transaction on local chain 31372 and preserves its receipt/block; it does not register a profile or create a market.

For perf05, this is a generic cryptographic verifier check only: the current application bridge pins v3. For a matching v3 artifact, the script additionally calls that bridge. On 2026-09-10, read-only RPC checks confirmed the underlying deployed verifier `0xD781C44726058d2971B58408c492192877FAAC17`, selector `0x73c457ba`, version `3.0.0`, and the expected v3 bridge image. The script passed syntax review; **no positive certificate call or transaction has yet run**, because the first CI attempt produced no receipt.

## Next resolution certificate trial

After CI3 was authoritatively completed, the coordinator dispatched [run34418238753](https://github.com/brodyga45/oncm/actions/runs/34418238753), job102687803303, on the same published commit `d79a177`, with `perf05 / true-proof`. The GitHub UI confirmed In progress. It is the sole heavy computation; limits remain4CPU/13GiB aggregate, no swap,1800s per case. The user subsequently confirmed continuing GitHub for tests. Result pending; registration proof is never reused as a resolution proof.

## CI4 resolution proof accepted and used in a market

Run34418238753 completed successfully: perf05 true-proof outcome1, elapsed612.801255s. Artifact10130185596 is365279ZIPbytes, SHA256`516e134ba619b2cbeb27917b81d1e7b267cd9e2e5717e335242bd09e63a07309`. Compact certificate and receipt are preserved under [ci4-perf05-true-proof](evidence/ci4-perf05-true-proof/verified.json). Independent original EVM acceptance, changed-image/journal rejection and the local recording transaction are in [evm-verification.json](evidence/ci4-perf05-true-proof/evm-verification.json): chain31372block122, status1, gas251838.

The same genuine certificate was imported through Vault web and accepted by its governance-admitted perf05 bridge to resolve the registered market in chain31373block110. Full browser evidence is in the manual journal. This is not a v3 certificate and does not establish universal Mathlib compatibility.

After CI4 was confirmed terminal, single [CI5run34419882266](https://github.com/brodyga45/oncm/actions/runs/34419882266), job102692778335, was dispatched from published main with perf05/false-registration. UI confirmed In progress; no parallel heavy computation or local proving was started.

## CI5 false-goal registration and CI6 refutation accepted

CI5 completed successfully on commit `ed830fe68cc94aeac6eb01049a92464182bba737`. Artifact10130716694 is356096ZIPbytes, SHA256`dc2dfe9017822cb7c1fec5418d7b4ff52360bec6f1cdabbcb1784e9196b4b6a2`; the downloaded bytes match GitHub metadata. Genuine registration of `∀ P : Prop, P` took514.744146s, guest execution13.72539ms, peak7,825,907,712bytes (7.288GiB), with no OOM or swap. The original EVM verifier and additional perf05 bridge accepted it in read-only checks at chain31372block122; modified image/journal values were rejected. See [CI5 evidence](evidence/ci5-perf05-false-registration/README.md). No recording transaction was sent for this check. Independent copies are included in all three applications.

This remains outcome0: it certifies a well-formed proposition, not its truth or falsity. Only after all CI5 steps were authoritatively terminal, the coordinator dispatched [CI6run34421160265](https://github.com/brodyga45/oncm/actions/runs/34421160265), job102696670677, `perf05 / false-refutation`, through GitHub's browser UI. It is the sole remote heavy computation; local proving remains disabled. Result pending at this entry.

**Completion update:** CI6 succeeded. Artifact10131317513 is396161ZIPbytes, SHA256`7aabf698087992f936e23447ad18088dd5f25a0ca4493b3093c1b2f3f0e16b2d`, verified against GitHub metadata. The case took900.799123s; guest execution26.013461ms; peak9,817,907,200bytes (9.144GiB), CPU3502.470449s, no OOM/swap. The original EVM verifier accepted its outcome2 claim and rejected altered image/journal values. The additional perf05 bridge accepted the refutation and rejected the same bytes as a true proof or registration certificate. These were read-only calls at Exchange chain31372block122, not market resolution transactions. Compact receipt, exact bindings, reports and provenance: [CI6 evidence](evidence/ci6-perf05-false-refutation/README.md).

All four bounded perf05 cases now have genuine independently verified certificates: true registration, true proof, false registration, false refutation. Copies are kept independently in each application. There is no active heavy CI job from these six runs and no local prover was started. Full NO-market browser lifecycles and v3/Mathlib certificates remain separate outstanding work.
