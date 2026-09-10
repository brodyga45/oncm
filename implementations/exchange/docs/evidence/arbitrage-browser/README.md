# Actual atomic arbitrage, blocks229–242

The Exchange agent used its own Chrome tab with the three labelled devnet wallets on the existing chain31372. All actions used the web controls and local test assets. There was no reset, mock quote, forced pending transaction, proof execution or service restart.

The [raw historical capture](../derived/through-229-242.json) contains all14 receipts and derived state snapshots. The [arbitrage supplement](through-242.json) records original V2 reserves, exact balances, quote arithmetic, decoded execution parameters and assertions.

| Block | Browser action |
| --- | --- |
|229|Alice created `ResolvedAs FALSE` of the already refuted generic theorem; recorded outcome remains unresolved.|
|230|Alice created a future `ResolvedBy` child after reading full dependency/local date/UTC/Unix1893441600. Proof lab showed pending, Resolve disabled; Refresh sent no transaction.|
|231–232|Approve and split40T into40YES +40NO.|
|233–235|Approve and supply20T +40YES through original V2 Router.|
|236–238|Approve and supply20T +40NO through original V2 Router.|
|239–240|Bob approved and bought YES for10T.|
|241–242|Carol approved10T and executed the atomic full-set strategy with minimum profit2T.|

The parent statement is `0x6624a45383aa60c6444d0d639e4aa8f17a601fc17bfcdd6aaef4b1b2bf573d0f`, market `0x8d77a776dff9bcED1Cc28C07146F19bfD8277db9`. Both initial pool prices were0.5T. At238, selling a new10T full set would lose2.019211526916149690T; the quote showed no executable opportunity. Bob's actual10T purchase changed the YES reserves to30T /26.693360026693360027YES while NO remained20T /40NO.

At240, the browser displayed a10T strategy profit of about2.148T. Setting minimum profit3T disabled execution; setting2T enabled it. The successful transaction was `0xada7d7a20a0bd3040f6de66ba327e28289b7a1ba0b2623137a14f121ce6201da` in block242.

The agent expanded its actual receipt in Block activity and read both original `Swap` events and `FullSetExecuted`. Selling10YES returned8.158008425366233318T; selling10NO returned3.990394236541925155T. Total return was12.148402661908158473T, and Carol's exact T balance increase was **2.148402661908158473T**. The executor retained zero T/YES/NO; Carol retained zero YES/NO. Original CTF collateral rose by10T, matching the full-set split. Assertions against actual historical balances and both pool events passed.

The refreshed10T quote at242 was unprofitable (−2.671690225629382845T), leaving repeat execution disabled. This pass did not broadcast an intentionally failing transaction; the separately documented integration tests cover all-or-revert failure. Gas was paid in test ETH: approval0.000046047000368376ETH and execution0.000643595005148760ETH, excluded from the gross T profit.

Carol's **Execution journal** then showed two fills, one transaction and12.148T volume. Both rows appeared as sales, with0.03YES and0.03NO nominal input fees respectively. The actual downloaded [CSV](carol-executions.csv) is1019 bytes, SHA256 `a01f8614bd3d1b2ecbe115639e132d3ed02696d2b86978caab2ea57b279d9f84`; [comparison](csv.json) verifies each exact amount, original pool, transaction, block and nominal fee against the receipt.

Alice retains28.284271247461899976LP in each pool; Bob retains13.306639973306639973YES. The parent and future child are still unresolved at242. This live inventory was intentionally left available for further user testing; no LP exit, outcome settlement or fee monetization is claimed in this pass. A minor display issue was observed in Block activity: an address can appear twice with checksum/lowercase casing in the balance table; raw RPC balances and ledger entries are unaffected.
