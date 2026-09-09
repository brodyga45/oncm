# RISC Zero 3.0.6: готовые настройки для ограниченной памяти

Состояние: 10 сентября 2026. Это исследование первичных источников и подготовленный рецепт, а не результат нового proving trial. После запрета новых вычислений запускался только существующий `r0vm --help`. Ни guest, ни host, ни текущий профиль v3 не менялись.

Вывод: штатный параметр `ExecutorEnvBuilder::segment_limit_po2` существует и предназначен для снижения памяти. Полного опубликованного и подтверждённого пути **Lean → EVM Groth16 на macOS ARM ≤2 GiB** не найдено. Малый сегмент уменьшает STARK сегмента, но рекурсивный prover и финальная Groth16-обёртка имеют собственные затраты.

## Что уже описано upstream

| Источник и версия | Факт | Ограничение применимости |
|---|---|---|
| [Local Proving, версия документации 3.0](https://dev.risczero.com/api/generating-proofs/local-proving) | При доступной памяти менее 10 GB предлагается уменьшать segment size. CPU может быть x86 или ARM. | Порог не является минимальным RAM и не обещает полного pipeline в 2 GiB. Та же страница описывает штатный Groth16 как x86-only, без поддержки Apple Silicon. |
| [ExecutorEnvBuilder, SDK 3.0.5](https://docs.rs/risc0-zkvm/3.0.5/risc0_zkvm/struct.ExecutorEnvBuilder.html#method.segment_limit_po2) | Память prover примерно линейна по размеру сегмента; уменьшение exponent на один примерно делит её пополам. | Не означает деление общей памяти всего pipeline пополам; callback, retained segments, recursion и final prover остаются. |
| [Upstream issue #3753, измерение v3.0.5](https://github.com/risc0/risc0/issues/3753) | Отчёт автора: hello-world на Apple Silicon, 1.34 s wall и 341,524,480 B maximum RSS. Код выбирает CPU, несмотря на текст документации о Metal. | Измерен маленький стандартный пример, не Lean и не полная EVM Groth16 цепочка. RSS также отличается от нашего tree physical footprint. |
| [Официальный datasheet, апрель 2023, commit cd1a37e](https://dev.risczero.com/datasheet.pdf) | M1 CPU: 128k cycles → 937.4 MB / 8.43 s; 256k → 1.87 GB / 16.98 s. | Это старая архитектура, не 3.x. Таблица не подтверждает бюджет современного Succinct/Groth16. |
| [Официальные опубликованные macOS CPU JSON](https://github.com/risc0/ghpages/blob/main/dev/datasheet/macOS-cpu.json), [reported commit](https://github.com/risc0/ghpages/blob/main/dev/datasheet/COMMIT_HASH.txt) `8e1cd7cb06ad7306b26853628b6d01520de65183` | В прочитанном snapshot: po2=17 rv32im Poseidon2 RAM 1,079,822,600 B; lift/join RAM 1,588,169,616 B. | Это ветка `main` и не доказанный pin 3.0.6. `ram` в datasheet — tracker буферов HAL, не сумма физической памяти процессов. Нельзя использовать как наш acceptance result. |
| [Upstream CUDA PR #3761](https://github.com/risc0/risc0/pull/3761), merged 17 июня 2026, baseline v3.0.4 | Готовые `low_vram` / `pinned_witgen` позволяют po2=22 на RTX4090 24 GB. Bench: fib succinct, 808→1207 KHz. | Тестовый сервер имеет 125 GB RAM; оптимизация относится к CUDA VRAM, содержит 1 GB pinned host arena. Для Mac с общим лимитом 2 GiB не подходит. |
| [Upstream issue #1749](https://github.com/risc0/risc0/issues/1749) | Описывает причины x86/Docker зависимости Groth16 и большой proving key. | Наш native ARM адаптер — отдельная интеграция; наличие исходников не является подтверждением малой памяти. |

Страница reports.risczero.com во время исследования отвечала 502. Данные просмотрены в официальном `risc0/ghpages`. Отсутствующий результат для нужной версии не заменён цифрами другой версии.

## Проверка установленного 3.0.6

Pin исходников: `1cc70cf05033a79ebc90f07c679cb4bd1cd301b9`, checkout `/private/tmp/oncm-risc0-source`. Двоичный файл: `/private/tmp/oncm-toolchains/cargo/bin/r0vm` — официальный установленный 3.0.6. Проверка `--help` подтвердила flags и написание worker kinds.

### `--po2` работает не во всех режимах CLI

В [r0vm/src/lib.rs](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/r0vm/src/lib.rs) обычный `--elf` создаёт ExecutorEnv без применения `args.po2`. Следовательно, команда `r0vm --elf ... --po2 17 --receipt-kind succinct` **не меняет** segment limit. Кроме того, `--elf` всегда доказывает после исполнения; отсутствие `--receipt` не превращает команду в executor-only.

Actor mode с непосредственным `--elf` тоже создаёт ProofRequest с `segment_limit_po2: None`. Корректный готовый путь без пересборки host — **actor manager + HTTP API**:

1. `actors::App::new(..., args.po2, ...)` сохраняет po2 в API state.
2. [`api.rs` `prove_stark`](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/r0vm/src/api.rs#L369) копирует state.po2 в ProofRequest.
3. [`actors/worker.rs`](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/r0vm/src/actors/worker.rs#L486) вызывает штатный `env.segment_limit_po2(po2)`.
4. [`actors/job.rs`](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/r0vm/src/actors/job.rs#L405) собирает `InnerReceipt::Succinct`.
5. [`actors/manager.rs`](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/r0vm/src/actors/manager.rs#L100) сохраняет `bincode::serialize(Receipt)`.

Это вывод по оригинальному коду и готовому CLI; отдельного официального how-to с такой комбинацией flags и RAM замером не найдено. Подготовленная комбинация ещё не запускалась.

### Последний сегмент и Metal

Лимит 20 не означает обязательное дополнение каждого сегмента до 2^20. [Финальный сегмент](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/circuit/rv32im/src/execute/executor.rs#L335) уменьшается до следующей степени двойки фактических segment cycles. Один segment в executor output не сообщает его po2; для следующего испытания нужен debug log `preflight: po2`, а не предположение о padding.

В этом pin ветки выбора Metal закомментированы **и у rv32im, и у recursion**; при отсутствии CUDA выбирается CPU. Это независимо подтверждает проблему, описанную в #3753. Main-branch PR #3688 с Metal — другая ветка; переносить её свойства на установленный 3.0.6 нельзя.

## Неустранимая одним segment knob часть памяти

[Рекурсивный circuit использует `RECURSION_PO2 = 18`](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/recursion/prove/mod.rs#L58), независимо от po2 входного rv32im segment.

Оценка снизу по коду, **не измерение RSS**:

- В taps: 12 accum + 23 code + 128 data = 163 столбца.
- [WitnessGenerator](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/circuit/recursion/src/prove/witgen.rs) держит `163 × 2^18 × 4 B = 163 MiB` witness.
- `make_coeffs` создаёт ещё 163 MiB; [PolyGroup](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/prove/poly_group.rs) держит evaluated domain с `INV_RATE=4`, ещё 652 MiB.
- [Три Merkle tree](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/prove/merkle.rs) по `2 × (2^18 × 4) × 32 B` добавляют 192 MiB.
- Сумма перечисленных одновременно живых буферов — **1170 MiB**, до preflight, программы recursion, check/FRI, allocator/runtime и остальных процессов.

Эта оценка исключает обещание, что очень короткая теорема сделает Succinct prover почти бесплатным. Она сама по себе не доказывает невозможность 2 GiB. У нашего fixed Gnark final prover ситуация сильнее: один retained `pk.dmp` имеет 2,255,766,633 B, а после его чтения создаются дополнительные FFT buffers. Этот backend не проходит лимит 2 GiB; уменьшение Lean или STARK segment этого не исправляет. RapidSnark рассматривается отдельно, без заявления о выполнении бюджета.

## Подготовленный bounded trial, пока не запускался

Скрипт: [actor-registration-trial.py](/Users/ignatignat/Documents/ChatGPT/oncm/implementations/exchange/performance/actor-registration-trial.py).

```sh
python3 /Users/ignatignat/Documents/ChatGPT/oncm/implementations/exchange/performance/actor-registration-trial.py \
  --trial-dir /Users/ignatignat/Documents/ChatGPT/oncm/implementations/exchange/performance/actor-trial-po17-01
```

Публичная команда сама запускает **всё дерево** через `tools/lean-zk/resource-guard.py --memory-mib 2048 --timeout 120 --lock-file /private/tmp/oncm-worker-501.lock`. Python requestor, actor manager/worker и последующий verifier находятся внутри guard. Директория результатов должна быть новой. При занятом lock задания не стартуют. Цепи, web/API приложений и manifest/runtime не затрагиваются.

Внутренняя команда оригинального бинарника:

```sh
r0vm --manager \
  --worker execute,prove-segment,prove-keccak,lift,join,union,resolve \
  --api 127.0.0.1:43173 --storage TRIAL/storage --po2 17
```

Без `--config` список worker kinds превращается в **один pool, count=1, profile=None**. `profile=None` принципиален: файлы тестовых профилей RTX в upstream задают DevModeDelay и для настоящего trial не применяются. Dev mode запрещён. Указывается `RAYON_NUM_THREADS=2`, `TOKIO_WORKER_THREADS=2` и ограничение остальных известных thread pools.

**Ограничение потоков:** это настройка Rayon/Tokio pools, а не доказанный предел двух OS threads/двух одновременно работающих потоков для всего процесса. Даже один actor worker имеет отдельные CPU preflight и prover queues и может их перекрывать. Штатного флага полной сериализации этих queues не найдено. Если требование трактуется строго как максимум два вычислительных потока на всю машину, этот recipe требует дополнительного решения до запуска; нельзя считать требование выполненным по одному env var.

Actor mode безусловно создаёт OTLP exporters. Подготовленный requestor удаляет внешние OTEL endpoint настройки и направляет telemetry на закрытый loopback endpoint; удалённой отправки нет. Это не заявляется как отключение внутренних exporter threads.

### Вход, HTTP routes и формат результата

Guest бинарник — **packed `ProgramBinary`** perf05, не голый пользовательский ELF. Именно его принимает `ExecutorImpl::from_elf` через `ProgramBinary::decode`. Вход идентичен прежнему host serde: little-endian u32 `goalLength=1622`, `outcome=0`, `VecLength=1622`, затем 1622 u32, каждый содержит один исходный byte. Итого **6500 B**. JSON, bincode Receipt и эта guest serialization — три разные сущности.

| Действие | Route | Точные поля/результат |
|---|---|---|
| Загрузить packed guest | `PUT /images/upload/{imageId}` | Raw bytes; server пересчитывает imageId |
| Загрузить input | `PUT /inputs/upload/perf05-true-register` | Raw 6500-byte wire |
| Начать ровно один proof job | `POST /sessions/create` | `{"img":"<imageId>","input":"perf05-true-register","assumptions":[],"execute_only":false,"exec_cycle_limit":null}` → `{"uuid":"..."}`; submission не повторяется при неопределённом ответе |
| Статус | `GET /sessions/status/{uuid}` | `status`, `state`, `error_msg`, `stats.segments/total_cycles/cycles`, `receipt_url`; нет поля `receipt_kind` |
| URL результата | `GET /receipts/{uuid}` | JSON `{"url":"..."}`; тип криптографии не указывает |
| Скачать | `GET /receipts/stark/receipt/{uuid}` | Binary **bincode1 `Receipt`**, не MessagePack и не JSON |

`SUCCEEDED`/`receipt_url` не удостоверяют proof type. Тип известен по actor implementation и повторно проверяется по `InnerReceipt::Succinct` в bincode. Маршруты `exec_only_journal`/`snark` в этом actor API не используются; нельзя по их наличию предполагать рабочую executor-only или Groth16 реализацию. Поля `execute_only` и `exec_cycle_limit` handler сейчас не применяет; общий time/memory guard обязателен.

### Независимая криптографическая проверка без host rebuild

После скачивания manager останавливается и reaped. Requestor начинает временный loopback listener и запускает **тот же оригинальный `r0vm --port PORT`**. Это готовый zkVM client/server API: он подключается к listener, получает HelloRequest 3.0.6, затем ровно **`ServerRequest.verify`**.

Формат: u32 little-endian длина + protobuf message. [Оригинальный `.proto`](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/protos/api.proto) задаёт verify field 9; `VerifyRequest.receipt` — Asset.inline с исходными bincode bytes, `image_id` — восемь u32 digest words. [Server handler](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/api/server.rs#L815) десериализует Receipt и вызывает **`receipt.verify(expectedImageId)`**. Только `GenericReply.ok` и exit 0 означают успех.

Тонкий Python-клиент реализует framing, строгий schema reader для type/journal и сравнение 128-byte journal с ожидаемым `domain || goalHash || profileId || outcome0`. Нового prover/cryptographic verifier в нём нет. Нельзя использовать ошибку существующего ONCM host `inspect` как подтверждение: после проверки он требует Groth16 и возвращает тот же ReceiptFormatError, который может означать настоящую ошибку формата.

Ожидаемые отдельные bindings:

- Image `296fb3bbf5eb7df9fb7115826df31c71411ee0f8153970c7618c76ab01539feb`.
- Profile `93cf174539debc6ddce2691f3def1e36023cf77fe1d93f1692f330150bd37e10`.
- Goal `2baf8be8fc5ecd150cd5b5086b52c4f2591d407093d4f6b77f767afc1c113f4b`.
- Claim: `∀ P : Prop, P → P`, zero-axiom foundation с проверенным False. Это отдельный ограниченный математический профиль, не замена Nat.add_comm.

Скрипт не включает следующий Groth16 этап. Успешный trial даст реальный **Succinct STARK receipt**, ещё не сертификат для текущего EVM bridge. Финальный acceptance остаётся невыполненным до отдельного настоящего final proof + onchain verify.
