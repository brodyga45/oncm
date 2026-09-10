# Real operator governance and custom condition:243–265

Actual manual browser pass2026-09-10, own Chrome tab102825357, `http://127.0.0.1:5172/`, chain31372. Started only after the owning agent released its API restart/read-only242 checks. Labelled public devnet wallet Alice; no impersonation, alternative submission path, mock verifier, new proof, alias, contract edit, network migration or reset.

[prepared.json](prepared.json) records exact deployed UnresolvedByOperator artifact runtime equality before submission. Empty registry mapping was confirmed at242; no old operator admission/proposal existed. Existing evaluator `0x172076E0166D1F9Cc711C77Adf8488051744980C`; ID `0x7415fa73972e0654172eae9563f19d630fbb0deb9d04fab3af2f406454820a5a`; manifest `UnresolvedByV1: ABI(bytes32 dependency,uint64 inclusiveDeadline)`.

## Actual normal UI stages

1. Governance → **Statement operator** → **Encode exact registration call**. Reviewed populated exact ID/address/manifest, `addOperator` calldata, target actual registry `0xf4B146FbA71F41E0592668ffbF264F1D186b2Ca8`,0wei value. Alice already had historical voting power; no new delegation was needed. **Create proposal** confirmed243.
2. Proposal Pending at243, snapshot244/deadline256. **Mine1block** →244 remained Pending (exact snapshot boundary), then one more →245 Active. **For** →246:99,914.269 displayed T votes versus12,000 quorum; repeated For/Against/Abstain disabled, “already voted”. No failed vote was sent.
3. **Mine14blocks** →260 Succeeded; **Queue proposal** →261. UI displayed ETA10seconds later and disabled **Execute after delay**, reason “Timelock ETA has not arrived”. **Advance timelock delay+1s** →262; execution enabled; **Execute after delay** →263 Executed. No resubmission of an uncertain transaction.
4. Create → **Governance-registered operator**. Title `Operator QA · identity unresolved by2030 UTC` (actual title has spaces around date); genuine TRUE identity dependency `0x9b78961455b75385a452ae8278e749b2a897d75eb615bde01f43726a64e49d7f`, resolvedAt1789007629. Local2030-01-01 04:00 Asia/Yerevan = UTC2030-01-01T00:00Z = Unix1893456000. **Encode dependency & deadline** yielded exact64bytes recorded in prepared.json. Description explicitly showed dependency, local/UTC/Unix, semantic FALSE and no funding. **Create market onchain** →264; no liquidity button used.
5. Open new market → **Proof lab**. Actual registry readiness at264 said FALSE and enabled **Resolve when ready**. Click →265 Proven false; repeat disabled. **Block activity** actual expanded receipt263 showed `OperatorAdded`, Timelock `CallExecuted`, Governor `ProposalExecuted`;265 showed original CTF `ConditionResolution` `[0,1]` and registry `Resolved`. Balance inspector265 showed unchanged Alice/registryT.

Proposal ID `78517177682230378331973706558924055953122132137664931932319132699870000755886`. Statement ID `0x88a00e317c255c0e3a13cc69bf919f96003fbbdd373f8a40cb3e59c62a63a1c2`. Original CTF condition `0x40df3db489b9f76297b6b20c68cd1df9378c945f786b516467ff09792366b216`.

| Block | Original call | Transaction |
|---|---|---|
|243|Governor propose|`0xf698432778976f9ee3e30c562c4b24052a57617f719917e538ed5a10c13babfa`|
|246|Governor castVote|`0xbb9b962dcc7f93e8125ecd99e3329ca8826b6d2f021a57b32904bc098a95685d`|
|261|Governor queue|`0x4b2a2e3b6ec48cb0e43c3f7c1b6a7c91f4d8b42092fe3dca3e1d9ab24b074890`|
|263|Governor execute→Timelock→addOperator|`0x086366d174e17a014fd9a6386301afb9bc56617766b05699b3f7fd779de34be6`|
|264|createOperator|`0xedf39fc4fff4fdd53f08d9c53039a0bc994a5dec800849794dcda8e86c2fe83a`|
|265|resolveDerived|`0x6e04938b17c3da9151847f85a356cd3023d128dd1ff417e9518121a9def8acdd`|

## Independent read-only assertions

[verified.json](verified.json) includes all raw blocks243–265 (including empty local clock blocks), transactions/receipts, decoded events, exact historical Governor states and before/after market snapshots. [capture-operator-browser.mjs](../../../scripts/capture-operator-browser.mjs) has no signer/write/mining paths. It passed in7.48s: exact proposal/custom calldata, zero ETH call values, admitted actual module, original CTF FALSE payout, all9preexisting statement objects, outcome supplies/actor balances, pair reserves/LP supplies/actor balances, all3actorsT+CTF collateral, and oldv3/perf05 profile entries unchanged242→265. New outcome supplies, both newpair LP supplies/reserves are0. Gas consumed testETH; unchanged balances mean T/assets, not ETH.

## Presentation defect found and repaired at unchanged265

The original generic resolution panel rendered kind4's unused zero `dependency` and “No deadline”. Actual operands were independently reviewed and the description showed exact semantics, but the panel was misleading. A narrow fix in `web/derived-resolution.jsx` plus `web/operator-details.mjs` now reads `statements`, `operatorArguments`, and `operators` at the same readiness block and shows actual operator ID, evaluator, raw ABI operands, manifest and availability. It makes no guessed dependency/date decoding. Built-in kinds1–3 retain their existing panel. Existing asynchronous account/statement guard also protects the added read.

Meaningful render/same-block/error tests plus existing readiness/date regressions:13/13PASS,181ms. One bounded Vite build passed2.28s (whole guard2.662s, peak494,771,608bytes under768MiB, cleanup clean): [build-resources.json](build-resources.json). Actual own browser re-opened market→Prooflab at unchanged265: exact module ID/address/64byte operands/manifest shown; no zero-dependency or “No deadline” row; resolved/repeatdisabled retained. No financial transaction or API restart during repair. `main.jsx`, protocol/contracts, mathematical proof configuration and other agent's API/Palomar files untouched.

This establishes genuine current-chain operator admission and use through ordinary web governance, separate from earlier economic tests. It does not claim operator disable/version replacement, nonowner/rejected vote branches, new mathematical proofs, or funded custom-market trading. No automatic approval review refusal occurred in this pass.
