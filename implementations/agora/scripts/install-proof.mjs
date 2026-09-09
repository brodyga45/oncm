// Local devnet convenience: deploy a new pinned proof bridge, then use the
// actual two-owner Safe and Timelock to register it and retire the old profile.
import fs from 'node:fs';import path from 'node:path';
import {encodeFunctionData,keccak256,toHex,concatHex,zeroAddress,zeroHash} from 'viem';
import {root,artifact} from './deploy.mjs';
import {publicClient as pc,devWallet,devAccounts,assertLocalChain,stringify} from '../sdk/chain.mjs';
await assertLocalChain();
const manifestPath=path.join(root,'.local/deployment.json');const m=JSON.parse(fs.readFileSync(manifestPath));const descriptor=JSON.parse(fs.readFileSync(path.join(root,'proof/deployment.json')));
if(m.profileId===descriptor.profileId){console.log('This proof profile is already the configured default.');process.exit(0);}
const a=JSON.parse(fs.readFileSync(path.resolve(root,'proof',descriptor.artifact)));const w=devWallet(0);
const read=(address,name,fn,args=[])=>pc.readContract({address,abi:artifact(name).abi,functionName:fn,args});
const send=async(address,name,fn,args=[])=>{const {request}=await pc.simulateContract({address,abi:artifact(name).abi,functionName:fn,args,account:w.account});const hash=await w.writeContract(request);const receipt=await pc.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error(`${fn} reverted`);console.log(`${fn}: block ${receipt.blockNumber} tx ${hash}`);return receipt;};
const bridgeHash=await w.deployContract({abi:a.abi,bytecode:a.bytecode,args:descriptor.args,gas:25_000_000n});const bridge=await pc.waitForTransactionReceipt({hash:bridgeHash});if(bridge.status!=='success')throw new Error('Proof bridge deployment failed');
const profileManifest=typeof descriptor.manifest==='string'?descriptor.manifest:keccak256(toHex(stringify(descriptor.manifest??descriptor)));
const targets=[m.registry,m.registry],values=[0n,0n],payloads=[encodeFunctionData({abi:artifact('AgoraRegistry').abi,functionName:'configureProfile',args:[descriptor.profileId,bridge.contractAddress,profileManifest]}),encodeFunctionData({abi:artifact('AgoraRegistry').abi,functionName:'setProfileEnabled',args:[m.profileId,false]})];const salt=keccak256(toHex(`Agora proof upgrade ${descriptor.profileId}`));const delay=await read(m.timelock,'AgoraTimelock','getMinDelay');
const schedule=encodeFunctionData({abi:artifact('AgoraTimelock').abi,functionName:'scheduleBatch',args:[targets,values,payloads,zeroHash,salt,delay]});const params=[m.timelock,0n,schedule,0,0n,0n,0n,zeroAddress,zeroAddress];const nonce=await read(m.safe,'Safe','nonce');const safeHash=await read(m.safe,'Safe','getTransactionHash',[...params,nonce]);
const signatures=await Promise.all([0,1].map(async i=>{const signature=await devWallet(i).signMessage({message:{raw:safeHash}});return{address:devAccounts[i].address,signature:`${signature.slice(0,-2)}${(parseInt(signature.slice(-2),16)+4).toString(16)}`};}));signatures.sort((a,b)=>a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
const scheduled=await send(m.safe,'Safe','execTransaction',[...params,concatHex(signatures.map(s=>s.signature))]);
const operationId=await read(m.timelock,'AgoraTimelock','hashOperationBatch',[targets,values,payloads,zeroHash,salt]);const readyAt=await read(m.timelock,'AgoraTimelock','getTimestamp',[operationId]);const waitMilliseconds=Math.max(0,Number(readyAt)*1000-Date.now()+1200);if(waitMilliseconds>60000)throw new Error('Timelock exceeds one-minute local script window; execute the scheduled operation separately');if(waitMilliseconds)await new Promise(resolve=>setTimeout(resolve,waitMilliseconds));
await pc.request({method:'evm_mine',params:[]});
const executed=await send(m.timelock,'AgoraTimelock','executeBatch',[targets,values,payloads,zeroHash,salt]);
const oldProfile=m.profileId;Object.assign(m,{verifier:bridge.contractAddress,profileId:descriptor.profileId,profileManifest,proofStatus:'real'});m.proofUpgrades??=[];m.proofUpgrades.push({oldProfile,newProfile:m.profileId,bridgeTx:bridgeHash,scheduleTx:scheduled.transactionHash,executeTx:executed.transactionHash,operationId});fs.writeFileSync(manifestPath,stringify(m));
console.log(`Activated ${m.profileId}; old profile registration retired. Refresh the website to load the new default.`);
