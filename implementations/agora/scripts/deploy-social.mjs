// Additive local-only deployment. Never invokes the protocol deployment/reset script.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {publicClient,devWallet,assertLocalChain,stringify,keccak256} from '../sdk/chain.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));const target=path.join(root,'.local/social-deployment.json');
await assertLocalChain();const manifest=JSON.parse(fs.readFileSync(path.join(root,'.local/deployment.json')));
if(manifest.chainId!==31371||!['127.0.0.1','localhost','[::1]'].includes(new URL(manifest.rpc).hostname))throw Error('Only Agora local chain is allowed');
if(fs.existsSync(target))throw Error('Social deployment already recorded; never silently replace');
const artifact=JSON.parse(fs.readFileSync(path.join(root,'artifacts/AgoraSocial.json'))),wallet=devWallet(0);
if(!await publicClient.getCode({address:manifest.registry}))throw Error('Existing registry required');
const before=await publicClient.getBlockNumber();const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode,args:[manifest.registry]});
const receipt=await publicClient.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw Error('Deployment reverted');
const social=receipt.contractAddress,registry=await publicClient.readContract({address:social,abi:artifact.abi,functionName:'registry'});
if(registry.toLowerCase()!==manifest.registry.toLowerCase())throw Error('Registry binding mismatch');
const output={schema:'agora-social-deployment-v1',chainId:31371,social,registry,transactionHash:hash,blockNumber:String(receipt.blockNumber),beforeBlock:String(before),gasUsed:String(receipt.gasUsed),runtimeHash:keccak256(await publicClient.getCode({address:social})),sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'contracts/AgoraSocial.sol'))).digest('hex'),compiler:artifact.compiler,storage:'Solady SSTORE2 0.1.26',createdAt:new Date().toISOString()};
fs.writeFileSync(target,stringify(output)+'\n',{flag:'wx'});console.log(stringify(output));
