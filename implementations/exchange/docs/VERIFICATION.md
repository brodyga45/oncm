# Exchange verification log

Historical log below. The subsequent onchain social replacement, original ECP deployment and real Alice/Bob browser transactions are documented in [ONCHAIN-SOCIAL.md](../ONCHAIN-SOCIAL.md) and [VALIDATION.md](../VALIDATION.md). The five offchain social API tests below do not validate the current social authority model.

Date: 2026-09-09. Local-only chain 31372. Economic harness uses an independent in-process Ganache and cannot satisfy the genuine proof requirement.

## Automated

- `npm run compile`: passes, original published CTF/V2 artifacts and own contracts; no V2 formula fork.
- `npm test`: 15/15 passes. See `data/economic-test-report.json` for named tests. Includes concrete revert/payout/escrow/fee/governance/operator/extra-feature behavior, and real canonical wrapper `name()`, `symbol()`, `decimals()`.
- `npm run test:api`: 7/7 passes. Real API read, SIWE signature/nonces, cross-origin mutation rejection, package roundtrip, unsupported Lean target rejection before subprocess creation, block explorer and actual Palomar commit import.
- `npm run test:social`: 5/5 passes. Session-derived profile/comment author, persistence, parent thread constraints, author-only edit/history, vote uniqueness/switch/remove/self-vote rejection, deterministic sort and logout revocation. Social checks use a separately identified offchain API test thread, not a counterfeit market.
- `npm run build`: passes; final Buffer polyfill is included for browser SIWE.

## Manual browser observations

Chrome through CUA, Exchange local port 5172:

1. Initial empty catalog rendered real chain block and fail-closed proof status; no synthetic markets/prices.
2. Devnet Alice connection showed the expected public address and actual 100,000 T in Portfolio.
3. Palomar library loaded live published entries and exact source repository/commit metadata. The import API itself was tested end-to-end; registry data never counted as a certificate.
4. Profile modal showed stored name/bio, full wallet address, T balance and market count.
5. SIWE browser sign-in initially failed because the SIWE parser’s Node Buffer import was externalized by Vite. Added pinned browser `buffer` package and Vite alias, restarted dependency optimizer. Retest passed and exposed the Save profile action.
6. Manually saved `Alice · Number Theory` and a local demonstration bio. Modal immediately displayed the saved profile and full unchanged wallet address, without a blockchain transaction.
7. Create market → published Lean core fixture loaded the actual `Oncm.goal` / `Nat.add_comm` source, exact canonical goal hash, fixture ID and profile. The onchain create button remained disabled without wallet/certificate. No proof job was launched during this UI check because certificate generation was already running under the coordinator.
8. Entered `Unsupported.goal` and pressed registration in the browser. The API rejected it before spawning a process and the modal displayed the supported `Oncm.goal` interface and remediation. The onchain create action remained disabled.

## Defects found and fixed

- Original wrapper metadata expects Solidity short-string storage words, not plain padded bytes32. Added low-byte `length*2`, preserved 65-byte format and tested actual ERC-20 metadata. Found during bounded review by the Vault lead.
- Ganache timestamp-dependent V2 reserve update could exceed exact gas estimate. SDK now estimates then supplies bounded gas margin; actual economic calls retested.
- Initial API runner-diagnostics newline escaped incorrectly; syntax check/startup caught it and it was corrected.
- Vite SIWE Buffer compatibility, described above; browser retest confirmed real signature flow.
- Profile editor previously refetched on each recreated SDK reference; fetch now keys on actual address/token to preserve in-progress text.
- Completed proof jobs now populate a certificate only when their captured source, target, fixture and outcome still match the edited form. Registration also checks the captured goal/profile. Editing those fields invalidates any displayed certificate.
- The API rejects a nonempty target declaration outside the installed profile before spawning Lean; selecting an arbitrary imported theorem cannot silently check `Oncm.goal` instead.

## Genuine proof integration

The final v3 profile is installed through real Governor/Timelock execution. Native-checker hardening and zk generation are coordinated in `proof/`. The actual published-theorem zk certificates are still being generated; no claim of completed create→trade→genuine proof→redeem is made yet. The coordinator’s browser exercise and receipts must be appended once that path finishes.

### v3 migration — 2026-09-10 local time

`node scripts/install-profile.mjs` deployed the immutable bridge, delegated Alice's T, proposed two exact registry calls, cast a vote, queued the proposal and executed through the Timelock. Local mining/time controls advanced the documented demonstration delays. The persistent chain resumed at block 92; migration finished at block 112 with existing contract addresses and balances preserved.

- Profile: `0x190eddca14d88c2af77ea74b7ba257dcb7f9236c1cf7c8002890a992332c485e`.
- Bridge: `0x49fd2BE640DB2910c2fAb69bB8531Ab6E76127ff`.
- Execution transaction: `0xc5e2bda5103f93ad69d6026146282ee6aae8a9379fa6533a2c538e1bc1062c96`.
- New profile registration/resolution flags are true; prior profile's registration flag is false. Governor reports `Executed`. Registry remains empty and all three initial accounts retain 100,000 T.
- API deployment, proof profile and published fixture agree on v3. Browser creation form displays its full ID; Governor page displays the completed proposal, snapshot 96, deadline 108 and 100,000 For votes. Alice's voting-power display is 100,000 T.
- Browser block explorer shows block 112, exact transaction/actor hashes, unchanged T balances, `ProfileAdded`, two `CallExecuted`, `AvailabilityChanged` and `ProposalExecuted` events.
- The seven API regression checks passed after migration, including actual earlier-block receipt lookup and Palomar snapshot import.

Machine-readable receipts/assertions: `data/profile-installation.json`, `data/profile-verification.json`. No new prover jobs or markets were created during this migration QA.

No runtime-only economic mock is available in the main UI and no administrator resolve method exists. Do not mark all twenty scenarios or the overall project complete until genuine proof and manual economic workflows have their final observations recorded.
