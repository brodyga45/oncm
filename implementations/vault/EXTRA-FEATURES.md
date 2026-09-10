# Two Vault-specific additions

## 1. LP settlement scenarios

**User story.** A liquidity provider opens Capital, selects their weighted pool and clicks “Сценарии True / False”. The app shows their current T and outcome inventory and what that inventory redeems to in each binary outcome.

**Mechanism.** SDK `settlementStress(pool,account)` reads the official pool, Vault raw balances, BPT total supply and account BPT balance. `settlementInventory` computes each proportional asset amount with integer rounding down. T is preserved; YES pays only when True, NO only when False. No price feed, invented future price or cloned AMM is used. The result includes its observation block and explicit assumption.

The scenario reader binds each request/result to the exact wallet, pool, chain and SDK instance. Changing any of those clears the display and invalidates delayed results, including a change away and back. A returned different actor/pool or wrong network is rejected. The displayed result identifies its account and observation block; disconnect also clears it.

**Validation.** `test/capital.test.mjs`: positive/negative-side payout mapping, token order invariance, flooring, zero supply, impossible ownership. Economic suite also checks a real LP exits and redeems at actual payout.

The coordinator's NO-pool browser run at154 showed Account0's20T+80NO inventory and conditional True20/False100 payout. Switching to Account1 exposed an old-result display bug; `test/settlement-scenario.test.mjs` now covers immediate invalidation, actor/pool/chain/SDK ABA, overlapping reads, delayed errors and unmount. Coordinator follow-up at177 passed: Account0 had5T+5YES and True10/False5; switching to Account1 cleared the result immediately and recalculation showed0+0 for that wallet; switching back cleared it again. This actor/block evidence and subsequent partial join/exit are recorded in evidence/derivative-lp-cycle/browser-rpc.json.

**Tradeoff.** It is a conditional inventory illustration, not an expected return. Between observation and exit, swaps, LP actions, fees and finality can change inventory. Gas and future trades are excluded. The UI says so next to the result.

## 2. Governance call preflight

**User story.** A member fills an operator/profile/membership or custom-call proposal and clicks “Проверить вызов” before proposing. They see the decoded method, exact target/calldata, pinned observation block and either return bytes or concrete revert information.

**Mechanism.** SDK `governancePreflight(target,data,value)` performs an `eth_call` from the actual Timelock address at the latest observed block. It rejects targets without deployed bytecode. This is a read-only RPC simulation; it neither impersonates a signer for a transaction nor modifies governance state. Proposal submission still follows actual Governor voting, queue and Timelock.

**Validation.** `scripts/governance-test.mjs` confirms a real module installation call succeeds from Timelock and an EOA target is rejected, then executes the separate real proposal lifecycle.

**Tradeoff.** It simulates the inner target call under current state, not the future Governor transaction. Voting, quorum, delay, later state changes and changing permissions still determine execution. Preflight does not grant authority.
