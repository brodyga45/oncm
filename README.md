# ONCM — onchain markets for Lean statements

**Active implementation: [Vault](implementations/vault/README.md).** On 2026-09-10 the user consolidated development after comparing three prototypes. Agora and Exchange are preserved as frozen experiments. All agents now focus on Vault, including governed T issuance, incentives and fee policies. See the [selection and current plan](docs/vault-focus.md).

Three independent experimental implementations of mathematical prediction markets. Each has its own web app, SDK, API, local blockchain and deployment. The protocol uses collateralized YES/NO positions: a full set is backed by one T; after a verified resolution the winning position redeems for T.

| Implementation | Market infrastructure | Governance | Onchain social | Web |
| --- | --- | --- | --- | --- |
| [Agora](implementations/agora/README.md) | Gnosis Conditional Tokens + FPMM, PaymentSplitter fee epochs | Safe + Timelock | SSTORE2 content | Vue, port5171 |
| [Exchange](implementations/exchange/README.md) | Conditional Tokens + ERC-20 wrappers + Uniswap V2, Splits fee epochs | ERC20Votes Governor + Timelock | Ethereum Comments Protocol + policy hook | React, port5172 |
| [Vault](implementations/vault/README.md) | Conditional Tokens + wrappers + Balancer V3 weighted pools, Splits fee epochs | Membership Governor + Timelock | Ethereum Attestation Service + resolver | Svelte, port5173 |

## Current state

The local applications, native Lean/export/NanoDa checks and component tests run. The local deployment uses real cryptographic verifier contracts. Tests that substitute a verifier are confined to isolated economic tests; they do not establish Lean proof acceptance.

**Real Lean/Groth16 TRUE market lifecycles have passed browser testing in all three implementations; FALSE lifecycles have passed in Exchange and Vault.** Four real perf05 certificates were generated in CI and independently verified. Agora's final FALSE settlement is awaiting a previously requested approval; the full scenario acceptance remains open. See the [scenario matrix](docs/remaining-scenarios.md) for evidence and remaining work.

Profiles, comments, replies, votes and blogs now store their full public content onchain in each implementation. Websites import externally prepared certificates and require explicit verification. Generating or ordering new certificates from the website was deferred by the user. Local expensive proving remains disabled by default; a native Lean check is not a ZK certificate.

The v3 mathematical profile uses a pinned Lean4.33.1 environment. The separate zero-axiom perf05 logic profile has the genuine smoke receipts for `∀ P : Prop, P → P` and the refutation of `∀ P : Prop, P`. Their receipts cannot be relabelled as v3 receipts or arbitrary mathlib proofs. Generic bundle import supports compatible exact goals under supported immutable profiles, without treating supplied source descriptions as authenticated mathematical meaning.

## Run one implementation

Follow the selected implementation's README. Each application starts separately and uses its own local RPC port (9545, 9546 or 9547). Node.js 22+ is required. The native proof toolchain requires a separate pinned setup; installing npm packages alone does not install Lean or a prover.

Public development-wallet credentials in the examples are exclusively for local, valueless test networks. Personal keys, runtime configuration, local chain databases, private research, proof jobs and generated proving keys are not part of the published source.

## Architecture and evidence

- [Implementation programme](docs/implementation-program.md)
- [Implemented architecture comparison](docs/implemented-architectures.md)
- [Current scenario acceptance](docs/remaining-scenarios.md)
- [Manual browser validation](docs/manual-validation.md)
- [Memory and performance measurements](docs/performance-and-memory.md)
- [Low-resource proving research](docs/low-resource-proving-research.md)
- [Pinned proof runtime setup](tools/lean-zk/SETUP.md)

The detailed architecture and user scenarios are in [docs/](docs/). Third-party components retain their original licenses and notices. Reused contracts and proof systems are pinned; the integration itself is experimental and has not undergone a production audit.
