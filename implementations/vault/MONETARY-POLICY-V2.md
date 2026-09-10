# Governed issuance and finite reward programs — additive V2

Status: the reviewed additive V2 deployment completed in17 transactions at blocks261–277. Separate EAS setup completed278–280. **The first ordinary browser Governor issuance executed at307:1000 V2 T to Account0. Programs and markets remain zero at307; profiles/operator admission and reward scenarios are still separate steps.** Legacy remains independently available with its balances and rights unchanged.

## Version and ownership

Legacy `TrueToken` is an immutable genesis-only ERC20. Its existing StatementRegistry, CTF positions, wrapped outcomes, LP balances, collected/claimable fee epochs, social data and certificates stay at the same addresses. New source is not an upgrade of that token.

V2 uses a separate `TrueTokenV2`, registry, Balancer Vault/controller/weighted factory/router, allocation controller/coordinator, RewardBudget and BPT lock meter. It reuses the current nontransferable Membership, original OpenZeppelin Governor and Timelock, canonical CTF/wrapper factory, SplitsWarehouse/factory, Permit2/WETH and reviewed immutable mathematical verifiers. A distinct registry oracle produces distinct CTF condition IDs even when a mathematical statement ID is reusable.

The new token starts with **zero supply**. Membership already supplies governance votes, so no T-voting bootstrap cycle is needed. Only the actual existing Timelock owns `mint(recipient, amount)`. First issuance to an exact reviewed recipient is an ordinary Governor proposal. There is no unchosen permanent total-supply cap. Ownership can deliberately be transferred through governance; clients verify the current owner instead of describing it as immutable.

That bootstrap path has now been exercised: root's browser proposed at281, two members voted284/285, queued296 and executed307. Proposal snapshot282/deadline290, quorum2MEMBER,2For. The actual Timelock call minted exactly`1000000000000000000000` raw T to`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. V2 supply and that balance are1000T, other test wallets hold zero. MEMBER supply/votes/ownership and legacy T/NO holdings,9 statements,3 pool/BPT states and epoch4 allocation are identical at277 and307. No beneficiary fee funded this issuance. [Five actual browser transaction receipts and state comparison](evidence/monetary-policy/initial-mint-281-307.json).

The initial V2 allocation copies the current same-block recipients and shares: at block260 these are Bob40%, Timelock15%, Alice45% from legacy epoch4. This creates a new independent allocation and split; it moves no previous fee balances or consent rights. Future V2 allocation reductions keep the existing losing-beneficiary consent rules, including actual governance consent when the Timelock share falls.

## RewardBudget contract

The budget contract has immutable token and governance-executor addresses. Each program fixes its meter, earning interval `[start,end)`, claim interval `[end,claimDeadline)`, finite budget and remainder recipient at creation. The selected meter is an explicitly governed trust/policy decision. A malicious future meter could report dishonest weights; the client only offers the reviewed onchain Balancer/lock meters and clearly labels unknown program meters.

```solidity
createProgram(
  uint256 expectedId, address meter,
  uint64 start, uint64 end, uint64 claimDeadline,
  uint256 budget, address remainderRecipient
)
recordWeight(uint256 id, address account, uint256 weight) // program meter only
claimable(uint256 id, address account)                  // after earning ends
claim(uint256 id)                                      // sends only to msg.sender
close(uint256 id)                                      // fixed remainder recipient
```

The normal proposal is an ordered original Governor batch: `TrueTokenV2.mint(RewardBudget,R)`, `createProgram(expectedId,...,R,...)`, then the chosen meter's `configureProgram`. The expected program counter prevents concurrently queued proposals from configuring the wrong ID. The full batch reverts atomically if any leg fails. Independent `eth_call` checks cannot pretend to simulate this funding dependency; only a queued full Governor execution call simulates the ordered batch.

All outstanding budgets are reserved against actual token balance. Weights can be added only by the program's immutable meter, during its earning interval. Once earning ends, weight totals freeze. A participant receives `floor(budget * ownWeight / totalWeight)` once; nobody redirects that claim. After the explicit claim deadline, anyone can close the program, but dust, zero-participation budgets and unclaimed amounts go only to its originally voted remainder recipient. There is no retroactive weight editing, top-up, cap increase or automatic treasury remainder.

Reviewed trade and voluntary BPT lock measurements are covered in [the meter evidence](docs/evidence/monetary-policy/meters-contract-tests.json). Trade volume rewards remain susceptible to economically costly wash trading; exact T-input fee weighting does not claim that NO/YES fees are T or that token rewards reimburse native gas. LP staking explicitly locks BPT until program end; principal withdrawal survives resolution and is independent of reward claiming.

## Deployment and recovery contract

`node scripts/deploy-v2.mjs` only prepares `.state/deploy-v2-plan.json`. It validates the actual local chain31373, chain instance/genesis, current Governor→Membership/Timelock and allocation owner, reused code hashes, immutable proof image/profile/manifest bindings, source/artifact pins and pending deployer nonce. It records exact current beneficiaries. It sends no transactions.

`node scripts/deploy-v2.mjs --execute` is the separate explicit deployment phase. It rechecks that plan, the canonical reviewed block, source pins, policy/code/nonce and legacy files. The token constructor receives empty genesis arrays. Registry ownership starts at the Timelock. A temporary allocation owner binds the one-time coordinator and immediately transfers ownership to the Timelock. A temporary Vault authorizer exists only for bootstrap; the final action installs the immutable scoped fee authorizer, which routes protocol withdrawals through the allocation sink and denies governance arbitrary withdrawals or authorizer/controller replacement. Getter checks validate all new contract immutable links as well as runtime templates.

Before the first broadcast, the script writes `.state/deploy-v2-progress.json`. Every returned transaction hash is recorded before waiting for its receipt. Records include nonce, calldata SHA, deployment address, block/hash and status. **Any started attempt blocks another run**, even if the first RPC response disappeared without a hash. Recovery is deliberately manual: inspect nonce/receipt/code and the recorded plan; do not delete progress and redeploy blindly. A late bootstrap failure could leave a temporary authorizer until recovery, so no V2 descriptor is marked ready before final ownership/authorizer checks pass. No automatic resume or atomic whole-graph deployment is claimed.

Only `.state/deployment-v2.json` and `.state/abis-v2.json` are written on success; logical ABI names map to the new extended contracts. Legacy descriptor/ABI/social bytes and old T balances, supply, registry count and allocation epoch are compared before/after. Main-chain concurrency remains coordinated for this stage.

New registry profiles and the existing ResolvedWithinWindow operator remain **unadmitted** at deployment. Exact `pendingGovernanceActions` are included for ordinary proposal/vote/queue/execute. Reusing genuine certificates is mathematical reuse, not silent profile admission. Separate V2 social setup and `VAULT_PROTOCOL_VERSION=2` select the new graph; default startup remains legacy. Existing blocked payment/deadline/source-publication actions must not be repeated through V2.

## Build, provenance and measured tests

- Pinned Solidity0.8.28, optimizer runs1, viaIR, Cancun; OpenZeppelin5.2.0. Legacy Balancer1.0.0 artifacts and compile settings remain unchanged.
- `scripts/compile-monetary.mjs --tests` generates only seven named production contracts plus four explicitly test-only harnesses. No optimizer work is requested for imported original Vault/WeightedPool contracts. `--core` is the smaller token/budget compilation.
- `production-v2/` contains only the seven production artifacts and98 exact source/dependency pins. No harness, mock verifier or opaque unbound bytecode is distributed. `build-monetary-bootstrap.mjs` checks embedded Solidity metadata CID and source Keccak hashes without recompilation. Earlier parsed-only metadata containing a curly apostrophe is accepted only after exact Unicode-escaped serialization reproduces its embedded CID; future compilation preserves raw metadata text.
- First core compile:4.672s,292,608,336B peak. Final combined compile after the discovered onRegister getter-order correction:20.637s,315,842,528B peak. The initial failed meter test and earlier compile remain historical evidence, not overwritten successes.
- `scripts/test-monetary.mjs`:9 checks,34 real receipts in an isolated in-process Hardhat network using original Membership/Governor/Timelock. It covers actual voted atomic mint+reserve, queued stale/unfunded full-batch rejection, authority, periods, exact pro-rata flooring, replay and voted remainder destination.1.291s,203,140,376B peak, exit0, cleanup errors none. The unrestricted RewardMeterHarness tests the budget boundary only; it is never a production meter.
- Peer meter integration:13 checks against original Balancer Vault/Router/WeightedPool/Splits,1.854s,527,560,272B peak. The registry and executor in that separate suite are explicitly mocked policy fixtures; they do not stand in for real Lean verification or the Governor tests.
- Three strict artifact/Unicode/source tests and three stale-deployment-plan tests pass. The read-only plan at block260 binds both known proof profiles and records zero transactions; the separately authorized execution then completed17 transactions at261–277 in4.03s,107,935,184B peak, exit0/cleanup errors none. All new immutable getter checks and28 actual runtime hashes passed. Subsequent browser initial issuance is confirmed above; profile/operator admission and browser reward claiming remain separate unclaimed scenarios at307.

All guarded compiles/deployment used≤1GiB/60s, the monetary test≤1GiB/60s and meter tests≤1GiB/120s. No local prover, new main chain or chain reset was used. [Original Governor test evidence](evidence/monetary-v2/governor-budget-tests.json), [resource report](evidence/monetary-v2/governor-budget-resources.json), [prepared plan](evidence/monetary-v2/prepared-plan-block260.json), [actual deployment receipts and invariants](evidence/monetary-policy/deployment-261-277.json), [unsubmitted exact governance calls](evidence/monetary-policy/pending-governance-calls.json).
