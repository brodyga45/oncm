# Three governed reward programs — actual browser acceptance

The agent used its own Chrome tab `102825431` on `http://127.0.0.1:5173/`, with normal labelled Account 0 and Account 1 local wallets. The previous agent explicitly released the chain mutation slot at block 425 after creator 25%, global protocol 10%, and existing-pool cache synchronization. This pass created only the three authorized programs through the existing Governor and Timelock. No program was created through scripts or impersonated contract calls.

Each preparation displayed and checked the three exact ordered calls: T `mint(RewardBudget, budget)`, `createProgram(expectedId, meter, start, end, claimDeadline, budget, Timelock)`, and the actual meter `configureProgram`. The expected ID was freshly prepared **after** the preceding program had executed. Votes came from two separate members, each with `1e18` historical MEMBER weight. The UI showed quorum reached, queue preflight and full ordered execution `eth_call`. Execute remained disabled until the Timelock delay elapsed.

| Program | Formula / budget | Proposal | Account 0 vote | Account 1 vote | Queue | Execute |
|---|---|---:|---:|---:|---:|---:|
| 0 | Actual T-leg volume · 3 T | 426 | 429 | 430 | 441 | 452 |
| 1 | Voluntary BPT locking · 2 T | 453 | 456 | 457 | 468 | 479 |
| 2 | Actual EXACT_IN T-input fee weight · 1 T | 480 | 483 | 484 | 495 | 506 |

Pool: `0x75ba1e7c0AC567f3451D2646f1db5eAbc99d07f7`. Trade meter: `0x32e0cbE412b5bF260A6337395CBB9AC7a1a3ccA0`; LP meter: `0x2a810409872AfC346F9B5b26571Fd6eC42EA4849`. Program 2 uses metric 1 and explicitly excludes sells/T output and EXACT_OUT from fee weight.

All programs have the same reviewed period:

- Start: Unix `1789050027`, `2026-09-10T14:20:27Z`, 18:20:27 Asia/Yerevan.
- End: Unix `1789050927`, 15 minutes later.
- Claim deadline: Unix `1789051827`, another 15 minutes later.
- Fixed remainder recipient: Timelock `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`.

At final block 506, timestamp `1789043644` was still before start. The UI showed 3 programs, total supply 1006 T, RewardBudget balance 6 T, reserved 6 T, free 0 T. All program weights/paid/reclaimed were zero, no program was closed, and claim/close buttons plus LP staking were disabled before the period. No stake, trade, claim, close, settlement or large jump to the earning period occurred in this pass. Sole chain mutation ownership was handed back to root immediately after the final receipt and UI accounting check.

[Historical evidence](through-506.json) contains all 15 exact receipts, complete Governor proposal bytes, proposal IDs, independently decoded mint/create/configure arguments, per-program bindings, and before/after supply/reserves. The collector checks original `Governor.hashProposal`, executed states and both vote authors/weights. Twelve T/pool-token/BPT account balances across four public test actors were identical between 425 and 506; governance gas costs are not included in that equality claim.

The [read-only collector](capture.mjs) has no signer or mutation methods. It completed in 1.864 s with peak process-tree footprint 85,629,384 bytes and clean exit under a 256 MiB / 45 s cap; see [resource report](capture-resources.json). Its assertions passed. No full build or proving occurred.

One browser click in the third proposal's initial voting delay timed out. A read-only snapshot showed block 481 and Pending, proving that exactly one of the two intended one-block advances had occurred. Only the remaining advance to 482 was then performed. No uncertain financial or governance transaction was repeated.
