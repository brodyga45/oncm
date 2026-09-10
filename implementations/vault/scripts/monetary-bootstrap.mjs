import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {keccak256} from 'ethers';
import {metadataIpfsDigest} from './metadata-ipfs.mjs';

export const monetaryNames=['TrueTokenV2','RewardBudget','AllocationControllerV2','FeeRoutingAuthorizer','PoolCoordinatorV2','IncentiveFinalityHook','BptLockMeter'];
export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function verifiedMetadataText(artifact){
 const raw=artifact.deployedBytecode.slice(2),length=parseInt(raw.slice(-4),16),tail=raw.slice(-4-length*2,-4);
 const embedded=tail.match(/646970667358221220([0-9a-f]{64})/i)?.[1];
 const json=JSON.stringify(artifact.metadata);
 // Earlier artifacts retained the parsed object only. solc escapes Unicode in
 // metadata JSON; restore that representation only when its exact CID matches.
 // This is serialization recovery, never acceptance of a different metadata hash.
 const candidates=artifact.metadataText!==undefined?[artifact.metadataText]:[json,json.replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))];
 const text=candidates.find(s=>typeof s==='string'&&metadataIpfsDigest(s)===embedded);
 if(!embedded||text===undefined||JSON.stringify(JSON.parse(text))!==json)throw Error('Monetary bytecode metadata mismatch');
 return{text,digest:embedded};
}
function safePath(p){if(typeof p!=='string'||p.startsWith('/')||p.includes('\\')||p.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('Invalid monetary provenance path');return p;}
export function validateMonetaryArtifact(root,artifact){
 if(!monetaryNames.includes(artifact.contractName)||artifact.compiler!=='0.8.28+commit.7893614a.Emscripten.clang')throw Error('Unknown monetary production artifact/compiler');
 const metadata=artifact.metadata;
 if(metadata.settings?.compilationTarget?.[artifact.sourceName]!==artifact.contractName||metadata.settings.optimizer?.runs!==1||metadata.settings.optimizer?.enabled!==true||metadata.settings.viaIR!==true||metadata.settings.evmVersion!=='cancun')throw Error('Monetary compiler settings differ');
 const verifiedMetadata=verifiedMetadataText(artifact);
 const pins=[];
 for(const [name,expected]of Object.entries(metadata.sources)){
  safePath(name);const candidates=[name,'node_modules/'+name];
  const local=candidates.find(p=>fs.existsSync(path.join(root,p)));if(!local)throw Error('Missing pinned source '+name);
  const bytes=fs.readFileSync(path.join(root,local));if(keccak256(bytes)!==expected.keccak256)throw Error('Monetary source differs from compiled metadata: '+name);
  pins.push({path:local,sha256:sha256(bytes)});
 }
 return{pins,metadataIpfsDigest:verifiedMetadata.digest};
}
export function loadMonetaryBootstrap(root){
 const base=path.join(root,'production-v2'),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
 if(manifest.format!=='vault-monetary-bootstrap-v1'||JSON.stringify(manifest.artifacts.map(a=>a.name).sort())!==JSON.stringify([...monetaryNames].sort()))throw Error('V2 production graph differs or includes test contracts');
 const artifacts={};
 for(const pin of manifest.sourcePins){if(sha256(fs.readFileSync(path.join(root,safePath(pin.path))))!==pin.sha256)throw Error('V2 source pin differs: '+pin.path);}
 for(const pin of manifest.artifacts){
  const bytes=fs.readFileSync(path.join(base,'artifacts',pin.name+'.json')),a=JSON.parse(bytes);
  if(sha256(bytes)!==pin.artifactSha256||a.contractName!==pin.name)throw Error('V2 artifact differs: '+pin.name);
  validateMonetaryArtifact(root,a);artifacts[pin.name]=a;
 }
 return{manifest,artifacts};
}
export function matchesRuntime(actual,artifact){
 if(typeof actual!=='string'||actual.length!==artifact.deployedBytecode.length)return false;
 function masked(code){const bytes=Buffer.from(code.slice(2),'hex');for(const slots of Object.values(artifact.immutableReferences??{}))for(const {start,length}of slots)bytes.fill(0,start,start+length);return bytes.toString('hex');}
 return masked(actual)===masked(artifact.deployedBytecode);
}
