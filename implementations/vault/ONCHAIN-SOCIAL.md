# Vault: onchain profiles, research blog and discussions

Current implementation uses **original Ethereum Attestation Service 1.9.0 + SchemaRegistry**, with a small MIT `VaultSocialResolver`. Profile text, blog posts, comments, replies, every edit and every vote value are ABI bytes in the original EAS `Attestation.data` storage. There is no IPFS dependency, content-hash-only substitution, or SIWE-authoritative social write. These attestations prove wallet authorship of social content; they do not prove mathematical truth or change the existing ZK settlement/Governor weight.

## Components and reproducible local setup

- Exact packages, npm integrity and original source SHA-256: [social/provenance.json](social/provenance.json), [isolated lockfile](social/package-lock.json).
- EAS contracts npm **1.9.0**, release gitHead `3683c3ec9383091eebd6f183e67b485e09a53dd7`, MIT. Contract `version()` is **1.4.0** (different version series). Original EAS/SchemaRegistry files are unchanged.
- The isolated `social/` package pins **OpenZeppelin 5.3.0** and **solc 0.8.29**, with Paris EVM, optimizer200/viaIR. Main Balancer compilation remains on its existing OZ5.2/solc0.8.28 dependencies. EAS and OZ [license copies](social/licenses/) are retained.
- [Resolver source](social/contracts/VaultSocialResolver.sol), [direct EAS SDK](sdk/social.mjs), [compile script](social/compile.mjs), [additive deploy script](social/deploy.mjs). The SDK uses the original ABI through the application's existing ethers6; the current upstream EAS SDK pins another contracts release, so it is not used as a replacement contract bundle.

From this implementation's directory: `npm --prefix social ci --ignore-scripts --no-audit --no-fund`; `node social/compile.mjs --test`; `node social/test.mjs`. Compilation/tests were run under the repository resource guard, at most1GiB and60s per phase. The test script owns a temporary Anvil on19547, always terminates it and never connects to the existing market chain9547. `TestSocialRegistry` is only its fixture; the live resolver binds the real `StatementRegistry`.

`node social/deploy.mjs` is explicitly restricted to the existing local chain31373/RPC9547. It creates three contracts, verifies schemas, and writes `.state/social-deployment.json`; rerunning verifies code hashes and sends no transactions. It never resets/replaces markets. Before and after first deployment it compares all existing contract code hashes, statement/pool state and active statement proof-profile manifests. The normal `npm run dev` now performs this step before starting the API, so a fresh deployment exposes `config.social` automatically; the ordinary SDK then exposes `sdk.social`. A separate manual command remains available.

## Schema and policy

All three schemas are nonrevocable, nonexpiring, recipient=attester and use the immutable resolver. Its constructor registers them in original SchemaRegistry. An accepted EAS callback enforces canonical ABI, byte caps and exact schema UID. The original EAS sets `attester=msg.sender` for direct transactions; the application never claims a wrapper's caller address as the EAS signer.

| Type | Complete stored fields | Resolver constraints |
|---|---|---|
| Profile | displayName, bio, previousUID | Current previousUID per wallet; max80/2048 UTF-8 bytes; empty fields permit clearing |
| Entry | kind, statementId, rootUID, parentUID, previousUID, title, body, deleted | Stable root/author/kind/statement/parent; edit references latest UID; blog body≤16384, comment≤8192, title≤180 bytes; original record remains readable |
| Vote | targetUID, previousUID, value | One current value per(wallet,targetRoot), −1/0/+1, no self-vote, latest UID check, onchain score delta |

Kind1 is a personal blog post; kind2 is a comment. Top-level market comments require a real statement. Blog posts have statementId0 and their own root context. Replies must target an existing, live canonical parent root in the same statement context. Reply-to-reply works. An edit cannot move a comment to another market or thread. Votes target stable entry roots, not arbitrary revision UIDs.

Deletion is a new `deleted=true` revision. It does not erase original text or existing descendants. The author can restore the entry with a later nondeleted revision; current deleted targets reject new replies and new votes, but an existing voter can withdraw with value0. A failed batch reverts both EAS records and resolver updates. Original EAS stores all batch records before its resolver callback; tests cover create→edit→reply and rejection of two competing edits in one batch.

## Web / SDK / API

Open a market → **Обсуждение ончейн**, or click a wallet author → profile modal → **Личный исследовательский блог**. Wallet owners can save name/bio, publish a blog entry, edit/restore/hide their entries; other wallets can reply or vote. The web sends an original `EAS.attest` transaction, waits for its receipt and shows UID, block and transaction. Every edit and vote has a public history. Signing into SIWE only unlocks private source/job tools; failure of SIWE does not make a social transaction valid or invalid.

Every blog post has a separate **Открыть обсуждение** read control, including hidden posts. Opening it preserves access to existing replies and history. A hidden parent has no direct-reply composer; a live existing reply can still be selected as a reply target. **Ответить** remains a distinct writing control.

```js
const sdk = createSDK(config, abis, walletSigner);
await sdk.social.updateProfile('Ada', 'Research notes');
await sdk.social.createEntry({ statementId, text: 'Could this lemma help?' });
await sdk.social.createEntry({ kind: 1, title: 'A new approach', text: 'Full blog text' });
await sdk.social.editEntry(rootUID, { text: 'Revised text' }, { previousUID });
await sdk.social.vote(rootUID, 1); // −1 changes; 0 withdraws
const recovered = await sdk.social.snapshot({ rebuild: true });
```

For asynchronous editors, pass `isCurrent: () => walletAndFormGenerationStillMatch` in the last options argument. Writes capture input and actor, recheck wallet/chain after awaited reads, and let the resolver reject a stale previousUID. Component wallet/context changes clear drafts and invalidate late reads/results. No read/import action automatically sends a transaction.

Public API reads `/api/profiles/:address`, `/api/comments?statementId=…`, `/api/blog/:address`, `/api/social/snapshot` rebuild from RPC. Browser SDK reads go directly to RPC, including **Перечитать блокчейн**, so server-index storage is not required. The SDK's in-memory cache is keyed by block hash; log order is explicitly sorted, EAS reads have concurrency8, logs are fetched in2000-block windows, and revision history is accumulated linearly. Large deployments will need pagination/checkpointing; this implementation currently rebuilds the requested chain's social history in full.

Former PUT/POST/PATCH social API writes return410 even with SIWE. Existing `.state/community.json` is preserved and accessible only through explicitly labelled `/api/legacy/comments` and `/api/legacy/profiles/:address` historical reads; it is not silently attributed as new onchain transactions. Re-publication requires that author's wallet transaction. Private job/package/source-publication functionality retains its separate authorization model.

Block explorer recognizes original `Attested` and resolver `ProfileRevision`, `EntryRevision`, `VoteRevision` events. Full text is fetched from EAS by UID; resolver events also bind root/author/context and vote score. The application never substitutes a locally cached profile for an absent onchain profile.

## Observed validation and deployment

Initial contract+SDK validation: **24/24 isolated checks passed** in4.766s, whole-process-tree peak105,344,232B. Includes original EAS full Unicode/storage/authorship, immutable schemas, source-independent RPC rebuild, stale/foreign edits, forged recipient, malformed ABI, byte caps, unknown/cross-market parent, depth2 replies, ±1→−1→0, tombstone withdrawal and batch atomicity. Compile:9.98s/240,621,856B; EAS runtime14,724B, resolver6,281B. Vite built in1.35s;18 existing certificate selection/import checks also passed. These are automated checks, not browser evidence. Reports: [evidence/onchain-social](evidence/onchain-social/).

Additive live local deployment, chain instance `554c825d-6813-43bf-9bf0-6ede06acff4d`:

| Contract | Address | Block / receipt |
|---|---|---|
| SchemaRegistry | `0xc351628EB244ec633d5f21fBD6621e1a683B1181` |126 · `0xb5f4c5a21a7e9c042a0a2f3f80e89052e7cf642cc1141a229be85b253662cc6f`|
| EAS | `0xFD471836031dc5108809D173A067e8486B9047A3` |127 · `0x4a0bfe6fcddb329ad7558472483474836028ffc58001b1fababb06afa109e890`|
| VaultSocialResolver | `0xcbEAF3BDe82155F56486Fb5a1072cb8baAf547cc` |128 · `0xae81a4973815ff0f281945a550d27f41d92c33251858c090937300a482a73e01`|

All receipts status1. Protected state comparison passed:2 statements/1pool, all original code and proof-profile manifests unchanged; digest `0x57fb7d1b3b024798c4f8b9ee690fef2dd4539333fedd354ce3cd1d80a325b9ee`. Runtime hashes and schemas are in [deployment evidence](evidence/onchain-social/deployment.json). API-only restart retained the existing Anvil; health/config/social reads returned200 at block128. No social content was seeded by the deployment script. Subsequent manual browser validation is recorded separately by the coordinating agent.

The coordinator's actual social transactions129–147 are independently captured in [social-browser-rpc.json](evidence/social-browser-rpc.json): exact receipts, decoded full EAS data and authors, historical resolver state per receipt, fresh reconstruction and unchanged protected market state. This includes profile/blog/comment revisions, voting, replies, hiding144/146 and restoration145/147. The hidden-blog follow-up expanded the isolated suite to **26/26**, in5.299s with peak100,674,576B; the UI build passed in1.36s.

The final coordinator browser follow-up passed: after hiding146, opening an initially unselected post through **Открыть обсуждение** showed its existing reply141 while a new direct reply remained disabled. Restoration147 preserved text, reply and five previous versions. Explicit rebuild read block147; explicit logout disabled writes and retained public market/profile/comment reads; a real root-page reload still recovered the author's complete blog/history. Final block147 hash `0x87d5d06de8a50ebca3b4a85fd52886da88fb118f4c0569a971e0eedc8cfa5af9`; protected market digest unchanged from128. These browser observations belong to the coordinator; the evidence collector sent no transactions.

## Startup integration verification

The three production artifacts `EAS.json`, `SchemaRegistry.json` and `VaultSocialResolver.json` are deliverables; they are reproduced by the pinned isolated compiler above but ordinary startup does not rebuild them. `social/.gitignore` excludes only generated `TestSocialRegistry.json`, which production deployment does not read. `scripts/social-setup.mjs` checks existing chain-instance/runtime/immutable-registry/schema bindings and calls the existing additive deployment script only as the setup step. It refuses foreign/missing runtime instead of resetting the chain.

Five orchestration tests cover first deployment, existing-record verification without artifact requirements, foreign chain/missing artifact refusal, changed runtime and changed schema policy. The read-only `scripts/check-social-setup.mjs` then verified the real three runtimes, both immutable registry links and all nonrevocable schema strings at block188, unchanged before/after: [startup-runtime.json](evidence/onchain-social/startup-runtime.json). No fresh full-chain boot or new social transaction is claimed by this specific check; original additive deployment126–128 and isolated contract tests remain the independent EVM evidence.
