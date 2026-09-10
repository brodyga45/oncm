import {encodeFunctionData} from 'viem';
import {governanceTreasuryCall} from '../sdk/treasury.mjs';
export function composeGovernanceCall(body,manifest,abis){
 if(['allocation-consent','treasury-transfer'].includes(body.kind))return governanceTreasuryCall(body,manifest,abis);
 const functions={profile:'configureProfile',operator:'configureOperator',disable:'setProfileEnabled'},functionName=functions[body.kind];if(!functionName)throw Error('Unknown governance operation');
 const args=body.kind==='disable'?[body.profileId,!!body.enabled]:[body.profileId,body.verifier,body.manifestHash];
 return{target:manifest.registry,data:encodeFunctionData({abi:abis.AgoraRegistry,functionName,args})};
}
export async function reviewGovernanceAction({action,target,data,read,manifest,abis,block}){
 if(!action)return null; // Preserve existing immutable profile/operator proposals.
 const call=governanceTreasuryCall(action,manifest,abis);
 if(call.target.toLowerCase()!==target.toLowerCase()||call.data!==data||action.executor.toLowerCase()!==manifest.timelock.toLowerCase())throw Error('Prepared treasury call binding changed');
 const at=(address,name,fn,args=[])=>read(address,name,fn,args,{blockNumber:block.number});
 if(action.kind==='allocation-consent'){
  if(action.controller.toLowerCase()!==manifest.allocation.toLowerCase())throw Error('Allocation controller changed');
  const p=await at(manifest.allocation,'AllocationController','proposal',[BigInt(action.proposalId)]),epoch=await at(manifest.allocation,'AllocationController','currentEpoch');
  if(p.executed||BigInt(p.baseVersion)!==BigInt(epoch)||BigInt(block.timestamp)>BigInt(p.expiresAt))throw Error('Outer allocation proposal is applied, stale or expired');
  const current=await at(manifest.allocation,'AllocationController','currentShare',[manifest.timelock]),i=p.payees.findIndex(a=>a.toLowerCase()===manifest.timelock.toLowerCase()),next=i<0?0n:BigInt(p.shares[i]);if(next>=BigInt(current))throw Error('This outer proposal does not decrease the governance beneficiary share');
  if(action.baseVersion!==undefined&&String(action.baseVersion)!==String(p.baseVersion))throw Error('Prepared outer allocation epoch changed');
  return{baseVersion:String(p.baseVersion),expiresAt:String(p.expiresAt),previousShare:String(current),newShare:String(next),observedBlock:String(block.number),executor:manifest.timelock,controller:manifest.allocation,proposalId:action.proposalId,approve:action.approve};
 }
 if(action.token.toLowerCase()!==manifest.token.toLowerCase()||action.rawAmount!==call.action.rawAmount)throw Error('Treasury token or exact amount changed');
 const balance=await at(manifest.token,'TrueToken','balanceOf',[manifest.timelock]);if(balance<BigInt(action.rawAmount))throw Error('Treasury T balance is below the prepared transfer amount');
 return{observedBlock:String(block.number),balance:String(balance),executor:manifest.timelock,token:manifest.token,recipient:action.recipient,rawAmount:action.rawAmount};
}
