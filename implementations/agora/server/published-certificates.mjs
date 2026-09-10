import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {loadExternalBundle} from './external-certificates.mjs';
const allowed=new Map([['true-registration','registration.json'],['false-registration','false-registration.json'],['true-proof','true-proof.json'],['false-refutation','false-refutation.json']]);
export function publishedCertificateCatalog(root){
 const base=path.join(root,'proof/additional-profiles/perf05');
 const catalog=JSON.parse(fs.readFileSync(path.join(base,'published-certificates.json'),'utf8'));
 const bundle=loadExternalBundle(root);
 if(catalog.format!=='oncm-published-certificate-catalog-v1'||catalog.entries.length!==4||new Set(catalog.entries.map(e=>e.id)).size!==4)throw Error('Invalid published certificate catalog');
 for(const entry of catalog.entries){
  if(allowed.get(entry.id)!==entry.file||entry.case!==entry.id)throw Error('Certificate is not allowlisted');
  const expectedOutcome=entry.id.endsWith('registration')?0:entry.id==='true-proof'?1:2;
  const fixture=bundle.fixtures.find(f=>f.name===(entry.id.startsWith('true-')?'true':'false'));
  if(entry.outcome!==expectedOutcome||entry.goalHash!==fixture.goalHash||entry.profileId!==bundle.profile.profileId)throw Error('Published certificate case/goal/profile binding mismatch');
  const bytes=fs.readFileSync(path.join(base,entry.file));
  if(bytes.length!==entry.bytes||bytes.length>50000||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Published certificate file pin mismatch');
  const artifact=JSON.parse(bytes);
  if(artifact.format!=='oncm-real-groth16-ci-v1'||artifact.profile!=='perf05'||artifact.receiptKind!=='Groth16'
   ||['case','outcome','goalHash','profileId'].some(k=>artifact[k]!==entry[k]))throw Error('Published certificate envelope mismatch');
 }
 return catalog.entries;
}
export function loadPublishedCertificate(root,id){
 if(!allowed.has(id))throw Object.assign(Error('Unknown published certificate choice'),{statusCode:400});
 const entry=publishedCertificateCatalog(root).find(e=>e.id===id);
 const artifact=JSON.parse(fs.readFileSync(path.join(root,'proof/additional-profiles/perf05',allowed.get(id)),'utf8'));
 return {status:'loaded-unverified',entry,artifact,notice:'Loaded pinned JSON only. Verify against the selected goal/profile before a separate wallet transaction.'};
}
