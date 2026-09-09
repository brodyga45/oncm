# Исследование сборки рынков, AMM и комиссий

Проверено 2026-09-09 по первичным исходникам и документации. Это проектные варианты, а не утверждение об уже собранной, протестированной или выбранной системе. Развёртываний и операций со средствами не выполнялось. Ссылки на `main`/`master` — исследовательские; перед реализацией нужен конкретный commit и проверка соответствующего deployment.

## Вывод: три целостные сборки

Общий фундамент всех трёх вариантов: **T как ERC-20 → Gnosis Conditional Tokens (CTF) → бинарные обеспеченные позиции → наш Lean/zk-резолвер**. После доказательства победившая позиция погашается в ранее заблокированные T. Предложенная расчётная единица — 1 победившая единица за 1 T; это требует принятия экономической модели полных наборов, а не следует автоматически из названия True.

| Сборка | Что переиспользуем | Реальный собственный участок | Когда предпочесть |
| --- | --- | --- | --- |
| **A. CTF + FPMM с узкой адаптацией** | CTF, формулу FPMM, LP-доли, split/merge внутри AMM, factory | Разделение торговой комиссии LP/протокол; остановку новых торгов после финального payout; соединение с реестром | Если важнее простой ввод T, один пул на условие и комиссии сразу в T |
| **B. CTF + ERC-20-обёртки + собственное развёртывание Uniswap V2** | CTF, Gnosis wrapper, Seer router, V2 factory/pair/router и SDK | Наш factory/реестр, связь с резолвером, учёт полученных protocol LP-токенов | Если важнее буквально не менять ядро AMM и использовать обычные ERC-20-пулы |
| **C. CTF + ERC-20-обёртки + Balancer V3** | CTF, wrapper/router, Vault, WeightedPool, pool creator fee, LP-учёт | Настройка конкретного creator-fee deployment; небольшой hook для проверки финальности, если требуется остановка торговли | Если важны расширяемые пулы без изменения AMM-математики и приемлема большая интеграционная поверхность |

**Предварительный порядок:** B — наиболее буквальное переиспользование готового кода; A — более короткий путь денег и взаимодействий, но с собственным diff AMM; C — хороший путь расширения, если проверены нужная сеть, версия factory и права creator fee. Выбор B не означает, что он экономически эквивалентен FPMM или автоматически лучше защищает LP.

Различаются не только библиотеки. В A AMM принимает T и держит исходы; в B/C обычно нужны отдельные пулы `P/T` и `¬P/T`, либо иной явно выбранный состав активов. В B/C ввод «только T» — дополнительная последовательность split и предоставления ликвидности, а не свойство обычного ERC-20-AMM.

## Общий расчётный фундамент

CTF позволяет разделить T на полный набор исходов, объединить набор обратно и после однократного `reportPayouts` погасить победителя. `conditionId` привязан к oracle, questionId и числу исходов; `positionId` дополнительно зависит от collateral и collection. Повторный payout запрещён. [ConditionalTokens.sol](https://github.com/gnosis/conditional-tokens-contracts/blob/master/contracts/ConditionalTokens.sol).

Предлагаемая схема для каждого самостоятельного бинарного рынка:

```text
questionId = commitment(statementId, settlementPolicyVersion)
conditionId = CTF.getConditionId(resolutionAdapter, questionId, 2)
parentCollectionId = 0
collateralToken = T
index sets = [1, 2]  // P, ¬P

split N T       -> N P + N ¬P
merge N P,N ¬P  -> N T
final P         -> payout [1,0]
final ¬P        -> payout [0,1]
```

Предлагаемые инварианты интеграции:

- `statementId` идентифицирует формальную задачу, а `marketId` — конкретное обеспеченное условие и правила расчёта. Нельзя склеивать балансы только по похожему названию теоремы.
- T имеет предсказуемые обычные ERC-20-переводы: в начальной сборке без rebasing и комиссии на перевод. Это снимает дополнительную проблему расхождения учтённого и фактически полученного collateral.
- Доказательство не выпускает T. Оно открывает доступ к escrow уже существующих T.
- Положительная и отрицательная позиции одного условия образуют полный набор. Позиция `¬P` не становится автоматически токеном отдельно созданного рынка на другую Lean-цель.
- Погашение работает без ликвидности AMM. Неликвидный рынок не мешает владельцу победившей позиции предъявить её CTF.
- Резолв и фиксация CTF payout должны быть атомарны. Изменение metadata или будущего verifier не меняет уже выплаченный результат.
- Протокол не обходит список держателей при резолве. Балансы в кошельках и пулах остаются позициями до явного redeem/вывода.

## A. Нативный FPMM: минимальное число соединений

### Проверенная база

В исходном Gnosis FPMM `addFunding` и `buy` принимают collateral, `sell` возвращает collateral. LP получают ERC-20-доли. `removeFunding` возвращает долю запасов исходов и комиссии, а не гарантированную сумму T. При несбалансированном добавлении часть исходов может вернуться LP. Комиссии учитываются для LP. `buy`/`sell` не проверяют, что CTF ещё не получил payout. [FixedProductMarketMaker.sol](https://github.com/gnosis/conditional-tokens-market-makers/blob/master/contracts/FixedProductMarketMaker.sol).

Готовая фабрика есть, включая создание с предсказуемым адресом. Её можно использовать как основу нашего permissionless создания пулов. [FPMMDeterministicFactory.sol](https://github.com/gnosis/conditional-tokens-market-makers/blob/master/contracts/FPMMDeterministicFactory.sol).

### Что именно предлагается адаптировать

1. **Встроенное разделение fee.** Оставить расчёт общей комиссии и торговую математику; часть комиссии учитывать LP, часть — отдельным обязательством перед `RevenueCollector`. Собственная часть не должна списываться из collateral, обеспечивающего исходы.
2. **Проверка финальности внутри AMM.** Перед `buy`, `sell`, новым `addFunding` проверять отсутствие финального payout/установленной остановки. Вывод существующей LP-позиции и получение начисленных комиссий остаются доступны.
3. **Factory-политика.** Наш factory связывает пул с разрешёнными T, CTF, условием и параметрами комиссии. Произвольный созданный снаружи пул не считается автоматически официальным.

Это **fork с ограниченной областью**, а не «обёртка без изменения AMM». У Gnosis часть рабочих функций `private`/нерасширяемая; нельзя обещать, что достаточно наследования Solidity. Port на Solidity 0.8 — отдельный более широкий diff и не нужен для простой ABI-интеграции с новыми контрактами.

Предпочтительная форма дохода здесь — T. Момент начисления: на каждом обмене фиксируется протокольное обязательство; вывод этого обязательства не должен быть связан с действиями LP. Для большого числа выгодополучателей не делаем множество переводов при каждом swap: торговля пополняет один collector, распределение выполняется отдельно по правилам долей.

### Нашёлся ли готовый treasury fork

Да. В опубликованном для аудита **Ignite Market** есть FPMM с `treasuryPercent`: часть fee переводится treasury при `withdrawFees`. Но тот же snapshot запрещает LP вывод до резолва, ограничивает сделки и использует торговый cutoff по времени/порогу финансирования. Это неподходящая замена для бессрочных математических задач и свободного выхода LP без изменения политики. [Исходник Ignite FPMM](https://github.com/hackenproof-public/ignite-market-smart-contracts/blob/main/contracts/FPMM/FixedProductMarketMaker.sol).

Для него опубликован отчёт о проблеме приёма произвольных ERC-1155-пожертвований, меняющих резервы. Исправленный production commit и его соответствие всем требованиям в этом исследовании не подтверждены. Поэтому это конкретный референс готовой комиссии, но не рекомендованная зависимость «взять целиком». [Отчёт аудитора](https://hackenproof.com/reports/IGNITEAC-106).

Важно: найденный файл Ignite помечен MIT, исходный Gnosis AMM — LGPL-3.0. Для заимствования этого производного кода нужно отдельно установить происхождение и применимые условия; метку чужого fork не считаем достаточной заменой лицензии исходной базы.

## B. Seer-style токены и router + Uniswap V2

### Почему Seer полезен конкретно

Seer уже демонстрирует композицию **CTF → ERC-20 outcome wrapper → обычный DEX**. Это более близкий готовый образец, чем отдельный tutorial по AMM. В публичном monorepo есть contracts, web, тесты, deploy scripts и адреса развёртываний. [Seer contracts](https://github.com/seer-pm/demo/tree/main/contracts).

Полезные части:

| Компонент Seer | Переиспользование у нас |
| --- | --- |
| `Router.sol` | Готовые `splitPosition`, `mergePositions`, `redeemPositions` для ERC-20-представлений исходов |
| `Market` getters | Совместимая форма данных для router: condition, parent collection, wrapped outcome и metadata bytes |
| `deployERC20Positions` в factory | Образец детерминированного создания wrappers и их привязки к позициям |
| Web и отображение LP | Основа экранов рынка, портфеля, split/merge/redeem и DEX-взаимодействий; интеграцию нашего T и резолвера всё равно делаем |

Router реально разворачивает действия через unwrap/wrap и CTF; погашение переводит пользователю фактическую разницу collateral-баланса. [Seer Router.sol](https://github.com/seer-pm/demo/blob/main/contracts/src/Router.sol).

**Что нельзя взять настройкой:** штатный `MarketFactory` связан с Reality.eth/RealityProxy и добавляет `INVALID` к исходам; questionId формируется из Reality-параметров. Наше proof-only бинарное условие требует упрощённого factory/market descriptor или адаптации этой части. Замена адреса oracle в существующем deployment сама по себе недостаточна. [Seer MarketFactory.sol](https://github.com/seer-pm/demo/blob/main/contracts/src/MarketFactory.sol), [Market.sol](https://github.com/seer-pm/demo/blob/main/contracts/src/Market.sol).

Текущий документированный торговый путь Seer использует Swapr/Algebra; нельзя выдавать его за готовый V2 UI без изменений. Это подтверждает жизнеспособность wrapper-композиции, но не право нашего протокола получать Swapr community fee. [Seer subgraph integration](https://seer-3.gitbook.io/seer-documentation/developers/subgraph/query-examples).

### Wrapper-контракт и идентичность

Gnosis `Wrapped1155Factory` выпускает ERC-20 при получении ERC-1155 и сжигает его при unwrap. Адрес wrapper зависит также от metadata bytes; для одного underlying можно получить разные ERC-20-адреса с разными metadata. Получатель mint — ERC-1155 `operator`, поэтому router обязан явно вернуть токены конечному пользователю. [Wrapped1155Factory.sol](https://github.com/gnosis/1155-to-20/blob/master/contracts/Wrapped1155Factory.sol).

Предлагаемое glue: реестр задаёт ровно один канонический wrapper и неизменяемые metadata bytes для каждого официального `positionId`. SDK берёт адрес из реестра, а не ищет токен по символу. Смена красивого описания на сайте не создаёт другой торговый токен.

### Как получаем комиссию из V2

У исходного V2 `feeTo` управляется `feeToSetter` всей factory. При обычном создании пары на чужой factory эти права нам не передаются. Для независимого дохода используем **собственное развёртывание готовых V2-контрактов** с `feeTo = RevenueCollector`, `feeToSetter =` выбранный контроллер governance. [UniswapV2Factory.sol](https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Factory.sol).

Вместо перечисления T при каждом swap V2 выдаёт protocol LP-токены по росту `sqrt(k)` при последующем mint/burn. Его штатный swap fee — 0,30%; включённая доля протокола соответствует 1/6 fee, то есть 0,05% объёма в описанной модели. Это не выбранные ставки нашего продукта. [UniswapV2Pair.sol](https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol), [V2 whitepaper, раздел 2.4](https://docs.uniswap.org/whitepaper.pdf).

При выборе неизменённого V2 эти формулы принимаются вместе с кодом; они не становятся произвольно настраиваемыми голосованием. `feeTo` позволяет включить/выключить protocol fee и сменить получателя, но не установить любую LP/protocol ставку. Другая ставка требует подходящего готового fork/AMM либо новой версии с изменением кода.

Решение внутри B:

- **Самый короткий путь:** распределять выгодополучателям protocol LP-токены как доход соответствующего актива. Требуется их согласие с такой формой выплат.
- **Доход в underlying:** collector сжигает LP и получает T + outcome ERC-20. Учёт ведётся отдельно по каждому активу/эпохе.
- **Всегда только T:** добавляется реализация конвертации outcome в T, лимиты цены/проскальзывания и политика для нерезолвленных и проигравших активов. Для последних после резолва доход в T равен нулю. Гарантировать фиксированную оценку накопленного LP в T нельзя.

Вознаграждение становится фактическим активом collector позже сделки. Поэтому таблица выгодополучателей должна явно определять, к какой эпохе относятся ещё не выпущенные protocol LP. Смена долей без такой границы перераспределит часть старого экономического дохода новым получателям. Это не решается одним стандартным splitter.

### LP и торговля

Обычный V2 router уже даёт добавление/удаление ликвидности и swap с deadline/min amounts; собственную AMM-формулу писать не требуется. [UniswapV2Router02.sol](https://github.com/Uniswap/v2-periphery/blob/master/contracts/UniswapV2Router02.sol).

Предлагаемый старт без сложного zap: пользователь сначала разделяет часть T в P/¬P, затем предоставляет P+T и/или ¬P+T выбранным пулам. SDK может подготовить последовательность, а UI показать остатки до подписи. Для однокнопочного атомарного варианта нужен composition router либо поддерживаемый wallet batch; стандартный V2 router сам CTF не понимает.

После резолва стандартный V2 не закрывает пул. LP снимает текущие T+outcome, unwrap и redeem выполняются отдельно или composer-ом. Запасы могут измениться до вывода из-за торговли. Если нужен строгий запрет swap после финальности, **немодифицированный V2 больше не закрывает требование**: потребуется изменение pair, либо выбор AMM с hook из C. Пауза кнопки или нашего router не закрывает прямой вызов пары.

## C. Balancer V3 creator fee и hook

Текущий upstream `ProtocolFeeController` имеет отдельный учёт creator revenue по каждому pool token, сбор aggregate fees, изменение процента зарегистрированным `poolCreator` и вывод его дохода. Доля creator применяется к остатку после доли Balancer; это три разные части — LP, Balancer, наш collector. [ProtocolFeeController.sol](https://github.com/balancer/balancer-v3-monorepo/blob/main/pkg/vault/contracts/ProtocolFeeController.sol).

Предлагаемая конфигурация:

```text
CTF + canonical outcome wrappers
WeightedPool(P,T) and/or WeightedPool(¬P,T)
poolCreator = RevenueCollector/controller
pool hook = FinalityHook (если выбрана остановка после резолва)
LP uses normal Balancer Router + BPT
```

**Версионная зависимость существенна.** Текущий исходник WeightedPoolFactory принимает role accounts без прежнего явного запрета ненулевого creator, но ранее развёрнутые версии содержали `StandardPoolWithCreator`. Кроме того, существовали отдельные permissioned процедуры настройки creator fees. Поэтому нельзя заменить проверку deployment ссылкой на актуальный `main`. [Текущая factory](https://github.com/balancer/balancer-v3-monorepo/blob/main/pkg/pool-weighted/contracts/WeightedPoolFactory.sol), [пример более раннего deployment](https://basescan.org/address/0x5cf4928a3205728bd12830e1840f7db85c62a4b9#code), [Balancer governance BIP-915](https://forum.balancer.fi/t/bip-915-grant-pool-creator-fee-permissions-to-omni-multisig/6987).

Проверка до выбора C: сеть и task из официального registry → bytecode/ABI factory → регистрация creator в Vault → actual fee controller → кто может задать процент и вывести активы → действительные fee parameters. При несовместимой factory можно развёртывать адаптированную factory поверх готового Vault, но это уже дополнительный glue, который нужно назвать. [Официальный список Balancer deployments](https://github.com/balancer/balancer-deployments).

Hook позволяет прикрепить политику к самому пулу. Предлагаемый `FinalityHook` проверяет статус нашего условия в `onBeforeSwap`; при финальном payout запрещает swap, не препятствуя пропорциональному выходу LP. Проверяет также канонические токены/условие при регистрации. Модель hooks и их связь с Vault уже предоставлены платформой; специфику mathematical finality пишем сами. [Balancer scaffold и требования hooks](https://github.com/balancer/scaffold-balancer-v3).

Доход C по умолчанию состоит из активов пула, не только T. Если протокол обещает только T, требуется та же конверсионная политика, что в B. В BPT-выводе и при резолве учитываются текущие резервы, а не гарантированный возврат первоначального взноса.

**Резервный кандидат той же архитектурной категории:** PancakeSwap Infinity имеет открытые core и periphery, hooks и готовые примеры hook fees. Это позволяет реализовать fee и stop без fork AMM-математики. Но официальный Dynamic Fee Hook регулирует LP fee и сам по себе не доказывает получение дохода именно нашими выгодополучателями. Нужны конкретный hook/получатель и его интерфейсы; пример комиссии при снятии ликвидности не равен готовой торговой protocol fee. Поэтому Infinity пока не вытесняет проверку C и не объявляется готовым решением всех требований. [Infinity core](https://github.com/pancakeswap/infinity-core), [пример fee hook](https://github.com/pancakeswap/pancake-developer/blob/master/docs/pages/contracts/infinity/guides/hook-examples/taking-fee-via-hook.mdx), [Dynamic Fee Hook](https://docs.pancakeswap.finance/trade/pancakeswap-infinity/hooks/dynamic-fee-hook).

## Почему LMSR и чужой Swapr deployment не выбраны основой

**Gnosis LMSR:** владелец получает комиссии в collateral и управляет funding, pause, close. `changeFunding` доступен владельцу в paused-состоянии; close переводит ему остатки исходов. Это пригодно для спонсируемого рынка с одним контроллером капитала. Для свободного множества LP с независимым входом и выходом придётся добавить vault, оценки долей, права на капитал и координацию pause — экономический модуль крупнее простого splitter. [MarketMaker.sol](https://github.com/gnosis/conditional-tokens-market-makers/blob/master/contracts/MarketMaker.sol). Поэтому LMSR — вариант при изменении модели LP, а не наиболее простой fit текущей.

**Swapr:** Seer подтверждает использование Swapr/Algebra как готового DEX; старый Swapr core при этом является отдельной V2-линейкой. Нельзя смешивать API/лицензию старого V2 и нового Algebra. Legacy core опубликован как fork V2 под AGPL-3.0. [Swapr core](https://github.com/SwaprHQ/swapr-core). В Algebra community fee есть, но принадлежность получателя задаётся соответствующим протоколом/deployment. Наличие открытой функции создания пула не даёт создателю права на эти доходы. [Algebra fee accounting](https://docs.algebra.finance/algebra-integral-documentation/algebra-integral-technical-reference/core-logic/swap-calculation). B поэтому описан на конкретном проверенном V2, а не на неопределённом «любом Swapr».

## Обход комиссии и границы протокола

Предлагаемая формулировка продуктовой гарантии: **сбор с обменов в официальных пулах протокола**. Если токены свободно переводимы, третьи лица могут создать собственный пул или совершить OTC-сделку. Ни fee внутри нашего AMM, ни factory, ни hook не дают монополию на все обмены этих активов.

Разделяем:

1. Прямой вызов официального пула обходит только frontend/router. Комиссия в ядре выбранного пула/его обязательном hook сохраняется.
2. Создание другого пула обходит нашу торговую площадку. Для обычных свободных токенов это ожидаемая возможность.
3. Сбор на mint/redeem/transfer имеет другую базу и экономику. Он не назначается автоматически ради невозможности обхода; transfer-tax дополнительно ухудшает совместимость готового стека.

## Финальность и риск LP около доказательства

**Твёрдая выплата держателю и сохранность стоимости LP — разные свойства.** CTF гарантирует расчёт в рамках обеспеченных позиций; AMM может неблагоприятно изменить запасы до вывода LP. Это не означает, что CTF потерял обеспечение или выплачивает победителям из средств чужих победителей.

После финального payout проигравшие позиции можно получать через `split T → redeem winner → оставить loser`, возвращая использованный T. Если пул продолжает принимать эти позиции по ненулевой цене, арбитраж перемещает из него полезные активы. Для нативного FPMM это запасы победителя; для `loser/T` обычного DEX — T. Возможность следует из совместной семантики CTF и открытого AMM, а не из нарушения их инвариантов. [CTF split/redeem](https://github.com/gnosis/conditional-tokens-contracts/blob/master/contracts/ConditionalTokens.sol), [FPMM sell](https://github.com/gnosis/conditional-tokens-market-makers/blob/master/contracts/FixedProductMarketMaker.sol).

Небольшая локальная проверка арифметики выполнена на Decimal, без Solidity/деплоя, комиссии и gas исключены. Для исходных резервов FPMM 100 P/100 ¬P, при P=True, вход `q` проигравших позиций и возврат `r T` удовлетворяют:

```text
(100-r) * (100+q-r) = 10000
q=100      -> r=38.196601 T, осталось 61.803399 P
q=1000000  -> r=99.990000 T, осталось 0.010000 P
```

Инвариант произведения сохраняется в обоих расчётах. Это иллюстрация терминального арбитража; не доказательство exploit на выбранном deployment и не оценка доступного капитала/газовой стоимости. Фактические комиссии меняют суммы.

Предлагаемая остановка после payout устраняет **только дальнейшие сделки после ончейн-финальности**. Она не устраняет adverse selection: знающий доказательство участник может сначала выгодно купить позицию, а затем предъявить proof, в том числе в одной последовательности транзакционных вызовов. Публичный mempool также раскрывает действия. Нельзя обещать LP безрисковый возврат первоначального T или защиту от всех информированных трейдеров.

Выбор LP-политики для документации:

- Принимаем непрерывную торговлю и её риски, явно показываем LP возможную потерю капитала.
- Добавляем запрет новых сделок после финальности в A/C и обеспечиваем самостоятельный вывод, не называя это полной защитой LP.
- Если нужен другой уровень защиты перед неожиданным доказательством, отдельно исследуем торговые эпохи/закрытие до раскрытия/аукционные механизмы. Это уже изменение продукта, не скрытая настройка готового FPMM/V2.

Не решаем проблему задержкой или отменой доказательств только ради цены в пуле без отдельного согласования.

## Сквозные шаги web/SDK

| Сценарий | Поверхность | A внутри | B/C внутри | Результат и важная ошибка |
| --- | --- | --- | --- | --- |
| Создать и профинансировать | Автор выбирает theorem, T и начальное распределение | Реестр → CTF condition → factory → addFunding(T) | Реестр → condition → wrappers → split → пулы с T | Получены marketId, адреса и LP; откат при несовпадении statement/policy или недостаточных средствах |
| Купить P | Ввести T, увидеть min received, подписать | approve T → FPMM.buy | approve T → DEX router swap T/P | Показывается реальный ERC-1155/20 баланс по receipt; stale quote не превращается в обещанную цену |
| Продать P | Ввести количество/минимум T | ERC-1155 operator approval → FPMM.sell | approve P → DEX swap P/T | Выход ограничен ликвидностью и min amount |
| LP входит через SDK | `prepareAddLiquidity` → список tx → подпись кошелька | T → FPMM LP и возможные возвращённые исходы | T/full set и pair assets → LP/BPT | SDK показывает вложенные активы и остатки; LP не обязан использовать сайт |
| LP выходит до resolve | Нажать «Вывести» | removeFunding → исходы; min(P,¬P) можно merge в T | removeLiquidity → T/outcome; при наличии полного набора merge | Остаточная открытая позиция явно показана, автоматической полной продажи не обещаем |
| Доказательство принято | Любой отправляет certificate | Adapter атомарно фиксирует payout, AMM gate видит финальность | Adapter фиксирует payout; C hook запрещает дальнейшие swap при выбранной политике, B обычный V2 не запрещает | Выплата определяется proof policy, цена AMM не участвует |
| Держатель получает T | «Погасить» | CTF.redeemPositions | Seer-style router unwrap → CTF.redeem → T | Победитель получает обеспечение, проигравшая позиция нулевую выплату |
| LP выходит после resolve | «Вывести и погасить» | LP burn → исходы → CTF redeem + LP fees | LP/BPT exit → T+outcome → unwrap/redeem | Расчёт из фактически оставшихся запасов |
| Выгодополучатель получает доход | «Забрать комиссии» | T из collector по его доле | LP/underlying из collector; T только после выбранной конвертации | LP-комиссия и протокольный доход учитываются раздельно |
| Изменить доли | Предложение и подписи уменьшаемых адресов | Начисления T разграничены по эпохе | Нужна дополнительно граница нереализованного LP/underlying дохода | Правила AMM не заменяют согласие затронутых адресов |

Вход кошельком не выдаёт разрешение на расходование токенов. Прочие действия в SDK опираются на те же контрактные проверки, что и web. Для A `sell` штатно задаётся целевой суммой T, поэтому UX «продать N P» потребует расчёта подходящего returnAmount, целочисленного округления и simulation.

## Таблица реального glue

| Модуль | A | B | C | От чего зависит |
| --- | --- | --- | --- | --- |
| Statement/market registry | Собственный во всех | Собственный | Собственный | Формальная идентичность, версии резолва |
| ResolutionAdapter → CTF | Общий собственный | Общий | Общий | zk verifier и semantics registry |
| CTF escrow/mint/redeem | Без изменений | Без изменений | Без изменений | Полные наборы, T |
| Outcome ERC-20 wrapper | Не обязателен | Gnosis готовый | Gnosis готовый | Канонические metadata/address |
| Split/merge/redeem router | Небольшой batch для UX, не для корректности | Seer можно переиспользовать через совместимые getters | Тот же | Layout market descriptor |
| AMM trading/LP | Gnosis + ограниченный diff | Готовый V2 deployment | Готовые Vault/WeightedPool | Модель fee и жизненный цикл |
| Fee collector | T accounting | Multiasset/LP accounting | Multiasset accounting | Форма дохода и смена долей |
| Остановка после resolve | В AMM diff | Отсутствует у исходного V2 | Небольшой hook | Нужна ли продуктовая гарантия stop |
| «Всё одной кнопкой» для LP | Composer remove+merge/redeem | Composer split+DEX/exit+redeem | Composer с Balancer Router | Требование атомарности и wallet batch |
| SDK | Типизированные вызовы поверх ABI | CTF/router + DEX SDK | CTF/router + Balancer SDK | Выбранная сеть/контракты |
| Frontend | Собственный domain UI, механики Omen/Seer как reference | Seer ближе всего, DEX adapter сменить | Seer domain UI + Balancer LP UI | Не переносить Reality-resolution формы как рабочие |

Пример предлагаемого SDK-контракта, без выбора ABI собственного composer:

```ts
type TxPlan = {
  chainId: number;
  account: `0x${string}`;
  marketId: `0x${string}`;
  snapshotBlock: bigint;
  approvals: PreparedTransaction[];
  actions: PreparedTransaction[];
  expectedAssetsIn: AssetAmount[];
  minAssetsOut: AssetAmount[];
  residualPositions: AssetAmount[];
};
// prepare -> simulate -> пользователь подписывает -> receipt -> сверка балансов
// SDK не получает private key и не принимает решение о payout.
```

## Готовность и лицензии

| Зависимость | Установлено | До выбора production версии |
| --- | --- | --- |
| Gnosis CTF / AMM | LGPL-3.0; исследованные contracts Solidity 0.5.x; есть тесты и история публичного использования | Pin commit/compiler; не путать аудит исходника с аудитом нашего diff |
| Gnosis 1155-to-20 | LGPL-3.0-or-later; отдельный wrapper и опубликованный AuditReport | Сопоставить выбранный bytecode с проверенной версией, проверить OZ layout |
| Seer core glue | `MarketFactory`, `Market`, `Router` помечены MIT, Solidity 0.8.20 | Pin commit; тесты новых proof-only условий; зависимости имеют собственные лицензии |
| Uniswap V2 core/periphery | Core GPL-3.0, periphery GPL-3.0; готовая factory/pair/router | Выбрать собственный deployment; проверить feeTo и feeToSetter, compiler/bytecode |
| Swapr legacy | AGPL-3.0; отдельная V2-линейка | Не переносить её лицензию/ABI на Algebra-линейку |
| Balancer V3 | Исследованные WeightedPoolFactory/ProtocolFeeController GPL-3.0-or-later, Solidity ^0.8.24 | Сеть должна поддерживать требуемую EVM; сверить deployment task, controller, creator fee и hook |
| Pancake Infinity | Core GPL-2.0; docs/source hooks доступны | Конкретный hook, его лицензия и deploy/version; новый fee hook всё равно свой код |

Источники лицензий/готовности: [Gnosis AMM](https://github.com/gnosis/conditional-tokens-market-makers), [CTF](https://github.com/gnosis/conditional-tokens-contracts), [wrapper и AuditReport](https://github.com/gnosis/1155-to-20), [Seer](https://github.com/seer-pm/demo), [V2 core license](https://github.com/Uniswap/v2-core/blob/master/LICENSE), [V2 periphery](https://github.com/Uniswap/v2-periphery), [Balancer V3](https://github.com/balancer/balancer-v3-monorepo), [Infinity core](https://github.com/pancakeswap/infinity-core).

## Проверки, которые закрывают выбор

1. Зафиксировать полные наборы и коэффициент погашения в T. Без этого выбор CTF — только гипотеза.
2. Выбрать форму протокольного дохода: только T или LP/несколько активов. Это основной водораздел A и B/C.
3. Выбрать stop после payout и явно принять риск сделки до доказательства. Обычный V2 не предоставляет такой stop.
4. Собрать локальный интеграционный тест ровно выбранного пути: create → funding двумя LP → buy/sell → вывод первого LP → proof adapter mock с payout → redeem → вывод второго LP → fee claim → изменение beneficiary epoch. Проверить прямой AMM-вызов и устаревший quote.
5. Для B/C дополнительно проверить split/wrap/unwrap conservation, metadata identity, цену и остатки при one-sided LP; для C — creator fee permissions и невозможность обойти обязательный hook прямым swap.
6. Проверить повторный payout, сохранение escrow, отсутствие зависимости redeem от frontend/indexer/AMM и то, что migration не переписывает ранее совершённые выплаты.

Локальная арифметическая иллюстрация уже выполнена; сборка Solidity, fork-тесты реального deployment и аудит интеграции ещё не выполнялись. Ни один из этих кандидатов не означает «вся система готова без собственной работы»: её необходимая специфика — формальная цель, proof policy, settlement adapter и правило согласий выгодополучателей.
