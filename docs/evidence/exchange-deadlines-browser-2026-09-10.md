# Exchange: deadline predicates, browser evidence

Actual local chain31372, initial own Chrome tab102825303, Alice. The initial record below covers observed UI actions through block224; the continuation section confirms completion through228. The subsequent parent-resolution click was sent, but its result is **unconfirmed in this record**: the next browser observation was rejected by automatic approval review because the Codex usage limit was reached. Do not repeat that transaction before checking its receipt after the tool becomes available.

## Continuation confirmed after access returned

The usage-limit status was checked again and browser access was available. A new own tab102825321 showed block225 and parent True **without resubmission**. Coordinator connected Alice and completed the three existing future children through normal Proof lab controls:

- 226: ResolvedBy2030 → True, tx `0x6cc0d…4205a`.
- 227: ResolvedAsBy(False,2030) → False, tx `0x71c1c…8a5a5`.
- 228: ResolvedAsBy(True,2030) → True, tx `0x9f608…638fe`.

At228, reopened expired2020 child: still False, repeated resolution disabled. The [full historical RPC capture and assertions](../../implementations/exchange/docs/evidence/derived/README.md) contain all10 receipts219–228, exact IDs/calldata, dependency records and original CTF payouts. They verify the five final outcomes, timely resolution timestamps and unchanged expired payout after parent resolution. No new certificates or liquidity were needed.

The pending UX was subsequently changed to read the actual registry `derivedOutcome` with all explanatory reads at one explicit block. SDK refuses pending submissions; UI shows the full predicate/required outcome/deadline and snapshot block. After ordinary reload, the actual expired child panel showed “This statement has already been resolved. Observed at block #228.” with disabled Resolve and available Refresh.5 focused SDK/readiness tests and production build passed; this observed resolved-state view does not itself prove the new pending UI path.

## Parameters and confirmed actions

Parent registered earlier at219: `Deadline QA · parent records TRUE`, ID `0xb911b784614efa736228a7337e0779b6536d17cfa479d71e96777ce5b0977ad3`. It is a ResolvedAs(True) predicate over the genuine TRUE base `0x9b78961455b75385a452ae8278e749b2a897d75eb615bde01f43726a64e49d7f`. Parent remained open throughout creation of all four children below. No liquidity or token purchase was included in these registrations.

| Block | Browser action | Observed result |
| --- | --- | --- |
|220|Create `Deadline QA · resolved by 2030`, ResolvedBy(parent), local `2030-01-01 00:00`, Asia/Yerevan|Confirmed register; short ID `0xa3ef5…3507a`, tx `0xaf1f7…834b4`; open.|
|220 unchanged|Select this child → Proof lab → Resolve when ready while parent open|Preflight refused: `missing revert data: VM Exception while processing transaction: revert Not resolvable yet`. No new confirmed receipt/block. Correct contract refusal; UI wording still needs improvement.|
|221|Create `Deadline QA · expired in 2020`, ResolvedBy(parent), local `2020-01-01 00:00`|Confirmed register; short ID `0xf3db6…f89af`, tx `0xbe554…c6601`.|
|222|Select expired child → Proof lab → Resolve when ready|Confirmed resolution, `Proven false`, tx `0x81c03…a184c`; repeat-resolve button disabled. Parent still open.|
|223|Create `Deadline QA · FALSE by 2030`, ResolvedAsBy(parent,False), same2030 deadline|Confirmed register; short ID `0x0de8e…510c3`, open.|
|224|Create `Deadline QA · TRUE by 2030`, ResolvedAsBy(parent,True), same2030 deadline|Confirmed register; short ID `0xe2537…f13bc`, open.|

Each creation had a separate observed review card before submission: operation, dependency label/full ID, required outcome, local/IANA timezone, UTC, Unix and inclusive boundary. Future deadline: `2030-01-01 00:00:00 UTC+04:00 (Asia/Yerevan)` = `2029-12-31T20:00:00.000Z` = `1893441600`. Past deadline: `2020-01-01 00:00:00 UTC+04:00 (Asia/Yerevan)` = `2019-12-31T20:00:00.000Z` = `1577822400`. Rule displayed: recorded resolution time ≤ deadline. No claim of testing exact timestamp equality in the browser.

## Actual input defect and correction

The original native datetime-local field accepted a visible fill but left React's deadline empty; blur discarded it and the review/Create stayed disabled. This was observed, not inferred from a test. The corrected UI uses a strict validated text input supporting `YYYY-MM-DD HH:mm` and a T separator, with onInput/onChange and the same parsed values passed to SDK. The actual browser review then showed all conversions above and registration220 succeeded. A prior auto-review refusal caused by missing visible date evidence was thus addressed through the ordinary visible form; no alternative transaction route was used.

HMR disconnected the test wallet. Connecting Alice closed the old draft; the form was filled again, and its full parameters reviewed under the connected wallet. This is an observed context reset, not an injected-wallet event test.

## Exact continuation point

After224, selected parent, inspected Specification (full ID/dependency, no deadline, recorded resolution Unresolved), returned to Proof lab and clicked Resolve when ready. That tool call returned without an error. **A returned click alone is not a successful receipt.** The next DOM read failed with `Automatic approval review failed: You've hit your usage limit … try again at Sep15th,2026 7:46AM`. No browser or API workaround was attempted.

Next: observe the current receipt before any retry; if parent is now True, resolve future ResolvedBy and matching True child to True, opposite False child to False; confirm expired child remains False despite the later parent resolution. Capture full receipts/IDs/payouts in addition to these UI observations. The current document does not yet claim that timely or opposite-outcome child resolutions passed. The pending-message UX should also be made readable and retested on a genuinely open dependency without new proving.
