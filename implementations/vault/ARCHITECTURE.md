# Vault — зафиксированные выборы

Реализация C. Gnosis CTF + wrappers + настоящий Balancer V3 Vault/WeightedPool и pool creator fee. FinalityHook прекращает swap после payout, оставляя пропорциональный выход. Доход в pool assets с allocation epoch при сборе. OZ Governor с отдельным членством/голосами (не T) + Timelock.

Svelte-интерфейс управления капиталом: просторная композиция, диаграммы весов/активов, светлая холодная палитра с отдельным акцентом. Независимая локальная EVM chainId=31373, RPC=9547, web=5173, API=4173. Свои зависимости, SDK/deploy/state, без соседних runtime imports. Общий план: [implementation-program](../../docs/implementation-program.md).

Проверить конкретные Vault/factory/controller версии/права; нельзя заменить Balancer собственной constant-product формулой с таким названием. Остальные детали разрешено выбирать самостоятельно и фиксировать здесь. Реальный proof adapter отделён от mock harness; mock не завершает Lean/zk сценарий.


## Реализованная сборка

- Собственный canonical Balancer V3 deployment с ProtocolFeeController global protocol share 0 и creator share 20% от swap fee. Vault/Extension/Admin/Factory/Router/WeightedPool — npm upstream 1.0.0 без исходных изменений. `viaIR`, solc 0.8.28, optimizer runs=1; EIP-170 limit включён.
- Creator — AllocationController. Своя epoch policy применяется по сбору средств в immutable Splits V2 PullSplit. Старые wallets заморожены owner=0. Полный warehouse withdrawal использует существующий overload без сохранения 1 raw unit; upstream split distribution оставляет свой 1-unit dust.
- Native wrapped ETH — Solmate WETH из npm 6.8.0 (AGPL-3.0-only), но UI торгует ERC-20 T/outcome, `wethIsEth=false`.
- FinalityHook блокирует swap и addLiquidity в canonical pools, proportional remove callbacks не включает. Отдельный hook на утверждение с immutable statementId также включает beforeInitialize; callback Balancer не содержит pool address, поэтому общий hook здесь был бы недостаточен. Даже прямой Router.initialization пустого пула после payout отвергается. Informed pre-proof swap не устранён.
- Profile/operator registry: immutable implementation+manifest/spec; admission toggle не переписывает старые критерии. Governance устанавливает новый символ как static-call module. Пример ResolvedWithinWindow развёрнут отдельно для последующей governance installation.
- Timelock owner у registry/membership/collector; настоящий Governor на непередаваемом membership, bootstrap admin отозван. Factory/Vault API и roles фиксируются deployment; произвольная замена глобального fee controller потребовала бы совместимой миграции collector, а не одного необдуманного administrative call.
- Off-chain persistence — собственный atomic JSON store под `.state/` в однопроцессном Express API. Это осознанный local MVP выбор: без внешнего Postgres/Redis runtime. Session только в памяти, перезапуск отзывает вход; профили/обсуждения/jobs/packages сохраняются.
- SDK/API reads имеют реальные EVM block references. Прогноз LP показывает условное погашение текущего inventory; governance preflight — read-only inner-call simulation от Timelock. Эти две дополнительные функции описаны в EXTRA-FEATURES.md.

Большинство воспроизводимого Lean окружения — установленный системный toolchain плюс собственная копия checker/host/bridge. Никаких runtime imports либо HTTP-вызовов сервисов Agora/Exchange нет. Pin текущего accepted profile читается из proof/manifest.json и .state/deployment.json; обновление проходит обычный Governor/Timelock через scripts/install-profile.mjs.
