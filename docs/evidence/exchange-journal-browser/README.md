# Exchange execution journal: actual browser validation

2026-09-10, Chrome tab102825303, local chain31372 at block219, web127.0.0.1:5172. Read-only UI and download; no new transactions.

Alice → Execution journal: zero swaps. Switch to Bob: four actual fills, four transactions, T volume displayed15.972. Ledger shows TRUE-market YES buy184/sell186 and FALSE-market NO buy209/sell211. Weighted prices distinguish direction and market; amounts in the table are rounded for display.

Select NO: exactly two fills, displayed T volume2.587. Click Export exact fills · CSV. The actual downloaded `~/Downloads/exchange-executions.csv` is preserved as [downloaded-no-fills.csv](downloaded-no-fills.csv), SHA256 `d1b420d84c6237f2d4d302aff40347b8d489738af03b8523cc461e040b327691`. Parsed both rows and compared transaction sender/hash/block/timestamp and exact amounts against the previously captured original V2 Swap receipts in [through-218.json](../../../implementations/exchange/docs/evidence/perf05-false/through-218.json). Both match; [verification.json](verification.json) records exact amounts. Buy:2T→3.626443575520596526NO; sell:1NO→0.586932657647886630T. Nominal input fees are0.006T and0.003NO, respectively. These are the whole0.30% swap fee, not a claim that beneficiaries received that amount.

Select YES: exactly two fills, blocks184/186, displayed T volume13.385. Switch back to Alice: all previous rows disappear, filter resets to All, zero fills and disabled export. This checks account-scoped journal rendering, not secrecy of public chain events.

Atomic two-leg arbitrage was not exercised in this pass. Existing contract tests for that extra do not substitute for its remaining browser scenario. CSV is a swap ledger, not complete portfolio cost basis or profit/loss accounting.
