# Scenario coverage: click → SDK/API → chain / off-chain state

| US | Web workflow | Contract / SDK / off-chain mechanism |
|---|---|---|
| 001 | Lean Lab → registration certificate → New market → create WeightedPool | verifyGoal → StatementRegistry.register → CTF.prepareCondition → canonical wrappers; PoolCoordinator.create → real WeightedPoolFactory |
| 002 | Capital → preview exact assets/BPT/limits → confirm initialize or join | quoteInitialize via original WeightedPool invariant; quoteJoin via original Router; fixed token maxima/minBPT passed through approvals; actual BPT |
| 003 | Capital → quote → swap | Zero-origin Balancer query with sender argument; bounded-slippage exact-in Router swap; raw Vault reserves |
| 004 | Lean Lab → prove P → send proof | Real runner certificate → immutable verify → CTF.reportPayouts [1,0] |
| 005 | Lean Lab → prove ¬P → send proof | Same runner checks outcome 2 → CTF payouts [0,1]; no administrator fallback |
| 006 | Statement → ResolvedBy | Registry registerDerived(kind1); confirmed resolution timestamp ≤ inclusive deadline, otherwise false strictly after deadline |
| 007 | Statement → ResolvedAs / ResolvedAsBy / governance operation | Builtin kind2/3; kind4 immutable static operator implementation and canonical bytes operands |
| 008 | Statement → redeem all | PositionRouter unwraps the canonical wrappers, CTF redeems, exact T balance delta forwarded |
| 009 | Governance → profile/operator/custom proposal | Separate Membership → OZ Governor → Timelock → immutable registry additions/toggles or supported protocol call |
| 010 | Revenue → allocation proposal → decreasing holders consent/revoke → activate | AllocationController validates sorted unique addresses and total 10000, all losses consent, base epoch stale check |
| 011 | Revenue → stages/epoch balances → collect → distribute → claim | Block-pinned Vault/Controller/Split/Warehouse reads; real creator fee controller → frozen PullSplit → warehouse → recipient; old epoch unaffected |
| 012 | Lean Lab → Palomar publications/search → import | Public data.palomar-registry.org exact entry/version → commit-pinned challenge/solution/config/toolchain files, SHA-256 hashes; no trusted settlement shortcut |
| 013 | Lean Lab / details → separate Challenge/Solution → preview/download ZIP → load into Lean Lab | fflate ZIP, pinned toolchain, Lake config/optional lock, metadata template and goal/profile context. No automatic execute/publish; public evidence JSON remains separate. Author may explicitly publish supplied files with SIWE consent; source-to-goal comparison still requires the real profile |
| 014 | Wallet menu → injected / explicit local → Disconnect; external identity change | Correct chain before sends; SIWE nonce/domain/chain/HttpOnly; account/chain changes clear old signer/private UI/session and require reconnect without automatic signature |
| 015 | Research → filter/search → details / published source revisions | RPC registry/pool reads; explicitly author-published Challenge/Solution + hashes beside semantic commitment; absent or unverified source is labelled, no private-job fallback |
| 016 | Details → comments/replies/edit/votes/profile | SIWE actor, persisted plaintext, immutable author, edit history, one address one +/- vote, remove/change, no self vote, deterministic Top/New |
| 017 | Lean Lab → source / fixtures → check/register/prove → status / cancel | SIWE-private p-queue with one worker, dedup per owner and 16 global / 4 owner slots; outer 2 GiB guard + 5/30/120 s budgets; cancel waits for descendant cleanup; real proof/runner.mjs retains its execution policy and inner lock; check-only never announces a certificate |
| 018 | Governance → propose/vote/queue/execute | Exact calldata review + optional read-only preflight; local block advancement is explicitly labelled, voting transactions remain real |
| 019 | Capital → partial/all LP exit preview → per-token minima → confirm | Original queryRemoveLiquidityProportional → Router.removeLiquidityProportional with the same displayed limits; finality hook allows proportional removes. Returned outcomes redeem normally |
| 020 | Statement → split / merge | 1 T = complete set; ERC1155↔ERC20 roundtrip, canonical metadata, exact collateral conservation |

Profile additions: any public wallet profile shows its address, display name/bio, T/YES/NO/BPT holdings and comment count. Owner edits through SIWE. Author links open profile modal; `#profile/0x…` deep-links it. Comments may have parentId; parent must exist in same statement. Voting changes only off-chain ranking.

Block observability is shared by every on-chain scenario: `/api/activity?to=…` reads actual blocks/receipts, timestamp/hash/actor, all decodable protocol events, gas cost and ERC-20 transfer deltas. Those deltas are receipt-local, not incorrectly described as whole-block historical balances.

## Validation boundary

- Core unit tests: community invariants and LP scenario mathematics.
- Isolated real-contract economic tests: CTF/wrappers/WeightedPool/Permit2/creator fees/Splits/LP/redeem; proof verifier explicitly mocked **inside the test only**, then `evm_revert`.
- Isolated governance tests: real membership/quorum/vote/Timelock/operator installation, then revert.
- API tests: actual RPC, SIWE, profile identity/persistence, unknown-comment rejection, Palomar import, native Lean check and rejected sorry proof.
- Real crypto end-to-end smoke uses the published Lean fixture and the current pinned profile’s Groth16 certificates. No earlier test substitutes for this requirement.
