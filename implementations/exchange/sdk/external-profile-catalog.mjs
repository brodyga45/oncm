import {decodeBase64} from 'ethers';
import {externalProfileAssets} from './external-profile-assets.mjs';
import {parseBoundedJSON} from './external-bundle.mjs';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
export function supportedExternalProfiles(){return externalProfileAssets.map(x=>structuredClone(x.descriptor));}
export function selectExternalBundleProfile(input,expectedProfileId){
 const parsed=typeof input==='string'?parseBoundedJSON(input):input;
 if(!same(parsed?.artifact?.profileId,expectedProfileId))throw Error('Bundle differs from selected immutable profile');
 const asset=externalProfileAssets.find(x=>same(x.descriptor.profileId,expectedProfileId));
 if(!asset)throw Error('No installed generic adapter for this immutable profile');
 // Preserve duplicate-key validation and digest of the exact original uploaded text.
 return{bundle:input,descriptor:structuredClone(asset.descriptor),foundationBytes:decodeBase64(asset.foundationBase64)};
}
