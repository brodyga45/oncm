# Public Vault browser transport and wallet onboarding

## Multiple installed wallets (10 September 2026)

The public menu discovers named providers using [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963).
Previously the generic button used `window.ethereum`, which selected Uniswap in the user's
Chrome even with MetaMask installed. Each named button now captures its own provider for
account consent, network selection, SIWE, final account/chain checks and transaction signing.
Account/chain/disconnect listeners attach only to the connected provider and are removed
on disconnect. A legacy unnamed fallback appears only if no providers announce themselves.
Late announcements remain supported; opening the menu also requests discovery again.
Names are rendered as text, without wallet-provided SVG icons or HTML.

Validation: 12 discovery/transport tests passed and Vite build passed. The rebuilt public
site was reloaded in the user's actual Chrome; the wallet menu displayed both
«Подключить MetaMask» and «Подключить Uniswap Extension». This verifies real discovery
and UI delivery, not completion of the MetaMask approval flow. The user must select
MetaMask and approve the account/network prompts in the extension. Chain history and
deployment were not modified or restarted for this fix.

### Pending connection follow-up

The user then observed an indefinitely pending MetaMask connection. The previous
flow awaited `/auth/logout` before requesting accounts, unnecessarily separating
the wallet prompt from the click. Account requests now dispatch synchronously;
session cleanup follows wallet verification and has a15-second HTTP timeout.
Public mode no longer requests SIWE for the disabled private job tools. Profile
and blog authorization remains the sender of each signed EAS transaction.

The menu displays the current wallet RPC stage, with instructions to open the
extension manually if its popup is absent. Connection RPCs time out after60seconds,
and `-32002` explains an already pending wallet request. Timing out cannot cancel
the extension's prompt: the user must dismiss it before retrying. A closed attempt
rejects late results and subsequent requests, preventing delayed consent from
silently continuing into network changes/login. Successfully connected signers
forward later transactions normally, without applying the connection timeout.
Snapshot refresh has a20-second HTTP timeout so it cannot indefinitely hold the
global busy state at the end of connection.

15 connection/discovery/transport tests passed; Vite build passed and updated the
nginx-served static files. Browser reload was attempted, but the subsequent browser
inspection timed out, so this follow-up does not claim successful MetaMask login.

The explicit server projection uses `publicMode: true`, `publicOrigin`, `publicWriteEnabled`, `capabilities.walletTransactions`, and optional `publicOwnerAddress`. Browser RPC is always the validated HTTPS origin plus `/rpc`; API requests retain `/api` on the same origin. A local nginx preview receiving a public deployment descriptor shows a link to the configured public site instead of silently trusting another origin or exposing the internal RPC. Server-side SDKs retain their separate loopback configuration.

The normal **Подключить кошелёк · Vault 31373** action shows the exact public RPC, chain 31373, test ETH for native gas, and the separate protocol T token. It requests a network switch through EIP-1193. Only an unknown-chain error (`4902`) prompts adding the configured network, followed by another switch and a chain-ID check. Rejection is propagated; no alternate request follows a user rejection. Adding a chain does not imply selection. The implementation reuses ethers BrowserProvider and follows [EIP-3085](https://eips.ethereum.org/EIPS/eip-3085) and [EIP-3326](https://eips.ethereum.org/EIPS/eip-3326).

The injected RPC must also return the pinned V2 StatementRegistry and T runtime bytecode. A wallet already pointing at another network with chain ID 31373 is rejected; the user must select the displayed RPC in their wallet. Network addition is wallet-controlled and is not claimed to replace an existing wallet RPC automatically. Account/network lifecycle changes continue to clear private results, prepared reviews and SIWE state.

Until both explicit public write flags are enabled, the UI shows a read-only notice, transaction handlers refuse, and the injected-provider adapter rejects transaction requests and financial typed signatures before forwarding them. SIWE personal signing remains available. This is defense in depth, not authorization for public RPC mutations: server/gateway admission is authoritative. Readiness changes clear the connected wallet so the user reconnects with a fresh descriptor.

Public mode hides development wallets, block/time helpers, native Lean job controls/history, server Git snapshot fetching and the server package editor/export/publication panel, matching the API's explicit disabled capabilities. `localWallet` and mining are additionally guarded at the function boundary. Local mode keeps its established explicit loopback/port-offset behavior. The prepared external-certificate UI, all four curated loaders, generic import and original EVM verification remain available; no proving is introduced.

## Validation and remaining deployment acceptance

`node --test test/public-transport.test.mjs test/local-endpoints.test.mjs`: **8 passed**, 456.8 ms. Tests cover HTTPS origin binding, local offset preservation, exact wallet metadata, switch/add ordering, rejection without fallback, failed switch postcondition, read-only signer admission and wrong/missing deployment code despite matching chain ID. These are mocked provider checks, not a claim that a real browser wallet has connected to a deployed tunnel.

One Vite build passed in 1.74 s; [guard evidence](../evidence/public-web-build-resources.json) records 2.353 s whole-tree time, peak 378,389,192 bytes, exit 0 and clean cleanup under 768 MiB/60 s. The existing bundle-size warning remains. No chain transaction, network deployment, daemon change, proving or key generation was performed in this UI task.

Public HTTPS routing, real wallet network confirmation, initial gas onboarding and approved write readiness require the coordinated public deployment acceptance. Native test ETH is needed to submit a wallet transaction; an onchain faucet alone cannot pay the first transaction from a zero-ETH account without a separately specified funding mechanism.

The completed follow-up wraps public ethers `getLogs` calls into sequential 1000-block pages with one captured latest block. Literal block-hash queries remain unchanged. Aggregation is bounded to 10,000 logs / 8 MiB / 128 pages; overflow raises an explicit narrowing error rather than returning incomplete history. This works for both read-only and injected providers; local providers retain their original methods. Four pagination tests plus the existing transport/local/snapshot/log-rotation tests passed, 15 total. The final build covering these later changes passed in 1.59 s; [resource evidence](../evidence/public-pagination-build-resources.json) records the actual guarded memory/time. The earlier build does not claim coverage of this later patch.

The user's Uniswap Extension subsequently allowed account connection but rejected `wallet_addEthereumChain` as unsupported. The wallet menu now states the requirement for custom networks. Unsupported add/switch methods (`4200`, `-32601`, or the exact observed Uniswap message) produce a Russian explanation with chain 31373 and the actual configured RPC, suggesting a custom-network wallet such as MetaMask. A `4001` user rejection is preserved unchanged, including if its accompanying text resembles an unsupported-method message; no alternate request follows rejection. Nine transport tests passed after this source change. Build and real browser-wallet retry are coordinator-owned; the separate successful signed public SDK/EAS smoke at block 753 is not presented as a browser-wallet transaction pass.
