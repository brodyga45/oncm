# Lean → NanoDa → RISC Zero → EVM

This directory develops the proof runtime copied into each implementation's
`proof/` directory. An application runs its own runner, job directory, binaries,
cache and contracts. No sibling application or shared running proof service is
required. Compiler/prover toolchains can use an explicitly configured immutable
installation cache, like Node or Lean installations normally do.

## Exact claim

The market commits to the SHA-256 of the complete exported goal package. This
package is an exact prefix of the later proof package. The guest validates both
packages with NanoDa, requires the canonical `Oncm.goal : Prop`, and checks
`Oncm.solution : Oncm.goal` or `Oncm.solution : ¬ Oncm.goal`. The fixed foundation,
profile, accepted axiom policy and native reduction policy are bound by the
zkVM image. A registration certificate has kind 0; a proof/refutation has kind
1/2. The immutable bridge does not accept registration as resolution.

Source text is reproducible metadata, not the semantic commitment. A registry
entry or an English description cannot substitute for this exported goal.
The current fixture uses Lean core `Nat.add_comm` from Lean 4.33.1. It is not a
claim that the full FLT export has been proved by this runtime.

## Runtime interface

```sh
node proof/runner.mjs <<'JSON'
{"action":"check","fixtureId":"lean-nat-add-comm-4.33.1","outcome":1}
JSON
```

`check` runs Lean, the exporter and native NanoDa. `register` generates a
certificate of a well-formed goal; `prove` generates a proof or refutation.
Supply `source`, the registered `goalHash`, `profileId` and `outcome` for a custom
job. Only `targetDeclaration: "Oncm.goal"` is supported by this profile. A
mathematical certificate can be reused across chains; the protocol checks that
the supplied immutable goal/profile belong to the requested statement.

The JSON result contains diagnostics and canonical hashes. Cryptographic
success additionally includes `certificate` and `journal`; `register` also
returns `registrationCertificate`. A native successful check is not a ZK proof.

Each cache path includes image ID, profile ID, complete export hash and kind.
Receipts are verified against the image before use. Development-mode receipts
are forbidden. Cancelling a runner stops its active child process group.

## Local compilation and proving

Lean source and the exporter run inside macOS `sandbox-exec`: only the job and
required toolchain/system files are readable, only the job directory is
writable, and network access is absent. The child receives a minimal environment.
Other operating systems must configure an isolated worker before source
execution; the runner fails closed rather than executing unisolated source.

`runtime.local.json` records actual installed dependency paths. The checked-in
configuration reflects this machine's explicit `/private/tmp` installation
cache; it is not a portable promise that those paths exist on another machine.
See the accompanying setup instructions for configuring another installation.

On macOS ARM, Groth16 uses the upstream RISC Zero circuit and ceremony key with
a native witness generator and upstream gnark prover. The process-local command
adapter is named `docker` only because the upstream r0vm invokes that command;
it explicitly identifies itself as a native adapter and supports only the
single pinned RISC Zero invocation. It neither modifies global Docker nor
pretends a Docker container ran. Resulting receipts must pass native verification
and the original Solidity verifier.

## Recorded checks and current status

- Lean/NanoDa accept the published addition proof and genuine arithmetic.
- Incorrect outcome, `sorry`, additional axioms and changed arithmetic
  definitions are rejected by the final policy.
- v3 guest executes successfully with the expected 128-byte journal.
- The final cryptographic run is still in progress until a verified receipt and
  actual chain transaction are recorded. Economic tests using a separate mock
  cannot complete that requirement.

Version 1 and 2 were intermediate local profiles, superseded before issuing
certificates. `manifest.json`, `deployment.json` and `ONCM-PATCHES.md` describe
the final profile. The end-to-end chain results will be recorded separately.
