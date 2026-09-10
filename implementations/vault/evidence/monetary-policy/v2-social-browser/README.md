# Actual Vault V2 social browser smoke, blocks 552–563

Completed in an independent Chrome tab (`102825448`) through the normal Vault V2 website at `http://127.0.0.1:5173/`, chain 31373. Account 0 and Account 1 used the labelled local development wallets. Every public text was visible in its form before submitting; it contains only explicit local test material. These are social attestations, not Lean package publication or financial transfers.

| Block | Actual browser action | Observed result |
| --- | --- | --- |
| 553 | Account 0 saved profile `Vault V2 test author` with a test-only bio | Public profile persisted |
| 554 | Account 0 added a comment about the displayed identity implication `P -> P` | Correct V2 statement context; own vote buttons disabled |
| 555 | Account 1 replied to that comment | Correct parent, author and statement context |
| 556–558 | Account 1 voted +1, then −1, then clicked the selected downvote to clear it | Scores +1 → −1 → 0; three public vote versions |
| 559 | Account 0 saved comment revision 2 | Updated text, original retained in public history |
| 560 | Account 0 published `V2 local social smoke` | Full short test blog title/body onchain |
| 561 | Account 1 replied to the blog | Reply in the blog's context |
| 562 | Account 0 hid the blog with a new revision | Hidden parent retained; existing reply still visible; new reply unavailable |
| 563 | Account 0 restored the original blog text with another revision | Blog restored, two history versions, existing reply retained |

Top and New both kept the comment's reply under its parent. The explicit **Перечитать блокчейн** action rebuilt the view. After all writes, closing the public profile and clicking the normal **▱ VAULT** root link performed a real reload. Without a connected wallet, the market still displayed the revised comment, original reply, one edit and three vote versions. The public author profile still displayed the saved bio, restored blog and both revisions; its discussion still displayed Account 1's reply. Comment/reply submission was disabled while disconnected. The profile overlay was then closed; no transaction or form remained pending.

## Independent onchain verification

[through-563.json](through-563.json) contains full receipts, original EAS attestations, decoded full text, exact UIDs, authors, contexts, previous-version links and historical balance comparisons. [capture.mjs](capture.mjs) is a read-only collector without a signer. It checked all 11 successful transactions went directly to the original EAS address `0xF32D39ff9f6Aa7a7A64d7a4F00a54826Ef791a55`, with zero native value; original attestation bytes exactly match transaction data. Attesters and recipients equal the actual sending wallet, and schemas, nonrevocability and version chains match the resolver events.

The statement is `0x390403d03c5e8c37534c14ee5b1a56b9004da93d40a171ee9ba7ae8d62bbfd08` in V2 registry `0x3347B4d90ebe72BeFb30444C9966B2B990aE9FcB`. Blog roots use the separate blog context. Rebuilding the SDK projection from original logs produced four entry roots and one profile, with the expected threading, histories and final zero vote score.

All 20 compared balances—T, MEMBER, YES, NO and BPT for four development actors—are unchanged from block 552 to 563. The full market statement state is unchanged too. Native gas is intentionally outside this equality check because these are actual transactions.

[Resource report](capture-resources.json): 1.873 seconds, peak process-tree footprint 72,833,384 bytes, exit 0, no cleanup errors, under the 256 MiB guard. The collector confirms onchain outcomes; the action/reload observations above are actual browser evidence, not inferred from tests. Earlier legacy social evidence is separate and is not reused as a V2 pass.
