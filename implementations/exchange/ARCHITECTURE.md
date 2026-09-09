# Exchange B: architecture and implemented contracts

Independent implementation in this folder; no runtime imports from Agora/Vault. See README for one-command local startup and `THIRD-PARTY.md` for exact reuse. Fixed decisions remain CTF + canonical ERC-20 + unchanged V2, LP-valued protocol fees at receipt-time epochs, ordinary V2 trading after payout, OZ Governor with liquid T votes, React terminal.

## Layers and invariants

| Layer                | Components                                                                                     | Responsibility                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical statements | `ExchangeProtocol`, immutable Profile/Operator records                                         | Goal+profile or typed operation+arguments determine an immutable ID. Registration requires a well-formed-goal certificate. CTF oracle is the protocol contract.                                                       |
| Proof policy         | Real `LeanProofBridge` from `proof/`                                                           | RISC Zero Groth16 proof, exact guest image, goal hash, profile, claim kind/outcome. Onchain math statements supply their stored goal/profile; portable proofs need no chain-specific statement ID inside the journal. |
| Operator policy      | `IStatementOperator.validate/evaluate`                                                         | Governance deploys/registers new immutable adapter IDs; creation commits ABI arguments. Evaluation returns 0 pending, 1 true, 2 false. Adapter calls are static; declared results must be 0–2.                        |
| Collateral/outcomes  | Original CTF + original Gnosis Wrapped1155Factory                                              | 1 T → 1 YES + 1 NO; merger returns 1 T. Winning token redeems 1 T, losing token zero. Canonical wrappers have fixed 65-byte metadata including OZ3 short-string length encoding.                                      |
| Routing              | Original Seer Router + original V2 Router02                                                    | Seer composes wrapping/CTF split/merge/redeem. V2 handles separate T/YES and T/NO pools, exact-input swaps, min amounts and deadline.                                                                                 |
| Fees                 | Original V2 `feeTo`, AllocationController, original PullSplitFactory/PullSplit/SplitsWarehouse | Protocol LP appears on liquidity events. Collect commits received asset to current epoch. Old ownerless splits retain their assets.                                                                                   |
| Governance           | T ERC20Votes, OZ Governor extensions, TimelockController                                       | Delegate, propose, vote, queue, execute exact calls. Profiles/operators are append-only identities; availability is explicit.                                                                                         |
| Trader extras        | `FullSetArbitrage`, ExchangeSDK execution ledger                                               | Atomic composition of existing routers with terminal min-profit assertion; historical actual V2 fills and CSV.                                                                                                        |
| Offchain             | Express JSON store, SIWE, React, ethers SDK                                                    | Read chain, import public pinned research, source jobs, profiles/replies/votes. No authority to set a payout.                                                                                                         |

### Economic identities

`mathId = keccak256(abi.encode("ONCM_EXCHANGE_LEAN_V1", goal, profile))`.

Built-in derived ID commits domain, kind, existing dependency, inclusive deadline and target. New operator ID commits `"ONCM_EXCHANGE_OPERATOR_V1"`, registered operator version and opaque validated argument bytes. Existing dependencies predate creation; built-ins never recursively evaluate dependencies. New adapter authors must preserve bounded execution and finality; governance acceptance of a new adapter is an explicit semantic trust decision, not a proof of arbitrary adapter correctness.

A math condition has exactly two outcome slots. `_resolve` writes the outcome and timestamp and reports CTF payouts in one transaction. A conflicting second result reverts. Descriptions/package references are separate from economic semantics. Source hashes do not replace the canonical exported goal commitment.

### Core ABI

```solidity
createMath(bytes32 goal, bytes32 profile, string metadata, bytes registrationCertificate);
createDerived(uint8 kind, bytes32 dependency, uint64 deadline, uint8 target, string metadata);
createOperator(bytes32 operatorId, bytes config, string metadata);
resolveProof(bytes32 id, uint8 outcome, bytes certificate);
resolveDerived(bytes32 id);
addProfile(bytes32 version, address verifier, string manifest); // Timelock only
setProfileEnabled(bytes32 version, bool newEnabled, bool resolutionEnabled);
addOperator(bytes32 version, address adapter, string manifest); // Timelock only
setOperatorEnabled(bytes32 version, bool newEnabled, bool resolutionEnabled);
```

Verifier ABI:

```solidity
verifyGoal(bytes32 goalHash, bytes32 profileId, bytes certificate) view returns (bool);
verify(bytes32 statementId, bytes32 goalHash, bytes32 profileId, uint8 outcome, bytes certificate) view returns (bool);
```

GoalWellFormed cannot settle a market. Outcome 1 accepts proof of P, 2 proof of ¬P. The guest profile and kernel export encode foundation/environment. Updating Lean, checker, axioms or semantics uses a new profile and explicit registration; old verifier addresses cannot be overwritten. `proof/manifest.json` documents source/kernel boundary and exact pinned foundation.

### Proof runner

`node proof/runner.mjs` receives JSON stdin and writes JSON stdout:

```json
{
  "action": "check|register|prove",
  "source": "...",
  "fixtureId": "lean-nat-add-comm-4.33.1",
  "statementId": "0x...",
  "goalHash": "0x...",
  "profileId": "0x...",
  "outcome": 1,
  "targetDeclaration": "Oncm.goal"
}
```

API forwards package/declaration metadata where available. The installed profile currently recognizes its pinned Oncm declarations and Lean environment; importing arbitrary packages does not promise successful elaboration. Native `check` produces diagnostics; `register/prove` produces cryptographically checked certificate(s). API permits one local proof job at a time, caps output, preserves job diagnostics and never signs money actions. External proof runtime isolation/provisioning is owned by `proof/`.

## Implementation choices and boundaries

- ERC-20 wrapper metadata is canonical per position; name/symbol occupy Solidity short-string storage words with `length*2` low byte. Preserving OZ3 storage layout is mandatory for the original factory.
- V2 factory and periphery use published original npm artifacts. Deployment verifies pair init hash `0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f`.
- Seer Router and Interfaces are reused with a pragma-range-only edit. Seer’s oracle market descriptor is replaced by the small proof-market descriptor with compatible getters.
- Allocation denominator is 10,000 basis points. At most 32 sorted unique nonzero recipients, all positive shares, exact sum. Proposal approvals are per losing address and base epoch. Governance has no allocation overwrite method.
- Original Splits one-unit retained balances and rounding are preserved. Collector allocation is receipt-time, not transaction-time swap fee accrual. Timelock may change future V2 fee recipient; old split assets remain immutable.
- V2 actions use onchain quotes, chain-clock deadlines and a 30% + 20k gas estimate buffer; this avoids Ganache timestamp-dependent reserve-write gas underestimates. Costs are based on actual gas used.
- No indexing service is required for correctness. API rebuilds from chain RPC; local JSON stores only offchain content. Activity reports block-end snapshots and decoded receipts. Public production deployment would need bounded/paginated indexing, persistent job scheduling and hardened service hosting.
- Local chain is Ganache Shanghai, with protocol contracts solc 0.8.30 and OZ 5.2.0. OZ 5.4’s Cancun-only `mcopy` was avoided rather than modifying dependency internals. Original wrapper compiles with solc 0.6.12/OZ3; original CTF artifact uses solc 0.5.10.
