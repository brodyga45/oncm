# Lean → zk → ончейн: исследование готовых компонентов

Дата проверки: 2026-09-09. Статус: архитектурная рекомендация; backend ещё не выбран. Изучены первичные документы и исходники, во временные каталоги скачаны NanoDa, Comparator, lean4export, Ix и zkPi+. Сборки, генерация сертификатов и измерения в нашем окружении не выполнялись. Ни один путь ниже ещё не прошёл наш сквозной тест с Solidity verifier.

## Вывод для выбора архитектуры

Есть три осмысленных пути. **Первым проверяем NanoDa в стандартной zkVM; параллельно коротко проверяем готовый стек Ix.** NanoDa требует больше связующего кода, зато позволяет использовать штатный RISC Zero/SP1 и готовый EVM verifier. Ix уже реализует гораздо больше пути Lean → проверяющая программа → zk, однако остаётся pre-alpha и имеет конкретные несовместимости с production SP1. zkPi доказывает осуществимость специализированного подхода, но его совместимость и условия переиспользования недостаточны для основной реализации.

Главная собственная часть — не новая криптография и не новый Lean kernel. Это **доказанная привязка выбранной цели и её окружения к проверенному proof term**, политика аксиом, формат публичного результата и его адаптер к резолверу. Успешный запуск внешнего Comparator эту часть внутри zk не заменяет.

| Путь | Что уже готово | Что предстоит соединить | Рекомендация |
| --- | --- | --- | --- |
| A. NanoDa + RISC Zero либо SP1 | Rust checker, экспорт Lean, готовый proving SDK и Solidity verifier | Guest I/O, идентичность цели, аутентификация зависимостей и аксиом; совместимость/ресурсы zkVM | Основной кандидат первого spike |
| B. Ix + Zisk либо SP1 | Собственный checker, Ixon, guest/host, условные claims и агрегация зависимостей | Политика нашего рынка, привязка типа цели, приемлемый production backend и EVM proof | Близкий готовый проект, исследовать до самостоятельной реализации аналогов |
| C. zkPi / zkPi+ | Специализированный исследовательский pipeline для Lean proof terms | Современная совместимость Lean, покрытие, лицензия, актуальный EVM verifier | Исследовательский резерв |

Выбор proof backend не должен менять AMM или права выгодополучателей: он реализует единый `ProofAdapter`, выпускающий одинаковое проверяемое решение по `statementId`.

## Реестр проверенных зависимостей

SHA ниже — снимки исследования, а не утверждение, что все эти версии совместимы между собой или рекомендованы к production.

| Компонент | Проверенный идентификатор | Лицензия и роль |
| --- | --- | --- |
| [NanoDa](https://github.com/ammkrn/nanoda_lib/tree/4c544ed4099c8227f07d5de77ad1e69fb0740a27) | `0.4.16`, `4c544ed4099c8227f07d5de77ad1e69fb0740a27` | Apache-2.0; независимый Rust checker |
| [Comparator](https://github.com/leanprover/comparator/tree/2312244ac716564a61cc0bf4e107d9abf1757a61) | `0.1.0`, `2312244ac716564a61cc0bf4e107d9abf1757a61`; toolchain `Lean v4.34.0-rc2` | Apache-2.0; Challenge/Solution comparison и независимый replay |
| [lean4export](https://github.com/leanprover/lean4export/tree/411dce7db58a3afc60ecab2d211acd1042b593dc) | `411dce7db58a3afc60ecab2d211acd1042b593dc`; toolchain `Lean v4.34.0-rc2`, NDJSON `3.1.0` | Apache-2.0; экспорт объявлений и транзитивных зависимостей |
| [Ix](https://github.com/argumentcomputer/ix/tree/eea8f5d8fbf4ea52833d5a099f5d0bc24bd019af) | workspace `0.1.0`, `eea8f5d8fbf4ea52833d5a099f5d0bc24bd019af`; `Lean v4.33.1` | MIT OR Apache-2.0; content-addressed Lean и zk pipeline |
| [RISC Zero Ethereum](https://github.com/risc0/risc0-ethereum/tree/3aa137844818f0f44e6b2962b6eb958f26d04be7) | HEAD `3aa137844818f0f44e6b2962b6eb958f26d04be7`; также обнаружен tag `v3.0.1` | Проверенный `IRiscZeroVerifier.sol`: Apache-2.0; Solidity verifier. Версию SDK согласовать с выбранным release |
| [SP1 contracts](https://github.com/succinctlabs/sp1-contracts/tree/d3629729c3216eb51bd4859d027a8eb729399fa4) | `v6.1.1`, commit `d3629729c3216eb51bd4859d027a8eb729399fa4` | Проверенный `ISP1Verifier.sol`: MIT; штатная проверка EVM proofs |
| [zkPi original](https://github.com/emlaufer/zkpi/tree/ff136f79ca5843cafed61bc1222a5dd85d7a8646) | HEAD `ff136f79ca5843cafed61bc1222a5dd85d7a8646` | На просмотренной странице корня явная лицензия не обнаружена; не считать автоматически разрешённым к копированию |
| [zkPi+](https://codeberg.org/mtoohey/zkpi) | `15adc7c9708d869947cfb18592336c7f1d15a489`; examples `Lean v4.28.0` | В клонированном корне нет LICENSE и поля license в Cargo.toml; лицензии вложенных зависимостей не лицензируют собственный код проекта |

Comparator на просмотренном снимке ссылается на `lean4export` через `rev = "master"`. В нашем воспроизводимом профиле это заменяется точным разрешённым commit и lockfile. Нельзя собирать финансово значимый checker по плавающим веткам. Лицензии таблицы описывают проверенные проекты/файлы; перед включением бинарных зависимостей нужен полный dependency manifest.

## A. NanoDa в стандартной zkVM

### Что переиспользуется

NanoDa предоставляет Rust library, а не только CLI. Внутренний `parser::parse_export_file` принимает `BufRead`, но на проверенном commit имеет видимость `pub(crate)`; публичный `Config::to_export_file` использует файл либо stdin. Для guest bytes input потребуется небольшой патч API: открыть чистый reader/bytes entrypoint, не копируя parser. `ExportFile::check_all_declars` уже публичен и имеет последовательный путь при `num_threads <= 1`. Это позволяет проектировать проверку без запуска команд и чтения `.olean`, однако **совместимость с RISC-V target ещё не проверена**. [Parser](https://github.com/ammkrn/nanoda_lib/blob/4c544ed4099c8227f07d5de77ad1e69fb0740a27/src/parser.rs), [type checker](https://github.com/ammkrn/nanoda_lib/blob/4c544ed4099c8227f07d5de77ad1e69fb0740a27/src/tc.rs).

Проверенный parser принимает NDJSON версии `>= 3.1.0, < 3.2.0`; текущий lean4export документирует `3.1.0`. Это совместимость формата, а не подтверждённое покрытие всех конструкций конкретной версии Lean. В metadata находятся `Lean.version/githash`, но сами строки заголовка не удостоверяют происхождение данных. [Формат экспорта](https://github.com/leanprover/lean4export/blob/411dce7db58a3afc60ecab2d211acd1042b593dc/format_ndjson.md).

Comparator остаётся готовой предварительной проверкой в SDK/worker: сравнить постановку и решение, получить понятные ошибки, replay в Lean и NanoDa. Его сравнение значимых определений можно использовать как спецификацию и набор тестов для guest. Сам Comparator написан на Lean; это не готовая Rust-библиотека сравнения, которую можно без изменений подключить к NanoDa. [Код сравнения](https://github.com/leanprover/comparator/blob/2312244ac716564a61cc0bf4e107d9abf1757a61/Comparator/Compare.lean), [контроль аксиом](https://github.com/leanprover/comparator/blob/2312244ac716564a61cc0bf4e107d9abf1757a61/Comparator/Axioms.lean).

### Политика внутри guest

Профиль задаёт разрешённые аксиомы; submitter не передаёт произвольный NanoDa Config. Начальный кандидат — `propext`, `Classical.choice`, `Quot.sound`; `sorryAx` и `Lean.trustCompiler` не разрешены. Проверяется зависимость доказательства, а не наличие слова `sorry` в тексте. Nat/String kernel extensions фиксируются явно. NanoDa допускает небезопасный флаг `unsafe_permit_all_axioms` и пример README включает `Lean.trustCompiler`; копировать пользовательский конфиг как политику протокола нельзя. [Настройки NanoDa](https://github.com/ammkrn/nanoda_lib/blob/4c544ed4099c8227f07d5de77ad1e69fb0740a27/README.md).

Дополнительный обязательный binding: allowlist **имён** не удостоверяет **типы и значения** объявлений. Нельзя доверять произвольному экспортированному `axiom propext : False`. Guest должен аутентифицировать полные разрешённые объявления стандартных аксиом и примитивов относительно профиля. Все прочие объявления закрываются проверкой зависимостей. Аналогично нельзя подменить `Nat`, `False`, используемые определения или значение `marketGoal`. [Проверка допуска по имени в parser](https://github.com/ammkrn/nanoda_lib/blob/4c544ed4099c8227f07d5de77ad1e69fb0740a27/src/parser.rs).

На первом шаге предпочтительна полная проверка closure. Позже можно проверять общую библиотеку один раз и переиспользовать **проверенные сертификаты** по commitment. Простое доверие к хэшу Mathlib-кеша или список разрешённых imports не заменяет проверку математических оснований.

### Ончейн-стык

RISC Zero даёт интерфейс `verify(seal, imageId, journalDigest)`. Его безопасный `verify` связывает успешное завершение guest и журнал, требуя безусловный receipt; низкоуровневый `verifyIntegrity` сам по себе не снимает незакрытые assumptions. Adapter сам вычисляет digest ожидаемого/полученного journal и сверяет его поля с statement. [IRiscZeroVerifier](https://github.com/risc0/risc0-ethereum/blob/3aa137844818f0f44e6b2962b6eb958f26d04be7/contracts/src/IRiscZeroVerifier.sol).

SP1 даёт `verifyProof(programVKey, publicValues, proofBytes)`. Выбирается EVM-совместимое доказательство и согласованная версия SDK/verifier; корректный `Compressed` proof нельзя просто считать calldata для штатного EVM verifier. [ISP1Verifier](https://github.com/succinctlabs/sp1-contracts/blob/d3629729c3216eb51bd4859d027a8eb729399fa4/contracts/src/ISP1Verifier.sol), [SP1 contracts usage](https://github.com/succinctlabs/sp1-contracts).

Штатные routers/gateways удобны, но их владельцы могут управлять маршрутами. Конкретный профиль должен описывать адрес verifier, его код и правила маршрутизации. Нельзя обещать неизменяемый профиль, если семантически значимая зависимость остаётся произвольно изменяемым внешним gateway.

## B. Ix: уже есть Lean checker внутри zkVM

Это наиболее близкий найденный интегрированный проект, а не просто набор общих библиотек. Помимо собственного формата Ixon у него есть `sp1/guest`, `sp1/host`, `zisk/guest`, `zisk/host` и проверка зависимостей. README содержит запускаемые команды, но явно обозначает проект **pre-alpha**. В current SP1 path используется fork с BLAKE3 precompile и требуется `WITHOUT_VK_VERIFICATION=1`; этот режим не является production-safe. Это конкретный стоп-фактор для подключения найденного SP1 guest к штатному verifier без дополнительной работы. [Ix README](https://github.com/argumentcomputer/ix/blob/eea8f5d8fbf4ea52833d5a099f5d0bc24bd019af/README.md), [SP1 host dependencies](https://github.com/argumentcomputer/ix/blob/eea8f5d8fbf4ea52833d5a099f5d0bc24bd019af/sp1/host/Cargo.toml).

Из guest-кода видно, что публичный результат содержит `failures`, `subject_root`, `assumptions_root`, `checked_count`, `env_hash`. `failures == 0` недостаточно: нужно доказать включение именно требуемого результата в subject set, раскрыть/аутентифицировать его тип и принять только разрешённые остаточные assumptions. Пустое окружение тоже может завершиться без ошибок. Режим `--skip-deps` оставляет зависимости доверенными; запрет только на уровне нашего CLI недостаточен, эти остатки должны быть отклонены проверяемой политикой. [SP1 guest](https://github.com/argumentcomputer/ix/blob/eea8f5d8fbf4ea52833d5a099f5d0bc24bd019af/sp1/guest/src/main.rs).

Полезный готовый дизайн — `Claim.check`, `checkEnv`, `reveal`, `contains`, `catalog`: claims о проверенных константах можно объединять, снимая зависимости по content addresses. Ixon идентифицирует **константу**, её proof/body входит в идентичность. Поэтому идентификатор ещё неизвестного будущего доказательства нельзя записывать в `statementId`. Для рынка нужен отдельный commitment к типу цели и определениям; `reveal/contains` — кандидаты для связи с доказанной константой, но весь adapter ещё нужно реализовать и проверить. [Claim types](https://github.com/argumentcomputer/ix/blob/eea8f5d8fbf4ea52833d5a099f5d0bc24bd019af/Ix/Claim.lean), [kernel identity](https://github.com/argumentcomputer/ix/blob/eea8f5d8fbf4ea52833d5a099f5d0bc24bd019af/docs/kernel_identity.md).

Zisk-путь документирует генерацию `VadcopFinal` и агрегацию shards. Наличие такого proof не доказывает автоматически, что он принят выбранным EVM контрактом. Перед выбором Ix нужен отдельно воспроизведённый финальный onchain proof с публичной целью и axiom policy. Числа из чужих GPU benchmarks не переносим в стоимость проверки наших задач.

В исходниках есть работы по обоснованию собственного kernel, но отсутствие `partial def` и ограниченные рекурсии не равнозначны доказанной soundness. Авторы прямо отделяют эти свойства. [Kernel audit scope](https://github.com/argumentcomputer/ix/blob/eea8f5d8fbf4ea52833d5a099f5d0bc24bd019af/docs/tc-k0-backedge-audit.md).

## C. zkPi и ложные совпадения названий

zkPi действительно реализует ZK для Lean-теорем. Авторы сообщают о покрытии 57,9% stdlib и 14,1% mathlib за 4,5 минуты на теорему на своей выборке. Это результат статьи, а не гарантия для актуальных Lean/Mathlib или нашего железа. [Статья zkPi, CCS 2024](https://eprint.iacr.org/2024/267).

В 2026 появился студенческий zkPi+: обновлён parser через NanoDa, добавлена поддержка нескольких конструкций. Авторы не измерили новое полное покрытие из-за вычислительных ограничений, описывают проблемы скорости и недостающие возможности. Значит, это полезный прототип, но переход на него вместо NanoDa не избавляет от research. [Отчёт авторов zkPi+](https://pps-lab.com/student-blogs/zkpi-plus/). Состояние лицензии в таблице выше — дополнительная причина не закладывать копирование этих исходников в основной план.

Не путать:

- [Galois zkLean](https://github.com/GaloisInc/zkLean) — DSL для описания и проверки ZK-схем в Lean, а не универсальная упаковка произвольного Lean-доказательства в zk.
- [succinctlabs/sp1-lean](https://github.com/succinctlabs/sp1-lean) — формальная проверка частей SP1 в Lean, а не Lean checker guest.
- [risc0/risc0-lean4](https://github.com/risc0/risc0-lean4) — модель RISC Zero в Lean; README обозначает research artifact.
- [zkVerify](https://docs.zkverify.io/architecture/verification_pallets/risc0) умеет проверять сертификаты RISC Zero/SP1, но не добавляет проверку Lean. Его использование добавляет отдельный settlement/aggregation путь и доверительные зависимости сети; для первой EVM версии прямой verifier проще.

## Что именно является условием рынка

### Рекомендованный вариант: каноническая kernel-цель

Экономическое условие — опубликованный канонический артефакт `P : Prop`, транзитивные определения и профиль оснований. `.lean`-исходник и человеческое описание сопровождают этот артефакт. SDK воспроизводимо собирает/сравнивает source и canonical artifact и показывает расхождения, однако нельзя выдавать такую внешнюю сверку за ончейн-доказательство связи.

Это **отдельный продуктовый выбор**, который следует показывать пользователю: он ставит на конкретную формальную цель; source отображается с данными воспроизводимости. Commitment `sourceHash` сам по себе обещает только неизменность исходных байтов. Не доказано, что эти байты elaborated именно в зарегистрированную цель. Отсутствие возможности пересобрать пакет должно быть заметно перед торговлей.

Регистрация без знания доказательства не требует вводить аксиому `P`:

```lean
-- Все параметры цели замкнуты внутри ∀.
def marketGoal : Prop := ∀ n : Nat, n + 0 = n

-- Этот модуль появляется позднее, с собственным body proof.
theorem solution : marketGoal := by
  intro n
  exact Nat.add_zero n
```

Регистрационный guest проверяет корректность определения `marketGoal` и того, что его значение имеет тип `Prop`; он **не доказывает P**. Его публичный output связывает hash definition/goal/closure с proof profile. Артефакт этой постановки не содержит `sorryAx`. При импорте Palomar `Challenge` с theorem-placeholder SDK извлекает тип в такой goal package; это преобразование не считается автоматически доказанным source bridge.

Резолв-guest принимает доказательство `P`, либо строит отрицательную цель `P → False` из зафиксированного P и аутентифицированного стандартного False. Приём False означает успешную проверку терма **этого отрицания**. Нельзя объявить `axiom P`, а затем вывести из него нужный исход; нельзя принимать произвольное `Q` под строковым именем `NotP`.

Канонизация сначала может быть консервативной: точные байты versioned export/goal package. Математически эквивалентные цели могут иметь разные ID. Дорогая автоматическая идентификация эквивалентных теорем для работоспособности рынка не нужна.

### Более сильный вариант: source является самой спецификацией

Если условие рынка определяется именно результатом исполнения конкретных `.lean`-байтов, регистрационный сертификат должен покрывать pinned elaboration/export либо отдельный проверяемый перевод source → target. Это можно выполнять один раз при регистрации, затем переиспользовать commitment; но для этого нужен более полный Lean toolchain внутри доказываемого исполнения. В проверенных проектах готового воспроизведённого безопасного source→goal→EVM пути не установлено. Ix компилирует исходники офчейн в Ixon; его гостевая проверка Ixon сама по себе не удостоверяет результат исполнения данного исходника.

## Минимальные контракты интеграции

Это предлагаемая схема, не готовый ABI. Точная сериализация публичных значений фиксируется по версии и тестируется одинаковыми vectors в Rust/Lean/TypeScript/Solidity.

```text
ProofProfile {
  profileId                // hash immutable manifest
  checkerArtifactHash      // checker source/build/toolchain commitments
  exportFormatId
  foundationCommitment     // full definitions of permitted primitives/axioms
  axiomPolicyHash
  canonicalizationId
}

Backend {
  backendId
  profileId
  verifierAddress
  verifierCodeHash
  programId                // RISC Zero imageId or SP1 programVKey
  proofSystemVersion
  publicOutputSchemaId
}

RegisterGoalOutput {
  domain                   // protocol + schema
  profileId
  goalCommitment
  statementEnvironmentCommitment
  isWellFormedProp = true
}

ResolveOutput {
  domain
  statementId
  profileId
  goalCommitment
  statementEnvironmentCommitment
  outcome                  // ProvenTrue | ProvenFalse
  solutionCommitment
}

IProofAdapter.verifyRegistration(backendId, publicOutput, proof)
IProofAdapter.verifyResolution(backendId, publicOutput, proof)
```

Адаптер проверяет backend/profile и криптографию; registry сверяет goal/statement identity с сохранённой записью. Поля `sourceHash` и URI хранятся как provenance, пока отдельный проверяемый source bridge не включён в профиль. Chain/registry domain нужен там, где сертификат авторизует конкретное действие; переносимость чистого математического доказательства и повторное использование его другим рынком можно разрешить явно. Повторная подача не должна менять финальный outcome или повторно выплачивать награду, если такая награда будет введена.

## Неизменяемые профили и governance

1. Новый Lean, NanoDa, Ix, политика аксиом или канонизация создают новый profile ID. Обновление сайта/SDK не меняет смысл существующих statement.
2. Замена криптографического backend при прежней математической семантике тоже не происходит автоматически: либо заранее разрешён набор backend, либо профиль содержит явно выбранную политику добавления реализаций. Нужно оценить, может ли governance этим подменить checker.
3. Отзыв уязвимого verifier и выплата ранее разрешённых рынков — отдельная политика. Остановка новых сертификатов может заблокировать старые рынки; незаметно «перепроверить новым Lean и изменить результат» нельзя.
4. Source commit, хэш сборки, program ID и код verifier фиксируются отдельно. Reproducible build позволяет сверить их; один GitHub commit не доказывает происхождение бинарника.
5. Зависимости новой Solution могут расширять исходное окружение, но не менять определения исходной P и разрешённые основания. Доказанные заново вспомогательные леммы не требуют governance только потому, что раньше их не было в Mathlib.

## Palomar: полезная интеграция без oracle-зависимости

Переиспользовать Challenge/Solution, `formalization.yaml`, Comparator и ссылки на immutable snapshot. Каталог полезен для импорта метаданных, поиска источников, тестовых формализаций и отображения подтверждённого происхождения. В одной записи могут быть несколько целей; для рынка выбирается конкретная. Опубликованное решение проходит наш pipeline и тот же proof profile. Статус Palomar не разрешает рынок и не меняет `resolvedAt`. [Palomar About](https://palomar-registry.org/about).

Машинный интерфейс документирует JSON, CC0 для данных и ссылки `id + version`; unversioned ID плавает на последнюю версию. Комментарии предоставляет наше приложение — Palomar их не ведёт. Регистрация нашего результата в Palomar — необязательное действие автора. [Palomar machine interface](https://palomar-registry.org/llms.txt).

## Bounded spike перед окончательным выбором

Задача spike — получить один реальный сертификат, принимаемый локальным Solidity verifier, и проверить, что он не принимается для другой цели. Это gate выбора реализации, а не многомесячная разработка нового kernel.

1. **Общий fixture bundle.** Одна версия Lean, точные dependencies, `def marketGoal : Prop`, положительный пример, отрицательный пример другой цели и небольшая теорема с Mathlib. Сначала собрать/export/check штатными инструментами. Добавить неизменный fixture из Palomar для реального размера после маленьких примеров.
2. **Путь A.** NanoDa library в стандартном RISC Zero guest; serial mode, bytes input, фиксированный Config. Если возникает существенная несовместимость target — короткий перенос того же guest на стандартный SP1. Не переписывать kernel ради SDK.
3. **Путь B.** Воспроизвести Ix/Zisk на тех же целях, проверить assumptions и target binding; установить, есть ли полностью замкнутый путь до выбранного EVM verifier. Не принимать `WITHOUT_VK_VERIFICATION=1` за успешный production результат. Допустим отдельный эксперимент с обычным BLAKE3 в стандартном SP1, если это малая адаптация.
4. **Обязательные негативные случаи.** Подмена theorem/type, определения `P`, стандартной аксиомы под разрешённым именем, ложный metadata `Lean.githash`, `sorryAx`, `Lean.trustCompiler`, непроверенная зависимость, пустой набор целей, proof для другого statement/profile, изменённый public output, повторная подача и повреждённый proof. Для false-исхода проверить, что доказательство P не принимается как доказательство `¬P`.
5. **Измерения.** Размер goal/closure/solution export; cycles, память, wall time и железо; полное proving с финальным wrapper; proof size; gas фактического `verifyResolution`. Отдельно записать время компиляции/тактик вне zk и время проверки внутри zk.
6. **Решение.** Выбрать A либо B по воспроизведённой связке, сложности поддерживаемого diff, публичному target binding и ресурсам. Если оба пути пока непригодны, явно сузить допустимые профили/размеры задач или продолжить исследование; не заменять zk ручным oracle под прежним названием.

Рекомендуемый первый scope: одна Lean-версия, один стандартный набор оснований, полная проверка closure, один EVM backend, публичные goal artifacts. Private proof terms, reusable library certificates, новые языки и доказанный source bridge могут добавляться как новые профили после измерений. Это предложение по этапам, а не отказ от желаемого конечного продукта.
