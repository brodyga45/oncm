# Проверки Agora

Дата: 2026-09-09. Этот файл различает реализованный путь, выполненные проверки и ожидающий proof acceptance. Он не объявляет все сценарии пройденными вручную.

## Выполнено

* `npm run build`: исходные CTF, изменённый Gnosis FPMM, OZ, Safe artifacts и Vue production bundle собираются.
* `npm test`: 12/12 passed. Один integration suite разворачивает реальную локальную EVM in-memory и настоящий CTF/FPMM/Safe/Timelock; **только verifier в этом suite является явным TestProofVerifier**.
* Economic tests: canonical registration/invalid cert/duplicate, второйLP, buy/sell, slippage/deadline failures, epoch fee split, обязательное согласие теряющего/отзыв, неизменность старой суммы и claim, split/merge conservation, payout→stop trading/funding→LP exit→winner redemption, derived inclusive deadline/expiry, Safe threshold/timelock/nonowner rejection, immutable operator activation+custom settlement.
* Import tests: HTTPS GitHub/full40commit/path restrictions. Дополнительно действительно скачана живая Palomar запись PALOMAR-2026-09-09-000002-v1 at5a3ca60f6390d88cef38c767e8952eb47c7b3dfa: SwapChallenge.lean, SwapSolution.lean, formalization.yaml, comparator.json, lakefile.lean, lean-toolchain, lake-manifest.json.
* Social tests: author spoof rejection, self-vote rejection, one-vote uniqueness/replacement/removal, thread parent validation, deterministic sorting, profile/vote persistence.
* Research tests: owner isolation, shelf upsert/remove, immutable revision/parent ownership/hash/persistence.
* `node scripts/api-smoke.mjs`: настоящий main proofStatus, SIWE nonce replay rejection, logout session revocation, profile spoof rejection и persistence, local explorer blocks.

UI audit нашёл и исправил: standalone `:disabled="busy"` при empty string создавал boolean disabled; неверный HD accountIndex вместо addressIndex не совпадал с funded Ganache accounts; Content-Type JSON на пустом logout body ломал role switch; auth вызов внутри empty jobs.filter позволял unauthenticated empty response. Эти дефекты исправлены и соответствующие проверки повторены.

## Ручной журнал ведущего Agora

* Explore, revenue, governance, create views просмотрены в Chrome через CUA; светлый academic layout без горизонтальных переполнений в использованном desktop viewport.
* В UI создано proposal `Add resolved_after operator version 1` с точным evaluator/version/calldata. Обе публичные council роли подписали через интерфейс; отображены2из2. Schedule/Execute и дальнейший общий ручной audit ведёт root, чтобы агенты не управляли одной браузерной сессией параллельно.
* Root отдельно сохраняет профиль через UI. Полный объединённый browser smoke, screenshots и transaction journal дополняются после готовности реального certificate.

## Coverage путей

| US | Реализация | Проверка |
| --- | --- | --- |
| 001 | register verifyGoal → CTF → FPMM → funding; web/SDK | economic; real certificate pending |
| 002,019 | original FPMM add/removeFunding, fee claim | economic, SDK integration |
| 003 | buy/sell quotes, approval, slippage, deadline | economic negative+positive |
| 004,005 | Lean runner verify exactgoal, bridge, submitProof1/2 | actual bridge deployed; real certificates pending |
| 006,007 | three built-in derived rules and custom immutable operators | economic inclusive boundary/expiry |
| 008,020 | original CTF redemption/split/merge | economic conservation/balances |
| 009,018 | Safe2/2+Timelock profile/operator governance; no EOA bypass | economic; UI signatures; v2 install pending |
| 010,011 | all-decreased consent, immutable PaymentSplitter epochs, claim | economic revoke/stale/history |
| 012 | livePalomar entry+files and exactGitHub import | live retrieval and validation tests |
| 013 | package sourcefiles/hashes/profile/completed artifacts export/import | implemented; actual proof artifact export pending |
| 014 | EIP1193/devnetwallet, SIWE profile/cabinet | API nonce/logout/profile smoke; root UI |
| 015 | chain-read markets, metadata, filters, detail, explorer | implemented; market browsing awaits realfixture |
| 016 | profile-address comments, edits/replies/votes/moderation | social invariants tested; real market UI pending |
| 017 | check/register/prove jobs, diagnostics/cancel/download | own runner installed; no fake success; final real proving pending |

## Ещё нужно завершить

Настоящий v2 NanoDa/RISCZero Groth16 certificate и его onchain registration/resolve; published Nat.add_comm create→LP→trade→proof→redeem с реальными receipts; refutation smoke; полный ручной обход UI и extras на реальном рынке. Root пересобирает proof profile и готовит воспроизводимый toolchain setup. До этого весь проект не объявляется завершённым.
