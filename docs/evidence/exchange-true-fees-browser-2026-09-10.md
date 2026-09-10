# Exchange: TRUE market and fee withdrawals, browser validation

Local chain 31372, web http://127.0.0.1:5172/. Browser interactions used the actual app and its development wallets. These are local test funds, not a public-network deployment.

Statement: `0x9b78961455b75385a452ae8278e749b2a897d75eb615bde01f43726a64e49d7f`, `∀ P : Prop, P → P`. Created at block 158 using the published genuine registration certificate. The genuine perf05 proof resolved it TRUE at block 187; independent RPC evidence through block 188 records original CTF payouts `[1,0]`.

| Confirmed block | Browser action |
| --- | --- |
| 169 / 174 | Split collateral / merge a complete set |
| 177 / 182 | Alice / Carol provide liquidity |
| 184 / 186 | Bob buys / sells YES |
| 187 | Submit externally generated genuine proof and resolve TRUE |
| 189 | Bob redeems remaining winning YES |
| 191 / 193 | Carol exits LP / redeems winning YES |
| 195 / 197 | Alice exits LP / redeems winning YES |
| 198 | Collect protocol LP into allocation epoch 2 |
| 199 | Distribute epoch 2 LP to Warehouse |
| 200 / 201 | Alice / Bob withdraw their Warehouse LP credit |

Before each beneficiary withdrawal, the UI displayed approximately `0.002` LP; after confirmation, its withdrawal button became disabled. Exact amounts must be taken from the independent RPC capture, not these rounded display values. Epoch 2 allocates 50% to each beneficiary.

Sequential wallet transactions initially encountered an ethers RPC nonce-cache issue after approvals. The local-provider cache fix was independently reproduced and tested; the subsequent approval and redemption sequences completed in the browser. Earlier unsuccessful UI attempts must not be counted as successful transactions.

Scope: beneficiaries received LP tokens. Their conversion of fee LP into T has not been manually checked here. This ledger also does not establish a FALSE-market lifecycle, all derivative conditions, or public-L2 costs.
