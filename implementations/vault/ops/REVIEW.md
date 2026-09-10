# Persistent public-pilot lifecycle review

Source-only lifecycle changes were reviewed without installing LaunchAgents, restarting services, modifying authority, or creating a new chain. The public origin and owner come from the operator's explicit `prepare.py` arguments; server environment names match `server/public-surface.mjs`: `VAULT_PROTOCOL_VERSION=2`, `VAULT_PUBLIC_ORIGIN`, `VAULT_PUBLIC_OWNER`, `VAULT_PUBLIC_WRITES=1`. The last flag only requests admission: the independent onchain migration readiness predicate remains authoritative.

`prepare.py` renders four reviewable user LaunchAgents (chain, API, nginx, ngrok) and writes each generated file atomically. It does not install or start them. `service.mjs` keeps the original launchd process group (`AbandonProcessGroup=false`), awaits the actual child's close, allows 60 seconds for the Anvil final dump, up to 120 seconds for final checkpoint validation, and a 200-second supervisor grace period. The launchd exit window is 240 seconds. The manager must signal and await the supervisor before bootout: direct bootout can terminate the whole group during a dump. Anvil's launcher receives termination first so it can request the native process's final state dump. The API waits for the existing chain and verifies the actual pinned V2 registry/T code; matching chain ID alone is insufficient. Failed startup retries are throttled by launchd to ten seconds.

Child stdout/stderr, including nginx's warning/error output, go through a synchronous bounded rotating writer: at most 2 MiB per file and two rotated copies, or 6 MiB per role / 24 MiB for four roles. No unlimited launchd output file remains. Nginx access logging and ngrok request inspection are disabled. Ngrok uses its normal user configuration outside the repository; this script never reads, writes or prints its auth token. Installed ngrok 3.39.11 help confirmed `http --url … --inspect=false --log stdout --log-format json --log-level warn`.

Nginx binds only 127.0.0.1 ports 8080 and 5173. Only `/rpc` and `/api/` proxy to the API. The upstream Host is the exact configured public hostname; the browser Origin is preserved and checked by the API. `X-Vault-Client-IP` is replaced with nginx's observed client IP. With a local tunnel agent, clients share the tunnel's loopback bucket, which is conservative and does not pretend to identify remote visitors from an untrusted header. Local preview can retrieve config without an Origin and displays the browser's explicit public-site link; local-origin authenticated writes remain rejected.

## Persistence finding and changed validation

The existing running node's primary snapshot was observed at approximately 402 MiB, while its older last-good copy was approximately 63 MiB. The earlier 64 MiB whole-JSON startup/backup cap therefore prevented a restart and left backup stale. The replacement uses pinned [`stream-json` 1.9.1](https://github.com/uhop/stream-json) with unpacked token streams: no complete state, code strings or arrays are assembled. It validates the complete JSON, required root shapes, bounded nesting/keys, exact streamed SHA-256 and stable source identity. Snapshot byte limit is 1 GiB **per snapshot**, separate from memory; primary plus backup and an operator archive can use several GiB in total.

Anvil loads only the stable primary with `--load-state` and writes a separate `anvil-state.writing.json` through `--dump-state`, every 30 seconds. A five-second metadata poll waits for two unchanged observations before attempting a checkpoint. One checkpoint runs at a time: copy live dump to a temporary file, validate the complete copy, fsync, preserve the previous stable primary as last-good, then atomically replace the primary. A failed/racing copy preserves the stable primary. Validation has a 120-second timeout. Shutdown aborts background validation, allows Anvil to finish its final dump, then awaits final promotion before the launcher exits; a failed promotion exits nonzero. A missing or invalid primary never silently loads an older backup. The durable checkpoint can lag by the native dump interval **plus** dump, quiescence, copying and validation time; no strict 30-second or zero-transaction crash-loss guarantee is claimed.

Pilot launcher passes `VAULT_MAX_PERSISTED_STATES=16`, `VAULT_PRESERVE_HISTORICAL_STATES=0` and five-second interval mining. It omits Anvil's `--preserve-historical-states` dump flag: old in-memory historical state snapshots are not serialized into each checkpoint. The ordinary local default keeps that flag and 128 historical state snapshots. The full pre-pilot 584 archive remains retained. Old-state historical `eth_call` after pilot restart is deliberately unsupported; current state, serialized blocks, transactions, receipts and logs are separate and require actual post-restart verification. This does not use `--prune-history` or intentionally remove transaction records. The transaction-block keeper flag is omitted: in pinned Anvil 1.7.1 that flag prunes old transactions/logs even as empty blocks advance. State-cache retention remains separate from transaction history. Anvil pilot capacity is bounded and is not an unlimited archive-node guarantee.

### Initial live archive attempts (historical failures)

The one approved ordinary live copy raced the ten-second primary dump and was rejected before publication; [report](../evidence/pre-pilot-snapshot-resources.json) records 9.060 seconds, peak 30,345,448 bytes and clean cleanup. The next approved `COPYFILE_FICLONE_FORCE` attempt returned `ENOSYS` from Node's Darwin implementation; [report](../evidence/pre-pilot-clone-resources.json) preserves that failure. Both removed only their own temporary files and left the primary/live chain unchanged. These two attempts did not create an archive. The coordinator subsequently produced and validated `.state/chain/pre-pilot-584.json` after the controlled migration checkpoint; that later successful archive and recovery are separate from these original failed attempts.

Three focused tests passed: long 2 MiB code-string streaming/hash, malformed/duplicate/truncated dump preserving previous backup, and bounded log rotation for oversized writes. Syntax checks passed for the launcher/service/Python renderer. No lifecycle daemon installation or crash-restart acceptance is inferred from these tests.

## Onboarding scope

The pilot uses the user's actual browser wallet. Native test ETH is required for gas and T for trading/LP. The owner distributes initial test funds explicitly from their real wallet; no faucet, relayer or new server signer is implemented. A zero-ETH account cannot submit an ordinary faucet claim transaction by itself.

## Restored clock and durable-primary correction

The coordinated first restart exposed an original launcher defect: always passing the genesis timestamp reset Anvil's mining clock after state load. It produced unpublished empty blocks after 584 with backwards timestamps. The coordinator retained forensic state and selected its verified pre-pilot 584 archive for explicit recovery; this agent made no node or recovery mutations. A direct launchd bootout also interrupted a live dump, demonstrating why the native writer must not target the stable primary.

The streamed validator now returns exact decimal `blockNumber` and `blockTimestamp` (bounded uint64). Startup always supplies the original genesis timestamp to `--timestamp`, including on resume, and starts with `--no-mining`. It verifies the original genesis timestamp/hash relation to block 1 and exact restored head. Only then does the loopback `evm_setTime` call initialize the persistent clock offset to `max(savedTimestamp+1, currentWallClockSeconds)`. Mining is enabled afterward: interval mode for the pilot, automine for the ordinary local default. This keeps immutable genesis construction separate from the resumed block clock, including when saved test-chain time is ahead of real time. A failed initialization cannot promote a dump or enable mining.

Six focused tests passed after these fixes: long-string streaming, malformed backups, log rotation, strictly monotonic resume arguments, stable-primary promotion preserving its predecessor across an incomplete next dump, and missing/duplicate/malformed timestamps. Source syntax checks passed. Actual restart monotonicity and final-checkpoint completion remain coordinator-owned live acceptance.

The next pilot resource correction was motivated by the coordinator's measured approximately 514 MiB dumps and sustained launcher CPU during repeated validation. The conditional historical-state flag and explicit `/usr/sbin:/sbin` PATH for ngrok system utilities passed seven focused tests plus source syntax checks. No build or process action was performed in this source patch; smaller dump size and retained original receipt/log access are not claimed before the coordinator's planned restart verification.

## Verified clock initialization after compact restore

The earlier attempt to pass resume time through `--timestamp` created synthetic genesis headers in compact snapshots. That approach is superseded by the original-genesis flag and separate clock initialization above. The coordinator repaired its offline snapshot independently, retaining the real history and forensic copies; this source patch does not edit snapshots.

Pinned Anvil 1.7.1 commit `4072e48705af9d93e3c0f6e29e93b5e9a40caed8` confirms [`evm_setTime`](https://github.com/foundry-rs/foundry/blob/4072e48705af9d93e3c0f6e29e93b5e9a40caed8/crates/anvil/src/eth/api.rs#L458-L464) calls TimeManager.reset, permanently setting the clock offset and last timestamp. Seconds below 1e12 are unambiguous; the helper rejects larger epochs rather than confusing them with milliseconds. RPC mining setters replace the entire mode, so interval plus automine calls would not reconstruct mixed mode. The pilot deliberately uses interval-only five-second mining.

[Actual isolated compact-restart evidence](../evidence/clock-resume-smoke.json), on port 19847 with no deployment or financial transactions, preserved the genesis hash and mined two strictly increasing post-restart empty blocks after setting the new clock. [Resource report](../evidence/clock-resume-smoke-resources.json): 2.320 seconds, peak 64,917,488 bytes, exit 0, clean cleanup. Nine focused tests passed, including clock-before-mining call ordering and wrong-genesis refusal. The main port 9547 was never contacted by this check.

The atomic `.state/chain/ready.json` marker contains actual launcher/native PIDs, chain instance, verified genesis identity, restored block number and clock target. It is removed before startup and on stopping/closing. The main API's identity gate is not weakened.


## Coordinator live acceptance

After the explicit genesis-header repair at840, the public endpoint returned the original genesis,
increasing blocks through846, unchanged successful receipts/logs at533,584 and753, and
`publicWriteEnabled=true`. See [restart evidence](../evidence/public-pilot/restart.json).
The stable checkpoint845 was10,559,655bytes. All216 source tests passed; production build passed.
The API supervisor now also requires a clock-ready marker matching the actual launcher/native
PIDs and deployment instance before starting, in addition to live code/authority checks.
This supersedes the earlier source-only pending acceptance notes; the browser user's Uniswap
Extension still does not support this custom chain, so that wallet's signed browser transaction
is not claimed. The independently signed SDK EAS transaction753 is real and preserved.
