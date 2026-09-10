// Prepare a transport bundle only. This never computes a proof or sends a transaction.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {sha256} from 'viem';import {base64} from '@scure/base';
import {inspectExternalBundle,parseBoundedJSON,EXTERNAL_BUNDLE_LIMITS as limits} from '../sdk/external-bundle.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),args=Object.fromEntries(process.argv.slice(2).reduce((items,v,i,all)=>i%2?items:[...items,[v.replace(/^--/,''),all[i+1]]],[]));
if(!args.artifact||!args.goal||!args.out)throw Error('Usage: --artifact receipt.json --goal goal.ndjson [--source Statement.lean] [--metadata metadata.json] --out new-bundle.json');
const read=(file,max)=>{if(fs.statSync(file).size>max)throw Error('Input file exceeds bounded size');return fs.readFileSync(file);};
const artifact=parseBoundedJSON(read(args.artifact,65536).toString('utf8')),goal=read(args.goal,limits.goal);
const candidates=[['proof/manifest.json','proof/lean/foundation.ndjson'],['proof/additional-profiles/perf05/profile.json','proof/additional-profiles/perf05/fixtures/foundation.ndjson']];
let options;for(const [descriptor,foundation] of candidates){const p=JSON.parse(fs.readFileSync(path.join(root,descriptor)));if(p.profileId===artifact.profileId)options={trustedProfile:{...p,selector:'0x73c457ba',verifierParameters:'0x73c457ba541936f0d907daf0c7253a39a9c5c427c225ba7709e44702d3c6eedc'},foundationBytes:new Uint8Array(fs.readFileSync(path.join(root,foundation)))};}
if(!options)throw Error('Unsupported immutable profile');
const bundle={format:'oncm-external-certificate-bundle-v1',artifact,goalExport:{base64:base64.encode(goal),sha256:sha256(goal).slice(2),bytes:goal.length}};
if(args.source){const source=read(args.source,limits.source);bundle.source={text:new TextDecoder('utf-8',{fatal:true}).decode(source),sha256:sha256(source).slice(2)};}
if(args.metadata)bundle.metadata=parseBoundedJSON(read(args.metadata,16384).toString('utf8'));
const status=inspectExternalBundle(bundle,options);const json=JSON.stringify(bundle,null,2)+'\n';if(Buffer.byteLength(json)>limits.wrapper)throw Error('Formatted bundle exceeds 2 MiB');
fs.writeFileSync(args.out,json,{flag:'wx'});console.log(JSON.stringify({out:args.out,goalHash:status.goalHash,cryptographicStatus:'not-verified',sourceGoalRelation:'not-verified'}));
