# Actual Agora treasury browser acceptance,97–110

2026-09-10, own Chrome tab102825384, `http://127.0.0.1:5171/`, isolated local chain31371. All listed mutations used ordinary labelled UI controls and local test wallets. The collector only reconstructs receipts; it contains no signing, sending, mining or proving.

## Allocation and actual income

|Block|Actual UI action|Observed result|
|---|---|---|
|97|Revenue → Add governance beneficiary to draft20%|Current Math20/Reviewer40/Curator40 →16/32/32 plus actual Timelock20; all3losers visible|
|98|Curator → Propose allocation|Outer proposal2, baseepoch2|
|99|Curator → Give my consent|Only Curator approved; Apply disabled|
|100|Reviewer → Give my consent|Two approved; Apply disabled|
|101|Mathematician → Give my consent|All3approved; Apply enabled|
|102|Mathematician → Apply|New immutable epoch3, denominator1,000,000, shares160000/320000/200000/320000 in sorted-address order|
|103–104|Trader → existing open NO market → Trade → NO →1T → Preview → trade|Token approval103; actual deadline-protected FPMM buy104; total fee0.02T, protocol fee0.004T, LP fee0.016T|
|105|Research guest → Revenue → epoch3 Claim T into treasury|PaymentSplitter sent0.0008T to Timelock, not caller; repeat claim disabled|

NO market remains OPEN: `0xf99268c5feca503310a5e715a06ac97184747585713ea1c5f94e0f5c1092cd41`, actual pool `0x6D544390Eb535d61e196c87d6B9c80dCD8628Acd`. No settlement was attempted. No faucet, donation or LP-fee relabelling funded the treasury.

## Governance gives its own consent

Curator edited the actual epoch3 allocation to Math16/Reviewer32/DAO15/Curator37. The explicit draft-baseline refresh bound epoch3 and displayed **only Timelock** as decreasing20→15.

|Block|Actual UI action|Observed result|
|---|---|---|
|106|Curator → Propose allocation|Outer proposal3; EOA Give consent/Revoke/Apply disabled|
|106|Prepare governance consent → Create proposal|Exact `AllocationController.setApproval(3,true)` proposal, Safe nonce4; offchain proposal record, no chain transaction|
|106|Curator Sign, then Reviewer Sign|One signature cannot schedule; actual2/2signatures permit scheduling|
|107|Reviewer → Schedule via Safe|Original Safe ExecutionSuccess and Timelock CallScheduled; Execute disabled before delay|
|108|Explicit local +10seconds and mine|Ready state becomes visible; no governance execution implied|
|109|Reviewer → Execute|Timelock actually called allocation; AllocationApproval identifies Timelock, not either signer|
|110|Revenue → proposal3 Apply|Epoch4 Math16/Reviewer32/DAO15/Curator37; applied controls disabled|

Timelock `0xa513e6e4b8f2a923d98304ec87f64353c4d5c853`; controller `0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0`; operation `0xa0386c8907d055a55fc160b9f6108f0d3c9724b4376f39bbc71646d452fd6dd5`.

The [historical collector output](browser-through-110.json) includes every actual transaction hash, decoded calls/events and snapshots. Assertions cover all three human consents versus only Timelock consent, unchanged old splitters, unchanged original statement records, fee destination, caller-versus-treasury balances, Safe nonce, and actual immutable epoch4. Epoch3 retains0.0032T for its remaining human entitlements; released treasury0.0008T remains credited to epoch3. Applying new shares neither moves nor reassigns this money.

## Distribution stopped at a concrete review

At110 Revenue → Prepare treasury distribution → recipient Research guest `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` → exact0.0004T displayed token,18decimals, raw400000000000000, Timelock executor, targetT and full calldata. **Create proposal was not clicked.** Parent requested explicit concrete payment confirmation after an automatic review refusal in Vault; this Agora payment itself was not refused or attempted.

[Payment review](payment-review.json) records successful read-only `eth_call` and hypothetical balances separately from actual balances. Actual treasury remains0.0008T, recipient100000T. No signatures, scheduling, internal payment or substitute recipient/token were used. US022 distribution remains pending.

At110 all five historical treasury repeat-claim buttons were disabled; applied proposal3 consent/revocation/apply and executed internal-consent governance actions were disabled. An oversized0.001T draft still showed Create proposal enabled: **UI balance gate is a presentation gap**, although the server rejects insufficient funds. It was not submitted and was restored to the reviewed0.0004T.

## Reproduce evidence only

`node --max-old-space-size=96 scripts/verify-treasury-browser-readonly.mjs` reads local historical blocks97–110 and writes `browser-through-110.json`. It performs no chain mutations. The first assertion draft expected `buy`; the observed original pool method was correctly `buyWithDeadline`, and the collector was corrected before the passing run. This correction did not replay the trade.

No new contract build, proof, API restart or chain reset occurred in this manual phase. Initial build/source checks and initial read-only97 evidence are preserved alongside these new files.


## Balance preview fix and read-only browser repeat at110

The observed oversized-draft presentation gap above is **fixed**. `assertTreasuryFunds` uses exact BigInt base units and verifies snapshot token/executor identity. The real handler rereads treasury before sign-in/POST, checks wallet scope and a synchronous form revision counter (including A→B→A), and sends the captured reviewed body only. Server admission remains authoritative.

22 targeted tests passed (treasury + actual SFC handlers), including one-wei overage, reduced fresh balance, wallet invalidation and changed form. One assigned Vite-only build passed1.53s; whole guard1.933s, peak388530744bytes under768MiB, cleanup clean ([report](balance-gate-build-resources.json)).

Actual own-tab102825384 repeat:0.001T shows “Insufficient treasury balance: requested0.001T; available0.0008T” with Create proposal disabled. Restoring0.0004T shows exact reviewed recipient/calldata and enables the button; **it was not clicked**. Block remains110. An HMR/watcher reload initially interrupted the API JSON response; one ordinary observed root-anchor reload recovered, no process restart or state reset was performed.
