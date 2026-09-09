// Install an immutable proof profile through the actual local Governor + Timelock.
// Only the known Exchange local chain is supported; no administrator shortcut.
import fs from "node:fs";
import path from "node:path";
import {
  Contract,
  ContractFactory,
  HDNodeWallet,
  JsonRpcProvider,
  NonceManager,
  ZeroAddress,
  keccak256,
  toUtf8Bytes,
} from "ethers";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const deployment = read("data/deployment.json");
const descriptor = read("proof/deployment.json");
if (
  deployment.chainId !== 31372 ||
  deployment.testHarness ||
  !["http://127.0.0.1:9546", "http://localhost:9546"].includes(deployment.rpc)
)
  throw Error(
    "Profile installation is restricted to the real Exchange local deployment",
  );
const provider = new JsonRpcProvider(deployment.rpc, undefined, {
  cacheTimeout: -1,
});
provider.pollingInterval = 100;
if ((await provider.getNetwork()).chainId !== 31372n)
  throw Error("Wrong chain");
const wallet = HDNodeWallet.fromPhrase(
  "test test test test test test test test test test test junk",
  undefined,
  "m/44'/60'/0'/0/0",
).connect(provider);
if (wallet.address.toLowerCase() !== deployment.accounts[0].toLowerCase())
  throw Error("Unexpected local voter");
const signer = new NonceManager(wallet);
const contract = (key, name) =>
  new Contract(
    deployment.contracts[key],
    read(`artifacts/${name}.json`).abi,
    signer,
  );
const protocol = contract("protocol", "ExchangeProtocol");
const governor = contract("governor", "ExchangeGovernor");
const token = contract("token", "TrueToken");
const timelock = contract("timelock", "TimelockController");
if (
  (await protocol.owner()).toLowerCase() !==
  deployment.contracts.timelock.toLowerCase()
)
  throw Error("Protocol is not governed by the expected Timelock");
if ((await protocol.profiles(descriptor.profileId)).verifier !== ZeroAddress)
  throw Error(
    "The supplied immutable profile is already installed; nothing was changed",
  );

const records = [];
const save = () =>
  fs.writeFileSync(
    path.join(root, "data/profile-installation.json"),
    JSON.stringify({ profileId: descriptor.profileId, records }, null, 2),
  );
async function record(label, tx) {
  const receipt = await tx.wait();
  const block = await provider.getBlock(receipt.blockNumber);
  records.push({
    label,
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    timestamp: block.timestamp,
  });
  save();
  console.log(label, receipt.hash, "block", receipt.blockNumber);
  return receipt;
}
const bridgeArtifact = read(`proof/${descriptor.artifact}`);
const bridge = await new ContractFactory(
  bridgeArtifact.abi,
  bridgeArtifact.bytecode,
  signer,
).deploy(...descriptor.args);
await record(
  "Deploy immutable Lean proof bridge",
  bridge.deploymentTransaction(),
);
await bridge.waitForDeployment();
await record(
  "Delegate local T voting power",
  await token.delegate(wallet.address),
);

const oldProfile = await protocol.profiles(deployment.profile);
const targets = [deployment.contracts.protocol];
const values = [0n];
const calldatas = [
  protocol.interface.encodeFunctionData("addProfile", [
    descriptor.profileId,
    bridge.target,
    descriptor.manifest,
  ]),
];
if (oldProfile.verifier !== ZeroAddress) {
  targets.push(deployment.contracts.protocol);
  values.push(0n);
  // Existing statements keep their pinned verifier and resolution policy.
  calldatas.push(
    protocol.interface.encodeFunctionData("setProfileEnabled", [
      deployment.profile,
      false,
      oldProfile.resolutionEnabled,
    ]),
  );
}
const description =
  `Install immutable Lean verification profile ${descriptor.profileId}. ` +
  `Verifier ${bridge.target}; manifest ${descriptor.manifest}. Retire registrations under ` +
  `${deployment.profile}; preserve existing statements and their resolution policy.`;
const descriptionHash = keccak256(toUtf8Bytes(description));
const proposalId = await governor.hashProposal(
  targets,
  values,
  calldatas,
  descriptionHash,
);
await record(
  "Propose immutable profile installation",
  await governor.propose(targets, values, calldatas, description),
);
const snapshot = await governor.proposalSnapshot(proposalId);
while (BigInt(await provider.send("eth_blockNumber", [])) <= snapshot)
  await provider.send("evm_mine", []);
await record(
  "Vote for profile installation",
  await governor.castVote(proposalId, 1),
);
const deadline = await governor.proposalDeadline(proposalId);
while (BigInt(await provider.send("eth_blockNumber", [])) <= deadline)
  await provider.send("evm_mine", []);
await record(
  "Queue profile installation in Timelock",
  await governor.queue(targets, values, calldatas, descriptionHash),
);
await provider.send("evm_increaseTime", [
  Number(await timelock.getMinDelay()) + 1,
]);
await provider.send("evm_mine", []);
await record(
  "Execute profile installation through Timelock",
  await governor.execute(targets, values, calldatas, descriptionHash),
);
const installed = await protocol.profiles(descriptor.profileId);
if (
  installed.verifier.toLowerCase() !== bridge.target.toLowerCase() ||
  !installed.newEnabled
)
  throw Error("Installed profile does not match the descriptor");
deployment.previousProfiles = [
  ...(deployment.previousProfiles || []),
  deployment.profile,
];
deployment.profile = descriptor.profileId;
deployment.verifier = bridge.target;
deployment.proofReady = true;
deployment.profileInstallation = { proposalId: String(proposalId), records };
fs.writeFileSync(
  path.join(root, "data/deployment.json"),
  JSON.stringify(deployment, null, 2),
);
console.log("Profile installed by Governor + Timelock:", descriptor.profileId);
