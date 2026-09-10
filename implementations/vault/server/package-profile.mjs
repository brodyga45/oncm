import {supportedExternalProfiles} from '../sdk/external-profile-catalog.mjs';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
/** Toolchain metadata, not a proof that source elaborates to the committed goal. */
export function packageProfileDescriptor(profileId,profile){
 const descriptor=supportedExternalProfiles().find(d=>same(d.profileId,profileId));
 if(!descriptor)return null;
 if(!profile||profile.manifest!==descriptor.manifest)throw Error('Installed profile manifest differs from the pinned package toolchain');
 return {profileId:descriptor.profileId,imageId:descriptor.imageId,lean:descriptor.lean,
  foundationSha256:descriptor.foundationSha256,sourceGoalRelation:'not-verified',manifest:descriptor.manifest};
}
export function assertPackageContext(input,context,actor){
 if(input.statementId&&input.statementId!==context.statement?.id)throw Error('Package statement differs from request route');
 if(input.profileId&&!same(input.profileId,context.statement?.profileId||context.profileId||context.descriptor?.profileId))throw Error('Package immutable profile differs');
 const expected=input.expectedContext;if(!expected)return; // Existing direct SDK callers retain their explicit request API.
 if(!same(expected.account,actor)||expected.chainId!==context.chainId||expected.chainInstance!==context.chainInstance
  ||!same(expected.registry,context.registry)||(expected.statementId||null)!==(context.statement?.id||null)
  ||(expected.goalHash||null)!==(context.statement?.goalHash||null)
  ||!same(expected.profileId,context.statement?.profileId||context.profileId||context.descriptor?.profileId))throw Error('Package wallet/network/statement/profile context changed; review and retry');
}
