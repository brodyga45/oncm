# Two losing addresses, proposal left ready at193

Coordinator browser tab102825364, existing Vault31373 instance554c825d-6813-43bf-9bf0-6ede06acff4d. The live epoch2 originally gave Account0 and Account1 each50%. Account0 proposed40% each plus20% for Account2 through the ordinary Income UI.

- 191: proposal1 created; both Account0/Account1 displayed as decreasing, with no consent; Activate disabled.
- 192: Account0 consented. Account1 still lacked consent; Activate remained disabled. Switching to Account2 hid the consent/revoke control and left Activate disabled. No transaction was sent by Account2.
- 193: Account1 consented. Both displayed consented and Activate became enabled. The old status label incorrectly still read “Ожидает согласий”; the coordinator changed it to use the same missing-consent predicate as the button. The subsequent ordinary browser check showed “Готово к применению”.

**No apply transaction was sent.** While this proposal was ready, the user added governance-as-beneficiary. Proposal1 was not rewritten into a different signed allocation. It remains the original20% Account2 proposal; a future governance-beneficiary allocation must be a separate explicit proposal with its own required consents. Current epoch2 is unchanged at193.

The read-only collector verifies all three receipts, actor order, exact sorted weights, approval states, unchanged old allocation/T balances and unchanged previously blocked deadline parent189/child190. This pass generated or claimed no fees and did not touch source publication. Missing-consent enforcement beyond the visible disabled button belongs to existing contract tests; a completed two-party apply is not claimed here. Own browser tab was closed.
