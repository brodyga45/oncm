# Независимая браузерная проверка Agora treasury

Координатор, 2026-09-10; собственная Chrome-вкладка102825397, `http://127.0.0.1:5171/`, chain31371/block110. Только чтение обычного интерфейса; никаких подписей, предложений, переводов или изменений времени.

- Revenue: epoch4 Math16%, Reviewer32%, Governance15%, Curator37%. Адрес казны `0xa513e6e4b8f2a923d98304ec87f64353c4d5c853`; фактический баланс0.0008T.
- Историческая epoch3 показывает долю20%, released0.0008T и claimable0T. Текущая epoch4 показывает15%, released0T/claimable0T. Все пять `Claim T into treasury` отключены: повторное получение не предлагается.
- Proposal2: все три уменьшающихся человеческих адреса отмечены Consented, статус Applied. Proposal3: единственный теряющий — Timelock20→15, Consented/Applied. Consent/revoke/apply и подготовка нового DAO consent для этого уже исполненного предложения отключены.
- Governance: `Approve governance beneficiary consent for allocation #3` имеет EXECUTED,2of2 signatures, Safe nonce4, target AllocationController `0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0`, operation`0xa0386c8907d055a55fc160b9f6108f0d3c9724b4376f39bbc71646d452fd6dd5`. Повторные Sign/Schedule/Execute отключены.

Это независимая проверка отображения итогового состояния. Историю фактических отправок и проверки балансов содержит [основной журнал Agora](../../implementations/agora/TREASURY-BENEFICIARY.md). Внутренняя выплата казны не отправлялась; её подготовка не считается исполнением.
