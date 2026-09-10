# US009 actual existing-operator admission and resolution

Independent browser tab102825394 on the existing Vault network; blocks231→260. No signer impersonation, new deployment/proof, funding, pool, mint, reset or retry of a previously blocked action occurred. The source-publication, deadline-parent and treasury-payment blockers remain pending separately.

Before submission, the existing `ResolvedWithinWindowOperator` runtime hash, configured ID/specification, registry mapping and exact operands were independently checked against the actual RPC. Mapping was unadmitted, bytecode already deployed. [Exact before state](before-231.json).

| Block | Ordinary browser action and result |
| --- | --- |
| 232 | Account0 proposes `StatementRegistry.setOperator(id,existingImplementation,specification,true)` after a successful original Timelock-origin preflight and visible exact-call review. |
| 235,236 | Account0 and Account1 each vote For using their own historical membership weight. Snapshot233, deadline241, quorum2MEMBER reached. |
| 247 | Account1 queues the successful proposal. Execute is visibly disabled until the five-second Timelock delay expires. |
| 258 | Account1 executes Governor; the original Timelock calls the registry and `OperatorRegistered` admits the pinned implementation. |
| 259 | Account1 creates the reviewed zero-funded governance condition on the genuine TRUE base. No pool or positions minted. |
| 260 | Ordinary condition resolver invokes the actual admitted evaluator, which returns TRUE. Original CTF payout becomes `[1,0]`, denominator1. |

Governor proposal ID: `113677726671615695191596875959447572148776714934390912344271876093770640678848`.

New condition: `0x1bd795b2e2e3467fe19f3859600ca241e136557f81ad92252eddd73c979f38de`. Actual operands are `ABI(bytes32 dependency,uint64 start,uint64 end,uint8 expected)` with dependency `0x390403d03c5e8c37534c14ee5b1a56b9004da93d40a171ee9ba7ae8d62bbfd08`, start1577836800 (2020-01-01T00:00:00Z), end1893456000 (2030-01-01T00:00:00Z), expected1. Both boundaries are inclusive. The base's recorded TRUE resolution1788998482 is inside this window. This operator evaluates an existing chain fact; it is not a new Lean proof or an override of theorem truth.

[Full decoded receipts and historical state](receipts-state.json) confirms seven successful transactions, original Governor/Timelock admission, unchanged operator bytecode, exact canonical operands, real CTF payouts, zero new YES/NO supplies, and one new statement. The eight previous statements, all three pools/BPT supplies, T/NO wallet balances including treasury and CTF collateral, and allocation epoch4 are unchanged versus231. Treasury historical evidence at231 remains valid.

The initial generic kind4 detail displayed a misleading zero-valued common `dependency` field, although the correct raw operator ID/operands were already present. A display-only correction now reads the actual operator mapping, specification and runtime code at one block. Only the exact known ID/spec/runtime triple receives the `ResolvedWithinWindow` typed decoder; unknown combinations retain raw bytes without invented meanings. Canonical ABI is checked and out-of-range dates retain exact Unix values. No registry, ABI, compiler/bootstrap artifact or server was changed.

Four targeted tests passed. One guarded Vite build passed1.54s; resource details are in [build report](build-resources.json). Post-build ordinary public browser read at260 shows actual adapter/spec/runtime, the genuine base dependency, inclusive UTC/Unix bounds and expectedTrue; the old zero-dependency label is absent. The resolved-condition button is disabled. The owned tab was closed. [Browser observations](browser.json).

The creation form still accepts raw ABI operands; it is not a general form generator or proof-system change. The typed detail is presentation only: settlement continues to use the governed onchain adapter.
