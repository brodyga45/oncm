import {decodeBase64} from 'ethers';
import {externalProfileAssets} from './external-profile-assets.mjs';
import {parseBoundedJSON} from './external-bundle.mjs';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function supportedExternalProfiles(){return externalProfileAssets.map(x=>structuredClone(x.descriptor));}
export function selectExternalBundleProfile(input,expectedProfileId){
 const bundle=typeof input==='string'?parseBoundedJSON(input):input;
 const id=bundle?.artifact?.profileId;
 if(!same(id,expectedProfileId))throw Error('Bundle differs from the selected immutable profile');
 const asset=externalProfileAssets.find(x=>same(x.descriptor.profileId,id));
 if(!asset)throw Error('No installed verifier adapter for this immutable profile');
 // Preserve exact uploaded bytes for duplicate-key checking and bundle digest.
 return {bundle:input,descriptor:structuredClone(asset.descriptor),foundationBytes:decodeBase64(asset.foundationBase64)};
}
export function mergeExternalProofCatalog(remote=[]){
 return supportedExternalProfiles().map(descriptor=>{
  const entry=remote.find(x=>same(x.descriptor?.profileId,descriptor.profileId)&&x.descriptor?.manifest===descriptor.manifest);
  return {descriptor,deployment:entry?.deployment??null,examples:entry?.examples??[]};
 });
}
