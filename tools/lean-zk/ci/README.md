# Real Lean → zk smoke on GitHub Actions

The separate [generic request adapter](REQUESTS.md) accepts inline goal/proof data
under these same pinned profiles and publishes compact results to public request
branches. It is offline-tested; its first remote run is still pending.

This directory is a self-contained input bundle and orchestration recipe for **official RISC Zero 3.0.6** on a standard **public** GitHub Ubuntu x64 runner. It contains no host or guest compilation step. It does not use Bonsai, a paid service, a development-mode receipt or a substitute verifier.

Status: first run `34414002347` received SIGKILL under its former 4GiB host cap. Second run `34415338599` confirmed the shared cap works: peak 4,925,534,208 bytes (4.587 GiB), zero OOM/max events, but proving exhausted 600 seconds at almost two CPUs before Docker. Guest execution took 16.02 ms; no receipt was created. The next reviewed recipe keeps the shared 13 GiB memory limit and uses the standard public runner's four CPUs, a bounded 1,800-second case deadline and targeted phase logs. **That next configuration is not yet measured.** Retry remains `perf05 / true-registration`, one case. Success still requires original verification for the pinned image and exact journal matching.

## Dispatch and result

Open Actions → **Real Lean zk smoke** → Run workflow. The workflow is manual-only; publishing files does not automatically start proof jobs. Select:

| Profile | Mathematical scope | Existing apps |
|---|---|---|
| `perf05` (default) | Zero-axiom logic profile: `∀ P : Prop, P → P`; false fixture `∀ P : Prop, P`, refuted by applying it to `False` | Experimental image/profile; a certificate does not apply to deployed v3 markets |
| `v3` | Published Lean core `Nat.add_comm`; false statement `0 = 1`, refuted by `Nat.zero_ne_one` | Exact image/profile already registered by the three local applications |

Cases: `true-registration`, `true-proof`, `false-registration`, `false-refutation`; `all` performs those four sequentially. The first attempt should request just one registration. No workflow matrix or concurrent proof processes are used. Repository-wide concurrency group `real-lean-zk-smoke` serializes dispatches.

Download the `lean-zk-…` artifact. Each completed case contains the bincode `receipt.bin`, original Docker `proof.json`, raw 256-byte Groth16 `seal.bin`, authenticated `journal.bin`, exact profile/goal/outcome bindings and original verifier log. After original verification, the adapter checks the pinned verifier-parameter prefix `73c457ba`, writes the 260-byte `evm-seal.bin` (selector + raw seal) and `certificate.bin = abi.encode(bytes evmSeal, bytes journal)`. The JSON fields are explicitly `rawSeal`, `evmSeal`, `certificate`. `failure.json` and logs are exported when a case fails. There is **no onchain transaction in CI**, so `verified.json.evmVerified` remains false until the later local EVM test. A perf05 certificate is a separate mathematical profile and will not pass the existing v3 bridges.

## Ready components and exact wire format

The official [3.0.6 release workflow](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/.github/workflows/release.yml) packages `r0vm` in `cargo-risczero-x86_64-unknown-linux-gnu.tgz`. Its GitHub release asset metadata pins 72,347,320 bytes and SHA256 `615d961bfb81d318db5071d7548389c850e324ac7f421c075176daf26082a60a`. `prepare.py` verifies both and extracts only that binary. It does not run rustup, Cargo, Lean or a compiler. Source/math fixture provenance and every input digest are in each `profiles/*/profile.json`.

The original [CLI source](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/r0vm/src/lib.rs) supports this command:

```sh
r0vm --elf lean-checker.bin --initial-input stdin.bin \
  --receipt-kind groth16 --receipt receipt.bin
```

Despite the flag name, [ExecutorImpl::from_elf](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/server/exec/executor.rs#L103) decodes the packed `ProgramBinary`, including the pinned v1compat kernel. The workflow first checks `r0vm --elf … --id` against the manifest.

`stdin.bin` preserves the existing Rust serde wire format: little-endian u32 goal-prefix byte length, little-endian u32 outcome, little-endian u32 export byte length, followed by **one little-endian u32 per original export byte**. Registration uses only the exact goal export, outcome zero. Proof/refutation use the full export with the goal as an exact prefix, outcomes one/two. No Lean elaboration or re-export can change those bytes in CI.

The separate `receipt.py` is transport/framing and strict pinned-schema inspection. It does not implement cryptography. It calls the official [VerifyRequest API](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/protos/api.proto) in the original `r0vm --port` server, which deserializes the Receipt and calls `Receipt::verify(expected_image)`. The parser refuses Composite, Succinct and Fake variants here. A Groth16 receipt is required.

## Original Docker backend and resource bounds

The official [Docker adapter](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/groth16/src/prove/docker.rs) invokes `risczero/risc0-groth16-prover:v2025-04-03.1`. Our executable `docker` only recognizes this exact invocation and substitutes its immutable **official amd64 manifest digest** `sha256:7f173963196570b7a71816ed70565a4579264c5d2e3e0ecb028102538ad0e331`. It adds resource/process restrictions and passes the same input directory. It does not alter the original witness generator, Gnark prover, key, Circom circuit or proof JSON.

Docker Registry manifest/config metadata were read without pulling any image layers locally. The manifest has 2,399,158,367 compressed layer bytes. The final image already contains converted `.cs`, `.pk.dmp`, compiled witness generator and `.dat`. **Do not additionally download the 2.58 GB ceremony archive or 3.62 GB original zkey:** the stock image already contains the required final key. The entire fixture bundle for both profiles is only a few MB. `prepare.py` requires 9 GiB free before the pull and 2 GiB afterwards, records the actual expanded image size/free disk, and fails before proving if insufficient. The first CI run measured expanded Docker image size 2,800,101,211 bytes and sufficient free disk; total completed proof peak disk remains unmeasured. [Pinned Dockerfile](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/docker/prover.Dockerfile).

- Standard `ubuntu-24.04`, public repository: documented 4 CPU / 16 GB RAM / 14 GB SSD, free and unlimited standard runner use. Private repository runners have 8 GB; the memory preflight rejects those. No larger/paid runner label is used. [GitHub runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
- **Shared parent:** one new systemd slice per case, `MemoryMax=13G`, `MemorySwapMax=0`, `CPUQuota=400%`, `TasksMax=256`. Before any proof work, setup requires cgroup v2, Docker's `systemd` driver and the system daemon; it does not reconfigure or restart Docker. Setup records cpu_count and sched_getaffinity and requires four available CPUs. Runtime reads back the actual parent `memory.max`, `memory.swap.max`, `cpu.max` and required diagnostic counters. A mismatch stops the case. The same flat slice is passed to host `systemd-run --slice=…` and Docker `--cgroup-parent=…`; Docker's daemon-launched process therefore shares the parent's limit. [Official Docker systemd slice naming and per-container cgroup parent](https://docs.docker.com/reference/cli/dockerd/#default-cgroup-parent).
- Host and descendants have a 12 GiB child limit; original prover Docker keeps its 9 GiB child limit, four-CPU cap, no network and `GOMAXPROCS=4` / `GOMEMLIMIT=8GiB`. **12 + 9 are not independent budgets:** the kernel enforces the shared 13 GiB parent across both children, including overlap. Aggregate CPU is also capped at four CPUs by the parent. This lets each phase use otherwise idle allowance while retaining the previous whole-workload ceiling; it does not assume that host buffers have already been freed when Docker starts. Host Rayon/OpenMP and Docker Go/OpenMP pools use four workers. No ideal 2× speedup is promised. These settings are remote CI only: **local 2 GiB/two-thread policy is unchanged**. [systemd v255 resource-control source](https://github.com/systemd/systemd/blob/v255/man/systemd.resource-control.xml), [kernel cgroup v2 accounting/limits](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html).
- A lightweight Python observer remains **outside** the limited slice and checks its own `/proc/self/cgroup` membership. Every 0.5 seconds it records parent and current child `memory.current`, `memory.peak`, `memory.events` and related counters; the parent peak/events include descendant usage and OOM events even if a child scope disappears. `cgroup-samples.jsonl` and atomically replaced `cgroup-summary.json` survive host/container SIGKILL. A final snapshot occurs **before** stopping the slice. Kernel enforcement is independent of this diagnostic polling. [Kernel definitions of memory.peak / memory.events](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html#memory-interface-files).
- One case has a 1,800-second subprocess timeout. Job timeout is 45 minutes for one case or 135 minutes for four sequential cases, accommodating the 10-minute setup cap and cleanup/artifacts. First retry remains a single case. No automatic retry or resource-limit escalation. Failure/interrupt stops that exact host scope and named container; the always-run cleanup step repeats this safely. The ephemeral VM is the final backstop.
- Every 30 seconds, a short stdout heartbeat reports elapsed time, current/peak GiB, CPU seconds, average CPUs and OOM counters. Full JSONL remains in the artifact. Four selected upstream Rust modules use debug logging: host proof phases, recursion phases, STARK milestones and Docker conversion. No global trace/per-instruction tracing is enabled; guest/image/profile/API remain unchanged.

**Unmeasured fit:** standalone 3.0.6 CLI does not apply its `--po2` flag to the normal `--elf` execution path. This resource-only correction deliberately leaves the original proving API, guest/image/profile, wire bytes and cryptographic checks unchanged. The selectable v3 bytes/bindings are prepared correctly, but neither profile has yet completed the full workflow under the shared cap. If that budget is insufficient, the diagnostics will identify the phase and limiting cgroup; no automatic increase or repeat is configured.

## Local validation without proof work

```sh
python3 tools/lean-zk/ci/test_ci.py
```

These tests check all eight profile/case wire encodings and asset hashes, protobuf framing, ABI offsets, rejection of fake/truncated/trailing receipt shapes, fail-closed shared limits, persistence of parent OOM counters after a child disappears, and continuing cleanup after one timeout. The cgroup tests use temporary text fixtures, not real allocation or synthetic proofs. They never start a native checker, Docker or prover. Real Linux cgroup nesting/readback and successful full remote verification remain validation performed by the next reviewed dispatch.

## Inspecting and rebuilding the experimental guest

The perf05 binary is accompanied by its complete small checker and guest sources, exact Cargo locks and foundation in `profiles/perf05/source/`. `provenance.json` records the original source hashes, guest flags and bounded build measurement. The only relocation edit is NanoDa's relative Cargo path; its original manifest is preserved beside the relocated one. NanoDa's full vendored source and patches are published in `tools/lean-zk/vendor/nanoda`; the v3 guest/checker/host source is directly in `tools/lean-zk`. This is sufficient source provenance for inspection and a future build; the CI job deliberately proves the pinned existing guest instead of rebuilding it.

For an environment with the pinned RISC Zero toolchain and Cargo dependencies already installed, from the repository root:

```sh
export RUSTUP_AUTO_INSTALL=0
export CARGO_BUILD_JOBS=1
export RAYON_NUM_THREADS=2
export RUSTFLAGS='-C passes=lower-atomic -C link-arg=-Ttext=0x00200800 -C link-arg=--fatal-warnings -C panic=abort --cfg getrandom_backend="custom"'
cargo +risc0 build --release --locked --offline \
  --manifest-path tools/lean-zk/ci/profiles/perf05/source/guest/Cargo.toml \
  --target riscv32im-risc0-zkvm-elf
unset RUSTFLAGS
# Use the separately built original ONCM pack command from tools/lean-zk/host.
cargo +stable run --release --locked --offline \
  --manifest-path tools/lean-zk/Cargo.toml -p oncm-proof-host -- pack \
  tools/lean-zk/ci/profiles/perf05/source/guest/target/riscv32im-risc0-zkvm-elf/release/oncm-perf05-guest \
  /tmp/oncm-perf05-rebuilt.bin
```

These commands are documentation, not CI steps or permission to run an unbounded local build. Follow the separate runtime setup/resource policy first. Relocated build paths/compiler platform can change the ELF/image; compare the rebuilt binary digest and original `r0vm --id` with `profile.json`. A changed image must remain a separate profile and cannot silently replace the committed CI asset. This research did not claim a clean-machine or bit-for-bit rebuild after relocation.
