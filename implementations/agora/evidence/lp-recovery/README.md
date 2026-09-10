# Actual browser split/merge and partial LP exit

2026-09-10, own Chrome tab102825298, Agora127.0.0.1:5171, isolated local chain31371. Main chain advanced78→82 through four transactions clicked in the browser. No scripts sent transactions. `scripts/verify-lp-recovery-readonly.mjs` reconstructs exact historical balances, decodes original events and asserts conservation; `verified.json` is its public result.

Existing open NO statement: `0xf99268c5feca503310a5e715a06ac97184747585713ea1c5f94e0f5c1092cd41`; pool `0x6D544390Eb535d61e196c87d6B9c80dCD8628Acd`.

1. Mathematician test wallet → existing statement Overview. Before:100000T,0YES,0NO. Filled1T, read selected wallet/condition/amount, clicked Split T. Approval block79 `0xb831cc47419ca8fa602f8f0d7a8f77747863db10448dd342ccf6f73f94abe64c`; split80 `0xb381dbd30ab28d59304a329764d66f0a75b958324ac91f2857bb804e07646136`. UI showed99999T,1YES,1NO.
2. With1 matched set and same condition visibly selected, clicked Merge set. Block81 `0xca00b971f65a5677f5dd2f46be0118211d119a65a3a4d136fd9c76153ae53998`. UI and historical balances returned exactly100000T,0YES,0NO; Merge set disabled with0 matched balance. Gas in native ETH is separate from T conservation.
3. Switched to Curator → Liquidity,100LP owned. Filled10shares, clicked Refresh LP preview (read-only). Snapshot81 displayed10.775918367346938775YES +9.279951516987992879NO and **0.192653061224489796T** accrued fees. Same input also displayed read-only deposit10T preview:9.279951516987992878LP, residual0YES+1.388249984235224972NO. No deposit submitted.
4. After reviewing exact values, clicked Withdraw LP shares. Block82 `0xa43db59963e78d2e792a7f87c316ad6ee08088041c54e7ce73f205b4f6dd2b98`. UI showed90LP remaining. Historical balances and `FPMMFundingRemoved.amountsRemoved` exactly match the projection; owner accrued fee balance becomes0. Clicked Inspect transaction: chain explorer displayed original Transfer/TransferBatch/FPMMFundingRemoved plus preceding split/merge events.

NO remains outcome0/open. This pass neither retried previously refused NO settlement nor the blocked derived-registration draft. No new market/certificate/prover/social changes. There was no auto-review refusal for these separately reviewed split/merge/partial-withdrawal actions.

Source/unit tests cover interrupted composite creation recovery, but **no forced failed new-market browser transaction** was performed. No claim that the earlier whole NO resolution/redemption gap is closed. Build and test reports beside this file are implementation checks, not substitutes for the four browser transactions.
