# Vault Lean package

Challenge.lean contains the supplied claim/environment; Solution.lean imports it and adds the supplied solution body. Runner.lean combines both for the ONCM runner. Files are not executed during export.

Solution starts with prelude and imports only Challenge, so it inherits that module's exact imports instead of introducing implicit Init. An ordinary Challenge already imports Init; an explicit prelude Challenge may deliberately omit it. Use the exact lean-toolchain. Inspect lakefile.lean and any dependency lock before running `lake build Challenge Solution`; Lake configuration is executable author-provided code. The default Lake project has no external dependencies. If your imports require Mathlib or other libraries, include their pinned Lake configuration and lake-manifest.json before export; dependencies themselves are not vendored.

From an independently trusted ONCM installation, submit runner-input.json to `node proof/runner.mjs` only when local resource policy permits. Compare the resulting goalHash/profileId with oncm-context.json. A file hash or successful Lean check is not an on-chain proof certificate. Source text is author-supplied metadata; the chain commitment identifies the checked elaborated goal/environment.

formalization.yaml is a metadata/disclosure starting point. Export does not guarantee Palomar acceptance or publish anything there. A Challenge with sorry is not a solution; no axiom or missing proof is silently accepted.
