# V2 social: exact existing path for the next browser smoke

Read-only preparation, 2026-09-10. No social transaction, browser action, source/HMR change or service restart was made for this review. At historical block 425 all three runtime hashes and schema/registry links match the V2 descriptor; the current public API returns version `2` and the same resolver. There are **zero resolver revision logs through 425**. Legacy browser results at 129–147 remain evidence for that separate resolver, not completed V2 content tests. [Actual read checks](../evidence/monetary-policy/social-readiness-425.json).

## Exact selected graph

| Component | Address |
| --- | --- |
| V2 StatementRegistry | `0x3347B4d90ebe72BeFb30444C9966B2B990aE9FcB` |
| Original SchemaRegistry | `0x40918Ba7f132E0aCba2CE4de4c4baF9BD2D7D849` |
| Original EAS | `0xF32D39ff9f6Aa7a7A64d7a4F00a54826Ef791a55` |
| VaultSocialResolver | `0xd6e1afe5cA8D00A2EFC01B89997abE2De47fdfAf` |

`server/runtime-version.mjs` selects `.state/social-deployment-v2.json`; `server/index.mjs:ctx()` rejects a mismatched chain instance or statement registry. Startup `scripts/social-setup.mjs` also checks runtime hashes, original EAS→SchemaRegistry and resolver→StatementRegistry links, all schema strings, UIDs, resolver bindings and nonrevocability. `sdk/index.mjs` constructs `sdk.social` from this selected configuration. This is explicit version separation; legacy names/posts are not migrated automatically.

## UI → existing SDK → original EAS

All writes below call **the wallet's direct `EAS.attest`**, with recipient=wallet, expirationTime=0, revocable=false and value=0. `attester` is set by original EAS from the actual signer. SIWE is not posting authority. Full ABI-encoded text lives in original `Attestation.data`; the resolver enforces authorship, context and revision rules.

| UI action | Existing SDK call / canonical data |
| --- | --- |
| Connect Account0 → «Мой профиль» → «Сохранить профиль» | `social.updateProfile(displayName,bio,{previousUID,isCurrent})`; profile schema stores `(string,string,bytes32 previousUID)`, refUID=previousUID. `App.svelte:saveProfile` fences viewed owner, wallet/client and profile generation. |
| Open V2 market `0x390403d03c5e8c37534c14ee5b1a56b9004da93d40a171ee9ba7ae8d62bbfd08` → «Добавить комментарий ончейн» | `social.createEntry({kind:2,statementId,text})`; new root/previous/parent are zero. Resolver requires that statement in its immutable V2 registry. |
| Switch Account1 → «Ответить» → «Отправить ответ ончейн» | Same `createEntry`, kind2 and same statementId, parentId=stable root UID. For a blog reply statementId=zero and context comes from its canonical parent. |
| Account1 ↑ / ↓ / click current selection again | `social.vote(rootUID,1|-1|0)`; new vote attestation stores `(targetUID,previousVoteUID,value)`, refUID=targetUID. One current value per wallet/root, no self-vote; switching subtracts the previous score before adding the new value. |
| Author «Изменить» → «Сохранить редакцию ончейн» | `social.editEntry(rootUID,{title,text,deleted:false},{previousUID,isCurrent})`; fixed author/kind/statement/parent, compare-and-set against latest UID. |
| Author profile → «Новая запись блога» → «Опубликовать ончейн» | `social.createEntry({kind:1,statementId:zero,title,text})`; root/parent/previous zero. This is an ordinary social post, distinct from the still-blocked Lean source-package publication. |
| «Скрыть новой редакцией» / «Восстановить / править» | `editEntry` creates another immutable revision, never erases original text. Hidden parents reject new direct replies and nonzero votes; existing descendants and vote withdrawal remain available. |
| «Открыть обсуждение», «Перечитать блокчейн», profile deep link/reload | Read-only `blogThread`, `snapshot({rebuild:true})`, `profile`, `comments`, `blog`; retrieve original EAS records by UID and fold sorted resolver events. Hidden blog discussion has a separate read control. |

Implementations are [sdk/social.mjs](../sdk/social.mjs), [SocialPanel.svelte](../web/SocialPanel.svelte), [SocialEntry.svelte](../web/SocialEntry.svelte), [App.svelte](../web/App.svelte) and [VaultSocialResolver.sol](../social/contracts/VaultSocialResolver.sol). The UI clears drafts and invalidates late results on account/client/statement/blog changes. SDK rechecks the actor after awaited reads and the resolver rejects stale previousUID or context changes onchain.

## Small future manual sequence and observations

1. Account0 saves a reviewed test profile and one market comment; verify receipt, actual EAS attester, full text, schema UID and V2 resolver event. Do not infer V2 content from the legacy profile.
2. Account1 replies and exercises +1 → −1 → 0; verify exact previous vote UID, score changes and full vote history. Account0's self-vote controls should remain disabled.
3. Account0 edits its comment and creates one reviewed blog post; Account1 replies to that post. Hide/restore only those new test entries if included in the agreed browser scope, retaining text/history and access to existing replies.
4. Explicitly rebuild, disconnect and reload the own profile link. Public text/history must survive; submitting writes must require a wallet. Record V2 T/CTF/market outcome and MEMBER balances before/after to distinguish social records from settlement or governance weight.

No generic source publication, certificate computation, monetary transfer or blocked legacy action is needed. Public API reads (`/api/profiles/:address`, `/api/comments`, `/api/blog/:address`, `/api/social/snapshot`) rebuild from chain; former social-write HTTP routes return410. The SDK currently rebuilds full social history in 2000-block windows with eight concurrent EAS reads; large-history pagination/checkpoints remain a known scaling limitation, not a blocker for this small smoke.
