# Lean / RISC Zero runtime on macOS ARM

**Current execution policy (2026-09-10):** expensive proving is disabled in `execution-policy.local.json` following excessive memory use. Native checks remain available through `resource-guard.py`. The previously built Gnark dump exceeds 2 GiB before its extra FFT/witness allocations and does not meet the new local memory budget. The build recipe below documents the existing installation; it is not authorization to restart its expensive prover. See the project's `docs/performance-and-memory.md` and the separate performance prototypes for measured alternatives. The macOS guard samples physical footprint and is a watchdog, not a kernel hard memory limit.

This directory contains the source and artifacts for ONCM's Lean certificate worker. `configure-runtime.mjs` checks an existing installation and can write a new configuration file. It does not download software, rebuild code, launch Lean, generate proofs, deploy contracts or restart an application.

The working machine used macOS on Apple Silicon, Lean 4.33.1, RISC Zero 3.0.6 and a native ARM implementation of the **upstream** RISC Zero Groth16 circuit/prover workflow. The configuration check has been run against those installed assets. The complete recipe below has **not** been tested from a clean machine. A successful configuration check is not evidence that a Groth16 certificate has been produced or accepted onchain; actual proof completion is recorded separately by the coordinator.

## Configure the already-built runtime

Run from the runtime directory with Node 22 or newer:

```sh
node configure-runtime.mjs
node configure-runtime.mjs --strict-provenance
```

The default is read-only. It checks executable/data paths, installed Lean/r0vm/Rust versions, the packed guest and foundation hashes against `manifest.json`, locked `risc0-zkvm` versions, and source checkout commits when present. Version commands only inspect installed tools. It never invokes `runner.mjs`, the witness generator or the prover. `--strict-provenance` requires the exporter and RISC Zero Git checkouts; a source archive without `.git` produces a warning in the default mode and needs its own provenance verification.

To describe another installation, supply its paths. The standard layout is shown later in this document.

```sh
node configure-runtime.mjs \
  --prefix /absolute/path/to/oncm-toolchains \
  --exporter-dir /absolute/path/to/lean4export \
  --risc0-source /absolute/path/to/risc0 \
  --output /absolute/path/to/NEW-runtime.local.json \
  --report /absolute/path/to/NEW-configuration-report.json
```

Both output paths must be new files in existing directories. The script refuses to overwrite a working `runtime.local.json`, manifest, binary or report. `--runtime-dir` selects another runtime bundle; `--config` reads an explicitly selected existing config. `--print-config` writes validated JSON to stdout and sends check messages to stderr.

Once the new file is reviewed, the maintainer can place it at the selected worker's `runtime.local.json` during a planned worker update. Do not replace files underneath an active proof job. The current demonstration apps share no source imports; when copying this runtime into each implementation, preserve the whole bundle and configure each worker deliberately.

The optional `--verify-key` streams the approximately 2.4 GiB compressed ceremony archive through SHA-256. It is omitted from the quick check so it does not compete with an active prover for disk I/O. Use `--ceremony-archive` when the archive is stored somewhere else:

```sh
node configure-runtime.mjs --verify-key \
  --ceremony-archive /absolute/path/to/stark_verify_final.zkey.gz
```

Exit codes: `0` configuration consistent, possibly with explicit warnings; `1` failed checks; `2` malformed options/configuration or a filesystem error. The helper does not cryptographically tie a local `.pk.dmp` to an archive merely by checking that both exist. Generate the converted key from the verified archive using the pinned converter; proof receipt verification is the final cryptographic check.

## Provenance and exact versions

Machine-readable pins, asset URLs and available archive digests are in [setup-pins.json](setup-pins.json). The release asset digests were read from official release metadata saved during installation; the ceremony digest also appears directly in the upstream Dockerfile.

| Component | Version / source | What is pinned |
|---|---|---|
| Lean | [Lean 4.33.1 release](https://github.com/leanprover/lean4/releases/tag/v4.33.1), commit `819816b2e0a3bf405af45ae5c7af2491d8f5bee6` | Official `darwin_aarch64` archive, SHA-256 in pins |
| Exporter | [lean4export](https://github.com/leanprover/lean4export/tree/15f6055e299ad5b89345e533cc2192f4cc00f659), Apache-2.0 | Commit `15f6055e299ad5b89345e533cc2192f4cc00f659`, built with the absolute Lean 4.33.1 Lake binary |
| Independent checker | [NanoDa](https://github.com/ammkrn/nanoda_lib/tree/4c544ed4099c8227f07d5de77ad1e69fb0740a27), Apache-2.0 | Vendored commit plus ONCM changes; do not replace with unmodified upstream |
| RISC Zero | [v3.0.6](https://github.com/risc0/risc0/tree/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9), Apache-2.0 | Source commit `1cc70cf05033a79ebc90f07c679cb4bd1cd301b9`, `r0vm`/cargo extension 3.0.6 |
| Rust | Host `1.98.1`; RISC Zero toolchain `1.97.0` reports `1.97.0-dev` | Isolated rustup directories; observed rustup `1.29.1`, CLI rzup `0.5.0` |
| Circom | [2.2.2 source](https://github.com/iden3/circom/tree/e410b0d5cd2948a15931df0bc50d79ce56fa8c32), GPL-3.0 | Commit `e410b0d5cd2948a15931df0bc50d79ce56fa8c32` from the upstream prover Dockerfile |
| Go | [Go 1.27.1 archive](https://go.dev/dl/go1.27.1.darwin-arm64.tar.gz) | Official ARM archive and SHA-256 in pins |
| Gnark converter/prover | [`groth16_proof/circom-compat`](https://github.com/risc0/risc0/tree/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/circom-compat) | Original RISC Zero sources and `go.sum`; `github.com/risc0/gnark v0.12.0-risczero.0`, gnark-crypto `v0.15.0` |
| Witness support | Apple clang `15.0.0`, GMP `6.3.0`, nlohmann JSON `3.12.0` observed locally | Tool versions recorded; these system dependencies are not a hermetic toolchain archive |
| Solidity verifier | [risc0-ethereum](https://github.com/risc0/risc0-ethereum/tree/32aa0b6f23ddd02dd93fc71717667606e5c7db86) | Vendored source commit in `manifest.json`; local bridge compiler dependencies in `package-lock.json` |

Preserve both `Cargo.lock` files and `vendor/nanoda` exactly. RISC Zero's transitive crate versions are intentionally not all the same: this lock uses zkVM/build `3.0.6`, binfmt/Groth16/ZKP `3.0.5`, v1-compatible kernel/platform `2.2.3`, recursion/rv32im circuits `4.0.5` and Keccak circuit `4.0.6`. The installed rzup CLI `0.5.0` is separate from the rzup library selected in Cargo.lock. Do not run `cargo update` to make version numbers look uniform.

The exporter checkout's `lean-toolchain` says 4.33.0. The working installation built it using the **absolute 4.33.1 Lake executable**, preserving the checkout contents. An `elan`-selected `lake` command could silently use another compiler; use the explicit path below.

## Directory layout

Current absolute paths use `/private/tmp`, which may be cleaned by the operating system. A durable installation should choose an owned directory outside temporary storage. Do not move active assets while a proof is running.

```text
oncm-toolchains/
  lean-4.33.1-darwin_aarch64/bin/{lean,lake}
  cargo/bin/{cargo,rustc,rustup,r0vm,cargo-risczero}
  rustup/toolchains/{1.98.1-aarch64-apple-darwin,risc0}
  risc0/toolchains/...
  risc0/extensions/...
  bin/rzup
  go/bin/go
  include/nlohmann/json.hpp
  stark_verify_final.zkey.gz
  stark_verify_final.pk.dmp
lean4export/.lake/build/bin/lean4export
risc0/groth16_proof/
  groth16/stark_verify.{circom,r1cs,cs}
  groth16/stark_verify_cpp/{stark_verify,stark_verify.dat,fr.cpp,fr.hpp,...}
  circom-compat/{go.mod,go.sum,prover,...}
```

The existing host Rust directory is named `stable-aarch64-apple-darwin`, but its measured compiler version is 1.98.1. A fresh installation should explicitly install/select 1.98.1. Use `CARGO_HOME`, `RUSTUP_HOME` and `RISC0_HOME` for these tools without changing `HOME` or the user's global Rust setup.

## Staged source-build recipe

These are maintainer commands for a separate build directory. They are not executed by the configuration helper and were not replayed from scratch during preparation of this guide. They reconstruct the observed installation from pinned sources and logs. Use the shipped `lean-checker.bin` when the intent is to run the exact existing profile; rebuilding a guest may produce another hash/image and requires an explicit compatibility decision.

### 1. Isolate paths and obtain pinned tools

Choose absolute directories first. This example starts in a writable scratch workspace:

```sh
set -euo pipefail
export ONCM_SETUP_PREFIX="$PWD/oncm-toolchains"
export ONCM_SETUP_SOURCES="$PWD/oncm-sources"
export ONCM_RUNTIME_DIR="/absolute/path/to/the/runtime-bundle"
mkdir -p "$ONCM_SETUP_PREFIX" "$ONCM_SETUP_SOURCES"
export CARGO_HOME="$ONCM_SETUP_PREFIX/cargo"
export RUSTUP_HOME="$ONCM_SETUP_PREFIX/rustup"
export RISC0_HOME="$ONCM_SETUP_PREFIX/risc0"
export PATH="$ONCM_SETUP_PREFIX/bin:$CARGO_HOME/bin:$PATH"

download_verified() {
  curl --fail --location --retry 3 "$1" --output "$3"
  printf '%s  %s\n' "$2" "$3" | shasum -a 256 -c -
}

download_verified \
  https://github.com/leanprover/lean4/releases/download/v4.33.1/lean-4.33.1-darwin_aarch64.tar.zst \
  88c45aad985b5d2a8d925fe10bd1296bd35f66f408480ab182d3facccd065a9d \
  "$ONCM_SETUP_PREFIX/lean-4.33.1.tar.zst"
tar -xf "$ONCM_SETUP_PREFIX/lean-4.33.1.tar.zst" -C "$ONCM_SETUP_PREFIX"

download_verified \
  https://go.dev/dl/go1.27.1.darwin-arm64.tar.gz \
  ee215d57e0ec269c60cc9ceca68e6bda321ba9ee5afe24f4b0988703c2d87d12 \
  "$ONCM_SETUP_PREFIX/go.tar.gz"
tar -xzf "$ONCM_SETUP_PREFIX/go.tar.gz" -C "$ONCM_SETUP_PREFIX"
```

Install rustup from its [official distribution](https://rust-lang.github.io/rustup/installation/index.html), with the three isolated environment variables already set, `--no-modify-path` and host toolchain **1.98.1**. The original installation used rustup 1.29.1. This guide does not treat an unversioned installer download as a reproducible pin: obtain/record the chosen rustup-init artifact and its digest before building a clean-machine image.

With that isolated rustup already installed:

```sh
rustup toolchain install 1.98.1 --profile minimal
rustup default 1.98.1
cargo +1.98.1 install rzup --version 0.5.0 --locked --root "$ONCM_SETUP_PREFIX"
rzup install rust 1.97.0
rzup install cargo-risczero 3.0.6
r0vm --version
rustc +risc0 --version
```

The pinned cargo-risczero release contains `r0vm`; the current installation uses rzup-managed symlinks into `cargo/bin`. The release archive and digest are also recorded in `setup-pins.json`. Running `rzup install` without a component/version would select newer tools, so avoid that form.

Clang, `make`, Python 3 and GMP are required for the native witness build. Current GMP headers/libraries are under `/opt/homebrew` and clang comes from Apple's Command Line Tools. Verify those installations locally. Using today's default Homebrew formula alone does not recreate the observed GMP 6.3.0 environment; pin or archive system dependencies if byte-for-byte native reproducibility is required.

### 2. Check out the exporter, RISC Zero and Circom

```sh
git clone https://github.com/leanprover/lean4export.git "$ONCM_SETUP_SOURCES/lean4export"
git -C "$ONCM_SETUP_SOURCES/lean4export" checkout --detach 15f6055e299ad5b89345e533cc2192f4cc00f659
(
  cd "$ONCM_SETUP_SOURCES/lean4export"
  PATH="$ONCM_SETUP_PREFIX/lean-4.33.1-darwin_aarch64/bin:$PATH" \
    "$ONCM_SETUP_PREFIX/lean-4.33.1-darwin_aarch64/bin/lake" build
)
git clone https://github.com/risc0/risc0.git "$ONCM_SETUP_SOURCES/risc0"
git -C "$ONCM_SETUP_SOURCES/risc0" checkout --detach 1cc70cf05033a79ebc90f07c679cb4bd1cd301b9
git clone https://github.com/iden3/circom.git "$ONCM_SETUP_SOURCES/circom"
git -C "$ONCM_SETUP_SOURCES/circom" checkout --detach e410b0d5cd2948a15931df0bc50d79ce56fa8c32
cargo +1.98.1 build --release --locked \
  --manifest-path "$ONCM_SETUP_SOURCES/circom/Cargo.toml" -p circom
```

### 3. Build ONCM's native checker, host and optional guest

The vendored NanoDa modifications are part of the checker trusted by the profile. Read [ONCM-PATCHES.md](vendor/nanoda/ONCM-PATCHES.md) together with the current `manifest.json`: the earlier patch note describes native arithmetic policy, while profile v3 additionally enforces the pinned axiom policy and structural target names in the enclosing checker. Both workspace and guest lockfiles belong to this bundle.

```sh
cargo +1.98.1 build --release --locked --manifest-path "$ONCM_RUNTIME_DIR/Cargo.toml" \
  -p oncm-lean-checker -p oncm-proof-host

# Optional guest rebuild, using flags observed in the current Cargo fingerprint.
RUSTFLAGS='-C passes=lower-atomic -C link-arg=-Ttext=0x00200800 -C link-arg=--fatal-warnings -C panic=abort --cfg getrandom_backend="custom"' \
  cargo +risc0 build --release --locked \
  --manifest-path "$ONCM_RUNTIME_DIR/guest/Cargo.toml" \
  --target riscv32im-risc0-zkvm-elf

mkdir -p "$ONCM_SETUP_PREFIX/rebuilt"
"$ONCM_RUNTIME_DIR/target/release/oncm-proof-host" pack \
  "$ONCM_RUNTIME_DIR/guest/target/riscv32im-risc0-zkvm-elf/release/oncm-lean-guest" \
  "$ONCM_SETUP_PREFIX/rebuilt/lean-checker.bin"
```

`pack` combines the guest ELF with the pinned `risc0-zkos-v1compat` kernel and reports its image ID. Compare the resulting packed binary SHA-256 and image ID to `manifest.json` **before** replacing any artifact. Build paths/compiler changes may affect the result; this guide does not assert reproducible guest bytes on an untested machine. Keep a differing rebuild separate. An existing profile's image cannot be silently changed; a new image/profile requires protocol governance and compatible certificates.

For a new runtime bundle whose reproduced hashes match, install the built native checker/host into its `bin/`. Preserve the shipped packed guest and manifest together. The configuration helper refuses a packed-binary hash mismatch; it does not rewrite commitments to conceal one.

### 4. Build the native ARM Groth16 witness generator

The source of this recipe is the pinned [RISC Zero prover Dockerfile](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/docker/prover.Dockerfile), adapted to the installed ARM compiler/GMP. Its `--O2` is **Circom circuit optimization**; the split C++ files were compiled with `-O0` to keep compiler resource use manageable. The checkout stores `stark_verify.circom` as a Git LFS pointer: fetch the actual circuit from the pinned media URL and verify its digest before invoking Circom.

```sh
export ONCM_GROTH16_DIR="$ONCM_SETUP_SOURCES/risc0/groth16_proof"
download_verified \
  https://media.githubusercontent.com/media/risc0/risc0/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/groth16/stark_verify.circom \
  a3789471909ba1a13cca783dc5269b25b6d41295abe60234a8075f750017518c \
  "$ONCM_GROTH16_DIR/groth16/stark_verify.circom"
(
  cd "$ONCM_GROTH16_DIR/groth16"
  "$ONCM_SETUP_SOURCES/circom/target/release/circom" \
    --r1cs --c --O2 --no_asm stark_verify.circom
)
python3 "$ONCM_GROTH16_DIR/scripts/chunk.py" \
  "$ONCM_GROTH16_DIR/groth16/stark_verify_cpp/stark_verify.cpp"

# Remove only the generated aggregate translation unit after chunking.
python3 - <<'PY'
import os, pathlib, subprocess
root = pathlib.Path(os.environ['ONCM_GROTH16_DIR'])
cpp = root / 'groth16/stark_verify_cpp'
(cpp / 'stark_verify.cpp').unlink()
largest = max(cpp.glob('*.cpp'), key=lambda f: f.stat().st_size)
subprocess.run(['python3', str(root / 'scripts/outline.py'), str(largest)], check=True)
largest.unlink()
for name in ['fr.cpp', 'fr.hpp']:
    p = cpp / name
    p.write_text(p.read_text().replace('uint64_t', 'mp_limb_t'))
p = cpp / 'fr.hpp'
text = p.read_text()
assert '#include <gmp.h>' in text
check = 'static_assert(sizeof(mp_limb_t) == 8, "64-bit GMP limbs required");'
if check not in text:
    text = text.replace('#include <gmp.h>', '#include <gmp.h>\n' + check, 1)
p.write_text(text)
PY

cp "$ONCM_GROTH16_DIR/scripts/replacement-Makefile" \
  "$ONCM_GROTH16_DIR/groth16/stark_verify_cpp/Makefile"
mkdir -p "$ONCM_SETUP_PREFIX/include/nlohmann"
download_verified \
  https://raw.githubusercontent.com/nlohmann/json/v3.12.0/single_include/nlohmann/json.hpp \
  aaf127c04cb31c406e5b04a63f1ae89369fccde6d8fa7cdda1ed4f32dfc5de63 \
  "$ONCM_SETUP_PREFIX/include/nlohmann/json.hpp"
make -C "$ONCM_GROTH16_DIR/groth16/stark_verify_cpp" -j2 \
  CFLAGS="-std=c++11 -O0 -I. -I/opt/homebrew/include -I$ONCM_SETUP_PREFIX/include" \
  LDFLAGS="-L/opt/homebrew/lib"
```

The generated `.dat` must remain beside the witness executable's working directory. On Apple ARM, GMP's `mp_limb_t` and `uint64_t` can be different C++ types despite equal size; the observed adapter changes the generated `fr.cpp/fr.hpp` interfaces to use GMP's actual limb type and asserts eight-byte limbs. It does not modify the Circom circuit, R1CS, proving key or onchain verifier. This is a platform adaptation that still needs end-to-end proof verification; a successful C++ compilation alone is insufficient.

This chunk/outline procedure is intended for freshly generated sources. Do not rerun it over an already chunked live build directory. The witness build observed here had roughly 1.1 GiB of generated sources/objects, a 133 MiB executable and a 44 MiB `.dat`; it can take substantial time. Keep parallelism low on a machine also serving the applications.

### 5. Verify the ceremony archive and build the original Gnark tools

Use the exact existing RISC Zero ceremony. Creating a new ceremony would produce another verifier/key set and would not match the deployed verifier.

```sh
download_verified \
  https://risc0-artifacts.s3.us-west-2.amazonaws.com/zkey/2024-05-17.1/stark_verify_final.zkey.gz \
  69c6056451ea814b37e30ccbc44639dbaafef73540cbfbff6ec7e68e2d325735 \
  "$ONCM_SETUP_PREFIX/stark_verify_final.zkey.gz"

export GOPATH="$ONCM_SETUP_PREFIX/gopath"
export GOCACHE="$ONCM_SETUP_PREFIX/gocache"
export GOTOOLCHAIN=local
export CGO_ENABLED=0
export GOMAXPROCS=2
(
  cd "$ONCM_GROTH16_DIR/circom-compat"
  "$ONCM_SETUP_PREFIX/go/bin/go" mod download
  "$ONCM_SETUP_PREFIX/go/bin/go" mod verify
  "$ONCM_SETUP_PREFIX/go/bin/go" build -o prover ./cmd/prover
  "$ONCM_SETUP_PREFIX/go/bin/go" run ./cmd/converter --dump \
    "$ONCM_GROTH16_DIR/groth16/stark_verify.r1cs" \
    "$ONCM_SETUP_PREFIX/stark_verify_final.zkey.gz"
)
```

The original converter writes `stark_verify.cs` beside the R1CS and `stark_verify_final.pk.dmp` beside the compressed key. Keep the resulting dump paired with the same native platform, Go/gnark versions and prover; the upstream `--dump` mode uses a memory-oriented format rather than a portable interchange artifact. Retain the verified `.zkey.gz` for regeneration. The observed assets were approximately 1.3 GiB R1CS, 249 MiB `.cs`, 2.4 GiB compressed ceremony archive and 2.1 GiB `.pk.dmp`, before toolchains/build caches/witness data. Reserve substantially more space than those final asset totals.

The worker's `native-adapter/docker` is a **process-local compatibility wrapper**, not Docker. Only the runner's child-process PATH includes it. It accepts the one pinned `risczero/risc0-groth16-prover:v2025-04-03.1` command and runs the native witness generator plus the original Gnark prover against the same circuit/key. It does not replace the system Docker executable or silently use fake receipts. Avoid adding that directory to a login shell's global PATH.

### 6. Configure and verify in stages

```sh
node "$ONCM_RUNTIME_DIR/configure-runtime.mjs" \
  --runtime-dir "$ONCM_RUNTIME_DIR" \
  --prefix "$ONCM_SETUP_PREFIX" \
  --exporter-dir "$ONCM_SETUP_SOURCES/lean4export" \
  --risc0-source "$ONCM_SETUP_SOURCES/risc0" \
  --strict-provenance --verify-key \
  --output "$ONCM_SETUP_PREFIX/runtime.local.reviewed.json"
```

After placing a reviewed config in a fresh worker, verification has distinct stages:

1. **Configuration check:** versions, paths, hashes and provenance. No Lean/prover execution.
2. **Lean/native check:** `runner.mjs` with action `check` and the published fixture. This elaborates source in the worker sandbox, exports the canonical goal/solution and invokes NanoDa. It does not produce a zk certificate.
3. **Certificate generation:** action `register` proves GoalWellFormed; action `prove` proves P (outcome 1) or its negation (outcome 2). These are expensive jobs. Run only when the worker is idle and intentionally scheduled.
4. **Receipt and contract verification:** host receipt verification binds the exact image; the journal binds goal, profile and claim kind. The deployed bridge must accept the certificate before the registry can create/resolve a mathematical market.

A native smoke check for an idle worker is:

```sh
printf '%s\n' '{"action":"check","fixtureId":"lean-nat-add-comm-4.33.1","outcome":1,"targetDeclaration":"Oncm.goal"}' \
  | node "$ONCM_RUNTIME_DIR/runner.mjs"
```

That command is documented for the maintainer; it was not run by the setup helper. Do not interpret `checked` as `proved`, or a generated receipt as an already executed blockchain transaction.

## Operational boundaries

- The economic goal is the exact exported goal prefix committed by `goalHash`. `.lean` source and informal descriptions are reproducible metadata. The canonical declarations for this profile are `Oncm.goal` and `Oncm.solution`; arbitrary Lean/Mathlib repositories are not automatically supported.
- The runner depends on `/usr/bin/sandbox-exec` on macOS for source execution. It gives Lean a restricted environment and filesystem scope. Another OS needs a deliberate isolation implementation; do not remove that boundary merely to make a source file run.
- Keep `RISC0_DEV_MODE` unset. The host forbids it; the worker explicitly clears it. A development receipt cannot settle a market through the real bridge.
- The native proof stage currently uses two Rayon/Go worker threads and a 16 MiB witness stack limit. Those settings are resource limits, not a proof of memory sufficiency. Proof generation is the expensive stage on a 16 GiB machine; do not run concurrent jobs just because configuration validation is fast.
- Cache directories are separated by image ID and profile ID. Preserve that separation when moving precomputed receipts. Do not relabel an old receipt as a new profile.
- Rerunning setup is not an application reset. Existing chains, contracts, social data and open user tabs should be left alone. Installing a new image/profile uses the protocol's explicit governance process.

The local configuration report [setup-check-2026-09-10.json](setup-check-2026-09-10.json) records what this setup task actually checked. A successfully generated, machine-specific example is [setup-runtime.local.example.json](setup-runtime.local.example.json). The helper's refusal to overwrite the existing runtime file was also exercised. No new proof job or clean-machine installation was performed. Source snapshots, license files, lockfiles and the upstream hashes above should accompany redistributed runtime bundles; large generated assets can be distributed separately with a checksum inventory. The JSON header digest records the actual installed 3.12.0 source file; it was not a separate publisher-signed checksum.

## Selected low-allocation exporter

The runtime now uses its own `exporter/.lake/build/bin/lean4export`, with the upstream commit plus the allocation-only patch and binary/source hashes in [exporter/pins.json](exporter/pins.json). The complete local reconstruction recipe and current measured limits are in [exporter/README.md](exporter/README.md). When using `--exporter-dir`, select this bundled `exporter` directory. The original unpatched source-build instructions above describe the baseline and do not produce the selected patched binary. Mathematical manifest hashes remain unchanged.
