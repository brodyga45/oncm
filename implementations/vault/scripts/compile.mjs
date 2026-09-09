import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import solc17 from 'solc17';
const outDir = path.resolve('.state/artifacts');
fs.mkdirSync(outDir, { recursive: true });
function resolve(name) {
  const options = [name, 'node_modules/' + name, 'vendor/' + name];
  if (name.startsWith('solady/')) options.push('node_modules/solady/src/' + name.slice(7));
  if (name.startsWith('solmate/')) options.push('node_modules/' + name);
  for (const p of options) if (fs.existsSync(p)) return { contents: fs.readFileSync(p, 'utf8') };
  return { error: 'Missing import ' + name };
}
function compile(compiler, entries, version, evmVersion) {
  const sources = Object.fromEntries(
    entries.map((f) => [f, { content: fs.readFileSync(f, 'utf8') }]),
  );
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 1 },
      viaIR: true,
      evmVersion,
      outputSelection: {
        '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] },
      },
    },
  };
  const output = JSON.parse(compiler.compile(JSON.stringify(input), { import: resolve }));
  for (const err of output.errors || [])
    if (err.severity === 'error') console.error(err.formattedMessage);
  if (output.errors?.some((e) => e.severity === 'error')) process.exit(1);
  let count = 0;
  for (const [source, contracts] of Object.entries(output.contracts))
    for (const [name, c] of Object.entries(contracts)) {
      if (!c.evm.bytecode.object) continue;
      const artifact = {
        contractName: name,
        sourceName: source,
        compiler: version,
        abi: c.abi,
        bytecode: '0x' + c.evm.bytecode.object,
        deployedBytecode: '0x' + c.evm.deployedBytecode.object,
      };
      fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(artifact));
      const size = c.evm.deployedBytecode.object.length / 2;
      if (size > 24576) console.warn(`${name} runtime ${size} bytes > EIP170`);
      count++;
    }
  console.log(`Compiled ${count} contracts with ${version}`);
}
compile(
  solc,
  [
    'contracts/Protocol.sol',
    'contracts/Governance.sol',
    'contracts/VaultIntegration.sol',
    'node_modules/@balancer-labs/v3-vault/contracts/Vault.sol',
    'node_modules/@balancer-labs/v3-vault/contracts/VaultExtension.sol',
    'node_modules/@balancer-labs/v3-vault/contracts/VaultAdmin.sol',
    'node_modules/@balancer-labs/v3-vault/contracts/VaultFactory.sol',
    'node_modules/@balancer-labs/v3-vault/contracts/ProtocolFeeController.sol',
    'node_modules/@balancer-labs/v3-vault/contracts/Router.sol',
    'vendor/splits/packages/splits-v2/src/SplitsWarehouse.sol',
    ...(fs.existsSync('proof/contracts/LeanVerifier.sol')
      ? ['proof/contracts/LeanVerifier.sol']
      : []),
    ...(fs.existsSync('contracts/testing/EconomicTestVerifier.sol')
      ? ['contracts/testing/EconomicTestVerifier.sol']
      : []),
  ],
  solc.version(),
  'cancun',
);
compile(
  solc17,
  ['vendor/permit2/src/Permit2.sol', 'node_modules/solmate/src/tokens/WETH.sol'],
  solc17.version(),
  'london',
);
for (const [name, p] of Object.entries({
  ConditionalTokens:
    'node_modules/@gnosis.pm/conditional-tokens-contracts/build/contracts/ConditionalTokens.json',
  Wrapped1155Factory: 'vendor/1155-to-20/build/contracts/Wrapped1155Factory.json',
  Wrapped1155: 'vendor/1155-to-20/build/contracts/Wrapped1155.json',
})) {
  const a = JSON.parse(fs.readFileSync(p));
  fs.writeFileSync(
    path.join(outDir, name + '.json'),
    JSON.stringify({
      contractName: name,
      sourceName: p,
      abi: a.abi,
      bytecode: a.bytecode,
      deployedBytecode: a.deployedBytecode,
    }),
  );
}
console.log('Copied original Gnosis published artifacts');
