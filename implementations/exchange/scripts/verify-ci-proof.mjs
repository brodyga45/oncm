#!/usr/bin/env node
// Diagnostic only: verify a CI artifact against the original generic RISC Zero
// verifier reached through the deployed bridge. This never installs a profile,
// imports a cache entry, creates a market or changes registry state.
//
// node implementations/exchange/scripts/verify-ci-proof.mjs /path/verified.json \
//   --profile perf05 --case true-registration [--record] [--out /path/report.json]
// Without --record: RPC reads/eth_call only, JSON report goes to stdout.
// With --record: one positive generic verify transaction, using public dev account0.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AbiCoder, Contract, HDNodeWallet, JsonRpcProvider, ZeroHash,
  concat, getAddress, getBytes, hexlify, isError, isHexString, keccak256,
  sha256, toUtf8Bytes,
} from "ethers";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CI = path.resolve(APP, "../../tools/lean-zk/ci");
const CASES = ["true-registration", "true-proof", "false-registration", "false-refutation"];
const SELECTOR = "0x73c457ba";
const ABI = AbiCoder.defaultAbiCoder();
const requireThat = (condition, message) => { if (!condition) throw Error(message); };
const json = (value) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2) + "\n";
function read(file, max = 128 * 1024) {
  const stat = fs.statSync(file);
  requireThat(stat.isFile() && stat.size <= max, `Unexpected file type/size: ${file}`);
  return fs.readFileSync(file);
}
const readJson = (file) => JSON.parse(read(file).toString("utf8"));
function bytes(value, size, label) {
  requireThat(isHexString(value, size), `${label}: expected ${size} bytes`);
  return value.toLowerCase();
}
function flip(value) {
  const result = getBytes(value);
  result[result.length - 1] ^= 1;
  return hexlify(result);
}

const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--record") {
    requireThat(!options.record, "Duplicate --record"); options.record = true;
  } else if (["--profile", "--case", "--out"].includes(arg)) {
    requireThat(!options[arg] && args[i + 1] && !args[i + 1].startsWith("--"), `Missing/duplicate ${arg}`);
    options[arg] = args[++i];
  } else {
    requireThat(!arg.startsWith("--") && !options.input, `Unexpected argument: ${arg}`);
    options.input = path.resolve(arg);
  }
}
requireThat(options.input && ["perf05", "v3"].includes(options["--profile"]) && CASES.includes(options["--case"]),
  "Usage: verify-ci-proof.mjs verified.json --profile perf05|v3 --case true-registration|true-proof|false-registration|false-refutation [--record] [--out report.json]");
requireThat(!options["--out"] || options.record, "--out is only supported with explicit --record; read-only reports use stdout");

const artifactBytes = read(options.input), artifact = JSON.parse(artifactBytes);
const selected = options["--profile"], caseName = options["--case"];
const profileRoot = path.join(CI, "profiles", selected);
const profile = readJson(path.join(profileRoot, "profile.json"));
const pins = readJson(path.join(CI, "pins.json"));
const side = caseName.split("-")[0], fixture = profile.fixtures[side];
const outcome = caseName.endsWith("registration") ? 0 : fixture.outcome;
requireThat(pins.ethereum.selector === SELECTOR, "Local CI selector pin changed; review the verifier first");
requireThat(artifact.format === "oncm-real-groth16-ci-v1" && artifact.receiptKind === "Groth16", "Expected CI raw Groth16 artifact");
requireThat(artifact.profile === selected && artifact.case === caseName, "Artifact profile/case mismatch");
requireThat(artifact.outcome === outcome, "Artifact outcome mismatch");
const image = bytes(artifact.imageId, 32, "imageId");
const profileId = bytes(artifact.profileId, 32, "profileId");
const goal = bytes(artifact.goalHash, 32, "goalHash");
requireThat(image === profile.imageId && profileId === profile.profileId && goal === fixture.goalHash, "Artifact does not match pinned CI profile/goal/image");
for (const [file, expected] of Object.entries(profile.files)) {
  const asset = path.resolve(profileRoot, file);
  requireThat(asset.startsWith(profileRoot + path.sep), "Unsafe pinned asset path");
  requireThat(sha256(read(asset, 4 * 1024 * 1024)).slice(2) === expected, `Pinned CI asset changed: ${file}`);
}
const goalExport = read(path.join(profileRoot, `fixtures/${side}-goal.ndjson`));
requireThat(sha256(goalExport) === goal, "Pinned goal export hash mismatch");
const expectedJournal = ABI.encode(["bytes32", "bytes32", "bytes32", "uint256"],
  [sha256(toUtf8Bytes("ONCM_LEAN_CLAIM_V1")), goal, profileId, outcome]);
const journal = bytes(artifact.journal, 128, "journal");
requireThat(journal === expectedJournal, "Full authenticated journal mismatch");
const rawSeal = bytes(artifact.rawSeal, 256, "rawSeal");
const parameters = bytes(artifact.verifierParameters, 32, "verifierParameters");
const evmSeal = bytes(artifact.evmSeal, 260, "evmSeal");
requireThat(parameters.slice(0, 10) === SELECTOR && evmSeal === concat([SELECTOR, rawSeal]), "Groth16 selector/seal mismatch");
const certificate = ABI.encode(["bytes", "bytes"], [evmSeal, journal]);
requireThat(isHexString(artifact.certificate) && artifact.certificate.toLowerCase() === certificate, "Noncanonical or mismatched ABI certificate");
const [decodedSeal, decodedJournal] = ABI.decode(["bytes", "bytes"], artifact.certificate);
requireThat(decodedSeal === evmSeal && decodedJournal === journal, "Certificate ABI round-trip failed");
// CI labels/provenance above are not cryptographic evidence; acceptance below is.

const deployment = readJson(path.join(APP, "data/deployment.json"));
requireThat(deployment.chainId === 31372 && deployment.testHarness === false &&
  ["http://127.0.0.1:9546", "http://localhost:9546"].includes(deployment.rpc),
  "Only the real local Exchange deployment on chain31372/RPC9546 is allowed");
const provider = new JsonRpcProvider(deployment.rpc, undefined, { cacheTimeout: -1 });
provider.pollingInterval = 250;
let report, output, createdOutput = false;
try {
  requireThat((await provider.getNetwork()).chainId === 31372n, "RPC chain ID mismatch");
  const blockNumber = await provider.getBlockNumber();
  const overrides = { blockTag: blockNumber };
  const bridgeAddress = getAddress(deployment.verifier);
  const bridge = new Contract(bridgeAddress, [
    "function verifier() view returns(address)", "function imageId() view returns(bytes32)",
    "function profileId() view returns(bytes32)",
    "function verifyGoal(bytes32,bytes32,bytes) view returns(bool)",
    "function verify(bytes32,bytes32,bytes32,uint8,bytes) view returns(bool)",
  ], provider);
  const protocol = new Contract(deployment.contracts.protocol,
    ["function profiles(bytes32) view returns(address verifier,bool newEnabled,bool resolutionEnabled,string manifest)"], provider);
  const [verifierAddress, bridgeImage, bridgeProfile, installed, block] = await Promise.all([
    bridge.verifier(overrides), bridge.imageId(overrides), bridge.profileId(overrides),
    protocol.profiles(deployment.profile, overrides), provider.getBlock(blockNumber),
  ]);
  requireThat(getAddress(installed.verifier) === bridgeAddress && bridgeProfile === deployment.profile,
    "Deployment does not identify its registered immutable bridge");
  const verifier = new Contract(verifierAddress, [
    "function SELECTOR() view returns(bytes4)", "function VERSION() view returns(string)",
    "function verify(bytes seal,bytes32 imageId,bytes32 journalDigest) view",
  ], provider);
  const [selector, version, code] = await Promise.all([
    verifier.SELECTOR(overrides), verifier.VERSION(overrides), provider.getCode(verifierAddress, blockNumber),
  ]);
  requireThat(code !== "0x" && selector === SELECTOR && version === "3.0.0", "Underlying original verifier version/selector mismatch");
  const digest = sha256(journal);
  await verifier.verify.staticCall(evmSeal, image, digest, overrides);
  async function rejected(label, changedImage, changedJournal) {
    try { await verifier.verify.staticCall(evmSeal, changedImage, sha256(changedJournal), overrides); }
    catch (error) {
      requireThat(isError(error, "CALL_EXCEPTION"), `${label}: RPC/transport failure is not a negative verification result`);
      return { rejected: true, reason: error.shortMessage, revertData: error.data ?? null };
    }
    throw Error(`${label}: original verifier accepted a mutated claim`);
  }
  const negativeImage = await rejected("Changed image", flip(image), journal);
  const negativeJournal = await rejected("Changed journal", image, flip(journal));
  const compatible = bridgeImage === image && bridgeProfile === profileId;
  let bridgeAccepted = null;
  if (compatible) {
    bridgeAccepted = outcome === 0
      ? await bridge.verifyGoal(goal, profileId, certificate, overrides)
      : await bridge.verify(ZeroHash, goal, profileId, outcome, certificate, overrides);
    requireThat(bridgeAccepted === true, "Compatible application bridge rejected the certificate");
  }
  report = {
    format: "oncm-ci-original-evm-diagnostic-v1", status: "verified-by-eth-call",
    profile: selected, case: caseName, outcome, imageId: image, profileId, goalHash: goal,
    journal, journalDigest: digest, evmSeal, certificate,
    artifactSha256: sha256(artifactBytes), ciRunId: artifact.runId, ciSourceCommit: artifact.sourceCommit,
    chainId: 31372, rpc: deployment.rpc, bridge: bridgeAddress,
    bridgeImageId: bridgeImage, bridgeProfileId: bridgeProfile,
    verifier: verifierAddress, verifierVersion: version, verifierSelector: selector,
    verifierCodeHash: keccak256(code), positiveAccepted: true, negativeImage, negativeJournal,
    applicationBridgeCompatible: compatible, applicationBridgeAccepted: bridgeAccepted,
    scope: compatible ? "Generic verifier and matching application bridge" :
      "Generic original RISC Zero verifier only; this artifact is not compatible with the deployed application bridge",
    checkedAt: new Date().toISOString(), blockNumber, blockHash: block.hash, blockTimestamp: block.timestamp,
    registryOrProfileChanged: false, transaction: null,
  };
  if (options.record) {
    // Known public development key; no env/config secrets, remote RPC or value transfer.
    const wallet = HDNodeWallet.fromPhrase("test test test test test test test test test test test junk",
      undefined, "m/44'/60'/0'/0/0").connect(provider);
    requireThat(getAddress(deployment.accounts[0]) === wallet.address, "Unexpected public local account0");
    requireThat((await provider.getNetwork()).chainId === 31372n, "Chain changed before recording");
    output = path.resolve(options["--out"] || path.join(APP, "data/ci-proof-diagnostics",
      `${selected}-${caseName}-${Date.now()}.json`));
    requireThat(output !== options.input, "Cannot overwrite the input artifact");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, json({ ...report, status: "ready-to-record" }), { flag: "wx" });
    createdOutput = true;
    const data = verifier.interface.encodeFunctionData("verify", [evmSeal, image, digest]);
    const gas = await provider.estimateGas({ from: wallet.address, to: verifierAddress, data, value: 0n });
    requireThat(gas <= 800000n, "Unexpected verification gas; no transaction sent");
    const tx = await wallet.sendTransaction({ to: verifierAddress, data, value: 0n, gasLimit: gas * 12n / 10n, chainId: 31372 });
    report.status = "transaction-submitted";
    report.transaction = { hash: tx.hash, from: wallet.address, to: verifierAddress, input: data, value: "0" };
    fs.writeFileSync(output, json(report));
    const receipt = await tx.wait(1, 60000);
    requireThat(receipt?.status === 1, "Verification transaction failed");
    const recordedBlock = await provider.getBlock(receipt.blockNumber);
    report.status = "verified-and-recorded";
    report.transaction = { ...report.transaction, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
      timestamp: recordedBlock.timestamp, receipt: receipt.toJSON() };
    fs.writeFileSync(output, json(report));
    console.error(`Recorded verification evidence: ${output}`);
  }
  process.stdout.write(json(report));
} catch (error) {
  if (createdOutput && report) {
    fs.writeFileSync(output, json({ ...report, status: "diagnostic-failed", error: error.message }));
  }
  throw error;
} finally {
  provider.destroy();
}
