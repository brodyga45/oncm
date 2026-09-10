# Exchange / Vault US009 next browser acceptance

Read-only source and actual RPC review2026-09-10. Exchange observed242, chain31372; Vault observed190, chain31373. No source edits, new proposals, chain writes, builds or proving. Both implementations have deployed real operator bytecode but **neither operator is admitted yet**: corresponding registry mapping is zero, and searches from block0 to observed head found no `OperatorAdded` / `OperatorRegistered`, nor a Governor proposal calling `addOperator` / `setOperator`. Do not confuse economic/governance tests on isolated deployments with this live admission.

## Exchange: actual UnresolvedByV1

- Registry `0xf4B146FbA71F41E0592668ffbF264F1D186b2Ca8`, owner Timelock `0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5`.
- ID `keccak256("UNRESOLVED_BY_V1")` = `0x7415fa73972e0654172eae9563f19d630fbb0deb9d04fab3af2f406454820a5a`.
- Existing evaluator `0x172076E0166D1F9Cc711C77Adf8488051744980C`, deployed runtime keccak `0x55fafb074c2505694e9a18b7fb245fce8fdb207dd16a91eb3b2e38a4ff8adc6b`.
- Source [Core.sol](../../implementations/exchange/contracts/Core.sol#L18): ABI(bytes32 dependency,uint64 deadline), exactly64bytes; dependency must exist, deadline positive. FALSE immediately if any resolution was recorded at or before inclusive deadline; otherwise TRUE after deadline, pending before/at deadline. It is the complement of resolved-by, not a new Lean proof profile.

Ordinary UI already exists in `web/main.jsx`: Governance → Versioned component **Statement operator** fills exact ID/address and manifest `UnresolvedByV1: ABI(bytes32 dependency,uint64 inclusiveDeadline)`. **Encode exact registration call** targets registry `addOperator(id,address,manifest)`, value0. Review the decoded proposal then **Create proposal**; use historical voting weight displayed by Governor (T-weighted). Actual Governor delay1block/period12blocks, Timelock10s, proposal threshold0. Use **Mine1block** until Active, vote enough historical weight to reach displayed quorum; after voting deadline Queue, **Advance timelock delay+1s**, Execute. Capture `OperatorAdded` and owner Timelock dispatch. Do not create aliases or send direct owner calls.

Then Create → **Governance-registered operator**; exact ID; existing genuine TRUE identity dependency `0x9b78961455b75385a452ae8278e749b2a897d75eb615bde01f43726a64e49d7f` (resolvedAt1789007629). Set deadline **2030-01-01T04:00** local Asia/Yerevan = **2030-01-01T00:00:00Z**, Unix1893456000; **Encode dependency & deadline**. Exact operands:

```text
0x9b78961455b75385a452ae8278e749b2a897d75eb615bde01f43726a64e49d7f0000000000000000000000000000000000000000000000000000000070dbd880
```

Direct existing-evaluator `validate(registry,params)` returned true; `evaluate` returned2(FALSE). Create registers the custom condition/canonical tokens without liquidity; do not press funding/trading controls. Open the new statement and ordinary derived resolution button; expect original CTF FALSE payout. Existing source path is `sdk.createOperator`→`ExchangeProtocol.createOperator`, then `derivedOutcome/resolveDerived`. Admission and this custom browser lifecycle are **not yet manually passed**. Built-in deadline browser219–228 does not cover this module.

## Vault: actual ResolvedWithinWindow

- Registry `0x610178dA211FEF7D417bC0e6FeD39F05609AD788`, owner Timelock `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`.
- ID `0xd071a697d013e4780588b5bb51903dc7ea03506c89bc543039b16be6b588cec6` (`vault.resolved-within-window.v1`).
- Existing implementation `0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0`; deployed runtime keccak `0x093ec21ed5b620d42cffe8da37a4e40b5404d1fb0908becbdaa1c5f3d35c8404`.
- Specification `0xe8a1c08559ce5792298458b87b496ecf6eafcaf4a0f8bccc29684b7ac55f04f1` commits `ResolvedWithinWindow(dependency,start,end,expected): inclusive confirmed-block timestamps`.
- Source [Protocol.sol](../../implementations/vault/contracts/Protocol.sol#L138): canonical ABI(bytes32 dependency,uint64 start,uint64 end,uint8 expected), known dependency, start<=end, expected1/2. Resolved dependency → TRUE exactly when outcome matches and start<=resolvedAt<=end, otherwise FALSE. Unresolved remains pending through end and becomes FALSE afterward.

Ordinary Governance UI in `web/App.svelte`: action **Добавить / выключить оператор** fills existing `config.exampleOperator`; **Активировать** true. Exact registry method `setOperator(id,implementation,specification,true)`, value0. **Проверить вызов** is an actual Timelock-origin read-only simulation, not permission to bypass Governor. Review, create proposal; membership-weighted Governor delay1block/period8blocks, threshold0, quorum50% of snapshot membership, Timelock5s. Ordinary local clock controls, vote, Queue, time delay, Execute. Capture `OperatorRegistered` through Timelock. No new membership or profile needed merely to exercise this operator.

After admission: open existing genuine TRUE identity statement `0x390403d03c5e8c37534c14ee5b1a56b9004da93d40a171ee9ba7ae8d62bbfd08` (resolvedAt1788998482), expand **Governance operator module**, set exact ID and operands below, descriptive title. Window2020-01-01T00:00Z (1577836800) through2030-01-01T00:00Z (1893456000), expectedTRUE1:

```text
0x390403d03c5e8c37534c14ee5b1a56b9004da93d40a171ee9ba7ae8d62bbfd08000000000000000000000000000000000000000000000000000000005e0be1000000000000000000000000000000000000000000000000000000000070dbd8800000000000000000000000000000000000000000000000000000000000000001
```

Direct existing-evaluator validation returned true, evaluation1(TRUE). **Создать operation** calls `registerOperation`; it creates canonical condition/outcome assets with no Balancer pool or funding. Open the resulting condition, inspect its visible Operator ID/operands, then ordinary derived resolver, original CTF TRUE payout expected. General arbitrary ABI schema input is intentionally raw and less convenient than Exchange's built-in encoder; exact typed semantic review should be recorded before submit. Admission/custom browser lifecycle are **not yet passed**. This is a distinct time-window operator using already resolved base, not either prior rejected open-parent resolution/expired-draft action.

## Limits

Actual mappings/logs and view evaluations above are read-only evidence, not browser transaction acceptance. A failed script initially tried Vault's nonexistent public `statements` getter; corrected to actual `getStatement`, then validation/evaluation passed. No action was retried via an alternate transaction path. Re-read exact block/module mapping/proposal before manual execution because agents/root may independently advance these local chains. If approval review rejects a specific proposed transaction, preserve parameters and refusal; do not submit it by another route.
