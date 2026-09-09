# ONCM — onchain markets for Lean statements

Three independent experimental implementations of mathematical prediction markets. Each has its own web app, SDK, API, local blockchain and deployment. The protocol uses collateralized YES/NO positions: a full set is backed by one T; after a verified resolution the winning position redeems for T.

| Implementation | Market infrastructure | Governance | Web |
| --- | --- | --- | --- |
| [Agora](implementations/agora/README.md) | Gnosis Conditional Tokens + FPMM, PaymentSplitter fee epochs | Safe + Timelock | Vue, port 5171 |
| [Exchange](implementations/exchange/README.md) | Conditional Tokens + ERC-20 wrappers + Uniswap V2, Splits fee epochs | ERC20Votes Governor + Timelock | React, port 5172 |
| [Vault](implementations/vault/README.md) | Conditional Tokens + wrappers + Balancer V3 weighted pools, Splits fee epochs | Membership Governor + Timelock | Svelte, port 5173 |

## Current state

The local applications, native Lean/export/NanoDa checks and component tests run. The local deployment uses real cryptographic verifier contracts. Tests that substitute a verifier are confined to isolated economic tests; they do not establish Lean proof acceptance.

**The full market creation → trading → settlement flow with a newly generated Lean/Groth16 certificate is still being validated.** Local expensive proving is paused by default after excessive resource use. A successful native Lean check is not a ZK certificate. CI proof smoke work is intended to obtain and independently verify real receipts without running a prover on the developer's laptop.

The current v3 mathematical profile supports a pinned Lean 4.33.1 environment. A separate, smaller zero-axiom logic profile is used to investigate the real proof pipeline. Its receipts cannot be relabelled as receipts for v3 or for arbitrary mathlib statements.

## Run one implementation

Follow the selected implementation's README. Each application starts separately and uses its own local RPC port (9545, 9546 or 9547). Node.js 22+ is required. The native proof toolchain requires a separate pinned setup; installing npm packages alone does not install Lean or a prover.

Public development-wallet credentials in the examples are exclusively for local, valueless test networks. Personal keys, runtime configuration, local chain databases, private research, proof jobs and generated proving keys are not part of the published source.

## Architecture and evidence

- [Implementation programme](docs/implementation-program.md)
- [Manual browser validation](docs/manual-validation.md)
- [Memory and performance measurements](docs/performance-and-memory.md)
- [Low-resource proving research](docs/low-resource-proving-research.md)
- [Pinned proof runtime setup](tools/lean-zk/SETUP.md)

The detailed architecture and user scenarios are in [docs/](docs/). Third-party components retain their original licenses and notices. Reused contracts and proof systems are pinned; the integration itself is experimental and has not undergone a production audit.
