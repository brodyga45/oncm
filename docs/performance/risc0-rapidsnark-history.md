# Исторический RapidSnark backend RISC Zero и совместимость с 3.0.6

Проверено чтением первичных исходников 10 сентября 2026 года. Новых сборок, генерации witness и proving в этом исследовании не было.

**Вывод:** это существовавший upstream путь, а не новый криптографический протокол. RISC Zero 1.2.1 использовал RapidSnark с тем же основным Circom circuit, тем же ceremony key и тем же Groth16 verification key, которые использует 3.0.6. Замена последнего prover обратно на RapidSnark обоснована форматом и историей. Совместимость конкретной современной ARM сборки и текущего witness generator ещё должна завершиться проверкой настоящего RISC Zero receipt; маленький отдельный RapidSnark fixture этого не доказывает.

## Закреплённые первичные источники

| Компонент | Версия / commit | Источник |
|---|---|---|
| Последний рассмотренный рецепт RapidSnark | RISC Zero v1.2.1, `1c641b2bfd4316665901ca64faadbc613fd0b5c7` | [prover.sh](https://github.com/risc0/risc0/blob/1c641b2bfd4316665901ca64faadbc613fd0b5c7/groth16_proof/scripts/prover.sh), [Dockerfile](https://github.com/risc0/risc0/blob/1c641b2bfd4316665901ca64faadbc613fd0b5c7/groth16_proof/docker/prover.Dockerfile) |
| Переход на Gnark | v1.3.0, `a37c33caf1f442d4146bdd78abda19274037fde4`, 24 февраля 2025 | [CHANGELOG, Features: stark2snark](https://github.com/risc0/risc0/blob/a37c33caf1f442d4146bdd78abda19274037fde4/CHANGELOG.md) |
| Текущий upstream | v3.0.6, `1cc70cf05033a79ebc90f07c679cb4bd1cd301b9` | [Dockerfile](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/docker/prover.Dockerfile), [prover.sh](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/scripts/prover.sh) |
| Старый RapidSnark | `547bbda73bea739639578855b3ca35845e0e55bf` | Pin в старом Dockerfile; сборка x86/NASM, не готовая ARM сборка |
| Старый Circom | `e60c4ab8a0b55672f0f42fbc68a74203bdb6a700` | Pin в старом Dockerfile |
| Текущий Circom | 2.2.2, `e410b0d5cd2948a15931df0bc50d79ce56fa8c32` | Pin в текущем Dockerfile |
| Наш отдельный ARM кандидат RapidSnark | `81eddf1a536d26497b237c0b8a04fe90baf7e439` | [Официальный main_prover.cpp](https://github.com/iden3/rapidsnark/blob/81eddf1a536d26497b237c0b8a04fe90baf7e439/src/main_prover.cpp), локальный `tools/lean-zk/rapidsnark-candidate/manifest.json` |

RISC Zero код лицензирован Apache-2.0. Pin, лицензии и единственное ограничение размера thread pool современной ARM сборки отдельно записаны в её manifest; старый Dockerfile не является доказательством воспроизводимости этой новой сборки.

## Готовый исторический рецепт

В upstream 1.2.1 shell сначала создаёт стандартный `.wtns`, затем передаёт его RapidSnark:

```sh
./stark_verify /mnt/input.json output.wtns
rapidsnark stark_verify_final.zkey output.wtns /mnt/proof.json /mnt/public.json
```

Источник: [официальный prover.sh 1.2.1](https://github.com/risc0/risc0/blob/1c641b2bfd4316665901ca64faadbc613fd0b5c7/groth16_proof/scripts/prover.sh). Исторический script также задаёт unlimited stack. В нашем ограниченном окружении этот параметр не переносится: отдельный adapter ограничивает stack и весь процесс подчиняется внешнему resource guard.

Современный официальный RapidSnark сохраняет CLI из четырёх аргументов: `prover circuit.zkey witness.wtns proof.json public.json`. Наш `adapter/docker` уже повторяет этот порядок; менять алгоритм Groth16, точки proof или математический circuit для этого не нужно. Текущий штатный RISC Zero Docker backend вместо этого запускает Gnark над преобразованными `.cs` / `.pk.dmp`, а witness передаёт через FIFO. [Современный RapidSnark CLI](https://github.com/iden3/rapidsnark/blob/81eddf1a536d26497b237c0b8a04fe90baf7e439/src/main_prover.cpp), [Gnark shell 3.0.6](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/scripts/prover.sh).

## Что именно совпадает

1. **Основной circuit побайтно одинаков по Git LFS SHA256.** В обоих pinned checkout файл `stark_verify.circom` — pointer размером 58,353,446 bytes с digest `a3789471909ba1a13cca783dc5269b25b6d41295abe60234a8075f750017518c`. Сравнены маленькие pointers; 58 MB заново не скачивались. [1.2.1 pointer](https://github.com/risc0/risc0/blob/1c641b2bfd4316665901ca64faadbc613fd0b5c7/groth16_proof/groth16/stark_verify.circom), [3.0.6 pointer](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/groth16/stark_verify.circom).
2. **Ceremony key взят с одного и того же upstream URL** `zkey/2024-05-17.1/stark_verify_final.zkey.gz`. 3.0.6 дополнительно проверяет SHA256 `69c6056451ea814b37e30ccbc44639dbaafef73540cbfbff6ec7e68e2d325735`. Уже измеренный локальный compressed key — 2,579,300,897 bytes; decompressed original `.zkey` — 3,620,786,504 bytes, SHA256 `f525bfbcadcd01339a243db59213f213a357adbaaff7b4203c9c57ce25e91d5c`. В этом исследовании большие файлы не перечитывались; локальные размеры/digests взяты из candidate manifest. [Старый Dockerfile](https://github.com/risc0/risc0/blob/1c641b2bfd4316665901ca64faadbc613fd0b5c7/groth16_proof/docker/prover.Dockerfile), [текущий Dockerfile](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/docker/prover.Dockerfile).
3. **Все 26 decimal constants verification key одинаковы:** alpha, beta, gamma, delta и IC0–IC5. Выполнено лёгкое программное сравнение извлечённых констант двух официальных `verifier.rs`; совпало 26/26. Шесть IC-точек соответствуют пяти public field elements плюс константе. [1.2.1 verifier](https://github.com/risc0/risc0/blob/1c641b2bfd4316665901ca64faadbc613fd0b5c7/risc0/groth16/src/verifier.rs), [3.0.6 verifier](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/groth16/src/verifier.rs).
4. **Public output layout:** circuit объявляет `out[4]`, затем `codeRoot`; приватный вход — `iop[25749]`. Текущий Rust verifier подготавливает пять field elements: две половины control root, две половины claim digest и BN254 identity control ID. Нужно использовать штатное преобразование digest и его endian conventions; публичный claim не равен непосредственно `goalHash` или `journalHash`. [Текущий Verifier::new](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/groth16/src/verifier.rs#L89).
5. **Proof JSON совместим:** `pi_a`, `pi_b`, `pi_c`; RapidSnark public JSON берёт witness indices 1…nPublic, пропуская ONE. Текущий RISC Zero `ProofJson → Seal` сам переставляет пары Fq2 координат B. Adapter должен передавать JSON без собственного переставления. [RapidSnark prover.cpp](https://github.com/iden3/rapidsnark/blob/81eddf1a536d26497b237c0b8a04fe90baf7e439/src/prover.cpp), [RISC Zero types.rs](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/groth16/src/types.rs#L106).

## Что не следует объявлять побайтно одинаковым

Include `risc0.circom` различается. Единственный найденный diff официальных 1.2.1 и 3.0.6: `out <-- inverse(in[0], P)` заменено на локальную Circom variable `inv_res = inverse(in[0], P); out <-- inv_res;`. Constraint statements после присваивания совпадают. Старый файл 20,739 bytes / SHA256 `38d3937558dae8f9de3d0bdc534c76c9adc6c7ffe37cc43935073324e1e53bf3`; новый 20,764 bytes / SHA256 `c83994e7877fdb3d3c1f16013005621e4f5b4fe0d86f36ca6787d2fd9727e2fc`. Это официальный diff, локальный include совпадает с 3.0.6. [Старый include](https://github.com/risc0/risc0/blob/1c641b2bfd4316665901ca64faadbc613fd0b5c7/groth16_proof/groth16/risc0.circom), [новый include](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/groth16/risc0.circom).

Также изменились Circom compiler и flags: старый Dockerfile использует `--c`, новый — `--r1cs --c --O2 --no_asm`. Совпадение исходного circuit само по себе не даёт права переставлять witness wires. Важно, что **сам upstream 3.0.6 использует новый compiler с прежним zkey**. Его converter проверяет field, число variables/public variables и FFT domain; импортирует A/B/C points по прежним индексам. `ReadWTNS` переводит endian и убирает ONE, без перестановки witness; wire labels не создают специального bridge к новому порядку. [ReadZKey](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/circom-compat/pkg/circom/zkey.go#L235), [ReadWTNS](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/groth16_proof/circom-compat/pkg/circom/wtns.go).

Это сильное свидетельство задуманной совместимости текущего witness с исходным zkey, **вывод из кода**, а не локальный end-to-end результат. Современный RapidSnark также проверяет равенство nVars key/witness и BN254 field; эти проверки не заменяют финальную Groth16 verification.

## Проверяемый переход без новой криптографии

Когда получен настоящий `identity_p254` seal, штатный RISC Zero 3.0.6 должен сформировать `input.json`; затем существующий ARM witness generator и RapidSnark выполняют историческую последовательность. Последний шаг обязан пройти штатный `Receipt::verify(expectedImageId)` и проверку точного journal/profile, после чего отдельный EVM тест проверит seal оригинальным deployed verifier. [Текущий docker.rs](https://github.com/risc0/risc0/blob/1cc70cf05033a79ebc90f07c679cb4bd1cd301b9/risc0/groth16/src/prove/docker.rs) принимает именно seal identity_p254, а не произвольный succinct receipt.

Не нужно понижать guest/RISC Zero до 1.2.1 или переносить старые control roots. Исторический backend применим только к последней Groth16 операции; текущая recursion цепочка и текущие verifier parameters сохраняются. Название `SuccinctReceipt` ещё не означает готовый `identity_p254` seal: их разделяет штатный шаг identity с Poseidon BN254.

Ограничение памяти остаётся неизмеренным для реального RISC Zero circuit: файл `.zkey` занимает 3.62 GB, но его размер на диске не равен resident memory, особенно при mmap. Это не даёт основания обещать ≤2 GiB. Успех отдельного маленького RapidSnark fixture подтверждает работу ARM CLI и JSON/EVM формата, но не бюджет реального circuit. Ни один новый heavy trial в рамках этого документа не запускался.
