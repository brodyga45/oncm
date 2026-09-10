# Proof job scheduler and access control

The live API uses its own copy of the bounded scheduler and worker adapter in
`api/proof-jobs.mjs` and `api/proof-worker.mjs`. It has no runtime import from
Agora, Vault, or a shared application service. The scheduler reuses MIT
[p-queue 8.1.0](https://github.com/sindresorhus/p-queue/tree/v8.1.0), pinned in the
application lockfile.

New proof jobs require the existing wallet/SIWE session. Source, diagnostics,
results and cancellation are restricted to the verified owner; body fields
cannot select the owner. The existing frontend signs in through its original
SIWE flow, supplies the bearer token to submit/poll/cancel, and clears job display
and polling when the connected wallet changes. A session expiring before submit
prompts that same sign-in flow again. There is no separate identity mechanism.

Historical ownerless records remain on disk and keep their original fields.
After authentication, they are returned with `legacyOwnerless: true`, so they
cannot be mistaken for previously private wallet records. Their original API
was publicly readable by job ID. They cannot be cancelled or claimed by a wallet.
New owned records are never returned to another wallet, even with a known ID.

## Resource behavior

- One executing job per API, at most 16 active/pending jobs, at most 4 per verified wallet.
- An identical pending/running request from the same wallet returns the existing
  job ID. Distinct wallets have distinct jobs.
- Existing UI `status: Running` remains while waiting/executing/cleaning up;
  `phase` adds `queued`, `executing`, `cancelling`. Existing completion statuses
  `checked`/`proved` remain unchanged. Cancel produces `Cancelled` after cleanup.
- `job.input`, including source, and the full old history are preserved.
  On restart, unfinished historical jobs become `Failed`/`interrupted`; they
  are not automatically relaunched. A subsequent completion no longer overwrites
  the entire saved history with only this API process's new jobs.
- The API runs its worker through an **outer** macOS supervisor: tree footprint
  2 GiB, wall-time budgets check 5 s, registration 30 s, proof 120 s.
- The outer supervisor does **not** take a lock. Existing inner guards retain
  the single `oncm-worker-UID.lock`; no nested acquisition of that lock occurs.
- Queue timeout/cancel never frees an executing slot before supervisor close.
  Output buffering is capped at 2 MB, diagnostics at 50 KB.
- `RAYON_NUM_THREADS=2` and `GOMAXPROCS=2` limit those runtime pools; these are not
  claims of a kernel-enforced total OS-thread cap. The 100 ms memory watchdog can
  briefly overshoot between samples; it is not a kernel hard memory limit.
- Resource reports are in `data/proof-resource-reports/`. Expensive proving stays
  disabled by the unchanged `proof/execution-policy.local.json`.

No fast cryptographic cache has been added to the live API. Existing runner
receipt verification and immutable onchain proof profile remain unchanged.
Cold registration/proof speed targets have not been achieved or claimed here.

## Checks performed

`node --test tests/proof-jobs.test.mjs tests/proof-worker.test.mjs`: **7/7 passing**,
1.11 seconds in the recorded run. Five HTTP tests use an ephemeral Express API
with the same production routes, a test session provider and small mocked workers.
They cover owner dedupe, status/input preservation, 401/404 ownership rejection,
per-owner/global 429 admission limits, queued cancellation, wait-for-cleanup,
old-history retention, no auto-resume, input size bounds, and body-owner rejection.

Two tests run the actual API worker adapter and actual supervisor with tiny dummy
Node processes. They check threads=2, measured footprint below 100 MiB, and a
completed cancellation report before the cancellation Promise settles. Neither
Lean nor a prover is invoked.

`node tests/api-smoke.mjs`: **7/7 passing** against the live API after restart.
Includes real SIWE signature and nonce consumption, authenticated unsupported
target rejection **before a proof process starts**, chain reads, package roundtrip,
and live commit-pinned Palomar import. `data/api-test-report.json` records this run.

`npm run build`: passes, 1.88 seconds; existing SIWE bundle-size advisory remains.
Both API modules pass `node --check`.

Only the idle API listener was restarted, after checking that it had no proof
workers. The blockchain and Vite process stayed running. Live checks afterwards:

```json
{"unauthenticatedSubmit":401,"unauthenticatedRead":401,"observedBlock":112,"marketCount":0}
```

No proof jobs were generated and no blockchain transactions were submitted by
these scheduler checks. Browser verification of the new sign-in/cancel wiring
and real proof performance measurements are still required separately.

## External perf05 certificates: CI3 registration and CI4 true proof

The standalone Exchange bundle now includes the exact reviewed CI4 artifact at
`proof/profiles/perf05/certificates/true-proof.json` (5,199 bytes, SHA256
`65a54ad884fad55139b830cbeb83f551191c1d954382036c03a5006b3c5683b1`).
It proves outcome 1 under the distinct zero-axiom perf05 profile. It is not a v3
certificate. The existing CI3 artifact remains the separate outcome-0 registration
certificate for the same canonical goal.

`node --test tests/proof-import.test.mjs tests/proof-import-state.test.mjs`:
**19/19 passed**. Coverage includes exact image/profile/goal/outcome/ABI binding,
mutated artifact rejection, wrong-purpose registration/proof rejection, and
pending verification invalidation across A → B → A navigation, outcome/wallet
changes, unmount and overlapping imports. An ordinary unchanged-form rerender
preserves the pending verification. `npm run build`: passed (1.67 seconds).

`node tests/proof-import-live.mjs`: **PASS**, read-only at Exchange block 122.
The actual immutable bridge `0xCace1b78160AE76398F486c8a18044da0d66d86D`
accepted both genuine artifacts and rejected a coherently ABI-encoded mutated
seal. Existing v3 remained enabled. At that observation perf05 was not yet
installed in the registry, so readiness to create was correctly false.

HTTP reads after reloading the idle API only: both allowlisted certificate
routes return 200 with the exact stored artifact, an unknown case returns 404.
No blockchain transaction or proof job was run for these checks. The API reload
does not reset the chain or stored data; the API's in-memory SIWE sessions reset.

The Proof lab button **Load published YES certificate · CI4** only fills the
JSON field. The user separately clicks **Verify pasted proof certificate** and
**3 · Submit proof onchain**. Actual Governor installation, browser market
creation, LP/trading and final settlement are separate root-owned browser QA;
these read-only checks do not claim those scenarios have completed.
# Governance and injected-wallet lifecycle correction — 2026-09-10

This entry is code/targeted-test evidence. No browser action, RPC read or write, transaction, mining, API/chain restart, profile/deployment change or prover was performed for this correction. Coordinator-owned earlier market/governance receipts remain unchanged. Browser retesting of these new controls is still required.

- `sdk/governance.mjs` reads original Governor/Timelock/token at one explicit block tag, including actual ETA, quorum, historical snapshot weight, current delegated weight, `hasVoted`, proposer threshold/checkpoint and settings. Future/current historical checkpoints remain unknown instead of being queried or displayed as zero. Quorum uses For + Abstain. `ProposalCreated` ordered targets/values/calldatas are checked against `hashProposal`, with ABI decoding only for known targets.
- `web/main.jsx Governance` displays this SDK snapshot directly; the older API list is unchanged and is no longer the source of this page. Vote/queue/execute/pending-proposer-cancel availability includes a full original Governor `eth_call` from the selected wallet. Execute before ETA, a duplicate vote or missing snapshot weight has an explicit reason and disabled button. Action submission obtains another current snapshot. These views are UI preflight; actual contracts remain authoritative. Existing SDK batches are reviewed exactly; this composer and Execute send zero additional native ETH.
- The existing devnet helper now has **Mine 1 block** alongside Mine 14. The UI explains that 14 may skip Active. Timelock advancement uses its actual configured delay + 1 second. The helper checks the actual provider chain is31372 and bounded integer steps before calling the unchanged local endpoint. No helper was invoked during this change.
- `web/wallet-lifecycle.mjs` gives signer/SIWE/private forms/SDK continuations a generation. Injected `accountsChanged`, `chainChanged`, `disconnect`, explicit disconnection or SIWE logout revoke the old bearer token and clear private drafts/modal state, proof forms/tickets, transaction notifications and loading/errors. Logout retains the connected signer with a new generation. Injected changes require an explicit reconnect and never auto-sign. Intentionally switching chains while connecting is followed by exact final chain/account validation.
- Late nonce/signature/verification replies cannot authenticate the old identity. A server session returned after logout is revoked, not installed. Old SDK calls fail before/after an awaited network check, preventing the next transaction leg after wallet change; an already broadcast transaction is not reversed. Remounting the private component subtree disposes existing proof-import/job generations, while local job history remains server-side. A late sign-in cannot start an old unmounted proof form's job. Normal unchanged deployment refresh now preserves SDK identity.

Executed from this independent folder:

```sh
node --test tests/governance-review.test.mjs tests/wallet-lifecycle.test.mjs tests/proof-import-state.test.mjs
```

**19/19 PASS, 171.887ms.** Tests cover actual generated ABI method availability; same-block orchestration; unknown checkpoints; value/ordered payload binding; quorum/ETA/vote eligibility and rejected execution simulation; wrong-network refusal; wallet event cleanup; A→B→A/logout; delayed nonce/signature/SIWE response; mismatched principal revocation; and no SDK broadcast after identity changes during network lookup. Simulated views and signatures in these unit tests are explicitly not browser or onchain success claims.

First bounded production build was stopped cleanly by the512MiB outer guard at567,018,456B after2.339s. Its report is `data/governance-wallet-build-resources.json`, reason `memory-limit`, exit125, no cleanup errors. This was a Vite build, not proof generation. One failure-driven retry bounded the V8 heap to256MiB with768MiB outer limit/30s:

```sh
python3 proof/resource-guard.py --memory-mib 768 --timeout 30 --report data/governance-wallet-build-retry-resources.json -- node --max-old-space-size=256 node_modules/vite/bin/vite.js build
```

**PASS:** Vite2.04s; measured tree499,047,232B (475.93MiB), guard2.340s, exit0, no cleanup errors. Existing SIWE chunk-size warning remains. Reports preserve both attempts. Expensive proving remains disabled; no local cryptographic workload was started.

Next manual verification: reopen the real proposal and inspect historical votes/ETA/quorum; confirm Mine1 can enter Active, already-voted/too-early actions are unavailable; connect injected wallet, change account/network, reject or delay SIWE, log out/reconnect and check private forms remain cleared. Only the coordinator should perform any desired new governance transactions.


## Website scope: externally prepared certificates, four published loaders

The user explicitly deferred ordering/generating certificates from the website. Create and Proof lab now offer optional native **Check Lean only** plus external load/import, verification and wallet submission. A frontend action gate rejects register/prove/prepare jobs; existing API/CLI endpoints, private job history, cancellation and disabled expensive-proving policy are unchanged. The proposed native-prepare expansion was stopped before any source/binary change or computation.

All four original perf05 JSON artifacts are bundled into the standalone frontend: CI3 True registration, CI5 False registration, CI4 YES proof, CI6 NO refutation. Load fills JSON only. Original bridge verification and the registry transaction remain separate. The loaders do not depend on the legacy API download allowlist or browser file permissions. Selecting another profile/goal/outcome or editing import input clears previous readiness; delayed file/verification replies carry a selection ticket. Submit asserts the exact full journal binding before a wallet request. This additional shape check is not a replacement verifier.

```sh
node --test tests/published-certificates.test.mjs tests/proof-import.test.mjs tests/proof-import-state.test.mjs
```

**24/24 PASS, 202.976333ms.** New tests exercise both genuine registration packages and their distinct canonical hashes; exact YES/NO settlement; phase/profile/goal/outcome rejection; artifact clone isolation; malformed/trailing ABI rejection; and the frontend check-only gate. These are offline source/binding tests, not new cryptographic or browser acceptance evidence.

One bounded production build:

```sh
python3 proof/resource-guard.py --memory-mib 768 --timeout 30 --report data/external-certificate-scope-build-resources.json -- node --max-old-space-size=256 node_modules/vite/bin/vite.js build
```

**PASS:** Vite 2.22s; supervisor wall 2.558s; sampled process-tree physical footprint peak **493,902,680 bytes (471.02 MiB)**; exit 0; no cleanup errors. The existing SIWE chunk-size warning remains. This pass made no chain mutation, API restart, native Lean execution or proof job. The four updated button workflows still require their own manual browser evidence; tests/build are not presented as that evidence.

## Full onchain social deployment and browser QA — 2026-09-10

This supersedes the earlier offchain profile/comment implementation and its5 historical API tests. Current original OSS pins, bytecode sizes, ownership/fees, ABI/event semantics and bounds are in [ONCHAIN-SOCIAL.md](ONCHAIN-SOCIAL.md).

Original ECP and an immutable Exchange hook were deployed additively to the existing Shanghai chain31372 in144–157. Registry, T balances/supply, pool reserves/supply, fee recipients and economic bytecode hashes were unchanged at143 versus157; native gas balances changed normally. All original ECP fee settings were set0, both manager owners renounced, and the application channel NFT locked in the hook. Exact receipts: `data/social-deployment.json`; preservation assertions: `data/social-deployment-preservation.json`.

Original-contract tests: **9/9**,10.889s and371,801,976B sampled peak. Final Shanghai compile26.807s/296,262,208B; additive deploy3.620s/70,705,336B. Reports: `data/social-{invariants-v5,compile-v4,additive-deploy}-resources.json`. The isolated registry is clearly a market-ID fixture; no fake certificate entered the main chain. Peer review checked original ECP actual sender propagation and hook policy. Its finding that upstream reactions cannot be edited was fixed with original atomic delete+post batching and actual rollback testing. Withdrawal after a target tombstone is supported and tested.

Manual actions used our dedicated Chrome tab102825262, with scoped Playwright controls, separate from coordinator tabs. Alice account0 saved profile159; blog160 and revision161; market comment162. Bob account1 voted+1/0/−1/+1 in163–166, posted nested market reply167, replied inside Alice's blog170 and tombstoned his reply173. Both complete blog versions, both reply/tombstone versions and SSTORE2 pointers were visible. Own-vote controls were disabled; Bob could not see Alice's edit controls. A permanent wallet URL reload showed profile/blog without authentication. These are actual browser passes.

The explicit download produced `exchange-onchain-social.json`,20,180bytes, block173,8 entries, exactly equal to independent RPC entries/history. SHA256 `24fb4337233168f034bd6fd17259637882cd418c014a2ec1c5e5e12857c3b13f`; actual file copied to `data/manual-validation/onchain-social-browser-export.json`. Full transaction/input/receipt/decoded-event evidence and historical scores: `data/manual-validation/onchain-social.json`, reproducible by read-only `scripts/capture-social-manual.mjs`. Each of these11 social transactions preserved both wallets' T balances and the registered statement at its immediate before/after block. Coordinator finance transactions interleaved and are excluded from that assertion.

One real UI defect: after profile159, `getBlock('latest')` returned cached158 and displayed the old profile despite a successful receipt. `social.block()` now uses uncached `eth_blockNumber`, an explicit numbered block and wallet-generation validation. Subsequent publication/edit/vote refreshes displayed correct new blocks. Policy/codec/fresh-block tests **6/6**,179.553ms. Guarded build after that change passed1.92s (2.240s supervisor,475,090,488B peak), `data/social-post-receipt-build-resources.json`.

Public API reads returned200; old profile/vote writes return410, `data/social-live-api-checks.json`. Old JSON files were archived unchanged. API-only restart retained all six terminal jobs and identical proof-history SHA256; no job resumed. API is a derived view; SIWE cannot authorize a social contract write. Manual arbitrary direct-core bypass, profile-revision UI, hardware-wallet prompts and large-page stress are not claimed; applicable policy tests remain separate.

## Local sequential transaction nonce correction — 2026-09-10

Coordinator finance reported `could not coalesce error` after approval(s), before merge/redemption. The earlier UI retained only ethers' generic message, so the original nested error was unavailable. Merge retry174 has its own real receipt. Initial finance evidence through188: `data/manual-validation/perf05-true-through-188.json`, with raw receipts, exact T/YES/NO/LP balance changes, reserves, original CTF payout[1,0] and explicit unsuccessful-attempt notes.

An independent tiny Ganache with a previously used wallet reproduced the same error class: default250ms ethers `_perform` caching reused nonce1 after mining. Ganache then rejected the next transaction: **“the tx doesn't have the correct nonce. account has nonce of: 2 tx has nonce of: 1”**, stored in `data/local-nonce-diagnostic.json`. Exploratory zero-start reports also showed repeated nonce0 and were preserved separately. The nonzero-start report is the relevant confirmed failure. This establishes a local cache defect; it is not a retroactive capture of the original browser's missing nested message.

`sdk/local-provider.mjs` now passes `cacheTimeout:-1` at all three browser local JsonRpcProvider construction points, following installed ethers6.15.0 documentation for synchronous test chains. Injected BrowserProvider/signers and wallet nonce management are unchanged. No optimistic nonce counter or automatic transaction retry was added. `rpcErrorMessage` includes the underlying node reason and caps displayed message length without serializing transaction/signature payloads.

The same isolated actual HTTP JSON-RPC test now sends/waits three distinct zero-value self-transactions with nonce1,2,3. **10/10 nonce/error/wallet tests PASS**,906.204ms; guard0.948s,131,282,072B peak, no cleanup errors. It never contacted9546. Final build **PASS1.86s**, guard2.137s,488,070,336B peak, `data/local-provider-ui-build-resources.json`. Existing SIWE chunk warning remains. No API/chain restart, profile change or proving occurred. Coordinator's later browser redemption189, LP exits and fee withdrawals succeeded; see the completed lifecycle below. The reproducible diagnostic and bounded resource report are now public under `docs/evidence/local-nonce/`.

## Coordinator browser True lifecycle through201 — 2026-09-10

This section records the coordinator's browser actions and independently collected read-only RPC evidence, not a second scripted financial run. True statement `0x9b78961455b75385a452ae8278e749b2a897d75eb615bde01f43726a64e49d7f` was registered at158 under perf05. Alice split100T at169, merged10 sets at174 and provided45T/90YES at177. Carol split10T at179 and provided5T/10YES at182. Bob bought with10T at184 and sold5YES at186. Genuine CI4 resolution187 set original CTF payout `[1,0]`; Bob redeemed189, Carol exited191/redeemed193, Alice exited195/redeemed197. Approval-only failed attempts before174 and189 are retained with no invented merge/redemption receipt.

Collect198 assigned actual protocol LP revenue to epoch2; distribute199 credited the original Warehouse. Alice withdrew200 and Bob201. Each received exactly **1,973,405,038,754,070 wei of LP**, or **0.001973405038754070 LP**, at YES/T pair `0xdA88e887F0a12c8424f27461f4d4A6365eFFac35`. Their T deltas for these fee withdrawals were zero. This fee LP has **not** been removed/redeemed into T. The final state still includes losing NO holdings, fee LP and original permanent liquidity/dust conventions; it is not a claim that all collateral has exited.

Public raw blocks, transaction/receipt fields, decoded contract events, per-step historical T/YES/NO/LP balance deltas and pool/CTF state are in [through-201.json](docs/evidence/perf05-true/through-201.json). The earlier [through-188.json](docs/evidence/perf05-true/through-188.json) is preserved. Social transactions interleaved in this block range are excluded from financial action counts. `scripts/capture-market-manual.mjs` is a read-only collector; it does not transact, deploy or prove.

## Generic external exact-export import — 2026-09-10

The new bundle parser accepts certified canonical exports under pinned v3/perf05 policies without a theorem-hash allowlist. Uploaded source, origin and prose are explicitly not a verified semantic description of the export. Both original RISC Zero pairings and the governance-admitted immutable bridge are called at one numbered block; exact image/profile/foundation/journal/ABI, selected action and wallet-generation binding remain mandatory. The public package API checks encoding/binding only and labels that limitation. Website certificate generation remains deferred.

`node --test tests/external-bundle.test.mjs tests/external-bundle-verifier.test.mjs tests/external-import.test.mjs tests/proof-import-state.test.mjs`: **19/19 PASS**,263.137ms. Coverage includes duplicate/malformed JSON, canonical export/foundation and full claim binding, no source requirement for goal-only packages, forged verification flags, changed input/wallet, same-block original/bridge calls and async import tickets. Contract-factory stubs in targeted unit tests are not claimed as EVM acceptance.

`node tests/external-bundle-live.mjs` then performed actual **read-only** verification at block201: all four unchanged genuine perf05 artifacts, wrapped as generic bundles, passed the deployed original verifier `0xD781C44726058d2971B58408c492192877FAAC17` and installed bridge `0xCace1b78160AE76398F486c8a18044da0d66d86D`. A changed cryptographic seal and a self-consistent changed export/goal/journal using the old seal both failed. Head remained201. [real-evm.json](docs/evidence/generic-external/real-evm.json) records the result. These checks do not claim a newly generated certificate for a third theorem or a browser generic import pass.

One bounded Vite build passed in **2.21s**; supervisor2.523s, peak491,724,568B, no cleanup errors, [build-resources.json](docs/evidence/generic-external/build-resources.json). The idle API alone was restarted for the public-package binding validator; all six old jobs remained terminal and the exact `data/proof-jobs.json` SHA256 stayed `4df593b614525969c33002991a90546372352d9a28572d2bf6f94995d80b73cb`. API HTTP200 confirmed; chain/Vite were not restarted and no job resumed. Independent peer review of raw-byte preservation, fixed policy selection, same-block original/bridge verification and UI epoch/pre-publication binding found no blocking issue.

## Coordinator generic False browser cycle through218

The coordinator pasted a compact required-field generic registration bundle, verified it against original EVM and bridge at201 and downloaded its canonical goal. The actual downloaded `Oncm-goal.ndjson` was1358B, SHA256 `f3970d998f81087ef438303d55b460425ccf4622df367ae485e09deab064afb4`, byte-equal to the standalone canonical False export; [download evidence](docs/evidence/generic-external/browser-false-goal-download.json). UI displayed the source→goal semantic limitation and no fixture ID. The compact JSON had its own input-byte digest, distinct from the pretty-printed example.

False market `0x8594060552f0d9bf4b2ae4ef9aba4693c0b7a3ffcaea2b17d9608aa791f767bb` was created202. Alice split40T at204, provided20T/40NO at207; Bob bought with2T at209 and sold1NO at211. The generic genuine CI6 artifact was independently verified at211 and submitted212, producing original CTF payout `[0,1]`. Bob redeemed214; Alice exited LP216 and redeemed218. The coordinator expanded actual block212 events in the browser. All17 real transactions/approvals and historical balances are in [through-218.json](docs/evidence/perf05-false/through-218.json); the collector had no signer and made no transactions.

Relative to201, Alice's T changed by−1.215105574922753419, Bob's by+1.213376233168483156. Alice retained40 losing YES; both had zero NO and zero LP of this False market after redemption. Remaining pool reserves/protocol LP/minimum liquidity are separate from withdrawn user LP. Prior True-market fee LP remains a separate portfolio asset. Aggregate original CTF T collateral grew by0.001099427854315631, matching the remaining False NO pool reserve. This establishes the basic genuine NO cycle through the generic browser path for the known demonstration, not a newly generated third-theorem proof or all derived-operator branches.

## Portable-package/startup completion audit and final build

The saved-package path had restored `registrationCertificate` directly. It now adopts an unverified draft, checks advertised file/source hashes and generic claim binding, fills the external artifact field and requires a fresh explicit Verify action. Imported files/provenance survive verification only for identical source/goal/profile. Legacy packages cannot promote uploaded `sourceGoalRelation: verified`. Automatic attachment of an old private `job?.result` to a new public market package was removed. The existing registry always remained the final cryptographic authority.

Startup now has tracked original bridge bootstrap bytes and exact descriptor pins; it refuses to overwrite a different runtime descriptor or silently replace saved deployments whose code is absent. It cleans its own children on startup failure and leaves a pre-existing node alone. A shared loopback-only port offset config covers start/deploy/node/API/web; defaults remain9546/4172/5172. The API's existing process was not restarted for this default-equivalent configuration change.

Final sequential targeted command:

```sh
node --experimental-vm-modules --test --test-concurrency=1 tests/portable-package.test.mjs tests/proof-bootstrap.test.mjs tests/standalone-start.test.mjs tests/local-endpoints.test.mjs tests/external-bundle.test.mjs tests/external-bundle-verifier.test.mjs tests/external-import.test.mjs tests/proof-import-state.test.mjs
```

**35/35 PASS**,889.439ms. The actual API package serializer ran against an isolated temporary directory; no live package was written. Startup VM tests use doubles and are not deployment proof.

Separately, an actual clean public-source copy with an existing locked dependency symlink ran `scripts/start.mjs` at offset10000. Original Solidity sources compiled, the genuine bridge and ECP deployed, and API/web/transformed entry/onchain social reads passed. Exact source manifest and deployment/read checks: [fresh-start.json](docs/evidence/standalone/fresh-start.json). Whole-tree guard **70.934s**,617,154,584B peak, exit0; all19546/14172/15172 listeners closed. No native Lean/prover job ran and no existing9546 connection was made. A fresh npm installation and a fresh browser pass were not performed.

Current production source, including the final portable metadata-retention and legacy-label fix, then passed one bounded Vite build: **2.23s**; guard2.610s,446,961,344B peak, no cleanup errors, [current-ui-build-resources.json](docs/evidence/standalone/current-ui-build-resources.json). The pre-existing SIWE chunk-size warning remains. Details and outstanding manual package reimport step are in [PACKAGE-START-AUDIT.md](docs/PACKAGE-START-AUDIT.md).

## Derived-statement transaction review — 2026-09-10

During the coordinator's next derived-market flow, browser automation could not establish the value of the native datetime input from the visible/accessibility state. No rejected transaction was retried by this implementation task. The form now has an explicit text review showing the selected dependency label/full ID, operation and required outcome, plus local date/time with timezone/UTC offset, UTC ISO time, Unix seconds and the inclusive boundary. These fields and the SDK call use the same immutable parsed arguments; submission no longer reparses the date independently.

Empty, malformed or impossible calendar dates and nonexistent DST wall times produce a visible explanation and disabled Create. Positive past deadlines remain permitted, preserving contract semantics; the no-deadline operator sends exactly0. Changing the statement type or wallet/registry context clears the previous dependency/date review. This card establishes reviewable transaction inputs, not a resolution result or approval.

`node --test tests/derived-review.test.mjs`: **6/6 PASS**,179.078ms, including real React server-rendered visible text and exact SDK argument equality, invalid dates, leap years, changed/missing dependency and a DST gap. The test-process timezone Asia/Yerevan maps2030-01-01T00:00 to2029-12-31T20:00:00.000Z/1893441600; the live browser uses its own displayed local timezone. These are unit/render checks, not a browser transaction pass. One final Vite build passed **2.22s**, guard2.522s,456,234,280B peak, [derived-review-build-resources.json](docs/evidence/standalone/derived-review-build-resources.json). No API restart, active-chain transaction or proof job was performed.

The coordinator's next actual browser attempt exposed a separate native input problem: filling the datetime field showed text temporarily, but React state stayed empty and blur cleared it. The generic `Field` component forwarded only React `onChange`; the browser-integration event behavior was not established by the earlier SSR tests. The deadline now uses an ordinary accessible text input with both `onInput` and `onChange`. It accepts `YYYY-MM-DD HH:mm` or the same `T`-separated form, with optional seconds, and still feeds the strict existing calendar/UTC/Unix review. This changes input presentation, not contract deadline semantics. No blocked transaction was submitted by this task. The subsequent actual ordinary-input browser pass is recorded below.

Portable package reimport now also has **Paste portable Lean package JSON** → **Load pasted package draft**, calling the same `preparePortablePackage`/`adoptPackage` path as file upload. Editing or loading clears certificate readiness. The source/goal/profile draft is restored, with the certificate placed in the separate Verify field; no verification or transaction runs automatically. This provides a normal product input path without modifying browser permissions.

`node --test --test-concurrency=1 tests/review-inputs.test.mjs tests/derived-review.test.mjs tests/portable-package.test.mjs`: **15/15 PASS**,531.156ms. New tests exercise both input event callbacks, rendered text-input value, exact paste adoption and oversized/empty/busy rejection. Actual ordinary-input and pasted-package browser checks remain distinct. One bounded production build passed **2.36s**, guard2.660s,504,390,624B peak, [review-inputs-build-resources.json](docs/evidence/standalone/review-inputs-build-resources.json). No API/SDK change, service restart, chain action or proof job was involved.

An additional read-only arbitrage review confirmed `MarketView key={selectedMarket.id}` and enclosing `main key={walletEpoch}` remount the panel on statement/wallet changes. A different pending-quote race remains: changing the amount while its asynchronous preview is pending can allow the older amount's quote to appear. The actual atomic contract still enforces the submitted minimum profit. That separate UX fix was deferred until after the coordinator's ordinary input check; no new browser arbitrage pass is claimed here.
# Coordinator quote lifecycle correction

2026-09-10: inspection found that an in-flight arbitrage quote could arrive after editing the split amount and restore an outdated quote. Market/wallet navigation already unmounts the keyed panel. The amount handler now invalidates the existing generation guard synchronously, clears the displayed quote, and accepts only the latest request; unmount invalidates pending work too. This reuses the existing tested request guard. Its3 context/generation tests passed; this is not a browser race reproduction or an executed arbitrage transaction. Production build and resource evidence are recorded in `docs/evidence/standalone/quote-guard-*.json`. No pool formula, verifier or transaction method changed.

## Coordinator derived-market browser matrix, blocks219–228

The ordinary date input passed actual browser fill and blur. The coordinator read local2030-01-01 00:00, UTC2029-12-31T20:00:00.000Z and Unix1893441600 before creating child220. This resolves the earlier native-input issue through the visible review; no blocked transaction was bypassed.

The coordinator created parent219 (`ResolvedAs TRUE` of the already TRUE Lean market), then future child220, expired child221 and outcome-specific children223/224. At220, attempting to resolve the pending child was correctly refused during preflight with `Not resolvable yet`, leaving the chain at220. Parent225 then recorded TRUE. The future child resolved TRUE226; the child requiring FALSE by2030 resolved FALSE227; the child requiring TRUE by2030 resolved TRUE228. The expired child had already resolved FALSE222 and retained the same finalized record and `[0,1]` payout after its dependency resolved later. Its repeat-resolution button was disabled in the coordinator's final browser view.

The read-only [complete evidence](docs/evidence/derived/through-219-228.json) preserves all10 raw receipts, decoded arguments/events and exact-block snapshots. [Assertions](docs/evidence/derived/assertions-219-228.json) passed for ID/argument binding, stored outcomes, original CTF payouts, recorded timestamps, pending state and expiry stability; the [evidence notes](docs/evidence/derived/README.md) distinguish browser observations from RPC facts. Both the parent and timely children resolved strictly before deadline1893441600; the parent resolved after the expired deadline1577822400. No equality-boundary transaction, custom operator, or derived-market liquidity/trade/redemption is claimed. These checks do not themselves validate the later friendly pending UI or portable-package browser reimport.

## Independent browser package and arbitrage pass, blocks228–242

In its own fresh Chrome tab, the Exchange agent downloaded the generic FALSE market's11837-byte package, pasted exactly the same UTF-8 bytes into **Paste portable Lean package JSON**, and loaded the draft. Source, canonical goal and selected perf05 profile were restored; certificate remained empty and Create disabled. Explicit Verify passed the deployed original EVM verifier and immutable bridge at228, retaining the source→goal warning. Editing the paste then cleared readiness again. The form was cancelled without duplicate creation. [Package observations and downloaded bytes](docs/evidence/portable-package-browser/README.md) record the exact hashes. No file-picker or native-proof reproduction is claimed.

The agent then created an independent parent229 and a2030 child230 through the visible full-condition review. The new Proof lab correctly displayed the full IDs, inclusive deadline and friendly pending explanation at230; **Resolve when ready** was disabled, and **Refresh predicate state** left the block unchanged. The parent deliberately remained unrecorded, so its future child stayed pending throughout242. This establishes an actual browser pass for the later friendly pending UI.

For the atomic strategy, Alice split40T and funded both original V2 pools with20T/40outcome tokens, Bob bought YES for10T, and Carol executed10T with a2T minimum profit. All14 receipts229–242 are retained. The actual expanded browser receipt showed two Swap legs returning8.158008425366233318T and3.990394236541925155T. Exact historical assertions confirm Carol gained2.148402661908158473T and the executor retained zero assets. Negative symmetric/post-execution quotes and an excessive3T minimum disabled execution. Carol's actual journal showed two fills/one transaction, and the downloaded CSV matched both Swap events. [Full public accounting](docs/evidence/arbitrage-browser/README.md) includes gas, balances, pools and bounds; Alice's live LP and Bob's purchased YES were left in place, with no settlement or fee monetization claimed. No source changes, build, restart, reset, heavy job or intentionally reverting transaction occurred during these browser checks.
