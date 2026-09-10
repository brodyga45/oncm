import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
/** Export the exact pinned descriptor of this statement, never the default runner profile. */
export function packageProfile(root,profileId,supported){
 const selected=supported.find(p=>same(p.trustedProfile.profileId,profileId));
 if(!selected)return{profileId,status:'unsupported-local-profile',manifest:null,warning:'No local descriptor for this immutable profile; obtain it independently before reproduction.'};
 const bytes=fs.readFileSync(path.join(root,selected.descriptor)),manifest=JSON.parse(bytes),manifestSha256=createHash('sha256').update(bytes).digest('hex');
 if(!same(manifest.profileId,profileId)||!same('0x'+manifestSha256,selected.manifestHash))throw Error('Package profile descriptor does not match the pinned deployment');
 return{profileId,status:'pinned-descriptor',manifest,manifestSha256,manifestJSON:bytes.toString('utf8'),sourceGoalRelation:'not-verified'};
}
