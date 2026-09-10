# Совместимость внешних сертификатов с новыми целями

Аудит исходников, 2026-09-10, после отказа от генерации/заказа сертификатов на сайтах. **Контракты всех трёх реализаций допускают новые цели под существующим разрешённым профилем. Удобный импорт JSON пока ограничен подготовленными примерами.** Это пробел основного импорта/регистрации, а не отложенного веб-prover. Проверка ниже не запускала браузер, вычисления, RPC или транзакции; изменения реализации ещё не входят в этот снимок.

## Что доступно сейчас

| Реализация | Импорт JSON нового goal | Ручной ABI / низкоуровневый SDK |
| --- | --- | --- |
| **Exchange** | SDK криптографической проверки и JSON settlement уже не зависят от списка теорем. Но web registration после успешной EVM-проверки вызывает `fixtureForCertificate(catalog.fixtures, result)` и отклоняет неизвестную цель. Загрузка другого пакета не добавляет его в этот каталог. | `createMath` и `resolveProof` универсальны. Форма создания допускает goal/profile/raw certificate или package с `registrationCertificate`; проверяет journal и передаёт сертификат контракту. Это обход ограничения каталога вручную, без полноценного проверенного goal/source bundle. |
| **Agora** | API импортирует только локальный perf05 bundle. `validateExternalArtifact` ищет goal в двух fixtures и дополнительно связывает outcome1 с именем `true`, outcome2 с `false`; `case` также определяется именем fixture. UI присваивает заголовок/описание одной из двух теорем. Новая регистрация в обычном вебе заблокирована. | `sdk.registerGoal` / `submitProof` принимают произвольные совместимые данные. Поле raw settlement ABI существует; при отсутствии imported binding оно доходит до контрактной проверки. Source-package import не означает принятие registration certificate. |
| **Vault** | `inspectExternalCertificate` ищет цель в `descriptor.goals` и фиксирует её допустимый outcome/case. Штатный descriptor содержит два perf05 примера. SDK-helper с этим descriptor тоже отклоняет новую цель; ручное конструирование нового списка goals не является реализованным проверенным импортом пакета. | `sdk.register` / `prove` универсальны. В вебе доступны ручные goal/profile/registration ABI и settlement ABI; оригинальный контракт проверяет криптографию. Новый goal/source package в удобном importer отсутствует. |

Точные места ограничения и отправки:

- Exchange: [sdk/proof-import.mjs](../implementations/exchange/sdk/proof-import.mjs), `decodeExternalCertificate`33, `fixtureForCertificate`59, `verifyExternalCertificate`66; [web/main.jsx](../implementations/exchange/web/main.jsx), `verifyImportedProof`1187, `upload`1469, `importCertificate`1497 и создание1786; [sdk/index.mjs](../implementations/exchange/sdk/index.mjs), `createMath`142.
- Agora: [server/external-certificates.mjs](../implementations/agora/server/external-certificates.mjs), `loadExternalBundle`10, `validateExternalArtifact`22, `verifyExternalArtifact`45; [server/index.mjs](../implementations/agora/server/index.mjs), `POST /api/certificates/import`31; [src/App.vue](../implementations/agora/src/App.vue), `createMarket`86, `submitProof`104, `importExternalCertificate`118; [sdk/index.mjs](../implementations/agora/sdk/index.mjs), `registerGoal`24, `submitProof`36, `importCertificate`56. `assertProofBinding` в [proof-selection.mjs](../implementations/agora/src/proof-selection.mjs) проверяет имеющуюся привязку, но не требует её для ручного ABI.
- Vault: [sdk/external-certificates.mjs](../implementations/vault/sdk/external-certificates.mjs), `inspectExternalCertificate`19, `verifyExternalCertificate`44; [server/external-proofs.mjs](../implementations/vault/server/external-proofs.mjs) — каталог prepared examples; [web/App.svelte](../implementations/vault/web/App.svelte), `register`430, `useExternalCertificate`452, `setOutcomeCertificate`479; [sdk/index.mjs](../implementations/vault/sdk/index.mjs), `register`365, `prove`468. Названия/номера строк относятся к этому снимку.

## Контрактная граница

У всех трёх [LeanProofBridge](../implementations/vault/proof/contracts/LeanProofBridge.sol) одинаковая схема: строки23–44 проверяют immutable profile/image, ненулевой goal,260-byte seal,128-byte journal `(domain,goalHash,profileId,outcome)` и вызывают **оригинальный RISC Zero Groth16 verifier**. Списка целей в bridge нет. StatementId намеренно отсутствует в математическом journal: registry связывает переносимый факт со своим утверждением.

Регистрация вызывает `verifyGoal` с outcome0: [Exchange Core.sol](../implementations/exchange/contracts/Core.sol)54–56, [Agora.sol](../implementations/agora/contracts/Agora.sol)143–148, [Vault Protocol.sol](../implementations/vault/contracts/Protocol.sol)80–84. Settlement использует сохранённые goal/profile и outcome1/2: соответственно72,160–162,105–109. Нужен существующий открытый математический рынок; повторная регистрация того же goal/profile запрещена. Профиль должен разрешать новые регистрации. Agora/Vault сохраняют settlement после выключения новых регистраций; Exchange отдельно учитывает `resolutionEnabled`. Замена bridge/profile для импорта новой теоремы **не требуется**, если её настоящий сертификат уже соответствует установленному immutable image/policy.

## Согласованный минимальный generic bundle

```text
format: oncm-external-certificate-bundle-v1
artifact: полный oncm-real-groth16-ci-v1 record
goalExport: {base64, sha256, bytes}
source?: {text, sha256, origin?: {repository, commit, path, declaration}}
metadata?: {title, description}
```

Старые четыре curated records продолжают работать без обёртки. Для generic route artifact case/profile labels — provenance, не источник outcome и не список допустимых theorem hashes. Сохраняются строгие format/shape/limits, raw/EVM seal и verifier parameters, canonical ABI, все128bytes journal и сопоставление с фактическим immutable bridge. Trusted descriptor выбирается по поддерживаемому profileId и состоянию governance; загруженный пакет не может заменить его image/foundation/policy. Для новых типов verifier потребуется отдельный адаптер, а не доверие произвольному descriptor.

Decoded goal≤1MiB, source≤512KiB, весь wrapper≤2MiB; SHA256 — lowercase64hex без0x. Проверить base64/length/hash, exact foundation prefix и каноническую структурную декларацию Oncm.goal. GoalHash должен совпасть с SHA256 **точных** goal-export bytes и с криптографически принятым journal. Registration не требует solution body: outcome0 подтверждает well-formed Prop. Settlement сверяется с текущим statementId/goal/profile/outcome; self-consistent чужой goal недопустим. Не переносить ограничение `goal.outcome` из curated примеров в generic route — принимаемый факт определяет проверенный journal.

Source и pinned origin показываются отдельно как происхождение данных. Проверка SHA исходника подтверждает только его байты: **`sourceGoalRelation: not-verified`**, пока нет отдельного воспроизводимого compile/export comparison. Нельзя присваивать чужому source статус математически проверенного или подставлять описание одной из двух fixtures. Trusted claim — проверенный ZK canonical goal artifact. В source publication сохраняется тот же уровень проверки; неизвестный исходник не получает curated-бейдж.

Минимальные изменения: добавить parser/goal-package validator; разделить descriptor профиля и каталог примеров; заменить fixture lookup в generic route на проверенный пакет; заполнять UI его метаданными с явным provenance; сохранить существующие epoch/ABA/wallet guards и отдельную кнопку отправки. Exchange/Vault проверяют через SDK непосредственно в браузере; если пакет идёт через API, нужен отдельный bounded route/body limit до3MiB, без расширения остальных API. Agora сейчас принимает artifact через HTTP: его штатный1MiB parser нельзя оставить скрытым препятствием для wrapper2MiB.

## Приёмочные проверки

1. Обернуть **настоящие CI3/CI4** records и точные goal bytes в generic bundle; убрать цели из каталога fixtures в тестовом descriptor. Parser и существующий оригинальный verifier должны принять их без fixture lookup. Это проверяет generic route реальными сертификатами, но не заявляет новый theorem end-to-end.
2. Изменённые goal bytes/hash, profile/image, domain/outcome/journal, raw/selector seal, canonical ABI и неверный source hash отклоняются. Поле `evmVerified:true` ничего не разрешает. Криптографический отказ original verifier обязан дойти до пользователя.
3. Unknown goal с согласованными bytes проходит только транспортные проверки; без настоящего сертификата принятия быть не должно. Ix TN уже прошёл native/executor, но его нового ZK-сертификата ещё нет — его full real-import acceptance остаётся открытым до внешнего proof.
4. Проверить outcome0 отдельно от1/2, выключенный admission, действующий settlement старого профиля, другой открытый statement, уже resolved statement, ручное редактирование и ABA/wallet/profile/file переключения во время `eth_call`.
5. Повторить четыре curated imports; generic source не получает curated/semantic badge. Own-file limits проверяются до чтения/HTTP parse. Загрузка/проверка не генерирует proof и не отправляет транзакцию; регистрация/resolution — отдельные wallet actions.

Реализация этих изменений относится к основному внешнему импорту. GitHub dispatch, заказ или вычисление сертификата на сайте для неё не нужны.
