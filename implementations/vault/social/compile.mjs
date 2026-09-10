import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from './node_modules/solc/index.js';
const root = path.dirname(fileURLToPath(import.meta.url));
if (!solc.version().startsWith('0.8.29+')) throw Error('Pinned social compiler 0.8.29 required');
const sources = Object.fromEntries([
  'contracts/VaultSocialResolver.sol',
  '@ethereum-attestation-service/eas-contracts/contracts/EAS.sol',
  '@ethereum-attestation-service/eas-contracts/contracts/SchemaRegistry.sol',
  ...(process.argv.includes('--test') ? ['contracts/TestSocialRegistry.sol'] : []),
].map(p => [p, {content: fs.readFileSync(path.join(root, p.startsWith('@') ? 'node_modules/'+p : p), 'utf8')}]));
const input = {language:'Solidity', sources, settings: {
  optimizer:{enabled:true,runs:200}, viaIR:true, evmVersion:'paris',
  metadata:{bytecodeHash:'none'},
  outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}
}};
const output = JSON.parse(solc.compile(JSON.stringify(input), {import(p) {
  for (const candidate of [path.join(root,p),path.join(root,'node_modules',p)])
    if(fs.existsSync(candidate)) return {contents:fs.readFileSync(candidate,'utf8')};
  return {error:'Missing social import '+p};
}}));
for(const e of output.errors??[]) if(e.severity==='error') console.error(e.formattedMessage);
if(output.errors?.some(e=>e.severity==='error')) process.exit(1);
const out = path.join(root,'artifacts'); fs.mkdirSync(out,{recursive:true});
for(const [sourceName,contracts] of Object.entries(output.contracts)) for(const [name,c] of Object.entries(contracts)) {
  if(!['EAS','SchemaRegistry','VaultSocialResolver','TestSocialRegistry'].includes(name)) continue;
  const size = c.evm.deployedBytecode.object.length/2;
  if(size>24576) throw Error(`${name} exceeds EIP170: ${size}`);
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({contractName:name,sourceName,
    compiler:solc.version(),settings:input.settings,abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,
    deployedBytecode:'0x'+c.evm.deployedBytecode.object},null,2));
  console.log(`${name}: ${size} runtime bytes`);
}
