// Separate small compilation. Never rewrites legacy .state/artifacts or bootstrap.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import solc from 'solc';
const targets={
 'contracts/monetary/TrueTokenV2.sol':['TrueTokenV2'],
 'contracts/monetary/RewardBudget.sol':['RewardBudget'],
 ...(!process.argv.includes('--core')?{
  'contracts/monetary/FeeRouting.sol':['AllocationControllerV2','FeeRoutingAuthorizer'],
  'contracts/monetary/RewardMeters.sol':['IncentiveFinalityHook','BptLockMeter'],
  'contracts/monetary/PoolCoordinatorV2.sol':['PoolCoordinatorV2'],
 }:{}),
 ...(process.argv.includes('--tests')?{
  'contracts/testing/RewardMeterHarness.sol':['RewardMeterHarness'],
  ...(!process.argv.includes('--core')?{'contracts/monetary/testing/MeterHarness.sol':['MeterRegistryHarness','MeterExecutorHarness','UntrustedMeterRouter']}:{}),
 }:{}),
};
const entries=Object.keys(targets),fields=['abi','metadata','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences'];
const seen=new Map(),read=p=>{const content=fs.readFileSync(p,'utf8');seen.set(p,content);return content;};
const input={language:'Solidity',sources:Object.fromEntries(entries.map(p=>[p,{content:read(p)}])),settings:{optimizer:{enabled:true,runs:1},viaIR:true,evmVersion:'cancun',outputSelection:Object.fromEntries(Object.entries(targets).map(([p,names])=>[p,Object.fromEntries(names.map(n=>[n,fields]))]))}};
function resolve(name){for(const p of[name,path.join('node_modules',name)])if(fs.existsSync(p))return{contents:read(p)};return{error:'Missing pinned local import '+name};}
const output=JSON.parse(solc.compile(JSON.stringify(input),{import:resolve}));
const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
const directory='.state/monetary-artifacts';fs.mkdirSync(directory,{recursive:true});
const names=Object.values(targets).flat(),artifacts=[];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const[sourceName,contracts]of Object.entries(output.contracts))for(const[name,c]of Object.entries(contracts)){
 if(!names.includes(name))continue;
 const artifact={contractName:name,sourceName,compiler:solc.version(),abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object,immutableReferences:c.evm.deployedBytecode.immutableReferences,metadata:JSON.parse(c.metadata),metadataText:c.metadata};
 const bytes=JSON.stringify(artifact);fs.writeFileSync(path.join(directory,name+'.json'),bytes);
 artifacts.push({name,artifactSha256:hash(bytes),creationBytes:c.evm.bytecode.object.length/2,runtimeBytes:c.evm.deployedBytecode.object.length/2,testOnly:sourceName.includes('/testing/')});
}
if(artifacts.length!==names.length)throw Error('Missing monetary artifact');
const report={format:'vault-monetary-build-v1',compiler:solc.version(),settings:input.settings,sourcePins:[...seen].map(([p,s])=>({path:p,sha256:hash(s)})),artifacts};
fs.writeFileSync('.state/monetary-build.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({compiler:report.compiler,artifacts,sourcePins:seen.size,legacyArtifactsTouched:false},null,2));
