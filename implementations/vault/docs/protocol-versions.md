# Protocol versions on the persistent Vault devnet

US-023 adds governed T issuance, rewards and fee policy. Existing T and registry collateral are immutable; source changes cannot turn the existing token into a mintable token. The selected approach is an additive V2 protocol graph on the same chain31373, reusing membership governance where specified by the deployment. Existing markets and collateral remain at their original addresses.

The V2 plan starts T at zero supply. Membership voting already exists independently of T, so ordinary governance can make the first explicitly reviewed issuance to participants before they trade or supply liquidity. Reward-program issuance is a separate option; earning rewards from nonexistent prior trading is not the bootstrap mechanism. The new allocation starts with the current legacy recipient proportions captured at one block; it does not transfer old funds or claims.

## Explicit runtime selection

| Selection | Deployment / ABI | Social descriptor | Local app records |
| --- | --- | --- | --- |
| `VAULT_PROTOCOL_VERSION=legacy` (default) | `.state/deployment.json`, `.state/abis.json` | `.state/social-deployment.json` | `community.json`, `publications.json` |
| `VAULT_PROTOCOL_VERSION=2` | `.state/deployment-v2.json`, `.state/abis-v2.json` | `.state/social-deployment-v2.json` | `community-v2.json`, `publications-v2.json` |

All paths are under this implementation's `.state/`. The original chain database is shared and is never reset by selecting a protocol version. There is no implicit conversion of old T, positions, social records or beneficiary rights. EAS resolvers bind an immutable statement registry, so V2 uses a separate resolver/descriptor; legacy content remains accessible through the legacy runtime.

After an explicit successful V2 deployment, select it with:

```sh
VAULT_PROTOCOL_VERSION=2 npm run dev
```

This command is **not** a deployment recipe. The separate `node scripts/deploy-v2.mjs` prepares a review; its explicit `--execute` phase deploys the reviewed additive graph. If the selected descriptor is missing or carries the wrong version, startup fails and never falls back to legacy or silently deploys V2. An existing API must match the selected token, registry, coordinator, Vault, protocol version, chain instance and RPC—not merely chainId or the shared Governor. Stop/switch only the app processes using those ports when changing the running version; do not restart or reset the chain as a workaround.

The runtime selection is process configuration, not an unrestricted API path parameter. The server and social deployment/verification use the same versioned paths. A V2 config must contain `protocolVersion: "2"` and monetary-policy metadata with `version: "vault-monetary-v1"`, `status: "deployed"`; a merely planned descriptor is rejected. The typed SDK separately verifies concrete contract capabilities and authority.

## Verification so far

2026-09-10: ten targeted runtime/social-setup tests pass (233ms total, Node heap128MiB). They verify missing V2 never falls back to populated legacy, distinct persisted stores, wrong API graph rejection despite identical chain, strict version selection, and V2 social setup leaving legacy descriptor bytes intact. Existing social runtime/schema checks remain covered. These are isolated filesystem/RPC-double tests; they do not claim that V2 has been deployed or manually exercised. No live services or chain state were changed by this test run.

Subsequently, the explicit reviewed deployment completed17 transactions at blocks261–277 on that same persistent chain, without restarting it. New T is `0x276C216D241856199A83bf27b2286659e5b877D3`, new registry `0x3347B4d90ebe72BeFb30444C9966B2B990aE9FcB`, RewardBudget `0x525C7063E7C20997BaaE9bDa922159152D0e8417`. The current Timelock owns the token and registry. Supply, statements and programs are all zero at277. Final scoped authorizer installation succeeded in transaction `0x2f7ec07d3d9ccb6fa74f391abe4dc958e7d39eaf429bbec0e794fbc811c2f740`.

The separate V2 EAS SchemaRegistry/EAS/Resolver deployments then succeeded at278/279/280. The resolver is `0xd6e1afe5cA8D00A2EFC01B89997abE2De47fdfAf`, bound to the new registry; all three nonrevocable schema strings/UIDs, constructor arguments and runtimes were independently verified. The old social descriptor SHA and old social runtimes remain unchanged. This is deployment evidence, not an automatic transfer of legacy profiles or a browser social-content test. [Public setup receipts/bindings](../evidence/monetary-policy/social-setup-278-280.json).

V2's first issuance was subsequently exercised through root's ordinary browser Governor flow: proposal281, votes284/285, queue296, execution307. Supply and Account0 balance are1000T after that execution; the other three test-wallet balances are0. Membership remains4MEMBER with unchanged individual balances/votes. Legacy9 statements,3 pool/BPT states, originalT/NO holdings and epoch4 allocation compare equal at277/307. Reward programs and V2 markets remain0. [Exact mint calldata, receipts, quorum and state comparison](../evidence/monetary-policy/initial-mint-281-307.json).

Legacy descriptor/ABI/social descriptor bytes, its9 statements, epoch4, original T supply and tested wallet/CTF collateral balances match before and after. New initial allocation is Bob40% / Timelock15% / Alice45%, a copy of current proportions without old funds or claims.28 deployed/reused runtime hashes were checked. The governed v3/perf05 profile calls and operator admission were prepared but not submitted by the deployment; the existing verifier reference was retained to permit independent cryptographic checking. [17 receipts, events and invariant comparison](../evidence/monetary-policy/deployment-261-277.json), [exact calls prepared at block 277](../evidence/monetary-policy/pending-governance-calls.json), [version implementation and recovery](../MONETARY-POLICY-V2.md).

The next ordinary browser cycle admitted perf05 at 334 (proposal 308, votes 311/312, queue 323). The exact zero-axiom profile/bridge/manifest were checked, and original-verifier plus governed-bridge verification accepted the existing genuine CI registration certificate at 334. Bob registered the TRUE fixture at 335: statement `0x390403d03c5e8c37534c14ee5b1a56b9004da93d40a171ee9ba7ae8d62bbfd08`, condition `0xd9bac8eacc827a99ff50428c7aa37c420e1b059ef545cf65f347e3f4853beb2f`. The new registry oracle gives it a different CTF condition from legacy. The market remains open; registration alone does not establish the outcome. V3 and the operator remained unadmitted at 335. All tested legacy and MEMBER state again matched 307/335. [Admission and registration evidence](../evidence/monetary-policy/profile-market-308-335.json).

At 343, the first V2 pool `0x75ba1e7c0AC567f3451D2646f1db5eAbc99d07f7` contains 20 T + 20 YES, with 50/50 weights and 1% swap fee. Normal browser split/LP actions at 336–343 left supply 1000 T, CTF collateral 30 T, Alice 950 T / 10 YES / 30 NO and zero reward programs. This establishes initial liquidity only; later governance fee updates, trades, rewards and resolution have separate evidence. [Historical pool, runtime and balances](../evidence/monetary-policy/initial-liquidity-336-343.json). A read-only Lean Lab check at displayed block 347 also showed the actual selected V2 registry and admitted perf05 bridge with the corrected “Профиль включён” label. [Browser observation](../evidence/monetary-policy/catalog-browser-347.json).

The subsequent browser policy cycles executed total swap fee 2% at 370, creator share 25% at 397 and global protocol share 10% at 424, each through the existing Membership Governor and Timelock with 2 For / quorum 2 MEMBER. A separate original-controller synchronization at 425 changed the existing pool cache from 0% to 10%; setting the global default alone had not changed it. The measured aggregate share is 32.5% of swap fees. Protected pool/token/member/legacy-asset balances, allocation and program count remained unchanged through these fee-only stages. No migration of old collateral or beneficiary claims occurred. [Exact cycles, cache behavior and limitations](../MONETARY-POLICY-V2.md#governed-fee-policy-and-explicit-existing-pool-synchronization).


The selected V2 subsequently completed the [browser monetary cycle through 552](US023-BROWSER-RESULT.md): governed supply 1006 T, genuine TRUE settlement533, four reward claims, LP principal/exit/redemption and all programs closed with budget/reserved zero. Exact original certificate binding is preserved in [resolution533](../evidence/monetary-policy/resolution-533.json). No old token, collateral or social graph was implicitly converted.
