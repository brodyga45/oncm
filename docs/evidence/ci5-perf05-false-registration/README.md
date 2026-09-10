# CI5: real registration certificate for the refutable goal

[GitHub run 34419882266](https://github.com/brodyga45/oncm/actions/runs/34419882266),
job `102692778335`, source commit `ed830fe68cc94aeac6eb01049a92464182bba737`.
This is **perf05 / false-registration / outcome 0** for the exact Lean goal
`∀ P : Prop, P`. Registration establishes that the goal is well formed under
the pinned zero-axiom profile; it does not settle the market or prove its negation.

The ZIP returned by the GitHub connector is 356,096 bytes. Its SHA256 matches
the GitHub artifact metadata:
`dc2dfe9017822cb7c1fec5418d7b4ff52360bec6f1cdabbcb1784e9196b4b6a2`.
Extraction rejected absolute/traversing paths and symlinks, and bounded member
count and expanded size (18 members, 2,112,736 expanded bytes).

- End-to-end CI case: **514.744146486 seconds**; guest execution **13.72539 ms**.
- Shared parent peak: **7,825,907,712 bytes (7.28844 GiB)**; CPU: **1,982.3848 seconds**.
- Four CPU workers, shared 13 GiB limit, zero parent OOM/max events and zero swap.
- The cleanup log contains one benign stop attempt for a scope that had already
  unloaded; it is retained verbatim, not reported as an empty cleanup log.

The original `r0vm 3.0.6 VerifyRequest / Receipt::verify` ran in CI. Locally,
the existing strict bincode reader confirmed a real Groth16 variant and exact
seal, verifier-parameters and journal bytes; the receipt SHA256 matches the
artifact. This framing check alone is not cryptographic verification.

Independent local cryptographic verification then used the **original RISC Zero
EVM verifier** on chain **31372**, block **122**, through `eth_call`. It accepted
the real certificate and rejected a changed image and changed journal. The
separately prepared immutable perf05 application bridge also accepted
`verifyGoal` and matched the bundled false-goal fixture. No transaction, profile
installation, market creation, proving job or CI dispatch was performed for
these checks. At this observation the additional Exchange profile was not yet
installed; the default v3 bridge is incompatible with this distinct perf05 image.

Exact standalone copies of `verified.json` were added to Exchange, Agora and
Vault import bundles without replacing their true-registration artifacts or
changing application source/services. Existing file import accepts this case;
catalog exposure depends on each application's current allowlist.

The compact files here retain the receipt, certificate, resource summary,
commands, phase boundaries, proof JSON, read-only EVM reports and file hashes.
`provenance.json` records ZIP metadata and exact artifact digests.
