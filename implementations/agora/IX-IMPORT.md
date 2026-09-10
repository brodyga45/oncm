# Ix starter picker

Agora independently bundles three reviewed Ix source packages in
`imports/ix-starter/`: `myReflEq`, `tnAddZero`, `tnAddSucc`, pinned to official
`argumentcomputer/ix` commit `4c91254346284dcd984f1940f2c527114b1c5190`.
The first uses standard Lean Nat. The other two use the custom Peano `TN`
inductive defined in Ix's tutorial; they are not Mathlib imports.

The bundle includes the exact catalogue, original source/dependency snapshots,
generated Oncm wrappers, extraction source files and both upstream licenses.
Its catalogue hashes are checked before `/api/fixtures` offers any source.
The original tutorial contains intentional negative kernel tests; only the
reviewed minimal extracted source/wrapper is used as the draft. The full
original remains provenance material, never an automatically executed import.
No runtime reads from root docs/tools or another implementation are required.

## Web steps

1. Reload `http://127.0.0.1:5171/` to refresh the fixture list.
2. Choose **Create a market**, then scroll to **Import an existing formalization**.
3. Review one of the three **Ix · …** cards, its full commit and exact upstream
   declaration link. The card explicitly shows `imported-source`, native
   validation **passed under v3 (Lean + NanoDa)**, ZK **not generated**.
4. Click **Import Ix source draft ↗**. The existing create form receives the
   title, description, exact standalone Oncm source and provenance. An imported
   source has no registration certificate and cannot create a market yet.
5. **Open this draft in Lean workbench** opens the same editable source. The
   existing **Run Lean check** action remains an explicit user action. It was
   not executed by this UI integration. A separately authorized sequential
   native validation has now passed for all three exact sources; the earlier
   guard failure and successful repaired-guard reports are both preserved.

The import itself executes no Lean, prover, dependency installer or transaction.
Subsequent registration still requires an admitted profile and a real
registration certificate. The initial candidate is the existing v3 runtime;
perf05 certificates and market workflow are unchanged.

## Implementation and validation

`server/ix-starter.mjs` adapts the local verified catalogue into the existing
`/api/fixtures` response; that endpoint now returns two existing fixtures plus
three Ix source drafts. `src/import-draft.mjs` keeps a catalogue ID distinct
from a runner fixture ID, so a native check uses the imported source rather
than failing an unknown-built-in-fixture lookup. A source-only package cannot
smuggle a registration certificate into the form. Its provenance and files
are preserved by the existing metadata/package path.

10/10 lightweight tests passed: independent bundle loading, modified-source
rejection, source-only status and draft semantics, existing snapshot import,
and perf05 certificate/navigation regressions. The copied bundle also loaded
from a fresh temporary app root with no parent runtime resources.

Read-only live API check: five fixtures total, three Ix drafts; Oncm source
sizes197/493/636bytes; health31371 block28. No fixture had a certificate or
preclaimed goal commitment. Node watch loaded the API change without an
explicit restart. Vite build passed under1GiB/30s guard:1.350s,
peak280,734,096bytes (~267.7MiB). Reports are
`/private/tmp/agora-ix-picker-http-validation.json` and
`/private/tmp/agora-ix-picker-vite-resources.json`.

Follow-up evidence (2026-09-10): root manually imported **all three** Ix cards
in the browser and opened the first source in the Lean workbench. Exact source
and provenance matched; registration stayed disabled; no job/transaction was
created and the chain remained at block28 during this import smoke.

After the reviewed guard repair, all three exact source wrappers passed the
existing root v3 Lean/exporter/NanoDa checks, sequentially under1GiB/5s:
3.731s/117.914MiB,1.380s/122.835MiB,1.410s/129.133MiB. The independent Agora
catalogue and evidence have now been synchronized; no runtime dependency on
the root remains. API/UI status is `passed-v3`, attached to the imported
snapshot, with its v3 profile and exact goal hash. ZK remains `not-generated`,
registrationCertificate remains absent, and onchain status remains
`not-submitted`. These statuses never enable preregistration or settlement.

The status sync passed the updated small tests; the running API reports all
three native successes and absent certificates. No native/prover rerun or
chain action occurred during synchronization. Subsequent editing of a draft
requires its own check; the displayed label refers to the original snapshot.
