# Actual beneficiary payments and outcome derivative

2026-09-10; own Chrome **102825277** (`🧾 Agora claims and deadlines`), scoped Playwright. Previous audit tab no longer existed, so a fresh independent tab was opened. No other tab, prover, CI, chain reset or direct scripted write.

## Browser passes and exact receipts

| Block | Actual click / result | Transaction |
|---|---|---|
|74|Curator, Protocol revenue → epoch1 Claim T; success, own repeat claim disabled|`0x495ec5f92498209225d37aa3b29948a664bb420775a85447a21bf2e683335850`|
|75|Reviewer, same epoch Claim T; success, remaining splitter0, repeat disabled|`0x0a62204c579f8f2f03f6c3d1b3ffe9c1e62df7d142a58bb02dd628384dba1e50`|
|76|Reviewer Create → kind2, settled TRUE dependency, expectedFALSE, funding0T, fee2% → Register statement & create market|`0x475b2574216d5f59ee8290b55c290301965e75a12d5a23505aa5cd5d3f7a6169`|
|77|The same composite UI action created the empty FPMM pool; no funding/approval|`0x507d0cff8762264889dcb46b05f1dae36eb160f0e7d190ef2fda2c55b9cb45b7`|
|78|Overview → Resolve from chain state; actual result FALSE|`0x304b185d73387fac605fc2c75ba7fce465164336ad069da09ef16f57d8760b30`|

Both recipients received **48,163,265,306,122,448 base units =0.048163265306122448T**. Initial splitter **0.096326530612244896T**, final0; exact T-balance deltas and original PaymentSplitter `released`/`releasable` confirm conservation. Epoch0 had no funds and was not claimed. The browser Activity explorer showed successful74/75, actors, destination, Transfer and ERC20PaymentReleased events. Disabled repeat buttons observed; an intentional reverting repeat TX was not sent.

Derived statement `0x666f7904cbb139ddb68b31fb76588216dafe913ab750671ea969754ac64e403e` depends on real TRUE statement `0x73fa8ef632b54063d2ad7902620a0ba9d225fde5021f6fddb2ade08997aa3c92`; kind2, expected2, deadline0. Its final outcome2 is **the FALSE value of the predicate**, not a refutation of the mathematical base. Goal/profile are correctly zero for this non-Lean predicate. Original NO statement remains OPEN and was not touched.

[verified.json](verified.json) reconstructs actual browser transactions, decoded events, historical balances73/74/75/78 and all statements at78. Reproduce with `node scripts/verify-claims-derived-readonly.mjs`; that script only reads RPC.

## Explicitly stopped action / handoff

The next combined tool call tried to read current state and create another kind2 derivative with expectedTRUE. Automatic approval review rejected it **before execution**:

> This combines a read with an onchain derivative-market registration, but the dependency/profile and liquidity settings are not verified before submission, so the consequential irreversible write is not sufficiently bounded.

No separate retry, SDK transaction, indirect call, or changed route was used. After the parent requested a reviewable handoff, only the draft fields were prepared and read again, without clicking submission. Final own-tab form at block78:

- Wallet Reviewer `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`.
- Title `Audit derivative · TRUE base resolves TRUE`.
- Type `Resolves to an outcome` / kind2, dependency exact TRUE ID above, expectedTRUE /1.
- No deadline (kind2 canonicalizes deadline to0), no imported Lean certificate; derived profile/goal are zero. The perf05 examples elsewhere on Create are unrelated to this derived registration.
- Initial liquidity **0T**, trading fee **2%**. Submission would register predicate then create an empty FPMM pool, costing local gas; it does not submit a Lean proof or settle the original NO market.
- `Register statement & create market ↗` was visible, **not clicked again**. Await a separate decision before submission. Deadline/timely/pending/expiry branches and custom-operator governance were not claimed passed.

## Presentation corrected after the observed defect

Initial derived Overview misleadingly displayed the editor's inherited Nat.add_comm draft as “The formal statement”. It now renders the onchain kind/dependency/expected outcome/deadline formula from `src/market-view.mjs`, hides unrelated Lean source/profile explanatory text and disables repeat resolution on settled predicates. This was re-opened in the actual browser: ResolvedAs(exact dependency,FALSE), Registry state, repeat Resolve disabled. No contract or stored market metadata was changed.
