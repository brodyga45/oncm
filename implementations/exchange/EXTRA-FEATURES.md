# Two Exchange-specific extra features

Chosen after coordination with Agora and Vault. These preserve original V2 and its post-resolution trading behavior. Social profiles/replies/votes are a separate user-requested extension and are not counted as extras here.

## 1. Atomic full-set arbitrage

**Scenario.** A trader sees that selling one YES and one NO into separate V2 pools returns more than one T. In the market’s Trade tab, enter T amount, choose minimum gross T profit, request an onchain-router quote, then execute. The card shows each sale, aggregate T result and quote block. This requires real liquidity and a real opportunity; the app does not invent profitable quotes.

**SDK.** `quoteArbitrage(market, amount)` calls original V2 `getAmountsOut` for each independent pool. `arbitrage(market, amount, minProfit)` approves only the amount and calls the deployed `FullSetArbitrage` executor.

**Mechanics.** The ownerless, reentrancy-guarded executor validates the market through the immutable registry, transfers T from the caller, uses original Seer Router to split, sells both canonical wrappers through original V2 Router02, and requires the final T increase to be at least input + minimum profit. Only the newly earned T is returned; pre-existing donated balances are not claimable. Failure reverts both swaps and the split. No custom swap formula or privileged market outcome is introduced.

**Verification.** Economic integration creates a real imbalance with trades, quotes a profitable full set, explicitly broadcasts an impossible-minimum transaction and verifies unchanged user T and pool reserves after its revert, then executes a valid profit and verifies T increased and executor retained zero T.

**Actual browser pass.** At blocks229–242, Alice funded two original pools, Bob bought10T of YES, and Carol executed a10T full-set strategy with a2T minimum. Both original Swap legs and the executor event were inspected in the browser; historical balance assertions confirm2.148402661908158473T profit. A symmetric pre-trade quote and the post-execution quote were negative and disabled; a3T minimum also disabled execution. [Public receipts and exact accounting](docs/evidence/arbitrage-browser/README.md) distinguish this successful browser path from the separate deliberately reverting contract test.

**Tradeoff.** Profit is gross T, excluding ETH gas. Quotes can become stale, but minProfit/deadline protect the transaction. Failed transactions still cost gas. A prior ERC-20 approval is a separate transaction; it survives a subsequent execution revert.

## 2. Trader execution journal

**Scenario.** Open Execution journal after trading. Filter YES/NO, inspect actual buy/sell fills, weighted execution price for each statement/side/direction, T volume and distinct transaction count. Export CSV with exact base-unit amounts, block/time, hashes and nominal input fee.

**SDK.** `executions(address)` reads original V2 Swap events for registered market pairs, their transaction sender and block timestamp; no index or browser-generated success log is authoritative. `executionsCSV(rows)` exports safely quoted fields, including protection against spreadsheet formula injection in untrusted descriptions.

**Mechanics.** Token ordering determines T/outcome input/output. Ordinary trades and the atomic executor both appear under the external transaction sender; an arbitrage transaction has two Swap fills. Ledger grouping is per statement and outcome. Nominal fee is 0.30% of the input asset; fees in YES/NO are not silently reported as T. CSV amounts are raw 18-decimal units.

**Verification.** The economic test produces two direct swaps plus an atomic two-leg transaction, confirms four fills/three transactions for the trader, no false fills for the LP-only wallet, correct outcome coverage and CSV columns.

**Actual browser pass.** Carol's journal after block242 showed the two YES/NO sales under one external transaction and12.148T volume. Its actual downloaded1019-byte CSV matches both original Swap events, including exact amounts and0.03 outcome-token input fees. [CSV evidence](docs/evidence/arbitrage-browser/csv.json) accompanies the coordinator's earlier direct-trade journal check.

**Tradeoff.** This is a swap execution ledger, not tax accounting or complete LP cost basis. Transfers, LP mints/burns and changes on unrelated exchanges are outside its scope. RPC scanning is suitable for this local chain; a large deployment would paginate/cache indexed logs.
