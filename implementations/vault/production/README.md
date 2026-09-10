# Production artifact distribution

Normal `npm run dev` uses these **27 real artifacts**, the separate v3 proof bootstrap and the three original/social artifacts. It does not compile Solidity, Lean or a prover. The set is exactly `scripts/production-graph.mjs`; test/mock/unconfigured verifiers are excluded.

`manifest.json` pins each artifact SHA-256, compiler, settings, metadata and181 source/import/package-lock/compile-script inputs. `scripts/production-bootstrap.mjs` validates the complete set before copying missing artifacts to `.state/artifacts`. An existing differing artifact is an error, never silently replaced. Deployment still uses the original Balancer VaultFactory and original protocol code.

The bytes were previously exercised by the local economic/governance tests. On2026-09-10, metadata-only compilation of current sources/settings established24 exact matches between Solidity metadata's **UnixFS CIDv0 digest** and the digest embedded in each runtime bytecode. The other3 artifacts (CTF and canonical wrappers) match original published ABI, creation and runtime bytes exactly. This is a source/compiler/settings binding check, **not a claim that full bytecode recompilation completed during this pass**. Metadata check2.423s/435,547,104B under1GiB/30s; the earlier explicit full compilation stopped at60.249s/494,527,104B without generating artifacts. Both facts remain in fresh-start evidence.

The small `metadata-ipfs.mjs` routine serializes a single UnixFS/DAG-PB block using Node's standard SHA-256 and rejects metadata above262144bytes. CIDv0 is not the bare SHA-256 of the JSON. Sources: [Solidity v0.8.28 IPFS implementation](https://github.com/ethereum/solidity/blob/v0.8.28/libsolutil/IpfsHash.cpp#L144-L182), [UnixFS specification](https://specs.ipfs.tech/unixfs/), [Solidity contract metadata](https://docs.soliditylang.org/en/latest/metadata.html).

Explicit rebuild when sufficient resources are available:

```sh
npm ci
npm run compile
node scripts/build-production-bootstrap.mjs
node --test test/production-bootstrap.test.mjs
```

`npm run compile` retains the original pinned compiler groups: solc0.8.28 Cancun and0.8.17 London, optimizer runs1, viaIR. The metadata script does not update deployment or chain state. After a legitimate source/dependency change, rebuild and review artifacts before starting; do not edit hashes merely to bypass the consistency check.

The actual fresh source-copy deployment, original cryptographic verification, social setup and own read-only browser checks are recorded in [fresh-start evidence](../evidence/fresh-start/README.md). Dependencies reused this app's installed npm cache in the test; a clean-machine download/install was not repeated.
