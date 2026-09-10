# Derived statement browser evidence

The coordinator performed the wallet actions on the existing Exchange chain31372. The capture script used only historical RPC reads, with explicit block tags. The original [219–224 snapshot](through-219-224.json) is retained alongside the completed [219–228 capture](through-219-228.json) and [assertion results](assertions-219-228.json).

| Created | Operation and dependency | Deadline | Resolved | Stored result / original CTF payout |
| --- | --- | --- | --- | --- |
|219|Parent: original TRUE theorem recorded as TRUE|None|225|TRUE / `[1,0]`|
|220|Parent resolved by deadline|1893441600|226|TRUE / `[1,0]`|
|221|Parent resolved by expired deadline|1577822400|222|FALSE / `[0,1]`|
|223|Parent recorded as FALSE by deadline|1893441600|227|FALSE / `[0,1]`|
|224|Parent recorded as TRUE by deadline|1893441600|228|TRUE / `[1,0]`|

The ordinary text date stayed visible after blur. Before creating child220, the coordinator read the complete dependency, local date2030-01-01 00:00, UTC2029-12-31T20:00:00.000Z and Unix1893441600 from the same parsed review used for the transaction. The earlier native-input failure was resolved through this normal reviewable input path. It was not bypassed.

At220, the future child's stored outcome and onchain `derivedOutcome` were both0. Its parent had not recorded an outcome yet, although the parent's own view could already evaluate to TRUE. The coordinator's attempt to resolve the waiting child was refused during preflight with `Not resolvable yet`; head stayed220 and there is no receipt for that attempt. This was correct contract behavior with an unfriendly error message. The subsequently improved friendly pending UI is a separate implementation/validation step.

Parent225 recorded TRUE at1789013499. This is before the2030 deadline1893441600 and after the expired2020 deadline1577822400. All three later child resolutions also occurred before2030. The entire expired child record, original CTF payout and evaluated outcome are identical at222 and228; later resolution of its dependency did not change its finalized FALSE result. The coordinator also observed the expired child's repeat-resolution button disabled at228.

The capture contains all ten raw receipts, decoded arguments/events, six statement records including the original Lean dependency, CTF payouts and historical balances. Assertions verify five IDs against the exact ABI encoding used by `createDerived`, event/receipt/block binding, all five final outcomes, timestamps, pending state and expired-result stability. Alice's T balance and aggregate original CTF collateral stayed constant throughout218–228; collateral remained6031921284320265 atomic units.

No liquidity, trading or redemption was performed on these derived markets in this pass. No transaction was timed at the exact equality boundary `resolvedAt == deadline`; inclusive comparison is present in the contract and parser review but this particular browser pass demonstrates strictly earlier/later timestamps. Custom governance-added operators were not covered by this matrix.
