# Generic externally prepared certificate import

Implemented 2026-09-10. The website still does **not** compute/order proofs. It now accepts externally prepared goals beyond the two curated examples, under either locally supported immutable v3 or perf05 profile. A new profile type still needs a supported adapter and governed bridge; an uploaded descriptor is never authority.

## Format and independent implementation

`oncm-external-certificate-bundle-v1` contains:

```text
artifact: complete oncm-real-groth16-ci-v1 record
goalExport: { base64, sha256, bytes }
source?: { text, sha256, origin?: { repository, commit, path, declaration } }
metadata?: { title, description }
```

SHA256 fields are lowercase 64 hex characters without `0x`; artifact bytes32 fields have `0x`. Decoded goal ≤1 MiB, source ≤512 KiB, serialized wrapper ≤2 MiB. Sources are optional. Origin URLs are HTTPS without credentials; a supplied origin pins a 40-hex commit. Case/profile labels in a generic artifact are provenance, not a theorem or outcome allowlist.

`sdk/external-bundle.mjs` is an independent copy of the common validated parser from the peer implementation. The validation body after `DOMAIN` is byte-identical; only its codec adapter uses the existing viem 2.31.0 and @scure/base 1.2.6 instead of ethers. Exact hashes are in `sdk/external-bundle-provenance.json`. No runtime imports read another app, root docs or tools. @scure/base was already installed transitively; the package/lock now declares the same exact dependency explicitly.

The parser checks canonical base64, byte count/SHA256, exact trusted foundation prefix, structural `Oncm.goal` and final export boundary; strict outer/source/metadata fields; duplicate decoded JSON keys, Unicode/nesting/nonfinite-number limits; exact 128-byte journal and domain/goal/profile/outcome words; original verifier parameters and 260-byte selector+seal; canonical ABI certificate. It labels the result **cryptographicStatus: not-verified**. Passing transport/structure validation alone never accepts a proof.

## Actual verification path

`server/generic-certificates.mjs` selects a profile by artifact profileId from the app's own pinned `proof/manifest.json` or `proof/additional-profiles/perf05/profile.json` and foundation bytes. It checks deployment descriptor SHA256, governed registry manifest hash/bridge address, and actual bridge immutable image/profile. It explicitly calls the original RISC Zero Groth16 verifier through `eth_call`, then the installed immutable bridge's `verifyGoal` or `verify`. A JSON `evmVerified` flag has no effect. There is no goal catalogue lookup.

The route reads selected statement, governed profile and verifier calls at one observed block. Outcome0 is registration; outcomes1/2 require the exact selected open mathematical statement's goal/profile. Disabled new admission is returned as `enabled:false`; it does not invent a disabled-settlement rule absent from AgoraRegistry. Web registration separately rechecks supported profile status and the contract again enforces it at submission. Verification itself does not register, resolve or send any transaction.

`POST /api/certificates/import-bundle` accepts `{bundle,statementId?}` in an encapsulated route with a 3 MiB HTTP envelope limit and duplicate-key parser. The ordinary global API limit remains **2,000,000 bytes**. Wrapper validation inside remains 2 MiB. File/paste imports and SDK string inputs preserve the original JSON string in `bundle`: `bundleSha256` hashes its exact UTF-8 bytes, including whitespace, and `bundleDigestEncoding` is `exact-utf8-json`. SDK object inputs are also supported, explicitly reported as `json-stringify-object`; that digest is not claimed to identify an original file. The original string is validated before any parse/re-serialization can discard duplicate keys. The four unwrapped curated records and existing `/certificates/import` route keep their strict catalogue labels and original behavior. `GET /api/certificate-profiles/:profileId` exposes supported installed/admission status.

## Source semantics and UI

Successful generic import returns **sourceGoalRelation: not-verified**, even when the supplied source SHA256 matches. It is only a file-integrity check; this path does not compile/export the supplied Lean or prove that a human description matches the goal. UI title/description come from supplied metadata or a neutral goal-hash label, never a forced `true`/`false` fixture description. The Create page shows exact goal-export SHA256/size, source SHA and pinned-origin claim separately. If a market is later published, its metadata preserves this provenance distinction; the statement detail calls it “Attached Lean source · unverified rendering”. Source keccak256 used by existing metadata remains distinct from semantic goal SHA256.

User steps:

1. Prepare the genuine compatible certificate outside the website.
2. Create a market → Import external certificate / bundle JSON, or paste its JSON → **Verify & use registration**.
3. Inspect goal/profile/source-status and admission; wallet **Register statement & create market** is a separate action.
4. For settlement, open the matching market → Proof → import/paste bundle → **Verify & load settlement certificate**. The final wallet settlement is separate.

The four published registration/settlement loaders remain available and tested. File-size checks run before reading the file, pasted JSON is bounded before parse, and competing imports/source/JSON/view changes invalidate pending results. Wallet changes and A→B→A market navigation retain their guards. Changed source clears accepted registration; changed certificate JSON clears the old import; changing proof source/outcome clears the prior settlement binding.

## Packaging without computing anything

```sh
node scripts/pack-external-certificate.mjs \
  --artifact proof/additional-profiles/perf05/registration.json \
  --goal proof/additional-profiles/perf05/fixtures/true-goal.ndjson \
  --source proof/additional-profiles/perf05/fixtures/OncmTrue.lean \
  --out /tmp/new-external-bundle.json
```

This bounded helper refuses to overwrite the output, validates transport only and explicitly reports `cryptographicStatus:not-verified`. Optional `--metadata metadata.json` accepts title/description. Use one's own exact externally generated artifact/goal/source paths; it does not generate a certificate, compile Lean or call a blockchain.

## Evidence and remaining boundary

- **32/32** lightweight shared-parser, generic binding, curated-loader and actual SFC handler tests passed: 0.543 s / 205,398,880-byte peak under 1 GiB (`raw-json-test-resources.json`). Actual file/paste handlers preserve whitespace and trailing newline through the HTTP envelope. Final Vite build passed: 1.707 s / 356,384,232-byte peak under 1 GiB (`raw-json-build-resources.json`); existing bundle-size warning remains.
- `evidence/generic-external-import/original-evm-verification.json`: all four genuine perf05 CI artifacts, wrapped with exact goal bytes, were accepted by **actual original verifier + governed bridge**, with `fixtures:{}` and `goals:[]`. The actual API accepted both registrations and the false-refutation for the existing open NO statement. Exact uploaded JSON SHA256 was preserved across all four direct calls and all three API calls. Block stayed **73**, no transaction.
- True-proof direct verification used a deliberately synthetic open statement object to exercise crypto only: the real TRUE market is already resolved. This is explicitly **not** a fresh settlement or new-market scenario.
- A changed, self-consistent new goal/journal retaining the old real seal was rejected by the actual original verifier. A v3-format goal was structurally validated as unverified transport only; there is no claim that a perf05 seal proves v3.
- Dedicated cap evidence: a 2,057,512-byte padded outer envelope passed the dedicated read-only route; >3 MiB returned HTTP413; duplicate API keys rejected. Global cap was not raised.
- Source changes, wrong foundation/boundary, wrong hashes/image/profile/domain/outcome/seal/ABI, unsupported descriptor, disabled admission, resolved/derived/other target, stale file/source/JSON/wallet/ABA state have targeted negative checks. Semantic correspondence is never inferred from source hash.

**Still missing:** a genuine certificate for a new nonfixture theorem (for example the imported Ix goal), and its complete browser registration/settlement cycle. The new route supports that compatible certificate when externally supplied; these tests do not pretend to have produced one. Generic browser form behavior was exercised through actual SFC handlers plus production build, not a newly claimed manual market cycle. Social contracts/content/state were not modified.

Reproduce existing real read-only checks with `node scripts/verify-generic-certificates-readonly.mjs`; it writes only public evidence files and sends `eth_call`/read-only import requests. It checks current local profile/statement availability and verifies block number does not move. No proof computation is performed.
