# Public Vault API and wallet RPC

Public mode is explicit: `VAULT_PROTOCOL_VERSION=2`, `VAULT_PUBLIC_ORIGIN=https://<exact-host>` and `VAULT_PUBLIC_OWNER=<real-wallet-address>`. It keeps the existing local API on `127.0.0.1:4173` and the existing persistent chain on `127.0.0.1:9547`. This change does not start a tunnel, change the chain, or make Anvil itself public. Nginx must expose only the built static site, the selected `/api/` surface, and `/rpc` to that API. It must never proxy another path to Anvil or expose Vite, `.state`, source directories, or local runtime files.

Browser config contains `publicMode`, the exact HTTPS `publicOrigin`, `rpcUrl=origin+'/rpc'`, `apiUrl=origin+'/api'`, `publicOwnerAddress`, `publicWriteEnabled`, and explicit capabilities. Internal server SDK calls retain the loopback URL. The config projection excludes local accounts, recovery data, legacy descriptors, and pending deployment actions. The mathematical profile, runtime hashes, selected contract addresses and EAS schema bindings remain available for genuine verification.

## Public routes

| Surface | Public behaviour |
| --- | --- |
| `GET /api/health`, `/config`, `/snapshot`, `/governance`, `/activity` | Selected chain reads; snapshot admission capped at 1,000 statements, pools, allocation epochs and proposals. |
| `GET /api/fixtures`, `/external-proofs` | Fixed published fixture/catalog files; original EVM and governed bridge verification still happens in the browser SDK through RPC. Fixture file cap 256 KiB. |
| `GET /api/profiles/:address`, `/blog/:address`, `/comments`, `/social/snapshot` | Onchain EAS data/cache reads. Forced server rebuild is rejected; bounded client RPC reads remain available. |
| `GET /api/auth/nonce`, `/me`; `POST /api/auth/verify`, `/logout` | Exact-origin SIWE sessions only. HTTPS secure, HttpOnly, SameSite=Strict cookies; five-minute one-use nonce and one-hour session; bounded maps. SIWE gives no authority to post social records or spend funds. |
| `POST /rpc` | Exact JSON-RPC allowlist below. No cookie/session authority. |
| All other routes | Default deny in public mode, including jobs/native Lean, server GitHub/Palomar import, private packages, source publication, legacy offchain records, private exports, mining and admin paths. Local mode remains separate. |

Curated four-certificate loading and generic external-bundle verification/import remain available. The generic path uses the existing client validator and original onchain verifier; it does not require a public server upload endpoint. Source-fetch/publication and server-generated package download are intentionally unavailable in this public pilot; their capability flags are false. This does not claim source→goal verification from a source SHA.

## RPC admission

Reads are limited to `eth_chainId`, `net_version`, `eth_blockNumber`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_syncing`, `eth_accounts` (locally answered with `[]`), `eth_getBalance`, `eth_getCode`, `eth_getTransactionCount`, `eth_getStorageAt`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_getBlockByNumber`, `eth_getBlockByHash`, `eth_call`, `eth_estimateGas`, `eth_feeHistory`, and `eth_getLogs`.

The sole state-changing method is `eth_sendRawTransaction`, enabled only after the administrator-migration verifier passes. The gateway uses pinned ethers 6.13.5 transaction decoding/signature recovery, requires chain31373 and canonical signed type0/1/2 serialization, and rejects the first20 addresses derived from the historically public Anvil mnemonic. Unsigned and chain-unprotected transactions, blob/authorization types, node signing, `eth_sendTransaction`, filters/subscriptions, and every unlisted namespace/method are rejected. The entire JSON envelope is validated before forwarding any user request. Duplicate decoded JSON keys, duplicate IDs, notifications and any batch containing a signed transaction are rejected. A broadcast transport failure returns the signed transaction hash with an **unknown outcome**; the gateway never retries a broadcast.

| Limit | Value |
| --- | --- |
| RPC JSON body / response | 512 KiB / 2 MiB (including aggregate batch response) |
| Batch | 1–10 reads, processed sequentially; no write batch |
| Raw transaction / calldata | 128 KiB each |
| Simulation/transaction gas | 15,000,000; missing simulation gas is bounded explicitly |
| Simulation overrides | No state/block overrides; no contract creation simulation |
| Logs | Address filter required, at most16 addresses,4 topic positions,64 alternatives/position,2,000 blocks; latest captured before forwarding |
| Fee history | At most20 blocks and20 percentiles |
| RPC wall time / concurrent requests | 10 seconds /4, no waiting queue |
| RPC rate | 1,200 methods/minute globally |
| API JSON body / response | 16 KiB /3 MiB |
| API reads | 15 seconds /2 underlying handlers; a timed-out handler holds its slot until reads finish |
| HTTP rate | 300 requests/minute globally and120 per trusted proxy client key; bounded1,024-key map |

These are admission limits, not a demonstrated multi-user throughput benchmark. The live website and real extension-wallet transport still require an ordinary check after the exact public URL and migrated rights are installed. SDK log pagination is coordinated separately so a growing chain is queried within the gateway range limit.

## Origin and proxy boundary

The API requires `Host` equal to the configured public host. Nginx uses that fixed upstream Host for both public access and the optional local preview. `/api/*` allows only the exact public Origin, and authentication POSTs require it. `/rpc` supports wallet-extension/mobile origins using CORS `*` **without credentials**; only verified raw signatures can request a transaction. A cross-origin request does not grant node signing or session authority.

Nginx must **replace**, not forward or append, `X-Vault-Client-IP` using its trusted client identity. Express does not enable broad `trust proxy` or trust arbitrary `X-Forwarded-For`. If the tunnel/proxy cannot establish distinct client identities, the rate limiter uses a shared proxy bucket; global limits remain effective. Also set proxy body/time/connection limits. Do not expose an alternative direct RPC tunnel that bypasses this application gateway.

## Migration gate and limits of filtering

`VAULT_PUBLIC_WRITES=1` alone cannot enable writes. `createPublicPolicy` requires a real owner plus a separately reviewed `writeReadiness` callback; the default is false, including callback failure. Browser capabilities and signed-RPC admission use the same gate. Public-mode startup does not create/recover a proof worker or rewrite its job history.

Rejecting a known development **sender** is defence in depth, not administrator migration: an attacker can put a public-key holder's signature into somebody else's transaction (`permit`, delegation or other signature-authorized calls). Membership, old voting snapshots/queued proposals, contract roles, and relevant assets must be inspected and migrated on the actual preserved chain. Do not claim a gateway makes publicly known keys private or revokes old rights. Ordinary chain-native governance remains authoritative after migration.

## Validation and provenance

`test/public-rpc.test.mjs` and `test/public-surface.test.mjs`:15 meaningful tests passed, including real offline signature recovery, malformed/wrong-chain/dev-sender refusal, no partial forwarding, range/state-override limits, timed-out broadcast hash/no retry, real ephemeral loopback HTTP Host/Origin/route checks, config filtering and read-slot retention. They use no main-chain connection or transaction. [Final guard report](../evidence/public-api/tests.json):0.532s,164,804,744 bytes sampled footprint under512MiB, cleanup errors empty. An earlier run could not bind loopback in the sandbox; the first permitted HTTP run caught a test-client Host-header issue, corrected using Node's HTTP client. Those are not public-network or main-chain validation claims.

Primary references: [Ethereum execution JSON-RPC specification](https://github.com/ethereum/execution-apis/tree/main/src/eth), [ethers Transaction API](https://docs.ethers.org/v6/api/transaction/), [pinned ethers6.13.5 transaction source](https://github.com/ethers-io/ethers.js/blob/v6.13.5/src.ts/transaction/transaction.ts), and [Express proxy trust requirements](https://expressjs.com/en/guide/behind-proxies/). Implementation is in `server/public-surface.mjs` and `server/rpc-gateway.mjs`; it does not implement cryptography itself.

### Live administrator-readiness check

After the preserved chain restarted, the [actual read-only audit](../evidence/public-pilot/readiness.json) passed at block601; a second call checked the next block602 via authority events. All28 runtime pins and expected authority/contract bindings matched. The historical atomic membership cutover was observed at580; the real owner held one MEMBER and every one of the20 known development accounts had zero MEMBER and votes. Current fee epoch2 routed85% to the owner and15% to the unchanged Timelock treasury. Later legitimate membership changes remain possible; the live gate checks revoked development authority rather than imposing a permanent one-member DAO.

The full audit took2,503.9ms (239 storage calls); the following event-validated call took47.6ms and used six read RPC requests, with no `eth_call` or code reload. The [whole guarded process](../evidence/public-pilot/readiness-resources.json) finished in2.984s with69,180,808 bytes sampled footprint and no cleanup errors. No transaction, API restart, tunnel exposure or public-browser action was performed by this check. Evidence SHA256:`62cef07fd60838022277b817a0da8aea488709309f9895fdb7061cb120b3416f`.
