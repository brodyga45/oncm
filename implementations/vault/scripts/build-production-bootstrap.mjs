// Verify previously compiled production bytecode against current-source Solidity
// metadata (no bytecode generation), then publish only the real deployment graph.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import solc from 'solc';import solc17 from 'solc17';
import {metadataIpfsDigest} from './metadata-ipfs.mjs';
import {productionNames} from './production-graph.mjs';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function resolve(name){
 const options=[name,'node_modules/'+name,'vendor/'+name];
 if(name.startsWith('solady/'))options.push('node_modules/solady/src/'+name.slice(7));
 if(name.startsWith('solmate/'))options.push('node_modules/'+name);
 for(const p of options)if(fs.existsSync(p))return{file:p,contents:fs.readFileSync(p,'utf8')};
 throw Error('Missing compiler import '+name);
}
const groups=[{compiler:solc,evmVersion:'cancun',entries:[
 'contracts/Protocol.sol','contracts/Governance.sol','contracts/VaultIntegration.sol',
 'node_modules/@balancer-labs/v3-vault/contracts/Vault.sol','node_modules/@balancer-labs/v3-vault/contracts/VaultExtension.sol',
 'node_modules/@balancer-labs/v3-vault/contracts/VaultAdmin.sol','node_modules/@balancer-labs/v3-vault/contracts/VaultFactory.sol',
 'node_modules/@balancer-labs/v3-vault/contracts/ProtocolFeeController.sol','node_modules/@balancer-labs/v3-vault/contracts/Router.sol',
 'vendor/splits/packages/splits-v2/src/SplitsWarehouse.sol',
 ...(fs.existsSync('proof/contracts/LeanVerifier.sol')?['proof/contracts/LeanVerifier.sol']:[]),
 ...(fs.existsSync('contracts/testing/EconomicTestVerifier.sol')?['contracts/testing/EconomicTestVerifier.sol']:[]),
 ]},{compiler:solc17,evmVersion:'london',entries:['vendor/permit2/src/Permit2.sol','node_modules/solmate/src/tokens/WETH.sol']}];
const upstream={ConditionalTokens:'node_modules/@gnosis.pm/conditional-tokens-contracts/build/contracts/ConditionalTokens.json',
 Wrapped1155Factory:'vendor/1155-to-20/build/contracts/Wrapped1155Factory.json',Wrapped1155:'vendor/1155-to-20/build/contracts/Wrapped1155.json'};
const artifacts=Object.fromEntries(productionNames.map(n=>[n,JSON.parse(fs.readFileSync('.state/artifacts/'+n+'.json'))]));
const records=[],sourcePins=new Map(),metadataFiles=[];
for(const group of groups){
 const settings={optimizer:{enabled:true,runs:1},viaIR:true,evmVersion:group.evmVersion,outputSelection:{'*':{'*':['metadata']}}};
 const output=JSON.parse(group.compiler.compile(JSON.stringify({language:'Solidity',sources:Object.fromEntries(group.entries.map(file=>[file,{content:fs.readFileSync(file,'utf8')}])),settings}),{import:name=>{try{return{contents:resolve(name).contents};}catch(error){return{error:error.message};}}}));
 if(output.errors?.some(e=>e.severity==='error'))throw Error(output.errors.filter(e=>e.severity==='error').map(e=>e.formattedMessage).join('\n'));
 for(const [name,artifact] of Object.entries(artifacts)){
  if(upstream[name]||artifact.compiler!==group.compiler.version())continue;
  const metadata=output.contracts?.[artifact.sourceName]?.[name]?.metadata;if(!metadata)throw Error('No generated metadata for '+name);
  const raw=artifact.deployedBytecode.slice(2),length=parseInt(raw.slice(-4),16),tail=raw.slice(-4-length*2,-4);
  const embedded=tail.match(/646970667358221220([0-9a-f]{64})/i)?.[1];
  if(!embedded||embedded!==metadataIpfsDigest(metadata))throw Error('Current source/settings metadata DOES NOT match tested bytecode: '+name);
  const decoded=JSON.parse(metadata);
  for(const source of Object.keys(decoded.sources)){const found=resolve(source);sourcePins.set(found.file,{path:found.file,sha256:hash(found.contents)});}
  metadataFiles.push({path:'metadata/'+name+'.json',content:metadata});
  records.push({name,sourceName:artifact.sourceName,compiler:artifact.compiler,settings:decoded.settings,metadataSha256:hash(metadata),metadataIpfsDigest:embedded,binding:'Current Solidity metadata UnixFS CIDv0 digest equals embedded bytecode metadata digest'});
 }
}
for(const [name,file] of Object.entries(upstream)){
 const original=JSON.parse(fs.readFileSync(file)),artifact=artifacts[name];
 for(const key of ['abi','bytecode','deployedBytecode'])if(JSON.stringify(original[key])!==JSON.stringify(artifact[key]))throw Error('Published upstream artifact differs: '+name+'/'+key);
 sourcePins.set(file,{path:file,sha256:hash(fs.readFileSync(file))});records.push({name,sourceName:file,binding:'Exact original published ABI/creation/runtime bytecode',upstreamArtifactSha256:hash(fs.readFileSync(file))});
}
if(records.length!==productionNames.length)throw Error('Incomplete production provenance');
for(const file of ['package-lock.json','scripts/compile.mjs'])sourcePins.set(file,{path:file,sha256:hash(fs.readFileSync(file))});
fs.mkdirSync('production/artifacts',{recursive:true});fs.mkdirSync('production/metadata',{recursive:true});
for(const {path:file,content} of metadataFiles)fs.writeFileSync('production/'+file,content);
for(const record of records){const src='.state/artifacts/'+record.name+'.json',dst='production/artifacts/'+record.name+'.json';fs.copyFileSync(src,dst);record.artifactSha256=hash(fs.readFileSync(dst));record.runtimeBytes=(artifacts[record.name].deployedBytecode.length-2)/2;}
const manifest={format:'vault-production-bootstrap-v1',scope:'Previously tested real production artifacts; no test/mock/unconfigured verifier; v3 bridge has its own independent bootstrap',
 metadataOnlyVerification:true,fullBytecodeRecompiled:false,artifacts:records.sort((a,b)=>a.name.localeCompare(b.name)),sourcePins:[...sourcePins.values()].sort((a,b)=>a.path.localeCompare(b.path))};
fs.writeFileSync('production/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({productionArtifacts:records.length,sourcePins:sourcePins.size,currentMetadataBindings:metadataFiles.length,publishedUpstreamBindings:Object.keys(upstream).length}));
