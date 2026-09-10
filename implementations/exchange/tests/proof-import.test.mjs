import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AbiCoder, sha256, toUtf8Bytes } from "ethers";
import { decodeExternalCertificate, fixtureForCertificate, verifyExternalCertificate } from "../sdk/proof-import.mjs";
import { readProofCatalog } from "../api/proof-catalog.mjs";
const root = path.resolve(import.meta.dirname, "..");
const artifact = JSON.parse(fs.readFileSync(path.join(root, "proof/profiles/perf05/certificates/true-registration.json")));
const catalog = readProofCatalog(root), profile = catalog.profiles.find(p => p.id === "perf05");
const copy = () => structuredClone(artifact);
test("real CI registration decodes against the separately pinned image/profile and exact goal", () => {
  const b = decodeExternalCertificate(artifact, profile, {outcome: 0});
  const f = fixtureForCertificate(catalog.fixtures, b);
  assert.equal(b.goalHash, f.goalHash);
  assert.equal(sha256(toUtf8Bytes(f.goalExport)), b.goalHash);
  assert.match(f.source, /∀ P : Prop, P → P/);
});
test("published CI4 proof is a distinct real outcome1 artifact and cannot register", () => {
  const proof = JSON.parse(fs.readFileSync(path.join(root, "proof/profiles/perf05/certificates/true-proof.json")));
  const binding = decodeExternalCertificate(proof, profile, {goalHash: artifact.goalHash, outcome: 1});
  assert.equal(binding.outcome, 1);
  assert.notEqual(binding.certificate, artifact.certificate);
  assert.throws(() => decodeExternalCertificate(proof, profile, {outcome: 0}), /not interchangeable/);
});
test("uploaded trust flags are not needed and are not cryptographic evidence", () => {
  const a = copy(); a.evmVerified = true; a.verifiedBy = "attacker";
  assert.equal(decodeExternalCertificate(a, profile).certificate, artifact.certificate);
});
for (const [name, edit] of [
  ["wrong image", a => {a.imageId = "0x" + "22".repeat(32);}],
  ["wrong profile", a => {a.profileId = "0x" + "22".repeat(32);}],
  ["journal mutation", a => {a.journal = a.journal.slice(0, -2) + "01";}],
  ["certificate trailing bytes", a => {a.certificate += "00";}],
  ["wrong EVM seal", a => {a.evmSeal = a.evmSeal.replace("73c457ba", "00000000");}],
  ["non-Groth16", a => {a.receiptKind = "Fake";}],
  ["outcome mismatch", a => {a.outcome = 1;}],
  ["string outcome", a => {a.outcome = "0";}],
]) test(`reject ${name}`, () => {
  const a = copy(); edit(a); assert.throws(() => decodeExternalCertificate(a, profile, {outcome: 0}));
});
test("registration cannot be imported as a resolution proof", () => {
  assert.throws(() => decodeExternalCertificate(artifact, profile, {outcome: 1}), /not interchangeable/);
});
test("a certificate for another market goal is rejected", () => {
  assert.throws(() => decodeExternalCertificate(artifact, profile, {goalHash: "0x" + "ab".repeat(32)}), /goal does not match/);
});
test("mutated canonical fixture export is rejected before package adoption", () => {
  const b = decodeExternalCertificate(artifact, profile), f = fixtureForCertificate(catalog.fixtures, b);
  assert.throws(() => fixtureForCertificate([{...f, goalExport: f.goalExport + "\n"}], b), /export hash mismatch/);
});
test("transport integrity alone never bypasses the live chain verification gate", async () => {
  await assert.rejects(verifyExternalCertificate({provider: {getNetwork: async () => ({chainId: 1n})}}, artifact, profile), /31372/);
});
test("existing v3 catalog and additional perf05 retain distinct semantics", () => {
  assert.equal(catalog.profiles.length, 2);
  assert(catalog.profiles.find(p => p.id === "v3").localRunner);
  assert.equal(profile.localRunner, false);
  assert.notEqual(profile.profileId, catalog.profiles[0].profileId);
  assert.deepEqual(profile.permittedAxioms, []);
});
