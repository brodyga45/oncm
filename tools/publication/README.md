# Source publication inventory

`inventory.py` enumerates tracked and currently nonignored files with Git, applies
the reviewed extra rules through Git's own ignore engine, streams SHA-256 using
64 KiB buffers, and scans credential-shaped literals without printing values.
It never stages, deletes metadata, pushes or executes project code.

```sh
python3 tools/publication/inventory.py
```

Outputs go to ignored `local-report/`, or an explicit `--output` directory:

- `manifest.json`: relative file path, byte count, SHA-256 only.
- `findings.json`: filenames grouped by review category and exclusion list.
- `summary.json`: counts, total included bytes and filename-only findings.

Files over 50 MB are reported but not hashed/scanned. Symlinks are reported and
not followed. Nested Git metadata, gitlinks and directory candidates require
review before recursive staging. Source files changed during scanning are flagged
and omitted from the manifest. The known public Anvil mnemonic is classified
separately; all other matching values require review. Pattern checks are heuristic.

The accepted additions from `ignore.rules` have been appended to root `.gitignore`.
`gitignore.proposed.patch` preserves the original reviewed patch as an audit
artifact; it is already applied and must not be applied twice. Both `.github/` and
`tools/lean-zk/ci/` remain included. Run the final scan once after CI files settle,
then let the coordinator review/stage/push. See `docs/publication-inventory.md`
for the exact content boundary and snapshot limitations.
