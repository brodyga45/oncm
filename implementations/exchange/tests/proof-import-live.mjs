// Read-only: real certificate against the original immutable bridge. No market or profile mutation.
import fs from "node:fs";
import assert from "node:assert/strict";
import { AbiCoder, JsonRpcProvider, concat } from "ethers";
import { ExchangeSDK } from "../sdk/index.mjs";
import { catalogWithChain } from "../api/proof-catalog.mjs";
const root = new URL("../", import.meta.url).pathname;
const read = f => JSON.parse(fs.readFileSync(root + f));
const d = read("data/deployment.json"), provider = new JsonRpcProvider(d.rpc);
assert.equal(d.chainId, 31372); assert.equal(d.testHarness, false);
const sdk = new ExchangeSDK(provider, null, d, read("web/generated/abis.json"));
const catalog = await catalogWithChain(root, sdk), p = catalog.profiles.find(p => p.id === "perf05");
const artifact = read("proof/profiles/perf05/certificates/true-registration.json");
const positive = await sdk.verifyExternalCertificate(artifact, p, {outcome: 0});
assert.equal(positive.profileId, p.profileId);
const proof = read("proof/profiles/perf05/certificates/true-proof.json");
const trueProof = await sdk.verifyExternalCertificate(proof, p, {goalHash: artifact.goalHash, outcome: 1});
assert.equal(trueProof.outcome, 1);
const bad = structuredClone(artifact);
bad.rawSeal = "0x" + (bad.rawSeal.slice(2, 4) === "00" ? "01" : "00") + bad.rawSeal.slice(4);
bad.evmSeal = concat(["0x73c457ba", bad.rawSeal]);
bad.certificate = AbiCoder.defaultAbiCoder().encode(["bytes", "bytes"], [bad.evmSeal, bad.journal]);
await assert.rejects(sdk.verifyExternalCertificate(bad, p, {outcome: 0}), /rejected/);
assert.equal((await sdk.contract("protocol").profiles(d.profile)).newEnabled, true, "Existing v3 must remain available");
console.log(JSON.stringify({status: "PASS", originalBridgeAccepted: true, ci4TrueProofAccepted: true, tamperedCryptographyRejected: true,
  v3StillAvailable: true, installed: positive.installed, readyToCreate: positive.available,
  verifier: positive.verifier, block: positive.verifiedAtBlock, readOnly: true}, null, 2));
