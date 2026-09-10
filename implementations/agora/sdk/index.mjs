import {readLiquiditySnapshot,fundingPreview,withdrawalPreview} from './liquidity-preview.mjs';
export {fundingPreview,withdrawalPreview,completeSetPreview,readLiquiditySnapshot} from './liquidity-preview.mjs';
import {network} from './local-network.mjs';
import {createSocialSDK} from './social.mjs';
import {createSocialReader} from './social-read.mjs';
export {createSocialSDK,createSocialReader};
import {parseTokenAmount as parseEther,assertBaseUnits} from './amounts.mjs';
import {parseBoundedJSON} from './external-bundle.mjs';
export {inspectExternalBundle,parseBoundedJSON,EXTERNAL_BUNDLE_LIMITS} from './external-bundle.mjs';
export {validateSourcePackage} from './source-package.mjs';
export {governanceTreasuryCall,governanceShareDraft,allocationDraftReview,readTreasury} from './treasury.mjs';
export {parseTokenAmount,parseFeePercent,parseSlippagePercent,parseAllocationPercent} from './amounts.mjs';
import {createPublicClient,http,zeroHash,decodeEventLog} from 'viem';
import {chain,assertLocalChain,stringify} from './chain.mjs';

/** All amounts are bigint base units; positions are YES=0 and NO=1.
 * Callers may supply config+ABIs and a public client to work without the API.
 * Only private research, jobs, discovery and metadata require the offchain service; social has an RPC fallback.
 */
export async function createAgoraSDK({wallet,config,client,apiUrl=network.apiUrl+'/api'}={}){
 client??=createPublicClient({chain,transport:http(chain.rpcUrls.default.http[0]),pollingInterval:400});
 let token;
 const api=async(route,options={})=>{const r=await fetch(apiUrl+route,{...options,headers:{...options.body!==undefined&&{'content-type':'application/json'},...token&&{authorization:`Bearer ${token}`},...options.headers},body:options.body===undefined?undefined:stringify(options.body)});const data=await r.json();if(!r.ok)throw new Error(data.error??r.statusText);return data;};
 config??=await api('/config');if(config.chainId!==31371)throw new Error('Agora SDK requires its own chain 31371');
 const read=(address,contract,fn,args=[])=>client.readContract({address,abi:config.abis[contract],functionName:fn,args});
 const write=async(address,contract,fn,args=[])=>{if(!wallet)throw new Error('A signing wallet is required');await assertLocalChain(client);await assertLocalChain(wallet);const {request}=await client.simulateContract({address,abi:config.abis[contract],functionName:fn,args,account:wallet.account});const hash=await wallet.writeContract(request);const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Transaction reverted');return receipt;};
 const approveT=(spender,amount)=>write(config.token,'TrueToken','approve',[spender,assertBaseUnits(amount)]);
 const quote=async(pool,side,amount,mode='buy')=>{if(side!==0&&side!==1)throw new Error('Outcome is 0=YES or 1=NO');return read(pool,'FixedProductMarketMaker',mode==='buy'?'calcBuyAmount':'calcSellAmount',[assertBaseUnits(amount),side]);};
 const social=config.social?createSocialSDK({client,wallet,address:config.social,abi:config.abis.AgoraSocial}):null;
 const requireSocial=()=>{if(!social)throw Error('Onchain social unavailable');return social;};
 return{
  social,socialReader:social?createSocialReader(social):null,config,client,read,write,api,approveT,
  statement:id=>read(config.registry,'AgoraRegistry','getStatement',[id]),
  pools:id=>read(config.registry,'AgoraRegistry','getPools',[id]),
  registerGoal:(goalHash,profileId,metadataURI,certificate)=>write(config.registry,'AgoraRegistry','register',[goalHash,profileId,metadataURI,certificate]),
  registerDerived:(kind,dependency,outcome,deadline,metadataURI)=>write(config.registry,'AgoraRegistry','registerDerived',[kind,dependency,outcome,deadline,metadataURI]),
  registerCustom:(operatorId,dependency,parameters,uri)=>write(config.registry,'AgoraRegistry','registerCustom',[operatorId,dependency,parameters,uri]),
  createPool:(id,fee=parseEther('.02'))=>write(config.registry,'AgoraRegistry','createPool',[id,assertBaseUnits(fee)]),
  async provideLiquidity(pool,amount){const approval=await approveT(pool,amount);const receipt=await write(pool,'FixedProductMarketMaker','addFunding',[amount,[]]);return{approval,receipt};},
  removeLiquidity:(pool,shares)=>write(pool,'FixedProductMarketMaker','removeFunding',[assertBaseUnits(shares)]),
  claimLPFees:(pool,account=wallet?.account.address)=>write(pool,'FixedProductMarketMaker','withdrawFees',[account]),
  quote,
  async previewLiquidity(pool,amount,{remove=false,owner=wallet?.account.address}={}){const snapshot=await readLiquiditySnapshot({client,pool,owner,abi:config.abis.FixedProductMarketMaker});return{snapshot,preview:remove?withdrawalPreview(snapshot,amount):fundingPreview(snapshot,amount)};},
  async buy(pool,side,amount,{slippageBps=100n,deadline}={}){if(slippageBps<0n||slippageBps>10000n)throw new Error('Invalid slippage');deadline??=(await client.getBlock()).timestamp+600n;const expected=await quote(pool,side,amount);const minimum=expected*(10000n-slippageBps)/10000n;const approval=await approveT(pool,amount);const receipt=await write(pool,'FixedProductMarketMaker','buyWithDeadline',[amount,side,minimum,deadline]);return{expected,minimum,approval,receipt};},
  async sell(pool,side,receiveT,{slippageBps=100n,deadline}={}){if(slippageBps<0n||slippageBps>10000n)throw new Error('Invalid slippage');deadline??=(await client.getBlock()).timestamp+600n;const expected=await quote(pool,side,receiveT,'sell');const maximum=(expected*(10000n+slippageBps)+9999n)/10000n;const approval=await write(config.ctf,'ConditionalTokens','setApprovalForAll',[pool,true]);const receipt=await write(pool,'FixedProductMarketMaker','sellWithDeadline',[receiveT,side,maximum,deadline]);return{expected,maximum,approval,receipt};},
  async split(conditionId,amount){const approval=await approveT(config.ctf,amount);const receipt=await write(config.ctf,'ConditionalTokens','splitPosition',[config.token,zeroHash,conditionId,[1n,2n],amount]);return{approval,receipt};},
  merge:(conditionId,amount)=>write(config.ctf,'ConditionalTokens','mergePositions',[config.token,zeroHash,conditionId,[1n,2n],assertBaseUnits(amount)]),
  submitProof:(id,outcome,certificate)=>write(config.registry,'AgoraRegistry','submitProof',[id,outcome,certificate]),
  resolveDerived:id=>write(config.registry,'AgoraRegistry','resolveDerived',[id]),
  redeem:conditionId=>write(config.ctf,'ConditionalTokens','redeemPositions',[config.token,zeroHash,conditionId,[1n,2n]]),
  async proposeAllocation(payees,shares,expiresAt){const epoch=await read(config.allocation,'AllocationController','currentEpoch');const sorted=payees.map((a,i)=>({a,s:shares[i]})).sort((a,b)=>a.a.toLowerCase().localeCompare(b.a.toLowerCase()));return write(config.allocation,'AllocationController','propose',[epoch,sorted.map(x=>x.a),sorted.map(x=>x.s),expiresAt]);},
  consent:(id,approve=true)=>write(config.allocation,'AllocationController','setApproval',[id,approve]),
  applyAllocation:id=>write(config.allocation,'AllocationController','execute',[id]),
  claimTreasuryEpoch:async epoch=>write(await read(config.allocation,'AllocationController','splits',[epoch]),'PaymentSplitter','release',[config.token,config.timelock]),
  claimEpoch:async(epoch,account=wallet?.account.address)=>write(await read(config.allocation,'AllocationController','splits',[epoch]),'PaymentSplitter','release',[config.token,account]),
  async signIn(){const {message}=await api('/auth/challenge',{method:'POST',body:{address:wallet.account.address}});const signature=await wallet.signMessage({message});const result=await api('/auth/verify',{method:'POST',body:{message,signature}});token=result.token;return{address:result.address};},
  async signOut(){await api('/auth/logout',{method:'POST'});token=undefined;},
  shelf:()=>api('/shelf'),
  saveBookmark:(id,notes)=>api(`/shelf/${id}`,{method:'PUT',body:{notes}}),
  removeBookmark:id=>api(`/shelf/${id}`,{method:'DELETE'}),
  notebook:()=>api('/notebook'),
  saveRevision:revision=>api('/notebook',{method:'POST',body:revision}),
  profile:address=>requireSocial().profile(address),
  updateProfile:data=>requireSocial().publishProfile(data),
  voteComment:(id,value)=>requireSocial().vote(id,value),
  postComment:(id,text,parentId=null)=>requireSocial().publishComment(id,text,parentId),
  runJob:input=>api('/jobs',{method:'POST',body:input}),
  additionalProfile:()=>api('/additional-profile'),
  importCertificate:(input,statementId)=>{const artifact=typeof input==='string'?parseBoundedJSON(input):input;return artifact?.format==='oncm-external-certificate-bundle-v1'?api('/certificates/import-bundle',{method:'POST',body:{bundle:input,statementId}}):api('/certificates/import',{method:'POST',body:{artifact,statementId}});},
  certificateProfile:id=>api(`/certificate-profiles/${id}`),
  jobs:()=>api('/jobs'),
  package:id=>api(`/package/${id}`),
  events:receipt=>receipt.logs.flatMap(log=>{for(const abi of Object.values(config.abis)){try{return[decodeEventLog({abi,data:log.data,topics:log.topics})];}catch{}}return[];}),
 };
}
