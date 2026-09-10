// Hash/provenance verification and distribution only: no compiler, chain or prover.
import fs from 'node:fs';
import {monetaryNames,sha256,validateMonetaryArtifact} from './monetary-bootstrap.mjs';
const root=process.cwd(),records=[],sources=new Map();
const compiled=JSON.parse(fs.readFileSync('.state/monetary-build.json'));
for(const name of monetaryNames){
 const bytes=fs.readFileSync('.state/monetary-artifacts/'+name+'.json'),a=JSON.parse(bytes);
 const original=compiled.artifacts.find(x=>x.name===name);
 if(!original||original.testOnly||original.artifactSha256!==sha256(bytes))throw Error('Current compiled artifact differs: '+name);
 const verified=validateMonetaryArtifact(root,a);for(const pin of verified.pins)sources.set(pin.path,pin);
 records.push({...original,metadataIpfsDigest:verified.metadataIpfsDigest});
}
fs.mkdirSync('production-v2/artifacts',{recursive:true});
for(const name of monetaryNames)fs.copyFileSync('.state/monetary-artifacts/'+name+'.json','production-v2/artifacts/'+name+'.json');
const manifest={format:'vault-monetary-bootstrap-v1',scope:'Additive V2 production contracts only; no test meters, mock registry/executor, legacy replacement or implicit deployment',compiler:compiled.compiler,settings:compiled.settings,artifacts:records,sourcePins:[...sources.values()].sort((a,b)=>a.path.localeCompare(b.path))};
fs.writeFileSync('production-v2/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({artifacts:records.length,sourcePins:sources.size,noCompilation:true}));
