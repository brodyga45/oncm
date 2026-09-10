# Vault deadline browser evidence —2026-09-10

Own Chrome tab102825318, existing Anvil chain31373 / instance554c825d-6813-43bf-9bf0-6ede06acff4d. Started at188. No liquidity, new Lean/ZK work, network reset or package publication. The existing6 statements/3pools were already resolved, so a separate open parent was created.

| Actual step | Result |
|---|---|
|189: ResolvedAsTrue of genuine proved base0x390403…fd08 | New unfunded open parent0x161806…4684; expectedTrue, deadline0. |
|190: ResolvedBy of that parent,2030-01-01 00:00 Asia/Yerevan | New open child0x3c68f2…662e. Visible UTC2029-12-31T20:00:00Z / Unix1893441600 exactly equals transaction calldata/storage. |
|Attempt resolve child while parent is open | Friendly pending message; no transaction, head190 unchanged. |
|Governance custom-call preflight to local Account0 with calldata0x | Actual browser reports `Target has no contract bytecode`, `ok:false`, from actual Timelock, at190. No proposal/transaction was submitted. |

The pending message was exactly: «Производное пока не разрешимо: ожидается исход зависимости или наступление срока. Транзакция не отправлена.» The independent read-only collector reproduced original contract preflight and recorded full receipts/calldata/logs and original CTF payout denominators0. Both new wrappers have totalSupply0; both tested wallets have zero new positions. The old3pools' tokens/reserves/BPTsupplies, T supply, CTF collateral and two wallets' T balances equal188. Gas ETH costs of the two authorized transactions are not described as zero.

Two actions were **rejected by automatic approval review before execution**:

1. Create separate ResolvedBy2020 expired child of parent189, title `Deadline QA — ResolvedBy 2020 expired remains False`. Visible review:2020-01-01 00:00 UTC+04:00 /2019-12-31T20:00Z / Unix1577822400, expected0(any recorded outcome). Review considered persistent expired test state on the shared devnet insufficiently authorized and preferred an isolated chain.
2. Resolve already-created parent189 from its genuine proved dependency. Review considered irreversible resolution on shared persistent QA state insufficiently specifically authorized.

Neither action was retried through UI/API/another chain. No new expired/matching/opposite condition was made as a workaround. The earlier package-publication refusal remains untouched. Root was given exact IDs/title/parameters to request concrete user approval.

Consequently this report establishes **creation with exact deadline + pending refusal**, not the Vault timely, expired-False or late-parent branches. Parent189 and child190 remain open. `browser-rpc.json` verifies the predicted expired statement has no author at190. Additional scenarios require the pending authorization; they must not be marked passed from unit tests or another application's browser run.

Final190 hash: `0x05a284645959960dcbbfb76585c701e5e6e079e61e01842666424126fbf9e019`. Read-only collector1.269s/59,677,440B under512MiB15s, no cleanup errors; `resources.json`. No app source or contract changes were made in this manual pass; the previously committed strict calendar/local-UTC-Unix review was used. Only our own QA tab was closed afterwards.
