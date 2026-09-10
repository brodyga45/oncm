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

This command is **not** a deployment recipe: V2 deployment tooling is being implemented separately. If the selected descriptor is missing or carries the wrong version, startup fails and never falls back to legacy or silently deploys V2. An existing API must match the selected token, registry, coordinator, Vault, protocol version, chain instance and RPC—not merely chainId or the shared Governor. Stop/switch only the app processes using those ports when changing the running version; do not restart or reset the chain as a workaround.

The runtime selection is process configuration, not an unrestricted API path parameter. The server and social deployment/verification use the same versioned paths. A V2 config must contain `protocolVersion: "2"` and monetary-policy metadata with `version: "vault-monetary-v1"`, `status: "deployed"`; a merely planned descriptor is rejected. The typed SDK separately verifies concrete contract capabilities and authority.

## Verification so far

2026-09-10: ten targeted runtime/social-setup tests pass (233ms total, Node heap128MiB). They verify missing V2 never falls back to populated legacy, distinct persisted stores, wrong API graph rejection despite identical chain, strict version selection, and V2 social setup leaving legacy descriptor bytes intact. Existing social runtime/schema checks remain covered. These are isolated filesystem/RPC-double tests; they do not claim that V2 has been deployed or manually exercised. No live services or chain state were changed by this test run.
