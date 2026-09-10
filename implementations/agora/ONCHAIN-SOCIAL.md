# Agora full-content onchain research archive

Status: deployed additively at block 55, manual two-wallet browser acceptance through block 73 completed; see `evidence/onchain-social/README.md`. Contract, SDK, RPC read model, API read adapters and Vue UI are live. Prior `evidence/social-extras/` is historical **offchain** evidence and does not validate this new requirement. No old author is forged by copying a database row into a transaction.

## Reuse choice and actual constraints

Agora vendors the exact MIT `SSTORE2.sol` from [Solady 0.1.26 commit acd959aa4bd04720d640bf4e6a5c71037510cc4b](https://github.com/Vectorized/solady/blob/acd959aa4bd04720d640bf4e6a5c71037510cc4b/src/utils/SSTORE2.sol). SHA256 `23011882e5f3d548971ca9b0554d3bdd182eb46762d02864d5009823e73716a3`, 12,633 bytes. Source, MIT license and provenance are independent copies under `contracts/vendor/solady/`; there is no sibling-app runtime import. `research/onchain-social-source-manifest.json` records the bounded primary-source review.

SSTORE2 creates an immutable code-storage contract with one STOP prefix byte and supplies the established write/read implementation. Under [EIP-170](https://eips.ethereum.org/EIPS/eip-170), 24,576 runtime bytes permit at most 24,575 payload bytes. Agora uses 16,384-byte chunks, up to four chunks for a 65,536-byte blog. This pinned implementation uses CREATE/EXTCODECOPY, not Cancun-only opcodes; compiler targets Shanghai, matching the existing Ganache chain. Gas has not been benchmarked against alternative protocols. Full content is available from ordinary current state/code reads, including every prior version, without IPFS, an archive event service, or the Agora API.

This is a storage primitive plus custom forum rules, not a ready-made social protocol. [ECP's reviewed CommentManager](https://github.com/ecp-eth/comments-monorepo/tree/c301d76fa56b6b807f135c98273ac9eb5ddebe95/packages/protocol/src) offers full current comment content, SDK/indexing/React components and channels. However, edit overwrites current content and deletion removes the current record: callable prior-text history requires an additional archive; a one-wallet ±1/0 vote policy, no-self-votes, profile history, and registry target validation still need hooks/state. Channels have ERC721 ownership and protocol fee machinery; Agora's Vue forum does not use the React widgets or channel ownership. A compact contract with Solady is therefore a reasonable fit for **state-readable immutable version history**, not a claim that custom code always beats ECP. Exchange evaluates ECP separately. [EAS](https://github.com/ethereum-attestation-service/eas-contracts/tree/e6e970286ff18bbdfc5d8eff2742c5ece46040e4) stores attestation data and identity well but still needs schemas/resolver/current-head and vote policy; Vault takes that route.

## Contract rules

`contracts/AgoraSocial.sol` has one immutable existing Agora registry, no upgrade/admin/relay authority, no tokens and no NFT. Authors are `msg.sender` of their own wallet transactions. It neither approves nor transfers market assets.

- Profiles append `(name,bio)` SSTORE2 records; publishing supplies expected version count so a stale tab cannot silently overwrite current state. Every version is readable by author and version index.
- IDs are monotonic positive integers. Root comments require an existing registry statement. Replies require an existing parent and exactly its statement context; replies to public blogs have zero statement ID. Parent, author, kind and creation time are immutable. Maximum depth is six, shown in the UI.
- Blog titles are full state strings and bodies are full immutable chunks. Comments/replies: 1–10,000 UTF-8 bytes. Blogs: 1–65,536 bytes; title 1–640 bytes. Profiles: name 1–192 and biography ≤4,000 bytes. Limits count bytes, not code points. The SDK verifies reconstructed body length and hash. Malformed direct-contract UTF-8 body bytes get a per-record replacement display flag, retaining exact readable bytes.
- Author-only edits append a full revision with `expectedVersion`. Old chunks are not overwritten. Author-only hide/restore adds a display tombstone, preserving all content, children, votes and version history; visibility changes are also stored and paginated.
- Each non-author address has one current vote −1/0/+1. Updating applies the exact difference; repeating a value is a no-op. Every change and previous value remain readable from state. This is wallet voting, not a claim of unique-human/Sybil resistance.
- State indexes cover global posts, author posts, author blogs, statement posts, statement roots and direct replies. All array getters have a 50-record maximum and explicit offset. Revision/profile histories can be traversed by index without a hidden five-version cap.
- Events expose profile/post/revision/vote/visibility IDs. Chain activity decoder includes their ABI. Event replay must order `(blockNumber, transactionIndex, logIndex)` and discard reorged block hashes; events are an optional index, not the only archive. Current SDK/API rebuild reads paged contract state at one explicit block and has no persisted cache to trust.

## Layers and user flow

`sdk/social.mjs` is the transaction + exact content adapter; `sdk/social-read.mjs` is the independent RPC fallback read model. The ordinary Agora SDK exposes `social` and `socialReader` even when caller supplies config/ABIs and disables its HTTP API.

`src/components/OnchainSocial.vue` renders a wallet profile with public blog, statement discussion, vote toggles, edit/history, author hide/restore, nested replies and paged direct-thread view. Each publish button asks the wallet to send its own transaction; accepted receipt exposes “Inspect transaction” in the existing activity UI. There is no server signing key or SIWE social write. Wallet/view changes clear unsaved public drafts and invalidate asynchronous results. Private shelf/notebook data is never auto-published. SIWE remains only for private offchain features/jobs and existing governance proposal coordination.

Read feed is deliberately bounded: ten roots per page and up to fifty expanded records; replies remain chronological under parents, including tombstones. Top/New ranks **all root headers** at one snapshot before loading the selected body page. Headers are read in pages of 50 with per-read cancellation; there is no oldest-root cap. Every branch has a direct-replies pager so capped expansion does not make older descendants inaccessible. Full profiles/history and content histories have explicit next-page buttons. Blogs support replies and votes using the same post rules.

Server GET routes are optional mirrors of chain reads: `/profiles/:address`, `/comments/:statement`, `/social/posts/:id`, `/social/posts/:id/{replies,history,votes,visibility}`, `/social/blogs/:author`, `/social/rebuild`. Former server social mutation routes return HTTP 410 with direct-wallet instructions. Existing `.local/app.json` retains legacy profile/comments/votes without migration or deletion, but is no longer consulted as the social source of truth.

## Reproduction and evidence

1. `node --test tests/onchain-social.test.mjs` compiles only AgoraSocial and an isolated test registry, then uses a new in-memory Ganache provider. It does not connect to port 9545.
2. `node scripts/compile-social.mjs` emits only `artifacts/AgoraSocial.json` using the pinned locally installed compiler, Shanghai, optimizer 200.
3. `node scripts/deploy-social.mjs` is additive and local-only: requires chain 31371 + loopback manifest RPC + existing registry code; refuses any existing social deployment file. It writes only `.local/social-deployment.json`, preserving protocol manifest and all market state. Run after contract review; record receipt and before/after market invariants.
4. `node node_modules/vite/bin/vite.js build` builds UI without a Lean/prover job.

Guarded phases use 1 GiB / 60 s maximum, sequential, and `proof/resource-guard.py`. Phase 1: 8/8 isolated tests PASS, 5.603 s, peak 572,651,928 bytes; initial test-only sync-vs-async assertion failure is preserved separately. Final tests/build/deployment evidence is appended below when completed. Tests are not a manual browser acceptance pass.


Final result: 18/18 sequential tests PASS (7.207 s, 591,087,816-byte peak, 1 GiB cap). Deployed address `0xe6e340d132b5f46d1e472debcd681b2abc16e57e`, block 55, transaction `0xeb0a87ddbd84e52218a3180373701484bf43d696667a31b7819576c5e25f60d9`. Manual profiles/blog/discussion/revision/vote/tombstone/reload acceptance used 18 additional social transactions, blocks 56–73. All market statements/pools/T balances remained equal to block 54. Exact public evidence, resource reports and manual-vs-isolated boundaries are in `evidence/onchain-social/`.

Fresh independent startup: `npm run dev` compiles both protocol and social artifacts and additively deploys social when no saved social manifest exists. Existing social address/registry/runtime hash are checked; no automatic replacement of an incompatible saved deployment. This startup extension was statically checked; the currently running chain was never restarted to test it. Existing chain deployment was tested through the same independent `deploy-social.mjs` entrypoint.
