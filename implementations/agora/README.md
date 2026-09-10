Generic external certificate bundles are now supported for arbitrary compatible v3/perf05 goals, with original EVM/bridge verification and explicit unverified source-to-goal correspondence. See [GENERIC-CERTIFICATE-IMPORT.md](GENERIC-CERTIFICATE-IMPORT.md). Website proof generation remains deferred.

# Full-content onchain social update (2026-09-10)

Profiles, discussions, replies, votes, immutable revision history and public blogs now use AgoraSocial + pinned MIT Solady SSTORE2. Read/write through the independent SDK or web; every publish is a direct wallet transaction. Old offchain records remain an unmigrated archive. See [ONCHAIN-SOCIAL.md](ONCHAIN-SOCIAL.md) for exact limits, source pins and [manual evidence](evidence/onchain-social/README.md). `npm run dev` compiles/reuses the additive social deployment; `npm run compile:social` and `npm run deploy:social` also work independently against the existing local chain. No chain reset is required.

# Agora

Самостоятельное приложение математических рынков: Vue, оригинальные Gnosis Conditional Tokens и FPMM, неизменяемые эпохи комиссий OpenZeppelin PaymentSplitter, настоящий Safe 2/2 и Timelock. Активы локальной сети тестовые.

## Запуск

```sh
cd implementations/agora
./run.sh
```

Чистый checkout восстанавливает pinned настоящий v3 proof bridge из опубликованного bootstrap; локальный prover для этого не нужен. Подробности и отдельные порты: [FRESH-START.md](FRESH-START.md).

Первый запуск устанавливает pinned npm-зависимости через `npm ci`, компилирует контракты, запускает свою Ganache EVM, выполняет deploy и поднимает API/веб. Нужен Node.js 22+. В этой рабочей среде локальные сокеты доступны процессу, запущенному с разрешением sandbox на localhost. Не нужно запускать соседние реализации.

* Веб: http://127.0.0.1:5171
* API: http://127.0.0.1:4171/api
* RPC: http://127.0.0.1:9545 — chainId **31371**
* `./run.sh --reset` удаляет только собственную `.local/` с тестовой цепью и данными. Обычный запуск сохраняет историю.
* `npm run build` — Solidity compilation + production frontend.
* `npm test` — экономические интеграции, governance, import, social, private research store.
* `node scripts/api-smoke.mjs` — проверка уже запущенного API.

Публичный devnet mnemonic записан в `sdk/chain.mjs`; им можно пользоваться только на этой локальной сети. Шесть стандартных тестовых аккаунтов доступны в верхнем селекторе. Кнопка адреса подключает обычный EIP-1193 кошелёк, добавляет/выбирает chain 31371. T имеет фиксированный тестовый genesis supply — по 100000 T на каждый из шести адресов; faucet переводит часть T первого аккаунта, а не создаёт новые токены.

## Реальная проверка Lean

`proof/` содержит независимую копию runner, RISC Zero guest, native checker, manifests и EVM bridge. Deploy берёт `proof/deployment.json`. Контракт bridge проверяет Groth16; в основном Registry нет `adminResolve` и нет тестового сертификата. Отсутствующий bridge приводит к явно отвергающему verifier. `TestProofVerifier` используется только в изолированном in-memory экономическом тесте.

Рабочий формат профиля: `Oncm.goal : Prop` и `Oncm.solution`; исходник компилируется Lean, экспортируется, независимо проверяется NanoDa, затем проверка доказывается в RISC Zero. Для FALSE требуется доказательство `¬ Oncm.goal`. Человеческое описание не участвует в settlement. Цель и foundation/environment закреплены goalHash/profileId.

В этом checkout native toolchain пока описывается `proof/runtime.local.json`, включая абсолютные пути установленных компиляторов/параметров Groth16. Это **не** зависимость от API или кода соседней реализации, но перенос на чистую машину требует установки pinned toolchain. Пакет воспроизводимой установки готовит ведущий proof-пайплайна. Нельзя объявлять portable clean-machine запуск proof на основании одного `npm ci`.

Новый descriptor устанавливается без сброса цепи:

```sh
node scripts/install-proof.mjs
```

Скрипт ограничен chain31371. Он разворачивает новый bridge, подписывает реальную Safe-транзакцию двумя публичными devnet владельцами, планирует batch через Timelock, ждёт пять секунд, исполняет регистрацию нового immutable profile и закрывает старому новые регистрации. История остаётся в explorer. Старые утверждения сохраняют закреплённый verifier.

## Как пройти приложение

Актуальная граница веба (2026-09-10): сайт не заказывает и не вычисляет ZK-сертификаты. Пользователь готовит их самостоятельно вне сайта; генерация из веба отложена. Native Lean check без ZK, работа с исходниками/ноутбуком, импорт и проверка готовых сертификатов доступны. API, SDK, CLI и история прежних jobs сохранены для дальнейшего развития; существующий запрет локального expensive proving не снят. См. [CERTIFICATE-WEB-SCOPE.md](CERTIFICATE-WEB-SCOPE.md).

1. Подготовить registration certificate вне сайта. Create a market → импортировать совместимый JSON или выбрать один из двух published CI registration → Load published registration JSON → Verify & use registration → Register statement & create market. Текущий JSON-импорт поддерживает закреплённые perf05 goals; импорт исходников Ix/Palomar сам по себе сертификат не создаёт. Создание condition, FPMM, approval и funding — отдельные подтверждённые транзакции.
2. Переключить devnet роль на LP или Trader. В Liquidity внести T; в Trade получить quote и купить/продать YES/NO со slippage/deadline. Overview позволяет split/merge полного набора.
3. Подготовить proof/refutation certificate вне сайта. Proof → импорт JSON или published true-proof/false-refutation → Load published settlement JSON → Verify & load settlement certificate → Verify & settle onchain. После payout FPMM запрещает buy/sell/addFunding, но LP exit, fee claim и CTF redemption доступны.
4. Governance → Available extension example → подготовить `ResolvedAfterOperator` → создать предложение → обе роли совета Sign → Schedule via Safe → Execute после Timelock. Новые операторы доступны как immutable версии при создании рынка.
5. Protocol revenue → предложить отсортированное распределение с суммой100%; каждый теряющий долю отдельно даёт согласие; любой исполняет. Claim T для старых эпох сохраняется.
6. Профиль и обсуждения: вход SIWE, display name/bio, ответы, Top/New, up/down/change/remove голоса. Самоголосование запрещает сервер. Математический outcome и governance-вес от голосов комментариев не зависят.
7. Chain activity показывает локальные блоки/hash/time, tx, actor, decoded events, transfer движения и net balance deltas. Это собственный explorer, без ссылки на публичный explorer для неизвестной сети.

Palomar: Create → Search live Palomar registry получает реальные `recent.json` и entry JSON. Import загружает challenge/solution/metadata/Comparator/toolchain/lake lock по полному commit и заполняет draft. Внешний registry status не является доказательством; произвольные Palomar-проекты могут требовать другой поддержанный Lean профиль. Есть также импорт точного GitHub `blob/<40-hex-commit>/file.lean` и экспорт пакета JSON с исходниками, hashes, profile и уже завершёнными proof artifacts.

## SDK

```js
import { createAgoraSDK } from './sdk/index.mjs';
import { devWallet, parseEther } from './sdk/chain.mjs';

const sdk = await createAgoraSDK({ wallet: devWallet(3) });
const [pool] = await sdk.pools(statementId);
const { receipt } = await sdk.provideLiquidity(pool, parseEther('20'));
console.log(receipt.transactionHash, sdk.events(receipt));
const trade = await sdk.buy(pool, 0, parseEther('2'), { slippageBps: 100n });
```

SDK принимает `config` с ABI и свой `client`, поэтому chain operations могут работать без API после загрузки конфигурации. Все денежные количества — bigint в18десятичных единицах; YES=0/NO=1 для FPMM, settlement TRUE=1/FALSE=2. SDK поддерживает register/derived/custom, pools, LP, quote/trade, split/merge, proof/redeem, allocation/claim, SIWE/social/jobs/packages и две дополнительные функции из [EXTRA-FEATURES.md](EXTRA-FEATURES.md).

Архитектура/версии/границы: [ARCHITECTURE.md](ARCHITECTURE.md). Проверки и незакрытые пункты: [VALIDATION.md](VALIDATION.md).
