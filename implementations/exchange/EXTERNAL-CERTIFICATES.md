# Additional immutable profiles and CI certificates

Exchange keeps v3 as its existing arithmetic profile. `perf05` is an additional zero-axiom Lean logic profile, not a rename of v3. Its source metadata, exact Lean files, canonical goal/proof exports and the successful CI registration certificate are bundled under `proof/profiles/perf05/`. Runtime use has no dependency on sibling applications, `../../tools`, or `../../docs`.

The bundled profile manifest is the exact historical CI manifest, including its preparation-time status. Current governance availability is read from the chain; cryptographic acceptance is checked live. The `profileId` and guest image are immutable, and the local runner remains v3-only. Selecting perf05 disables local check/prove buttons and offers external certificate import.

## Install without changing v3

`node scripts/prepare-additional-profile.mjs` deploys only the existing `LeanProofBridge` artifact with perf05 image/profile constructor arguments on Exchange chain31372/RPC9546. It does not propose, vote, queue, execute, retire v3, or create a market. Re-running reuses the recorded deployed bridge. The result is `data/additional-proof-profiles.json`; its `installation` object contains the exact target, value0, calldata, description, profileId, verifier and manifest commitment.

In Governance, fill the immutable profile fields from that object, encode the registration call, propose, vote, queue and execute through Governor/Timelock. The proposal contains only `addProfile`, so v3 registration and resolution availability are unchanged. The app reads onchain profile status independently of the preparation-time `installed` field in the local record.

## Create through the website

1. Connect a wallet on the Exchange local chain and open **Create market**.
2. Select **Lean logic · perf05 · zero axioms**. The cards show exact bundled logical statements. The enabled status is read from the chain; **Refresh onchain availability** updates it after governance.
3. Download the real CI registration certificate with the provided button, or use `proof/profiles/perf05/certificates/true-registration.json`. Import it using **Import external CI registration certificate JSON**, or paste the complete JSON into **OR PASTE EXTERNAL CI REGISTRATION JSON** and click **Verify pasted registration certificate**. The generic portable JSON uploader also recognizes this format.
4. The importer checks `format=oncm-real-groth16-ci-v1`, Groth16 kind, exact pinned image/profile, outcome0, 128-byte journal, 260-byte EVM seal with selector `73c457ba`, and canonical ABI encoding `(bytes seal, bytes journal)`. It calls the selected immutable bridge's `verifyGoal` through `eth_call`; claimed verification flags in the upload are not authority.
5. It selects the bundled exact goal package by profile+goalHash and recomputes SHA256 of its canonical export. Displayed source is reproducible metadata; the export is the economic commitment. The form shows the separate profile and proof-check block.
6. Click **Create market onchain**. This wallet transaction invokes the registry's own profile availability and original certificate checks again. No creation script substitutes for this browser action. LP, swaps and block history then use the existing CTF/UniswapV2 paths.

The bundled artifact is only a GoalWellFormed registration. It cannot settle the market. It was originally generated in CI3 run34416918326 and accepted by the original EVM verifier; the website repeats verification against the newly deployed perf05 bridge.

## Import the later theorem proof

Open the created market → **Proof lab**, select YES or NO, then upload the corresponding CI certificate JSON or paste it and click **Verify pasted proof certificate**. The selected outcome, market goal and market profile must match. A registration artifact, another market's goal, or a v3 artifact is rejected. Import calls original `bridge.verify(statementId,goal,profile,outcome,certificate)` by `eth_call`; **Submit proof onchain** sends the actual resolution transaction. No native-success flag or server signature replaces the ZK proof. Changing the outcome clears the imported certificate.

The true perf05 market also offers **Load published YES certificate · CI4**. This explicitly loads the exact reviewed CI4 JSON into the paste field; it does not accept it automatically or submit a transaction. Click **Verify pasted proof certificate**, then separately **Submit proof onchain**. The standalone artifact is `proof/profiles/perf05/certificates/true-proof.json`, served by the allowlisted `GET /api/proof/certificates/perf05/true-proof`. Other case names return404. The artifact came from CI run34418238753; it is a real outcome1 proof, distinct from the outcome0 registration certificate.

SDK: `sdk.verifyExternalCertificate(artifact, trustedCatalogProfile, {outcome: 0})` for registration; pass `{statementId,goalHash,profileId,outcome:1|2}` for resolution. The SDK returns checked bindings, onchain verifier, block, and current availability. `fixtureForCertificate(catalog.fixtures,binding)` selects/validates the canonical package; `createMath(...)` and `resolve(...)` submit normal registry transactions. `decodeExternalCertificate` alone is a transport validator, not cryptographic verification.

Validation: `node --test tests/proof-import.test.mjs` runs15 offline binding/negative tests. `node tests/proof-import-live.mjs` performs a read-only check of the actual certificate and rejects a changed Groth16 seal while retaining coherent ABI fields; it also checks v3 remains enabled. `npm run build` verifies the React bundle. These tests do not create a market or alter governance. Local proving is not started by any import or catalog endpoint.
