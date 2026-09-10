# Exchange: full-text ECP social layer

Implemented and additively deployed on the existing Exchange chain31372 (Ganache7.9.2, Shanghai). Profiles, wallet blogs, market comments, nested replies, current votes and revision history are all derived from contract state. Neither the local JSON database nor SIWE can author a social write. The economic deployment and mathematical verification are unchanged.

## Exact reuse and compatibility

| Component | Pin and license | Actual responsibility |
| --- | --- | --- |
| [Ethereum Comments Protocol](https://github.com/ecp-eth/comments-monorepo/tree/c301d76fa56b6b807f135c98273ac9eb5ddebe95/packages/protocol) | commit `c301d76fa56b6b807f135c98273ac9eb5ddebe95`, protocol manifest1.1.3, MIT | Original CommentManager, ChannelManager, CommentOps, Batching, Approvals and MetadataOps. Original posting/edit/deletion/signing/nonce/batching implementation. No vendor policy patch. |
| [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-contracts/tree/e4f70216d759d8e6a64144a9e1f7bbeed78e7079) | 5.3.0, `e4f70216d759d8e6a64144a9e1f7bbeed78e7079`, MIT | ECP channel ERC721 and utilities, isolated under `vendor/social/oz`. Existing governance keeps OZ5.2.0. |
| [Solady](https://github.com/Vectorized/solady/tree/dcdfab80f4e6cb9ac35c91610b2a2ec42689ec79) | 0.1.14, `dcdfab80f4e6cb9ac35c91610b2a2ec42689ec79`, MIT | ECP ownership/signature/reentrancy utilities and actual SSTORE2 immutable text archives. |
| Exchange glue | `contracts/social/ExchangeSocialHook.sol` | Wallet/profile/blog/market context policy, one current vote, locked channel and immutable text revisions. |

The39-file production import graph is vendored with license texts and a source manifest in `vendor/social/`. `scripts/compile-social.mjs` uses existing solc0.8.30 with explicit `evmVersion: shanghai`, viaIR and optimizer100. Its import resolver never substitutes the existing economic OZ dependency. The compiled graph contains no transient-storage/Cancun-only imports; the real original contracts were executed by the isolated Shanghai tests and the existing Shanghai node. No chain migration/reset or substitute AMM/social protocol was used.

Final runtime sizes: Hook12,470B, CommentManager19,741B, ChannelManager15,144B, CommentOps9,614B. The compiler script rejects code exceeding EIP170. Build manifests and linked artifacts are in `artifacts/social/`; browser ABIs are `web/generated/social-abis.json`.

## Channel authority and protocol fees

The deployment sets all three original ECP protocol fees to zero before initialization: channel creation, comment and hook transaction fee. The original default channel-creation fee is not inherited accidentally. The hook reports zero app/hook fee. Users pay chain gas in native test ETH; no T fee, forced NFT acquisition or token incentive is introduced.

Original CommentManager/ChannelManager owners are renounced after initialization. One application channel NFT belongs to the hook, which exposes no approve, transfer, hook replacement or channel-admin method. This is a locked protocol channel, not a transferable user blog NFT. Future deployment/policy changes require an explicitly different social deployment; an administrator cannot mutate this channel policy.

Main addresses, chain31372:

| Contract | Address |
| --- | --- |
| Existing mathematical registry | `0xf4B146FbA71F41E0592668ffbF264F1D186b2Ca8` |
| Original CommentManager | `0x276C216D241856199A83bf27b2286659e5b877D3` |
| Original ChannelManager | `0xD0141E899a65C95a556fE2B27e5982A6DE7fDD7A` |
| Immutable ExchangeSocialHook | `0x3aAde2dCD2Df6a8cAc689EE797591b2913658659` |

Channel ID: `45220033077527179872660650886951655311765559180725610723136923265726496873613`. Exact deployment transactions144–157, library links and owner/fee assertions are saved in `data/social-deployment.json`. `data/social-deployment-preservation.json` confirms original registry, T balances/supply, pairs/reserves/supply, fee recipients and core code hashes were equal at143 and157. Native gas balances necessarily changed. Deployment used the existing local account0, no market transaction or profile-governance bypass.

## Web → SDK → original contracts

| User flow | Web / SDK | Actual chain operation |
| --- | --- | --- |
| Open wallet/profile | Header address or any author → `?wallet=0x…`; `profile(address)` | Hook `profileOf`, `entries`, `revision` at one block. Public read, no login. |
| Save name/bio | Profile editor; `saveProfile` | First original `postComment`; subsequent original `editComment` with nonce and full canonical metadata. |
| Publish/edit a blog | Wallet profile → Personal blog; `publishBlog`, `edit` | ECP type0, hook BLOG kind; wallet author is immutable. Full title/body stored onchain. |
| Discuss a market | Market → Discussion; `postComment` | ECP type0 with chain/registry/exact statement URI; hook rejects an unknown mathematical statement. |
| Reply to article/comment | Reply / Open article discussion; `reply` | Original post with parent ID. Hook preserves the parent context/root and prohibits reply to an invalid/deleted parent. |
| Vote | ▲/▼; `vote(id, ±1 or0)` | Original type1 reaction; one live reaction per target/address. Self-voting rejected by hook, not merely UI. |
| Change vote | Click opposite sign | Original atomic `batchOperations`: delete old reaction then post new reaction. ECP prohibits reaction edits, so vendor edit guards remain intact. |
| Withdraw vote | Click selected sign or Withdraw my vote on tombstone | Original `deleteComment` on the existing reaction, returns weight to0. |
| Edit/delete/history | Author controls + Read onchain history | Original ECP edit/delete callback archives every complete version to SSTORE2; delete is a visible tombstone with retained original text. |
| Rebuild/download | Profile → Rebuild & export; `rebuildIndex` | Paged hook getters, entry and revision reads at exact observed block/hash, independent of an index database. |

All write paths use actual connected wallet signer. ECP's direct-author check and the hook independently require actual callback sender==author and app==author. The hook is callable only from the bound CommentManager. Metadata is four ordered fields: kind, context, title bytes, random32-byte nonce. Kinds are PROFILE1/BLOG2/MARKET3/REPLY4/REACTION5; reaction uses ECP commentType1, others type0. Edits cannot transfer authorship, change kind/context/parent, turn a blog into a market comment, or create a second current profile.

Each successful add/edit/delete archives ABI `(uint8 version,uint8 kind,address author,bytes32 parentId,bytes32 context,string title,string content,uint64 timestamp,bool deleted)` in actual SSTORE2 runtime bytecode. Hook `revision(id,index)` exposes the complete bytes without an event archive or IPFS gateway. ECP's own edit/deletion may replace/clear current content; immutable hook snapshots retain the original text. `EntryRecorded` identifies the author/kind/context/revision pointer; `VoteChanged` records old/new vote and aggregate score. Original ECP events are retained and decoded in Block activity. API `/api/social/index?history=true` is a derived view, not authority.

SDK `entry` retains `titleBytes`/`textBytes` as well as decoded text. Invalid UTF8 entered via a direct external contract call is displayed with replacements instead of breaking an entire feed; exact raw bytes remain exportable. Browser rendering uses escaped text, not arbitrary HTML.

## Bounds, identity and history semantics

- Name80bytes, bio2048bytes, blog title160bytes/body8192bytes, market comments/replies4096bytes. Empty profile fields are valid. Content publication is permanent chain data; deletion does not erase its history.
- One current vote per wallet is not one vote per human. No proof of unique person or token weighting is claimed. Votes do not affect mathematical truth, payouts or Governor weight.
- Top uses exact integer score descending, creation time descending, then ID ascending; New uses time and ID. Reply hierarchy is retained; visual indentation is capped at8, actual parent structure is not truncated. No timing-dependent floating-point score conversion.
- SDK read bounds:100 IDs/page,1000 entries/thread,200 revisions per entry,4MiB aggregate export. Larger archives require explicit paging through the public getters. Full-history completeness is claimed for successful bounded export, never silently truncated output.
- The UI refreshes its own successful writes against explicit `eth_blockNumber` and a numbered block. It is not a live subscription to every other tab's writes. Wallet/account/chain/logout generations invalidate drafts and pending continuations; transactions already broadcast remain in chain history.
- There is no platform moderation/erasure policy hidden in an operator key. An author may tombstone their own entry; previous bytes persist. UI discovery can be extended without making an index the source of authorship.

## Independent startup and legacy data

`npm run dev` ensures the isolated social artifact/deployment exists after the economic deployment, without resetting an existing chain. Explicit commands are `npm run compile:social`, `npm run deploy:social`. An existing saved social deployment whose bytecode has disappeared is an error, not permission to silently replace the chain. `data/social-deployment.json` and the exact browser copy bind registry/chain/addresses.

On activation the old JSON social files are copied, byte-preserved, to `data/legacy-social-before-onchain/`. They are not reposted as if their former session author signed an EVM transaction. Public legacy reads use `/api/legacy-social/...` with `onchain:false`; previous profile/comment/vote mutations return410. Profiles and comments at normal GET paths are chain-derived. SIWE remains only for private source/job/package tools; social writes never need its bearer token. The isolated API restart retained all stored jobs/source/history; all six existing jobs were terminal, and no cryptographic job was started.

## Verification and manual evidence

Original ECP isolated Shanghai integration: **9/9 PASS**, including real sign changes1→0→−1→1, native author/context bypass rejection, locked channel/zero fees, Unicode full history, reaction edit rejection, atomic-batch rollback when the second leg fails, withdrawal after target tombstone, and wallet generation refusal. Test registry is explicitly an isolated market-ID fixture; these tests are not Lean certificate verification. Final run10.889s, peak371,801,976B; report `data/social-invariants-v5-resources.json`. Read-policy/codec/fresh-block regression: **6/6 PASS**,179.553ms. Peer review of original ECP sender generation and hook policy passed; the reviewer made no transaction.

Actual browser, dedicated Chrome tab102825262, Alice/Bob, **2026-09-10**:

| Block | Passed visible action |
| --- | --- |
|159|Alice saved profile; confirmed receipt. Immediate stale-block refresh found and fixed; persisted fields then read correctly.|
|160–161|Alice published full blog and revision; history displayed both original complete bodies and SSTORE2 addresses.|
|162|Alice commented on real perf05 market `0x9b7896…49d7f`; self-vote buttons disabled.|
|163–166|Bob+1, withdraw0, −1, atomic replacement+1; each score observed after receipt.|
|167|Bob posted a nested market reply; Bob's own self-vote controls disabled.|
|170,173|Bob replied inside Alice's blog, then tombstoned his reply; both original text and tombstone history displayed.|

Permanent wallet URL reload showed Alice's profile/blog publicly without authentication. Rebuild/export downloaded an actual20,180-byte JSON at block173; its8 entries and complete histories exactly equal the independently reconstructed RPC snapshot. SHA256 `24fb4337233168f034bd6fd17259637882cd418c014a2ec1c5e5e12857c3b13f`. Files: `data/manual-validation/onchain-social.json` (11 raw receipts, transactions, decoded events and historical votes), `onchain-social-browser-export.json` (actual browser download). Every social transaction has zero native value; both wallets' T balances and the mathematical statement are equal immediately before/after that individual social block. Other coordinator-owned finance transactions are interleaved and intentionally excluded.

Browser profile revision, arbitrary direct-contract bypass, injected wallet hardware prompts and very large pagination are **not** claimed as manual passes; contract/unit tests cover the applicable policies. API public reads/retired mutation routes have live HTTP200/410 evidence in `data/social-live-api-checks.json`. The current guarded build and further market finance QA are recorded separately in `VALIDATION.md`.
