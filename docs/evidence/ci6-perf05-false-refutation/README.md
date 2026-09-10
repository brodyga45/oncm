# CI6: real refutation certificate

[GitHub run 34421160265](https://github.com/brodyga45/oncm/actions/runs/34421160265),
job `102696670677`, source commit `ed830fe68cc94aeac6eb01049a92464182bba737`.
This is **perf05 / false-refutation / outcome 2** for the exact Lean goal
`∀ P : Prop, P`. It proves that this goal implies `False`; it is distinct from
the outcome-0 registration certificate produced by CI5.

The GitHub connector ZIP is 396,161 bytes and its SHA256 matches artifact
metadata: `7aabf698087992f936e23447ad18088dd5f25a0ca4493b3093c1b2f3f0e16b2d`.
Bounded extraction checked 18 members and 3,082,355 expanded bytes, rejecting
absolute/traversing paths and symlinks before writing files.

- End-to-end case: **900.799123228 seconds**; guest execution **26.013461 ms**.
- Shared parent peak: **9,817,907,200 bytes (9.14364 GiB)**.
- CPU: **3,502.470449 seconds**, four workers, shared 13 GiB limit.
- Zero parent OOM/max counters and zero swap. The retained cleanup log records
  a benign stop attempt for a scope that had already unloaded.

The original `r0vm 3.0.6 VerifyRequest / Receipt::verify` completed in CI. Local
strict bincode framing checks confirmed Groth16 receipt kind, exact seal,
verifier parameters, full journal, certificate bytes and receipt SHA256.
Framing is not a replacement for cryptographic verification.

Independent original **RISC Zero EVM verification** accepted the real receipt
on chain **31372**, block **122**, using only `eth_call`. Changed image and
changed journal claims were rejected. The separately prepared immutable perf05
bridge accepted the exact **outcome-2** claim and rejected the same certificate
when supplied as an outcome-1 proof or an outcome-0 registration. Goal and
profile match CI5 and the bundled false fixture exactly.

No transaction, profile installation, market settlement, local proving or new
CI dispatch occurred in these checks. At the recorded observation the additional
Exchange profile was still pending installation; the default v3 bridge remains
incompatible with this distinct perf05 image. Actual market resolution requires
the normal registry call after governance admission.

Exact copies of `verified.json` were added to the standalone import bundles of
Exchange, Agora and Vault without editing their application source or restarting
services. Existing upload/paste routes can verify the full artifact; catalog
exposure depends on the running API's allowlist.

Compact evidence includes the original receipt, proof JSON, certificate, resource
summary, commands, phase boundaries and both independent read-only EVM reports.
`provenance.json` records ZIP metadata and exact file hashes.
