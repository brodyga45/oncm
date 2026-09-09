# CI2: измерение времени и следующий ограниченный запуск

10 сентября 2026. Разобран завершившийся run `34415338599`, artifact SHA256 `487ff2f4a3af115d6236c0a2f8a22a7fecf5ca6cc9aefd46a4d47f7fb3aa63e5`. Новых локальных вычислений, сборок или proving не было.

| Измерение | Результат |
|---|---:|
| Guest execution | 16.020637 ms; checker/journal/commit завершены |
| Завершение | Timeout 600 s; elapsed 600.785 s |
| Kernel parent memory.peak | 4,925,534,208 B = 4.587 GiB |
| Parent memory.events max / oom / oom_kill | 0 / 0 / 0 |
| Parent CPU usage | 1,195.222501 CPU-s — почти два занятых CPU все 600 s |
| Docker / receipt | Не запускался / отсутствует |

Память около 3.10 GiB в 30–60 s, около 4.27 GiB в 120–360 s; пик 4.587 GiB около 411 s, затем около 1.1–1.2 GiB вплоть до остановки. Это похоже на завершение segment-STARK и переход к recursion, но **по памяти одной точную стадию установить нельзя**: текущий лог содержит только INFO. 13 GiB в этом запуске не достигались; добавлять память оснований нет.

Следующий согласованный запуск использует четыре CPU уже выбранного бесплатного public `ubuntu-24.04`: parent/host CPUQuota 400%, Docker cpus 4, Rayon/OpenMP и Go pools 4. Setup запишет фактические cpu_count/affinity и потребует четыре доступных CPU. Это только remote CI. [Официальные specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Один `perf05 / true-registration`, deadline 1,800 s, прежний parent 13 GiB/no-swap, host 12 GiB и Docker 9 GiB внутри него. Workflow deadline 45 min для одного case; вариант `all` имеет 135 min для четырёх последовательных cases и setup. Никаких автоматических повторов или увеличений. 600 s, локальные 2 GiB и registration 30 s остаются недостигнутыми.

Используются существующие debug milestones pinned upstream, без rebuild. В env это одна строка:

```text
RUST_LOG=info,risc0_zkvm::host::server::prove::prover_impl=debug,risc0_zkvm::host::recursion::prove=debug,risc0_zkp::prove::prover=debug,risc0_groth16::prove::docker=debug
```

Первый модуль пишет `prove_session`, `segment_preflight`, `prove_segment_core`; второй — lift и `identity_p254`; третий — group roots/FRI/proof size; четвёртый — `seal-to-json`, вызов Docker и parsing proof. [Host source](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/server/prove/prover_impl.rs), [recursion source](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/recursion/prove/mod.rs), [STARK milestones](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkp/src/prove/prover.rs), [Docker milestones](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/groth16/src/prove/docker.rs).

Observer печатает heartbeat каждые 30 s: elapsed, current/peak GiB, CPU seconds/average CPUs и OOM counters. Полные JSONL/atomic summary остаются. Global TRACE и per-instruction tracing не включаются.

Меняются CPU allowance, deadline и диагностический log level. Память, guest/image/profile, сериализация, API, cryptographic checks и Docker image неизменны. Четыре CPU могут ускорить параллельные участки, но идеальное удвоение скорости и завершение за 1,800 s не гарантируются. Actor API/v3 segmentation сейчас не реализуется: маленький perf05 помещается в память, а следующий лог должен назвать точный оставшийся этап.
