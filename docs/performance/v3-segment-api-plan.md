# v3: уменьшение сегментов через оригинальный API RISC Zero

10 сентября 2026. Read-only разбор upstream `v3.0.6`, commit `1cc70cf05033a79ebc90f07c679cb4bd1cd301b9`. Текущий CI run `34415338599` не изменялся; новых вычислений, реализации API или сборок не было.

**Да, можно уменьшить сегменты и получить Groth16 без изменения v3 guest/image/profile.** Уже подготовленный `implementations/exchange/performance/actor-registration-trial.py` содержит большую часть HTTP/framing механики. Но законченного однокомандного actor → Groth16 CLI в этом релизе нет: HTTP `/snark/create` и `/snark/status` являются `todo!()`. Реальный следующий этап — штатный zkVM **CompressRequest** через `r0vm --port`. [HTTP handlers](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/r0vm/src/api.rs#L531), [CompressRequest handler](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/api/server.rs#L767).

## Что остаётся неизменным

- v3 image: `3ba46e4e43724929a3b160c49e75ea89d1ea529f357d8ba07cf55054cb3f2deb`.
- v3 profile: `190eddca14d88c2af77ea74b7ba257dcb7f9236c1cf7c8002890a992332c485e`.
- CI assets `tools/lean-zk/ci/profiles/v3/`: exact goal/proof exports, foundation, axioms и все NanoDa проверки. Nat goal — 41,968 B, proof — 71,338 B; false goal — 35,930 B, refutation — 44,051 B.
- Текущий u32-serde wire, journal, original verifier parameters и selector `73c457ba`.
- Общий cgroup budget 13 GiB / CPU2, case deadline 600 s. Он охватывает обе последовательные стадии; при timeout нет автоматического продолжения или увеличения бюджета.

Меняется только executor segmentation. **Не использовать `ProverOpts::from_max_po2(18)` для этой настройки:** это меняет набор разрешённых recursion control IDs. Сохраняем штатный `ALLOWED_CONTROL_IDS` и `DEFAULT_MAX_PO2=22`; меньший execution segment limit является отдельным параметром. [ProverOpts](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/client/prove/opts.rs), [default control IDs/root](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/circuit/recursion/src/control_id.rs), [DEFAULT_MAX_PO2](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/receipt.rs#L899).

## Точная последовательность при необходимости меньших сегментов

1. Запустить оригинальный r0vm manager и один worker pool внутри существующего CI slice; requestor/observer остаётся снаружи, как сейчас. В качестве умеренного первого уменьшения рассмотреть `--po2 19`; `18` уменьшает сегмент ещё вдвое, но увеличивает число lift/join. Выбор делать после phase/peak результата текущего smoke, без параллельных trials.

   ```sh
   r0vm --manager \
     --worker execute,prove-segment,prove-keccak,lift,join,union,resolve \
     --api 127.0.0.1:43173 --storage CASE/storage --po2 19
   ```

   HTTP путь передаёт `state.po2` в `ProofRequest.segment_limit_po2`; worker вызывает `ExecutorEnvBuilder::segment_limit_po2`. В обычном `r0vm --elf … --po2 19` эта настройка не применяется. [API forwarding](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/r0vm/src/api.rs#L402), [worker](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/r0vm/src/actors/worker.rs#L486).

2. Повторить уже существующий HTTP обмен, заменив только fixture bindings:

   | Request | Body / результат |
   |---|---|
   | `PUT /images/upload/{v3Image}` | Exact packed binary; сервер проверяет image ID |
   | `PUT /inputs/upload/{caseId}` | Exact existing wire: goalLength, outcome, exportLength как u32 LE, затем каждый export byte как u32 LE |
   | `POST /sessions/create` | `{"img":"<v3Image>","input":"<caseId>","assumptions":[],"execute_only":false,"exec_cycle_limit":null}`; отправить ровно один раз |
   | `GET /sessions/status/{uuid}` | Дождаться SUCCEEDED в оставшемся общем deadline; сохранять segments/cycles/status |
   | `GET /receipts/stark/receipt/{uuid}` | **Bincode Receipt с InnerReceipt::Succinct** |

   Проверить exact journal и оригинальный `VerifyRequest`. Затем остановить/reap manager **до** compression, сохранив общий parent slice. Actor `execute_only`/`exec_cycle_limit` сейчас не реализуют ограничения — deadline и cgroup обязательны. Один pool не исключает внутреннее перекрытие preflight/prover очередей; общий CPU/memory cap сохраняется.

3. Новый оригинальный `r0vm --port LISTENER_PORT`, тот же host scope/shared slice и прежний ограниченный Docker adapter. После Hello 3.0.6 отправить **ServerRequest field 8 — CompressRequest**. Транспорт уже есть в CI `receipt.py`: frame `u32 LE length + protobuf`. Запрос по [официальному api.proto](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/protos/api.proto):

   ```text
   CompressRequest.opts (field1):
     hashfn(field1) = "poseidon2"
     prove_guest_errors(field2) = false
     receipt_kind(field3) = 2  // GROTH16
     control_ids(field4, repeated) = exact upstream ALLOWED_CONTROL_IDS
     max_segment_po2(field5) = 22
     is_dev_mode(field6) = false
   CompressRequest.receipt(field2): Asset.inline(field1) = original bincode Succinct Receipt
   CompressRequest.receipt_out(field3): AssetRequest.inline(field1) = Empty
   ```

   Не опускать opts в надежде на defaults: protobuf conversion переносит поля буквально. `control_ids` — штатные 27 Digest из pinned файла; Digest содержит восемь u32 words. Штатный `ProverOpts::groth16()` + upstream `ApiClient::compress()` формируют именно эти значения автоматически, если в будущем выбран Rust SDK adapter.

4. Original `compress` сам выполняет **identity_p254 → original Docker Groth16** и сохраняет исходный claim/journal. Отдельный ручной `identity_p254` запрос не нужен. [compress/succinct_to_groth16](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/server/prove/mod.rs#L192).

## Существенный нюанс формата compression reply

**Вход CompressRequest — bincode, выход CompressReply — protobuf `core::Receipt`.** Это явно сделано в `server.rs`: результат переводится в `pb::core::Receipt`, затем `encode_to_vec()`. Уже существующий bincode reader и VerifyRequest нельзя применить к этим output bytes напрямую. [Официальный client decoder](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/api/client.rs#L527), [core.proto](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/zkvm/src/host/protos/core.proto).

Минимальный будущий glue: добавить вызов CompressRequest и **одну явную конверсию этого формата**, используя схему/upstream conversion; криптографию не реализовывать. В protobuf проверять outer version, `inner.groth16` (oneof field4), seal256, verifier parameters и exact journal. Для пути без Rust build можно сохранить исходный verified claim из bincode Succinct и собрать bincode Groth16 с этим же claim, полученными seal/parameters/journal; затем обязательный original `Receipt::verify(v3Image)` отсеет любое несоответствие. Это всё ещё новая небольшая transport-конверсия, а не готовая уже проверенная часть текущего Python CI. Альтернатива с максимальным upstream reuse — `ApiClient::compress()` и штатные serde methods в тонком Rust SDK клиенте, но она требует отдельного build, сейчас не выполнявшегося.

После original verification сохранить текущие `rawSeal`, `evmSeal=73c457ba||seal`, `certificate=abi.encode(evmSeal,journal)` и выполнить локальную проверку существующими v3 bridge во всех трёх приложениях. Четыре certificates: true registration → true proof → false registration → false refutation, строго последовательно.

## Оценка 13 GiB / 600 секунд

Размер сегмента снижает память отдельного STARK, но **не** размер фиксированных recursion/identity_p254/Groth16 circuits. До новой API работы нужно увидеть, где достигается peak текущего CI: если ограничивает recursion или Groth16, уменьшение rv32im сегмента этот расход не исправляет.

Наш предыдущий execute-only v3 Nat registration уже имел **21 сегмент при лимите20**. Это существенная работа относительно perf05. При19 сегментов ожидается примерно вдвое больше, при18 — примерно вчетверо (грубая оценка, paging/preflight overhead меняется). Больше сегментов означает больше lift/join и может ухудшить время. **Нет измерения, позволяющего обещать v3 registration/proof/refutation ≤600s на CPU2.** При успехе текущего perf05 разумно сначала оценить его фазовые затраты; запускать только одну выбранную v3 регистрацию. Этот документ не объявляет memory fit или полный v3 acceptance достигнутыми и не меняет текущий CI.
