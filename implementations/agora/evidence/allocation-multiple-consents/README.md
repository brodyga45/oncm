# Two decreasing beneficiaries — browser pass, blocks94–97

The coordinator used its own Chrome tab102825351 on the existing Agora chain31371. All four transactions were sent through Protocol revenue controls with the labelled local test wallets. No contract, server, prover or UI code changed during this pass.

At93, epoch1 allocated50% each to Reviewer (`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`) and Curator (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`). The coordinator entered40% for each and20% for Mathematician (`0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`).

| Block | Observed browser action and result |
| --- | --- |
|94|Curator clicked Propose allocation. Proposal1, base epoch1, listed exactly Reviewer and Curator as required consents, each50%→40%; Apply disabled.|
|95|Curator clicked Give my consent. Curator became Consented; Reviewer remained Awaiting consent; Apply remained disabled.|
|95|Switched to Mathematician. Both Give my consent and Revoke were disabled; Apply remained disabled. Switching wallets cleared the editable proposal draft. No transaction was sent.|
|96|Switched to Reviewer and clicked Give my consent. Both were Consented; proposal became Ready to apply and Apply enabled.|
|97|Switched to Mathematician and clicked Apply. Epoch2 showed Mathematician20%, Reviewer40%, Curator40%; proposal became Applied and all its controls disabled.|

The newly included address supplied no consent: it could execute only after both losing addresses had consented. The UI continued to list old immutable epoch0/1 splitters and the new epoch2 splitter; all held zero T in this pass. No new fees were generated or claimed, and this pass does not establish payment of a nonzero older epoch after redistribution. No disabled button was forcibly invoked, so the missing-consent result here is a browser gating observation, supplemented by the contract's separate enforcement tests.

The accompanying read-only collector reconstructs actual receipts and historical state at explicit blocks. Its assertions are distinct from the browser observations above. Prior blocked NO settlement, matching derived creation and Vault actions were not retried.
