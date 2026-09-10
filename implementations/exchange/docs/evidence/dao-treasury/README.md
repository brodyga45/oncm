# Actual DAO beneficiary cycle — Exchange, blocks 266–319

[Raw historical evidence](through-319.json) contains all 20 successful transactions, intervening empty clock blocks, decoded events and numbered balance snapshots. The collector is read-only and asserted every receipt, actual original V2 LP mint, DAO-only Warehouse withdrawal, required DAO consent and unchanged CTF collateral/T supply.

- 266–269: Alice/Bob consented to 50→40%; epoch 3 activated DAO20/Bob40/Alice40.
- 271: Bob bought YES for 1 T. 273: Alice removed 1 LP, triggering original V2 protocol mint of **0.004594151698622609 LP**. 274 collected it into epoch 3; 275 distributed it through the original Split/Warehouse. No donation or faucet funded this income.
- 276–296: a real Governor vote, queue and Timelock execution called original Warehouse withdrawal for the DAO itself. DAO received **0.00091883033972452 LP**; Warehouse retained its one-raw-unit sentinel. No EOA received this claim.
- 297–319: the outer DAO20→15/Alice40→45 proposal remained blocked until Governor→Timelock consent at318. Applying at319 activated epoch4 DAO15/Bob40/Alice45. Both governance proposals are Executed; none remains pending.

A separate payment of 0.0004 LP to Carol was **prepared only** at319. No internal-payment Governor proposal or payment transaction was submitted. This does not claim LP-to-T monetization, consent revocation or internal distribution completion. Source, chain and UI were frozen at319 when the project consolidated on Vault.
