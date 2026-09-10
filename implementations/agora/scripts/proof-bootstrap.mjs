import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function ensureProofBootstrap(root){
 const proof=path.join(root,'proof'),read=file=>fs.readFileSync(path.join(proof,file));
 const pinned=JSON.parse(read('bootstrap-deployment.json')),manifestBytes=read('manifest.json'),manifest=JSON.parse(manifestBytes);
 if(pinned.artifact!=='bootstrap/LeanProofBridge.json'||!/^[0-9a-f]{64}$/.test(pinned.artifactSha256||''))throw Error('Invalid pinned proof bootstrap artifact');
 const artifactBytes=read(pinned.artifact),artifact=JSON.parse(artifactBytes);
 if(sha(artifactBytes)!==pinned.artifactSha256||!Array.isArray(artifact.abi)||!/^0x[0-9a-f]+$/i.test(artifact.bytecode||''))throw Error('Proof bootstrap artifact hash/format mismatch');
 if(pinned.profileId!==manifest.profileId||pinned.args?.length!==2||pinned.args[0]!==manifest.imageId||pinned.args[1]!==pinned.profileId||pinned.manifest!=='0x'+sha(manifestBytes))throw Error('Proof bootstrap profile/image/manifest mismatch');
 const legacyArtifact=path.join(proof,'artifacts/LeanProofBridge.json');
 if(!fs.existsSync(legacyArtifact)){fs.mkdirSync(path.dirname(legacyArtifact),{recursive:true});fs.writeFileSync(legacyArtifact,artifactBytes,{flag:'wx'});}
 else if(sha(fs.readFileSync(legacyArtifact))!==pinned.artifactSha256)throw Error('Existing bridge artifact differs from pinned bootstrap');
 const destination=path.join(proof,'deployment.json');
 if(fs.existsSync(destination)){
  const current=JSON.parse(fs.readFileSync(destination));
  if(current.profileId!==pinned.profileId||current.manifest!==pinned.manifest||JSON.stringify(current.args)!==JSON.stringify(pinned.args))throw Error('Existing proof descriptor differs from pinned bootstrap; explicit profile integration required');
  if(!['artifacts/LeanProofBridge.json',pinned.artifact].includes(current.artifact)||sha(read(current.artifact))!==pinned.artifactSha256)throw Error('Existing proof artifact differs from bootstrap');
  return{...current,bootstrapCreated:false};
 }
 fs.writeFileSync(destination,JSON.stringify(pinned,null,2)+'\n',{flag:'wx'});
 return{...pinned,bootstrapCreated:true};
}
