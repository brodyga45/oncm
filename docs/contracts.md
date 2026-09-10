# Контракты

Статус: ниже предложены смысловые границы и предварительные контракты. Это псевдокод, а не согласованный ABI или готовая реализация. Сеть, сериализация, типы хэшей и форматы сертификатов пока не выбраны.

По принятому принципу переиспользования эти интерфейсы не означают переписывание токенов и AMM. При выборе Gnosis смысловые операции сопоставляем с существующими ABI; карта находится ниже и в [компонентах](./components.md).

Актуальная сборка и обязательные проверки каждого стыка описаны в [integration blueprint](./integration-blueprint.md). Ниже — индекс контрактов C-001–C-014 для сценариев. Рекомендуемые A/B/C используют одинаковые смысловые интерфейсы с разными AMM-адаптерами.

## Как описываем контракт

По мере обсуждения для каждого интерфейса фиксируем применимые сведения:

- Назначение, поставщика и потребителя.
- Статус: предложение или принятый контракт.
- Операции, сообщения или события и способ взаимодействия.
- Формат входных и выходных данных, обязательность полей и правила проверки.
- Семантику, инварианты и условия успешного выполнения.
- Ошибки и ожидаемое поведение вызывающей стороны.
- Для взаимодействия через сеть или очередь, если необходимо: таймауты, повторы, идемпотентность, порядок и гарантии доставки.
- Для изменяемых публичных интерфейсов, если необходимо: версионирование и совместимость.
- Примеры корректного вызова, ответа и значимых ошибочных ситуаций.

Формат спецификации выберем после определения типов интерфейсов. Примеры кода до согласования помечаем как иллюстративные.

## C-001. Регистрация утверждения

```text
LeanStatement {
  schemaVersion
  canonicalGoalCommitment
  challengeEnvironmentRoot
  proofPolicyId
}

SourceAttachment { sourcePackageHash, targetDeclaration, manifestURI }

DerivedStatement {
  operatorId
  operatorVersion
  arguments  // типизированные ссылки на утверждения и литералы
}

registerLeanStatement(specification, goalWellFormedEvidence, sourceAttachment) -> statementId
registerDerivedStatement(specification) -> statementId
```

Потребители: создание рынка, подача доказательства, производные выражения. Результат однозначно идентифицирует спецификацию и её окружение. В актуальной рекомендации Lean-регистрация требует отдельного сертификата `GoalWellFormed`: проверено `P : Prop`, но не доказано P. Для derived проверяется зарегистрированный обработчик, версии и типизированные аргументы. Недопустимые аргументы, неизвестные версии и неправильное свидетельство не создают валидную запись.

`SourceAttachment` — происхождение и доступные исходники, будущий Solution хранится отдельно. Для рекомендуемого kernel-пути он не заменяет авторитетную формальную цель. Если выбирается семантика именно .lean-байтов, профиль дополнительно проверяет source→goal; пока такой сквозной путь не воспроизведён. Это уточнение прежнего предложения включать sourcePackageHash непосредственно в основную спецификацию, не ослабление заявленной zk-проверки без уведомления. [Proof research](./research/proofs.md).

## C-002. Свидетельство математического резолва

```text
ProofClaim {
  claimSchemaVersion
  kind = ProofAccepted
  statementId
  canonicalGoalCommitment
  challengeEnvironmentRoot
  proofPolicyId
  outcome  // ProvenTrue либо ProvenFalse
}

ProofEnvelope {
  backendVersionId
  claim
  certificate
}

verify(expectedClaim, envelope) -> Accepted | Rejected
submitProof(statementId, envelope) -> resolution
```

Verifier должен связывать сертификат с ожидаемой проверяющей программой и всеми значимыми полями claim. Резолв принимает только `ProofAccepted`; `GoalWellFormed` из C-001 никогда не даёт payout. Самостоятельно переданное поле `outcome` не является доказательством. Для ProvenFalse предлагается проверять `¬P` относительно исходного P.

Резолвер дополнительно проверяет разрешённость backend для данного утверждения и допустимость перехода состояния. При неверном сертификате, несовпадении цели/окружения/политики или недопустимой версии состояние не меняется. Повтор сертификата не создаёт повторных экономических прав. Политика конфликтующих валидных свидетельств остаётся открытой.

Математическое доказательство может быть переиспользуемым. Если появятся награда за подачу или права конкретного отправителя, такие полномочия потребуют отдельной привязки к сети, экземпляру протокола и получателю; ограничение переиспользования математического факта само по себе не задано.

Уточнение после изучения Comparator: `challengeEnvironmentRoot` (в раннем черновике `environmentHash`) связывает проверку с окружением постановки. Решение может иметь дополнительные зависимости по правилам профиля; commitment пакета Solution и его окружения задаётся отдельно. Сравнение обязано подтвердить сохранение цели и значимых определений; стандартные аксиомы проверяются по полным объявлениям, а не только по имени. Точная сериализация закрепляется в proof spike.

## C-003. Резолв и производные выражения

```text
Resolution {
  status       // Unresolved | ProvenTrue | ProvenFalse, предварительно
  resolvedAt?  // время принятия, записанное протоколом
  evidenceRef?
}

getResolution(statementId) -> Resolution
evaluateDerived(statementId) -> Unresolved | ProvenTrue | ProvenFalse
resolveDerived(statementId) -> Resolution
```

Смысл `evaluateDerived` — получить допустимый сейчас результат, `resolveDerived` — записать его транзакцией. `resolvedAt` не принимается на веру из пользовательского сертификата. Правила дедлайна заданы как предложение в [семантике ResolvedBy](./statements-and-resolution.md#предлагаемая-семантика-resolvedby).

Актуальная рекомендация для производной над производной — время реальной записи её резолва без заднего числа. Момент, когда она стала вычислима, является другой семантикой. Таблица операторов и ограниченный batch приведены в [сборке](./integration-blueprint.md).

## C-004. Рынок, ликвидность и превращение токенов

```text
createMarket(statementId, marketParameters, initialLiquidity?) -> marketId
addLiquidity(marketId, amounts, limits) -> liquidityPosition
swap(marketId, direction, amount, limits) -> executionResult
redeem(position, amount) -> settlementResult  // возможная форма превращения
```

Торгуемые токены, единицы сумм, параметры обеспечения, LP-права, формула и торговые ограничения ещё не определены. Принятое экономическое назначение: токен доказанного утверждения превращается в T, опровергнутого — в False с нулевой стоимостью. `redeem` — предложение интерфейса, а не установленное пользователем требование отдельного погашения.

## C-005. Перераспределение комиссий

```text
proposeAllocation(expectedVersion, newShares) -> proposalId
approveAllocation(proposalId) -> recordedApproval
revokeApproval(proposalId) -> revokedApproval  // предложение: до применения
applyAllocation(proposalId) -> newVersion
```

Принятый инвариант: согласие каждого адреса, чья доля уменьшается; иных согласий не требуется. Предлагаемые дополнительные проверки: валидность распределения, привязка к исходной версии, полномочия согласующего адреса и однократное атомарное применение. Ошибки: неверная сумма долей, неоднозначные дубликаты адресов, устаревшая версия, отсутствующее необходимое согласие.

Предлагаемый идентификатор согласия связывает сеть/экземпляр протокола, предложение, исходную версию и полный новый набор долей. Формат подписей и поддержка контрактных адресов будут зависеть от сети. Подробности: [governance](./governance.md).

## C-006. Расширения governance

Предлагаемая граница: готовый Governor/Timelock исполняет конкретные target/value/calldata для версионируемой регистрации операции, профиля, backend либо изменения разрешённых параметров. Свой универсальный движок голосования не пишем. Субъект голосования ещё выбирается; Safe-совет является другой моделью участия. Каждое изменение описывает область действия на новые и существующие утверждения/рынки. Манифест релиза — C-013; изменение долей проходит C-005, а не majority-обход.

## C-007. Выпуск полных наборов — предлагаемый вариант

```text
split(statementId, amountT) -> (amountP, amountNotP)
merge(statementId, amountOfEachSide) -> amountT
redeem(statementId, side, amount) -> amountT
```

Для предложенной модели 1:1 `split(n)` блокирует n T и создаёт n единиц каждой стороны; `merge(n)` сжигает n единиц каждой стороны и возвращает n T; после финального исхода `redeem(n)` сжигает победившую позицию и возвращает n T. Проигравшая позиция даёт ноль. Источник выплат — escrow соответствующего условия. Комиссии, округления и разрешённость операций по состояниям требуют отдельной спецификации.

Этот интерфейс относится только к предложенной модели полных наборов и не считается принятым контрактом. Он не предоставляет право минтить T за доказательство произвольной теоремы.

## C-008. Мост к Gnosis — кандидат интеграции

| Смысловая операция проекта | Кандидат существующего вызова |
| --- | --- |
| Подготовить торговое условие | CTF `prepareCondition(adapter, questionId, 2)` |
| Сообщить проверенный исход | Адаптер вызывает CTF `reportPayouts(questionId, payouts)` |
| Выпуск/объединение полного набора | CTF `splitPosition` / `mergePositions` |
| Получить выплату | CTF `redeemPositions` |
| Создать пул | FPMM factory `createFixedProductMarketMaker` |
| Внести/вывести ликвидность | FPMM `addFunding` / `removeFunding` |
| Обменять позицию и T | FPMM `buy` / `sell` |

Это соответствие назначений, не взаимозаменяемые сигнатуры: например, CTF `redeemPositions` погашает баланс выбранных позиций вызывающего, а не принимает произвольный `amount` из нашего раннего псевдокода. Окончательный интерфейс следует строить вокруг выбранного готового ABI. Адаптер обязан однозначно связывать утверждение, условие, версию правил и порядок исходов. Источники: [компоненты](./components.md).

## C-009. Внешняя ссылка на формализацию — предложение

```text
ExternalFormalizationRef {
  registry          // например, Palomar
  recordId
  recordVersion
  repositoryUrl
  commit
  projectPath
  comparatorConfigPath
  targetDeclaration
}
```

Это наша концептуальная ссылка, не утверждение о точных полях Palomar API. Она помогает найти источник и сопоставить его с утверждением; не предоставляет права резолва. По одному названию или плавающей ссылке `latest` нельзя автоматически получить statementId. Импорт формирует предложение/заготовку, после чего требуется проверка формальных данных.

## C-010. SDK, сайт и кошелёк — предложение границы

```text
readProtocolState(query, chainContext) -> data + observedBlock
prepareAction(action, account, limits) -> TxPlan + summary
wallet.submit(transactionRequest) -> transactionReference
readExecution(transactionReference) -> pending | included | failed | confirmed
```

TxPlan содержит одну или несколько транзакций, необходимые approvals, snapshotBlock, суммы, лимиты и остаточные активы. Псевдокод описывает обязанности, а не новую обёртку над всеми будущими SDK. Чтение не требует приватного ключа. Подготовка не исполняет действие; кошелёк подтверждает конкретный запрос, а контракт проверяет полномочия и условия. Сайт не может объявить успешный резолв только по результату локального Lean-запуска. Статусы подтверждения зависят от выбранной сети.

## C-011. Сессия приложения и ончейн-социальный слой

Обновлено по решению пользователя 2026-09-10. SIWE остаётся отдельным механизмом доступа к оставшимся частным офчейн-функциям. Профили, блоги, комментарии и голоса авторизуются контрактом по кошельку; старая схема social writes через session/API не является текущим контрактом.

```text
requestSignInChallenge(address, applicationContext) -> message
verifySignIn(message, walletSignature) -> offchainSession

// Концептуальный SDK; точные методы различаются по реализации.
publishProfile(signer, name, bio, previousVersion?) -> tx + version
publishBlog(signer, title, fullText) -> tx + entryId
publishComment(signer, statementId?, parentId?, fullText) -> tx + entryId
reviseEntry(signer, entryId, previousVersion?, fullText) -> tx + revision
setVote(signer, entryId, -1|0|1) -> tx + currentVote + score
readProfile(address, block?) -> profile + versions
readThread(contextId, top|new, cursor?, block?) -> entries + nextCursor
readBlog(address, cursor?, block?) -> entries + nextCursor
readRevision(entryId, version, block?) -> fullText + provenance
```

Agora использует Solady SSTORE2 и state-readable индексы/версии. Exchange использует неизменённый ECP CommentManager и policy/history hook; голос меняется штатной атомарной заменой реакции. Vault использует оригинальный EAS.attest с неизменяемыми schema UID и resolver, причём attester остаётся кошельком пользователя. Все три сохраняют полные байты и историю, а не только URI/hash. SDK готовит вызовы, проверяет сеть/адрес/контекст и читает receipts; кэш восстанавливается из сети.

Инварианты: автор правит только своё; родитель/контекст не меняются редакцией; один текущий голос адреса; самоголосование запрещено; социальная запись не разрешает математический рынок. Точные зависимости, лимиты и [приёмка](./onchain-social.md) зафиксированы отдельно; пользовательские шаги — US-016/021.

## C-012. Задание Lean/zk — предложение

```text
prepareProofJob(statementId, solutionSnapshot, profileId) -> jobRequest
runProofJob(jobRequest, executionTarget) -> jobReference
readProofJob(jobReference) -> status + diagnostics + artifacts?
```

Рекомендуются локальный CLI и изолированные workers с одинаковыми входными/выходными пакетами. Результат связан с целью, snapshot и профилем; изменение этих данных означает новое задание. Готовый certificate — вход C-002, не подтверждение уже состоявшегося резолва. Job API авторизует доступ через сессию, допускает идемпотентный повтор/отмену, сохраняет диагностику; отмена не отзывает уже отправленный proof. Конкретные квоты и стоимость выбираются после benchmark.

## C-013. Манифест и регистрация версии

```text
ReleaseManifest {
  schemaVersion, sourceCommits, dependencyLockHash, buildRecipeHash
  artifactHashes, abiHashes, codeHashes
  proofProfileId?, programId?, verifierAddress?, publicOutputSchemaId?
  operatorSpecHash?, deploymentChainId?, permissions, applicability
}

registerProfile(manifestCommitment, configuration)
registerBackend(profileId, backendConfiguration)
registerOperator(operatorId, version, handler, specCommitment)
setVersionAvailability(versionId, scope, enabled)
```

Вызовы выполняются согласованным governance, не автором произвольного пакета. Большой манифест хранится по содержимому, необходимые проверяемые параметры — в registry. Scope различает новые регистрации и допуск сертификатов старых целей; окончательные payouts не переписываются. Исходный commit и program ID имеют разные смыслы, контракт не доказывает сборку из Git. Обновляемый внешний verifier gateway является отдельной зависимостью прав. [Сборка и версии](./integration-blueprint.md).

## C-014. Доходы и версии выплат

```text
currentAllocationVersion() -> version
splitForVersion(version) -> immutableSplitAddress
collectAndRoute(source, asset, limits?) -> version + receivedAmount
readRevenue(account, version, asset) -> pendingSource? + undistributed + claimable
distribute(version, asset) -> allocationResult   // готовый PullSplit
withdrawClaim(asset, recipient) -> amount       // готовый Warehouse по его ABI
```

Первые строки — доменный API нашего controller/SDK, последние сопоставляются с реальным ABI Splits. Рекомендуемый Split: owner=0, distributionIncentive=0. ERC-20 T и LP можно распределять как активы; ERC-1155 требует wrapper/другого пути. В C-005 создаётся новая версия, но уже назначенные старые выплаты сохраняются.

`pendingSource` является оценкой/состоянием AMM и не обязательно принадлежит текущему адресу по прежней таблице. Момент route в Split либо исторический момент сделки должен быть выбран явно; immutable epochs сами не делают checkpoint AMM. Автоматическая конвертация LP/исходов в T — отдельный необязательный маршрут с лимитами, не гарантия интерфейса. [Исследование выплат](./research/app-governance.md).
