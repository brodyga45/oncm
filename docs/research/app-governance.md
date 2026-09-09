# Исследование: приложение, SDK, governance и доли комиссий

Дата проверки первичных источников: 2026-09-09. Это архитектурная рекомендация для обсуждения, а не утверждение, что стек уже реализован или выбран пользователем. Изучены документация и исходники; production-прототип и аудит этой сборки не проводились. Имена предлагаемых пакетов/контрактов ниже принадлежат проекту, а не upstream-библиотекам.

Связи: [приложение](../offchain-application.md), [governance](../governance.md), [контракты](../contracts.md), [сценарии](../user-scenarios.md), [комиссии AMM](../amm-and-protocol-fees.md).

## 1. Рекомендуемая сборка и единственная существенная альтернатива приложения

**Рекомендация A: React-приложение с общим TypeScript SDK, viem/wagmi, SIWE, Ponder и PostgreSQL.** Один web/API backend обслуживает каталог, комментарии, сессии и диспетчеризацию вычислений. Индексатор работает отдельным процессом. Lean и prover запускаются изолированными workers; это следствие выполнения чужого кода и длительных вычислений, а не требование микросервисной архитектуры.

| Слой | Готовая основа | Что добавляем сами |
| --- | --- | --- |
| Кошелёк в вебе | wagmi + RainbowKit; wagmi основан на viem | Список сетей, адреса контрактов, экраны проекта |
| SDK для сайта, CLI и LP | viem: ABI, чтение, подготовка/отправка вызовов, receipt | Доменные типы, связывание statement/market/condition, адаптер выбранного AMM, последовательности действий |
| Вход кошельком | SIWE/ERC-4361 + viem verification | Одноразовые challenge, cookie/session, авторизация API |
| Индекс блокчейна | Ponder → PostgreSQL → SQL/GraphQL HTTP | Обработчики наших событий, модели каталога/портфеля, контроль свежести |
| Комментарии | PostgreSQL + обычный API и готовые библиотеки рендера Markdown | Небольшая модель comments, проверка SIWE-сессии, правила модерации |
| Очередь Lean/zk | pg-boss в том же PostgreSQL | Привязка к snapshot/profile, жизненный цикл задания, runner/prover adapter |
| Редактор Lean | lean4monaco; инфраструктура lean4web как reference | Закреплённые окружения задач, загрузка Solution, связывание с proof job |
| Серьёзная разработка Lean | Обычный Lean/Lake и VS Code Lean extension | Команды экспорта, проверки и отправки пакета/сертификата |

Наличие готовой библиотеки подключения не означает, что она реализует контрактную логику продукта. RainbowKit предоставляет интерфейс кошелька и использует wagmi/viem; wagmi предоставляет React hooks. Для SDK без React используем непосредственно viem. [RainbowKit](https://rainbowkit.com/docs/introduction), [wagmi](https://wagmi.sh/), [viem](https://viem.sh/docs/getting-started).

Ponder уже индексирует EVM-события, пишет в PostgreSQL и предоставляет API. Его механизм обрабатывает reorg с откатом и повторным исполнением индексирующих функций. Production требует PostgreSQL; PGlite предназначен для локальной разработки. Это позволяет не писать собственный block scanner. [Ponder README](https://github.com/ponder-sh/ponder), [reorg/recovery](https://github.com/ponder-sh/ponder/blob/main/docs/pages/docs/indexing/overview.mdx), [database](https://github.com/ponder-sh/ponder/blob/main/docs/pages/docs/database.mdx).

**Альтернатива B: The Graph вместо Ponder для публичного ончейн-каталога.** Остальное приложение и SDK те же. Это полезно, если независимое индексирование и публикация subgraph важнее простоты общей TypeScript/Postgres-сборки. Потребуются manifest, GraphQL schema и AssemblyScript mappings; комментарии и приватные задания всё равно остаются в backend приложения. Studio является средой тестирования, а публикация в Graph Network — отдельным действием. Поэтому вариант B не устраняет весь backend и не предлагается как обязательное усложнение. [The Graph quick start](https://thegraph.com/docs/en/subgraphs/quick-start/).

Не добавляем одновременно Ponder, The Graph, Redis, отдельный поисковый кластер и форум только ради возможного будущего масштаба. Очередь pg-boss использует уже выбранный PostgreSQL. Это готовая очередь; безопасность sandbox и идемпотентность внешних действий остаются ответственностью нашего job adapter. [pg-boss](https://github.com/timgit/pg-boss).

## 2. SDK: тонкая доменная прослойка, без собственного web3-фреймворка

Предлагаемая структура монорепозитория:

```text
packages/contracts-bindings   ABI + chain deployment manifest
packages/sdk                  viem + доменные типы + AMM/resolver adapters
packages/tooling              Lean/Lake/snapshot/prover CLI adapters
apps/web                      React + wagmi + RainbowKit + SDK
apps/api                      SIWE + comments + metadata + jobs API
apps/indexer                  Ponder handlers
workers/                      изолированные Lean и zk jobs
```

Это границы кода. Они не требуют по контейнеру и отдельной БД на каждый каталог. Индексируемые таблицы отделены от таблиц комментариев/сессий/очереди схемами и правами; rebuild/reorg индексатора не должен удалять пользовательские комментарии.

SDK получает `PublicClient` для чтения и, отдельно, `WalletClient` или подготовленный signer для отправки. Он не хранит private key и не требует аккаунта на нашем сервере для ончейн-операций. Web wallet и LP-скрипт выполняют одни и те же контракты.

```typescript
// Предлагаемые доменные типы; не обещание готового upstream API.
type ChainRef = { chainId: number; deploymentId: string };
type ReadContext = ChainRef & { blockNumber?: bigint };
type PreparedAction = {
  chain: ChainRef;
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }>;
  expectedEffects: unknown; // формализуется отдельно для каждого action
  observedBlock: bigint;
  warnings: string[];
};
```

Не скрывать из реального ABI различия вроде ERC-1155 approval, ERC-20 allowance, FPMM funding и ERC-20 LP positions. `calls[]` может содержать несколько последовательных транзакций; атомарность появляется только при реально выбранном router/batch path и поддержке кошелька. Возможность `simulateContract` в viem помогает получить revert/result до подписи, но симуляция не гарантирует исполнение в изменившемся состоянии сети. [Код simulateContract](https://github.com/wevm/viem/blob/main/src/actions/public/simulateContract.ts).

Минимальный публичный SDK: чтение statement/market/status; подготовка create/buy/sell/add/remove/split/merge/redeem; submit certificate; finalize производного условия; governance propose/vote/queue/execute; allocation propose/approve/revoke/execute; fee distribute/withdraw. Избранный AMM определяет конкретные суммы, approvals, return assets и доступность операций.

## 3. Вход, комментарии и личный кабинет

SIWE задаёт формат подписи для офчейн-сессии: domain, URI, chain ID, nonce, issued-at и срок. ERC-1271 нужен для контрактных кошельков; проверка проводится в указанной сети и может зависеть от меняющегося состояния кошелька. Серверная сессия привязана к адресу, не к ENS-имени. [ERC-4361](https://eips.ethereum.org/EIPS/eip-4361).

Предлагаемый workflow:

1. Публичное чтение работает без кошелька. Подключение показывает выбранный адрес и сеть, но не авторизует запись в API.
2. Для комментария/приватного job API сервер выдаёт одноразовый challenge, связанный с допустимым доменом, URI и сетью.
3. Backend проверяет message fields, nonce и подпись; nonce потребляется атомарно. Срок сессии ограничен, cookie `HttpOnly`, `Secure`; state-changing API защищён от CSRF.
4. При смене адреса прекращаем использовать старую сессию. Смена сети учитывается для контрактного кошелька; новая сессия не выводится автоматически из одинаковой строки адреса.
5. Транзакции и долевые согласия требуют самостоятельного wallet action; session cookie не является полномочием распоряжения средствами.

В viem есть `verifySiweMessage`, который сочетает проверку содержания сообщения с проверкой подписи. Ожидаемые domain/nonce следует передавать явно; проверку допустимого URI, chain ID и серверной политики выполняет наш session adapter. Поддержка конкретных Safe/других контрактных кошельков входит в интеграционную проверку, а не заменяется `ecrecover` на backend. [Исходник viem SIWE](https://github.com/wevm/viem/blob/main/src/actions/siwe/verifySiweMessage.ts), [verification API](https://viem.sh/docs/actions/public/verifyMessage).

Предложение модели комментария:

```text
Comment {
  id, chainId, deploymentId, statementId, marketId?, parentId?,
  authorAddress, bodyMarkdown, createdAt, editedAt?, moderationStatus
}
```

Автор всегда берётся из сессии. Markdown рендерится без разрешения произвольного HTML/script. Правки описания не меняют формальную цель; комментарии и job notifications не выставляют состояние `resolved`. Модератор сайта может скрыть содержимое в нашем каталоге, но не отзывать контрактные права и не разрешать математические рынки.

Готовый giscus удобен для GitHub Discussions, но его запись использует GitHub OAuth: это не соответствует обязательному пути «вошёл только кошельком». Для запрошенных сейчас комментариев небольшая таблица/API создаёт меньше новой инфраструктуры, чем подключение полноценного форума с собственным SSO-адаптером. Это обоснованная маленькая собственная часть, а не попытка переписать форум. [giscus workflow](https://github.com/giscus/giscus).

## 4. Lean в вебе и задания доказательства

`lean4monaco` переиспользует Lean VS Code extension/Infoview и даёт редактор в браузере с соединением с language server. `lean4web` является готовым веб-приложением с серверным исполнением Lean; его README ограничивает основной scope небольшими фрагментами и не обещает удобство больших проектов. Поэтому рекомендация — встроенный редактор для простого начала и стандартный локальный Lean workflow для больших решений. [lean4monaco](https://github.com/hhu-adam/lean4monaco), [lean4web](https://github.com/leanprover-community/lean4web), [Lean](https://github.com/leanprover/lean4).

Веб-редактор не равен zk-программе. Его диагностический language server и конечная доказываемая проверка имеют разные результаты и бюджеты. В профиле задачи закрепляется окружение; сайт не должен подставлять latest Mathlib или latest Lean вместо версии, с которой связан рынок.

Поток US-017/C-012:

| На поверхности | Под поверхностью | Наблюдаемый результат |
| --- | --- | --- |
| «Открыть в Lean» | SDK получает challenge/profile; редактор подключается к изолированному workspace указанной версии | Редактор и Infoview; сеть не меняется |
| «Проверить» | Создаётся immutable snapshot; worker проверяет пакет и соответствие цели | Диагностика либо `leanPassed`; это не onchain resolution |
| «Создать сертификат» | Отдельный prover adapter получает тот же snapshot/profile; UI показывает ресурсный/платёжный лимит до запуска | `queued/running/succeeded/failed/cancelled`, затем certificate artifact |
| «Отправить доказательство» | SDK проверяет envelope и готовит вызов resolver; кошелёк подтверждает транзакцию | `submitted`, затем receipt и контрактный статус |
| «Скачать / продолжить локально» | Выдаётся пакет с pinned toolchain/manifest и CLI-инструкциями | Возможность работать без нашего worker |

Job должен иметь `jobId`, `ownerAddress`, `statementId`, `profileId`, `solutionSnapshotHash`, `kind`, `status`, `attempt`, `artifactRefs`, ресурсные лимиты и diagnostics. Повторный worker не отправляет повторно платный заказ/транзакцию без проверки idempotency key; очередь сама по себе не делает внешние side effects exactly-once. Cancel прерывает вычисление по возможности, но не отменяет уже включённую транзакцию.

Lean/Lake и расширения выполняют пользовательский код. Из готовой инфраструктуры lean4web можно взять bubblewrap-подход, но arbitrary repository build требует собственной политики разрешённых зависимостей и отдельной sandbox-проверки. Workers не получают web/API secrets или ключ управления governance. [Установка и изоляция lean4web](https://github.com/leanprover-community/lean4web/blob/main/doc/Installation.md).

## 5. Общее governance: две модели на стандартных контрактах

**G1 — Governor + TimelockController.** Предлагается как основная модель, если решения принимаются голосами держателей/делегатов. OpenZeppelin предоставляет общий цикл propose → vote → queue → execute и набор модулей для voting power, counting, quorum и delay. Не нужно писать собственную машину голосования. Владелец реестров/разрешённых upgrade paths — Timelock, Governor имеет право ставить разрешённые операции в очередь. [OpenZeppelin governance](https://docs.openzeppelin.com/contracts/5.x/governance).

**G2 — Safe + TimelockController.** Простой начальный вариант, если пользователь осознанно выбирает совет с порогом подписей. Safe исполняет решения после согласия заданного числа owners; этот путь является ончейн-контролем совета, но не общим голосованием всех участников. Он не удовлетворяет автоматически правилу согласия всех конкретных потерявших долю. Safe также полезен как кошелёк отдельного выгодополучателя в G1. [Safe architecture](https://docs.safe.global/advanced/smart-account-overview), [Safe contracts](https://github.com/safe-fndn/safe-smart-account).

Для небольшого количества административных действий достаточно ролей/ownership реестров. OpenZeppelin AccessManager — запасной стандартный механизм, если появляется много различных администраторов, задержек и разрешений по функциям; не добавляем его параллельно Timelock без конкретного основания. [OpenZeppelin access management](https://docs.openzeppelin.com/contracts/5.x/access-control).

Что нельзя выбрать как «техническую мелочь»:

- Кто голосует: T, отдельный voting token, членство или совет? Само название T как токена проекта этого не определяет.
- Если выбран T + ERC20Votes, T, переданный в escrow CTF/AMM, больше не находится на адресе пользователя. Автоматического сохранения голоса за LP/держателем conditional position нет. Голосование всем экономическим капиталом требует дополнительной модели и может увеличить собственный код.
- `ERC20Votes` поддерживает checkpoint/delegation; для уже обычного ERC-20 можно использовать voting wrapper, но тогда обеспечение и голосование конкурируют за тот же токен. Отдельный governance token добавляет собственную экономическую политику. [ERC20Votes/Wrapper](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20).
- Proposal threshold, quorum, сроки и emergency powers задаются перед deployment; предложение нулевого threshold позволяет любому создавать общие proposals, но требование «любой может предложить перераспределение» относится прежде всего к отдельному ShareController.

Рекомендуемая связь с формальной частью: governance регистрирует новую версию handler/profile/verifier и source/build commitments. Старое `profileId` не переписывается под новые байты. Что именно допускается для уже открытых рынков, определяется отдельной upgrade policy. Git commit/source hash показывает идентичность выбранного материала, но не доказывает корректность операции или соответствие бинарника исходникам. Для proxy нужно учитывать не только его собственный bytecode, но implementation и путь обновления. Это проектные ограничения применения готового Governor.

## 6. Доли комиссий: готовые выплаты плюс собственное правило согласий

### Что уже есть в Splits

0xSplits V2 даёт получающий ETH/ERC-20 адрес, хранение allocation commitment, `distribute` и два payout-пути. **Для нас предпочтителен PullSplit**: распределение зачисляет права получателей в Warehouse, а вывод выполняется отдельно. Это сокращает зависимость общего распределения от поведения каждого адреса-получателя. Несовместимые активы вроде rebasing/fee-on-transfer требуют отказа или отдельного адаптера; T предлагается обычным ERC-20. [SplitV2](https://splits.org/protocol/docs/core/split-v2/), [Warehouse](https://splits.org/protocol/docs/core/warehouse/).

Это переиспользование открытых контрактов; можно использовать проверенные deployments на выбранной сети либо собственный deployment закреплённого исходника. Чужой сайт Splits не становится оператором наших fee rights. Совместимость конкретного deployment и версия проверяются отдельно. У исходников Splits V2 лицензия GPL-3.0-or-later; её нужно сохранить в manifest при переиспользовании. [Исходники](https://github.com/0xSplits/splits-contracts-monorepo).

### Чего готовый Split не делает

`updateSplit` проверяет owner и валидность новой таблицы. Оно не вычисляет, кто теряет долю, и не собирает их согласия. Более того, владелец Split V2 имеет возможность выполнять произвольные вызовы от его адреса. Поэтому назначение owner=Governor или owner=Safe оставляет возможность обойти защиту выгодополучателей. [SplitWalletV2.updateSplit](https://github.com/0xSplits/splits-contracts-monorepo/blob/main/packages/splits-v2/src/splitters/SplitWalletV2.sol), [Wallet.execCalls](https://github.com/0xSplits/splits-contracts-monorepo/blob/main/packages/splits-v2/src/utils/Wallet.sol).

Нужен небольшой **ShareController**. Это собственная бизнес-политика; проверку подписей, токен-переводы и сам splitter берём готовыми. Общий majority Governor не является заменой ShareController.

### Минимальный контракт C-005

```text
proposeAllocation(baseVersion, sortedNewAllocation, expiresAt) -> proposalId
approveAllocation(proposalId)       // msg.sender соглашается именно с этим proposal
revokeApproval(proposalId)          // предлагаемая политика: до исполнения
executeAllocation(proposalId, allocationData) -> newVersion

currentVersion()
allocationHash(version)
splitForVersion(version)
```

Инварианты проекта:

1. `sum(shares) == D`, знаменатель D фиксирован; уникальные адреса отсортированы, zero address исключён. Отсутствующий адрес имеет 0. Пустые/нулевые записи не создают неоднозначности.
2. Контракт сам вычисляет все `a`, для которых `newShare[a] < oldShare[a]`, включая удалённых. Список requiredApprovers от frontend не считается авторитетным.
3. Каждый из них должен дать согласие. Неизменённые/увеличенные доли не дают veto, дополнительное голосование общего governance не вводится.
4. Proposal связывает chain/instance, baseVersion, весь новый allocation и срок. Применение чужого baseVersion отклоняется, даже если подписи остаются криптографически корректными.
5. Применить после согласий может любой. Изменение версии и направления будущих fee receipts атомарно; старые claims не списываются.
6. Верхняя граница числа получателей определяется gas-benchmark. Контракт не обещает исполнение списка неограниченной длины.

Самый простой вариант согласия — отдельная onchain-транзакция `approveAllocation`. Safe как выгодополучатель вызывает этот метод от своего адреса после своего внутреннего quorum. Для пакетного исполнения позже можно добавить EIP-712 подписи с OpenZeppelin SignatureChecker; contract-wallet подпись проверяется на момент применения, поскольку ERC-1271 validation может измениться. Не смешивать хранимое onchain-согласие и отзы́ваемую подпись без явно выбранной политики. [SignatureChecker](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/SignatureChecker.sol).

### Два способа сохранить историю начислений

| Схема | Как устроена | Преимущество | Условие/нюанс |
| --- | --- | --- | --- |
| **S1. Immutable PullSplit на каждую версию — рекомендация** | Контроллер создаёт новый Split с owner=0; FeeRouter направляет новые receipts в него. Старый Split и Warehouse claims сохраняются | Старые средства и округления не переходят под новые доли; нет owner с правом drain старого Split | Больше clone-адресов, SDK объединяет claims по версиям. Правило upstream accrual отдельно ниже |
| **S2. Один mutable PullSplit под ShareController** | При применении controller сначала распределяет старые balances старой таблицей, затем вызывает updateSplit в одной tx | Один адрес получателя комиссий | Нужно учесть все разрешённые активы, upstream collect и остатки округления; controller не должен экспонировать arbitrary execCalls/transferOwnership |

S1 — наше соединение готовых immutable splitters с минимальным controller/router; это не штатная готовая governance-функция Splits. В S2 простая смена процентов без предварительного распределения изменит получателей ещё не распределённого баланса. Уже зачисленные на адреса получателей Warehouse claims этим обновлением не переписываются. Это следует из раздельных `updateSplit`, `distribute` и Warehouse-accounting. [PullSplit.distribute](https://github.com/0xSplits/splits-contracts-monorepo/blob/main/packages/splits-v2/src/splitters/pull/PullSplit.sol).

Не обещаем выплатить до последнего wei: splitter использует целочисленное округление и может оставлять технические остатки. В S1 остаток остаётся в старой эпохе. В S2 нужна отдельная политика остатков; иначе строгое обещание «всё старое строго по старым долям» неверно. Предлагается нулевая `distributionIncentive` в стартовой схеме: новая скрытая доля keeper не должна уменьшать определённые пользователем проценты. Если вознаграждение за распределение вводится, его место в gross/net fee policy фиксируется отдельно.

### Самая важная зависимость от AMM

**Приход денег в Split, накопление fee внутри AMM и право пользователя на выплату — три разные точки.** Immutable epochs защищают то, что уже отнесено к эпохе. Они не умеют автоматически определить, когда была заработана комиссия, которую AMM передал значительно позже.

Два допустимых договора:

- **По поступлению:** fee относится к долям, действующим при `recordFee`/фактическом получении через FeeRouter. Это минимальная сборка, но прошлые сделки, комиссии которых ещё удерживает AMM, могут попасть под новую таблицу. Такой смысл нужно явно принять, а не называть его учётом исторической выручки по сделке.
- **По возникновению комиссии:** AMM/adapter фиксирует epoch сразу либо сохраняет per-source checkpoint перед сменой. Требуется выбранный AMM с подходящим accounting. Нельзя обходить неограниченное количество permissionless pools одной обязательной транзакцией смены долей; нужны source-level epochs/lazy checkpoints или другой механизм.

Если доход выражен ERC-20 LP-токеном, его можно распределять как актив, но это не немедленная выплата T. Нативные ERC-1155 positions не являются обычным ERC-20 входом PullSplit: нужен wrapper/реализация в T/другой adapter. Автоматическая продажа в T добавляет slippage/MEV-policy и не выбирается молча.

### Граница общей изменяемости протокола

Нельзя одновременно обещать «governance может переписать всё» и «никто не уменьшит долю без моего согласия» в безусловном смысле.

- **Защищённая модель:** ShareController и старые payout epochs неизменяемы; общее governance не имеет bypass к ним. Его права на смену fee rate, источника и маршрута тоже перечисляются явно.
- **Полностью обновляемая модель:** правило согласий действует в текущей реализации, но upgrade authority может заменить его. Timelock даёт время увидеть изменение, а не математический запрет.

Даже неизменность процентов не гарантирует фиксированный доход: governance может уменьшить сам protocol fee или остановить источник, если имеет такие полномочия. Правило на проценты и правило на экономический поток должны быть разными строками спецификации. Утрата ключа выгодополучателем не создаёт автоматического исключения из согласия; Safe с собственным recovery/ownership-процессом может снижать этот риск на уровне кошелька.

## 7. Сценарии: поверхность → механизмы → результат

| Сценарий/роль | Поверхность веба или SDK | Реальное исполнение | Признак успеха/ключевая ошибка |
| --- | --- | --- | --- |
| US-001, US-006/007: автор | Заполнить постановку/derived expression, просмотреть preview, «Создать» | Tooling собирает pinned manifest; SDK вызывает registry/factory | ID из receipt; ошибка регистрации не создаёт рынок в каталоге как завершённый |
| US-002/019: LP | Пул → внести/вывести; LP-скрипт использует те же SDK actions | AMM adapter рассчитывает суммы и необходимые approvals; выбранный AMM исполняет | Фактическая позиция и выходные активы, а не обещанный возврат T |
| US-003/008/020: трейдер | Купить/продать/погасить/создать полный набор | SDK → wallet → AMM/CTF/resolver ABI | Receipt, фактические балансы; slippage/revert показывается отдельно |
| US-004/005/013/017: автор доказательства | Редактор/загрузка/CLI → проверка → сертификат → отправка | Изолированный runner; prover adapter; onchain verifier/resolver | Отдельные `leanPassed`, `certificateReady`, `resolved`; неверный profile отклоняется |
| US-009/018: участник governance G1 | Предложение → голос → очередь → исполнить | Governor считает голоса по snapshot; Timelock исполняет конкретные target/value/calldata | Состояние из контрактов; недоступное право не появляется из SIWE |
| US-009/018: совет G2 | Открыть Safe transaction, проверить изменения, подтвердить | Safe собирает threshold owners; вызывает Timelock schedule/execute | Tx исполнена после threshold/delay; комментарий «за» не является голосом |
| US-010: любой предлагающий | «Изменить доли», редактировать таблицу, отправить proposal | ShareController проверяет baseVersion/full allocation и вычисляет уменьшения | Proposal ID и конкретный список ожидаемых согласий |
| US-010: затронутый выгодополучатель | Видит свою старую/новую долю и общий diff; «Согласен» / «Отозвать» | Отдельный вызов от адреса в ShareController; подпись входа не используется | Recorded approval/revocation; сменившаяся baseVersion делает proposal устаревшим |
| US-010: любой исполнитель | «Применить» | Controller проверяет всех decreased, выполняет выбранный cutover и активирует новую эпоху | Новый version/split; отсутствие одного согласия отклоняет весь вызов |
| US-011: выгодополучатель | Кабинет → комиссии → «Распределить»/«Вывести» | Permissionless distribute в Split нужной эпохи; затем Warehouse withdrawal | Отдельно нераспределённое, claimable и выплаченное; изменения текущих долей не стирают старые claims |
| US-012/015: посетитель | Поиск, описание, Lean, Palomar-ссылка | Индекс/API объединяет metadata и chain IDs; внешний источник отмечен отдельно | Публичная карточка с observedBlock; stale data отмечены |
| US-014: владелец адреса | Подключить → подписать вход → кабинет | wagmi/RainbowKit, SIWE verifier, session API, read-only portfolio queries | Сессия правильного адреса; wallet reject не считается входом |
| US-016: комментатор | Написать/опубликовать | API проверяет сессию и сохраняет comment под её адресом | Comment ID; транзакция и gas не требуются |
| Дополнительная офчейн-роль: модератор | Скрыть спам с указанием причины | Ограниченный API изменяет только moderationStatus | Исходы, токены и права пользователей остаются состоянием сети |
| Технический исполнитель | Запустить indexer/worker или произвести permissionless distribute/finalize | Воспроизводимый event index, pinned job inputs или обычный контрактный вызов | Может быть заменён другим оператором; не получает права объявлять математический исход |

## 8. Решения, которые нужно принять перед implementation freeze

| Решение | Рекомендация | От чего зависит |
| --- | --- | --- |
| Web/SDK/index | Сборка A: viem/wagmi/SIWE/Ponder/Postgres | EVM-сеть; доступные RPC; ожидаемый объём |
| Комментарии | Небольшой собственный API в общем backend | Если нужен полноценный форум, появится отдельный выбор SSO/форумного движка |
| Lean UX | Веб для старта + стандартный локальный workflow | Размер задач и закрепляемых окружений; benchmark выбранного proof backend |
| Общее governance | G1 при token/member voting; G2 только как осознанный совет | Кто имеет голоса, экономическая роль T и locked collateral |
| Выплаты | Splits V2 PullSplit, S1 epochs | Тип fee assets и точка признания дохода |
| Согласия | Onchain approve/revoke; EIP-712 опционально | Требование gasless пакетирования и выбранная signature revocation policy |
| История fees | Явно выбрать receipt-time либо accrual-time | Возможности AMM fee accounting; число источников |
| Защита долей | Отдельный controller без majority bypass | Пределы governance/upgrades/fee route changes |

Минимальная собственная ончейн-часть в этом исследовании: `ShareController` и при необходимости `FeeRouter/fee-source adapter`. Registry handlers и mathematical resolver относятся к другим исследованиям. Backend пишет только доменную модель, SIWE session adapter, event mappings и orchestration jobs; AMM, кошелёк, голосование, распределитель и Lean editor не переписываются.

Перед фиксацией релиза нужны exact package versions/commits, совместимые compiler targets и ссылки на относящиеся к выбранным версиям upstream audits. Проверяем именно стыки: Safe SIWE; Safe approveAllocation; старый/новый allocation и пропущенный decreased signer; stale proposal; epoch cutover с накопленной upstream fee; fee asset compatibility; reorg каталога без потери комментариев; остановка job без ложного onchain success. Наличие аудита upstream-компонента не является аудитом этих соединений.
