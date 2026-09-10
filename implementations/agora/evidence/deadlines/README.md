# Agora ResolvedBy: actual three-branch browser validation

2026-09-10, own Chrome tab102825324, Agora127.0.0.1:5171, chain31371. Curator local wallet `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. All eight transactions83–90 were explicit ordinary UI clicks. No script sent a transaction; `scripts/verify-deadlines-readonly.mjs` reconstructs receipts and historical state in `verified.json`.

Each new draft used **kind1 ResolvedBy**, outcome requirement0/either recorded outcome, initial funding0T, fee2%. Before every Create click the visible review card showed exact dependency title+ID, local time/zone, UTC and Unix. Every registration additionally created an **empty original FPMM pool**, with supply0; no T transfer or approval occurred. These are distinct deadline statements, not the earlier refused kind2 matching draft.

| Case | Reviewed local / UTC / Unix | Actual browser result |
| --- | --- | --- |
| Open universal claim by2030 |2030-01-01 00:00:00 Asia/Yerevan UTC+04:00 /2029-12-31T20:00:00.000Z /1893441600 | Register83, pool84. Resolve from chain state performed a read-only preflight and showed `Pending: the dependency is still open and this deadline has not expired. No resolution transaction was sent.` Block stayed84. Still outcome0 at90. |
| Same open claim by2020 |2020-01-01 00:00:00 Asia/Yerevan UTC+04:00 /2019-12-31T20:00:00.000Z /1577822400 | Register85, pool86, deterministic FALSE resolution87. UI0%/Resolved FALSE, repeated resolution button disabled; CTF payout[0,1]. |
| Previously proven identity by2030 |2030-01-01 00:00:00 Asia/Yerevan UTC+04:00 /2029-12-31T20:00:00.000Z /1893441600 | Register88, pool89, deterministic TRUE90. UI100%/Resolved TRUE; CTF payout[1,0]. Uses genuine base resolution42; no new proof or base resolution. |

Open base is `0xf99268c5feca503310a5e715a06ac97184747585713ea1c5f94e0f5c1092cd41`. Identity base is `0x73fa8ef632b54063d2ad7902620a0ba9d225fde5021f6fddb2ade08997aa3c92`.

Derived IDs:

- Future pending: `0xd3c477125257e940ec8e46b27d01c636406ee7fbb1eb7732fb0a7d9acd1beeb9`.
- Expired FALSE: `0x6cf1101645130d74f24c8cd986f670f06355400c5b388baa109f347c4d2b1563`.
- Timely TRUE: `0x86f498336b3a0125a5e1233f36c1087265dc00be5802684b5f6ca078d86bdb4e`.

Resolution87 tx `0x6f868566055364ec55f9d265675b0ad9359d16bfcdc1d8dae4200492a1024bd7`; resolution90 tx `0x6578928795823bf3ca0739ac4f9f3e4308f47c138f65e5bf9c7e5410e10ff889`. The browser Activity explorer displayed both original `ConditionResolution` and registry `StatementResolved`, plus all registration/pool receipts. Complete hashes, gas, timestamps and payout numerators are in `verified.json`.

Independent read-only assertions: both original base statements and all their pool reserves/supplies are unchanged82→90; Curator T and CTF collateral T unchanged; exactly three kind1 statements added, all with expectedOutcome0 and empty pools. NO base remains open. Native ETH gas expenditure is separate.

## Small implementation improvement

Independent `src/derived-review.mjs` reuses the reviewed Exchange calendar parser, adapted only to Agora calldata order `[kind,dependency,expected,uint64Deadline]`. It rejects normalized invalid dates/DST nonexistent times, emits explicit local/UTC/Unix and freezes reviewed arguments. Create captures those arguments before metadata/network waits instead of reparsing later. The text date input avoids the browser automation/calendar-control incompatibility observed in other implementations. Bad review disables Create.

`resolveDerivedFromState` reads the actual registry `derivedOutcome`; pending produces a concrete explanation and no transaction. Read results are invalidated on wallet context change or changed selection. This is a UI preflight; the unchanged contract remains authoritative and rejects early resolution itself.

15 targeted calendar/actual-SFC tests passed, including malformed calendar, kind1 expected0, kind2 deadline0, kind3 argument order, pending no-write and changed-wallet rejection. One Vite build passed under1GiB,1.716s/376291512B peak/clean cleanup. The final conservative wallet-scope wait wrapper was verified by the targeted tests; it does not change calldata/math and no extra build or chain transaction followed it.

## Explicit boundaries

- Exact timestamp equality was not manually exercised; inclusion uses unchanged contract `resolvedAt <= deadline` and expiry `block.timestamp > deadline`.
- The future open base was not resolved later, so this pass does not prove late-base-resolution immutability by a browser sequence.
- Kind3 ResolvedAsBy and economic LP/trading on these empty deadline pools were not part of this bounded pass.
- Previously refused original NO settlement and matching kind2 registration were **not retried or bypassed**. No auto-review refusal occurred for these newly reviewed kind1 operations.
