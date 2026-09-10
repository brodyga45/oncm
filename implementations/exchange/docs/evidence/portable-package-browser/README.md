# Actual download and paste roundtrip

At block228, in a newly created dedicated Chrome tab, the Exchange agent opened the existing generic FALSE market's **Specification → Download Lean package**. The downloaded [package](downloaded-package.json) is11837 bytes, SHA256 `4eb6d93d38b9dcefc283d4c05bccda5ff4c8cc125f08c729ed513b58e1766f46`.

All downloaded fields were pasted through **Paste portable Lean package JSON**. The pasted text's UTF-8 length and SHA256 exactly matched the download. **Load pasted package draft** restored the source, canonical goal `0xf3970d998f81087ef438303d55b460425ccf4622df367ae485e09deab064afb4`, selected perf05 profile `0x93cf174539debc6ddce2691f3def1e36023cf77fe1d93f1692f330150bd37e10`, empty fixture ID and target `Oncm.goal`.

Before explicit verification, the GoalWellFormed field was empty, Create was disabled, and the page said the package was an unverified draft. **Verify pasted registration certificate** then displayed acceptance by the original EVM verifier and immutable bridge at block228. The UI retained the explicit warning that source→goal correspondence was not verified. The reconstructed external bundle SHA256 was `294029a2fd8ed9fd5fe95b4ae86cdfd5e38ceca075f6d0d0bafb9a1a50c0b9d8`.

Create became enabled after verification; it was deliberately not clicked because the market already existed. Appending one whitespace to the paste field cleared the certificate and disabled Create again. The form was cancelled. This workflow left the chain at228 and created no proof job. [Observations](observations.json) preserve the exact fields and readiness states.

This pass did not use a file picker or claim a fresh native Lean/export reproduction. The downloaded `proofProfile` includes historical descriptive readiness fields from the original package; those are not current governance or cryptographic authority. Current profile availability and the certificate were checked through the actual registry and verifier during explicit Verify.
