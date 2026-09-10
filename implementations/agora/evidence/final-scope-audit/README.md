# Final scope audit: actual extras and source package export

2026-09-10; own Chrome tab **102825273**, session “📓 Agora extras audit”, URL `http://127.0.0.1:5171/`. Root/other agent tabs untouched. Chain31371 stayed **block73**. No monetary transactions, native checks, prover/CI jobs, or repeated blocked NO settlement.

Actual web controls:

1. Mathematician → Research shelf: read saved entry; Remove → empty state; Explore → original NO statement → Save to shelf; Research shelf → restore previous notes → Save notes.
2. Lean workbench → Load my revisions → Restore into editor; change source/title, Save source revision. Earlier snapshot remained; new child appeared. Export notebook downloaded a JSON file.
3. Read the downloaded file independently, without publishing source/text/IDs: two revisions, valid parent link, exact keccak source hashes, sources distinct, profile consistent. [notebook-export-check.json](notebook-export-check.json).
4. Switch Trader: Research shelf empty; workbench Load my revisions empty; no previous draft/source visible. Sign out & clear drafts. Earlier broader save/reopen checks remain in `../social-extras/README.md`.
5. Protocol revenue: read no-entitlement Trader and Curator's positive claimability; **never clicked Claim T**. Public read-only account snapshots for both beneficiaries and zero derived statements are [public-state.json](public-state.json).
6. Explore → real TRUE statement → Export package while signed out. Independent schema/source/file integrity check passed, but embedded profile was incorrectly v3. Preserved [package-export-check.json](package-export-check.json).
7. After parent-authorized server correction, click Export package again in same own browser. Downloaded file now has exact perf05 descriptor, raw descriptor SHA matching deployment pin, statement goal matching known canonical export, source/file integrity, no private jobs, no auto-accepted certificate. [package-export-fixed.json](package-export-fixed.json). Actual browser file-picker reimport and fresh Lean rebuild were not performed.

Server-only correction: `server/package-profile.mjs` + package route; tests cover v3/perf05/unknown and altered pins. `node --test tests/package-profile.test.mjs tests/source-package.test.mjs tests/package-artifacts.test.mjs tests/research.test.mjs`: **9/9 PASS,0.249s**. No Vite change/build necessary. Node watcher applied API child change; no manual restart. All saved evidence is summaries or public chain data, not session tokens/private notebook bodies.

Browser ended on settled TRUE statement, Curator test wallet, signed out; no pending action. Current complete-vs-pending matrix is `../../COVERAGE-AUDIT.md`.
