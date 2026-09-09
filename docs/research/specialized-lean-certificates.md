# Специализированный сертификатор Lean вместо полного CPU zkVM

Проверено 2026-09-10, только первичные публикации и исходники. Ни сборок, ни proving,
ни изменений работающих приложений. Документ дополняет, а не повторяет
`../low-resource-proving-research.md`: главное новое свидетельство — точные текущие
измерения специализированного Ix/Aiur и границы его итогового сертификата.

**Ответ:** существующий путь без RISC-V CPU trace есть — схема, проверяющая
вывод типизации. Но готовая замена, одновременно сохраняющая нашу полную проверку
Lean/dependency closure и подтверждённые 2 GiB/120 s до EVM certificate, в
проверенных проектах не найдена. Это ограничение найденных реализаций и измерений,
а не утверждение, что такой механизм невозможен.

## Две подходящие архитектуры и конкретные реализации

| Кандидат | Что переиспользовать вместо универсального CPU | Измеренное/реализованное | Практический вывод |
| --- | --- | --- | --- |
| **Ix/Aiur** | Lean→Ixon compiler, IxVM dependent typechecker, Aiur DSL→multi-STARK, рекурсивный verifier | Специализированный pipeline `ixvm`→`fri-verifier`; aggregate proof уже существует, финальные KZG стадии ещё развиваются | Наиболее актуальный кандидат для отдельного исследования полной Lean4-логики; не готовый компактный EVM backend |
| **zkPi / zkPi+** | lean export→упрощение proof term→typing derivation→CirC/ZoKrates circuit→Mirage SNARK | Прямое доказательство корректности dependent typing, не trace машины; поддержка Lean неполна | Готовый исходный материал для специализированной схемы; существенная совместимость/доведение, не только API adapter |

У zkPi circuit проверяет типизацию приватного доказательства относительно
публичной теоремы/аксиом. Это не просто схема для `a+b=b+a`: схема параметризована
размерами typing derivation, terms, contexts и inductive declarations. Размер
параметров задаёт capacity схемы и стоимость setup/prove. Работа сообщает
57.9% stdlib и14.1% mathlib, доказанные в пределах4.5мин на теорему;
массовые эксперименты — GCP e2-highmem-8,8cores/64GB, timeout30мин. Это не
гарантия для всех теорем; часть examples дополнительно использует публичные
аксиомы, поэтому их времена нельзя переносить на наш закрытый профиль без
сопоставления оснований. [zkPi paper, §§5–7](https://eprint.iacr.org/2024/267.pdf)

Реализация закреплена на
[emlaufer/zkpi ff136f79](https://github.com/emlaufer/zkpi/tree/ff136f79ca5843cafed61bc1222a5dd85d7a8646).
Продолжение zkPi+ обновляет формат через NanoDa parser и добавляет quotients/
inductive families. Авторы от08.04.2026 прямо не смогли измерить performance
изменений из-за вычислительных ограничений; strings слишком медленны,
eta-expansion и другие возможности ещё отсутствуют. Это не опубликованный
быстрый Lean4 backend. [Отчёт авторов и ссылка на исходники](https://pps-lab.com/student-blogs/zkpi-plus/)

## Новые точные данные Ix/Aiur

Для воспроизводимости прочитаны именно файлы commit
[`4c91254346284dcd984f1940f2c527114b1c5190`](https://github.com/argumentcomputer/ix/tree/4c91254346284dcd984f1940f2c527114b1c5190)
от09.09.2026; `lean-toolchain` =4.33.1. Aiur является генератором специализированных
multi-STARK circuits. Репозиторий помечен pre-alpha. [Pinned README](https://github.com/argumentcomputer/ix/blob/4c91254346284dcd984f1940f2c527114b1c5190/README.md)

| Опубликованный результат | Что действительно измерено | Чего он не доказывает |
| --- | --- | --- |
| 29.08.2026: **7,443,023 bytes** | Verified lift proof, default q=100/PoW20; wrapper7,443,061bytes | Не256B Groth16 и не готовый дешёвый EVM certificate |
| Join smoke: **6.64s**, peak RSS **11,451,486,208B**, native verify2.69ms, proof397,177B | Отдельный wiring gate, q=1/PoW0 | Авторы прямо не считают это стоимостью production W0; q50 остаётся large-box benchmark |
| `ixvm` + `fri-verifier` metrics | Реальный proof pipeline; execute-only вынесен отдельно | Параметры/время одной стадии нельзя выдавать за полный итог; KZG стадии добавляются по мере готовности |

Источник чисел и их ограничений —
[Pinned benchmark specification, Aggregate W0 baselines](https://github.com/argumentcomputer/ix/blob/4c91254346284dcd984f1940f2c527114b1c5190/docs/benchmarking.md).
Dashboard Bencher при этом чтении не загрузился; новых чисел из него не извлечено.
Headline «около1KB/sub100ms» не принимается здесь за измеренный end-to-end продукт.

Для сравнения, отдельный Ix/SP1 README сообщает Nat.add_comm compressed proof
~14s на RTX PRO6000 против~466s CPU, но с experimental отключением VK-allowlist
verification. Этот результат не предлагается для deployment и не относится к
Aiur; мы ничего подобного не включали. [Pinned backend description](https://github.com/argumentcomputer/ix/blob/4c91254346284dcd984f1940f2c527114b1c5190/README.md#proving-under-sp1)

## Что похоже по названию, но не заменяет сертификатор

| Найденный проект | Настоящая задача | Применимость |
| --- | --- | --- |
| **Galois zkLean** | DSL: задавать ZK circuits и доказывать их свойства в Lean; есть LLZK interchange | Может помочь обосновать специализированную схему, но не превращает произвольный Lean proof в ZK certificate. [Pinned README014fa397](https://github.com/GaloisInc/zkLean/blob/014fa397fa30e60964310dc2ff5d70aeed3c8022/README.md) |
| **NanoDa** | Обычный внешний Lean4 typechecker, Rust API, explicit axiom policy | Уже переиспользуется у нас. Его быстрый native verdict сам по себе не проверяется Ethereum; заменить VM на подпись сервера означает изменить доверие. [Upstream4c544ed4](https://github.com/ammkrn/nanoda_lib/tree/4c544ed4099c8227f07d5de77ad1e69fb0740a27) |
| **Lean4Lean** | Внешний Lean4 kernel на Lean и его формальная проверка | Reference для проверки другого kernel. Публичные времена — native typechecking, не ZK proving. [Реализация8223d223](https://github.com/digama0/lean4lean/tree/8223d223ed98661882e95d9d6a7126df7097cd76), [статья](https://arxiv.org/abs/2403.14064) |
| **Lean Kernel Arena** | Tests/benchmarks обычных Lean kernels | Полезен для correctness regression при выборе нового checker; зелёная таблица не сертификат для EVM. [Официальная arena](https://arena.lean-lang.org/) |

Отдельный продукт с названием «Provable/zkLean», имеющий опубликованный full
Lean-kernel ZK backend и подходящие измерения, в этом bounded поиске не установлен.
Например, сервисы подписанных Lean результатов прямо описывают Ed25519 attestation:
подпись доказывает происхождение ответа, а не независимое выполнение kernel на
цепи. [Пример первичного описания такого сервиса](https://www.opencommunication.app/)
Не подменяем отсутствие найденной реализации списком одноимённых маркетинговых услуг.

## Что означает сохранить ту же логику

Наша инженерная оценка: специализированная проверка типизации может сохранить
математическую задачу без CPU trace, если одновременно связывает точную цель,
окружение и axiom policy, проверяет dependency closure и proof/refutation,
а финальный onchain verifier проверяет именно это отношение. Смена формата
экспорта/circuit/VK потребует явно нового профиля или доказанной совместимости;
старый profile ID нельзя молча переназначить другому relation.

Схема проверки одной арифметической операции или bounded перебора может быть
намного дешевле, но это другой класс утверждений. Она не заменяет проверку
`∀ n : Nat, P n` исполнением на нескольких примерах. Native checker + Ed25519,
TEE или доверенная база ранее проверенных теорем тоже меняют модель доверия.
Proof-carrying dependencies можно переиспользовать без такого изменения только
при криптографической проверке их сертификатов и точных commitments.

Конкретный следующий шаг при выборе специализированного направления — получить
от upstream Ix/Aiur существующий воспроизводимый полный proof+verify artifact
для маленькой closed Lean4 теоремы с production parameters, размером, RAM и
полным временем всех стадий, затем проверить совместимость нашего relation и
доступный EVM verifier. До этих данных не запускать здесь новый большой build
и не обещать численный выигрыш. Для рынка, который нужен сейчас, замену текущего
backend этим исследованием не объявляем готовой.
