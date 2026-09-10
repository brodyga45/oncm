## What changes for the Vault user?

<!-- Describe the trigger and resulting behavior. Link the user scenario or issue. -->

## Implementation and compatibility

<!-- Name the relevant web → SDK → API/contract boundary. Note any affected
immutable profile, onchain state, fee/beneficiary authority or artifact pins.
Agora and Exchange are frozen comparison implementations; explain any change there. -->

## Validation

<!-- Give exact commands and outcomes. Distinguish source tests, isolated contract
harnesses, actual RPC/receipt evidence and manual browser checks. State what remains
untested; a mocked verifier or native Lean check is not a genuine ZK acceptance. -->

- [ ] Vault source tests and production build passed, or the blocker is recorded.
- [ ] Dependency/source changes retain OSS licenses and update reviewed pins when needed.
- [ ] Local state, personal keys, credentials, private drafts and proof jobs are absent.

## Rollout or state changes

<!-- “None” for source-only changes. A PR does not deploy or reset the pilot.
If a new contract/profile/version is needed, describe explicit admission/migration,
existing balances and consent rights, and how an interrupted rollout is recovered. -->
