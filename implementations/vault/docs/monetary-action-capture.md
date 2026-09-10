# Actual monetary-action receipt capture

`scripts/capture-monetary-actions.mjs` is prepared for the coordinator's later **actual block list**. It has not yet captured a new monetary browser scenario. It owns no signer and explicitly restricts its provider to receipt/transaction/block reads. It rejects Governor/Timelock transactions, which belong to the separate program-governance journals.

Run from this implementation after the actions and endpoint blocks exist:

```sh
node --max-old-space-size=128 scripts/capture-monetary-actions.mjs \
  --spec evidence/monetary-policy/ACTUAL-actions-spec.json
```

The JSON spec has format `vault-v2-monetary-actions-spec-v1`, integer `beforeBlock` / `afterBlock`, `actions` containing increasing unique `{block,label,transactionHash?}`, and `out` under `evidence/monetary-policy/`. All blocks must satisfy `beforeBlock < block <= afterBlock`. Supply an exact transactionHash if its block contains more than one transaction. At most100 action blocks and a64KiB spec are accepted. Labels annotate the coordinator's browser observation; they are not inferred claims that a transaction implemented the label correctly.

Optional `snapshots: {before,after}` provides existing or intended JSON paths in the same evidence directory. Without it, the journal basename gets `.before.json` and `.after.json`. The collector invokes the existing `capture-monetary-snapshot.mjs` **sequentially**, each at the exact block with Node heap128MiB and60s child timeout. Existing reports are never overwritten; their format, chain instance, numbered block/hash and selected T/registry/Vault/coordinator/rewards graph must match. The journal stores snapshot paths, exact SHA256 and source references rather than duplicating the complete snapshots. The original snapshot helper currently covers the known initial V2 YES/T market/pool and up to20 programs; it must explicitly change before use with unrelated markets.

Each listed transaction records hash, status0 or1, sender, target, value, nonce, gas, raw calldata and logs with original topics/data. ABI decoding retains all matching interpretations from the selected deployed ABI file, and reports unknown/ambiguous matches explicitly. Snapshot runtime pins establish the known contract graph; ABI signature matching alone does not authenticate unknown emitter bytecode. The requested blocks are rechecked for canonical hash consistency before writing an exclusive new journal.

The tool does not invent expected balances or a browser PASS, and does not reject a genuine status0 receipt as if it never happened. It reports observed success/failure counts and links the full before/after data for subsequent economic assertions. Only listed transactions are covered; unrelated actions between endpoints are not silently ruled out. Failed snapshot/binding checks stop the final journal, preserving any already-created historical snapshot for inspection.

Five tiny non-network tests cover spec bounds, write-RPC refusal, original ABI precision/unknown data, ambiguous decoding and stale/wrong-graph snapshot refusal. No new EVM process, build, proof, live transfer or captured browser pass was used to test this collector.
