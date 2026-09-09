# Public GitHub publication boundary

The authorized destination is the public `brodyga45/oncm` repository. Publication
itself is handled by the coordinator; this inventory task does not stage or push.

Publish the project documentation, all three independent application sources,
contracts, frontend/SDK/server code, tests, package/Cargo locks, retained dependency
source and licenses, proof checker/guest/host sources, small fixed mathematical
fixtures, exporter source/patch/build recipe/pins, and the compact workflow in
`.github/` plus `tools/lean-zk/ci/`. Those CI paths are explicitly preserved.

Do not publish local runtime configuration or backups, execution-policy overrides,
dotenv secrets, local chains/deployments, private jobs/source packages, discussion/
profile/vote stores, generated frontend assets, binaries, toolchains, proving keys,
witnesses, receipts, caches, runtime resource logs, or transient performance and
candidate experiments. Source assets needed by compact CI must be copied into its
self-contained `ci/` bundle, never imported from excluded experiment directories.

The root `.gitignore` now includes the reviewed rules from
`tools/publication/ignore.rules`. In particular:

| Area | Publication treatment |
| --- | --- |
| `implementations/{agora,exchange,vault}/` | Keep application source; preserve independent directories |
| Each `proof/` and `tools/lean-zk/` | Keep source, manifests, examples, pinned build inputs; exclude executable outputs and live config |
| Each `exporter/` | Keep two pinned source modules, explicit patch, recipe and hashes; exclude `.lake/` binary output and local measurements |
| Exchange `data/`, Agora `.local/`, Vault `.state/` | Entire local runtime state excluded |
| All `.jobs/`, `.cache/`, `.resource-reports/` | Excluded regardless of which implementation created them |
| App `performance/`; root `native-check-candidate/`, `rapidsnark-candidate/`, `exporter-capacity-research/` | Excluded transient experiments |
| `.github/`, `tools/lean-zk/ci/` | Included, subject to the same secret/large-file checks |
| `tools/publication/local-report/` | Excluded audit outputs; publication script and rules remain included |

The vendored `implementations/vault/vendor/1155-to-20/.env.example` is explicitly
excluded because its credential-shaped value is unnecessary for contract builds.
Other public dotenv examples/samples remain eligible and are scanned.

## Inventory evidence

The last pre-final-CI snapshot selected **1,154 files / 25,348,902 bytes** after the
proposed rules, with 389 paths excluded. Source/documentation additions afterward
can change this total. No included file exceeded 50 MB. Four 176.8 MB exporter
binaries were correctly excluded. No unknown secret-pattern match remained;
four source files contain only the known public Anvil development mnemonic:

- `implementations/agora/sdk/chain.mjs`
- `implementations/exchange/scripts/chain.mjs`
- `implementations/exchange/scripts/deploy.mjs`
- `implementations/exchange/web/main.jsx`

These are development-chain credentials already public by design, not credentials
for funded accounts. Their values were not printed by the audit. The scanner is
heuristic, not a guarantee that every possible secret is detectable.

## Vendored repository integrity

Read-only filesystem inspection and `git ls-files --stage` found **no nested
`.git` directories/files, gitlinks, symlinks or embedded-directory candidates**
in the proposed publication set. Current vendored dependencies are ordinary
source files. No repository metadata or local patch was removed.

If a later dependency adds nested Git metadata, stop blind recursive staging:
Git can otherwise create a gitlink without a usable `.gitmodules`, breaking fresh
clones. Preserve the working checkout and its modifications. Either use pinned
submodules with complete `.gitmodules` and separately preserved/published patches,
or publish an ordinary vendored source snapshot through explicit file staging or
a clean publication tree. Never delete the original vendor `.git` merely to make
`git add` recurse.

## Final pass

After the proof agent finishes the CI bundle, run **one final** inventory:

```sh
python3 tools/publication/inventory.py
```

`manifest.json` contains only relative paths, sizes and SHA-256 values. Findings
contain filenames and categories only. The tool never emits matched secret values,
follows symlinks, changes Git metadata, stages or publishes. It also identifies
files changed during scanning, preventing inconsistent size/hash records. Review
any unknown secret match, included large file, symlink, changed file or gitlink
before coordinator staging. The final manifest is a snapshot, not an instruction
to publish subsequently created files without review.
