# DAO as a beneficiary and treasury

The DAO is one recipient in the existing top-level allocation table. Its address is the executor returned by the original OpenZeppelin Governor's `timelock()`. Receiving20% does not grant every voter a dividend: the assets belong to the Timelock, and internal recipients/amounts require separate governance decisions.

No treasury, token or allocation contract is added. Existing local-chain31372 addresses:

| Role | Address |
|---|---|
| Governor | `0xfbC22278A96299D91d41C453234d97b4F5Eb9B2d` |
| Timelock / DAO recipient | `0x2B0d36FACD61B71CC05ab8F3D2355ec3631C0dd5` |
| AllocationController | `0x0355B7B8cb128fA5692729Ab3AAa199C1753f726` |
| Original SplitsWarehouse | `0x36b58F5C1969B7b6591D752ea6F5486D069010AB` |
| T | `0x21dF544947ba3E8b3c32561399E88B52Dc8b2823` |

At the read-only baseline265, epoch2 still has Bob50% and Alice50%; the DAO has0%. All21 inspected T/market-LP assets have zero DAO holdings and zero withdrawable DAO Warehouse credit. [Baseline](evidence/dao-treasury/baseline-265.json) records the actual numbered-block snapshot and an unsubmitted DAO20/Bob40/Alice40 draft. It does not establish that the DAO has already been added or paid.

## Web scenarios and underlying calls

1. **Fee income → Prepare DAO20% table.** The current text table is parsed as exact basis points. Other recipients are scaled proportionally; residual basis points use deterministic largest-remainder/address ordering. Preparation only changes the displayed draft. **Propose distribution** calls existing `AllocationController.propose(address[],uint256[])`. Every current recipient whose share decreases must consent before anyone can `applyAllocation`. In the baseline, both Alice and Bob must consent. Existing epochs and credits keep their previous owners.
2. **Governance → DAO beneficiary & treasury → Consent to a lower DAO share** or **Revoke DAO reduction consent.** Select a current unapplied proposal in which the DAO loses share. Preparation displays allocation ID/base epoch, DAO executor, exact `setConsent(id,bool)` calldata (`0x281b0917`) and zero ETH value. **Create DAO governance proposal** submits only to Governor. Voting, queue and Timelock execution follow. The original allocation contract then sees the actual Timelock as `msg.sender`; a voter never impersonates the DAO. Revocation can prevent only an application that has not happened. Once all consents exist, anyone may apply, so a later vote cannot undo an applied epoch.
3. **Claim DAO Warehouse credit.** The governance proposal targets original `withdraw(address,address)` (`0xf940e385`), with owner set to the actual Timelock. The implementation sends assets only to that owner and pays no withdrawal reward. It withdraws the execution-time credit minus one raw unit, explicitly shown as a dynamic whole-credit action. This governed owner withdrawal bypasses the public-withdrawal pause. Upstream also permits third parties to claim to the same owner when unpaused; this UI uses the governed owner path.
4. **Distribute a DAO-held ERC20 asset.** Select T or a specific market LP token, recipient and exact token-denominated amount. The proposal targets the token's original `transfer(address,uint256)` (`0xa9059cbb`), with zero ETH. After voting/queue/execute the Timelock spends its balance. Recipient and raw amount are explicit; no voter list or automatic payout algorithm is involved.

The existing Governor lifecycle shows historical voting weight, quorum, state, ETA and original full-batch preflight. Warehouse calls decode against its own target-associated ABI. A dynamic LP token target retains exact raw calldata; the prepared review and proposal description identify its address and token amount.

## Units and authority

Protocol revenue is minted as V2 LP, not T. Treasury reads actual token decimals and separates every LP contract. A0.1LP transfer is not a0.1T distribution and does not realize underlying value. LP removal/redemption remains a separate economic operation. The helper offers the app's T and known market pools; ETH spending and arbitrary token discovery are outside this helper.

Authority, allocation, consents, balances and Warehouse credit are read at one numbered block. Before proposing, SDK reads the executor again, requires identical target/value/calldata, rejects changed base epochs and unavailable balances/credits, and checks wallet/form generation immediately before Governor invocation. Input changes invalidate prepared readiness. State can still change after submission; original contracts and execution preflight remain authoritative. A UI read never reserves funds or consents atomically.

No helper signs as the Timelock, adds an executor key, impersonates an account or transfers assets when preparing a draft. Receipt-time collection and old epoch ownership are unchanged.

## SDK and validation

```js
const view = await sdk.treasurySnapshot(knownMarketLPs);
const input = { kind: 'consent', proposalId: '4' };
const prepared = await sdk.prepareTreasuryCall(input, knownMarketLPs);
// A later explicit action creates a Governor proposal, not consent itself.
await sdk.proposeTreasuryCall(prepared, input, knownMarketLPs, assertFormCurrent);
```

`claim` accepts `{asset}`; `transfer` accepts `{asset,recipient,amount}` in that token's actual decimals. `allocationWithGovernance` and `parseAllocationRows` are pure draft helpers.

The focused run passed18/18 tests in437.519ms: original ABI/owner/asset/amount, consent/revoke and stale restrictions, same-block reads, Warehouse sentinel, exact proportional rounding, rendered review and stale-form refusal before proposal routing. Independent peer source review found no material blocker. One bounded production build passed2.10s; guard2.464s, peak614,685,272B below768MiB, cleanupErrors[]: [report](evidence/dao-treasury/build-resources.json). No Solidity compilation, prover, deployment or transaction occurred. A live DAO allocation/revenue/consent/claim/internal-transfer cycle remains pending.

The first actual browser pass found an older Fee income polling defect: the initial empty editor was captured by the seven-second callback, so a later poll replaced edited text with the active allocation while its prepared review stayed visible. No transaction was submitted. The corrected component seeds only a never-initialized editor using a functional state updater, preserves intentional empty/edited drafts, checks review-versus-submission equality, and invalidates review on epoch/executor changes while preserving text. A deterministic regression runs the actual Fees component and its captured7000ms callback. The final focused run passed20/20 in637.414ms. Final Vite passed2.43s; supervisor2.693s, peak603,392,976B, cleanupErrors[]: [final build](evidence/dao-treasury/poll-fix-build-resources.json).

Actual browser recheck at265 kept the prepared20/40/40 text and review unchanged for23.117s. A manual20/35/45 edit survived19.823s and produced a matching review; offline original-ABI decoding of the exact DOM text matched raw shares2000/3500/4500. The actual DAO treasury card showed its genuine executor,0% share and zero holdings/credits for21 assets. Claim preparation correctly refused an empty credit and left proposal creation disabled. [Timed browser evidence](evidence/dao-treasury/browser-poll-265.json) distinguishes these read-only observations from positive financial execution. The own tab was closed; no wallet, transaction or proof job was used during this phase.


## Actual positive cycle and final Exchange freeze

The browser completed DAO admission, genuine V2 protocol LP income, a governed DAO-only Warehouse claim and governed consent to reduce the DAO share, through block319. Epoch4 is DAO15/Bob40/Alice45. DAO holds918830339724520 raw units (0.00091883033972452) of YES/T LP; its Warehouse withdrawable credit is zero. Both Governor proposals are Executed. [Full evidence](evidence/dao-treasury/through-319.json) records20 successful transactions and historical conservation assertions. No CTF collateral or T supply changed.

Internal payment was prepared only:400000000000000 raw LP (0.0004) to Carol. No payment proposal or transaction was created; consent revocation and LP-to-T monetization were not tested. This supersedes the earlier positive-phase-pending note for admission/income/claim/consent only. The implementation and chain are frozen at319 following the user's decision to consolidate on Vault.
