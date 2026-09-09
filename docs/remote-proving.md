# Удалённое получение настоящего Lean-сертификата

Проверено 2026-09-10. Статус: **read-only research и план**, без платёжных транзакций, отправки proving requests, размещения исходников, скачивания binary assets или чтения пользовательских секретов. Программы, профили, локальные deployments и execution policy не менялись.

**Выбран следующий шаг: бесплатный CI проекта в public repository `brodyga45/oncm`.** Пользователь уже выбрал этот путь и public visibility; координатор подтвердил создание repository и SSH-доступ. Workflow готовится отдельно в `.github/workflows/lean-zk-smoke.yml`. Это ещё не означает, что удалённое доказательство завершилось: ниже сохранены проверенные ограничения и альтернативный платный путь. Исследование Boundless завершено без дополнительных сетевых проверок после этого выбора.

CI позволяет выбрать исходный `v3` и отдельный экспериментальный `perf05`. Первый имеет image/profile существующих localhost bridges; второй — более узкую zero-axiom логическую основу, другие image/profile и цели. Успех первого пробного запуска `perf05` не даёт сертификат для существующих v3 markets: для него понадобится отдельно предусмотренное принятие нового профиля. Подмена profile в artifact недопустима. [Подготовленный CI bundle](../tools/lean-zk/ci/README.md).

## Решение для пользователя

**Регистрироваться в Boundless как в обычном SaaS не обязательно: requestor определяется кошельком. Но подтверждённого бесплатного Boundless-прувера для нашего v3 сейчас нет.** Mainnet — платный аукцион с заданным нами потолком цены, плюс gas и возможное хранение файлов. Отдельная учётная запись может понадобиться поставщику RPC/хранилища, если выбрать его. SDK также работает с уже доступными HTTPS-файлами. [Официальный requestor CLI](https://docs.boundless.network/developers/tooling/cli), [загрузка program/input](https://docs.boundless.network/developers/tutorials/request).

| Вариант | Оплата и доступ | Что реально подтверждено |
|---|---|---|
| **GitHub Actions — CI данного проекта** | Standard Linux runner в public repository бесплатен. Для private repository GitHub Free включает 2000 минут/месяц; доступность квоты аккаунта здесь не проверялась | Есть бесплатные вычислительные ресурсы, но завершение нашего реального proof ещё не измерено. Public Linux: 4 CPU / 16 GB RAM / 14 GB SSD; private: 2 CPU / 8 GB / 14 GB. Нужен подготовленный ограниченный workflow, достаточное место для ключей и проверка результата. Это CI, а не готовый proving API. |
| **Boundless Base/Taiko mainnet** | Кошелёк, ETH на proof auction и gas; program доступен проверам. Применяем maxPrice и явное разрешение на расходы | Оба официальных order-stream health endpoint отвечают HTTP200. Поддержка raw Groth16 есть в официальных docs и source. Конкретный заказ нами не отправлялся, цена/время не измерены. |
| **Boundless testnet** | Теоретически тестовые средства, если есть работающий market и provers | CLI/source перечисляют Sepolia и Base Sepolia, однако публичные order-stream DNS сейчас без адресных записей. Активный бесплатный fulfillment **не подтверждён**. На этот вариант нельзя опираться как на готовое решение. |

Данные GitHub взяты из [характеристик runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) и [правил billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Free runner не доказывает, что proof уложится в RAM/диск/время. Для CI публикуются только отдельно согласованные файлы; большие proving keys не сохраняются как постоянные artifacts. Public visibility или использование private quota выбирается пользователем после просмотра workflow. Larger runners платные даже для public repository.

## Сети: документация расходится с доступностью

Современная [страница deployments](https://docs.boundless.network/developers/smart-contracts/deployments) публикует рынки **Base mainnet** `0xfd152dadc5183870710fe54f939eae3ab9f0fe82` и **Taiko mainnet** `0xb3f5c7b4379052eade8c7f3fa6da37fb871da28b`. В CLI docs есть также две testnet; pinned [deployments.rs](https://github.com/boundless-xyz/boundless/blob/545c61149521622c6662946582698f4e9bccfed4/crates/boundless-market/src/deployments.rs) содержит:

| Сеть | Chain ID | Market из source | Результат read-only проверки |
|---|---:|---|---|
| Base mainnet | 8453 | `0xfd152dadc5183870710fe54f939eae3ab9f0fe82` | `https://base-mainnet.boundless.network/api/v1/health` → 200 |
| Taiko mainnet | 167000 | `0xb3f5c7b4379052eade8c7f3fa6da37fb871da28b` | `https://taiko-mainnet.boundless.network/api/v1/health` → 200 |
| Ethereum Sepolia | 11155111 | `0xc211b581cb62e3a6d396a592bab34979e1bbba7d` | `eth-sepolia.boundless.network`: локальный DNS не разрешается; Google public DNS NOERROR/NODATA без A/AAAA/CNAME |
| Base Sepolia | 84532 | `0x56da3786061c82214d18e634d2817e86ad42d7ce` | `base-sepolia.boundless.network`: тот же результат |

Попытки только `eth_chainId` / `eth_getCode` / `eth_blockNumber` через публичные Sepolia RPC получили HTTP403; поэтому наличие и состояние testnet-контрактов этим исследованием не подтверждены. Это не доказательство отсутствия контрактов. Даже найденный bytecode не устанавливал бы наличие активных бесплатных проверов. HTTP200 mainnet health также не является гарантией принятия конкретной цены или срока.

Адрес verifier router в docs Base и текущем source отличается; адаптер должен сверить действующий market/verifier через RPC перед оплатой и не смешивать произвольные адреса из разных версий. Для проверки результата на трёх localhost-цепях используется **наш уже развёрнутый immutable bridge**, а не доверие этому remote router.

## Совместимость нашего v3

Нужен **raw SHA2 Groth16**, а не default Merkle inclusion receipt. Boundless прямо поддерживает такой путь для cross-chain verification через `.with_groth16_proof()`. Он дороже агрегированного варианта. Blake3 Groth16 также не подходит нашему bridge. [Proof Types](https://docs.boundless.network/developers/tutorials/proof-types).

| Поле | Фиксируем для существующих трёх приложений |
|---|---|
| `imageId` | `0x3ba46e4e43724929a3b160c49e75ea89d1ea529f357d8ba07cf55054cb3f2deb` |
| `profileId` | `0x190eddca14d88c2af77ea74b7ba257dcb7f9236c1cf7c8002890a992332c485e` |
| Program | Точный `proof/lean-checker.bin`: packed ProgramBinary, 1,058,344 bytes, magic `R0BF`, format version1. Передавать user ELF отдельно нельзя: kernel и header входят в образ |
| Proof selector | **`0x73c457ba`**, `Groth16V3_0`; не `0x00000000`, не set selector, не fake/Blake3 |
| Journal | 128 bytes: ABI words `SHA256("ONCM_LEAN_CLAIM_V1")`, goalHash, profileId, kind. Kind0 регистрация, 1 доказательство P, 2 доказательство ¬P |
| Certificate | `abi.encode(bytes seal, bytes journal)`; bridge требует seal260 bytes, journal128 и проверяет image/goal/profile/kind криптографически |

Точный selector есть в [официальном selector.rs](https://github.com/boundless-xyz/boundless/blob/d85becb22cefc4fdaffca0953f358a9bd6850940/crates/boundless-market/src/selector.rs#L62). Текущая source branch Boundless `545c611…` использует zkVM3.0.4 и binfmt3.0.3 по Cargo.lock; нельзя просто утверждать, что каждый prover запущен на3.0.6. Но проверенные [ProgramBinary3.0.4](https://github.com/risc0/risc0/blob/v3.0.4/risc0/binfmt/src/elf.rs#L300) и [ProgramBinary3.0.6](https://github.com/risc0/risc0/blob/v3.0.6/risc0/binfmt/src/elf.rs#L300) имеют одинаковые encode/decode/header/image routines. Различие файлов — copyright и эквивалентный `is_multiple_of` refactor проверки выравнивания ELF. Это подтверждает совместимость **формата**, а принятие конкретного guest проверами остаётся runtime gate до обещания результата.

Сертификат переносим: journal v3 не включает chainId или market-specific statementId. Один registration certificate и один proof certificate для одной цели можно предъявить во всех трёх localhost registry, если profile/image действительно совпадают. Каждый registry сам связывает statementId с goalHash. Возврат корректного proof из сервиса не требует изменения контрактов или trusted native/admin resolve. Источник истины — [существующий LeanProofBridge](../implementations/vault/proof/contracts/LeanProofBridge.sol).

## Готовый клиент и минимальный адаптер

Публичный GitHub releases API показал newest general release `v2.0.2` (2026-06-04), но latest опубликованный **CLI asset** — `boundless-v2.0.0` (2026-05-11), commit `d85becb22cefc4fdaffca0953f358a9bd6850940`. Есть только `boundless-linux-amd64.tar.gz`, 72,928,615 bytes, SHA-256 `56f3230df5a8635b76ebe6c3fe1a8e581f3a3f47c01324845b117788be36ff5f`. Mac ARM asset не найден; [release workflow](https://github.com/boundless-xyz/boundless/blob/545c61149521622c6662946582698f4e9bccfed4/.github/workflows/boundless-cli-release.yml) собирает один Linux AMD64 target. [CLI release](https://github.com/boundless-xyz/boundless/releases/tag/boundless-v2.0.0).

Поэтому **не нужно устанавливать весь Rust toolchain на Mac** ради requestor:

1. Для разового эксперимента можно использовать проверенный prebuilt CLI на уже выбранном Linux AMD64 host. Это только отправитель заказа, он не обязан сам доказывать.
2. Для приложений — небольшой Node/ethers transport поверх опубликованного contract ABI и order-stream HTTP API. Это наш glue, не утверждение о существовании официального JavaScript SDK. На Mac остаются только подготовка точных bytes, подпись, polling и локальная проверка returned proof. Адаптер пока не реализован этим исследованием.

Важно: обычный CLI submit/SDK request builder способен запускать **локальный preflight execution**. Для нашего ограниченного host используем полностью подготовленный request и подтверждённый в release CLI флаг:

```text
boundless requestor submit-file request.yaml --no-preflight --offchain --wait
boundless requestor get-proof <request-id>
```

Эти команды здесь не выполнялись. `--no-preflight` отключает также автоматические pricing checks, поэтому offer/image/journal заранее фиксируются и проверяются нашим планом. Предпочтительнее API polling отдельно от submit, чтобы отмена ожидания не была ошибочно объявлена отменой уже оплаченного заказа. [Release submit implementation](https://github.com/boundless-xyz/boundless/blob/d85becb22cefc4fdaffca0953f358a9bd6850940/crates/boundless-cli/src/commands/requestor/submit.rs), [get-proof](https://github.com/boundless-xyz/boundless/blob/d85becb22cefc4fdaffca0953f358a9bd6850940/crates/boundless-cli/src/commands/requestor/get_proof.rs).

**Не копировать старый YAML буквально из docs.** В v2 `Requirements` содержит callback/predicate/selector; отдельного `requirements.imageId` уже нет. SDK DigestMatch кодирует `predicate.data = imageId || SHA256(rawJournal)`, 64bytes. On-chain Solidity type и реальный Rust builder/assessor-path проверены отдельно: [Requirements](https://github.com/boundless-xyz/boundless/blob/d85becb22cefc4fdaffca0953f358a9bd6850940/contracts/src/types/Requirements.sol), [requirements layer](https://github.com/boundless-xyz/boundless/blob/d85becb22cefc4fdaffca0953f358a9bd6850940/crates/boundless-market/src/request_builder/requirements_layer.rs), [predicate encoding/evaluation](https://github.com/boundless-xyz/boundless/blob/d85becb22cefc4fdaffca0953f358a9bd6850940/crates/boundless-market/src/contracts/mod.rs#L732).

Интеграционный manifest:

```json
{
  "transport": "boundless",
  "marketChainId": 8453,
  "imageId": "<точный v3 image выше>",
  "requirements": {
    "callback": {"addr": "0x0000000000000000000000000000000000000000", "gasLimit": 0},
    "predicate": {"predicateType": "DigestMatch", "data": "0x<imageId32><sha256RawJournal32>"},
    "selector": "0x73c457ba"
  },
  "programUrl": "<явно согласованный immutable HTTPS URL packed binary>",
  "inputEncoding": "boundless-GuestEnv-v0",
  "offer": "<явно выбранные minPrice/maxPrice/timeouts; не автоматическое увеличение>"
}
```

Это manifest нашего adapter, **не готовый RPC request**: он ещё получает requestId, точный Input/Offer и подпись. Для stdin допустим документированный source-code decoder V0: `0x00 || exactSerializedGuestStdin`; V1 — `0x01 || MessagePack GuestEnv`. Не передавать JSON runner input вместо guest bytes, не применять вторую RISC0-serde кодировку. Сам v3 guest использует прежний stdin; `--encode-input` CLI способен изменить эти bytes и здесь не нужен. [GuestEnv implementation](https://github.com/boundless-xyz/boundless/blob/d85becb22cefc4fdaffca0953f358a9bd6850940/crates/boundless-market/src/input.rs#L83).

Off-chain API принимает `POST /api/v1/submit_order` с `{request,request_digest,signature}`. EIP-712 domain: `name="IBoundlessMarket"`, `version="1"`, выбранные chainId и verifyingContract. Подписывает кошелёк; отдельная регистрация requestor не требуется. Перед offchain submission нужен market deposit. Для получения используем реальное fulfillment data/seal из market event/transaction, а не поле status как сертификат. [Order stream client](https://github.com/boundless-xyz/boundless/blob/d85becb22cefc4fdaffca0953f358a9bd6850940/crates/boundless-market/src/order_stream_client.rs#L316), [EIP-712 domain](https://github.com/boundless-xyz/boundless/blob/d85becb22cefc4fdaffca0953f358a9bd6850940/crates/boundless-market/src/contracts/mod.rs#L1177).

## Цена, размещение и проверяемый следующий шаг

Цена не является фиксированным тарифом за регистрацию. `Offer.minPrice/maxPrice` заданы в wei ETH; цена растёт по аукциону. Lock collateral требуется **от prover**, это не основание просить requestor купить ZKC. К расходам requestor относятся accepted proof price, его gas и выбранное storage. Raw Groth16 повышает затраты против aggregation. Исторические $/Gcycle benchmarks не являются котировкой нашего guest и не включают гарантированно все расходы. [Offer source](https://github.com/boundless-xyz/boundless/blob/d85becb22cefc4fdaffca0953f358a9bd6850940/contracts/src/types/Offer.sol#L15).

Program и witness должны быть доступны выполняющим заказ проверам. Inline input раскрывается через request; обычные HTTPS/IPFS также публичны. Для нашего небольшого опубликованного smoke это можно явно согласовать. Private S3 gating — отдельная конфигурация с ограничением доступа проверам, а не ZK-скрытие witness от исполнителя. URLs должны жить дольше аукциона/proof timeout; стандартные S3 signed URLs могут истекать. [Sensitive inputs](https://docs.boundless.network/developers/tutorials/sensitive-inputs).

Последовательность работ после выбора варианта:

1. **Локально подготовить review bundle:** точный packed program hash/size, exact stdin hash/size, ожидаемый128-byte journal, image/profile/selector и задания register/prove. Публикация только в пределах явно разрешённого списка файлов и выбранного public CI. Не пересобирать guest ради Linux: результат необходимо было бы заново связать с image. Не запускать автоматически тяжёлый preflight.
2. **Для выбранного бесплатного CI:** закончить отдельный workflow реального regression smoke в public `brodyga45/oncm`; ограничить concurrency/threads/time/storage, не сохранять proving keys в artifacts; результат скачать как receipt/seal/journal. Первая ограниченная попытка использует экспериментальный `perf05`. До успешного измерения не обещать, что 16GB и14GBdisk хватят; private8GB текущий recipe отклоняет.
3. **Для Boundless:** проверить market ABI/version и доступный RPC, задать конкретный общий бюджет на два заказа + gas, проверить storage URL, получить явное разрешение на эти внешние действия. Только после этого deposit и submit с pinned selector и exact journal predicate. Не повышать цену/не повторять оплаченный request автоматически.
4. **Проверить результат локально:** exact image, selector, journal bytes/goal/profile/kind; `abi.encode(seal,journal)`; `eth_call verifyGoal` или `verify` на каждом из трёх существующих bridges. Лишь успешная криптографическая проверка помещает результат в certificate cache. Remote service/CI logs и HTTP200 не заменяют проверку.
5. Для `v3` после принятия certificate выполнять уже предусмотренный real create→LP→trade→resolve→redeem smoke. Квитанции и block evidence сохраняются; существующие контрактные профили остаются v3. Для `perf05` сначала нужен отдельный bridge/profile, принятый через предусмотренный governance путь; старые рынки и их профили не переписываются.

Interface для runner: `remoteRequest = {imageId, profileId, goalHash, kind, programSha256, stdinSha256, expectedJournal, selector, approvedTransportConfig}`; результат transport — `{seal,journal,requestId,marketChainId,fulfillmentTxHash}` или CI artifact provenance. Поле `certificate` заполняется только после bridge verification. Платёжный кошелёк/доступ к storage не передаются внутрь guest и не пишутся в публичные job results.

Что потребуется от пользователя **после готового review bundle**, если это ещё не покрыто данным разрешением:

- Для выбранного CI repository уже создан. Координатор готовит проверяемый список файлов и workflow в пределах полученного разрешения; повторно выбирать сервис или регистрироваться в Boundless не нужно. Бесплатность конкретного запуска зависит от visibility и типа runner; текущий подготовленный recipe требует standard public Linux16GB, а private8GB отклоняет до загрузки prover.
- Для Boundless: выбрать платный путь, подтвердить конкретный лимит расходов и раскрываемые program/input files; подключить подходящий кошелёк с ETH выбранной сети и указать storage/RPC способ. Секретные ключи не надо присылать в чат; пользователь подписывает операции либо сам настраивает защищённый secret.
- Для «только бесплатно через proving service»: сейчас готового подтверждённого endpoint нет. Нужна внешняя информация о живом бесплатном prover/testnet, после чего read-only проверка повторяется. Не просить пользователя пополнять кошелёк или регистрироваться «на всякий случай».

CLI/SDK source лицензированы Apache-2.0; контрактные/assessor части Boundless имеют BSL с будущей конверсией. Для нашего transport достаточно ABI и клиентского кода, без fork или deployment всего remote рынка. [Upstream licensing](https://github.com/boundless-xyz/boundless#license).
