# US023 — ручная приёмка Vault V2

План дальнейшей приёмки с одним завершённым шагом: первоначальная эмиссия1000T прошла реальный браузерный Governor/Timelock lifecycle доExecute307, см. [полные receipts и historical balances](../evidence/monetary-policy/initial-mint-281-307.json). Повторная начальная эмиссия не нужна. Остальные строки ниже остаются планом, пока для них не приложено отдельное браузерное evidence. Используются только V2 из выбранного deployment descriptor на chain31373 и собственный кошелёк. Изолированные результаты приведены отдельно. Старые отклонённые выплаты казны этот маршрут не повторяет.

## Минимальные исходные данные

Взять адреса T, RewardBudget, registry, coordinator, allocation, Vault, Router и actual Timelock из **выбранного V2 descriptor**, а не переписывать legacy addresses. В V2 исходный totalSupply был0; послеExecute307 он равен1000T, получатель — локальный Account0 (Alice). Существующие MEMBER/Governor остаются общими. Alice может быть LP и трейдером; второй MEMBER нужен для реального кворума. ProgramCount и admission профиля проверять на текущем блоке. Отдельный перевод казны или faucet не нужен.

Для economic fixture нужен один открытый настоящий V2 Lean-рынок и его YES/T pool. Если их нет: через обычный Governor допустить подготовленный immutable perf05 bridge, затем внешний настоящий registration certificate → Verify → Register. Не вычислять proof и не разрешать рынок, пока проверяется торговля. Из уже выпущенных1000T можно Split30T и инициализировать50/50 pool с20T+20YES; остатка достаточно для небольших сделок. Сохранить точные statementID/pool/hook/token addresses.

## Общий lifecycle каждого governance решения

**Управление → Эмиссия и программы наград**, подготовить действие. В **Предложить изменение** прочитать весь упорядоченный batch: targets, zero values, calldata, raw amounts, текущий block и hypothetical supply. Затем **Создать proposal ↗** → дождаться Active → MEMBER-кошельками **За** до фактического quorum → после voting deadline **Поставить в Timelock** → после ETA **Исполнить ↗**.

Использовать показанные snapshot/deadline/ETA, не фиксированные ожидания. `+1 local block` позволяет продвигаться кActive; `+10 local blocks` до голосования может перескочить весь8-block voting period. Помощники меняют локальные блоки/время на1 или10 секунд. Для перехода междуearning/claim окнами разрешено отдельное управление часами локального тестового узла, описанное в приложении; это не финансовое действие в браузере. Начало программы должно оставаться будущим **при исполнении**, поэтому выбрать проверенные local/UTC/Unix даты с запасом на реальный lifecycle. Если время прошло — новая подготовка/программа, без принудительного исполнения.

## Последовательность и наблюдаемый результат

| Шаг | Обычные действия в вебе | Что подтвердить по реальным блокам |
|---|---|---|
| 1. Первые T — browser passed | Выполнено: Alice,1000T, обычный Governor/Timelock. Повторять не нужно | Execute307: supply0→1000T, Transfer(zero→Alice,1000T); MEMBER balance/voting weight не увеличились. [Evidence](../evidence/monetary-policy/initial-mint-281-307.json). |
| 2. Fee policy | Выбрать **Global protocol swap share**, например10%; **Проверить ставку и подготовить решение**, governance. Отдельно на созданном пуле можно выбрать общую swap fee1% и creator share25% | Глобальный setter меняет default. Для уже созданного pool нужен явный permissionless `updateProtocolSwapFeePercentage(pool)`; без него нельзя объявлять новую глобальную ставку применённой к старому pool. См. состояние affordance ниже. В RevenuePreview должны читаться фактические pool rates. |
| 3. Trade budget | Ввести pool; **Найти ончейн-счётчик этого пула**. Выбрать metric0, будущие начало/конец/claim-deadline с видимой local+UTC+Unix проверкой; remainder=actualTimelock; budget3T. **Проверить выпуск и подготовить решение** → governance | Ровно3 вызова: mint(RewardBudget,3T), createProgram(expectedId,...), configureProgram(id,pool,0). ПослеExecute supply+3T, reserved+3T; meter/pool/window/budget совпадают. Получатель mint не LP/трейдер. |
| 4. Fee-weighted budget | Аналогично создать следующую программу с metric1 и budget1T, каждый раз заново получать actual programCount | Вес только EXACT_IN при входе T. Sells и EXACT_OUT не получают этот вес. Это распределение фиксированного бюджета, не обещанный процент cashback/компенсация ETH-газа. |
| 5. LP budget | Выбрать **Voluntary BPT lock**, тот же официальный pool, budget2T и собственный будущий период; пройти governance | Новая программа с meter=BptLockMeter, exact programPool и reserved+2T. В совокупности supply после трёх illustrative funding batches1006T при отсутствии другой эмиссии. |
| 6. Lock | В активном LP периоде: `Внести BPT в программу`=1; **Заблокировать BPT программы N** | Approval разрешает реальному meter; затем1BPT в custody, deposits[Alice]=1BPT, weight=1e18*(end−timestamp фактическогоstake блока). **Вернуть BPT** доend недоступно. Обычные незаблокированные LP доступны для выхода. |
| 7. Торговый вес | В **Капитал** получить quote и купить YES на1T, затем продать небольшой реальный YES amount (например0.1), с обычными approvals/ограничениями | Actual Swap и SwapMeasured. Metric0 buy+1e18, sell+фактический Toutput. При swap fee1% metric1 за покупку+1e16; продажа не добавляет metric1. **Обновить денежную политику** показывает вес этого кошелька; чужой кошелёк без участия —0. Quote сам не начисляет вес. |
| 8. Доход выгодополучателей | **Доход → Обновить суммы**, затем **Собрать protocol + creator fees → Split**; распределить каждый ненулевой T/YES asset через **Распределить ...**; обычный beneficiary **Получить ↗** | Pending/Controller→точный active epoch Split→Warehouse→владелец. Оба fee потока идут в Split; DAO имеет только текущую долю. Доход остаётся в T/YES, не BPT. RewardBudget/reserved не расходуются collect/distribute. При protocol10%+creator25% aggregate=32.5% от swap fee, остаток LP; учитывать original rounding/dust. |
| 9. Срок и claims | Послеend **Обновить денежную политику**; **Вернуть BPT программы N**, отдельно **Получить награду программы N** для каждой заработанной программы | BPT возвращается даже если pool потом resolved. Reward=floor(budget*ownWeight/totalWeight), totalSupply от claim не меняется, reserved уменьшается на выплату. Повторный claim недоступен; BPT withdrawal не является claim. |
| 10. Остаток | ПослеclaimDeadline **Проверить закрытие программы N** → прочитать точный остаток/получателя → **Закрыть программу и вернуть остаток** | Остаток budget−paid идёт только в заранее записанный remainderRecipient; закрытие не выпускает T и не забирает BPT principal. Нулевая или уже полностью выплаченная программа допустима. SDK/UI готовы; фактический браузерный шаг остаётся pending. |

Проверки ставок и выплаты должны фиксировать реальные значения; таблица приводит малые тестовые примеры, а не прогноз цены, ликвидности или доходности. Не создавать искусственный доход donation/faucet.

## Текущие affordance gates

- Mint, ordered program funding, discovery реального hook, fee setters, LP stake/withdraw и reward claim уже имеют SDK+web. UI reads — numbered block; подготовка и wallet/context имеют stale guards.
- `RewardBudget.close` имеет отдельный permissionless SDK/UI шаг с eth_call, фиксированным получателем, остатком и повторной проверкой перед отправкой. Не подменять его лишним Governor transfer или утверждать браузерное выполнение заранее.
- Для существующего pool после global policy change нужен cache update. SDK `protocolFeeSyncSnapshot/prepareProtocolFeeSync/syncProtocolFee` и UI готовы: **Существующий пул для обновления** → **Проверить обновление ставки пула** → проверка ставок/пула/контроллера → **Обновить protocol ставку этого пула**. [6 targeted tests](../test/monetary-fee-sync.test.mjs) прошли, включая exact original calldata, numbered reads, runtime/controller/official-pool binding, override и stale-wallet/policy отказ. Mock-проверка наблюдает cached0/global10% до и фактический cached10% наreceipt-блоке после; это не транзакция действующей сети. Совместные24теста и Vite сборка прошли; браузерный тест ещё pending. При настоящем исполнении сохранить before cached/global/override и actual after block; override-пулы не сбрасывать. Можно настроить global default **до** создания первого pool, но это не заменяет приёмку обновления существующего.
- Source/build pass и успешный read-only prepare не являются browser transaction pass. При отказе automatic approval конкретное действие останавливается; никаких запасных RPC/имперсонации/снятия guards.

## Что уже проверено изолированно

При заключительном проходе можно после окончания начислений применить к этому же V2-рынку настоящий CI4 proof и разрешить его TRUE **до возврата заблокированного BPT**. Это проверит, что запрет новых swaps не мешает возврату principal после окончания программы. Выплаты наград, возврат BPT, обычный выход из пула и погашение выигравших позиций остаются отдельными действиями. До завершения торговых проверок рынок не разрешать. Реальное разрешение здесь ещё не заявлено выполненным; прежние остановленные deadline/source/payment-действия этот маршрут не повторяет.

[13 meter tests](evidence/monetary-policy/meters-contract-tests.json), [ресурсы](evidence/monetary-policy/meters-test-resources-03.json): оригинальные Balancer Vault/Router/WeightedPool/fee controller и Splits; forgeduserData, arbitrary querysender и unknownrouter; оба fee потока; запрет directDAOwithdraw/authorizer/controller replacement; officialpool/program binding; неизменяемость веса; losingEOAconsent; BPT lock/unlock и ordinary exit послеresolution. Registry/executor здесь явно test fixtures; это не Lean/Governor/browser evidence.

Core RewardBudget отдельно прошёл9 in-process tests с настоящими original Governor/Membership/Timelock: zero genesis, actual votedmint+budget, CAS rollback, reserved balance, earning/claim boundaries, own claims, dust и zero-weight remainder. См. `scripts/test-monetary.mjs` и [публичный отчёт](../evidence/monetary-v2/governor-budget-tests.json); это изолированное, не браузерное evidence.

Для публичной ручной приёмки сохранить выбранный V2 descriptor/version, номера/хеши блоков и TX, decoded events, before/after supply/MEMBER/weights/deposits/credits/reserved, точные assets и epoch. Каждому шагу ставить отдельно **browser passed**, **read-only observed**, **isolated passed** или **pending**. Начальная эмиссия307, рынок335/LP343 и fee-политики370/397/424 с cache sync425 уже имеют отдельное браузерное evidence; следующие reward-шаги не объявляются пройденными заранее.

## Компактный маршрут послеExecute307

Один V2 рынок, один YES/T pool и Alice достаточно для положительного пути. Все нижеследующие суммы — параметры предлагаемого ручного теста, не уже выполненные действия. Реальные номера программ брать из текущего `programCount`; legacy программы и пулы не подходят.

1. **Сначала закончить нетаймированные приготовления.** Admission действительного профиля, внешний registration → рынок; Split30T, pool50/50 с20T+20YES. До торговли: Alice950T,10YES,30NO; BPT записать фактически, не выводить из суммы внесённых токенов. Первая эмиссия1000T уже завершена. Инициализация пула сама не начисляет trading weight.
2. **Затем все три настройки комиссий.** Создать pool с исходной общей swap fee1% (текущий default формы); coordinator задаёт creator share20%. Обычным governance последовательно: swap1→2%, creator20→25%, global protocol0→10% — каждый раз перечитать фактические previous значения. После global Execute существующий pool всё ещё использует прежний cached global; явный UI cache update должен показать0→10%, `isOverride=false`. Не торговать до этой проверки: так доход теста не смешивается с ранними ставками. Три отдельных governance решения нужны для трёх конкретных SDK/UI настроек; сам cache update не требует ещё одного голосования.
3. **Три будущих программы, по одной доExecute.** Volume metric0 с3T; LP lock с2T; fee-weight metric1 с1T. Это те же6T суммарной эмиссии, что в таблице выше. Не готовить несколько funding proposals с одним ожидаемым counter: после каждогоExecute заново `Обновить денежную политику`, discovery/выбор meter и новый review. После всех трёх: supply1006T; RewardBudget.balance=reserved=6T, если других действий не было.
4. **Одна общая активная часть.** Когда все три периода начались, Alice блокирует1BPT; затем получает quote, покупает YES ровно за1T и продаёт0.1YES. Этот один buy/sell одновременно проверяет volume, fee-weight, обычную торговлю и реальный protocol/creator доход. Сохранить блоки stake/buy/sell и исходный нулевой вес; quote не должен менять вес.
5. **Collect/distribute/claim дохода**, пока программы активны. `collectAll` → фактический active V2 epoch Split → Warehouse → реальные beneficiaries. Читать именно текущие recipients/weights, не переносить legacy доли в ожидания. Дополнительное перераспределение долей или платёж из DAO здесь не нужны.
6. **Послеend вернуть1BPT и получить3T volume +2T LP наград.** Fee-weight программу специально оставить неполученной до еёclaimDeadline. Послеdeadline её permissionless close вернёт ровно1T заранее выбранному actualTimelock. Так один положительный остаток проверяется без четвёртой пустой программы; fee-weight начисление видно до его истечения. Повторный claim/close UI становится недоступен; никаких обходных отправок для проверки отказов.

### Время для ручных действий

Governor считает **блоки**, программы и Timelock — **Unix seconds**. Для proposal вB приdelay1 snapshot=B+1; в самом snapshot блоке он ещё Pending. Нажать`+1 local block`, перечитать state и при необходимости ещё`+1`, пока именноActive. Затем два действительных MEMBER голоса (проверить фактический quorum), только после них`+10`, Queue; дождаться показанногоETA5s и получить новый блок/refresh передExecute. Не использовать`+10` до голосов и не считать прошедшие5 wallclock секунд новым блоком.

Все fee решения выполнить **до** выбора program windows. Ускоренный локальный fixture: взять timestamp последнего блока`t0`; всем трём программам задать общийstart=`t0+2часа`, end=`start+15мин`, claimDeadline=`end+15мин`. Ввести эти значения через обычные localdate поля и проверить показанныеUTC/Unix. Двухчасовой запас позволяет последовательно пройти настоящие три governance lifecycle, не рискуя преждевременно активировать первый бюджет. Перед каждымExecute всё равно проверить`start > latestBlock.timestamp`: SDK не обещает исполнение доstart.

После всех трёхExecute тестовый оператор может отдельно вызвать на **том же локальном узле31373** `evm_increaseTime` на положительную разницу дообщегоstart, затем mine одного блока. Это **управление часами тестового fixture**, не browser pass и не способ отправить финансовое действие. Сохранитьbefore/after block hash/number/timestamp, фактический прирост секунд и описание RPC; сравнить supply, token/BPT balances, budget/weights до/после (они не меняются). Перечитать программы в UI и только затем вручнуюstake/buy/sell. Когда эта активная часть и распределение комиссий закончены, таким же записанным переходом получить блок на/послеend; вручную вернутьBPT иполучить две награды. Послеclaims перейти на/послеclaimDeadline и вручнуюзакрыть оставшуюся программу.

Часы двигаются только вперёд; если заданнаяграница уже прошла, не отправлять отрицательныйdelta — перечитатьstate. Не менять balances/storage, неимперсонировать кошельки, неreset/redeploy и не возобновлять ранее отклонённые legacy действия. Голоса, quorum, snapshot, queue иTimelockETA всегда проверяются настоящими контрактами; сменаtimestamp не заменяетGovernor block voting. Дополнительный UI time-travel функционал не нужен, ожидатьчас в реальном времени тоже не нужно. В итоговом evidence раздельно пометить `test-clock setup` для RPC и `browser financial action` дляподписанных обычнымкошельком операций.

### Точные проверки общей активной части

Пусть`q` — фактический YESoutput покупки, `x` — фактический Toutput продажи0.1YES (в raw18 единицах). До наград/beneficiary claims Alice имеет `(949e18+x) T`, `(9.9e18+q) YES`, `30e18 NO`. Эти балансы не прогнозируются AMM-формулой: брать реальные transfer/balance snapshots. При единственном участнике:

- Volume weight=`1e18+x`; fee-weight=`ceil(1e18*0.02e18/1e18)=2e16`. Продажа увеличивает первый вес на`x`, второй не меняет.
- LP weight=`1e18*(lpEnd−stakeBlock.timestamp)`; deposits=1e18, walletBPT уменьшается на1e18, custody meter растёт на1e18. Возврат principal послеend восстанавливает эти BPT; не меняет totalSupplyT/weights и не выполняет reward claim.
- Buy fee0.02T: protocol10%=0.002T; creator25% от оставшихся90%=0.0045T; вместе0.0065T. Sell fee0.002YES: соответственно0.0002YES+0.00045YES=0.00065YES. LP сохраняют остальную fee внутри пула. Это номинальные18-decimal суммы для указанных EXACT_IN inputs; controller/Splits rounding и sentinel dust фиксировать по receipts, не округлять их в evidence до нуля.
- После claims3T+2T: RewardBudget.balance=reserved=1T; после положительногоclose1T: оба0, `reclaimed=1e18`, Timelock Tbalance+1e18, supply остаётся1006T. Beneficiary fees не проходят RewardBudget и не уменьшаютreserved. Если есть другие программы/действия, проверять эти же **дельты**, а не глобальные абсолютные значения.

### Что не требует повторных ручных транзакций

В браузере остаются необходимыми все новые положительные поверхности: ordered funding/discovery, обе торговые формулы, LP stake/unlock, reward claim, fixed-recipient positive close, три fee setters, cache sync существующего пула, оба fee потока в allocation. Можно повторно использовать уже созданный подходящий рынок/пул; нельзя подменить эти действия только isolated evidence.

Forged userData, неизвестный router, arbitrary querysender, прямой governance withdrawal/замена authorizer/controller, подмена official pool, изменение configured binding, CAS rollback, досрочный принудительныйwithdraw, EXACT_OUT exclusion, нулевой бюджетный вес и арифметическийdust уже покрыты13 meter и9 core tests. Создавать для них дополнительные рынки, hostile routers или заведомо отклоняемые browser transactions не нужно. Завершение Lean-рынка и обычный LPexit послеresolution имеют отдельную приёмку; если этот рынок ещё понадобится для торговли, не разрешать его только ради повтора уже проверенной блокировки.

## Исторический сборщик US023

Из standalone папки `implementations/vault`:

```sh
node --max-old-space-size=128 scripts/capture-monetary-snapshot.mjs --block 370 --out evidence/monetary-policy/snapshot-370.json
```

Для следующих stake/trade/claim/close выбрать фактический номер блока и новое имя файла. Существующий отчёт не перезаписывается. Сборщик фиксирует наблюдаемый V2 pool `0x75ba1e7c0AC567f3451D2646f1db5eAbc99d07f7` и statement `0x390403d03c5e8c37534c14ee5b1a56b9004da93d40a171ee9ba7ae8d62bbfd08`; их контрактная связь проверяется перед чтением. Все `eth_call`/`eth_getCode` ограничены одним явным blockTag; genesis и receipt исходного V2 deploy — отдельные проверки цепи. Latest-only SDK snapshot не используется, переиспользуются установленный ABI и SDK арифметика оригинальных округлений комиссий. RPC allowlist запрещает все методы записи; signer отсутствует.

Отчёт содержит все существующие программы (лимит20, превышение отклоняется), Budget reserved/balance, исходные неизменяемые budgets/windows, реальные weights/claimed/claimable, LP deposits, hook bindings/slots/meters, balances T/YES/NO/BPT для Account0–3/Timelock/Governor и протокольных держателей, Warehouse credits, pool raw reserves и фактические cached/global/creator fees. Единицы и адреса активов не смешиваются. Код и immutable bindings проверяются для выбранного V2; UUID сверяется с локальным chain-instance, genesis timestamp и достоверным deploy receipt. Повторное чтение hash запрошенного блока проверяет стабильность снимка.

[Снимок370](../evidence/monetary-policy/snapshot-370.json) реально собран: supply1000T, программ0/reserved0, raw reserves20YES+20T, swap fee2%, creator20%, global/cached protocol0, все fee accumulators0. Это историческое чтение; оно не утверждает отсутствие последующих транзакций. [Resource report](../evidence/monetary-policy/snapshot-370-resources.json):1.098s, peak116222488B, Node heap128MiB, внешний watchdog256MiB/60s, cleanupErrors[]. Сборщик не исполняет действия в браузере и не выдумывает будущий вес/доход; ветка программ будет фактически прочитана на следующих наблюдаемых блоках после их создания.

## Утилита управления тестовыми часами — подготовлена, не исполнена

`scripts/monetary-test-clock.mjs` переиспользует исторический сборщик выше. Исполнитель сначала готовит точный переход по **существующим** программам, затем отдельно запускает его. ID0,1,2 ниже — пример: сверить с фактически созданными программами.

```sh
node --max-old-space-size=128 scripts/monetary-test-clock.mjs --prepare start --programs 0,1,2 --out evidence/monetary-policy/clock-start
node --max-old-space-size=128 scripts/monetary-test-clock.mjs --execute evidence/monetary-policy/clock-start.plan.json
```

Для конца периода заменить `start` на `end`, для окончания claims — на `claimDeadline`; каждый раз выбрать новый prefix и подготовить новый план после нужных ручных операций. Prepare выполняет только чтение, сохраняет `.before.json` и `.plan.json` с исходным блоком, точными окнами, target UTC/Unix и положительной дельтой. Target — максимум соответствующих границ выбранных программ. Дляstart/end проверяется существование общего earning/claim окна. Послеprepare изменения головы цепи требуют нового плана; еслиtarget уже достигнут, execute завершится безclock RPC. Нет отрицательного изменения времени или требования точного равенства конечного timestamp: узел может добавить секунды сам.

Только явный `--execute` записывает `.intent.json` **до** первого изменения и отправляет ровно `evm_increaseTime(delta)`, затем `evm_mine`. Текущее состояние выбранных программ повторно читается на проверенном блоке; chain instance, genesis, descriptor и хэши обоих скриптов сверяются. После исполнения сохраняются `.after.json` и `.result.json`: должен появиться один пустой блок, target достигнут без выхода за нужное окно, а supply/assets/Warehouse credits/raw reserves/weights/deposits/budgets/paid/reclaimed/fees/allocation остаться прежними. Производные от времени claimable и флаги активности записываются отдельно и **не** участвуют в требовании неизменности storage. Финансовые действия, votes и Timelock guards не подменяются.

При неопределённом RPC результате intent сохраняется; повторныйexecute с этимprefix запрещён до ручной проверки. Утилита не делает reset, impersonation, переводов или автоматического восстановления. Она проверена синтаксически; ни prepare, ни execute для живых программ автором этого изменения не запускались. Clock fixture помечается отдельно от browser pass.


### Два участника в заключительной приёмке

Для выполнения US-023 с двумя получателями после первой торговли Alice и распределения её комиссий Bob получает собственные 40% T/YES из Warehouse. Если текущий query и minima Balancer подтверждают достаточность, через тот же сайт Bob запрашивает дополнительный взнос на 0.0001 BPT, блокирует полученные 0.0001 BPT в программе 1 и покупает YES за 0.001 T. Это обычные действия второго кошелька из его реального дохода; дополнительная эмиссия для них не нужна. Перед исполнением сравниваются реальные balances, quote и максимальные amounts; числа выше не являются уже выполненными действиями.

После этого ожидаемые одиночные выплаты 3 T и 2 T из предыдущего раздела больше неприменимы: каждый из двух кошельков отдельно получает floor(budget × ownWeight / totalWeight) по программам 0 и 1. Итоговые веса берутся из фактических Swap/WeightRecorded и времён stake. Возможный rounding dust остаётся зарезервированным до закрытия. Программа 2 сохраняет обе fee-weight записи, но её награды намеренно не запрашиваются: после срока закрытие направляет 1 T фиксированному Timelock. При ненулевой пыли программы 0/1 также закрываются, с точным наблюдаемым остатком. После всех закрытий reserved и баланс бюджета должны стать нулём; supply сохраняется 1006 T. Новые комиссии от второй торговли учитываются отдельно от уже выплаченной первой партии дохода.
