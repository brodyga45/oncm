import {parseBoundedJSON,EXTERNAL_BUNDLE_LIMITS} from '../sdk/external-bundle.mjs';
export {EXTERNAL_BUNDLE_LIMITS};
export {parseBoundedJSON};
export function externalInput(input){
 const raw=typeof input==='string'?input:JSON.stringify(input),parsed=parseBoundedJSON(raw);
 const generic=parsed?.format==='oncm-external-certificate-bundle-v1';
 if(!generic&&new TextEncoder().encode(raw).length>128*1024)throw Error('Curated certificate exceeds128KiB');
 return{raw,parsed,generic,artifact:generic?parsed.artifact:parsed};
}
export function genericRegistrationDraft(review,input){
 if(!review.genericBundle||review.outcome!==0||!review.originalVerified||review.cryptographicStatus!=='original-and-bridge-verified')throw Error('Verified registration bundle required');
 const {parsed,generic}=externalInput(input);if(!generic||parsed.artifact.certificate!==review.certificate)throw Error('Bundle changed after verification');
 return{title:review.metadata.title||`External statement ${review.goalHash.slice(0,12)}`,description:review.metadata.description||'',
  source:review.source?.text||'',goalHash:review.goalHash,profileId:review.profileId,fixtureId:'',targetDeclaration:'Oncm.goal',
  canonicalGoalExport:review.goalExport,externalCertificate:parsed.artifact,sourceGoalRelation:'not-verified',
  sourceOrigin:review.source?.origin,bundleSha256:review.bundleSha256};
}
