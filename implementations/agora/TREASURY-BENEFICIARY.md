# Governance beneficiary and treasury

New accepted requirement2026-09-10: governance may hold a beneficiary share (for example20%). Reducing that share requires consent of the governance beneficiary address, decided through its internal governance. Income accumulates in its treasury; governance later chooses distributions. This does not mean automatic pro-rata payments to every voter.

## Reuse the actual executor as the beneficiary

Agora's existing Timelock `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853` is both beneficiary and treasury. The existing2/2Safe is its proposer; Timelock execution is open after scheduling and delay. Target contracts see Timelock as `msg.sender`. Therefore `AllocationController.setApproval(proposalId,true/false)` can approve exactly Timelock's decreasing share. Making Safe the beneficiary while calling through Timelock would identify the wrong consenting address. No impersonation, new wallet, Safe direct-target shortcut or delay bypass is required.

Original OpenZeppelin `PaymentSplitter.release(T,Timelock)` may be called by any account and always pays the named beneficiary according to its immutable epoch entitlement. This can be exposed as a permissionless treasury claim. Distribution uses existing T ERC20 `transfer(recipient,amount)` executed by Timelock after ordinary Safe signatures/scheduling/delay. The beneficiary fee fraction and the later recipient distribution are separate decisions. Old splitters and past entitlements remain immutable.

## Implemented app changes

- Revenue draft convenience for adding the exact deployed Timelock as governance beneficiary, with explicit percentage and reviewed total100%. It does not propose or approve automatically.
- Required-consent rows distinguish Timelock from a connected EOA; preparing approve/revoke creates a governance proposal for the exact allocation proposal ID. Direct EOA consent still applies to that EOA only.
- Treasury address/T balance and historical epoch claimables; explicit claim destination is Timelock. Claims never route through the user's wallet.
- Extend existing `/api/governance` typed call composer with only `allocation-consent` (target allocation, method setApproval, exact ID/bool) and `treasury-transfer` (target deployedT, recipient/exact base-unit amount). Current profile/operator/availability encodings stay intact. Preserve existing proposal records/Safe nonce/signatures/Timelock operation hash and delay.
- UI exposes exact typed target, method and arguments before signatures/scheduling. Transfer proposals need a recipient/amount and sufficient current treasury funds at execution; no promise that a current balance reserves funds against later proposals.
- Source tests distinguish own-EOA consent from actual executor consent, exact decimal amounts, stale/inactive allocation proposal handling, immutable target binding and preserved old proposal encodings. Later browser acceptance requires actual governance+claim/distribution receipts, not tests alone.

The source implementation needed no new contract, deployment or proving. Its initial baseline was epoch2 (Mathematician20%, Reviewer40%, Curator40%). The subsequent ordinary browser acceptance below changed this baseline through actual consent transactions.


## Initial source validation at block97 (historical)

Implemented `sdk/treasury.mjs` and exported SDK `claimTreasuryEpoch` uses exact `PaymentSplitter.release(config.token,config.timelock)`. `server/governance-actions.mjs` composes only typed allocation-consent and treasury-transfer actions with fixed protocol targets. API persists immutable call/executor/context, checks original outer proposal ID/current epoch/expiry/decrease, then uses unchanged Safe hash/signatures/schedule/Timelock path. Governance snapshots and signature admission disable stale actions; the outer contract rechecks at execution. Old profile/operator/availability proposals remain supported and original records are not rewritten.

`src/App.vue` now includes current-allocation proportional governance draft with exact largest-remainder integer rounding and all losing-address rows. Existing epoch2 Math20/Reviewer40/Curator40 becomes16/32/32 plus treasury20, not a fabricated50/50 baseline. Explicit draft-baseline refresh is required when the outer epoch changes. Required treasury consent rows prepare internal consent/revocation drafts. Treasury shows actualT/epoch credits/released amounts and destination. Treasury transfer composer shows exact token18decimals/recipient/base-unit calldata. All claim/distribution actions are separate explicit controls.

15 targeted unit tests passed, plus13 actual SFC handler/privacy tests (one new no-write treasury preset + existing import/wallet behavior). Vue script/template compile passed. Assigned single Vite build passed1.67s; guard2.371s, peak339,590,608bytes (<768MiB), clean exit: [build report](evidence/treasury-beneficiary/build-resources.json). No additional heavy process/nodegroup/prover.

Actual own browser102825373 at unchanged97: current20/40/40 read, unsubmitted20%preset produced16/32/32+20 with ALL3consents visible; treasuryT=0, all historical claims disabled; typed transfer draft opened with explicit Timelock, token/18decimals and0T. **No allocation proposal, governance proposal, signature, claim or transaction was submitted.** There is not yet a live decrease proposal requiring treasury consent; that UI branch is source/unit checked only.

[Read-only API/RPC/file evidence](evidence/treasury-beneficiary/readonly-97.json) confirms health97, current epoch2, two original executed governance proposals, zero jobs, v3/perf05 profile entries, and unchanged hashes of DB/current deployment/proof descriptor/local execution policy across the check. Existing API watcher applied source and served the new route (listenerPID66995); no manual API restart was necessary. No old state or sessions were written by the read-only browser actions.

## Current browser acceptance through block110

The actual own-browser pass completed allocation98–102, genuine trading income104, permissionless treasury claim105, and treasury share decrease106–110 through existing Safe2/2 and Timelock. Epoch4 is now Mathematician16%, Reviewer32%, Timelock15%, Curator37%. The old epoch3 entitlement stays20%; its0.0008T payment to Timelock was not recalculated after the decrease.

[Browser actions and exact receipts](evidence/treasury-beneficiary/README.md) and [historical assertions](evidence/treasury-beneficiary/browser-through-110.json) distinguish actual UI observations from read-only reconstruction. No NO settlement or previously refused matching derivative was retried.

Remaining US022 acceptance is the internal treasury distribution. A precise0.0004T transfer to the visible Research guest wallet is [prepared and eth_call-checked](evidence/treasury-beneficiary/payment-review.json), **without creating a governance proposal or submitting a transaction**, pending the parent's concrete user confirmation. Treasury still holds0.0008T. Revocation of an already given treasury consent is supported and unit tested, but not manually exercised in this pass.

Read-only negative observations at110: applied allocation and executed governance controls disabled; all treasury repeat-claim buttons disabled. Entering0.001T while treasury holds0.0008T still leaves the draft's Create proposal button enabled: this is a presentation gap, not a successful negative UI gate. The API performs the balance check; no oversized proposal was submitted. The exact0.0004T review was restored.


## Balance preview fix and read-only browser repeat at110

The observed oversized-draft presentation gap above is **fixed**. `assertTreasuryFunds` uses exact BigInt base units and verifies snapshot token/executor identity. The real handler rereads treasury before sign-in/POST, checks wallet scope and a synchronous form revision counter (including A→B→A), and sends the captured reviewed body only. Server admission remains authoritative.

22 targeted tests passed (treasury + actual SFC handlers), including one-wei overage, reduced fresh balance, wallet invalidation and changed form. One assigned Vite-only build passed1.53s; whole guard1.933s, peak388530744bytes under768MiB, cleanup clean ([report](evidence/treasury-beneficiary/balance-gate-build-resources.json)).

Actual own-tab102825384 repeat:0.001T shows “Insufficient treasury balance: requested0.001T; available0.0008T” with Create proposal disabled. Restoring0.0004T shows exact reviewed recipient/calldata and enables the button; **it was not clicked**. Block remains110. An HMR/watcher reload initially interrupted the API JSON response; one ordinary observed root-anchor reload recovered, no process restart or state reset was performed.
