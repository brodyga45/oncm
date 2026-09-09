# Почему короткая Lean-проверка превращается в дорогой RISC Zero proof

Обновлено 10 сентября 2026 по сохранённым артефактам успешного [CI3 `34416918326`](https://github.com/brodyga45/oncm/actions/runs/34416918326), без новых сборок или вычислений при обновлении документа. Разобран оригинальный RISC Zero 3.0.6, commit `1cc70cf05033a79ebc90f07c679cb4bd1cd301b9`.

Главный вывод: **13.10299 ms исполнения guest** превратились в **465.69355 s получения и проверки настоящего Groth16 receipt** на четырёх CPU. Сертификат затем принят оригинальным EVM verifier. Это успешный proof pipeline, но не измерение сложности доказательства коммутативности: CI3 проверял регистрацию `∀ P : Prop, P → P` в отдельном perf05, то есть корректность формальной постановки. Это ещё не доказательство истинности теоремы, её refutation или resolution рынка. Для продукта существующий CPU путь пока не соответствует целям latency; perf05 receipt несовместим с установленными application bridges v3.

## Официальный бинарник уже оптимизирован

У [release workflow](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/.github/workflows/release.yml) Linux собирается через [release Dockerfile](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/.github/containers/release/Dockerfile): `cargo build -p cargo-risczero --release`. В [workspace Cargo.toml](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/Cargo.toml) включён `lto = true`; стандартный [Cargo release profile](https://doc.rust-lang.org/cargo/reference/profiles.html#release) имеет `opt-level = 3`, без debug assertions. Следовательно, гипотеза «случайно взяли debug binary» исходниками не подтверждается.

[cargo-risczero features](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/cargo-risczero/Cargo.toml) по умолчанию включают `r0vm`, но не `cuda`/`metal`. CUDA-образ как база Dockerfile не включает CUDA feature автоматически. [RV32IM prover selector](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/circuit/rv32im/src/prove/mod.rs#L47) и [recursion selector](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/circuit/recursion/src/prove/mod.rs#L83) выбирают CPU без feature CUDA; ветки Metal в этом pin закомментированы.

В release recipe и [.cargo/config.toml](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/.cargo/config.toml) нет `target-cpu=native`. CPU kernels используют [cc::Build](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/build_kernel/src/lib.rs#L140), без явного `-march=native`; это переносимая оптимизированная сборка. Встречающийся в `rv32im-sys/build.rs` `-arch=native` относится к NVCC, не к CPU. Само отсутствие native-target не доказывает большой проигрыш: для этой программы нет A/B измерения portable/native, и обещать исправление минутной задержки одной пересборкой нельзя.

CPU HAL выполняет [NTT по столбцам и другие операции через Rayon](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/hal/cpu.rs). Основная арифметика — [32-битное поле BabyBear](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/core/src/field/baby_bear.rs). Это не режим эмуляции GPU и не ожидание внешнего сервера. Для базовых segment proofs hash suite жёстко Poseidon2; выбор произвольного более быстрого hash по environment отсутствует.

## Точный размер универсальной работы

| Этап | Параметры в оригинальном коде | Что это означает для маленькой задачи |
|---|---|---|
| RV32IM trace | [315 столбцов: 103 accum + 1 code + 211 data](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/circuit/rv32im/src/zirgen/taps.rs) | Доказывается универсальная машина со всеми этими столбцами, а не отдельный маленький circuit равенства. |
| Padding | [Последний segment округляется до следующей степени двойки total segment cycles](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/circuit/rv32im/src/execute/executor.rs#L335) | Лимит 20 не означает обязательный padding до `2^20`. Есть также paging/protocol cycles, поэтому только guest cycle counter недостаточен для точного po2. |
| Reed–Solomon / NTT | [INV_RATE = 4](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/lib.rs), [PolyGroup expansion](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/prove/poly_group.rs) | После интерполяции каждый столбец вычисляется на домене в четыре раза больше исходного trace. |
| Merkle / constraints / FRI | [MerkleTreeProver](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/prove/merkle.rs), [finalize](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/prove/prover.rs), [FRI](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/prove/fri.rs) | Хеширование большого expanded domain, проверочный polynomial, random combinations, fold factor 16 до степени 256, 50 queries. Это отдельные проходы по большим массивам. |
| Recursion lift | [163 столбца: 12 accum + 23 code + 128 data](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/circuit/recursion/src/taps.rs), [RECURSION_PO2 = 18](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/recursion/prove/mod.rs#L58) | Следующий STARK проверяет предыдущий STARK. Fixed circuit имеет `262,144` строк даже для маленького входного доказательства. |
| identity_p254 | [original identity_p254](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/recursion/prove/mod.rs#L350) | Ещё один recursion STARK с хешем в SNARK-friendly 254-битном поле; Lean заново не выполняется. |
| Groth16 | [succinct_to_groth16](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/server/prove/mod.rs#L192) | Последняя короткая EVM-проверяемая обёртка над identity proof. Именно здесь вызывается original shrink_wrap / Docker. До этого места CI2 не дошёл. |

Для одного segment без assumptions цепочка имеет три STARK proving stages: RV32IM, lift, identity_p254; затем Groth16. При многих segments нужны дополнительные lift/join. Уменьшение segment limit сокращает память отдельного base STARK, но может увеличить их количество и рекурсивные затраты. Это прежде всего memory knob, не безусловное ускорение.

В perf05 registration зарегистрированы примерно `283,000` guest cycles, то есть уже больше `2^18`. CI3 теперь подтверждает размер базового trace: оригинальный log сообщает `FRI-proof, size = 524288`, то есть **po2=19**. В CI2 это было только предположением по размеру guest и памяти; точный po2 там не записан. Expanded trace CI3 содержит `315 × 524,288 × 4 = 660,602,880` элементов BabyBear, или **2520 MiB**. Оценка trace + coefficients + expanded values + три Merkle trees составляет `630 + 630 + 2520 + 384 = 4164 MiB`, ещё до остальных буферов. Это иллюстрация объёма исходя из параметров, не разложение измеренного RSS. Host peak CI3 — `4,917,469,184 B` (около4.58GiB); общий пик с последующим Docker выше и указан ниже.

У recursion аналогичная оценка перечисленных буферов — **1170 MiB** даже при коротком Lean input; подробности в [low-memory research](risc0-low-memory.md). Для identity_p254 размер таблицы тот же, но [Poseidon254](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/core/hash/poseidon_254/mod.rs) выполняет арифметику четырёх 64-битных limbs. [Константы](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/core/hash/poseidon_254/consts.rs): ширина3, 8 full + 42 partial rounds, S-box `x^8`. CI3 измерил около162.36s всего identity_p254 этапа; это не отдельное измерение только Poseidon hashing.

## Успешный CI3: измеренные фазы и EVM-проверка

Источник — сохранённый `artifacts/perf05-true-registration/prover.log` из CI3, время UTC 9 сентября 2026. Source commit CI: `d79a177f4c162eefe9e6e197fdafad09b9ab5a8d`. Измерены интервалы между оригинальными logging milestones, а не sample profiler каждой внутренней функции.

| Интервал | UTC начало → конец | Wall time |
|---|---|---:|
| Исполнение guest | `execution time` в оригинальном log | **13.10299 ms** |
| Базовый RV32IM STARK, от `prove_segment_core` до начала lift | 23:27:28.979879 → 23:31:19.436185 | **230.456306 s** |
| Recursion lift | 23:31:19.436185 → 23:31:58.326573 | **38.890388 s** |
| identity_p254 и передача в Docker | 23:31:58.342505 → 23:34:40.703115 | **162.360610 s** |
| Original Docker Groth16 до `Parsing proof` | 23:34:40.703115 → 23:35:13.656851 | **32.953736 s** |
| Весь case, включая обвязку и оригинальный Receipt::verify | `verified.json.elapsedSeconds` | **465.693549732 s** |

Интервалы округлённо дают около49.5% общего времени на base STARK, 8.4% на lift, 34.9% на identity_p254 и 7.1% на Docker. Небольшая оставшаяся часть — preflight, переходы, запись и проверка результата. Внутри base STARK промежуток `accum group root` → `checkGroup` занял **156.613316 s**; по исходникам он включает вычисление ограничений и построение check group. Это полезная локализация затрат, но не изолированный замер FFT или одной функции.

`cgroup-summary.json`: общий kernel peak **7,829,020,672 B = 7.291 GiB**, квота4CPU, 1,796.238789 CPU seconds, нулевые `max`/`oom`/`oom_kill` counters и нулевой swap. Host и Docker находились под общим пределом13GiB; пик Docker — `7,765,327,872 B`. Успех на этом runner не подтверждает локальный бюджет2GiB.

`verified.json` содержит настоящий `Groth16` receipt, проверенный оригинальным `r0vm 3.0.6 VerifyRequest / Receipt::verify`; SHA256 receipt — `51a0a05016ad11a69a7fcbdd9392c6d4213f8ca466e7a719d799228130c56945`. В CI artifact поле `evmVerified:false` оставлено корректно: последующая EVM-проверка выполнена отдельно и записана в `evm-verification.json`. Оригинальный generic RISC Zero verifier принял транзакцию `0x7b42337d460b66f1a9fc944bed4fb91a1f8657ba8310ed335793667a649b7676` на local chain31372, **block120, status1, 251802gas**. Подмены image и journal отклонены. Это прямой вызов generic verifier, а не принятие application bridge: `applicationBridgeCompatible:false`.

Scope binding: profile `0x93cf174539debc6ddce2691f3def1e36023cf77fe1d93f1692f330150bd37e10`, image `0x296fb3bbf5eb7df9fb7115826df31c71411ee0f8153970c7618c76ab01539feb`, **outcome0 / registration only**. Receipt не разрешает рынок, не доказывает Nat.add_comm и не принимается установленным v3 bridge. Подробный перечень артефактов — [журнал CI](../ci-proof-validation.md).

Исторический CI2 израсходовал1195CPU seconds за600wall seconds при двух CPU и закончился timeout до Docker, с нулевыми OOM/max counters. По его INFO log точную фазу остановки установить нельзя; времена CI3 не переносятся задним числом на CI2. Успешный четырёхъядерный CI3 заменяет ожидание результата конкретным измерением, но не является контролируемым CPU2/CPU4 benchmark.

## Готовые способы ускорения и пределы утверждений

1. **Тот же image/profile на GPU.** [Официальная документация](https://dev.risczero.com/api/generating-proofs/local-proving) прямо ориентирует производительность на NVIDIA CUDA и описывает `-F cuda`/`target-cpu=native`. Это сохраняет математическое утверждение и guest. На обычном бесплатном GitHub Ubuntu runner GPU нет; доступность бесплатного подходящего GPU и конкретное ускорение нашего guest не подтверждены. Одна runtime переменная не превратит текущий CPU release в CUDA release.
2. **Не повторять уже полученное доказательство.** Проверенный immutable receipt можно кэшировать по image/profile/goal/outcome и предъявлять во всех трёх приложениях. Это ускоряет повторное использование, не cold proving. Для разных целей либо иного проверяемого image потребуется новый сертификат.
3. **Оптимизировать настоящий checker/IO до следующей границы padding.** Ранее измеренные source-only candidates уменьшают guest cycles с сохранением проверок. Для v3 это новый immutable image/profile и migration; уже развёрнутые v3 verifier не примут другой image. Для perf05 fixed recursion overhead останется даже после сокращения guest. Из измерений нельзя обещать cold EVM proof≤120s на CPU.
4. **Замена final prover на historical RapidSnark** повторяет [старый upstream путь](risc0-rapidsnark-history.md), но не ускорит основные измеренные затраты base STARK и identity_p254. В CI3 весь Docker этап занял только32.95s из465.69s. Возможное улучшение final prover не объясняет прежний timeout CI2 и само по себе не сделает текущий CPU путь быстрым.

## Прямая проверка Lean proof term в EVM

В ограниченном поиске готовый, проверенный generic Lean4 kernel, исполняющийся непосредственно Solidity/EVM и принимающий Lean exports, **не найден**. Это ограничение результата поиска, не доказательство невозможности. [Официальный Lean reference](https://lean-lang.org/doc/reference/latest/ValidatingProofs/) описывает `lean4checker`, Comparator и независимый Rust NanoDa как внешние проверяющие инструменты, а не EVM-контракты.

[EquiVM](https://github.com/argotorg/EquiVM) доказывает свойства EVM bytecode внутри Lean; это противоположное направление, не onchain checker произвольного Lean proof. [Verity](https://github.com/lfglabs-dev/verity/blob/main/TRUST_ASSUMPTIONS.md) — компиляция ограниченной contract DSL и её доказательства, а не готовая компиляция Lean kernel в EVM. [Argument Computer ix](https://github.com/argumentcomputer/ix) относится к ZK proof-carrying code и требует отдельной оценки; один README не подтверждает совместимость с нашими Lean4.33.1 exports и имеющимся EVM verifier.

Замена ZK сертификата подписью сервера, native verdict или optimistic challenge period меняет доверие либо finality. Такие варианты не считаются ускорением с сохранением текущих доказательных гарантий. Новый прямой EVM kernel потенциально убирает offchain proving, но переносит всю проверку и данные в gas; без готовой реализации и gas замеров его нельзя предлагать как «просто склеить».
