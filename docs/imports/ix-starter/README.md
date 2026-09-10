# Ix starter source catalogue

Three **actual Ix source declarations**, pinned on 2026-09-10 to [argumentcomputer/ix 4c91254346284dcd984f1940f2c527114b1c5190](https://github.com/argumentcomputer/ix/tree/4c91254346284dcd984f1940f2c527114b1c5190) (commit 2026-09-09T16:44:21Z). This is an initial portable source import, not a list of already registered markets or certified results. None of the three has a compatible certificate in this package.

| Entry | Exact upstream theorem | Meaning |
| --- | --- | --- |
| `nat-reflexivity` | [`myReflEq`](https://github.com/argumentcomputer/ix/blob/4c91254346284dcd984f1940f2c527114b1c5190/Tests/MinimalDefs.lean#L5) | Every natural number equals itself. |
| `peano-zero-add` | [`Tests.Ix.Kernel.TutorialDefs.tnAddZero`](https://github.com/argumentcomputer/ix/blob/4c91254346284dcd984f1940f2c527114b1c5190/Tests/Ix/Kernel/TutorialDefs.lean#L140) | Zero plus a custom Peano natural equals that natural. |
| `peano-succ-add` | [`Tests.Ix.Kernel.TutorialDefs.tnAddSucc`](https://github.com/argumentcomputer/ix/blob/4c91254346284dcd984f1940f2c527114b1c5190/Tests/Ix/Kernel/TutorialDefs.lean#L141) | Adding a successor equals the successor of the sum. |

These are elementary equality/inductive-arithmetic examples. `TN` is the inductive type defined in Ix's tutorial, **not Mathlib/Nat under a new name**. The snapshot has Mathlib benchmark integration, but these three packages do not import Mathlib. This distinction avoids promising a Mathlib installation or library-wide proof coverage.

## Source packages and dependencies

`catalog.json` uses `oncm-source-catalog-v1`: stable snapshot-qualified ID; human title; fully qualified declaration; formal goal; immutable source URL and line span; independent source/Lean/kernel/ZK/onchain statuses; portable local source paths; SHA256 and byte lengths. A source-file SHA is **not** a semantic goal commitment. `goalHash` is now populated from the independently checked v3 goal export. `certificate` remains null: no ZK proof has been generated for these entries.

Each `packages/<slug>/Source.lean` is either the exact MinimalDefs file, or exact tutorial lines 135–140 / 135–141 with the original namespace restored. Each `Oncm.lean` appends an explicitly generated `Oncm.goal` and `Oncm.solution` wrapper referring to the original theorem. Generated wrappers are adapter material; they are not falsely attributed as verbatim upstream files.

The minimal packages require **Lean 4.33.1 and its implicit Init prelude only**, with no Lake packages. The upstream full project dependencies are recorded separately and exactly in `upstream/lake-manifest.json`: lean4ix a4188d7c…, Batteries 4488d40d…, Cli 6130a478…, Blake3 78f5bc4b…, LSpec ab4d5eb4…, inherited Plausible b7eb3304…. `upstream/lakefile.lean` and `lean-toolchain` are preserved. No transitive package was installed or claimed to have been built.

**Do not execute the whole upstream TutorialDefs automatically.** It contains adversarial `bad_thm`/`unchecked` tests and unrelated custom axioms. Its exact file is retained for provenance, while the extracted TN/add declarations and two ordinary `theorem … := … rfl` bodies include none of that harness. The excerpt selection is audited and verified, not a regex-based general theorem dependency resolver.

The repository declares MIT OR Apache-2.0. Both original license texts are included; copyright Argument Computer Corporation. TutorialDefs additionally identifies adaptation from `lean-kernel-arena tutorial/Tutorial.lean`; preserve that provenance if redistributing extracted material. Original bytes and generated modifications remain distinguishable.

## Verification status and compatibility

Source integrity: **16 files, 82,454 pinned bytes; three exact extractions passed** `python3 docs/imports/ix-starter/verify_sources.py`.

Lean and independent kernel: **all three passed after the independently reviewed resource-guard repair**. Both Ix and ONCM v3 use Lean4.33.1. The existing runner compiled each exact wrapper, exported goal/proof terms, and ran the unchanged NanoDa native checker. There were three sequential checks with an outer1GiB/5s guard, inner512MiB limits for Lean/exporter and the existing common worker lock. No installs, proving or chain actions occurred.

| Source | Whole-job wall time | Observed peak tree footprint | Result |
| --- | --- | --- | --- |
| nat-reflexivity | 3.731s | 123,641,296B /117.914MiB | checked |
| peano-zero-add | 1.380s | 128,802,112B /122.835MiB | checked |
| peano-succ-add | 1.410s | 135,405,416B /129.133MiB | checked |

These are individual observations, not cold/warm performance guarantees. Every report has exit0, completed reason and empty cleanupErrors. The100ms guard is a measured watchdog, not an OS hard memory guarantee. Exact invocations and source/guard pins are in `evidence/repaired-native-invocations.json`; runner/parser/checker pins, original native profile and exact exports are also retained. The six goal/proof exports total211,026bytes. Their goal digests were independently recomputed and matched each runner result.

Historical attempt is preserved: before the guard repair, the first wrapper stopped with exit126 (`Cannot account for worker PID`), after2.415s and observed peak39,750,200bytes; the other two were not attempted then. It was a guard accounting failure, not a Lean rejection. The successful follow-up used the repaired in-process macOS inventory, with no guard bypass or inflated budget.

The checked profile is existing v3 `0x190eddca14d88c2af77ea74b7ba257dcb7f9236c1cf7c8002890a992332c485e`. All wrappers passed its unchanged Lean/exporter/NanoDa checks; the exact canonical goal prefixes and hashes are recorded in the catalogue. Do not silently use perf05: that is a distinct zero-axiom/foundation profile and has different commitments. The successful native checks still require genuine registration and resolution certificates for the exact goal/profile before onchain use. Agora's independent catalogue now includes these native-validation statuses: its importer verifies the pinned source hash/profile before labelling a card `passed under v3 (Lean + NanoDa)`. Its ZK status remains `not generated`.

A separate [tnAddZero experiment under the existing perf05 image](../../../implementations/exchange/performance/ix-tn-add-zero-perf05/RESULTS.md) preserved the exact TN/add/theorem source and passed Lean, zero-axiom native checking and real zkVM execution. Its new goalHash is `0x84188c093e8d3058be7042339eebc5e03cac02af07538275ff26f49e70b3291f`; the proof executor used **five segments**. No ZK certificate was generated for it. This separate experiment does not change the v3 catalogue commitments or Agora's imported profile selection.

Published ZK evidence: **no compatible certificate found for these exact three declarations**. Inspection covered the pinned repository tree, official README/proving paths, and official GitHub release metadata (`release-metadata.json`: empty list at retrieval). This is a bounded search, not a proof that no private/unindexed artifact exists. Ix documents how to compile `Tests/MinimalDefs.lean` and prove an environment; that is a recipe, not a downloadable certificate for `myReflEq`. Files called `Certificate.lean` in the source are kernel implementation structures, not ONCM Groth16 receipts. [Ix README at the pinned snapshot](https://github.com/argumentcomputer/ix/blob/4c91254346284dcd984f1940f2c527114b1c5190/README.md).

Ix `.ixe` environments and Aiur/SP1/Zisk proof objects cannot be submitted to the current RISC Zero bridge. Reusing their source needs our normal pipeline. Reusing Ix cryptographic proof objects instead requires a separately specified verifier, statement/dependency binding and governance-installed profile; no such compatibility is assumed here. Existing benchmark proof sizes/timings are discussed in [specialized Lean certificates](../../research/specialized-lean-certificates.md), not extrapolated to these statements.

## Importer contract and current Agora integration

This implements the **materials** side of US-012/US-013 in [user scenarios](../../user-scenarios.md). Agora now has its own copied catalogue and `server/ix-starter.mjs` adapter. It verifies file sizes/SHA256, displays three cards with repository/commit/declaration, custom TN description and independent validation statuses, and fills drafts from `oncmSourcePath`. The coordinator manually imported all three through Agora and opened the first in its Lean workbench; registration remained unavailable without a certificate. See [browser evidence](../../manual-validation.md). Importing does not execute Lean, resolve a market or establish description/goal equivalence by name alone.

The format is portable without cross-app runtime imports, but this document establishes installed Ix UI integration only for Agora; Exchange and Vault integration is not claimed. A future generic remote adapter must pin dependencies and select a complete audited declaration closure; it must not scrape arbitrary theorem lines or execute Ix's entire test harness. For this starter, the reviewed selection is explicit and bounded.

After a successful profile check, the ordinary workflow is: derive canonical goal export and commitment → obtain real registration certificate → verify through original bridge → wallet creates market → liquidity/trading → real proof certificate for the identical goal/profile → wallet resolves. Availability of a proof body does not bypass any step.

## Reproducibility and bounded refresh

`python3 docs/imports/ix-starter/verify_sources.py` checks all pinned local files and exact extraction. With `--restore`, it can restore **missing original files** from the fixed GitHub commit, validating expected byte count/SHA before atomic publication. It never overwrites changed files, executes downloaded code, downloads dependencies, or follows the moving main branch. Limits: 1 MiB/file and 1 MiB/catalogue, 15 s/request.

A new upstream commit intentionally requires a reviewed new snapshot and excerpt/dependency pins. There is no automatic assertion that a changed theorem retains its old statement ID or certificate. Agora's independent source catalogue/import UI and native-status display were added subsequently. The Ix import and native/executor checks did not create a market, change installed profiles/runtime policy, or generate a proving asset.
