import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {productionNames} from './production-graph.mjs';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
/** Standard ABI/bytecode distribution. No compiler is called at startup. All
 * published pins are checked before restoring any missing local artifact. */
export function ensureProductionArtifacts(root){
 const base=path.join(root,'production'),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json')));
 const names=manifest.artifacts?.map(a=>a.name).sort();
 if(manifest.format!=='vault-production-bootstrap-v1'||JSON.stringify(names)!==JSON.stringify([...productionNames].sort()))throw Error('Production bootstrap graph differs or contains an unapproved contract');
 for(const pin of manifest.sourcePins){
  if(typeof pin.path!=='string'||pin.path.startsWith('/')||pin.path.split('/').some(x=>!x||x==='.'||x==='..')||pin.path.includes('\\'))throw Error('Invalid source pin path');
  if(digest(fs.readFileSync(path.join(root,pin.path)))!==pin.sha256)throw Error('Production source/dependency differs from tested artifact: '+pin.path+'; explicitly rebuild and review bootstrap');
 }
 const pending=[];
 for(const pin of manifest.artifacts){
  const file=path.join(base,'artifacts',pin.name+'.json'),bytes=fs.readFileSync(file),artifact=JSON.parse(bytes);
  if(digest(bytes)!==pin.artifactSha256||artifact.contractName!==pin.name)throw Error('Production artifact hash/name differs: '+pin.name);
  if(pin.metadataSha256&&digest(fs.readFileSync(path.join(base,'metadata',pin.name+'.json')))!==pin.metadataSha256)throw Error('Production metadata differs: '+pin.name);
  const target=path.join(root,'.state/artifacts',pin.name+'.json');
  if(fs.existsSync(target)){if(digest(fs.readFileSync(target))!==pin.artifactSha256)throw Error('Existing artifact differs; no overwrite or implicit migration: '+pin.name);}
  else pending.push({target,bytes});
 }
 fs.mkdirSync(path.join(root,'.state/artifacts'),{recursive:true});
 for(const {target,bytes} of pending)fs.writeFileSync(target,bytes,{flag:'wx'});
 return {restored:pending.length,verified:manifest.artifacts.length,sourcePins:manifest.sourcePins.length};
}
