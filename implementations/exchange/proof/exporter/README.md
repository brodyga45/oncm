# Pinned exporter with standard initial map capacity

This runtime owns its exporter binary and source bundle. It imports no other
application. The original external upstream binary is preserved; its SHA-256 and
the selected binary's SHA-256 are in `pins.json`. `runtime.before-exporter-default.json`
in the parent directory preserves the configuration before promotion.

The source is the two modules needed from leanprover/lean4export commit
`15f6055e299ad5b89345e533cc2192f4cc00f659`, built with Lean 4.33.1. The sole source
patch replaces the expression map's preallocated ten-million-entry capacity with
the ordinary Std default `{}`. This restores an existing approach used by the
[nanoda maintainer's exporter](https://github.com/ammkrn/lean4export/blob/4dc170805dc7abee5c8bcad72d879e2c37701cf1/Export.lean).
All lookup/insertion/growth and traversal behavior is retained.

`upstream/` contains the unmodified source subset, `std-default-capacity.patch`
is the exact change, and `pins.json` hashes the source, patch, build recipe and
selected macOS ARM binary. Mathematical profile/image IDs, foundation and goal
hashes do not change. This allocation tuning is not a new mathematical profile.

## Offline reconstruction

From the parent proof runtime, using the existing pinned Lean installation:

```sh
/usr/bin/python3 resource-guard.py --memory-mib 1024 --timeout 60 \
  --report /absolute/new/exporter-build-resources.json \
  --lock-file /private/tmp/oncm-worker-501.lock -- \
  /usr/bin/python3 exporter/build.py \
    --lean-root /absolute/path/to/lean-4.33.1-darwin_aarch64 \
    --output /absolute/new/exporter-build
```

The script refuses an existing output, checks source hashes and the Lean version,
and compiles only Export and Main with the previously exercised compiler/linker
arguments. Commands are sequential and Lean workers are set to one. It does not
install, download, rebuild the standard library or overwrite installed binaries.
The original five-step recipe was measured at 15.048 s / 490.9 MiB. This portable
packaging of that recipe has only had static checks, not a second build.

Reproduction means pinned sources/patch/commands; byte-identical binaries across
different build paths or host linker environments are not claimed. Any newly
built binary requires review and exact export-byte validation before changing
its selected artifact hash. `configure-runtime.mjs` checks the archived source
bundle and configured binary against setup pins; it does not pretend a source
archive is a Git checkout or that hashing proves compiler correctness.

## Evidence and current performance limit

The isolated exporter produced exactly the existing 71,338-byte Nat.add_comm
proof export at 100.85 MiB / 4.336 s. The first complete root check after promotion
then hit its unchanged 5 s deadline (5.297 s including cleanup, 102.0 MiB). That
failure is retained separately. One explicitly authorized warm retry passed at
3.203 s / 108.1 MiB; no automatic retries were added.

Subsequent first invocation of each app's installed copy passed: Agora true
4.545 s / 123.6 MiB, Exchange 4.450 s / 91.9 MiB, Vault 4.524 s / 118.0 MiB.
Their following refutations passed in 1.261, 1.270 and 1.315 s respectively,
with 86.4–94.8 MiB peaks. Every checked goal and proof export remained byte-identical
to its existing v3 fixture. These are individual observations, not cold-machine
percentiles or a universal five-second guarantee. The installed runtime's own
observations are in `native-validation.json`.

Installed registration preparation and root refutation were not included in the
final bounded follow-up. The earlier isolated goal-only registration succeeded,
but no installed registration measurement or certificate is claimed here.
Generation policy remains false; no ZK proof or chain write was produced.
