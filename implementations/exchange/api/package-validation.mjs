import {sha256,toUtf8Bytes} from 'ethers';
import {inspectExternalBundle} from '../sdk/external-bundle.mjs';
import {selectExternalBundleProfile} from '../sdk/external-profile-catalog.mjs';
export function validatePublishedPackage(input){
 const source=String(input.source||'');
 if(source.length>1000000)throw Error('Lean source exceeds1MB');
 if(!input.canonicalGoalExport){if(!source)throw Error('Lean source required');return{...input,source};}
 const bundle={format:'oncm-external-certificate-bundle-v1',artifact:input.externalCertificate,goalExport:input.canonicalGoalExport,
  metadata:{title:input.title||'',description:input.description||''}};
 if(source)bundle.source={text:source,sha256:sha256(toUtf8Bytes(source)).slice(2),...(input.sourceOrigin?{origin:input.sourceOrigin}:{})};
 const selected=selectExternalBundleProfile(bundle,input.profileId),parsed=inspectExternalBundle(bundle,{trustedProfile:selected.descriptor,foundationBytes:selected.foundationBytes});
 if(parsed.outcome!==0||parsed.goalHash!==input.goalHash)throw Error('Public package differs from registration goal');
 // The API validates transport, not pairings. Registry still verifies every actual registration.
 return{...input,source,sourceGoalRelation:'not-verified',canonicalGoalExport:parsed.goalExport,packageValidation:'binding-only-not-EVM-verification'};
}
