# Vault V2: final economic assertions, blocks 527–552

`check.mjs` passed **541 assertions** against the saved historical snapshots and raw receipts. This is an offline evidence check, not 541 independent tests or a new browser run. It performs no RPC, signing, mining, proof generation or deployment. `result.json` contains exact integers, transaction IDs, input SHA256 hashes and every captured ERC20 balance delta.

Run from the repository root with the existing Vault locked dependencies:

```sh
node --max-old-space-size=128 implementations/vault/evidence/monetary-policy/final-economic-assertions/check.mjs
```

Optional `--write` rewrites only the sibling `result.json`. The successful recorded run took about 0.46 seconds. No build was run.

## Confirmed reward payouts

All amounts use 18 decimals. Each amount equals `floor(program budget × recorded account weight / total weight)` and matches the actual `RewardClaimed`, T `Transfer`, claim calldata and final storage. The two account identities remain distinct throughout.

| Block | Participant | Program | T paid |
|---|---|---|---:|
| 534 | Alice | 0, T trading volume | 2.997293290548789958 |
| 535 | Alice | 1, BPT × remaining lock seconds | 1.999881517436141478 |
| 537 | Bob | 0, T trading volume | 0.002706709451210041 |
| 538 | Bob | 1, BPT × remaining lock seconds | 0.000118482563858521 |

Total paid: **4.999999999999999998 T**. Program 2, the exact-in T input fee weight program, was deliberately left unclaimed; its recorded positive weights were preserved.

After the claim deadline, closes at blocks 550/551/552 transferred respectively **1 T**, **1 raw unit of T**, and **1 raw unit of T** to each program's fixed voted recipient, the existing Timelock `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0`. Thus paid plus reclaimed equals the entire **6 T** funding. At block 552 all three programs are closed, each `paid + reclaimed == budget`, and RewardBudget reserved, outstanding budget and token balance are zero. Original budget fields remain 3/2/1 T; they are historical configuration, not reset to zero. Total T supply remains **1006 T**; settlement minted no T.

## Principal, resolution and redemption

Actual registry resolution is block **533**, transaction `0xd9c3aabdbc6170379ceeee82b3f021e9c586f7b9c9c51448fb8f6d2d49fef7fb`. Its exact certificate bytes equal the published CI4 `true-proof.json`; the independently decoded full journal binds the selected goal, perf05 profile and TRUE outcome. Original CTF emitted payout **[1, 0]** and the registry emitted `evidenceHash = keccak256(certificate)`.

`resolution-533.json` separately records the original Groth16 verifier and governed bridge accepting at historical block 532, plus three negative checks. This offline checker consumes that readback and rechecks the actual certificate, calldata and raw resolution events; it does not itself rerun a pairing check or claim that source text was semantically verified.

- Alice received **1 BPT** back from BptLockMeter at block 536; Bob received **0.0001 BPT** at block 539. Both returns occurred after resolution and before their pool exits. All final LP deposits and meter BPT custody are zero.
- Bob exited at 541: `95821138645022` raw YES and `104435683153506` raw T. Alice exited at 545: `19164227729003115577` raw YES and `20887136630699831607` raw T. Both original proportional exits respected their recorded minimum amounts and charged zero exit swap fees.
- Bob redeemed `1159201405840430` raw YES for exactly that many T at block 543. Alice redeemed `29998743298593201356` raw YES for that many T at 548 and burned **30 losing NO for zero additional T**. Alice and Bob end with zero YES, NO and BPT.
- The original minimum `1000000` raw BPT remains. Pool reserves are `958212` raw YES and `1044357` raw T. CTF retains `97500000958214` raw T, exactly backing the remaining unredeemed YES supply, including the DAO's winning YES.

## Fee income is a separate flow

At 514, both original controller creator and protocol fee withdrawals went to the current Split. At 515/516 the distributable amounts were respectively `6499999999999999` raw T and `649999999999999` raw YES, after the upstream Split's one-unit sentinel. The active allocation remains Bob **40%**, Timelock **15%**, Alice **45%**.

The actual Warehouse calls at 530/531 used the four-argument `withdraw(owner, tokens, amounts, withdrawer)` with **owner and destination both Timelock**, sent by Alice permissionlessly. They transferred the complete DAO credits:

| Asset | DAO fee income (raw) | DAO credit remaining at 552 |
|---|---:|---:|
| T | 974999999999999 | 0 |
| YES | 97499999999999 | 0 |

Each is exactly the floor of 15% of the distributable asset. No one-unit remainder is assumed at withdrawal: the raw calldata and events prove these full withdrawals. Split retains one raw T/YES and Warehouse retains two raw T/YES from distribution rounding.

Final Timelock holdings are **1.000975000000000001 T** and **0.000097499999999999 YES**. T consists of the above fee income plus **1.000000000000000002 T reward remainder**; these are independently accounted flows. The DAO's YES has not been redeemed in this pass.

Bob's later trade left **0.0000065 T uncollected**: `4500000000000` raw creator fees plus `2000000000000` raw protocol fees. They remain pending in the Vault, outside RewardBudget and already distributed income. No repeat collection was needed for this validation.

## Evidence boundary

Inputs are the existing earning journal and block-527 snapshot, final settlement journal (23 successful transactions / 78 logs), block-552 snapshot, CI4 artifact, resolution readback and the two clock fixture reports/snapshots. Raw events are decoded against their actual contract emitters; ambiguous generic annotations such as `withdraw(uint256)` do not decide which contract was called.

Clock blocks **532** and **549** are explicitly test setup, not browser financial actions. Their before/after snapshots preserve token holdings, supply, raw weights, budgets, paid/reclaimed counters, fees and principals; only time-derived eligibility and claimable views change. Every financial action retains its actual block and transaction. This checker does not create additional browser evidence or extrapolate past block 552.
