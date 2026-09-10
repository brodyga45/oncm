# Manual Agora onchain social acceptance — 2026-09-10

Own Chrome tab `102825259`, session “Agora onchain social”, `http://127.0.0.1:5171/`. All social mutations below were actual targeted browser clicks with the existing local test wallets. No script replaced the UI transactions. Additive deployment was a reviewed script operation at block 55; isolated contract tests are reported separately. The earlier offchain pass is not reused as evidence for this requirement.

- Chain 31371 / RPC 9545. Social contract `0xe6e340d132b5f46d1e472debcd681b2abc16e57e`; immutable existing registry `0x8a791620dd6260079bf849dc5567adc3f2fdc318`.
- Author: Mathematician `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`.
- Independent reviewer: Trader `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`.
- Existing statement: `0xf99268c5feca503310a5e715a06ac97184747585713ea1c5f94e0f5c1092cd41`. No financial action or theorem resolution was attempted.

## Actually passed in browser

1. Author profile published and revised; both full biographies displayed via “Public profile history”. Reviewer published own profile and later read the author's profile with no author edit controls.
2. Public blog #1 published, revised, earlier full body retrieved; self-vote buttons disabled. Reviewer upvoted and replied (#6); blog thread displayed full reply and parent. No private notebook export was used.
3. Statement root #2 published and revised; “Public revision history” displayed original and current full text with byte lengths and content hashes.
4. Reviewer root #2 vote observed in UI as **+1 → 0 → −1 → +1**. Vote history then displayed all four changes with the reviewer address and timestamps. Other-author Edit/Hide controls absent; author's self-vote controls disabled.
5. Two sibling replies #3 then #4 and new root #5 published. Top visibly ordered **#2, #3, #4, #5**. New ordered **#5, #2, #3, #4**. Reply score cannot move it outside its parent. An additional isolated test verifies ranking a high-score root after the first 50-header page; this large-volume condition was not recreated manually.
6. Author hid root #2 at block 70. UI displayed tombstone **and both children**, with version history available. Restore at block 71 returned original display. Visibility history showed both changes.
7. Existing chain Activity explorer showed ProfilePublished, PostPublished, PostRevised, VoteChanged and VisibilityChanged with actor, destination, receipt hash and gas; all 18 social transactions had zero token asset movements.
8. Sign-in was only used for the existing private shelf. An unsent blog title/body were entered, then “Sign out & clear drafts” clicked. Reopened profile had empty title/body and disabled publish. No extra social record/transaction was created. Component context epoch also invalidates discussion drafts on logout without changing the account.
9. A real ordinary homepage anchor (`href="/"`) performed full page navigation/reload. Selecting the author and reopening My profile recovered the published biography, 2 profile versions, blog revision and score 1 from block 73. No SIWE session was needed to read or publish social data.

## Public evidence and unchanged markets

`public-evidence.json` is a read-only extraction of exact profiles, all post versions, vote/visibility histories, decoded events and receipts after the UI actions. It contains public onchain fields only, no sessions/signatures/private drafts. `social-evidence.mjs` regenerates it and compares all existing statement structs, pool balances/supplies and test-token balances against block 54. All match after block 73. ETH gas changes are expected and not mistaken for unchanged ETH balances.

No chain reset, market transaction, Lean run, proof generation, paid service, or old database author migration occurred. Existing local server watch applied code changes; no chain/API process was forcibly restarted. Optional `/api/social/rebuild` and `/api/profiles/...` were read-only checked at block 73; web/SDK also read without that API.

## Exact browser transaction record

| Block | Event / record | Transaction | Gas |
|---|---|---|---|
| 56 | ProfilePublished #0 | `0x3619814b768df7512bd2e3f4706a2d9759226a5c299d65fef9cb5e396e8953a2` | 148632 |
| 57 | ProfilePublished #1 | `0x8ed1a77c59bb5fbe9f60ea32052a688545da199df9f3ea4f63a9cb0a52852f55` | 131568 |
| 58 | PostPublished #1 | `0xc738b3c54878b986f56c4465515a366c66c4c6f6e45434668a3f1f5b6c5ef47b` | 408613 |
| 59 | PostRevised #1 | `0x57acf8d3ff4d14449a4569a736573c765539187d0f53f06fd641a0e437f48252` | 202560 |
| 60 | ProfilePublished #0 | `0x7b921226fb2c54daacffb64d9e9194f6039be5b0f546187acf8f29ecaf48fa0e` | 148716 |
| 61 | PostPublished #2 | `0x62bcd91698cc3c40e5f91808ea8627c7fd521150cbb4b89eb3314bfd16f16fe4` | 445258 |
| 62 | PostRevised #2 | `0x5a9b422f9146c34eb5d4cf71096912b31d1a18008057f42087310700c7762e0e` | 188927 |
| 63 | VoteChanged #2 | `0x54c2cf7187148a0ab6ced99eaedf0471ace8dc96d096d38aabdf42bb8a8b35b3` | 116900 |
| 64 | VoteChanged #2 | `0x5583d447f5840d0269afe6ba7d18ca6ceb4fc682a55a8a5837ecafc66305af9c` | 55988 |
| 65 | VoteChanged #2 | `0x6c64f91b2d13ec2c865cc02de9c9c4c7218802c37029ae28b3d21a343b8075f9` | 100172 |
| 66 | VoteChanged #2 | `0xe113c198f50d4748174070ac93970e47ac53ab3f283acc17dc9352d313e14761` | 65600 |
| 67 | PostPublished #3 | `0xd2dd4629f5d43e5c8a50eb9dffb94affeed452ac2f71cd3639d3747bfedb37a1` | 433666 |
| 68 | PostPublished #4 | `0x0ce23903640a38eecf3f8b9f03811569453a5ba0cdc773929b5670805d144ede` | 401376 |
| 69 | PostPublished #5 | `0x5ad626df1f8142ed338e893d9eef76d1fbdf6b25aef617254832a18e2763cb2a` | 401790 |
| 70 | VisibilityChanged #2 | `0x3913c2bc75890f4d27e0ce5418f8767b5adbf067f921ddb0d064853f35a80b74` | 93235 |
| 71 | VisibilityChanged #2 | `0x7c03e34338956ca16d65173fd2e6dd6a6d97d3660dcc461232c1e445a13c2646` | 54223 |
| 72 | VoteChanged #1 | `0x7c7a90d963e8cbbf427475f7abbc0601d8790516367bd5a516a2b116b8cb98e0` | 116900 |
| 73 | PostPublished #6 | `0x7ecf8b09ed287400df84449e7a89e62315c498e8f81e381caa0e500298acdf52` | 373428 |

## Tests, build and boundaries

- Final isolated Solidity/SSTORE2/SDK/read-model + existing wallet/privacy and published-certificate tests: **18/18 PASS**, `final-tests-corrected.json`, 7.207 s, peak 591,087,816 bytes (564 MiB), 1 GiB cap. Tests run sequentially and create only an isolated in-memory chain.
- Initial sync-throw test assertion and later test harness default-import parsing failures are retained in earlier reports; neither was a failed live contract transaction. Harness now handles the Vue component's default import and tests the new social epoch invalidation.
- Production Vite build passed; see latest `reviewed-build-resources.json` (and earlier build reports). Existing bundle-size/annotation warnings remain, no compile errors.
- More than five revisions, 16,384-byte boundary/multichunk blog, depth six rejection, malformed UTF-8 fallback, wrong statement context, wrong author, stale expected versions, global root pagination and complete RPC rebuild were tested programmatically. Their extreme cases were not all manually repeated in the browser.
- No claim of globally unique humans, censorship erasure, gas optimization benchmark or production audit. Full content is intentionally public and immutable; tombstone is display policy.
