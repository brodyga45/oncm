# Additional perf05 profile and external certificates

Added 2026-09-10. This is an additional immutable **zero-axiom logic profile**.
The existing v3 profile remains the default local runner and remains enabled.
perf05 does not relabel the Nat arithmetic profile or claim its compatibility.

## Exact identities and local deployment

| Field | Value |
| --- | --- |
| Chain | Agora31371, RPC127.0.0.1:9545 |
| Existing v3 profile | `0x190eddca14d88c2af77ea74b7ba257dcb7f9236c1cf7c8002890a992332c485e` |
| perf05 profile | `0x93cf174539debc6ddce2691f3def1e36023cf77fe1d93f1692f330150bd37e10` |
| perf05 image | `0x296fb3bbf5eb7df9fb7115826df31c71411ee0f8153970c7618c76ab01539feb` |
| New immutable bridge | `0xc6e7df5e7b4f2a278906862b61205850344d4e7d` |
| Profile manifest SHA256 | `0xb2688e6decdefc2b98bfbe0db987d7c16d3c61dd10fe7b4a226deedde11e35d0` |
| Registry target | `0x8a791620dd6260079bf849dc5567adc3f2fdc318` |
| Bridge deployment | block28, tx`0xf16e3c39f510691b2d29d9366f41f5d96d0276367ce7a09e02098e066e98cfab` |
| Imported registration goal | `0x2baf8be8fc5ecd150cd5b5086b52c4f2591d407093d4f6b77f767afc1c113f4b` |

The source is `∀ P : Prop, P → P`; the exact file and SHA256 goal export live in
`proof/additional-profiles/perf05/fixtures/`. The profile has no permitted axioms,
no Nat/String extension, and a distinct foundation. Files and the historical CI
descriptor are pinned by `bundle-pins.json`; its packaging-time status is not
used as current verification evidence. `registration.json` is the actual CI3
artifact (run34416918326, source commit d79a177f4c162eefe9e6e197fdafad09b9ab5a8d).

All required runtime files are inside this implementation. There are **no
runtime reads of root docs, root tools, Exchange or Vault**. No prover binary or
new mathematical checker was installed. User-provided CI JSON supplies future
settlement certificates.

## Root browser steps

1. Refresh Agora5171, open **Create a market**, scroll to **Import an externally
   generated certificate**. Click **Prepare governance installation**. This
   fills a proposal; it does not publish or sign it.
2. In Governance, review profile/verifier/manifest, click **Create proposal**.
   Sign with both existing council roles; **Schedule via Safe**, wait for the
   existing Timelock, then **Execute**. This calls only `configureProfile` for
   the new ID. There is no `setProfileEnabled(v3,false)` call.
3. Return to Create and **Refresh profile status**. Click **Verify published
   perf05 registration**. The API verifies the original bridge and loads the
   exact pinned source, explicit new profile and registration certificate.
4. Set title/description/funding, then **Register statement & create market**.
   Creation is disabled before profile installation. Approvals/funding use the
   existing browser wallet path. No script has created a market for this smoke.
5. When CI true-proof JSON is available, open that market → Proof → **Verify
   imported CI proof JSON**, or paste JSON under the external artifact details.
   The API checks the selected open statement's goal/profile and the certificate
   outcome; then the UI loads its hex and side. **Verify & settle onchain** is a
   separate wallet transaction. Registration outcome0 cannot settle a market.

An import does not modify onchain state. The manual hex settlement path remains
available and the actual contract verifies it. As of 2026-09-10 the website has
no certificate-generation actions for any profile. Users prepare certificates
externally. The optional native check remains v3-only; API/CLI/history are retained.

Exact governance calldata prepared for step2:

```text
0x6ce9535993cf174539debc6ddce2691f3def1e36023cf77fe1d93f1692f330150bd37e10000000000000000000000000c6e7df5e7b4f2a278906862b61205850344d4e7db2688e6decdefc2b98bfbe0db987d7c16d3c61dd10fe7b4a226deedde11e35d0
```

For a fresh independent Agora deployment, after its normal proof artifacts are
installed, run `node scripts/prepare-additional-profile.mjs` once. It deploys
only the unchanged compiled `LeanProofBridge` with new immutable image/profile,
checks the genuine registration, writes `.local/additional-profile.json`, and
stops before governance. It refuses accidental duplicate deployment. The older
`install-proof.mjs` replacement/retirement script is deliberately not used.

## SDK/API and validation boundaries

SDK `additionalProfile()` returns deployment/chain-enabled state and pinned
fixtures. `importCertificate(artifact, statementId?)` calls
`POST /api/certificates/import`; statementId is required for outcome1/2.
Then use existing `registerGoal`, `createPool`, `provideLiquidity` or `submitProof`.

Format: `oncm-real-groth16-ci-v1` with profileId, imageId, goalHash, numeric outcome,
journal, evmSeal and ABI certificate. `evmVerified`/status flags are ignored.
`server/external-certificates.mjs` checks canonical ABI re-encoding, fixed
260-byte seal/128-byte journal, domain/goal/profile/outcome agreement, exact
locally pinned goal exports/source, immutable onchain image/profile getters,
then `verifyGoal` or `verify` on the original bridge. The bridge invokes its
original RISC Zero Groth16 verifier. Unsupported goals are rejected explicitly;
this bounded import is not automatic support for every externally written Lean file.

Completed checks:

- 3/3 lightweight tests: true artifact/fixture binding, edited profile/image/goal/
 outcome/journal/ABI rejection, fake success flags do not bypass verifier call.
- Real HTTP import: original certificate200 `verified-external`; wrong profile400;
 changed journal400; canonically encoded altered seal with claimed success400
 **Original onchain LeanProofBridge rejected the certificate**.
- Actual deployment script `verifyGoal` PASS. Read-only registry check after
 deployment: v3 enabled true, perf05 not installed/false. No market created.
- Vite build PASS under1GiB/30s shared guard:1.471s, peak290,760,984bytes
 (~277.3MiB). Syntax checks PASS. Active local proof jobs0; expensive policy false.

Not yet completed by this task: manual governance activation, browser market
creation/trading/funding, genuine perf05 proof submission or redemption. Root
owns those steps and their transaction journal. There was no local heavy proof,
chain reset, governance bypass or paid proving integration.

### Import review fixes (2026-09-10)

The false fixture now describes its actual goal `∀ P : Prop, P`, with refutation
explained separately; it is not labelled as the different proposition `False`.
Selecting/reopening a market clears the certificate editor and its binding.
External import/file-read requests and local proof-result polling carry a
selection epoch, so A→B→A navigation or a later competing import invalidates an
older result. Submission checks the imported statement/goal/profile/outcome and
certificate binding again. A manually supplied certificate still goes through
the contract's normal cryptographic verification.

CI import additionally requires the `perf05` tag, `Groth16` receipt kind,
fixture/outcome-specific case (`false-refutation` for outcome2), exact RISC Zero
verifier parameters, and raw256-byte seal plus the expected selector. These
metadata checks supplement the unchanged original bridge verification.

Validation:7/7 small tests passed (canonical envelope, failed fake verification,
navigation/concurrent requests, submission binding). The running API accepted
the real registration artifact200 and rejected changed case/rawSeal400.
Vite build passed under1GiB guard:1.648s, peak281,225,280bytes (~268.2MiB).
Reports: `/private/tmp/agora-import-race-http-validation.json` and
`/private/tmp/agora-import-race-vite-resources.json`. The node watch process
loaded the API change; no restart, chain transaction, profile change or local
proving was needed. Browser reproduction of the navigation race is not claimed
by these automated checks.

### Four published CI artifacts: explicit Load → Verify → wallet

The independent Agora bundle now contains all four genuine CI JSON artifacts:
`registration.json` (true-registration), `false-registration.json`,
`true-proof.json`, `false-refutation.json`. Exact filenames, case/outcome,
goal/profile and SHA256 pins live in `published-certificates.json`.
`server/published-certificates.mjs` allowlists those four IDs/filenames and
checks pins/envelope bindings before returning JSON. It does not run a prover,
call the verifier, preaccept a proof or submit a transaction.

Current registration UI steps (supersede the older one-click published
registration shortcut): **Create a market → Import an externally generated
certificate → PUBLISHED CI REGISTRATION**. Choose either
**Register ∀ P : Prop, P → P** or **Register ∀ P : Prop, P**, then click
**Load published registration JSON**. The expanded review field receives the
artifact. Click **Verify & use registration** for the existing original-bridge
verification, then use the ordinary wallet registration/create flow.

For settlement: market **Proof → PUBLISHED CI SETTLEMENT**, choose
**Prove ∀ P : Prop, P → P (TRUE)** or **Refute ∀ P : Prop, P (FALSE)**, then
**Load published settlement JSON → Verify & load settlement certificate →
Verify & settle onchain**. Choices for a different selected goal/profile are
disabled. Navigation resets the choice. Loading clears the previous accepted
certificate so it cannot be mistaken for the newly loaded, unverified JSON.
Existing server canonical checks, onchain verification and selection binding
remain required. This path avoids browser file-upload permissions while
retaining separate explicit user actions.

Validation:9/9 lightweight tests passed (four exact cases, wrong-case/goal
rejection, altered pinned file/catalog rejection, allowlist rejection, and
existing certificate/selection regressions). Read-only live GETs for all four
returned200 `loaded-unverified`; an unknown ID returned400. No verifier call
or transaction was performed by those reads. Final Vite build passed under
1GiB/30s guard:1.484s, peak304,031,712bytes (~289.9MiB), no cleanup errors.
Reports: `/private/tmp/agora-published-certificate-http-validation.json` and
`/private/tmp/agora-published-certificate-vite-resources.json`.

The earlier genuine CI verification remains separate evidence; a UI load
does not rely on an artifact's success flag. Parent-owned manual browser
registration/settlement through these new selectors is not yet claimed by
this implementation check. No explicit API restart, local proving, chain
mutation or new paid service was used.
