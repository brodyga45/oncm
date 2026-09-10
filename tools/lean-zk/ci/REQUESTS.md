# Generic requests and public results

Prepared and offline-tested; **not remotely dispatched/validated yet**. The new
`lean-zk-request.yml` reuses the original measured prover/verifier and resource
controls. No local proving, push or chain action ran during implementation.

## Exact transport

The operator-owned server pins a trusted source commit containing this workflow,
creates its single-parent child changing only `oncm-request.json`, and pushes
`refs/heads/codex/proof-requests/<sha256-of-exact-JSON-bytes>` to `brodyga45/oncm`.
CI checks repository/branch/head/parent/diff, regular file mode and committed blob
bytes. Checking the parent relationship does not replace the server's trusted pin.

```json
{
  "format": "oncm-proof-request-v1",
  "requestNonce": "f1f5df03-7d56-47b4-b2bf-024123456789",
  "profile": "perf05",
  "profileId": "0x…",
  "imageId": "0x…",
  "goalHash": "0x…",
  "outcome": 1,
  "source": {"text": "…", "sha256": "…"},
  "goal": {"base64": "…", "sha256": "…", "bytes": 1},
  "export": {"base64": "…", "sha256": "…", "bytes": 1}
}
```

Ellipses are placeholders. Fields are required; unknown/duplicate keys fail.
Hashes are lowercase64hex; only bytes32 commitments use `0x`. UUID is canonical
lowercase text identifying the owner's server job. Retry preserves exact bytes
including nonce; different owners use different nonces. Request≤4MiB, nonempty
UTF-8 source≤512KiB, each decoded export≤1MiB, canonical base64 and exact lengths.
Profiles are the existing pinned `perf05` or `v3`; request cannot choose tools,
commands, source URLs, Lake scripts or a different executable.

Outcome0 requires export==goal. Outcomes1/2 require full proof/refutation export
beginning with the exact goal. Goal starts with the immutable foundation and ends
at the structural Oncm.goal definition. There is **no theorem whitelist**: tests
include the actual new Ix TN arithmetic export. These are data/hash/prefix checks,
not native typing or a segment cap. Original standalone r0vm has no execute-only
CLI. Mathematical verification occurs inside the unchanged guest during real
proving. Source is review/reproducibility metadata, not a proved elaboration input;
the workflow never executes source. Invalid mathematics may consume bounded work
but cannot yield an accepted original receipt.

Runtime is unchanged: one heavy job, standard public4CPU, shared13GiB/no swap,
1800s per case; whole proof job45min, publisher8min. The same concurrency group
covers manual/generic workflows. **GitHub keeps only one pending run**: server
must maintain the durable queue/global lease and submit at most one. Cancellation
is unsupported; detaching a waiter does not cancel remote computation.

## Original verification and public publication

The proving job has contents:read. Existing `run.py --request` calls original
r0vm3.0.6 plus original Docker Groth16, checks the expected full128-byte journal
and original Receipt::verify, then emits canonical raw256-byte seal, EVM260-byte
seal and ABI certificate with request provenance. It never claims EVM execution:
`evmVerified` stays false until an application's independent onchain check.

A separate publisher has contents:write/actions:read. It validates compact output,
rechecks exact bindings, installs only the pinned original r0vm executable without
pulling/starting Docker, and calls original VerifyRequest again. Its write token
is removed from verifier subprocess environments. Artifacts/source are data, never
executed. No logs, environment dump, token or proving key is published.

The publisher uses official Git database APIs to create
`refs/heads/codex/proof-results/<requestDigest>` with `result.json` and, only on
success, `receipt.bin` and `certificate.bin`. Result fields:

```text
format: oncm-public-proof-result-v1
status: verified | failed
repository, requestDigest, requestCommit, baseCommit, requestBranch
runId, runAttempt
input: requestNonce/profile/profileId/imageId/goalHash/outcome,
       sourceSha256/goalExportSha256/exportSha256
proof: existing oncm-real-groth16-ci-v1 object | null
resources: compact actual cgroup counters | null
error: bounded diagnostic | null
```

The first verified result is preserved. A failed result advances only for a newer
attempt of the same run/request; updates never force-push. Missing/invalid proof
output publishes failure if the publisher can run. Runner loss, permissions or
network failure can leave no result; the server must show awaiting-result and
must not automatically start another proof.

Anonymous delivery URL:
`https://raw.githubusercontent.com/brodyga45/oncm/refs/heads/codex/proof-results/<digest>/result.json`.
Publisher also prints an immutable result-commit URL. Consumers bind request
digest/commit/base and verify through the installed original bridge; GitHub data
is delivery/provenance, not mathematical authority. No browser artifact token.

## Tests and activation

`test_request.py` and `test_ci.py` are tiny offline tests: all outcomes/profiles,
actual new TN data, schema/nonce/size/base64/hash mutations, canonical names,
source-parent/diff/mode, stale provenance, real CI3 receipt transport mutations,
and idempotent/non-force publication. The receipt test fixture is actual CI3
registration, SHA256
`51a0a05016ad11a69a7fcbdd9392c6d4213f8ca466e7a719d799228130c56945`;
offline tests parse/bind it, without cryptographic execution or proving.

Activation still needs reviewed publication, server base/global lease, one real
request and verification of the original proof plus public result branch.
Generic application import is separate; fixture-only UIs are not changed here.
No paid service or dispatch was introduced. Original tool/container pins remain
in pins.json. Download-artifact is officialv4.3.0 commit
`d3f86a106a0bac45b974a628896c90dbdf5c8093`, verified through its GitHub ref API.
