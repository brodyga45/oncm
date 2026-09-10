# Comment ordering fix

2026-09-10. Root manually verified Vault profile/save/comment/edit/history/vote (+1 → 0 → -1 → +1), reply and logout at block 125 without a transaction. The remaining observed defect was that selecting New displayed a recent reply above its parent. That original manual evidence does not establish this new implementation's browser acceptance.

The cause was `community.list` sorting all comments as peers. Statement-scoped lists now sort roots by the selected Top/New order, preserving the prior score/time/ID tie rules. Direct replies sort chronologically ascending, then by stable ID. Iterative preorder traversal keeps each nested branch under its parent; reply scores do not reorder roots or sibling replies. The response adds `depth`, `threadRootId`, `threadParentId` and nullable `threadFallback`. Stored `parentId`, text, authors, votes and history remain unchanged.

Historical missing/cross-statement parents become visible roots with `missing-parent` context. A cycle is broken in the returned view at the lexicographically first ID of that cycle, marked `cycle`; all its records remain visible exactly once. Cycle detection and traversal are iterative, including long chains. No database migration is performed. Calls without a statement ID retain their old flat global ordering and response shape, preserving public cross-statement activity.

The Svelte discussion uses a keyed list (`c.id`) and indents by depth, capped visually at six levels so long branches stay readable. Original parent IDs remain visible, including an explanation for historical fallback roots.

Changed runtime files: `server/community.mjs`, `web/App.svelte`, `web/style.css`.

Validation actually run:

```sh
node --test test/community.test.mjs
/usr/bin/python3 proof/resource-guard.py --memory-mib 1024 --timeout 30 \
  --report /private/tmp/vault-comment-thread-build.json \
  -- node node_modules/vite/bin/vite.js build
```

Eight tests passed: the existing ownership/profile/vote tests plus nested reply ranking, New root versus new reply, deterministic ties, orphan/cross-statement/cycle fallback and a 512-deep historical branch. No comments were hidden or mutated in the fallback test; unscoped activity retained all rows and its old shape.

One Vite build passed. Whole guard: 1.913 s, peak physical process-tree footprint 297,529,592 bytes (~284 MiB), exit 0, no cleanup errors; [resource report](evidence/comment-threading/build-resources.json).

No API restart, browser actions, chain transactions or heavy computation were performed by this task. Source frozen after this build. Manual follow-up: once the API runs this version, select Top and New on the existing discussion and verify the reply remains directly beneath its parent; then verify a nested reply and a second root.
