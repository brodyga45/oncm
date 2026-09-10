# Actual browser social and private-research smoke

2026-09-10, own Chrome tab **102825250**, session “💬 Agora social check”, `http://127.0.0.1:5171/`. Root's other tabs were not used. All writes in this pass were performed with actual web controls, using the clearly labelled local test wallets; no API/script replacement for UI writes.

The API initially listened on 4171 as PID 63470, exact cwd `implementations/agora`, child of the existing Node watcher 70411. It already served schemaVersion 2/fileHashes for the two static and three Ix packages, so no initial restart was needed. Before changes, jobs 5 / active 0 / comments 0, chain 31371 / block 54. The DB was copied to ignored `.local/backups/app-before-social-20260910.json`.

## Observed passes

- Mathematician `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`: saved “Agora Thread Author” and biography. Trader `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`: saved “Agora Thread Reviewer” and biography. Both profiles were read again; the reviewer opened the author's public profile with no author-edit controls.
- On existing statement `0xf99268c5feca503310a5e715a06ac97184747585713ea1c5f94e0f5c1092cd41`, the mathematician published the root comment, edited it and opened Edit history. The original text remained visible; upvote/downvote were disabled for the author.
- Trader voted on that root. Each intermediate score was read from the browser: **+1 → 0 → −1 → +1**. The author's Edit button was absent for this wallet.
- Trader published two replies to that root and a second standalone root. New put the newer root first; Top put the scored root first. Both modes retained parent/reply grouping.
- Mathematician used Save to shelf, saved notes, left and reopened the shelf; the text persisted. Saved a notebook revision, changed the editor without saving, loaded history, restored the revision; the saved text replaced the editor while the original snapshot remained.
- Switching to Trader cleared the prior source/editor, session and loaded private state. Explicitly loading this wallet's shelf and notebook showed neither of the mathematician's entries.
- Sign out & clear drafts removed the session button and an unsaved reviewer source/title, restoring default editor values. Public reviewer profile remained readable after logout.
- After the API update below, switching back to Mathematician and signing in through shelf/notebook controls recovered the saved notes and source revision. The pass ended signed out.

## Defect reproduced, fixed and rechecked

With two sibling replies, the server originally sorted them by the same comparator as roots: the newer reply (05:44:01 browser-local time) appeared before the older reply (05:41:51), including Top at equal score. This violated the required chronological reply order.

`server/social.mjs` now applies score/time/ID ordering only to root comments. Direct replies sort by ascending createdAt then stable ID; traversal preserves nested grouping. No database data or UI source changed. `tests/social.test.mjs` adds a regression with differing reply scores, same-time ties, nested replies and both root sort modes. **2 tests passed** (existing full social-store regression and new ordering regression).

Before touching the server, active jobs were rechecked as 0 and the current four-comment DB was backed up to ignored `.local/backups/app-before-social-thread-fix-20260910.json`. The existing watcher applied the source change automatically, replacing only its API child with PID 81794. Health remained chain 31371 / block 54. No chain process was restarted. No frontend build was needed for this server-only correction.

The same browser then selected New and Top again. Both showed the older reply before the newer reply under the original root. Public read-only evidence records the exact final orders:

- Top: root `7ddb49e2…` → reply `4827f3f3…` → reply `429a2eec…` → second root `8b7b0fdf…`.
- New: second root → original root → older reply → newer reply.

## Boundaries and evidence

[public-evidence.json](public-evidence.json) contains public profiles, comments/edit history, IDs, final scores, ordered lists and health. It excludes private notebook/source/notes, session tokens and signatures. Job counts remain **5 before / 5 after / 0 active**; chain remains **block 54**. No monetary transaction, native check, prover or CI run was performed. No auto-review rejection occurred in this social pass; the earlier NO settlement handoff remains unchanged.

This is a local test-wallet UI smoke. Injected browser-extension events were not manually tested here; earlier lifecycle regressions use a mocked EIP-1193 provider. Source and browser operations are frozen after this pass.
