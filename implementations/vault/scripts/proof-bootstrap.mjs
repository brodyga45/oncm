import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {supportedExternalProfiles} from '../sdk/external-profile-catalog.mjs';
/** Restore only the missing local constructor descriptor from tracked pins.
 * Does not build, deploy, migrate, or overwrite an existing runtime descriptor. */
export function ensureProofDescriptor(root){
 const base=path.join(root,'proof'),file=path.join(base,'deployment.json');
 const pin=JSON.parse(fs.readFileSync(path.join(base,'bootstrap-deployment.json')));
 const v3=supportedExternalProfiles().find(d=>d.tag==='v3'),expected=pin.deployment;
 if(pin.format!=='oncm-vault-proof-bootstrap-v1'||expected.artifact!=='artifacts/LeanProofBridge.json'
  ||expected.profileId!==v3.profileId||expected.manifest!==v3.manifest
  ||JSON.stringify(expected.args)!==JSON.stringify([v3.imageId,v3.profileId]))throw Error('Proof bootstrap differs from pinned immutable v3 policy');
 const artifact=fs.readFileSync(path.join(base,expected.artifact));
 if(crypto.createHash('sha256').update(artifact).digest('hex')!==pin.artifactSha256)throw Error('Proof bootstrap artifact SHA-256 differs');
 const absent=!fs.existsSync(file);
 if(absent){try{fs.writeFileSync(file,JSON.stringify(expected,null,2)+'\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}}
 const actual=JSON.parse(fs.readFileSync(file));
 for(const field of ['artifact','args','profileId','manifest'])if(JSON.stringify(actual[field])!==JSON.stringify(expected[field]))throw Error('Existing proof descriptor differs; explicit reviewed migration required, never overwritten');
 return {mode:absent?'restored-missing-descriptor':'verified-existing-descriptor',definition:actual};
}
