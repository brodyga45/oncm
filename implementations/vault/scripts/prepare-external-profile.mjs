// Default is read-only. --deploy creates only an immutable bridge; no Governor,
// registry, time, mining, token or market calls. Never modifies the default v3.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractFactory, JsonRpcProvider, HDNodeWallet, NonceManager, ZeroAddress } from 'ethers';
import { createSDK } from '../sdk/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
if (process.argv.slice(2).some(x => x !== '--deploy')) throw Error('Usage: node scripts/prepare-external-profile.mjs [--deploy]');
const config = JSON.parse(fs.readFileSync('.state/deployment.json'));
if (config.chainId !== 31373 || !['http://127.0.0.1:9547', 'http://localhost:9547'].includes(config.rpcUrl))
  throw Error('Vault local chain/RPC required');
const descriptor = JSON.parse(fs.readFileSync('external-proofs/perf05/descriptor.json'));
const record = JSON.parse(fs.readFileSync('external-proofs/perf05/true-registration.json'));
const provider = new JsonRpcProvider(config.rpcUrl, undefined, { cacheTimeout: -1 });
provider.pollingInterval = 50;
const sdk = createSDK(config, JSON.parse(fs.readFileSync('.state/abis.json')), provider);
await sdk.ensureChain();
const dir = '.state/additional-profiles', file = dir + '/perf05.json';
let saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
if (saved && (saved.chainInstance !== config.chainInstance.id || saved.registry !== config.addresses.StatementRegistry))
  throw Error('Existing profile evidence belongs to another chain; archive it explicitly before deployment');
let bridge = saved?.bridge || ZeroAddress;
// Even before spending local gas, verify the real imported proof with the
// deployed original verifier, exact profile/journal and any existing bridge.
await sdk.verifyExternalCertificate(record, descriptor, bridge);
if (bridge === ZeroAddress && process.argv.includes('--deploy')) {
  const signer = new NonceManager(HDNodeWallet.fromPhrase(
    'test test test test test test test test test test test junk', undefined, "m/44'/60'/0'/0/0").connect(provider));
  const artifact = JSON.parse(fs.readFileSync('proof/artifacts/LeanProofBridge.json'));
  const instance = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(descriptor.imageId, descriptor.profileId);
  const receipt = await instance.deploymentTransaction().wait();
  bridge = await instance.getAddress();
  saved = { format: 'oncm-vault-additional-profile-v1', chainId: 31373, chainInstance: config.chainInstance.id,
    registry: config.addresses.StatementRegistry, profileId: descriptor.profileId, imageId: descriptor.imageId,
    bridge, manifest: descriptor.manifest, deployment: { txHash: receipt.hash, blockNumber: receipt.blockNumber } };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(saved, null, 2) + '\n', { flag: 'wx' });
}
if (bridge === ZeroAddress) {
  console.log(JSON.stringify({ status: 'Original verifier accepted; separate bridge not deployed', descriptor }, null, 2));
} else {
  const review = await sdk.verifyExternalCertificate(record, descriptor, bridge);
  const proposal = {
    targets: [config.addresses.StatementRegistry], values: ['0'],
    calldatas: [sdk.registry.interface.encodeFunctionData('setProfile', [descriptor.profileId, bridge, true, descriptor.manifest])],
    description: 'Admit the separate perf05 zero-axiom Lean logic profile. Exact image ' + descriptor.imageId
      + '. Existing v3 profile and markets remain unchanged. Genuine registration certificate verified by original RISC Zero Groth16 verifier and immutable bridge.',
  };
  if (process.argv.includes('--deploy')) {
    fs.writeFileSync(file + '.tmp', JSON.stringify({ ...saved, proposal, verification: review }, null, 2) + '\n');
    fs.renameSync(file + '.tmp', file);
  }
  console.log(JSON.stringify({ bridge, verification: review, proposal }, null, 2));
}
provider.destroy();
