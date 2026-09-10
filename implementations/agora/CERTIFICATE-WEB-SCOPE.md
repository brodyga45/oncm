# Certificate workflow: external preparation

User scope update, 2026-09-10: users prepare certificates outside the website. Website-based certificate generation and ordering are deferred. This scope change does not remove other market, governance, liquidity, source catalogue or social scenarios.

Agora's active web controls now support:

- Native Lean checks under the installed v3 profile, without ZK generation; source editing/export and private notebook/history remain available.
- Registration: Create a market → paste/upload a compatible prepared JSON, or select either published registration → **Load published registration JSON** → **Verify & use registration** → **Register statement & create market**.
- Settlement: market Proof tab → paste/upload a compatible prepared JSON, or select the matching published proof/refutation → **Load published settlement JSON** → **Verify & load settlement certificate** → **Verify & settle onchain**.

All four exact published perf05 artifacts remain available: true-registration, false-registration, true-proof, false-refutation. Loading is separate from verification and wallet submission. The JSON adapter currently admits its pinned perf05 sources/profile/cases; it is not a general arbitrary Lean certificate format. Manual hex settlement still passes through the actual onchain verifier. The native check is unavailable for perf05 because the installed native checker uses v3.

Removed UI actions: Create's Check & seal the goal, Workbench's Seal a formal goal, and Proof's Generate certificate. The frontend `startJob` helper explicitly rejects `register`/`prove` before signing in or making an API request; it permits `check`. API/SDK/CLI generation mechanisms and historical jobs remain intact for future development, with the existing expensive-proving prohibition unchanged. No remote provider submission or automatic proof ordering is offered.

Changes: `src/App.vue`, `tests/wallet-app.test.mjs`, README/current-scope notes in the profile and historical coverage documents. No API or cryptographic implementation changed in this scope update.

Validation: 14 targeted tests passed (actual SFC handler blocks generation before any request, native-check polling remains usable, existing wallet lifecycle, all four published choices and certificate/profile/selection binding). One Vite-only build passed under the reviewed 1 GiB / 30 second guard: **1.698 s**, peak tree physical footprint **369,474,064 bytes (~352 MiB)**, exit 0, no cleanup errors. [Build report](evidence/external-certificate-web/build-resources.json). Ordinary upstream annotation/chunk-size warnings remain.

No browser, API restart, chain transaction or proof computation was performed for this change. Source frozen after the successful build.
