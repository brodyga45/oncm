# Governance as a beneficiary

The DAO is one ordinary top-level beneficiary. Its recipient and treasury is the **existing OpenZeppelin Timelock**, read from `VaultGovernor.timelock()` and checked against the deployment. Membership voting governs this address; a voter does not individually own a fraction of treasury income and receives no automatic payout. No new contract, Safe, token, Solidity build or deployment is required.

Current chain31373 executor: `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`; Governor: `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9`. These are deployment-specific addresses; fresh startup already deploys the same contract graph. It does not silently add a DAO allocation to any existing epoch.

## Web and exact calls

1. **Доход → Казна governance → Подготовить доли с DAO20%** fills a new allocation draft. Other current recipients are scaled proportionally with integer basis points and deterministic largest remainders; total is exactly10,000. For the current50/50 epoch this is Bob40%, Timelock20%, Alice40%. Review and submit a separate `AllocationController.propose(address[],uint256[])`, obtain each decreasing recipient's own consent, then apply normally. An older pending proposal is not edited or executed by this preset.
2. If a later proposal decreases the DAO share, its row offers **Подготовить согласие DAO через Governor** (or revoke). The prepared target is AllocationController and calldata is `setConsent(uint256 proposalId,bool approved)`. The UI shows old/new basis points, base epoch, actual executor, exact calldata and the block of the simulation. It creates a normal Governor proposal; membership voting, queue and the Timelock delay still follow. At execution, `msg.sender` in AllocationController is **Timelock**, satisfying the existing beneficiary check. Neither the proposer nor Governor contract impersonates that address through an offchain signature.
3. `collect(pool)` attributes creator fees to the allocation epoch at collection time. Original immutable Splits V2 wallets distribute their receipts into `SplitsWarehouse.balanceOf(Timelock,uint256(uint160(token)))`. Previous epochs and previously credited beneficiaries remain unchanged.
4. **Получить → казна** uses the original permissionless `withdraw(address owner,address[] tokens,uint256[] amounts,address withdrawer)` with **both owner and incentive recipient equal to Timelock**. Full sampled credit is withdrawn; the caller receives none of it, even if a future withdrawal incentive is configured. This moves already-owned revenue into treasury custody; it does not make an internal distribution decision. If governance has paused Warehouse withdrawals, this public four-argument route reverts under the original contract. The current panel does not yet expose that pause setting; governance can still use original owner withdrawal or change the setting through an explicit reviewed call.
5. **Внутреннее распределение казны** prepares `token.transfer(recipient,amount)` through Governor. Tokens in this UI are T and canonical wrapped outcomes, all18 decimals; amounts are exact raw units. The SDK requires enough current treasury balance and a successful original `eth_call` from Timelock, including the ERC20 boolean result. Before proposal creation it rechecks executor, balance/call or allocation epoch and draft/wallet context. Actual Governor/Timelock execution performs the ultimate chain checks again. Each transfer has its own vote; no voter payout loop exists. Native ETH balance is visible, but this helper does not build ETH spending proposals.

Consent revocation can only prevent a future application while the allocation is still current and unapplied. Once all required consents exist, anyone can apply it; a later governance vote cannot undo an already applied epoch. Treasury balances shown at one block do not reserve funds for pending proposals.

## SDK

`createSDK(...).treasury` exposes `snapshot(tokens)`, `allocation20(activeAllocation)`, `prepare({kind:'consent',proposalId,approved})`, `prepare({kind:'transfer',token,recipient,amount})`, `propose(prepared,description,{isCurrent})`, and `claim(token,{isCurrent})`. Only `propose` and `claim` send transactions. Callers should provide a context fence; the web additionally resets the prepared action on wallet changes and ignores obsolete asynchronous form results.

Read code: [SDK](sdk/treasury.mjs), [panel](web/TreasuryPanel.svelte), existing [allocation policy](contracts/VaultIntegration.sol), [Governor](contracts/Governance.sol), [original Warehouse](vendor/splits/packages/splits-v2/src/SplitsWarehouse.sol). Upstream pinned dependencies remain unchanged: OpenZeppelin5.2.0 and the vendored Splits V2 revision recorded in [DEPENDENCIES.md](DEPENDENCIES.md). No new license/dependency has been introduced.

## Validation boundary — block193

15/15 targeted SDK+existing Governor tests passed. They cover exact DAO20 arithmetic, same-block actual-executor reads, consent/revoke ABI, stale/applied/non-decreasing rejection, transfer return-false and insufficient balance, modified prepared calls, revalidation before Governor submission, and Warehouse owner/incentive identity. A first test-only `return9n` typo failed1/9; corrected, then9/9 treasury and15/15 combined passed. Production Vite build1.63s; supervised group2.245s, peak331,069,944B, exit0 and clean teardown.

Actual independent browser tab102825369, public/disconnected, confirmed DAO20 draft without submission and exact old proposal1 remaining ready/unapplied. An unfunded0.01T transfer was refused. Ordinary governance call review decoded `setConsent(1,true)` and the **original AllocationController** rejected its Timelock simulation with `not decreasing`: DAO is not a recipient in epoch2. All balances/authority and block hashes were independently read from RPC. See [read-only evidence](evidence/treasury/readonly-rpc.json) and [browser observations](evidence/treasury/browser.json). Block193 stayed unchanged; own tab was closed.

The block193 preparation above is historical. The coordinated browser pass below subsequently completed DAO admission, real income/claims and governed consent. A specific treasury payment proposal was stopped by automatic approval review before submission; revocation has unit coverage but was not exercised onchain.


## Actual DAO cycle — blocks194–231

Normal browser tab102825376 used explicit local Account0/Account1 wallets throughout; no impersonation, donations, faucet, deployment, new proof or raw owner transaction was used. Before sending the first transaction the exact Bob40/Timelock20/Alice40 table was saved.

| Blocks | Actual result |
| --- | --- |
| 194–197 | New proposal2; Alice and Bob each consented from their own wallet, then epoch3 activated. After only Alice consent the apply control stayed disabled. Existing Math-recipient proposal1 was not edited/applied and became stale naturally. |
| 198–200 | Existing FALSE-pool creator fees were positive:0.004T and0.001NO. Collect sent them to epoch3; original Split distributed both assets. The nested pool had zero pending fees and was not spuriously collected. |
| 201–202 | Permissionless Warehouse claims sent799,999,999,999,999rawT and199,999,999,999,999rawNO to Timelock. The one-raw-unit rounding/dust differences originate in the original Split distribution. DAO Warehouse credit then became0; no claim value went to the calling wallet. |
| 203–219 | New outer proposal3 changes only DAO20→15 and Alice40→45, with Bob40 unchanged. Governor proposal204 targets exact `setConsent(3,true)`; Account1/Account0 vote at207/208, achieving2MEMBER quorum; queue219. Execute was visibly disabled before the5-second delay. |
| 230–231 | Original Governor/Timelock execute emitted `ConsentChanged(3,Timelock,true)`; outer apply then activated epoch4 at Bob40/DAO15/Alice45. |

Executed Governor proposal ID: `58867588641180423729554831512818658383979939396330919609188624271271923204021`. The `ProposalCreated`, `VoteCast`, Timelock queue/execute, `ConsentChanged`, collection/Splits/Warehouse and token events are decoded in [full RPC evidence](evidence/treasury/dao-cycle-rpc.json); [browser chronology and exact draft](evidence/treasury/dao-cycle-browser.json) separately identify observed controls and refusal.

A **separate payment** of0.00005NO (50,000,000,000,000raw units) to test Account3 was prepared successfully using the original token `eth_call` from Timelock. The normal **Создать proposal** action was rejected before submission by automatic approval review: “This submits a governance proposal for a specific NO-token payment to Account3, a consequential treasury side effect not explicitly authorized by the user.” It was not retried through another address, asset, API or route. Specific user approval remains pending; neither a payment proposal nor payment transaction exists. The prepared token is `0x873b5750e54339F2429C9581959874EDF887280f`; recipient `0x90F79bf6EB2c4f870365E785982E1f101E93b906`.

Finalblock231 hash `0xca6450197058006eb503222a26e691a0eeea2f72143b8bc8b29f1ab5df3eab59`: Timelock holds0.000799999999999999T and0.000199999999999999NO, and Account3 still holds0NO. The read-only recorder verified16 successful transactions, both fee-token identities, exact before/after balances and consent transition229false→230true. All8 statement records, all3 pool balances/BPT supplies, T supply and CTF collateral are identical to193. Pending parent189/child190 and blocked source publication remain untouched.
