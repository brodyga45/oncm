import {network} from '../sdk/local-network.mjs';
import {ensureProofBootstrap} from './proof-bootstrap.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {decodeEventLog,encodeFunctionData,encodeAbiParameters,keccak256,toHex,zeroAddress,zeroHash,parseEther} from 'viem';
import {publicClient,devWallet,devAccounts,assertLocalChain,stringify} from '../sdk/chain.mjs';
export const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const artifact=name=>JSON.parse(fs.readFileSync(path.join(root,'artifacts',`${name}.json`),'utf8'));
export async function deployStack(client=publicClient,wallet=devWallet(),accounts=devAccounts.map(a=>a.address),{mock=false,seed=true}={}){
 await assertLocalChain(client);if(!mock)ensureProofBootstrap(root);const deployed={};
 const deploy=async(name,args=[])=>{const a=artifact(name);const hash=await wallet.deployContract({abi:a.abi,bytecode:a.bytecode,args,gas:25_000_000n});const r=await client.waitForTransactionReceipt({hash});if(r.status!=='success')throw new Error(`Deploy failed: ${name}`);deployed[name]={address:r.contractAddress,tx:hash,block:r.blockNumber.toString()};return r.contractAddress;};
 const write=async(address,name,method,args=[])=>{const hash=await wallet.writeContract({address,abi:artifact(name).abi,functionName:method,args,gas:15_000_000n});const r=await client.waitForTransactionReceipt({hash});if(r.status!=='success')throw new Error(`Call failed: ${method}`);return r;};
 const token=await deploy('TrueToken',[accounts]);const ctf=await deploy('ConditionalTokens');
 const allocationList=[{a:accounts[0],s:600000n},{a:accounts[1],s:400000n}].sort((a,b)=>a.a.toLowerCase().localeCompare(b.a.toLowerCase()));
 const allocation=await deploy('AllocationController',[allocationList.map(x=>x.a),allocationList.map(x=>x.s)]);
 const factory=await deploy('AgoraFPMMFactory',[allocation]);const singleton=await deploy('Safe');const proxyFactory=await deploy('SafeProxyFactory');
 const init=encodeFunctionData({abi:artifact('Safe').abi,functionName:'setup',args:[[accounts[0],accounts[1]],2n,zeroAddress,'0x',zeroAddress,zeroAddress,0n,zeroAddress]});
 const safeReceipt=await write(proxyFactory,'SafeProxyFactory','createProxyWithNonce',[singleton,init,BigInt(Date.now())]);
 const safe=safeReceipt.logs.map(l=>{try{return decodeEventLog({abi:artifact('SafeProxyFactory').abi,data:l.data,topics:l.topics});}catch{return null;}}).find(e=>e?.eventName==='ProxyCreation').args.proxy;
 const timelock=await deploy('AgoraTimelock',[5n,[safe],[zeroAddress]]);
 let profileId=keccak256(toHex(mock?'AGORA_TEST_PROFILE_V1':'AGORA_PENDING_REAL_LEAN_PROFILE_V1'));let verifier;let profileManifest=keccak256(toHex(mock?'TEST_ONLY':'UNAVAILABLE'));let proofStatus=mock?'test-only':'unavailable';
 const proofDescriptor=path.join(root,'proof','deployment.json');
 if(!mock&&fs.existsSync(proofDescriptor)){
  const d=JSON.parse(fs.readFileSync(proofDescriptor,'utf8'));const a=JSON.parse(fs.readFileSync(path.resolve(root,'proof',d.artifact),'utf8'));const h=await wallet.deployContract({abi:a.abi,bytecode:a.bytecode,args:d.args??[],gas:25_000_000n});const r=await client.waitForTransactionReceipt({hash:h});if(r.status!=='success')throw new Error('Real proof bridge deployment failed');verifier=r.contractAddress;profileId=d.profileId;profileManifest=typeof d.manifest==='string'&&/^0x[0-9a-f]{64}$/i.test(d.manifest)?d.manifest:keccak256(toHex(stringify(d.manifest??d)));proofStatus='real';
 }else verifier=await deploy(mock?'TestProofVerifier':'UnavailableProofVerifier');
 const registry=await deploy('AgoraRegistry',[ctf,token,factory,timelock,profileId,verifier,profileManifest]);
 const operatorCandidate=await deploy('ResolvedAfterOperator');
 const manifest={app:'Agora',chainId:31371,rpc:network.rpcUrl,deployedAt:new Date().toISOString(),token,ctf,allocation,factory,safe,timelock,registry,verifier,profileId,profileManifest,operatorCandidate,proofStatus,council:accounts.slice(0,2),accounts,deployed,startBlock:'0',mock};
 if(seed&&mock){
  const seeds=[{title:'Infinitely many prime numbers',goal:'theorem infinitely_many_primes : ∀ n : ℕ, ∃ p > n, Nat.Prime p := by\n  sorry',description:'Euclid’s theorem, expressed as an unbounded supply of primes. The registered goal is immutable; a future certificate must match it exactly.',tag:'Number theory'},{title:'A small step toward a formal proof',goal:'theorem one_add_one : 1 + 1 = (2 : Nat) := by\n  decide',description:'A compact statement for following the complete workflow from a Lean source package to a verified onchain result.',tag:'Foundations'}];
  for(const [i,m] of seeds.entries()){const goalHash=keccak256(toHex(m.goal));const uri=`agora:seed:${i}`;await write(registry,'AgoraRegistry','register',[goalHash,profileId,uri,encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[goalHash,profileId])]);const id=keccak256(encodeAbiParameters([{type:'string'},{type:'bytes32'},{type:'bytes32'}],['AGORA_GOAL_V1',goalHash,profileId]));await write(registry,'AgoraRegistry','createPool',[id,parseEther('0.02')]);const pools=await client.readContract({address:registry,abi:artifact('AgoraRegistry').abi,functionName:'getPools',args:[id]});await write(token,'TrueToken','approve',[pools[0],parseEther('500')]);await write(pools[0],'FixedProductMarketMaker','addFunding',[parseEther('500'),[]]);m.id=id;m.uri=uri;m.goalHash=goalHash;}
  manifest.seedMetadata=seeds;
 }
 return manifest;
}
export async function deploy(){const m=await deployStack();fs.mkdirSync(path.join(root,'.local'),{recursive:true});fs.writeFileSync(path.join(root,'.local/deployment.json'),stringify(m));console.log(`Agora deployed on 31371: ${m.registry} (proof: ${m.proofStatus})`);return m;}
if(process.argv[1]===fileURLToPath(import.meta.url))await deploy();
