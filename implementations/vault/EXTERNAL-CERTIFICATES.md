# Generic external certificates

Vault accepts a new canonical goal under either installed immutable verifier profile, **perf05** or **v3**. It does not compute or order certificates. The four published perf05 buttons remain a separate convenient catalog; generic import never searches that catalog for theorem hashes or derives an outcome from a fixture's name.

## Package and web flow

Prepare a UTF-8 JSON file:

```json
{
  "format": "oncm-external-certificate-bundle-v1",
  "artifact": { "format": "oncm-real-groth16-ci-v1", "...": "complete original certificate record" },
  "goalExport": { "base64": "...", "sha256": "64 lowercase hex characters without 0x", "bytes": 1622 },
  "source": { "text": "optional Lean source", "sha256": "64 lowercase hex characters without 0x" },
  "metadata": { "title": "Author-supplied title", "description": "Author-supplied description" }
}
```

This is the schema illustration, not a usable certificate. Complete real examples are [external-proofs/generic-examples](external-proofs/generic-examples/). They wrap existing CI3/4/5/6 records; they do not claim a newly proved theorem. Optional `source.origin` has exact fields `repository` (HTTPS URL without credentials), `commit` (40 lowercase hex characters), `path` (relative file path), `declaration`. Whole wrapper≤2MiB, decoded goal≤1MiB, source≤512KiB, title≤180 UTF-8 bytes. JSON duplicate decoded keys, invalid Unicode, nonfinite numbers, oversized nesting, noncanonical base64 and trailing certificate ABI bytes are rejected.

**Lean Lab → expected profile → upload/paste → Проверить original EVM и профиль.** The input stays local to the browser; generic verification uses RPC directly. No API body cap was enlarged. Changing input, file, profile or wallet invalidates an earlier response, including changing away and back. After verification, download the exact goal export for independent inspection. Applying registration fills its exact goal/profile/certificate plus provenance metadata; the wallet's create action is separate. Applying outcome1/2 additionally requires the selected open mathematical statement's exact goal/profile, and binds the certificate to that statement ID before the separate wallet action. Existing markets reject duplicate registrations normally.

The trusted mathematical claim is the exact canonical kernel export accepted by the zkVM and committed by SHA-256. A source hash proves only source-byte identity. Generic review and registration metadata explicitly retain **`sourceGoalRelation: not-verified`**; optional Lean text, origin, title, description, CI labels and `evmVerified` flags do not acquire mathematical authority. Source publication remains its existing separate explicit author action and already labels source-to-goal correspondence as unverified. Import does not silently publish the attached source or execute it.

Onchain registration metadata has its own1500-byte limit. The generic form stores goal/source/bundle digests and the digest of the full optional origin, preserving the unverified source relation. The complete origin stays in the uploaded bundle/review; long origin URLs are not silently truncated or pasted into an oversized registry manifest.

## Verification and SDK

```js
const raw = await file.text(); // preserve exact JSON bytes, not parse/stringify
const expected = sdk.supportedExternalProfiles().find(p => p.tag === 'perf05');
const review = await sdk.verifyExternalBundle(raw, expected);
// No signer or transaction is required for this call.
// review.originalVerified and review.bridgeVerified are fresh RPC results.
```

The SDK chooses profile policy from its app-local pinned assets by `artifact.profileId`, also matching the user's expected selection. Uploaded fields cannot select a different image/foundation/manifest. [external-profile-assets.mjs](sdk/external-profile-assets.mjs) is reproducible with `node scripts/build-external-profile-assets.mjs` from the original local profile descriptors/foundation files; this is a small file-generation step, not compilation or proving. There is no neighboring-app or root-tools runtime dependency.

[external-bundle.mjs](sdk/external-bundle.mjs) checks exact foundation bytes, final structural `Oncm.goal` boundary, SHA goal commitment, immutable profile/image, full128-byte journal `(domain,goalHash,profileId,outcome)`, pinned verifier parameters/selector,256/260-byte seals and canonical ABI certificate. Its result alone is explicitly **not verified**. It does not replace NanoDa type checking. The preserved raw string determines `bundleSha256`; object SDK input intentionally hashes its JSON serialization.

[external-certificates.mjs](sdk/external-certificates.mjs) shares the actual EVM path between curated and generic imports: one pinned block, original RISC Zero3.0.0 Solidity verifier with expected selector, actual pairing call, registry manifest equality, bridge immutable image/profile, identical underlying original verifier runtime, then bridge `verifyGoal` or `verify`. A candidate bridge before governance may be inspected but cannot grant admission. Disabling new registrations does not prevent resolution of that profile's existing statements. Unsupported verifier profiles need a reviewed adapter; merely adding a descriptor in an uploaded file does not enable them.

## What was actually validated

- 36 small tests pass: exact bindings, all four real-record transport cases with an empty goal catalog, parser/caps/Unicode/base64/structural-name negatives, source provenance, separate admission/resolution, async file/wallet/profile races and exact raw-byte retention.
- `node scripts/check-generic-external.mjs` uses no signer and no state-changing RPC. It accepted all four genuine wrapped CI certificates through the **original verifier and installed perf05 bridge** at block147, and rejected both a modified seal with recomputed ABI/forged flag and a changed self-consistent goal/journal with an old seal. [Evidence](evidence/generic-external/real-evm.json); start/end head147, no market/financial action.
- The installed v3 manifest/admission were read and matched its pins. **No genuine v3 certificate was available for this check.** Generic import is not evidence that a new theorem has been proved; the imported Ix TN arithmetic goal still requires its externally prepared real certificate.
- The coordinator performs browser import/apply validation separately. Current manual market cycles used the original curated certificates. The test-created generic files are suitable for read-only browser import but should not trigger duplicate market transactions.

The per-app limits deliberately narrow transport below the guest's16MiB maximum. Larger theorem exports require an explicit resource/UI decision; this implementation fails clearly rather than truncating goal or source bytes.
