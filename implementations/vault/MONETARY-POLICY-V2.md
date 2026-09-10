# Governed issuance and finite reward programs — additive V2

**Current acceptance:** the [browser cycle through block 552](docs/US023-BROWSER-RESULT.md) completed three program budgets, two-participant earning and claims, actual CI4 settlement, LP withdrawal/exit/redemption and fixed-recipient close. Supply is 1006 T; reserved and budget balance are zero. Historical checkpoints below retain their original block scope.

Historical status at block 425: V2 has 1000 T issued through governance, an admitted perf05 profile and one market registered with a genuine external certificate. Its first YES/T pool holds 20 T + 20 YES with 50/50 weights. Three separate Governor decisions set the total swap fee to 2%, creator share to 25% and global protocol share to 10%; explicit synchronization applied that global share to the existing pool. The market is open and reward programs are still zero at this checkpoint. Legacy remains independently available with its balances and rights preserved. Trades, reward earning and resolution require their own evidence.

## Version and ownership

Legacy `TrueToken` is an immutable genesis-only ERC20. Its existing StatementRegistry, CTF positions, wrapped outcomes, LP balances, collected/claimable fee epochs, social data and certificates stay at the same addresses. New source is not an upgrade of that token.

V2 uses a separate `TrueTokenV2`, registry, Balancer Vault/controller/weighted factory/router, allocation controller/coordinator, RewardBudget and BPT lock meter. It reuses the current nontransferable Membership, original OpenZeppelin Governor and Timelock, canonical CTF/wrapper factory, SplitsWarehouse/factory, Permit2/WETH and reviewed immutable mathematical verifiers. A distinct registry oracle produces distinct CTF condition IDs even when a mathematical statement ID is reusable.

The new token starts with **zero supply**. Membership already supplies governance votes, so no T-voting bootstrap cycle is needed. Only the actual existing Timelock owns `mint(recipient, amount)`. First issuance to an exact reviewed recipient is an ordinary Governor proposal. There is no unchosen permanent total-supply cap. Ownership can deliberately be transferred through governance; clients verify the current owner instead of describing it as immutable.

That bootstrap path has now been exercised: root's browser proposed at281, two members voted284/285, queued296 and executed307. Proposal snapshot282/deadline290, quorum2MEMBER,2For. The actual Timelock call minted exactly`1000000000000000000000` raw T to`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`. V2 supply and that balance are1000T, other test wallets hold zero. MEMBER supply/votes/ownership and legacy T/NO holdings,9 statements,3 pool/BPT states and epoch4 allocation are identical at277 and307. No beneficiary fee funded this issuance. [Five actual browser transaction receipts and state comparison](evidence/monetary-policy/initial-mint-281-307.json).

The initial V2 allocation copies the current same-block recipients and shares: at block260 these are Bob40%, Timelock15%, Alice45% from legacy epoch4. This creates a new independent allocation and split; it moves no previous fee balances or consent rights. Future V2 allocation reductions keep the existing losing-beneficiary consent rules, including actual governance consent when the Timelock share falls.

## First admitted profile, market and liquidity

Normal browser governance admitted only perf05: proposal 308, member votes 311/312, queue 323 and execution 334. Snapshot 309, deadline 317, quorum 2 MEMBER, votes 2 For. The exact profile is `0x93cf174539debc6ddce2691f3def1e36023cf77fe1d93f1692f330150bd37e10`, image `0x296fb3bbf5eb7df9fb7115826df31c71411ee0f8153970c7618c76ab01539feb`, bridge `0x9E545E3C0baAB3E08CdfD552C960A1050f373042`. Its pinned Lean 4.33.1 / NanoDa foundation permits zero axioms and disables Nat/String extensions. This is a distinct mathematical policy from v3; no v3 admission or Nat.add_comm certificate is implied.

The browser explicitly loaded the existing CI true-registration certificate, checked both the original RISC Zero verifier and the admitted bridge at 334, filled the registration draft, and registered it as Bob at 335. The collector independently repeated those cryptographic `eth_call` checks and matched the actual transaction certificate bytes. Statement `0x390403d03c5e8c37534c14ee5b1a56b9004da93d40a171ee9ba7ae8d62bbfd08` has goal `0x2baf8be8fc5ecd150cd5b5086b52c4f2591d407093d4f6b77f767afc1c113f4b` (∀ P : Prop, P → P) and new CTF condition `0xd9bac8eacc827a99ff50428c7aa37c420e1b059ef545cf65f347e3f4853beb2f`. Its oracle differs from the legacy registry even though the mathematical statement ID is reusable. Registration proves validity of the goal and leaves the outcome open. [Six transaction receipts, exact bindings and unchanged legacy/MEMBER state](evidence/monetary-policy/profile-market-308-335.json).

Root then used normal browser controls to approve/split 30 T at 336/337, create the YES/T 50/50 pool at 338, approve its funding at 339–342, and initialize it at 343. Pool `0x75ba1e7c0AC567f3451D2646f1db5eAbc99d07f7` holds exactly 20 T + 20 YES. At that block its static swap fee is 1%, global protocol share is 0, and the creator share is 20% of swap fees. Alice owns `19999999999998599879` raw BPT (19.999999999998599879), rather than exactly 20 BPT. Total BPT supply includes the original Vault's 1,000,000 raw locked BPT.

At 343, T supply is still 1000, CTF collateral is 30 T, and Alice holds 950 T / 10 YES / 30 NO. The hook `0x32e0cbE412b5bF260A6337395CBB9AC7a1a3ccA0` matches the compiled runtime template and actual registry/coordinator/router/reward/fee-sink bindings. Its volume and eight program slots are zero. No trading, reward earning or resolution is inferred from initialization. [Eight receipts, historical balances and actual pool/hook/fee checks](evidence/monetary-policy/initial-liquidity-336-343.json).

After the catalog API correction, a separate read-only browser check at displayed block 347 showed the admitted perf05 bridge and the selected V2 registry with “Профиль включён”; the wallet was disconnected and no certificate was re-imported. [Exact UI observation](evidence/monetary-policy/catalog-browser-347.json).

## Governed fee policy and explicit existing-pool synchronization

Each policy used the typed monetary panel, actual Timelock `eth_call` review, an ordinary Governor proposal, two separate member votes, queue and execution. No authority impersonation or direct owner call was used.

| Policy | Proposal / votes / queue / execution | Actual result |
| --- | --- | --- |
| Pool total swap fee | 344 / 347,348 / 359 / 370 | 1% → 2% through `AllocationControllerV2.setPoolSwapFee` |
| Creator share | 371 / 374,375 / 386 / 397 | 20% → 25% through `AllocationControllerV2.setCreatorFee` |
| Global protocol swap share | 398 / 401,402 / 413 / 424 | 0% → 10% through original `ProtocolFeeController.setGlobalProtocolSwapFeePercentage` |

All three proposals reached the original historical quorum of 2 MEMBER with 2 For. Their snapshot/deadline pairs were 345/353, 372/380 and 399/407. Fee income still routes through the existing allocation sink; changing a rate does not transfer beneficiary funds to governance.

The global change at 424 deliberately left this existing pool's cached protocol share at 0%. The UI showed that exact 0% → 10% difference, the original controller address and its permissionless update call before submission. Alice explicitly synchronized it at 425 with transaction `0x26fb3e86d497db7a6772426fc6bd93d2d0905ddcb7568865eea8ddb93ec576e0`. The controller first collects pending fees under previous rates, then updates a non-overridden pool. This initial pool had no trades or pending fee income, and the historical token balances remained equal before/after.

At 425 the original controller reports global 10%, pool cache 10%, override false and creator share 25%; the original Vault reports a 2% total swap fee and aggregate fee share `325000000000000000` (32.5% of swap fees). The creator share applies after the protocol share: 10% + 25% × 90% = 32.5%. This is a measured policy configuration, not evidence of actual earned fee amounts. Pool reserves/BPT, V2 T/YES/NO supplies and tested holders, legacy T/NO holders, MEMBER balances, allocation, roles, program count and market outcome compare unchanged across every step. Native-gas balances are not part of that claim.

The four independent read-only journals contain exact calldata, original events, numbered blocks and state comparisons: [total fee](evidence/monetary-policy/fee-total-344-370.json), [creator share](evidence/monetary-policy/fee-creator-371-397.json), [global share](evidence/monetary-policy/fee-global-398-424.json), [pool cache](evidence/monetary-policy/fee-cache-425.json). [Browser review and action record](evidence/monetary-policy/fee-policy-browser-371-425.json). No program, new issuance, trade or resolution occurred in these cycles.

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

All guarded compiles/deployment used≤1GiB/60s, the monetary test≤1GiB/60s and meter tests≤1GiB/120s. No local prover, new main chain or chain reset was used. [Original Governor test evidence](evidence/monetary-v2/governor-budget-tests.json), [resource report](evidence/monetary-v2/governor-budget-resources.json), [prepared plan](evidence/monetary-v2/prepared-plan-block260.json), [actual deployment receipts and invariants](evidence/monetary-policy/deployment-261-277.json), [exact governance calls prepared but unsubmitted at deployment block 277](evidence/monetary-policy/pending-governance-calls.json). The latter is a historical preparation record: its perf05 call later executed at 334 as recorded above; v3 and the operator remained unadmitted at 335.
