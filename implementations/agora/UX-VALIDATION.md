# Agora UX fixes — 2026-09-10

Выполнены ограниченные исправления US-010/015/017 по результатам
[COVERAGE-AUDIT.md](COVERAGE-AUDIT.md). Контракты, chain state, математический
профиль и политика proving не менялись.

## Доли и обязательные согласия

`GET /api/allocations` читает все контракты с одним `blockNumber`, возвращает
`observedBlock`, `observedBlockHash`, `observedAt`. Базовые доли каждого предложения
восстанавливаются из `AllocationApplied`, включая удалённых выгодополучателей;
только текущего списка адресов для старых предложений недостаточно.

`server/allocation-view.mjs` вычисляет `requiredConsents` с адресом, старой/новой
долей и проверенным onchain approval. Удаление означает новую долю0. Увеличение
и неизменность согласия не требуют. Статусы: Applied/Stale/Expired/Awaiting consent/
Ready to apply; точная граница срока `timestamp == expiresAt` ещё допустима.

Веб показывает все требуемые адреса и согласия. Apply отключён до всех согласий,
после исполнения, при stale epoch и после expiry. Consent/revoke доступны только
теряющему участнику активного предложения. Refresh показывает новый snapshot;
перед Apply API перечитывается ещё раз, затем обычный `simulateContract` и контракт
проверяют актуальные правила. Отзыв согласия между snapshot и транзакцией всё ещё
может привести к честному revert, а не к обходу согласий.

## LP-подписи, отсутствующая цена и старая история

`src/App.vue` больше не называет totalSupply LP-токена стоимостью в T. Каталог
пишет LP shares; aggregate явно подписан как supply across pools, not T value.
Это статистика выпуска разных LP-токенов, не оценка общего капитала.
`src/market-view.mjs` возвращает `No quote` при отсутствующем/пустом пуле для обеих
сторон. Bigint arithmetic сохраняет конечную цену даже для больших резервов.

`server/proof-jobs.mjs` пропускает ownerless records при wallet list/cancel.
Старые данные сохраняются, неизвестный владелец не приписывается вошедшему адресу.
Предыдущий package privacy fix также работает в обновлённом API.

## Реальные проверки

```sh
node --test tests/presentation.test.mjs tests/package-artifacts.test.mjs tests/proof-jobs.test.mjs
node --check server/index.mjs
python3 proof/resource-guard.py --memory-mib 1024 --timeout 30 \
  --lock-file /private/tmp/oncm-worker-501.lock \
  --report /private/tmp/agora-ux-vite-resources.json \
  -- node node_modules/vite/bin/vite.js build
```

- **14/14 tests PASS**, включая A-only, A+B, removal, revoked consent,
  stale/applied/expired и точный expiry, empty/huge reserves, ownerless API history,
  package ownership, scheduler. Тесты используют injected API/fake workers и
  значения snapshot; настоящий prover/новые транзакции не вызываются.
- JS syntax PASS; Vite production build PASS, guard **2.206s**, peak tree
  **312,584,040 bytes (~298.1 MiB)**, exit0. Это только Vue/Vite, без contract compile.
- Перед проверкой обновлённого сервера: **0 queued/running/cancelling jobs**.
- Существующий Node watch сам загрузил изменённый API; дополнительный ручной
  restart не понадобился. Read-only `health`: HTTP200, chain31371, block22.
  `allocations`: HTTP200, epoch0, observedBlock22, observedAt1788985253,
  proposals[]. Наличие новых полей подтверждает загрузку изменённого маршрута.
- SHA256 `.local/app.json`, `.local/deployment.json`, `proof/deployment.json`,
  `proof/runtime.local.json`, `proof/execution-policy.local.json` до/после
  совпали; `allowExpensiveProving` остаётся false. Цепь не перезапускалась.

**Ещё не проверено вручную:** отображение populated proposals, кнопки после
реальной смены/отзыва согласия, LP card на настоящем рынке, browser role switching.
На текущей цепи нет proposals и рынков; synthetic/unit evidence не объявляется
ручным smoke. Root выполняет последующие общие сценарии с реальными receipts.
