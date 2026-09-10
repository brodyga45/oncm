# Governed custom operator: actual browser condition91–93

On2026-09-10, own Chrome tab102825344 at `http://127.0.0.1:5171/`, local chain31371. This pass reused the **actual already-admitted ResolvedAfterOperator v1**. It did not invent an alias or claim a second governance admission. No proof generation, network migration, reset or old rejected action.

## Existing genuine admission, independently reconstructed

[prepared.json](prepared.json) records original receipt12: Reviewer submitted Safe execution, emitting `ExecutionSuccess` and Timelock `CallScheduled`, delay5. Receipt14 emitted registry `OperatorConfigured` and Timelock `CallExecuted` for the exact same calldata. Existing UI Governance was actually opened in this pass: proposal `Add resolved_after operator version 1` showed EXECUTED, with Sign/Schedule/Execute disabled. Registry owner is the Timelock; Safe has2owners/threshold2. These existing receipts and present UI state are evidence; no new signature or admission was performed now.

- Operator ID: `0x129374354c5c05fefa1c9b605dc9ef3aed515b0a6acb5a7377a9803aa0242de7`.
- Evaluator: `0x610178dA211FEF7D417bC0e6FeD39F05609AD788`.
- Manifest/runtime keccak: `0x24cc4d544dec2efcc2411925621b3ecfbff618af3c487bc5954c02883f1c92b1`.
- Current evaluator bytes exactly match the independent `ResolvedAfterOperator` compiled artifact. Source: [Agora.sol](../../contracts/Agora.sol), evaluator and immutable registry `configureOperator/registerCustom/derivedOutcome` methods.
- Timelock execution14: `0xdebac45476e99258f11f7f8920ab17a6aff14c7902361837b1c9771c3a667f5e`.

## Actual ordinary browser actions

1. Create → governance-approved operator (kind4). Exact operator ID above; dependency `0x73fa8ef632b54063d2ad7902620a0ba9d225fde5021f6fddb2ade08997aa3c92`, genuine TRUE identity implication recorded at Unix1789001094. Reviewed raw parameter `0x0000000000000000000000000000000000000000000000000000000070dba040` = ABI uint64 Unix1893441600. Description explicitly says strictly after2030; source was cleared rather than retaining a Lean theorem description. Initial liquidity0T, trading fee2%. Clicked **Register statement & create market**.
2. Browser displayed new statement and empty pool at92. Read-only preflight independently confirmed exact kind/dependency/operator/parameters, `derivedOutcome=2`, zero LP supply. Clicked **Resolve from chain state** for this new kind4 statement only.
3. Browser displayed **Resolved FALSE**,0% and disabled repeat resolve at93. Opened **Chain activity** and actually observed original `ConditionPreparation/StatementRegistered`, `MarketCreated`, then `ConditionResolution/StatementResolved`; all three receipts have0asset movements.

| Block | Original call | Transaction |
|---|---|---|
|91|`registerCustom`|`0xa35d371a4ba23c04bffe81c0f463152e7bd8f921ac896dddb7c908628c7ae18a`|
|92|`createPool`|`0x5841610f6119f7f3aa437d9c8c1ec924fedc6302d02baabbc76e03099cea52a1`|
|93|`resolveDerived` → CTF payout `[0,1]`|`0x18c6874315641c693f73441313dde0eb07068ace73170f3b8671c7f0c94d1636`|

Statement `0x793cb8665be94a4c9e158229d6bc6eb366bb2b084cf59348fe213a4100edb7b2`; empty original FPMM `0x2340E2c1Fd4370ff362e6567818c7330e3D9Cb63`; condition `0xc00c21062dcfeddb11062191014b11bf2b32905d33c8b91bf53832293622a169`. Registry `deadline=0` for kind4: this module's deadline lives in its exact encoded parameters. The core mathematical profile/goal fields are zero for this derived condition; no Lean claim is fabricated.

## Exact read-only checks and limits

[verified.json](verified.json), produced by [verify-operator-readonly.mjs](../../scripts/verify-operator-readonly.mjs), reconstructs actual calls/logs at fixed historical blocks. It asserts one new kind4, exact custom binding, original CTF FALSE payout, zero pool reserves/supply, original TRUE/NO statement and pool states unchanged90→93, unchanged ownerT/CTF collateral, and immutable operator entry/code. Script submits no transactions. First assertion mistakenly named the pool method `createMarket`; it failed read-only, was corrected to actual `createPool`, and the full checks passed. No implementation changed or build was needed.

The existing NO mathematical market remains OPEN. Its earlier refused settlement and the refused matching kind2 draft were not retried. This zero-funded strict-time operator does not exercise LP/trading, operator disable/version migration, governance failure paths, or a new arbitrary mathematical certificate. Historical Safe/Timelock admission plus this actual new custom-condition lifecycle establishes the applicable US009 extension path; it is not a claim that all governance branches were manually passed.
