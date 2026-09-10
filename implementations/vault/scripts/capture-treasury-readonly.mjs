import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {JsonRpcProvider} from 'ethers';
import {createSDK} from '../sdk/index.mjs';
const config=JSON.parse(await fs.readFile('.state/deployment.json','utf8'));
const abis=JSON.parse(await fs.readFile('.state/abis.json','utf8'));
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
const sdk=createSDK(config,abis,provider),head=await provider.getBlock('latest');
assert.equal((await provider.getNetwork()).chainId,31373n);
const at={blockTag:head.number},allocation=sdk.allocation;
const epoch=await allocation.epoch(at),active=await allocation.allocation(epoch,at),proposal=await allocation.proposal(1,at);
const snapshot=await sdk.treasury.snapshot([config.addresses.TrueToken]);
const dao20=sdk.treasury.allocation20({epoch:String(epoch),recipients:[...active.recipients],weights:[...active.weights].map(String)});
const consentData=allocation.interface.encodeFunctionData('setConsent',[1,true]);
const consentPreflight=await sdk.governancePreflight(config.addresses.AllocationController,consentData);
const result={capturedAt:new Date().toISOString(),scope:'read-only; no signer, sends, funding or chain changes',chainId:31373,
 chainInstance:config.chainInstance.id,blockNumber:head.number,blockHash:head.hash,snapshot,dao20,
 existingProposal1:{baseEpoch:String(proposal.baseEpoch),applied:proposal.applied,recipients:[...proposal.recipients],weights:[...proposal.weights].map(String),
 consents:await Promise.all(active.recipients.map(async recipient=>({recipient,approved:await allocation.consent(1,recipient,at)})))},
 consentPreflight};
try{await sdk.treasury.prepare({kind:'consent',proposalId:'1',approved:true});result.prepareConsent={unexpectedSuccess:true};}
catch(e){result.prepareConsent={rejected:true,error:e.shortMessage||e.message};}
try{await sdk.treasury.prepare({kind:'transfer',token:config.addresses.TrueToken,recipient:config.accounts[2],amount:'10000000000000000'});result.prepareTransfer={unexpectedSuccess:true};}
catch(e){result.prepareTransfer={rejected:true,error:e.shortMessage||e.message};}
const end=await provider.getBlock('latest');assert.equal(end.hash,head.hash);result.headUnchanged=true;
await fs.mkdir('evidence/treasury',{recursive:true});await fs.writeFile('evidence/treasury/readonly-rpc.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({blockNumber:head.number,treasury:snapshot.treasury,dao20,consentData,prepareConsent:result.prepareConsent,prepareTransfer:result.prepareTransfer,headUnchanged:true},null,2));
provider.destroy();
