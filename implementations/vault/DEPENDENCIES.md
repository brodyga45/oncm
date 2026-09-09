# Pinned OSS provenance

No sibling implementation is imported or contacted at runtime. npm package versions and integrity hashes are fixed by package-lock.json. Upstream source files retain notices; original artifacts are copied without bytecode edits.

| Dependency | Version / commit | Primary source | Notice |
|---|---|---|---|
| Balancer V3 Vault, interfaces, weighted, pool-utils, solidity-utils | npm 1.0.0 each | https://github.com/balancer/balancer-v3-monorepo | Solidity headers GPL-3.0-or-later; npm package declares GPL-3.0-only. No source edits. |
| Gnosis Conditional Tokens | npm 1.0.3 | https://github.com/gnosis/conditional-tokens-contracts | LGPL-3.0, original published artifact |
| Gnosis 1155-to-20 | 4bf9e0b4562f0313fa5df2ed24897adb978e0ae9; package 1.0.2 | https://github.com/gnosis/1155-to-20 | LGPL-3.0, vendor source + original build artifacts |
| Uniswap Permit2 | cc56ad0f3439c502c246fc5cfcc3db92bb8b7219 | https://github.com/Uniswap/permit2 | MIT source; imported Solmate files carry their own AGPL notice |
| Splits contracts monorepo V2 | 09523d2a5d594f9ee8783faf147caa3c414230dd | https://github.com/0xSplits/splits-contracts-monorepo | GPL-3.0-or-later source. Real PullSplitFactory, SplitProxy, warehouse |
| OpenZeppelin Contracts | 5.2.0 | https://github.com/OpenZeppelin/openzeppelin-contracts/tree/v5.2.0 | MIT |
| Solady | npm 0.1.26 | https://github.com/Vectorized/solady | MIT |
| Solmate | npm 6.8.0 | https://github.com/transmissions11/solmate | This npm release and its WETH/ERC20 sources are **AGPL-3.0-only**, not labelled MIT here |
| Seer router flow | design reference, own minimal fixed-binary adapter | https://github.com/seer-pm/demo/blob/main/contracts/src/Router.sol | MIT flow; our PositionRouter adds SafeERC20, reentrancy and exact registry binding; no Seer Reality oracle |
| ethers | 6.13.5 | https://github.com/ethers-io/ethers.js | MIT |
| Express / cookie-parser | 4.21.2 / 1.4.7 | https://github.com/expressjs/express | MIT |
| p-queue | 8.1.0 | https://github.com/sindresorhus/p-queue/tree/v8.1.0 | MIT; independent Vault adapter based on the Agora queue design, no sibling imports |
| fflate | 0.8.2 | https://github.com/101arrowz/fflate/tree/v0.8.2 | MIT; bounded ZIP export of explicitly supplied Lean files. npm unpacked 773,398 bytes; integrity pinned in lockfile, license copied to licenses/FFLATE-MIT.txt. No executable extraction or package execution on server. |
| SIWE | 3.0.0 | https://github.com/spruceid/siwe | Apache-2.0 |
| Svelte / Vite | 5.20.5 / 5.4.14 | https://github.com/sveltejs/svelte / https://github.com/vitejs/vite | MIT |
| Hardhat | 2.26.3 | https://github.com/NomicFoundation/hardhat | MIT |
| Anvil binary | 1.7.1, commit 4072e48705af9d93e3c0f6e29e93b5e9a40caed8 | https://github.com/foundry-rs/foundry/releases/tag/v1.7.1 | MIT OR Apache-2.0; official darwin_arm64 archive 88,161,744 bytes, SHA-256 eacdc67718fac857cad9e19c7f6729dd80de731d09df81856391d093cfcab547; only 34,752,816-byte Anvil binary extracted. Installer/provenance in scripts/install-anvil.py and .toolchain/anvil-provenance.json. No Cargo build or other Foundry binary installed. |
| Solidity compilers | 0.8.28 + 0.8.17; solc5 reserved tooling dependency | https://github.com/ethereum/solidity | GPL-3.0 tooling |

Proof provenance lives in proof/manifest.json and proof/contracts, maintained with its own exact image profile. Root LICENSE applies to original Vault glue; vendor and dependency files retain their separate terms. Relevant full notices are under licenses/ and vendor/. Solmate AGPL files are explicitly retained and available from the pinned npm dependency; this dependency is not silently re-labelled.

## Reproducible construction

`compile.mjs` imports the actual upstream Vault/Admin/Extension/Factory/Router/WeightedPool code. Optimizer runs=1 keeps all deployed runtime contracts under 24,576 bytes. Canonical VaultFactory hashes the three creation-code components and deploys them with a predetermined address, allowing ProtocolFeeController to bind that address before Vault creation.

`WeightedPoolFactory.create` receives sorted token config, normalized weights, protocol governance role accounts, `poolCreator=AllocationController`, and FinalityHook. Creator swap share is initialized through `ProtocolFeeController.setPoolCreatorSwapFeePercentage`, not an extra wrapper toll. No direct-call bypass of the canonical pool's creator fee exists; external third-party pools can have their own fee recipients.

Original Gnosis wrapper metadata is the packed **Solidity short-string slot encoding** for name and symbol, followed by decimals (65 bytes). The low byte contains length × 2. SDK/tests check actual ERC-20 symbol, backing, split and merge rather than assuming a label displayed by the web UI proves compatibility.
