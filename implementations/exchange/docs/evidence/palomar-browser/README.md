# Public Palomar snapshot → draft, actual browser pass

2026-09-10, own Chrome tab102825361, no wallet connected. The agent opened **Palomar library**, expanded the visible snapshot metadata and selected **Import exact snapshot & goal →** for:

- Entry `PALOMAR-2026-09-08-000004`, version1: **A real affine (23_4) configuration**.
- Repository `wstrinz/configuration-23-4`, commit `94fc8964562fa9e246c8c7b1657e2e135bda35f6`.
- Exact declaration `Config23.exists_configuration`.

The draft visibly restored the title, description, target declaration and full challenge source. Its1548 UTF-8 bytes matched the saved source hash `58953d9ba2b26f70129e04dd22ec4cdf224430f862dcdcb0569b4f88b9ac0f85`; this was independently compared with the DOM text digest. Seven explicit snapshot files were fetched at the exact commit, and every saved content matched its advertised SHA256. [Observations](observations.json) include their source URLs, byte counts, hashes and the saved public package ID.

The source-only registry record contained no protocol profile, canonical goal hash or registration certificate. The new modal displayed the site's default v3 profile; **Canonical goal hash**, **GoalWellFormed certificate**, fixture ID and external-certificate input were empty. **Create market onchain** was disabled, and the status explicitly required a separately prepared and verified registration certificate. The form was cancelled. The header remained265 during this import; the preceding increase from242 was another agent's authorized governance work, not this read-only pass. Existing proof-job history retained its exact SHA256.

The downloaded `lean-toolchain` pins Lean4.32.0 and the challenge imports Mathlib. A default v3 selection is not proof of compatibility with that source. The challenge's placeholder proof and separate `Solution.lean` were fetched as text, never executed. This pass did not download the full transitive dependency closure, perform a Lake build, produce a canonical export/certificate, register a market, or verify Palomar's informal description.

Source review confirms that the common `adoptPackage` path clears both certificate and generic-review readiness and that `preparePortablePackage` never promotes uploaded verification flags. The six package regressions include a legacy/Palomar draft carrying an old certificate and a forged `sourceGoalRelation: verified`; it remains an unverified draft. The actual browser import here began in a new modal, so it is not claimed as a reproduction of an asynchronous stale-import race within an already verified modal.
