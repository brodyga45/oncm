# Agora FALSE lifecycle — browser evidence, partial

Dedicated Chrome tab102825243 (`🧮 Agora NO smoke`), localhost5171. The requested
hidden in-app browser was unavailable; parent explicitly authorized a new
Chrome tab. Root's existing Agora/Exchange tabs were not claimed or operated.
No source changes, RPC transaction submission, native checks or proving were
used in this test. All transactions below were initiated by actual UI clicks.

Initial chain head46. Created statement:
`0xf99268c5feca503310a5e715a06ac97184747585713ea1c5f94e0f5c1092cd41`.
Pool: `0x6D544390Eb535d61e196c87d6B9c80dCD8628Acd`.
Goal: `∀ P : Prop, P`; profile perf05, goal hash
`0xf3970d998f81087ef438303d55b460425ccf4622df367ae485e09deab064afb4`.
Title: **Every proposition holds · Agora NO smoke**.

| Browser action | Confirmed result |
| --- | --- |
| Create → choose false-registration → Load published registration JSON | JSON populated; registration stayed disabled until verification. |
| Verify & use registration | Original bridge verification completed; exact false-goal source/description shown; registration ready. |
| Curator: fill title,100T funding; Register statement & create market | Statement47, pool48, approval49,100T funding50. UI showed100LP shares. |
| Trader: Trade → NO →10T → Preview → Buy NO | Preview18.725NO; approval51 and buy52 succeeded. |
| Trader: Sell for T →2T → Preview → Sell NO | Preview3.766NO spent; approval53 and sale54 succeeded. |
| Mathematician: Proof → false-refutation → Load published settlement JSON | CI6 JSON loaded; matching false goal selected, unrelated TRUE option disabled. |
| Verify & load settlement certificate | UI reported verification completed, FALSE outcome selected, certificate populated and settlement enabled. |
| Verify & settle onchain | **Blocked by automatic approval review before execution.** No resolution event/transaction exists yet. |

The review classified the final click as an irreversible financial/blockchain
settlement requiring user handoff. It was not retried, and no API/SDK/RPC
transaction workaround was used. The dedicated tab was marked for handoff at
the already verified certificate. Resolution, trader redemption, LP exit and
LP redemption remain **unperformed**; do not count this partial pass as a full
NO lifecycle.

Exact automatic-review reason:

> This clicks the final onchain settlement action, irreversibly resolving the market and potentially triggering payout effects; consequential financial/blockchain transactions require user handoff rather than agent execution.

Read-only RPC evidence is in `partial-rpc-evidence.json`, including every
receipt/event at47–54 and historical balances at46/50/52/54. It confirms
chain31371 and `Ganache/v7.9.2/EthereumJS TestRPC/v7.9.2/ethereum-js`, connected
only through localhost127.0.0.1:9545. These are the project's public local test
assets, not financial account balances on a production network.

Trader bought18.725318761384335154NO for10T, then sold3.765650257794876189NO to
receive2T. Remaining NO:14.959668503589458965. The records include
`ProtocolFeePaid`, `FPMMBuy` and `FPMMSell`, alongside the original registration
and liquidity events. At the evidence capture the head remained54 and the
market was unresolved. No decoded resolution event can be shown until the
handoff action is completed.
