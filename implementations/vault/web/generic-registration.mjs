import {sha256,toUtf8Bytes} from 'ethers';
// Keep onchain registry metadata <=1500 UTF-8 bytes even when optional origin
// strings use their full transport allowance. Full provenance remains in bundle.
export function genericRegistrationFields(review){
 if(!review?.genericBundle||!review.originalVerified||!review.bridgeVerified||review.outcome!==0)throw Error('Verified generic registration required');
 const sourceOrigin=review.source?.origin;
 const manifest=JSON.stringify({format:'oncm-external-goal-provenance-v1',bundleSha256:review.bundleSha256,
  goalExportSha256:review.goalExport.sha256,goalExportBytes:review.goalExport.bytes,
  sourceSha256:review.source?.sha256||null,sourceGoalRelation:'not-verified',
  sourceOriginSha256:sourceOrigin?sha256(toUtf8Bytes(JSON.stringify(sourceOrigin))).slice(2):null,imageId:review.imageId});
 if(toUtf8Bytes(manifest).length>1500)throw Error('Registration provenance exceeds registry metadata limit');
 return {title:review.metadata.title||'',source:review.source?.text||'',manifest};
}
