import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export function ixStarterFixtures(root){
 const base=path.join(root,'imports/ix-starter');
 const catalog=JSON.parse(fs.readFileSync(path.join(base,'catalog.json'),'utf8'));
 if(catalog.format!=='oncm-source-catalog-v1'||catalog.entries.length!==3)throw Error('Unsupported Ix starter catalog');
 const checked=new Map();
 for(const file of catalog.files){
  const target=path.resolve(base,file.path);
  if(!target.startsWith(path.resolve(base)+path.sep)||file.bytes>1024*1024)throw Error('Invalid Ix source path/size');
  const bytes=fs.readFileSync(target);
  if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Ix source integrity mismatch');
  checked.set(file.path,bytes.toString('utf8'));
 }
 return catalog.entries.map(entry=>{
  const source=checked.get(entry.package.oncmSourcePath);
  if(!source)throw Error('Unpinned Ix source');
  const validation=entry.nativeValidation;
  const nativePassed=entry.status.leanCheck==='passed'&&entry.status.nativeKernelCheck==='passed-v3'
   &&validation?.profileId===entry.candidateProfileId
   &&validation?.sourceHash===`0x${createHash('sha256').update(source).digest('hex')}`;
  const native=nativePassed?'passed-v3':'not-yet-complete';
  const nativeLabel=nativePassed?'passed under v3 (Lean + NanoDa)':'not yet complete';
  const mathKind=entry.slug==='nat-reflexivity'?'Standard Lean Nat; equality reflexivity.':'Custom Peano natural TN defined by Ix; not the standard Nat type or a Mathlib import.';
  const description=`${entry.title}. ${mathKind} Imported snapshot native validation: ${nativeLabel}. No zk certificate has been generated.`;
  return {schemaVersion:2,id:entry.id,status:'imported-source',sourceOnly:true,title:`Ix · ${entry.title}`,description,source,
   commit:entry.origin.commit,repositoryUrl:entry.origin.url,upstreamDeclaration:entry.declaration,
   version:entry.package.toolchain,mathKind,validation:{source:'SHA256 and reviewed extraction verified',native,nativeLabel,profileId:nativePassed?validation.profileId:null,goalHash:nativePassed?entry.goalHash:null,zk:'not-generated',onchain:'not-submitted'},
   metadata:{title:`Ix · ${entry.title}`,description,externalRef:entry.origin.url},
   files:{'Oncm.lean':source,'Source.lean':checked.get(entry.package.sourcePath),'lean-toolchain':`${entry.package.toolchain}\n`,'LICENSE-MIT':checked.get('upstream/LICENSE-MIT'),'LICENSE-APACHE':checked.get('upstream/LICENSE-APACHE')},
   provenance:{catalogFormat:catalog.format,origin:entry.origin,package:entry.package,status:'imported-source',license:entry.license,mathKind},
   notice:'Source draft only. Review and check under an admitted profile, then obtain a real registration certificate. Import performs no Lean execution, proving or transaction.'};
 });
}
