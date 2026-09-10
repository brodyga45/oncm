# Vault

Независимое приложение ONCM: Gnosis Conditional Tokens → канонические ERC-20 wrappers → **настоящий Balancer V3 WeightedPool/Vault**. Отдельное членство OpenZeppelin Governor + Timelock, реальные Splits V2 wallets для дохода. Интерфейс Svelte, свой SDK, API, блокчейн и данные.

Социальные функции теперь ончейн: оригинальный EAS хранит полные профили, личный блог, комментарии/ответы, редакции и голоса. [ONCHAIN-SOCIAL.md](ONCHAIN-SOCIAL.md) содержит схемы, SDK, отдельные compiler pins, deployment blocks126–128 и проверенные ограничения. Старые SIWE social записи сохранены как явно отдельный legacy архив.

Текущая граница сайта: native-проверка Lean и работа с **готовыми внешними сертификатами**. Пользователь подготавливает сертификат вне сайта; веб не запускает и не заказывает его вычисление. Загрузка, оригинальная EVM-проверка, применение, регистрация рынка и resolution остаются доступны. CLI/API и история прежних задач сохранены; генерация через веб отложена на будущую функцию.

## Запуск

```sh
cd implementations/vault
npm ci
npm run setup:anvil
npm run dev
```

`npm run dev` запускает свою Anvil-сеть из сохранённого состояния, затем API и сайт. Если процессы уже работают, повторный запуск их использует. При первом запуске восстанавливаются 27 проверенных production-артефактов из [production](production/README.md) и отдельный proof descriptor; SHA, исходники, compiler settings и pinned зависимости проверяются до deployment. Отличающиеся существующие артефакты не перезаписываются. Затем он последовательно добавляет SchemaRegistry, EAS и VaultSocialResolver, если social deployment ещё отсутствует; три проверенных production-артефакта сохранены в social/artifacts. Компиляторы и prover автоматически не запускаются. При существующем social deployment проверяются код, связь с registry и точные nonrevocable схемы. API/web объявляются готовыми только после проверки их ответа и идентичности deployment. Отсутствие контракта из ранее сохранённого deployment приводит к ошибке с предложением восстановить snapshot, а не к незаметному новому deployment. Текущий devnet:

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:4173/api/health
- RPC: http://127.0.0.1:9547 · chain ID **31373**
- `npm run chain`, `npm run deploy`, `npm run api`, `npm run web` доступны отдельно.
- Node 22 рекомендуется. Официальный Anvil **1.7.1**, macOS ARM64, Cancun; EIP-170 включён, unlimited contract size выключен. На другой платформе задайте `VAULT_ANVIL` на официальный совместимый бинарник.
- `.state/deployment.json` содержит реальные адреса, profile, deployment block. `.state/abis.json` — ABI для web/SDK. Runtime соседних implementations не используется.

Для независимой копии рядом с действующим стендом доступен `VAULT_PORT_OFFSET=10000 npm run dev`: RPC19547, API14173, web15173, тот же chain ID31373, собственные `.state` и `chainInstance`. SDK и SIWE проверяют согласованные loopback endpoints; remote URL не разрешает тестовые ключи. Vite cache хранится в `.cache/vite` этой копии. Сначала нужно установить зависимости этой копии; соседний runtime не используется.

`npm run compile` остаётся явным воспроизводимым rebuild-путём, затем `node scripts/build-production-bootstrap.mjs` проверяет source/metadata bindings и обновляет distribution. Полная компиляция на текущем ARM-компьютере не уложилась в ограниченную60s попытку; таймаут не скрыт и при обычном запуске этот путь не выполняется. [Фактическая свежая проверка](evidence/fresh-start/README.md) отдельно фиксирует deployment, HTTP, SDK, original verifier и браузер; это не проверка `npm ci` на машине без установленных зависимостей.

Вход: кнопка кошелька → Browser wallet либо явно обозначенный публичный local devnet account 0–3. Последние доступны только для loopback RPC согласованного port offset и chain 31373. Anvil выдаёт тестовые ETH; каждый из четырёх аккаунтов получает фиксированно 1,000,000 T при развёртывании. У T нет публичного mint. Его отсутствие эмиссии после конструктора — выбор этого локального приложения.

Anvil пишет `.state/chain/anvil-state.json` каждые **10 секунд** и при штатном завершении, включая блоки, транзакции и historical states. Launcher сохраняет проверенную копию `anvil-state.last-good.json` через atomic rename; при повреждении основного файла использует её. После crash могут потеряться изменения после последнего корректного snapshot. Остановка через Ctrl+C/SIGTERM ждёт завершения Anvil и финального dump. Launcher отказывается запускать пустую замену, если ранее запущенная сеть потеряла snapshot; файл более 64 MiB также требует явного разбора, чтобы восстановление не вызвало новый пик памяти.

Конфигурация: 2 Anvil threads, 64 MiB memory **на отдельное EVM execution** (не полный RSS процесса), 100M block gas, 128 persisted historical-state cache entries и 1024 блока с транзакциями в памяти. `--preserve-historical-states` сохраняет доступные historical states в snapshot. Это ограниченный локальный стенд, а не бесконечный архивный узел: для долгой истории сохраняйте экспорт блоков и архивы. Результат reload-проверки — `.state/persistence-report.json`: та же genesis/head, реальные receipts и block hashes, код Vault, logs и баланс после загрузки.

Прежняя volatile Hardhat-сеть была утрачена вместе с процессом; её нельзя восстановить из адресов. Пользователь явно разрешил **новую** сеть и deployment. Их `chainInstance.id` — `554c825d-6813-43bf-9bf0-6ede06acff4d`; прежние восемь JSON-отчётов/deployment скопированы в `.state/archive/2026-09-09T21-26-05-393Z-lost-volatile-hardhat/` с checksum manifest. Совпадение детерминированных адресов не означает сохранение прежней цепи. `.state/community.json`, профили, комментарии и четыре прежних Lean jobs оставлены неизменными; jobs не запускаются повторно. Скрипт `npm run archive:lost-chain` предназначен только для явно согласованного восстановления при отсутствующем RPC и отсутствии snapshot, не входит в обычный запуск.

## Опубликованный Lean → рынок → выплата

1. Подключить account 0. Для имеющегося настоящего certificate smoke: Lean Lab → «Готовые внешние сертификаты» → загрузить `true-registration` профиля perf05. Это отдельная логическая цель `∀ P : Prop, P → P`, не Nat.add_comm или FLT. Если эта цель уже зарегистрирована, откройте существующий рынок вместо повторной регистрации.
2. «Проверить original EVM и профиль» → «Заполнить новый рынок этим сертификатом». Собственный сертификат можно загрузить как verified.json. Отдельная кнопка «Проверить Lean» выполняет Lean, export и NanoDa check для поддерживаемого локального v3-профиля, включая `lean-nat-add-comm-4.33.1`; она не создаёт сертификат и не подменяет проверку perf05.
3. «Продолжить регистрацию» → название, goalHash/profile, snapshot metadata, certificate → отправить transaction. Registry проверяет `verifyGoal`, создаёт CTF condition и два канонических wrappers.
4. Страница утверждения → split, например 1000 T. Создать YES/T WeightedPool 80/20 с fee 1%. Капитал → внести, например 100 T и 800 YES для веса outcome 80% (стартовая spot-цена около 0.5 T/YES). Получены реальные BPT.
5. Подключить account 1, приобрести YES за T, проверить receipt и reserves. Подключение кошелька также создаёт отдельную SIWE session для off-chain возможностей.
6. Lean Lab → то же утверждение → загрузить готовый `true-proof` → проверить EVM → применить к выбранному утверждению → «Разрешить по сертификату ончейн». `StatementRegistry.submitProof` вызывает неизменяемый LeanProofBridge, затем CTF `reportPayouts`. Для опровержимой цели используются отдельные false-registration/false-refutation.
7. Капитал: swap теперь отвергается FinalityHook, пропорциональный вывод BPT доступен. Страница утверждения: погасить позиции. YES получает 1 T, NO получает 0. Балансы считываются из chain.
8. Блоки: receipt, блок/hash/timestamp, отправитель, gas, decoded events и signed ERC-20 transfer deltas. После каждой транзакции есть переход в её блок.

`proof/runner.mjs`, бинарники и manifest принадлежат этому приложению. Native Lean/exporter/RISC Zero toolchain paths заданы в `proof/runtime.local.json`; они являются установленными системными инструментами, а не сервисами другого приложения. Воспроизведение на другом компьютере требует установки этих закреплённых инструментов и настройки путей. `proof/manifest.json` задаёт Lean/exporter/checker/RISC Zero pins, imageId и foundation. Сборка verifier хранится в `proof/artifacts/LeanProofBridge.json`, constructor arguments — `proof/deployment.json`. Отсутствующий локальный файл восстанавливается из tracked `proof/bootstrap-deployment.json`: проверяются SHA-256 оригинального bridge artifact и точные v3 image/profile/manifest. Уже существующий отличающийся descriptor не перезаписывается; требуется явная проверенная миграция.

Профиль v3 фиксирует декларации `Oncm.goal` / `Oncm.solution`, foundation и native reductions `Nat.succ`/`Nat.add`; неподкреплённые name-based shortcuts других операций выключены. Допустимы только три аксиомы immutable foundation (`propext`, `Classical.choice`, `Quot.sound`), дополнительные аксиомы запрещены; цели проверяются по структурному Lean Name. Локальный профиль не обещает совместимость со всеми импортированными mathlib/Palomar репозиториями. Импорт сохраняет исходники, hashes, commit и metadata; неподдерживаемое окружение даёт настоящую диагностическую ошибку, а не сертификат.

## Что переиспользовано

| Часть | Реальный upstream | Свой соединительный код |
|---|---|---|
| Обеспечение и выплаты | Gnosis CTF 1.0.3 | Registry является oracle, проверяет математический сертификат и репортит бинарные payouts |
| ERC-20 позиции | Gnosis 1155-to-20 1.0.2, оригинальные artifacts | Канонические 65-byte metadata; Seer-inspired PositionRouter split/merge/redeem |
| AMM | Balancer v3-vault/weighted 1.0.0, исходники без изменений | PoolCoordinator задаёт T/outcome, веса, роли, hook, creator percentage |
| Трансферы AMM | Оригинальные Balancer Router + Uniswap Permit2 | SDK делает ERC-20 approval → Permit2 approval → router call |
| Finality | Balancer BaseHooks | FinalityHook блокирует swap/joins после resolver outcome, пропорциональные exits не перехватывает |
| Доход | Balancer ProtocolFeeController + Splits V2 PullSplit/warehouse | AllocationController с согласием всех decreasing holders; новый immutable Split на каждую эпоху |
| Governance | OZ 5.2 Governor, ERC20Votes, Timelock | Soulbound Membership, Timelock authorizer, immutable profile/operator registry |
| Социальный слой | Original EAS1.9.0 + SchemaRegistry, MIT | Immutable resolver schemas: полный профиль/блог/комментарии/ответы/редакции/голоса ончейн, latest/author/context/±1/0 rules; Svelte RPC view |
| Proof | Lean + lean4export + NanoDa + RISC Zero/Groth16 | Закреплённый LeanProofBridge и runner; ни adminResolve, ни mock-путь основного приложения |
| Очередь | p-queue 8.1.0 (MIT) | Один worker, объединение одинаковых запросов кошелька, отмена после cleanup, внешний resource guard без повторного lock |

Исходники/версии/лицензии подробно: [DEPENDENCIES.md](DEPENDENCIES.md). Компилятор Solidity 0.8.28, viaIR, optimizer runs=1, Cancun. Это существенно: при runs=200 текущий Vault превышает EIP-170; runs=1 укладывается. Permit2 и Solmate WETH компилируются отдельно solc 0.8.17. Vault развёртывается через оригинальный VaultFactory, который проверяет hashes Vault/Admin/Extension, а не через самописную копию AMM.

## Экономика и права

- Пул содержит T + YES либо T + NO, weights от 5% до 95%. Swap fee выбирает создатель в пределах 0.01–10%; стандартные варианты UI 0.3/1/2%. В этой сборке creator receives **20% от swap fee**, а не 20% суммы сделки. Протокольная Balancer share на собственном deployment = 0; остальная комиссия сохраняется LP. Governance имеет штатные Vault полномочия изменять разрешённые настройки.
- Creator fee назначен AllocationController, не человеку-создателю пула. `collect(pool)` вызывает canonical fee controller и отправляет активы в Split текущей эпохи. Внешний public Balancer withdrawal может переслать их collector; `sweep(token)` распределяет их в активную эпоху.
- Эпоха считается **по времени сбора**: ранее накопившиеся, но ещё не полученные fees могут попасть в новую эпоху. Старые immutable Splits и уже начисленные warehouse balances не меняются. Splits distribute сохраняет 1 raw unit dust upstream; SDK withdrawal использует точный полный warehouse balance через overload, чтобы его не оставлять.
- Любой предлагает новую таблицу (адреса сортируются, сумма 10,000 bps, максимум 32). Нужно согласие только всех уменьшающихся долей; его можно отозвать до apply. Proposal привязан к base epoch, устаревшие предложения не применяются.
- FinalityHook не позволяет обмен после payout. Трейдер, первым знающий доказательство, может сделать swap перед его публикацией; adverse selection не устранена. LP получает реальный inventory, а не гарантированную стоимость. Для каждого утверждения coordinator создаёт отдельный immutable hook: beforeInitialize блокирует и прямую инициализацию пустого пула после finality, beforeAddLiquidity блокирует новые join. Пропорциональный exit доступен.
- Веса WeightedPool неизменяемы; новый набор весов — новый пул. Governance не может присвоить теореме исход.
- Profile ID фиксирует verifier/manifest; toggle только admission. Старые statements продолжают разрешаться через исходный verifier. Новые символы устанавливаются как immutable static-call operator modules через Governor. Образец `ResolvedWithinWindowOperator` уже развёрнут; установка в registry требует governance vote.
- Membership: 3 начальных члена, по 1e18 голосов, self-delegation. Токен непередаваемый. Governor delay=1 block, period=8 blocks, quorum=50%, Timelock delay=5 seconds для local QA; bootstrap admin отозван. Увеличение supply T не даёт голосов.

## SDK и off-chain API

```js
import {createSDK, localWallet, parseEther} from './sdk/index.mjs';
const {config,abis} = await fetch('http://127.0.0.1:4173/api/config').then(r=>r.json());
const signer = await localWallet(config,0);
const sdk = createSDK(config,abis,signer);
await sdk.split(statementId,parseEther('100'));
await sdk.createPool(statementId,0,'0.8','0.01');
const pool=(await sdk.pools())[0];
await sdk.initialize(pool.address,pool.tokens.map(t=>parseEther(t===config.addresses.TrueToken?'100':'800')));
await sdk.swap(pool.address,tokenIn,tokenOut,parseEther('10'),100);
```

Все high-level writes SDK проверяют chain до отправки. Generic `sdk.send(() => contract.method(...))` проверяет сеть до создания transaction; raw `sdk.c()` даёт обычный ethers Contract для продвинутого использования. Quotes Balancer обязаны выполнять `eth_call` с `from=0`, тогда как sender передаётся в аргументе — SDK учитывает upstream `NotStaticCall` guard.

Web swap сохраняет показанные minimumAmountOut/deadline до любых approvals. Изменение формы или адреса требует новой котировки. SDK может принять эти же пределы шестым аргументом `sdk.swap(pool,tokenIn,tokenOut,amount,bps,{minimumAmountOut,deadline})`; без этого аргумента он получает одну котировку и фиксирует ограничения до approvals, не продлевая deadline во время разрешений.

Для LP доступны `sdk.quoteInitialize(pool,amounts,bps)`, `quoteJoin(pool,bpt,bps)` и `quoteExit(pool,bpt,bps)`. Они возвращают токены в порядке Vault, ожидаемые суммы и конкретные максимумы/минимумы. Подтверждение принимает эту же quote: `sdk.initialize(pool,amounts,q)`, `sdk.join(pool,bpt,bps,q)`, `sdk.exit(pool,bpt,bps,q)`. Проверяются pool, wallet, token order и BPT/input. Web отдельно показывает таблицу и кнопку подтверждения. Initial BPT рассчитывается оригинальным WeightedPool.computeInvariant с ROUND_DOWN минус оригинальный Vault minimum supply; допустимо для создаваемых здесь standard 18-decimal T/outcome pools без rate providers. После фактического resolve proportional exit остаётся доступен.

`sdk.revenueSnapshot(address)` читает один blockTag: aggregate fees в Vault, уже собранную creator-часть в ProtocolFeeController, реальные ERC-20 балансы каждой epoch Split, forwarded-средства AllocationController и claimable Warehouse. Pending creator рассчитывается по оригинальным ставкам Controller и тому же округлению protocol portion; это оценка будущего сбора на указанном блоке. Web «Доход по этапам» показывает эти суммы отдельно и в исходных токенах.

`sdk/community.mjs` содержит browser/Node клиент для публичного чтения и SIWE-private tools. Для social writes ему передаются config+signer; методы вызывают original EAS через `sdk/social.mjs`. Основной chain SDK также экспортирует `sdk.social`. Palomar/job/export остаются отдельными API методами.

Публичные API: `/api/config`, `/snapshot?account=…`, `/activity?to=…`, `/governance`, `/profiles/:address`, `/comments?statementId=…&sort=top|new`, `/blog/:address`, `/social/snapshot`, `/fixtures`, `/palomar`, `/packages`, `/export/:statementId`. Social reads восстанавливаются из EAS через RPC. Старые HTTP social writes возвращают410: session не может создавать профиль или голос. SIWE используется в private jobs/import/source tools (HttpOnly SameSite=Strict cookies, одноразовый nonce, domain+chain). Автор социальной записи — EAS attester прямой транзакции кошелька, имя не заменяет видимый адрес. Plaintext отрисовывается Svelte с экранированием.

Полные социальные тексты и все версии записываются в EAS.Attestation.data. Resolver задаёт onchain score и запрет self-vote; Top ранжирует корни по score и порядку создания, New — по порядку создания, ответы идут хронологически внутри веток. Локальный social cache не является authority; прежний `.state/community.json` сохранён только как явно обозначенный legacy архив. Подробности и проверенные лимиты — [ONCHAIN-SOCIAL.md](ONCHAIN-SOCIAL.md).

[SCENARIOS.md](SCENARIOS.md) связывает все 20 US с web/SDK/contracts. Две дополнительные функции: [EXTRA-FEATURES.md](EXTRA-FEATURES.md).

Статическая сверка против исходных пользовательских шагов, найденные пробелы и их текущий статус: [COVERAGE-AUDIT.md](COVERAGE-AUDIT.md). Наличие маршрута или кнопки не заменяет настоящий zk end-to-end smoke.

## Публичный Lean source и переносимый пакет

В Lean Lab и деталях базового утверждения есть редактор пакета. Автор сам передаёт отдельные Challenge и Solution; кнопка копирования текущего редактора явная. Если в скопированном тексте уже есть решение, оно также попадёт в Challenge: UI предлагает разделить его перед публикацией. Пакет включает `Challenge.lean`, `Solution.lean` (с import Challenge), объединённый `Runner.lean`, `lean-toolchain`, `lakefile.lean`, optional `lake-manifest.json`, `formalization.yaml`, `runner-input.json`, context и SHA-256 manifest. fflate создаёт обычный ZIP. Экспорт/предпросмотр не запускают Lean, не устанавливают dependencies и не создают job.

`communitySDK.preparePackage(input)` возвращает файлы/хеши; `downloadPackage(input)` — Uint8Array ZIP. Поля input: `challengeSource`, `solutionSource` (тело без import Challenge), `description`, optional `statementId`, `lakefile`, `lakeManifest`, `leanVersion`, `outcome`. Для известного профиля берётся его закреплённая версия Lean; иначе её надо указать. Default Lake project без внешних библиотек. Импорты Mathlib требуют пользовательского pinned Lake config/lock; библиотеки и toolchain в архив не включаются. Метаданные — шаблон, а не гарантия совместимости или регистрации в Palomar. Кнопка переноса в Lean Lab только загружает подготовленный текст, выполнение — отдельно.

Публикация выполняется **отдельно** через `communitySDK.publishSource(statementId,{...input,publish:true})` / `POST /api/statements/:id/publications`. API проверяет SIWE-адрес по реальному author в Registry; source должен быть передан в этом запросе. Public revision хранится в отдельной `.state/publications.json`, привязана к chain instance и содержит неизменённые файлы, SHA-256 и адрес автора. Повтор того же пакета не создаёт лишнюю ревизию; предел 32 ревизии на statement. Private jobs никогда не читаются модулем публикации. Смена текста сбрасывает checkbox согласия в UI.

Публичное чтение: `communitySDK.publications(id)`, `/api/statements/:id/publications`, ZIP `/api/statements/:id/publications/:publicationId/package.zip`. Detail показывает опубликованный Challenge, Solution, происхождение и обязательную границу: **source автора ещё не доказывает соответствие on-chain goal commitment**. SHA-256 файлов подтверждает их точность при скачивании; соответствие elaborated goal/environment проверяет неизменённый Lean/zk профиль. Пока автор ничего не опубликовал, UI честно сообщает об отсутствии исходника вместо попытки восстановить его из hash или чужого задания. Existing evidence JSON export дополнен только явно публичными ревизиями.

Wallet menu имеет Disconnect/logout. При injected accountsChanged/chainChanged старый signer, SIWE и owner-only данные на экране очищаются; автоматической подписи за новый адрес нет. Пользователь подключается заново. Серверная история и источники при этом сохраняются. Собственную job можно скачать JSON или восстановить в редактор без автоматического выполнения.

## Проверка

```sh
npm run test:deployment  # read-only v3 / contracts / ownership / API checks before first market
npm test                 # community invariants + LP stress arithmetic
npm run test:economics   # реальные CTF/Balancer/Permit2/Splits, только proof mocked; snapshot revert
npm run test:governance  # реальные Governor/Timelock/membership, snapshot revert
npm run test:api         # SIWE, profiles, real RPC, Palomar, native Lean acceptance/rejection
npm run test:privacy     # SIWE owner-only source/job reads; no zk prover
npm run build
```

Результаты последнего запуска в `.state/*-report.json`. Economic mock создаётся только из строки внутри `scripts/economics.mjs`, не является app deployment, не попадает в основной registry и отменяется через `evm_revert`. Настоящий криптографический smoke должен выполняться с `proof/runner.mjs` / реальными certificates; native check и economic tests сами по себе его не заменяют.

Lean jobs принадлежат SIWE-кошельку: очередь, неопубликованные исходники и результат доступны только владельцу. Экспорт публичного утверждения включает его chain commitments; личные job inputs добавляются только владельцу текущей сессии. `p-queue` запускает один worker, объединяет одинаковые активные запросы одного кошелька и ограничивает число зарезервированных задач: 16 всего, 4 на кошелёк, включая выполняемую. Отменённая ожидающая задача занимает место до прохода очереди, чтобы submit/cancel не раздувал очередь. Отмена через кнопку или `communitySDK.cancelJob(id)` / `POST /api/jobs/:id/cancel` ждёт очистки процессов для выполняемой задачи. Статус `cancelling` означает, что очистка ещё идёт.

Описанные ниже register/prove бюджеты относятся к сохранённым CLI/API, а не к активным кнопкам сайта. Веб отправляет только action=check. Внешний `proof/resource-guard.py` ограничивает весь worker tree: check 5 с, register 30 с, prove 120 с и 2 GiB physical footprint. На macOS это sampled watchdog с интервалом 0.1 с, а не kernel hard cap: между замерами возможен кратковременный выход за предел. Outer guard не берёт lock; общий lock принадлежит внутреннему runner. Потоки вычисления ограничены двумя. Отчёты guard сохраняются в `.state/proof-resource-reports/`. Сейчас `proof/execution-policy.local.json` оставляет дорогое proving выключенным; наличие очереди не включает его. После перезапуска сервера незавершённые jobs помечаются failed без автоматического повторного запуска; прежние source/result/history сохраняются.

UI различает принятие в очередь, выполнение, native check и готовый certificate. Текст «Сертификат доступен» появляется только при наличии `result.certificate`. `node --test test/proof-jobs.test.mjs` проверяет очередь и supervisor на лёгких dummy workers, не запуская Lean/zk proof.

Для воспроизводимого криптографического smoke без повторного запуска prover: `node scripts/real-smoke.mjs registration-result.json proof-result.json`. Оба файла — реальные JSON results runner со status=proved. Скрипт сначала проверяет оба сертификата через текущий on-chain bridge, затем создаёт опубликованный рынок, выполняет split/LP/trade/proof/exit/redemption/revenue. Требует ещё не зарегистрированный fixture в текущем registry; существующий рынок не перезаписывает. Отчёт с настоящими tx/block references сохраняется в `.state/real-smoke-report.json`.

Публичный export получает профиль самого statement из registry (включая старый выключенный admission-профиль), canonical registration/resolution транзакции и уже опубликованные в calldata certificates. Он не подставляет текущий active profile вместо исторического. Для производных утверждений export указывает оператор и operands; proof profile отсутствует. `sdk.statementEvidence(id)` даёт тот же воспроизводимый chain evidence. При вызове через сторонний multicall сохраняется внешний calldata и журнал, без выдуманного декодирования внутреннего certificate.

Финальный локальный deployment использует adapter v3, profile `0x190eddca14d88c2af77ea74b7ba257dcb7f9236c1cf7c8002890a992332c485e`, image `0x3ba46e4e43724929a3b160c49e75ea89d1ea529f357d8ba07cf55054cb3f2deb`. Все актуальные адреса находятся в `.state/deployment.json` и публичном `/api/config`. После redeploy main registry оставлен пустым до поступления настоящих Groth16 сертификатов; успешный deployment ещё не означает завершённый криптографический smoke.

### Просмотр governance lifecycle

`await sdk.governanceSnapshot(address)` возвращает единый снимок блока: actual Governor state, snapshot/deadline/ETA, все ordered targets/values/calldata, исторический quorum, голосовой вес и hasVoted адреса. Для Pending неизвестный исторический вес/кворум равен `null`. `actions` содержит результат eth_call от адреса кошелька, а не обещание неизменного результата будущей транзакции. Привязка payload проверяется Governor.hashProposal; ABI-декодирование выполняется только для известного target.

Экран «Управление» показывает этот снимок и обновляет его вместе с общими chain-данными. Автор может отменить Pending; повторный vote и исполнение до ETA заблокированы. Для quorum считаются за+воздержались; T не даёт голосов. Multi-call proposals через raw `sdk.c('Governor','VaultGovernor').propose(targets, values, calldatas, description)` поддерживаются просмотром и исполнением. Web composer пока создаёт один вызов с value0; кнопка execute также отправляет0 ETH, используя имеющийся баланс Timelock. Дополнительный msg.value требуется передать явно через raw Governor.execute в SDK.

Проверка без транзакций: `node --test test/governance-review.test.mjs`. Legacy `/api/governance` сохраняет прежние поля; новый экран пользуется `governanceSnapshot` напрямую и не зависит от обновления API процесса.

### Настоящий внешний сертификат и дополнительный perf05

В **Lean Lab → Готовые внешние сертификаты** можно загрузить настоящий `true-registration` из публичного CI или собственный `verified.json` до64KiB. Кнопка проверки выполняет только `eth_call`: точный profile/image, все128bytes journal, outcome, параметры SHA2Groth16, seal256/260bytes и canonical `abi.encode(seal,journal)` проверяются перед вызовом **оригинального** RISC Zero verifier. Поле `evmVerified` из JSON не принимается на веру. Затем отдельно проверяется immutable bridge соответствующего профиля и его фактический допуск в registry.

perf05 — отдельный Lean4.33.1/NanoDa профиль чистой логики без аксиом и Nat/String extensions. Его два закреплённых примера: `∀ P : Prop, P → P` (TRUE) и `∀ P : Prop, P` (опровержимый, NO). Он не переименовывает v3 и не заменяет опубликованный пример Nat.add_comm. Источник, точные goal/proof/foundation exports, descriptor и настоящий CI registration record скопированы внутрь `external-proofs/perf05/`; runtime не импортирует соседние приложения, `../../tools` или `docs`. Файл `profile.json` хранит оригинальные исторические CI metadata; текущая пригодность определяется свежей EVM проверкой и состоянием registry.

При ещё не включённом профиле кнопка **Подготовить governance proposal** заполняет обычную форму `setProfile(profileId, bridge, true, exactManifest)`. Пользователь проходит proposal/vote/queue/execute; import сам не вызывает governance. После исполнения нужно вернуться в Lean Lab и повторить проверку. Тогда кнопка **Заполнить новый рынок этим сертификатом** перенесёт точный goal/profile/certificate в форму создания. Регистрация CTF происходит отдельной транзакцией кнопки «Зарегистрировать в CTF». Registration outcome0 ещё не разрешает рынок.

Настоящий CI4 `true-proof` уже включён в standalone bundle: **Загрузить true-proof из CI** → **Проверить original EVM и профиль** → **Применить к выбранному утверждению** → отдельная отправка proof ончейн. Для NO используется канонический case `false-refutation` с outcome2; `false-proof` отклоняется. Настоящие `false-registration` и `false-refutation` также включены в bundle и доступны тем же импортом; всего подготовлены четыре реальных сертификата. Перед применением нужно выбрать существующее утверждение с точно совпадающими goal/profile. После EVM проверки импорт заполнит подтверждённый outcome1 или2 и certificate; кнопка отправки proof вызовет обычный `StatementRegistry.submitProof`. Новый proof нельзя применить к v3-рынку. Локальная native-проверка остаётся на v3 и недоступна для отдельного perf05. Кнопок генерации/заказа сертификатов на сайте нет; импорт ничего не вычисляет. Допущенный ранее, но выключенный для новых регистраций профиль сохраняет возможность разрешения своих существующих рынков.

SDK: `await sdk.verifyExternalCertificate(record, descriptor, candidateBridge)` возвращает pinned block/hash, originalVerifier, bridgeVerified, registered/profileEnabled и readyForRegistration/readyForResolution. `candidateBridge` помогает проверить развёрнутый adapter до governance; наличие такого adapter само не даёт admission. Публичный `GET /api/external-proofs` выдаёт только явный allowlist подготовленных публичных файлов и deployment matching текущему chainInstance. Он не читает private jobs/source/history. При появлении `external-proofs/perf05/true-proof.json` allowlist показывает его после обновления компонента без API restart; произвольные файлы не публикуются.

**Новая цель вне каталога:** загрузите `oncm-external-certificate-bundle-v1` с полным artifact, точными goal-export bytes и необязательным исходником. Generic-путь поддерживает pinned perf05 и v3 без списка разрешённых theorem hashes; использует тот же original EVM/bridge. SDK: `sdk.verifyExternalBundle(rawJSON, expectedDescriptor)`. Исходник и описание остаются provenance, `sourceGoalRelation:not-verified`; source SHA не доказывает его соответствие цели. Схема, ограничения2MiB/1MiB/512KiB, реальные примеры и проверки: [EXTERNAL-CERTIFICATES.md](EXTERNAL-CERTIFICATES.md). Четыре прежние curated кнопки сохранены.

На новой собственной Vault devnet `node scripts/prepare-external-profile.mjs` только проверяет/показывает план. Явный `--deploy` разворачивает отдельный immutable bridge существующим artifact и сохраняет точный proposal в `.state/additional-profiles/perf05.json`. Скрипт не вызывает registry/governance, не создаёт рынки, не меняет время, не майнит дополнительные блоки и не переключает default v3. Использовать его следует между короткими voting windows, поскольку обычный deployment также создаёт один блок. Старое deployment evidence другой цепи требует отдельного явного архивирования.

Импорт поддерживает только заявленную здесь семью raw RISC Zero Groth16 сертификатов. Каждый bridge разворачивает свой underlying verifier, поэтому их адреса могут различаться; SDK требует одинаковый runtime code hash с оригинальным verifier базового deployment, immutable image/profile и точный registry manifest. Governance в общем случае может допустить другой `IProofVerifier`, однако такой backend требует отдельного явно поддержанного descriptor/importer; текущий UI не подменяет его прежним verifier.

Асинхронный import связан с поколением ввода, выбранным descriptor и экземпляром SDK. Смена файла, текста, профиля, кошелька или уход с экрана отменяет право старого ответа менять форму, включая сценарий смены и возврата к прежнему значению. Кнопки применения используют descriptor именно выполненной проверки. Сертификат исхода дополнительно связан с statement ID, точными goal/profile/outcome и байтами certificate; смена выбора очищает его. Вставленный вручную ABI certificate получает такую привязку только при совпадении полного journal. Это проверка кодировки; pairing по-прежнему проверяет исходный EVM verifier. Старый local job сохраняется в истории и не перезаписывает изменённую форму. После наступления payout отправка больше не предлагается.

Лёгкие проверки: `node --test test/external-certificates.test.mjs test/certificate-selection.test.mjs`; экономический mock не используется основным import workflow. Существующий `real-smoke.mjs` рассчитан на исходный v3 fixture; его нельзя запускать с perf05 путём подмены default config. Первую perf05 регистрацию/LP/trade/resolution проверяем отдельно через веб с настоящими сертификатами.
