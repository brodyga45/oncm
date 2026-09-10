# Package integrity and wallet lifecycle

Implemented 2026-09-10. This is a frontend/source-adapter change, with no profile, verifier, proving policy, chain state or stored history migration.

## Package boundary

`sourceDraft` calls the reusable SDK `validateSourcePackage` before modifying a draft. Ajv 8.20.0 (already installed through Fastify, now pinned explicitly) validates schemaVersion 2 and the fields consumed by the UI. Packages must include `source`, `files`, and a `fileHashes` map covering exactly every file. Every file hash is recomputed as **keccak256 of UTF-8**, matching Agora's existing package export format. Paths must be safe relative paths; package JSON is limited to 16 MiB, source and each file to 512 KiB UTF-8, and all files together to 1 MiB / 64 files. Titles are limited to 180 UTF-8 bytes. Optional `sourceFile` must name the exact source bytes; old schema-2 exports without this field are accepted only when source exactly matches an included file. Optional source hashes and metadata source must agree.

The computed `integrity.sourceHash` identifies the imported bytes. It is **not** `goalHash`, does not run Lean or NanoDa, and does not verify an imported proof. A caller can claim a semantic goal, but the importer never promotes that claim to a registered goal. `sourceDraft.registration` is always null, even when JSON includes registration certificates or result artifacts. The separate Load published JSON → Verify through the actual bridge → wallet submission workflow is unchanged.

Only the server's actual pinned static fixture collection is adapted from its legacy shape. GitHub/Palomar adapters now publish hashes for every retrieved file; the independent Ix adapter retains its prior SHA256 provenance checks and adds the common portable hash envelope. No uploaded JSON receives legacy normalization based on its `id`. The UI only displays the trusted Ix native status when the selected object came from the currently loaded catalogue; caller-supplied validation labels remain explicitly unverified claims.

`GET /api/package/:id` now emits `sourceFile: Statement.lean`. The server changes need to be present in the running API before testing the catalogue against this stricter UI. No API process was restarted by this task. No cross-implementation runtime import was added.

## Wallet boundary

Every UI API call uses an in-memory, tab-local SIWE Bearer token and `credentials: omit`; an ambient cookie cannot silently choose a different wallet. Successful SIWE responses must name the captured signer. Identity invalidation aborts outstanding fetches, advances an epoch for unabortable wallet/file promises, and cancels job-poll timers. Old results cannot restore private state even across account A → B → A. Token revocation uses the captured old token; a late sign-in cannot assign its result to the new account.

Injected `accountsChanged`, `chainChanged`, and `disconnect`, local test-wallet switching, and the explicit **Sign out & clear drafts** button clear the session, private jobs/results, source/proof editors, certificate bindings, shelf/notebook, profile drafts, comment drafts and other unsent forms. A wrong chain or no account leaves the injected wallet unavailable. Returning to a local wallet detaches injected event listeners. The app continues to use the existing SIWE server mechanism.

Transaction helper context assertions surround asynchronous chain checks/simulation/receipt handling, so a subsequent step in a multi-transaction action cannot silently continue after the wallet identity changes. An already submitted transaction cannot be canceled by clearing UI state.

Job lists are filtered to the verified owner and structurally valid entries. Missing, canceled and failed jobs stop polling; a missing job is no longer dereferenced. A succeeded job without a result is an explicit error. The server queue, private authorization and stored history remain unchanged.

## Validation actually performed

27 targeted tests passed:

```sh
node --test tests/source-package.test.mjs tests/wallet-scope.test.mjs \
  tests/wallet-app.test.mjs tests/ix-starter.test.mjs tests/imports.test.mjs \
  tests/published-certificates.test.mjs tests/proof-selection.test.mjs \
  tests/package-artifacts.test.mjs tests/external-certificates.test.mjs
```

The tests cover tampered sources/files/hash coverage, unsafe paths, schema/resource limits, real static/Ix bundles, source-vs-goal separation, no automatic certificate admission, stale responses and signatures, ownerless/foreign/missing jobs, injected event cleanup, and the existing CI case/binding checks. `wallet-app.test.mjs` executes the actual Vue SFC setup handlers with Vue refs, dummy EIP-1193 events, fake timers and HTTP responses; it does not connect to a browser or blockchain. Its binding loader was corrected for Node versions exposing non-identifier CJS namespace keys before the final 27/27 run.

One Vite-only build completed under the reviewed guard:

```sh
/usr/bin/python3 proof/resource-guard.py --memory-mib 1024 --timeout 30 \
  --report /private/tmp/agora-package-wallet-build.json \
  -- node node_modules/vite/bin/vite.js build
```

Whole guarded job: **1.596 s**, peak process-tree physical footprint **351,255,368 bytes (335 MiB)**, exit 0, no cleanup errors. Report: [build-resources.json](evidence/package-wallet/build-resources.json). Rollup emitted ordinary upstream annotation and >500 KB chunk warnings; the main bundle is 522.24 KB / 168.94 KB gzip.

Not performed: browser/injected-extension smoke, real SIWE HTTP session, API restart, native Lean, proof computation, or any transaction. Existing browser NO-cycle evidence and its settlement handoff remain unchanged. Manual follow-up should verify account/network switching during sign-in, a private job poll and a file import, then test a valid and a tampered package through the file picker.

## Later compatible-size correction, 2026-09-10

The generic certificate path already admits source512KiB/title180UTF8bytes. Source packages now preserve these maxima. A16MiB local file envelope covers the existing format's repeated source in source/files/metadata, JSON control-character escaping and pinned descriptor without raising any global HTTP cap. Files remain independently bounded; allocation is not unbounded. The metadata POST alone has a3MiB envelope to preserve an externally accepted2MiB JSON source/provenance input; the global API remains2,000,000bytes and external-certificate route remains3MiB. No remote fetch/dependency installation limit was expanded.

New tests roundtrip full512KiB multibyte source +180-byte title, heavily escaped control text, and reject one multibyte character over either bound. **21/21** combined package/profile/presentation/actual-SFC regressions passed,0.865s/261,922,888Bpeak; final Vite build1.667s/364,101,792B under1GiB. Reports in evidence/final-scope-audit/package-size-*.json. No proof computation.

## Actual portable-package paste roundtrip, 2026-09-10

Create now offers Paste a portable package JSON alongside file import. Both share `applyPackageJSON` and the existing schema/file/source validator, clear certificate readiness, and enforce16MiB UTF8. The paste buffer is private draft state and clears on wallet changes/logout. [Actual browser evidence](evidence/package-reimport/README.md): exact downloaded package restored, changed file hash refused, no certificate accepted, block82 unchanged;15 targeted tests and one bounded Vite build passed.
