# Real Lean → zk smoke on GitHub Actions

This directory is a self-contained input bundle and orchestration recipe for **official RISC Zero 3.0.6** on a standard **public** GitHub Ubuntu x64 runner. It contains no host or guest compilation step. It does not use Bonsai, a paid service, a development-mode receipt or a substitute verifier.

Status: source review and small offline adapter tests completed; **this workflow has not yet been run remotely**. First dispatch should use `profile=perf05`, `case=true-registration`. A successful native executor or local RapidSnark toy fixture is not a certificate. The only success marker is `verified.json`, written after the original `r0vm` accepts the real Groth16 receipt for the pinned image and the exact 128-byte journal matches.

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

Docker Registry manifest/config metadata were read without pulling any image layers locally. The manifest has 2,399,158,367 compressed layer bytes. The final image already contains converted `.cs`, `.pk.dmp`, compiled witness generator and `.dat`. **Do not additionally download the 2.58 GB ceremony archive or 3.62 GB original zkey:** the stock image already contains the required final key. The entire fixture bundle for both profiles is only a few MB. `prepare.py` requires 9 GiB free before the pull and 2 GiB afterwards, records the actual expanded image size/free disk, and fails before proving if insufficient. Expanded image size and CI peak disk are not yet measured. [Pinned Dockerfile](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/docker/prover.Dockerfile).

- Standard `ubuntu-24.04`, public repository: documented 4 CPU / 16 GB RAM / 14 GB SSD, free and unlimited standard runner use. Private repository runners have 8 GB; the memory preflight rejects those. No larger/paid runner label is used. [GitHub runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
- Host and its children: systemd scope `MemoryMax=4G`, `MemorySwapMax=0`, `CPUQuota=200%`, `TasksMax=128`. Docker is accounted separately, because it is launched by the daemon.
- Prover container: `--memory=9g --memory-swap=9g --cpus=2 --pids-limit=128`, no network; `GOMAXPROCS=2`, `GOMEMLIMIT=8GiB`. Host plus Docker hard memory bounds sum to **13 GiB**, leaving the rest for the OS/runner. These are CI limits and **do not meet the local 2 GiB target**. [Docker memory/CPU controls](https://docs.docker.com/engine/containers/resource_constraints/), [systemd resource controls](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html).
- One case has a 600-second subprocess timeout; job timeout is 50 minutes, including setup/four optional sequential cases. No automatic retry or resource-limit escalation. Failure/interrupt stops that exact host scope and named container; an always-run cleanup step repeats this safely. The VM is ephemeral as a final backstop.

**Unmeasured fit:** standalone 3.0.6 CLI does not apply its `--po2` flag to the normal `--elf` execution path. Therefore this recipe does not pretend to tune it. The initial perf05 case is small, but it still has to demonstrate real proving under the host cap. The selectable v3 bytes/bindings are prepared correctly; its many small serde reads and default segment limit may exceed the 4 GiB cap or case timeout. No successful v3 resource claim is made. A measured failure should drive the next change (for example the documented ExecutorEnv segment-limit API), rather than blindly increasing limits.

## Local validation without proof work

```sh
python3 tools/lean-zk/ci/test_ci.py
```

These tests check all eight profile/case wire encodings and asset hashes, protobuf framing and rejection of fake/truncated/trailing receipt shapes. They never start a native checker, Docker or prover. Linux cgroups, Docker pulling, original Linux proof generation and full remote verification remain runtime validation performed by the first reviewed dispatch.

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
