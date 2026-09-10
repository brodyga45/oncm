# Public Exchange validation evidence

These files preserve completed local testchain observations and public CI artifacts. They contain no private job history or automatically published private source. A report is not a promise that every scenario was tested through a browser.

| Directory | Evidence and limits |
| --- | --- |
| `onchain-social/` | Actual additive ECP deployment and financial preservation check; two-wallet browser actions159–173 with full revisions, vote transitions, replies and tombstones; browser-exported JSON checked against direct RPC history. |
| `perf05-true/` | Coordinator's genuine True market lifecycle, captured by read-only RPC collector through188 and201. Both reports are retained. Failed UI attempts have no invented receipt. Protocol revenue was withdrawn as LP; that fee LP has not yet been converted to T. |
| `perf05-false/` | Coordinator's generic-bundle False market, actual receipts202–218: registration, split, NO liquidity, trade, genuine refutation, trader redemption and LP exit/redemption. The assets listed are this market's tokens, not all portfolio tokens. Losing YES and original minimum/protocol liquidity remain separately accounted. |
| `local-nonce/` | Independent ephemeral Ganache reproduction of cached nonce reuse on an already used account; the corrected provider completes nonce1/2/3. This never contacted the active9546 chain. It explains a reproduced defect, not a retroactively recovered browser error. |
| `generic-external/` | Four ready-to-paste exact-export bundles wrapping unchanged genuine CI registration/proof/refutation records; actual original-verifier and bridge read-only checks at201, including two rejected mutations; bounded UI build measurements. This is not fresh proof generation for a third theorem. |
| `standalone/` | Actual separate startup from499 public source files, no copied runtime/deployment/generated artifacts, with an existing locked node_modules symlink. Solidity/real bridge/ECP deployment and API/web reads passed. All isolated ports closed; no fresh npm installation or fresh browser action is claimed. Exact source manifest and process-tree resource report are included. |

For generic browser testing, paste the complete `generic-external/false-registration.json` in Create with perf05 selected, verify, review the canonical export/source warning, then submit separately. On that registered market, select NO in Proof lab and use `false-refutation.json`. File upload is optional. The exact input-byte digest includes whitespace; adding/removing a final newline changes that transport digest while retaining the same mathematical certificate.

Full boundaries and commands are in [VALIDATION.md](../../VALIDATION.md), [EXTERNAL-CERTIFICATES.md](../../EXTERNAL-CERTIFICATES.md) and [ONCHAIN-SOCIAL.md](../../ONCHAIN-SOCIAL.md).
