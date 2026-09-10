import {network} from '../sdk/local-network.mjs';
export function proposalView(proposal,{timestamp,nonce,threshold,owners},operationTimestamp){
 const when=BigInt(operationTimestamp),done=when===1n,scheduled=when>1n;
 const ready=scheduled&&BigInt(timestamp)>=when;
 const ownerSet=new Set(owners.map(address=>address.toLowerCase()));
 const signatureCount=new Set(proposal.signatures.filter(s=>ownerSet.has(s.address.toLowerCase())).map(s=>s.address.toLowerCase())).size;
 const staleNonce=BigInt(proposal.nonce)!==BigInt(nonce);
 const status=done?'executed':ready?'ready':scheduled?'scheduled':staleNonce?'stale-nonce':signatureCount>=Number(threshold)?'ready-to-schedule':'collecting-signatures';
 return {...proposal,status,signatureCount,scheduled,ready,done,operationTimestamp:when,
  canSign:!done&&!scheduled&&!staleNonce,
  canSchedule:!done&&!scheduled&&!staleNonce&&signatureCount>=Number(threshold),
  canExecute:ready};
}

export function isLocalDevnet(rpcUrl,chainId){
 try{const u=new URL(rpcUrl);return Number(chainId)===31371&&u.protocol==='http:'&&!u.username&&!u.password&&['127.0.0.1','localhost','[::1]'].includes(u.hostname);}catch{return false;}
}

export function authorizeDevTime(request,session){
 if(request.headers.origin!==network.webOrigin)throw Object.assign(Error('Local time control requires the Agora web origin'),{statusCode:403});
 return session(request); // Existing verified wallet/SIWE session, no new auth scheme.
}

export async function governanceSnapshot({client,read,manifest,proposals,rpcUrl,reviewAction=async()=>null}){
 const block=await client.getBlock({blockTag:'latest'}),extra={blockNumber:block.number};
 const [threshold,owners,nonce,delay,chainId]=await Promise.all([
  read(manifest.safe,'Safe','getThreshold',[],extra),read(manifest.safe,'Safe','getOwners',[],extra),
  read(manifest.safe,'Safe','nonce',[],extra),read(manifest.timelock,'AgoraTimelock','getMinDelay',[],extra),client.getChainId()]);
 const context={timestamp:block.timestamp,threshold,owners,nonce};
 const views=await Promise.all(proposals.map(async p=>{
  const view=proposalView(p,context,await read(manifest.timelock,'AgoraTimelock','getTimestamp',[p.operationId],extra));
  if(p.action&&!view.done)try{view.actionContext=await reviewAction(p,block);}catch(e){view.actionError=e.message;view.canSign=false;view.canSchedule=false;view.canExecute=false;view.status='action-unavailable';}
  return view;
 }));
 return {safe:manifest.safe,threshold,owners,nonce,delay,observedBlock:block.number,observedBlockHash:block.hash,observedTimestamp:block.timestamp,localTimeControls:isLocalDevnet(rpcUrl,chainId),proposals:views};
}

// Explicit local test utility; never invoked while reading governance state.
export async function advanceLocalTime({client,rpcUrl,seconds=10}){
 if(seconds!==10||!isLocalDevnet(rpcUrl,await client.getChainId()))throw Error('Time controls require the localhost Agora test chain31371 and exactly10seconds');
 await client.request({method:'evm_increaseTime',params:[10]});
 await client.request({method:'evm_mine',params:[]});
 const block=await client.getBlock({blockTag:'latest'});
 return {observedBlock:block.number,observedTimestamp:block.timestamp,seconds:10,notice:'Advanced the local devnet clock and mined one block; no governance call was executed.'};
}
