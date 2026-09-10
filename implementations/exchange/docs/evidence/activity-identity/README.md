# Activity identity correction

2026-09-10. The actual expanded receipt for transaction `0xada7d7a20a0bd3040f6de66ba327e28289b7a1ba0b2623137a14f121ce6201da` at block242 showed duplicated account rows because transaction addresses and indexed Transfer addresses had different letter casing.

The endpoint now deduplicates normalized actor and asset identities **before** historical balance reads. It retains the first-seen display address. It does not add repeated snapshots together. Distinct token contracts remain distinct, and the helper's explicit kind/position-ID identity keeps exact BigInt IDs separate; the existing endpoint remains an ERC20 `balanceOf` reader, without new ERC1155 support. Each delta is calculated exactly from that asset's before/after values.

[Before](before.json) and [after](after.json) preserve the actual response. Rows decreased from24 to18 unique identities, with unchanged exact balances/deltas and first-seen display. In the agent's own Chrome tab, the expanded block242 table then displayed18 unique rows; Carol's `2148402661908158473` wei T profit appeared once.

Only the idle API was restarted. The six existing proof jobs were terminal; all65 prior JSON/policy SHA256 fingerprints and head242 remained unchanged. Proving stayed disabled. The development chain and website were not restarted, and no transaction or proof job was submitted. Another agent began authorized governance transactions only after this check and release.

The three targeted identity tests passed, including checksum variants, separate assets/position kinds, values above2^53, and a token absent at the previous block. Combined with the six existing portable-package regressions, the final focused run was **9/9 PASS**,266.909ms. The single bounded production build passed in **2.59s**, with supervisor2.904s and peak503,111,520B: [resource report](../standalone/activity-identity-build-resources.json). The tests establish code behavior; the separately described browser observation establishes the actual table fix.
