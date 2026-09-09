import fs from 'node:fs';
import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  HDNodeWallet,
  NonceManager,
  keccak256,
  id,
  ZeroAddress,
  ZeroHash,
} from 'ethers';
const rpc = process.env.VAULT_RPC || 'http://127.0.0.1:9547';
if (!['http://127.0.0.1:9547', 'http://localhost:9547'].includes(rpc))
  throw Error('Local deployment restricted to Vault RPC 9547');
const provider = new JsonRpcProvider(rpc);
provider.pollingInterval = 100;
if ((await provider.getNetwork()).chainId !== 31373n) throw Error('Wrong chain');
const wallets = [0, 1, 2, 3].map((i) =>
  HDNodeWallet.fromPhrase(
    'test test test test test test test test test test test junk',
    undefined,
    `m/44'/60'/0'/0/${i}`,
  ).connect(provider),
);
const signer = new NonceManager(wallets[0]);
const accounts = wallets.map((w) => w.address);
const artifacts = {};
const addresses = {};
const txs = [];
function artifact(name) {
  return (artifacts[name] ??= JSON.parse(fs.readFileSync(`.state/artifacts/${name}.json`)));
}
async function deploy(name, args = [], key = name) {
  const c = await new ContractFactory(artifact(name).abi, artifact(name).bytecode, signer).deploy(
    ...args,
    { gasLimit: 50000000 },
  );
  const receipt = await c.deploymentTransaction().wait();
  addresses[key] = await c.getAddress();
  txs.push({ label: 'Deploy ' + key, hash: receipt.hash, blockNumber: receipt.blockNumber });
  console.log(key, addresses[key]);
  return c;
}
async function tx(label, p) {
  const receipt = await (await p).wait();
  txs.push({ label, hash: receipt.hash, blockNumber: receipt.blockNumber });
}
const token = await deploy('TrueToken', [accounts]);
const membership = await deploy('Membership', [accounts.slice(0, 3)]);
const timelock = await deploy(
  'TimelockController',
  [5, [], [ZeroAddress], accounts[0]],
  'Timelock',
);
const governor = await deploy(
  'VaultGovernor',
  [addresses.Membership, addresses.Timelock],
  'Governor',
);
await tx(
  'Grant governor proposer',
  timelock.grantRole(await timelock.PROPOSER_ROLE(), addresses.Governor),
);
await tx(
  'Grant governor canceller',
  timelock.grantRole(await timelock.CANCELLER_ROLE(), addresses.Governor),
);
await tx('Membership ownership', membership.transferOwnership(addresses.Timelock));
const authorizer = await deploy('VaultAuthorizer', [addresses.Timelock], 'Authorizer');
const ctf = await deploy('ConditionalTokens');
const wrappers = await deploy('Wrapped1155Factory');
const registry = await deploy('StatementRegistry', [
  addresses.ConditionalTokens,
  addresses.TrueToken,
  addresses.Wrapped1155Factory,
  accounts[0],
]);
const positionRouter = await deploy('PositionRouter', [addresses.StatementRegistry]);
await deploy('ResolvedWithinWindowOperator');
const codes = ['Vault', 'VaultExtension', 'VaultAdmin'].map((n) => artifact(n).bytecode);
const vaultFactory = await deploy('VaultFactory', [
  addresses.Authorizer,
  365 * 86400,
  30 * 86400,
  1000000,
  1000000,
  ...codes.map(keccak256),
]);
const salt = id('oncm.vault.local.v1');
addresses.Vault = await vaultFactory.getDeploymentAddress(salt);
const controller = await deploy('ProtocolFeeController', [addresses.Vault, 0, 0]);
await tx(
  'Create canonical Balancer Vault',
  vaultFactory.create(salt, addresses.Vault, addresses.ProtocolFeeController, ...codes, {
    gasLimit: 80000000,
  }),
);
addresses.VaultAdmin = await vaultFactory.deployedVaultAdmins(addresses.Vault);
addresses.VaultExtension = await vaultFactory.deployedVaultExtensions(addresses.Vault);
const weightedFactory = await deploy('WeightedPoolFactory', [
  addresses.Vault,
  365 * 86400,
  'ONCM Vault / Balancer 1.0.0',
  'WeightedPool 1.0.0',
]);
const permit = await deploy('Permit2');
const weth = await deploy('WETH');
const router = await deploy('Router', [
  addresses.Vault,
  addresses.WETH,
  addresses.Permit2,
  'ONCM Vault Router / 1.0.0',
]);
const warehouse = await deploy('SplitsWarehouse', ['Ether', 'ETH']);
const splitFactory = await deploy('PullSplitFactory', [addresses.SplitsWarehouse]);
const recipients = accounts
  .slice(0, 2)
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
const allocation = await deploy('AllocationController', [
  addresses.ProtocolFeeController,
  addresses.PullSplitFactory,
  recipients,
  [6000, 4000],
  accounts[0],
]);
const coordinator = await deploy('PoolCoordinator', [
  addresses.StatementRegistry,
  addresses.WeightedPoolFactory,
  addresses.AllocationController,
  addresses.Timelock,
]);
await tx('Bind official pool coordinator', allocation.setCoordinator(addresses.PoolCoordinator));
await tx('Allocation owner to governance', allocation.transferOwnership(addresses.Timelock));
let proof = { status: 'unconfigured', profileId: ZeroHash };
if (fs.existsSync('proof/deployment.json')) {
  const definition = JSON.parse(fs.readFileSync('proof/deployment.json'));
  const a = JSON.parse(fs.readFileSync('proof/' + definition.artifact));
  artifacts.LeanProofBridge = a;
  const verifier = await deploy('LeanProofBridge', definition.args);
  await tx(
    'Register immutable Lean proof profile',
    registry.setProfile(
      definition.profileId,
      await verifier.getAddress(),
      true,
      definition.manifest,
    ),
  );
  proof = {
    status: 'configured',
    profileId: definition.profileId,
    manifest: definition.manifest,
    verifier: await verifier.getAddress(),
    fixtureId: 'lean-nat-add-comm-4.33.1',
  };
}
if (proof.status === 'unconfigured') await deploy('UnconfiguredProofVerifier');
await tx('Registry ownership to governance', registry.transferOwnership(addresses.Timelock));
await tx(
  'Drop bootstrap admin',
  timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), accounts[0]),
);
// Public client artifacts contain ABIs and addresses only. Devnet accounts are deliberately known test addresses.
for (const name of [
  'Vault',
  'VaultExtension',
  'VaultAdmin',
  'WeightedPool',
  'Wrapped1155',
  'PullSplit',
  'StatementRegistry',
  'PositionRouter',
  'PoolCoordinator',
  'AllocationController',
  'FinalityHook',
  'VaultGovernor',
  'Membership',
  'TimelockController',
  'ProtocolFeeController',
  'Router',
  'Permit2',
  'SplitsWarehouse',
  'TrueToken',
])
  artifact(name);
const abis = Object.fromEntries(Object.entries(artifacts).map(([n, a]) => [n, a.abi]));
const config = {
  name: 'Vault',
  chainInstance: fs.existsSync('.state/chain-instance.json')
    ? JSON.parse(fs.readFileSync('.state/chain-instance.json')) : null,
  chainId: 31373,
  rpcUrl: rpc,
  webUrl: 'http://127.0.0.1:5173',
  apiUrl: 'http://127.0.0.1:4173',
  deploymentBlock: txs[0].blockNumber,
  addresses,
  accounts,
  proof,
  exampleOperator: {
    id: id('vault.resolved-within-window.v1'),
    implementation: addresses.ResolvedWithinWindowOperator,
    specification: id(
      'ResolvedWithinWindow(dependency,start,end,expected): inclusive confirmed-block timestamps',
    ),
  },
  createdAt: new Date().toISOString(),
};
fs.mkdirSync('.state', { recursive: true });
fs.writeFileSync('.state/deployment.json', JSON.stringify(config, null, 2));
fs.writeFileSync('.state/abis.json', JSON.stringify(abis));
fs.writeFileSync('.state/deployment-txs.json', JSON.stringify(txs, null, 2));
console.log('Vault local deployment complete; proof status:', proof.status);
