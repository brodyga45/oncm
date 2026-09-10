import { AbiCoder, Contract, ZeroAddress, ZeroHash, concat, isHexString, sha256, toUtf8Bytes } from "ethers";

const abi = AbiCoder.defaultAbiCoder();
export const PROOF_DOMAIN = sha256(toUtf8Bytes("ONCM_LEAN_CLAIM_V1"));
export const PROOF_SELECTOR = "0x73c457ba";
// Claim-shape validation for manually supplied bytes. No cryptographic acceptance
// is implied; Registry/bridge still verifies the actual certificate on submission.
export function assertCertificateClaim(certificate, { goalHash, profileId, outcome }) {
  const [seal, journal] = abi.decode(['bytes', 'bytes'], certificate);
  requireThat(abi.encode(['bytes', 'bytes'], [seal, journal]).toLowerCase() === certificate.toLowerCase(), 'Noncanonical certificate ABI');
  requireThat(isHexString(seal, 260) && seal.toLowerCase().startsWith(PROOF_SELECTOR), 'Wrong original seal type');
  const expected = abi.encode(['bytes32', 'bytes32', 'bytes32', 'uint256'], [PROOF_DOMAIN, goalHash, profileId, outcome]);
  requireThat(journal.toLowerCase() === expected.toLowerCase(), 'Certificate does not bind this goal, profile and outcome');
  return true;
}
export function certificateClaimMatches(certificate, binding) {
  try { return !!certificate && assertCertificateClaim(certificate, binding); } catch { return false; }
}
export const BRIDGE_ABI = [
  "function imageId() view returns(bytes32)",
  "function profileId() view returns(bytes32)",
  "function verifyGoal(bytes32,bytes32,bytes) view returns(bool)",
  "function verify(bytes32,bytes32,bytes32,uint8,bytes) view returns(bool)",
];
function requireThat(ok, message) { if (!ok) throw Error(message); }
function hex(value, length, name) {
  requireThat(isHexString(value, length), `${name}: expected ${length} bytes`);
  return value.toLowerCase();
}

// This validates transport and exact bindings. It is NOT cryptographic verification.
// Trust neither the uploaded verifiedBy/evmVerified flags nor an uploaded profile.
export function decodeExternalCertificate(artifact, profile, expected = {}) {
  requireThat(artifact?.format === "oncm-real-groth16-ci-v1" && artifact.receiptKind === "Groth16", "Expected an original CI Groth16 certificate JSON");
  requireThat(profile?.profileId && profile?.imageId, "Unknown immutable proof profile");
  const profileId = hex(artifact.profileId, 32, "profileId");
  const imageId = hex(artifact.imageId, 32, "imageId");
  const goalHash = hex(artifact.goalHash, 32, "goalHash");
  const outcome = artifact.outcome;
  requireThat(Number.isInteger(outcome) && [0, 1, 2].includes(outcome), "Invalid certificate outcome");
  requireThat(profileId === profile.profileId.toLowerCase() && imageId === profile.imageId.toLowerCase(), "Certificate image/profile does not match the selected immutable profile");
  if (expected.profileId) requireThat(profileId === expected.profileId.toLowerCase(), "Certificate profile does not match this market");
  if (expected.goalHash) requireThat(goalHash === expected.goalHash.toLowerCase(), "Certificate goal does not match this market");
  if (expected.outcome !== undefined) requireThat(outcome === expected.outcome, "Registration and proof/refutation certificates are not interchangeable");
  const rawSeal = hex(artifact.rawSeal, 256, "rawSeal");
  const evmSeal = hex(artifact.evmSeal, 260, "evmSeal");
  const journal = hex(artifact.journal, 128, "journal");
  requireThat(hex(artifact.verifierParameters, 32, "verifierParameters").startsWith(PROOF_SELECTOR), "Wrong original verifier selector");
  requireThat(evmSeal === concat([PROOF_SELECTOR, rawSeal]), "EVM seal differs from the original seal");
  const expectedJournal = abi.encode(["bytes32", "bytes32", "bytes32", "uint256"], [PROOF_DOMAIN, goalHash, profileId, outcome]);
  requireThat(journal === expectedJournal, "Authenticated journal binding mismatch");
  const certificate = abi.encode(["bytes", "bytes"], [evmSeal, journal]);
  requireThat(typeof artifact.certificate === "string" && artifact.certificate.toLowerCase() === certificate, "Certificate ABI is noncanonical or inconsistent");
  const [decodedSeal, decodedJournal] = abi.decode(["bytes", "bytes"], certificate);
  requireThat(decodedSeal === evmSeal && decodedJournal === journal, "Certificate ABI round-trip failed");
  return { profileId, imageId, goalHash, outcome, certificate, journal, receiptSha256: artifact.receiptSha256 };
}

export function fixtureForCertificate(fixtures, binding) {
  const fixture = fixtures.find(f => f.profileId.toLowerCase() === binding.profileId && f.goalHash.toLowerCase() === binding.goalHash);
  requireThat(fixture, "This registration certificate has no bundled exact goal package; import its package first");
  if (fixture.goalExport) requireThat(sha256(toUtf8Bytes(fixture.goalExport)) === binding.goalHash, "Bundled canonical goal export hash mismatch");
  return fixture;
}

export async function verifyExternalCertificate(sdk, artifact, profile, expected = {}) {
  requireThat(Number((await sdk.provider.getNetwork()).chainId) === 31372, "Certificate verification requires Exchange local chain 31372");
  const binding = decodeExternalCertificate(artifact, profile, expected);
  const installed = await sdk.contract("protocol").profiles(binding.profileId);
  const isInstalled = installed.verifier !== ZeroAddress;
  const address = isInstalled ? installed.verifier : profile.preparedVerifier;
  requireThat(address && address !== ZeroAddress, "Deploy the immutable bridge before importing this profile's certificate");
  if (profile.preparedVerifier && isInstalled) requireThat(address.toLowerCase() === profile.preparedVerifier.toLowerCase(), "Governance verifier differs from the prepared immutable bridge");
  const bridge = new Contract(address, BRIDGE_ABI, sdk.provider);
  requireThat((await bridge.imageId()).toLowerCase() === binding.imageId && (await bridge.profileId()).toLowerCase() === binding.profileId, "Onchain bridge image/profile binding mismatch");
  const accepted = binding.outcome === 0
    ? await bridge.verifyGoal(binding.goalHash, binding.profileId, binding.certificate)
    : await bridge.verify(expected.statementId || ZeroHash, binding.goalHash, binding.profileId, binding.outcome, binding.certificate);
  requireThat(accepted, "Original onchain proof verifier rejected the certificate");
  return { ...binding, verifier: address, installed: isInstalled,
    available: isInstalled && (binding.outcome === 0 ? installed.newEnabled : installed.resolutionEnabled),
    verifiedAtBlock: await sdk.provider.getBlockNumber() };
}
