# Additional immutable profiles and external certificates

Exchange keeps v3 as its arithmetic profile. `perf05` is an additional zero-axiom Lean logic profile, not a rename of v3. Exact source metadata, Lean files, canonical goal/proof exports and four genuine CI certificates are bundled under `proof/profiles/perf05/`. Runtime use has no dependency on sibling applications, `../../tools`, or `../../docs`.

The website does not order or generate certificates. Users prepare them externally and explicitly load, verify and submit them. Optional native **Check Lean only** supports the existing v3 runtime and produces no settlement certificate; perf05 disables that local check. API/CLI job interfaces and history remain intact, with expensive local proving disabled.

The bundled manifest retains its historical preparation status. Current profile availability is read from the chain, and cryptographic acceptance is checked live. The profile ID and guest image are immutable.

## Install without changing v3

`node scripts/prepare-additional-profile.mjs` deploys only the existing `LeanProofBridge` artifact with perf05 image/profile constructor arguments on Exchange chain 31372 / RPC 9546. It does not propose, vote, queue, execute, retire v3 or create a market. Re-running reuses the recorded bridge. `data/additional-proof-profiles.json` contains the exact installation target, value 0, calldata, description, profile ID, verifier and manifest commitment.

In Governance, inspect those fields, encode `addProfile`, then propose, vote, queue and execute through the original Governor/Timelock. The proposal preserves v3 availability. The app reads the current registry state independently of the saved preparation-time status.

## Four published artifacts

| Button | Standalone certificate file | Exact use |
| --- | --- | --- |
| True goal registration · CI3 | `proof/profiles/perf05/certificates/true-registration.json` | Outcome 0, well-formedness of `∀ P : Prop, P → P` |
| False goal registration · CI5 | `proof/profiles/perf05/certificates/false-registration.json` | Outcome 0, well-formedness of `∀ P : Prop, P` |
| YES proof · CI4 | `proof/profiles/perf05/certificates/true-proof.json` | Outcome 1, proof of the exact True goal |
| NO refutation · CI6 | `proof/profiles/perf05/certificates/false-refutation.json` | Outcome 2, refutation of the exact False goal |

`web/published-certificates.mjs` includes these immutable public JSON files in the web bundle. All four loaders therefore work without a file-picker permission or API catalog reload. Loading fills the JSON field only; it is neither cryptographic acceptance nor a transaction. The existing legacy API certificate download allowlist is unchanged and is not the source of these four buttons.

## Register either goal

1. Connect a wallet to the Exchange local chain and open **Create market**.
2. Select **Lean logic · perf05 · zero axioms**. Refresh onchain availability if governance has just changed it.
3. Click **Load published True goal registration · CI3** or **Load published False goal registration · CI5**. Alternatively paste or upload the complete external JSON. Click **Verify pasted registration certificate** separately.
4. The curated importer checks `format=oncm-real-groth16-ci-v1`, Groth16 kind, exact pinned image/profile, outcome 0, full 128-byte journal, raw 256-byte seal, 260-byte EVM seal with selector `73c457ba`, and canonical ABI `(bytes seal, bytes journal)`. The economic binding is the exact goal/profile/outcome; a descriptive `case` label is not the proof authority. It calls the selected immutable bridge's `verifyGoal` by `eth_call`; uploaded verification flags are not authority.
5. The exact package is selected by profile + goal hash, and SHA256 of its canonical export is recomputed. Displayed source is package metadata; the canonical export is the economic commitment. Inspect the selected goal and observed verification block.
6. Click **Create market onchain**. This wallet transaction repeats the registry's availability and certificate checks. A registration certificate cannot settle a market.

## Resolve YES or NO

Open the corresponding market → **Proof lab**. Choose YES for the True goal or NO for the False goal. The matching **Load published YES proof · CI4** or **Load published NO refutation · CI6** button appears only for the exact selected goal/profile/outcome. Paste or upload remains available for externally supplied JSON. Then click **Verify pasted proof certificate**, review the binding, and separately click **Submit external proof onchain**.

Verification calls `bridge.verify(statementId, goal, profile, outcome, certificate)` through `eth_call`; submission is the real registry transaction. Registration artifacts, crossed goals/outcomes, and a different profile are rejected. Editing import text or changing the goal, profile, outcome or wallet invalidates prior readiness. Delayed file/verification responses are bound to the current selection and cannot restore an older certificate. Final submit rechecks the canonical journal binding before asking for a transaction; the actual registry remains the cryptographic authority.

SDK: `sdk.verifyExternalCertificate(artifact, trustedCatalogProfile, {outcome: 0})` for registration; use `{statementId, goalHash, profileId, outcome: 1|2}` for resolution. `fixtureForCertificate(catalog.fixtures, binding)` selects and validates the exact canonical package. `createMath(...)` and `resolve(...)` send normal registry transactions. `decodeExternalCertificate` and `assertCertificateClaim` validate transport/binding only; neither replaces original EVM verification.

## Validation boundary

`node --test tests/published-certificates.test.mjs tests/proof-import.test.mjs tests/proof-import-state.test.mjs`: **24/24 PASS**. These offline tests use genuine bundled artifact bytes and cover both registrations, proof/refutation separation, canonical goal/hash binding, wrong profile/goal/outcome, malformed certificate encoding, async selection tickets, and the check-only frontend gate. They do not claim a fresh EVM or browser pass. The latest bounded Vite build passed; measurements and historical read-only EVM checks are in [VALIDATION.md](VALIDATION.md).

## Generic exact-export bundles

The same paste/upload controls now accept `oncm-external-certificate-bundle-v1`. This path does not call `fixtureForCertificate` or require either demonstration goal. Its trusted policies and foundation bytes come from standalone app files materialized in `sdk/external-profile-assets.mjs`; an uploaded binary, manifest, verifier address or profile definition cannot become trusted policy. The two supported policies are the existing v3 and perf05 immutable profiles. A different profile requires explicit policy integration and governance admission.

Required fields are `format`, `artifact` (the original Groth16 certificate record) and `goalExport: {base64, sha256, bytes}`. Optional `source` contains text, its SHA-256 and repository provenance; optional `metadata` contains a title/description. SHA-256 fields in the export/source objects are lowercase hex without `0x`. The parser enforces canonical Base64, exact byte lengths and hashes, structural `Oncm.goal` binding, the selected profile's exact foundation prefix, the complete 128-byte journal and canonical certificate ABI. Limits are 2 MiB for the wrapper, 1 MiB for goal export and 512 KiB for source. Duplicate JSON keys and malformed encodings are rejected. See `sdk/external-bundle.mjs` for the complete transport contract.

Verification then runs the original Groth16 `verify` on the seal, image ID and journal digest and calls the registered immutable bridge. All contract views use the same numbered block. The selected bridge must have the exact image/profile and pinned manifest, and its underlying verifier runtime must match the deployed original verifier. This relies on the application's recorded original deployment and the registry's authorized verifier policy, rather than a verifier supplied by the uploader. Registration and resolution availability are read separately from the registry. Neither a JSON `verified` flag nor the package API replaces these checks.

The economic statement is the certified canonical kernel export. **Source, title, description and repository origin are not certified as a semantic description of that export.** The review displays this distinction, the exact goal/profile, original verifier and observation block, and lets the user download the canonical export. A goal-only bundle is allowed; the app does not invent Lean source. Arbitrary dependency closure, Lean source rebuilding and website certificate generation are outside this import path.

For a new market: choose the matching profile → paste/upload bundle → **Verify pasted registration certificate** → inspect canonical export and the source warning → **Create market onchain**. The explicit create action may publish exactly the source/export/certificate submitted in that form; it never reads private jobs to fill a public package. Public API validation is labelled `binding-only-not-EVM-verification`. A registration artifact must have outcome 0.

For settlement: choose the registered market and YES/NO → paste/upload its proof/refutation bundle → verify → submit separately. The selected statement ID, goal, profile and outcome remain bound through asynchronous file reading, verification and final transaction preparation. Editing inputs or changing wallet/selection invalidates readiness. The registry repeats verification during the actual transaction.

Downloaded `exchange-lean-package-v1` files take a separate draft-adoption path. Declared source/file hashes and generic export/profile/certificate binding are checked, but the saved registration certificate does not restore readiness. The original artifact is placed in the verification field for a fresh explicit Verify action. Exact imported files/provenance are retained only if the subsequent verification has the same source, goal and profile. Every imported package, including legacy source-only drafts, is labelled `sourceGoalRelation: not-verified`. Old private job results are not implicitly published with the new form.

SDK: `await sdk.verifyExternalBundle(rawJSON, {profileId, outcome: 0})`; for settlement include `{statementId, goalHash, profileId, outcome: 1|2}`. Preserve raw input if the exact bundle-byte digest matters. `inspectExternalBundle` checks transport only; its result deliberately says `cryptographicStatus: not-verified` until the SDK performs the original and bridge EVM checks.

Four ready-to-paste public examples are in [docs/evidence/generic-external](docs/evidence/generic-external): True/False registration and YES/NO settlement, wrapping the unchanged genuine CI artifacts. Their presence is convenience, not an acceptance allowlist. Targeted tests passed **19/19**; live read-only checks accepted all four and rejected a changed seal and a changed export/journal with the old seal at block201. This is actual cryptographic validation of those examples, not evidence of a newly generated proof for a third theorem. Browser validation is recorded separately in [VALIDATION.md](VALIDATION.md).
