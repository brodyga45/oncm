// Package adoption restores a draft, never cryptographic readiness. Call the
// original-verifier import action separately before asking for registration.
import {sha256,toUtf8Bytes} from 'ethers';
import {parseBoundedJSON,inspectExternalBundle} from '../sdk/external-bundle.mjs';
import {selectExternalBundleProfile} from '../sdk/external-profile-catalog.mjs';

const assert=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
function verifyTextHash(text,digest,label){
 if(digest===undefined)return;
 assert(typeof digest==='string'&&/^[0-9a-f]{64}$/.test(digest)&&sha256(toUtf8Bytes(text)).slice(2)===digest,label+' SHA256 mismatch');
}
export function preparePortablePackage(input,{fallbackProfileId=''}={}){
 const p=parseBoundedJSON(typeof input==='string'?input:JSON.stringify(input));
 assert(p&&typeof p==='object'&&!Array.isArray(p),'Portable package must be an object');
 assert(p.schema===undefined||p.schema==='exchange-lean-package-v1','Unsupported portable package schema');
 const source=p.source??p.leanSource??'';
 assert(typeof source==='string','Package source must be text');
 verifyTextHash(source,p.sourceSha256,'Package source');
 if(p.files!==undefined){
  assert(Array.isArray(p.files)&&p.files.length<=256,'Package file count limit');
  const paths=new Set();
  for(const file of p.files){
   assert(file&&typeof file.path==='string'&&typeof file.content==='string','Invalid package file');
   assert(file.path&&!file.path.startsWith('/')&&!/[\\?#%\u0000]/.test(file.path)&&file.path.split('/').every(s=>s&&s!=='.'&&s!=='..')&&!paths.has(file.path),'Invalid or duplicate package file path');
   paths.add(file.path);verifyTextHash(file.content,file.sha256,'Package file '+file.path);
  }
 }
 const profileId=p.profileId||fallbackProfileId;
 assert(!profileId||/^0x[0-9a-fA-F]{64}$/.test(profileId),'Invalid package profile ID');
 let externalJSON='',generic=false;
 if(p.canonicalGoalExport){
  generic=true;
  const bundle={format:'oncm-external-certificate-bundle-v1',artifact:p.externalCertificate,goalExport:p.canonicalGoalExport,
   metadata:{title:p.title||p.metadata?.title||'',description:p.description||''}};
  if(source)bundle.source={text:source,sha256:sha256(toUtf8Bytes(source)).slice(2),...(p.sourceOrigin?{origin:p.sourceOrigin}:{})};
  const selected=selectExternalBundleProfile(bundle,profileId),review=inspectExternalBundle(bundle,{trustedProfile:selected.descriptor,foundationBytes:selected.foundationBytes});
  assert(review.outcome===0,'Portable registration package requires outcome0');
  assert(same(review.goalHash,p.goalHash),'Portable package goal differs from canonical export');
  assert(!p.registrationCertificate||same(p.registrationCertificate,review.certificate),'Portable package certificate differs from artifact');
  assert(!p.targetDeclaration||p.targetDeclaration==='Oncm.goal','Canonical package target must be Oncm.goal');
  externalJSON=JSON.stringify(bundle,null,2);
 }else if(p.externalCertificate){
  assert(p.externalCertificate.format==='oncm-real-groth16-ci-v1','Unknown package certificate format');
  assert(!p.profileId||same(p.externalCertificate.profileId,p.profileId),'Package artifact profile differs');
  assert(!p.goalHash||same(p.externalCertificate.goalHash,p.goalHash),'Package artifact goal differs');
  assert(!p.registrationCertificate||same(p.externalCertificate.certificate,p.registrationCertificate),'Package artifact certificate differs');
  externalJSON=JSON.stringify(p.externalCertificate,null,2);
 }
 return{draft:{...p,source,profileId,sourceGoalRelation:'not-verified',...(generic?{fixtureId:'',targetDeclaration:'Oncm.goal'}:{})},
  certificate:'',externalJSON,generic,requiresExternalVerification:!!(p.registrationCertificate||p.externalCertificate),
  status:externalJSON?'Package loaded as an unverified draft. Verify its external certificate below before registration.':'Package loaded as an unverified draft. Attach an external registration certificate and verify it before registration.'};
}
export function retainPackageMetadata(imported,verified){
 const sameInput=imported&&same(imported.goalHash,verified.goalHash)&&same(imported.profileId,verified.profileId)&&(imported.source||'')===(verified.source||'');
 // Imported files/provenance are explicit public-package inputs. Preserve them
 // only across verification of that exact draft, never from an unrelated job.
 return{...(sameInput?imported:{}),...verified,sourceGoalRelation:'not-verified'};
}
