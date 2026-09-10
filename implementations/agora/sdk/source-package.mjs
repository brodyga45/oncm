import Ajv from 'ajv';
import {keccak256,toHex} from 'viem';

export const MAX_PACKAGE_BYTES=16*1024*1024;
export const MAX_SOURCE_BYTES=512*1024,MAX_PACKAGE_FILE_BYTES=512*1024,MAX_PACKAGE_FILES_BYTES=1024*1024;
const bytes=value=>new TextEncoder().encode(value).length;
const digest=value=>keccak256(toHex(value));
const hashSchema={type:'string',pattern:'^0x[0-9a-fA-F]{64}$'};
const referenceSchema={anyOf:[{type:'string',maxLength:2000,pattern:'^(https?://|$)'},{type:'null'}]};
const validate=new Ajv({allErrors:false,ownProperties:true}).compile({
 type:'object',required:['schemaVersion','source','files','fileHashes'],
 properties:{
  schemaVersion:{const:2},source:{type:'string',maxLength:MAX_SOURCE_BYTES},sourceFile:{type:'string'},
  sourceHash:hashSchema,goalHash:{anyOf:[hashSchema,{type:'null'}]},profileId:hashSchema,
  files:{type:'object',minProperties:1,maxProperties:64,additionalProperties:{type:'string'}},
  fileHashes:{type:'object',minProperties:1,maxProperties:64,additionalProperties:hashSchema},
  id:{type:'string',maxLength:240},sourceOnly:{type:'boolean'},repositoryUrl:referenceSchema,
  metadata:{type:'object',properties:{source:{type:'string'},sourceHash:hashSchema,title:{type:'string',maxLength:180},description:{type:'string',maxLength:10000},externalRef:referenceSchema}},
  title:{type:'string',maxLength:180},description:{type:'string',maxLength:10000},
  registrationCertificate:{type:'string',maxLength:50000},artifacts:{type:'array',maxItems:64},
 },
});
const safePath=name=>typeof name==='string'&&name.length<=240&&!name.startsWith('/')&&!name.includes('\\')
 &&/^[A-Za-z0-9_.\-/]+$/.test(name)&&name.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!['__proto__','prototype','constructor'].includes(s));

/** Integrity of metadata bytes only. No Lean execution or certificate admission. */
export function validateSourcePackage(raw){
 if(!raw||bytes(JSON.stringify(raw))>MAX_PACKAGE_BYTES)throw Error('Source package exceeds 16 MiB');
 if(!validate(raw))throw Error(`Invalid source package schema: ${validate.errors?.[0]?.instancePath??''} ${validate.errors?.[0]?.message??''}`);
 if(bytes(raw.source)>MAX_SOURCE_BYTES)throw Error('Package source exceeds 512 KiB UTF-8');
 for(const title of [raw.title,raw.metadata?.title])if(title!==undefined&&bytes(title)>180)throw Error('Package title exceeds 180 UTF-8 bytes');
 const names=Object.keys(raw.files),hashNames=Object.keys(raw.fileHashes);
 if(names.length!==hashNames.length||hashNames.some(n=>!Object.hasOwn(raw.files,n)))throw Error('Package file hashes must cover exactly every file');
 let total=0;
 for(const name of names){
  if(!safePath(name))throw Error('Unsafe package file path');
  const size=bytes(raw.files[name]);total+=size;
  if(size>MAX_PACKAGE_FILE_BYTES||total>MAX_PACKAGE_FILES_BYTES)throw Error('Package files exceed the UTF-8 size budget');
  if(digest(raw.files[name]).toLowerCase()!==raw.fileHashes[name].toLowerCase())throw Error(`Package file hash mismatch: ${name}`);
 }
 const sourceFile=raw.sourceFile??names.find(name=>raw.files[name]===raw.source);
 if(!sourceFile||!Object.hasOwn(raw.files,sourceFile)||raw.files[sourceFile]!==raw.source)throw Error('Package source must match its declared source file');
 const sourceHash=digest(raw.source);
 for(const claimed of [raw.sourceHash,raw.metadata?.sourceHash])if(claimed&&claimed.toLowerCase()!==sourceHash)throw Error('Package source hash mismatch');
 if(raw.metadata?.source!==undefined&&raw.metadata.source!==raw.source)throw Error('Package metadata source mismatch');
 return {...raw,sourceFile,integrity:{status:'verified-file-integrity',algorithm:'keccak256-utf8',sourceHash,fileCount:names.length,
  semanticGoal:'not-verified',certificate:'not-accepted',notice:'File/source hashes verify imported bytes, not the semantic goal or certificate.'}};
}

/** Trusted adapter output only; never called on uploaded package JSON. */
export function withFileHashes(raw){
 return {...raw,schemaVersion:2,sourceHash:digest(raw.source),fileHashes:Object.fromEntries(Object.entries(raw.files).map(([name,text])=>[name,digest(text)]))};
}
