import fs from 'node:fs';
import path from 'node:path';
import {keccak256,toHex} from 'viem';
import {ixStarterFixtures} from './ix-starter.mjs';

// Read only public raw GitHub files at a full immutable commit. No repository code
// or build hook is executed by this importer, and redirects are not followed.
export function parseSnapshot(input){
 const u=new URL(input);if(u.protocol!=='https:'||u.hostname!=='github.com'||u.username||u.password||u.search)throw new Error('Use an HTTPS github.com file URL');
 const match=u.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/blob\/([0-9a-fA-F]{40})\/(.+)$/);
 if(!match||!match[4].endsWith('.lean')||match[4].includes('..')||match[4].includes('%'))throw new Error('Use github.com/owner/repo/blob/FULL_40_CHARACTER_COMMIT/path.lean');
 return{owner:match[1],repository:match[2],commit:match[3].toLowerCase(),file:match[4],url:u.toString()};
}
async function boundedText(url,optional=false,maxBytes=100000){
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'user-agent':'Agora-local-snapshot-import/0.1'}});
 if(optional&&response.status===404)return null;
 if(!response.ok)throw new Error(`Published source returned HTTP ${response.status}`);
 const reader=response.body.getReader();let total=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>maxBytes){await reader.cancel();throw new Error('Imported file exceeds the size limit');}chunks.push(value);}
 return new TextDecoder().decode(Buffer.concat(chunks));
}
export async function importSnapshot(url){
 const s=parseSnapshot(url);const base=`https://raw.githubusercontent.com/${s.owner}/${s.repository}/${s.commit}/`;
 const [source,toolchain,manifest,formalization]=await Promise.all([boundedText(base+s.file),boundedText(base+'lean-toolchain',true),boundedText(base+'lake-manifest.json',true),boundedText(base+'formalization.yaml',true)]);
 return{schemaVersion:2,title:`${s.repository} · ${s.file.split('/').at(-1)}`,source,repositoryUrl:s.url,commit:s.commit,sourceHash:keccak256(toHex(source)),metadata:{title:`${s.repository} · ${s.file.split('/').at(-1)}`,description:'Imported from an immutable public Lean repository snapshot. Review the exact declaration and informal description before registration.',externalRef:s.url},files:{[s.file]:source,...toolchain&&{'lean-toolchain':toolchain},...manifest&&{'lake-manifest.json':manifest},...formalization&&{'formalization.yaml':formalization}},provenance:{...s,fetchedAt:new Date().toISOString(),registryStatus:'unverified external source'}};
}
export function fixtures(root){const f=path.join(root,'proof/fixtures.json');const data=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):[];return [...(Array.isArray(data)?data:data.fixtures??[]),...ixStarterFixtures(root)];}

export async function searchPalomar(query=''){
 const data=JSON.parse(await boundedText('https://data.palomar-registry.org/recent.json',false,2_000_000));
 const q=query.toLowerCase();return{scope:'recent published entries',entries:(data.entries??[]).filter(e=>`${e.title} ${e.abstract} ${e.formalization?.theorem_names?.join(' ')}`.toLowerCase().includes(q)).slice(0,30)};
}
export async function importPalomar(id,version){
 if(!/^PALOMAR-\d{4}-\d{2}-\d{2}-\d{6}$/.test(id)||!Number.isSafeInteger(version)||version<1)throw new Error('Invalid Palomar entry identity');
 const registry=JSON.parse(await boundedText(`https://data.palomar-registry.org/entries/${id}-v${version}.json`,false,500000));
 const {repository,commit,project_path}=registry.source??{};if(!/^[\w.-]+\/[\w.-]+$/.test(repository)||!/^[a-f0-9]{40}$/i.test(commit))throw new Error('Registry source is not an immutable GitHub snapshot');
 const project=project_path?`${project_path.replace(/\/$/,'')}/`:'';if(project.includes('..')||project.includes('%'))throw new Error('Unsafe project path');
 const f=registry.formalization??{};const required=f.challenge_path;if(!required)throw new Error('Entry has no challenge path');
 const names=[required,f.solution_path,f.formalization_metadata_path,f.comparator_config_path,f.lakefile_path,'lean-toolchain','lake-manifest.json'].filter(Boolean);
 const files={};for(const name of [...new Set(names)]){if(!/^[\w./-]+$/.test(name)||name.includes('..')||name.startsWith('/'))throw new Error('Unsafe registry file path');const contents=await boundedText(`https://raw.githubusercontent.com/${repository}/${commit}/${project}${name}`,name!==required,200000);if(contents!==null)files[name]=contents;}
 return{schemaVersion:2,title:registry.title,source:files[required],solution:files[f.solution_path]??'',repositoryUrl:`https://github.com/${repository}/blob/${commit}/${project}${required}`,commit,files,fileHashes:Object.fromEntries(Object.entries(files).map(([name,text])=>[name,keccak256(toHex(text))])),metadata:{title:registry.title,description:registry.abstract??'',externalRef:`https://data.palomar-registry.org/entries/${id}-v${version}.json`},provenance:{registry,id,version,importedAt:new Date().toISOString()},notice:'Palomar metadata and files were retrieved. This draft still requires a supported proof profile and onchain registration certificate.'};
}
