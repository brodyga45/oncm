# Portable statement package: actual browser reimport

2026-09-10, own Chrome tab102825310, local Agora31371. Block82 remained unchanged. No wallet transaction, prover, remote job, API restart or file-dialog action occurred.

The exact previously browser-downloaded `agora-statement (1).json` from the corrected perf05 export was copied as `downloaded-statement.json` (public statement only, artifacts[]). SHA256 `175e7d254d66c254c6727b1c6425b6823fdb37b386532e42a0f2fff17d35e5bc`,8443UTF8bytes. The text entered into the browser normal paste form has exactly the same byte length and SHA256; no shortened fixture/reconstructed different package is substituted.

1. Curator opened Create → Import an existing formalization → Paste a portable package JSON, pasted that exact export and clicked **Import pasted package as draft**.
2. The UI restored Identity implication title, description and exact Lean source. It displayed original chain31371/statement73fa…3c92, goal2baf…3f4b and perf05 profile93cf…7e10. Source integrity hash0f1b…12dd was shown. Explicit text said source-to-goal relation not verified and certificate not accepted by package import. Register remained disabled, with no certificate-ready state.
3. Changed only `files['Statement.lean']` by appending `-- altered after export\n`, retaining its advertised hash. Import refused with **Package file hash mismatch: Statement.lean**. The prior validated draft was not overwritten; certificate readiness was cleared.
4. Reinserted the original valid JSON and imported successfully. No registration was submitted.
5. Switched to Trader, reopened Create and the paste section. The package input was empty and import button disabled; prior private draft/context had been cleared.

Normal file and paste paths both call the same `applyPackageJSON` → `applyPackage` → `sourceDraft` → Ajv/schema + exact file/source hash validator. The16MiB UTF8 limit applies to both. No browser filepicker permission was bypassed or retried; paste is now a normal product capability. Import does not accept embedded certificates/verified flags: separate original-EVM/bridge verification remains necessary. This public download contained no certificate artifacts; unit regression additionally supplies a claimed certificate and verifies that neither file nor paste path accepts it.

15 targeted schema/actual-SFC tests passed. One production Vite build passed under1GiB guard in1.772s, peak376587096B, cleanup clear. Existing large-chunk warning remains. `verified.json` records byte/profile/hash comparisons and browser outcomes; `tests.txt` and build report are separate implementation evidence. No fresh Lean dependency reconstruction or new ZK proof is claimed by this import.
