# Agora: аудит двадцати пользовательских сценариев

Дата: 2026-09-10. Основание — текущие US-001…US-020 из
`../../docs/user-scenarios.md`, прочитанные вместе с исходниками этой реализации.
Это аудит существующих путей и недостающих шагов, **не журнал ручного smoke**.

На момент проверки read-only `GET /api/health` и `GET /api/markets` вернули
chainId 31371, block 22, **0 рынков**. Наличие установленного настоящего verifier
(`proofStatus: real`) не означает, что получен Lean certificate или пройден рынок.
Локальная политика `allowExpensiveProving: false` сохранена. Облачное доказывание
ведёт координатор; его незавершённый запуск не считается результатом этого аудита.
Ни одного proof, сборки, транзакции, перезапуска цепи или ручного браузерного
сценария в ходе этого аудита не выполнялось.

## Как читать доказательства готовности

- **Код:** путь найден и прочитан; это не подтверждение исполнения.
- **Ранее:** конкретная проверка описана в `VALIDATION.md`; повторно здесь не запускалась.
- **Сейчас:** перечисленные ниже лёгкие unit/API-injection тесты действительно выполнены.
- **Нужен smoke:** необходимые клики и транзакции остаются открытыми до отдельного
  журнала с результатами. Для экономических тестов используется настоящий CTF/FPMM,
  но `TestProofVerifier`; их успех не заменяет настоящую регистрацию и резолв.

Общие файлы: веб — [src/App.vue](src/App.vue), SDK —
[sdk/index.mjs](sdk/index.mjs), RPC/кошелёк — [sdk/chain.mjs](sdk/chain.mjs),
API — [server/index.mjs](server/index.mjs), реестр/доли —
[contracts/Agora.sol](contracts/Agora.sol). Названия функций ниже позволяют найти
каждый путь независимо от изменения номеров строк.

## Сценарии: пользователь → код → исполнение → пробел

| US | Существующий веб и SDK | Реальное исполнение в коде | Проверка и оставшийся пробел |
| --- | --- | --- | --- |
| US-001 Создать математический рынок | Create → `startJob('register')` → `createMarket`; SDK `registerGoal`, `createPool`, `provideLiquidity` | `/metadata`, `/jobs`; `AgoraRegistry.register` требует `verifyGoal`, создаёт CTF condition; отдельно `createPool`, approve T, FPMM `addFunding` | Ранее economic registration/duplicate/invalid cert. Настоящий сертификат и полный browser path не подтверждены. Веб выбирает один deployment profile, не каталог поддерживаемых профилей. Нет явного пошагового receipt/resume: после успешной регистрации и сбоя создания пула форма может остаться на Create, а повтор снова попробует регистрацию. |
| US-002 Внести ликвидность | Detail → Liquidity → `liquidity(false)`; SDK `provideLiquidity` | approve T → FPMM `addFunding(amount, [])`; обновление portfolio читает LP/YES/NO | Ранее second-LP integration. Нет предварительного расчёта получаемых LP shares и остаточных outcome tokens; нет отдельного результата по каждому возврату. Веб управляет только первым пулом утверждения, SDK принимает любой адрес пула. Нужен ручной второй LP. |
| US-003 Купить/продать за T | Trade, `getQuote`, `executeTrade`; SDK `quote`, `buy`, `sell` | FPMM `calcBuyAmount/calcSellAmount`; approve → `buyWithDeadline/sellWithDeadline`; минимальный output / максимальный input, 10-minute deadline | Ранее buy/sell/slippage/deadline tests. Веб показывает quote, fee и обновляет balances, но не представляет фактические суммы receipt как отдельную карточку сделки; SDK возвращает receipt и `events`. Продажа задаёт T к получению. Нужен ручной успешный и отклонённый обмен. |
| US-004 Доказать P и разрешить | Proof → Check / Generate certificate / `submitProof`; SDK `runJob`, `submitProof` | `/jobs` → собственный `proof/runner.mjs`; `AgoraRegistry.submitProof(id,1,cert)` → [LeanProofBridge](proof/contracts/LeanProofBridge.sol) → настоящий RISC Zero verifier → CTF payout | Проверка bridge в коде связывает goal/profile/outcome/image/journal. Economic settlement использует test verifier. Локальный uncached proving выключен; реальное Lean proving→receipt→EVM settlement ещё не подтверждено. |
| US-005 Опровергнуть P | Тот же Proof экран, FALSE outcome=2; SDK `runJob({outcome:2,…})`, `submitProof(id,2,cert)` | Тот же pinned checker/bridge, отдельный outcome; реестр выставляет payout NO=1, YES=0 | Положительные native refutation trials ранее зафиксированы в exporter evidence, это не zk и не ончейн-резолв. Нужен настоящий refutation certificate и ручное погашение обеих сторон. |
| US-006 Резолв к сроку | Create → kind 1 либо kind 3 → dependency/deadline; Overview → Resolve from chain state; SDK `registerDerived`, `resolveDerived` | `registerDerived`, `derivedOutcome`: включительная граница `resolvedAt <= deadline`; нерешённая база становится FALSE только при `block.timestamp > deadline` | Ранее boundary/expiry economic tests. Есть 3 фиксированных вида, не общий AST. Нет предпросмотра детального правила/границы в форме, detail показывает числовой kind. Нужен smoke вокруг срока на настоящем базовом рынке. |
| US-007 Определённая сторона резолва | Create → kind 2, outcome; kind 3 добавляет deadline; SDK те же методы | `derivedOutcome`: pending base остаётся 0; после резолва сравнивает сторону; kind 3 также срок | Ранее economic tests. Веб не переводит dependency/outcome в полноценную читаемую формулу на detail. Нужен ручной opposite-outcome и pending case. |
| US-008 Получить T | Overview после settlement → `redeem`; My positions → открыть рынок; SDK `redeem` | Оригинальный ConditionalTokens `redeemPositions(T, zeroHash, conditionId,[1,2])`; payout и сжигание conditional balances | Ранее CTF payout/redemption tests. Нет предварительной численной суммы T по обеим сторонам; обновлённый баланс и explorer доступны. Нужен настоящий winner/loser/repeated-redeem browser smoke. |
| US-009 Расширить протокол | Governance → `createGovernance`, `signGovernance`, `scheduleGovernance`, `executeGovernance`; SDK generic `api`, `read`, `write` | Offchain proposal + Safe 2/2 signatures → Safe `execTransaction` schedules OZ Timelock → Registry `configureProfile`, `setProfileEnabled`, `configureOperator` | Ранее Safe/Timelock authorization and immutable operator tests; в старом ручном журнале подтверждены создание и 2 подписи. Новые verifier/operator ID immutable; отключение профиля ограничивает новые регистрации. Нет общего UI arbitrary protocol changes и специальных SDK lifecycle helpers. Хэш manifest не доказывает корректность исходников. |
| US-010 Перераспределить комиссии | Revenue → `proposeAllocation`, consent/revoke/apply; SDK `proposeAllocation`, `consent`, `applyAllocation` | `AllocationController` требует base epoch, сумму 1,000,000, sorted unique payees, согласия только теряющих; removal=0; execute создаёт новый PaymentSplitter | Ранее missing/revoked/stale consent и history tests. Исправлено после аудита: UI показывает каждого теряющего, старое→новое и consent; Apply disabled до всех согласий, а consent доступен только теряющему активного предложения. API snapshot на одном блоке, перед apply повторное чтение; см. UX-VALIDATION.md. Нужен ручной сценарий A-only и A+B. |
| US-011 Доход выгодополучателя | Revenue → epoch → Claim T; SDK `claimEpoch`, generic `read` | [FPMM fork](contracts/legacy/FixedProductMarketMaker.sol) `_sendProtocolFee`: 20% торговой комиссии прямо в текущий split; 80% LP. OZ `PaymentSplitter.release(T, account)` по каждому immutable epoch | Ранее history/claim tests. Все комиссии уже в T, отдельная конвертация не нужна. Веб показывает claimable и splitter balance, но не полную таблицу фактически выплаченного по адресу/эпохе. Нужны direct-AMM fee и повторное получение через UI. |
| US-012 Внешняя формализация | Create → Search live Palomar / Import snapshot / `applyPackage`; SDK generic `api('/palomar')`, `api('/import/palomar')`, `api('/import/snapshot')` | [server/imports.mjs](server/imports.mjs): live recent registry, exact GitHub commit, bounded files, no imported code execution | Ранее live Palomar retrieval; сейчас immutable URL restrictions test прошёл. Импорт — draft: dependency install, автоматический выбор theorem и адаптация чужого Challenge к `Oncm.goal` не реализованы. Совместимость Lean/environment не проверяется до runner. Нет гарантии, что произвольная Palomar работа подходит текущему профилю. |
| US-013 Переносимый пакет | Detail → `exportPackage`; Create → `importPackage/applyPackage`; SDK `package(id)` | `/package/:id`: schemaVersion 2, source/files/hash/profile, собственные completed job artifacts; browser JSON import | В этом аудите исправлена приватность job artifacts, 3 теста PASS (см. ниже). Клиент импортирует JSON без проверки schema/fileHashes; набор внешних Challenge/Solution сохраняется в files, но не превращается в воспроизводимое Lake workspace/Comparator run. Нет команды независимой полной проверки пакета и автоматической подачи Palomar. |
| US-014 Вход и кабинет | Injected wallet Connect / явные local test wallets; `signin`, My profile, My positions; SDK `signIn`, `signOut`, `profile`, `updateProfile` | Viem EIP-1193 signing, SIWE nonce/expiry + HTTP-only cookie/Bearer; onchain balances отдельно от сессии | Ранее API nonce/replay/logout/profile smoke; сейчас owner service tests PASS. Нет обработчика injected `accountsChanged/chainChanged`, нет отдельной кнопки logout, профиль и positions не включают полную историю authored markets/claims. Смена роли очищает session/shelf/notebook, но jobs очищаются не сразу; poll не обрабатывает исчезнувший job после смены роли. |
| US-015 Смотреть задачи | Explore search/topic filter → `openMarket`, Overview/proof/profile; SDK `statement`, `pools`, generic `api('/markets')` | API читает Registry/CTF/FPMM по RPC, metadata из локального store; Chain activity `/activity` декодирует blocks, logs и balances | Сейчас API200, chain31371/block22, markets=0. Нужен ручной populated catalog. Нет статуса/полнотекстовой индексации/pagination; Исправлено после аудита: `totalSupply` подписан как LP shares, без оценки в T; пустой пул показывает No quote, расчёт через bigint не даёт NaN/Infinity. Activity UI показывает последние примерно 50 blocks без управления диапазоном, API принимает `from`. |
| US-016 Обсуждения | Discussion → `postComment`, reply, top/new, `voteComment`, edit/moderate, `openProfile`; SDK `postComment`, `voteComment`, `profile` | [server/social.mjs](server/social.mjs) SIWE author, same-statement parent, one vote/address, no self-vote, history, persistence | Сейчас social invariants test PASS; ранее API profile smoke. Нужен реальный market UI: reply/vote change/remove/order/role switch. Модератор — локально назначенный первый адрес, не governance moderation. Социальные записи локальны и не влияют на payout. |
| US-017 Lean / certificate из приложения | Workbench `startJob('check'/'register')`, detail `prove`, cancel/download; SDK `runJob`, `jobs`, generic `api` для cancel | [server/proof-jobs.mjs](server/proof-jobs.mjs): p-queue1, dedupe owner+input,16 всего/4 owner, outer guard2GiB; check5/register30/prove120; single export + pinned native checker | Сейчас 6 scheduler/API-injection tests PASS; native trials ранее отдельно. UI допускает регистрацию/proving, хотя current policy запрещает новый expensive proof; `proofAvailable` означает установленный bridge, не готовность генератора. Нет remote CI provider submit/download flow в UI. Исправлено после аудита: legacy job без owner не ломает list/cancel, сохраняется в DB и не назначается произвольному кошельку; API-injection regression PASS. |
| US-018 Governance через сайт | Governance Sign/Schedule/Execute; Revenue consent/revoke/apply | Safe owner signatures и allocation approvals — разные механизмы, проверяемые соответствующими контрактами; SIWE сама не даёт прав | Ранее UI2 signatures и contract tests; это не полный browser lifecycle. Кнопки действий не фильтруются полностью по правам; Timelock delay в UI захардкожен5s вместо chain-read. Stale Safe nonce не имеет UI rebuild; status не различает scheduled-waiting от collecting. |
| US-019 Вывести ликвидность | Liquidity → `liquidity(true)`, Claim LP fees; затем Overview Merge/Redeem либо Trade; SDK `removeLiquidity`, `claimLPFees`, `merge`, `redeem`, `sell` | FPMM `removeFunding` возвращает composition conditional reserves; последующая конвертация — отдельные CTF/AMM tx | Ранее economic exit after settlement. Нет quote каждого возвращаемого актива, итогового receipt breakdown и guided conversion/resume. Сам текст честно предупреждает, что LP exit не гарантирует весь капитал в T. Нужен частичный/full withdrawal browser smoke. |
| US-020 Полный набор | Overview Split T / Merge set → `completeSet`; SDK `split`, `merge` | Оригинальный CTF `splitPosition/mergePositions` с одним condition и partition[1,2]; approve T только при split | Ранее conservation test. UI описывает 1T↔1YES+1NO, но не показывает недостающую сторону/лимит до отправки; нет split→LP wizard. Нужны ручные split, merge, insufficient-side rejection и balances. |

## Исправление в этом аудите: экспорт только собственных job artifacts

Публичный `/api/package/:id` раньше фильтровал все успешные задания только по
statement/goalHash. Это раскрывало неопубликованный source/result другого автора,
хотя `/api/jobs` требует SIWE owner. Теперь [server/package-artifacts.mjs](server/package-artifacts.mjs)
берёт owner исключительно из существующей проверенной сессии. Публичный пакет
сохраняет опубликованные statement metadata/files; собственные успешные job artifacts
добавляются только подписанному владельцу. Подставить owner через query/body нельзя.
Ownerless history не удаляется и не назначается произвольному владельцу.
Invalid/expired переданный session token получает обычный отказ существующего SIWE.
Наличие onchain proof bytes само по себе не публикует приватный исходник задания.

Выполнено из `implementations/agora`:

```sh
node --test tests/package-artifacts.test.mjs tests/imports.test.mjs tests/social.test.mjs tests/research.test.mjs tests/proof-jobs.test.mjs
node --check server/index.mjs
```

**12/12 PASS, 0 failures, около0.40s**; syntax check PASS. Три новых проверки:
anonymous ничего приватного не получает; wallet получает только свои completed
matching jobs (включая registration по goalHash); legacy/history не изменяется.
Остальные проверки — queue/API injection, imports, social и research. Ни одна
не вызывает prover. Package helper проверен unit-тестами; полноценный HTTP package
export с настоящим зарегистрированным рынком пока не проверен из-за отсутствия рынка.
API lifecycle/цепь вручную не перезапускались.

## Дополнительные функции и порядок завершения

Две самостоятельные функции уже существуют: приватная Research shelf и immutable
Lean notebook; [EXTRA-FEATURES.md](EXTRA-FEATURES.md), `server/research.mjs`, SDK
`shelf/saveBookmark/removeBookmark/notebook/saveRevision`. Их owner/persistence тест
сейчас PASS; market→shelf browser path всё ещё не пройден.

1. Получить проверенные настоящие registration/proof/refutation receipts нужного
   профиля и выполнить create→LP→trade→resolve→redeem с block/tx журналом.
2. Закрыть представленные выше существенные UX gaps: create recovery, owner/session
   poll, artifact validation; allocation consents, LP labels/empty-pool quote и ownerless history исправлены кодом и лёгкими проверками в UX-VALIDATION.md, но требуют populated browser smoke.
3. Пройти вручную остальные роли, производные, split/merge, epochs, governance,
   discussion/shelf/notebook с реальными balances и ссылками на события.

Прежний `VALIDATION.md` полезен как датированный журнал; упоминания там ожидаемого v2
не являются текущим состоянием профиля. Этот аудит не меняет root документацию и
не объявляет какой-либо из двадцати полных browser сценариев завершённым.
