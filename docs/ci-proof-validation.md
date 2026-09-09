# Real proof validation in GitHub Actions

On 2026-09-10 the user authorized publishing to `brodyga45/oncm` and starting the free CI proof smoke path. A subsequent request to make the repository private was immediately withdrawn before any visibility change; the final instruction keeps it public.

Initial publication: commit `ec7f248c35b833f94d279cf408d63114087391fa`, 1,175 reviewed files / 25,492,856 source bytes. Local runtime state and configuration were excluded. Existing SSH authentication was used; no new credential was created.

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
