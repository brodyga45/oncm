# Agora — зафиксированные выборы

Реализация A. Gnosis CTF + нативный FPMM с минимальным diff protocol fee и запретом новых торгов/финансирования после payout. Доход в T с фиксацией allocation epoch при сделке. Совет Safe + Timelock. Vue-интерфейс в стиле математического рабочего кабинета: светлая бумага, чёткая типографика, спокойный цвет.

Независимая локальная EVM chainId=31371, RPC=9545, web=5171, API=4171. Собственные зависимости/данные/SDK/deploy, без соседних runtime imports. Общий план и критерии: [implementation-program](../../docs/implementation-program.md).

## Зафиксированные зависимости

| Часть | Версия / origin | Лицензия | Использование |
| --- | --- | --- | --- |
| Gnosis Conditional Tokens | npm1.0.3 | LGPL-3.0 | Исходный CTF, оригинальные ERC1155 complete sets, merge, payouts/redeem |
| Gnosis FPMM | commit6814c0247c745680bb13298d4f0dd7f5b574d0db | LGPL-3.0 | Оригинальная математика и LP fee ledger; ограниченный patch ниже |
| OpenZeppelin | 5.0.2 | MIT | ERC20, Ownable, ReentrancyGuard, TimelockController |
| OpenZeppelin PaymentSplitter | 4.9.6, отдельный npm alias | MIT | Готовый неизменяемый pull splitter каждой эпохи |
| Safe | 1.4.1-2 | LGPL-3.0 | Настоящий singleton/proxy factory, threshold2 из2 владельцев |
| Vue / Vite | 3.5.16 / 6.3.5 | MIT | Академический веб-интерфейс |
| viem | 2.31.0 | MIT | EIP1193, reads/simulation/receipts, SIWE/ERC1271 verification |
| Fastify / cors | 5.2.1 / 10.0.1 | MIT | API, лимит запросов, localhost CORS |
| Ganache | 7.9.2 | MIT | Независимая persist local EVM |
| solc-js | 0.8.28 и alias0.5.17 | GPL-3.0 | Компиляция современного glue и оригинального legacyGnosis |

Версии зафиксированы `package-lock.json`; лицензии upstream остаются в npm-пакетах и `vendor/gnosis/LICENSE`. Источники FPMM сохранены нетронутыми в `vendor/gnosis`. `scripts/prepare-legacy.mjs` детерминированно создаёт изменённую копию в `contracts/legacy`; review diff воспроизводим. Для proof dependencies, checker/source provenance, foundation и verifier keys действует отдельный `proof/manifest.json` и proof-пакет.

## Контрактные границы

`AgoraRegistry` связывает математическую идентичность с оригинальным Gnosis condition. Канонический goal id = keccak256(abi.encode("AGORA_GOAL_V1", goalHash, profileId)); profile immutable, а register требует отдельный `verifyGoal`. `submitProof(id,outcome,certificate)` передаёт verifier точный сохранённый goal/profile; outcome1/2 atomically вызывает CTF `reportPayouts([1,0]/[0,1])`. Никакого пути ручного resolution нет. Disable profile означает retirement **новых регистраций**, а не отмену verifier уже существующих условий.

Derived виды: resolved_by, resolved_as, resolved_as_by. Deadline inclusive: settlement at deadline засчитывается; отсутствие записи становится FALSE только строго после deadline. Dependency должна уже существовать, поэтому регистрации не создают циклов/forward references. Для новых символов governance регистрирует immutable operator id → evaluator address + manifest hash. Custom statement закрепляет operator version/dependency/parameters, evaluator возвращает0=pending,1=True,2=False. Пример `ResolvedAfterOperator` демонстрирует расширение через отдельный контракт. Council не может заменить версию evaluator старых рынков; новая семантика требует новогоid.

`AgoraFPMMFactory` создаёт настоящие FPMM с одним бинарным CTF condition. Diff FPMM: constructor и single-condition initialization вместо clone machinery; public getters; 20% штатной trade fee в T отправляется прямо в allocation.currentSplit(), остальные80% сохраняются в оригинальном LP fee ledger; buy/sell/addFunding проверяют CTF payoutDenominator==0; deadline wrappers. Оригинальные calcBuyAmount/calcSellAmount, funding proportional math и LP withdrawal сохранены. Fee epoch читается и оплачивается внутри самой сделки — обход внешнего router не обходит комиссию.

`AllocationController` не имеет owner и upgrade path. Предложение фиксирует baseEpoch, полный отсортированный уникальный список до32адресов, denominator1000000, expiry. Выполнение требует согласия каждого текущего получателя, чья доля снизится (исключённый адрес получает новую долю0). Согласие можно отозвать до исполнения. Старая версия/истёкший срок/уже исполненное предложение отвергаются. Каждый переход создаёт новый **оригинальный OZ PaymentSplitter** с immutable payees/shares, старый остаётся отдельно доступен.

Выбор PaymentSplitter вместо Splits преднамеренный: Agora собирает только T и уже фиксирует эпоху при каждой сделке. Не нужны универсальные multiasset distribution services и отдельные permissions. Выплата `release(T,beneficiary)` permissionless, но деньги всегда идут beneficiary. Учёт cumulative income предотвращает двойную выплату; новый allocation не перераспределяет старый splitter. Целочисленное округление оставляет dust в конкретной эпохе: он может стать доступен при последующем доходе, но специального owner sweep нет. Малые суммы protocol fee (`fee/5`) округляются вниз; остаток fee остаётся LP.

Council — реальный Safe2/2, owner Registry = Timelock. MinDelay5сек — явная локальная настройка. EOA не может менять profile/operator, подпись одного Safe owner недостаточна. Timelock executors=address0 означает публичное исполнение уже одобренного действия. В Safe UI показываются target/calldata/nonce; подписи eth_sign преобразуются в предусмотренный Safe формат v+4 и сортируются по owner address. Голоса комментариев, T balance и beneficiary controller не влияют на council threshold.

## Офчейн

API читает chain через viem; локальному масштабу не нужен отдельный indexer/Postgres. Собственные данные `.local/app.json` сохраняются atomic rename; JSON store рассчитан на один процесс. Source/metadata content address — keccak JSON, immutable URI, а informal text не утверждает свой математический статус. Jobs запускают собственный `proof/runner.mjs`, различают diagnostics/certificate/receipt и никогда не синтезируют fake-success. Приватный список jobs доступен только SIWE owner; callbacks не подписывают settlement за пользователя.

SIWE фиксирует localhost domain/URI, chain31371, nonce, expiry; nonce одноразовый, session HttpOnly SameSiteStrict, logout отзывает серверный token. Стандартный viem verifier поддерживает ERC1271 для кошельков, реализующих этот интерфейс; текущий council UI использует два EOA тестовых владельца. Auth нужен для социальных записей/jobs/личных заметок, не для публичного чтения или permissionless chain calls.

Profiles привязаны к SIWE address, имена не заменяют адрес. Replies сохраняют parentId в том же statement, глубина≤6. Votes: -1/0/+1, один address/comment, смена и удаление; self-vote server-side запрещён. Top order = score descending, createdAt descending, id ascending; New = createdAt descending, id ascending; replies упорядочиваются внутри ветвей. История редактирования сохраняется, local moderator может скрыть/вернуть комментарий с причиной. Никакой social action не меняет outcome или governance power.

Palomar integration читает реальные primary JSON endpoints и raw GitHub snapshot; проверяет full commit и безопасные пути, ограничивает объём/timeout, не исполняет downloaded hooks. Переносимый JSON включает source files/hashes, manifest и завершённые proof artifacts; совместимость большого внешнего проекта с конкретным профилем не предполагается автоматически.

Explorer читает блоки, receipts, logs и выводит decoded ERC20/ERC1155 transfers, protocol/governance events и net asset deltas (ETH gas включён). Он показывает публичные факты локальной chain31371. Никакой public-network explorer не используется. SDK chain methods работают напрямую при переданных ABI/config; API остаётся нужен для social/job/import удобств.

## Ограничения

Тестовая фиксированная эмиссия не является утверждённой mainnet токеномикой. Нужны production параметры timelock, account/session storage, job isolation/resource limits, audit собственного glue и версий upstream. Legacy Gnosis сохранён намеренно, это не заявление о новом аудите. На Apple Silicon Ganache при отсутствии совместимого µWS binary использует штатный JS fallback. Реальное Lean→zk acceptance отмечается отдельно после получения и ончейн-проверки действительного сертификата; экономический harness его не подменяет.
