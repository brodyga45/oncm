// Install a new immutable proof bridge through REAL membership governance, not an owner shortcut.
import fs from 'node:fs';
import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  HDNodeWallet,
  NonceManager,
  keccak256,
  toUtf8Bytes,
} from 'ethers';
const file = '.state/deployment.json',
  config = JSON.parse(fs.readFileSync(file)),
  abis = JSON.parse(fs.readFileSync('.state/abis.json')),
  definition = JSON.parse(fs.readFileSync('proof/deployment.json'));
if (
  config.chainId !== 31373 ||
  !['http://127.0.0.1:9547', 'http://localhost:9547'].includes(config.rpcUrl)
)
  throw Error('Vault local only');
if (config.proof.profileId === definition.profileId) {
  console.log('Current immutable profile already installed');
  process.exit(0);
}
const provider = new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 });
provider.pollingInterval = 50;
if ((await provider.getNetwork()).chainId !== 31373n) throw Error('Wrong chain');
const signers = [0, 1].map(
  (i) =>
    new NonceManager(
      HDNodeWallet.fromPhrase(
        'test test test test test test test test test test test junk',
        undefined,
        `m/44'/60'/0'/0/${i}`,
      ).connect(provider),
    ),
);
const a = JSON.parse(fs.readFileSync('proof/' + definition.artifact));
const verifier = await new ContractFactory(a.abi, a.bytecode, signers[0]).deploy(
  ...definition.args,
);
await verifier.waitForDeployment();
const address = await verifier.getAddress();
const registry = new Contract(
    config.addresses.StatementRegistry,
    abis.StatementRegistry,
    signers[0],
  ),
  governor = new Contract(config.addresses.Governor, abis.VaultGovernor, signers[0]),
  timelock = new Contract(config.addresses.Timelock, abis.TimelockController, provider);
const targets = [config.addresses.StatementRegistry],
  values = [0],
  calls = [
    registry.interface.encodeFunctionData('setProfile', [
      definition.profileId,
      address,
      true,
      definition.manifest,
    ]),
  ];
if (config.proof.verifier && config.proof.profileId) {
  targets.push(config.addresses.StatementRegistry);
  values.push(0);
  calls.push(
    registry.interface.encodeFunctionData('setProfile', [
      config.proof.profileId,
      config.proof.verifier,
      false,
      config.proof.manifest,
    ]),
  );
}
const description =
    'Install immutable Lean kernel profile ' +
    definition.profileId +
    ' and close prior profile admission. Existing statement resolution remains bound to its original verifier.',
  hash = keccak256(toUtf8Bytes(description)),
  txs = [];
async function send(label, p) {
  const receipt = await (await p).wait();
  txs.push({ label, hash: receipt.hash, blockNumber: receipt.blockNumber });
  console.log(label, receipt.blockNumber, receipt.hash);
}
await send('Propose profile upgrade', governor.propose(targets, values, calls, description));
const proposal = await governor.hashProposal(targets, values, calls, hash);
await provider.send('hardhat_mine', ['0x2']);
await send('Member 0 vote', governor.castVote(proposal, 1));
await send('Member 1 vote', governor.connect(signers[1]).castVote(proposal, 1));
await provider.send('hardhat_mine', ['0xa']);
await send('Queue profile upgrade', governor.queue(targets, values, calls, hash));
await provider.send('evm_increaseTime', [Number(await timelock.getMinDelay()) + 1]);
await provider.send('evm_mine', []);
await send('Execute profile upgrade', governor.execute(targets, values, calls, hash));
config.addresses.LeanProofBridge = address;
config.proof = {
  status: 'configured',
  profileId: definition.profileId,
  manifest: definition.manifest,
  verifier: address,
  fixtureId: 'lean-nat-add-comm-4.33.1',
  governanceProposal: String(proposal),
};
abis.LeanProofBridge = a.abi;
fs.writeFileSync(file, JSON.stringify(config, null, 2));
fs.writeFileSync('.state/abis.json', JSON.stringify(abis));
fs.writeFileSync(
  '.state/profile-upgrade.json',
  JSON.stringify({ proposal: String(proposal), profile: config.proof, transactions: txs }, null, 2),
);
console.log('New profile installed via real governance:', definition.profileId);
