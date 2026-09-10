import {network} from '../sdk/local-network.mjs';
import {loadGenericProfiles,verifyGenericCertificate} from './generic-certificates.mjs';
import {parseBoundedJSON} from '../sdk/external-bundle.mjs';
import {publishedCertificateCatalog,loadPublishedCertificate} from './published-certificates.mjs';
import {governanceSnapshot,advanceLocalTime,authorizeDevTime} from './governance-view.mjs';
import {createResearchStore} from './research.mjs';
import {packageJobs} from './package-artifacts.mjs';
import {packageProfile} from './package-profile.mjs';
import {allocationProposalView} from './allocation-view.mjs';
import {loadExternalBundle,verifyExternalArtifact} from './external-certificates.mjs';
import {createSocialSDK} from '../sdk/social.mjs';
import {createSocialReader} from '../sdk/social-read.mjs';
import {importSnapshot,fixtures,searchPalomar,importPalomar} from './imports.mjs';
import {createProofJobs,createProofWorker,registerProofJobRoutes} from './proof-jobs.mjs';
import Fastify from 'fastify';import cors from '@fastify/cors';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {createSiweMessage,parseSiweMessage} from 'viem/siwe';import {isAddress,encodeFunctionData,recoverMessageAddress} from 'viem';
import {publicClient as pc,devAccounts,devWallet,erc20Abi,parseEther,zeroAddress,zeroHash,keccak256,toHex,decodeEventLog,stringify,assertLocalChain,chain} from '../sdk/chain.mjs';import {root,artifact} from '../scripts/deploy.mjs';
const app=Fastify({logger:false,bodyLimit:2_000_000});await app.register(cors,{origin:network.webOrigin,credentials:true});app.setReplySerializer(stringify);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'.local/deployment.json')));const names=['AgoraRegistry','ConditionalTokens','FixedProductMarketMaker','AllocationController','PaymentSplitter','Safe','AgoraTimelock','TrueToken'];const abis=Object.fromEntries(names.map(n=>[n,artifact(n).abi]));
const dbPath=path.join(root,'.local/app.json');const db=fs.existsSync(dbPath)?JSON.parse(fs.readFileSync(dbPath)):{metadata:{},comments:[],jobs:[],governance:[]};const save=()=>{fs.writeFileSync(`${dbPath}.tmp`,stringify(db));fs.renameSync(`${dbPath}.tmp`,dbPath);};
const research=createResearchStore(db,save);
const socialDeployment=()=>{const f=path.join(root,'.local/social-deployment.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f)):null;};
const socialSDK=()=>{const d=socialDeployment();if(!d)throw Object.assign(Error('Onchain social deployment is not installed yet'),{statusCode:503});return createSocialSDK({client:pc,address:d.social,abi:JSON.parse(fs.readFileSync(path.join(root,'artifacts/AgoraSocial.json'))).abi});};
const socialReader=()=>createSocialReader(socialSDK());
const socialConfig=()=>{const d=socialDeployment();if(!d)return{social:null};const abi=JSON.parse(fs.readFileSync(path.join(root,'artifacts/AgoraSocial.json'))).abi;abis.AgoraSocial=abi;return{social:d.social,socialDeployment:d};};
for(const m of manifest.seedMetadata??[])db.metadata[m.uri]=m;
const nonces=new Map(),sessions=new Map();const sessionToken=req=>req.headers.authorization?.replace(/^Bearer /,'')??req.headers.cookie?.match(/agora_session=([^;]+)/)?.[1];const session=req=>{const token=sessionToken(req);const s=sessions.get(token);if(!s||s.expires<Date.now())throw Object.assign(new Error('Sign in with your wallet first'),{statusCode:401});return s;};
const read=(address,name,functionName,args=[],extra={})=>pc.readContract({address,abi:abis[name]??artifact(name).abi,functionName,args,...extra});
async function markets(){const count=Number(await read(manifest.registry,'AgoraRegistry','count'));return Promise.all(Array.from({length:count},async(_,i)=>{const id=await read(manifest.registry,'AgoraRegistry','statementIds',[BigInt(i)]);const s=await read(manifest.registry,'AgoraRegistry','getStatement',[id]);const addresses=await read(manifest.registry,'AgoraRegistry','getPools',[id]);const ids=await read(manifest.registry,'AgoraRegistry','positionIds',[id]);const pools=await Promise.all(addresses.map(async address=>{const [balances,totalSupply,fee]=await Promise.all(['getPoolBalances','totalSupply','fee'].map(fn=>read(address,'FixedProductMarketMaker',fn)));return{address,balances,totalSupply,fee};}));return {...s,metadata:db.metadata[s.metadataURI]??{title:`Statement ${id.slice(0,10)}`,description:'Content-addressed source is not in this local metadata store.'},positionIds:ids,pools};}));}
app.get('/api/health',async()=>({ok:true,chainId:await pc.getChainId(),block:await pc.getBlockNumber()}));
app.get('/api/config',async()=>({...socialConfig(),...JSON.parse(fs.readFileSync(path.join(root,'.local/deployment.json'))),abis,devnet:true,roles:['Curator · council · beneficiary','Reviewer · council · beneficiary','Mathematician','Liquidity provider','Trader','Research guest'],proofAvailable:fs.existsSync(path.join(root,'proof/runner.mjs'))&&manifest.proofStatus==='real'}));
app.get('/api/fixtures',async()=>fixtures(root));
app.get('/api/published-certificates/:id',async req=>loadPublishedCertificate(root,req.params.id));
app.get('/api/additional-profile',async()=>{
 const bundle=loadExternalBundle(root),file=path.join(root,'.local/additional-profile.json');
 const deployed=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};
 const state=await read(manifest.registry,'AgoraRegistry','profiles',[bundle.profile.profileId]);
 return{...deployed,profileId:bundle.profile.profileId,imageId:bundle.profile.imageId,label:'perf05 · zero-axiom propositional logic',permittedAxioms:[],nativeRunner:false,enabled:state[2]&&state[0].toLowerCase()===deployed.bridge?.toLowerCase(),registrationArtifact:bundle.registration,publishedCertificates:publishedCertificateCatalog(root),fixtures:bundle.fixtures};
});
app.post('/api/certificates/import',async req=>{
 const bundle=loadExternalBundle(root),file=path.join(root,'.local/additional-profile.json');
 if(!fs.existsSync(file))throw Error('Additional profile bridge has not been deployed');
 const deployed=JSON.parse(fs.readFileSync(file));
 const statement=req.body?.statementId?await read(manifest.registry,'AgoraRegistry','getStatement',[req.body.statementId]):undefined;
 const bridgeAbi=JSON.parse(fs.readFileSync(path.join(root,'proof/artifacts/LeanProofBridge.json'))).abi;
 const result=await verifyExternalArtifact(req.body?.artifact,{bundle,statement:statement?{id:req.body.statementId,...statement}:undefined,bridge:deployed.bridge,abi:bridgeAbi,client:pc});
 const state=await read(manifest.registry,'AgoraRegistry','profiles',[result.profileId]);
 return{...result,enabled:state[2]&&state[0].toLowerCase()===deployed.bridge.toLowerCase()};
});
app.get('/api/certificate-profiles/:id',async req=>{
 const p=loadGenericProfiles(root).find(p=>p.trustedProfile.profileId.toLowerCase()===req.params.id.toLowerCase());if(!p)throw Error('Unsupported certificate profile');
 const [bridge,manifestHash,enabled]=await read(manifest.registry,'AgoraRegistry','profiles',[p.trustedProfile.profileId]);
 const installed=!!p.bridge&&bridge.toLowerCase()===p.bridge.toLowerCase()&&manifestHash.toLowerCase()===p.manifestHash?.toLowerCase();return{profileId:p.trustedProfile.profileId,label:p.name,imageId:p.trustedProfile.imageId,bridge,installed,enabled:installed&&enabled};
});
// This encapsulated route keeps the normal API cap unchanged, and catches duplicate
// JSON keys before Fastify's default JSON parser could discard them.
await app.register(async route=>{
 route.removeContentTypeParser('application/json');route.addContentTypeParser('application/json',{parseAs:'string'},(_req,raw,done)=>{try{done(null,parseBoundedJSON(raw,3*1024*1024));}catch(e){done(e);}});
 route.post('/api/certificates/import-bundle',{bodyLimit:3*1024*1024},async req=>{
  const {bundle,statementId}=req.body??{};const blockNumber=await pc.getBlockNumber();const statement=statementId?await read(manifest.registry,'AgoraRegistry','getStatement',[statementId],{blockNumber}):undefined;
  const bridgeAbi=JSON.parse(fs.readFileSync(path.join(root,'proof/artifacts/LeanProofBridge.json'))).abi;
  return verifyGenericCertificate(bundle,{profiles:loadGenericProfiles(root),client:pc,registry:manifest.registry,registryAbi:abis.AgoraRegistry,bridgeAbi,blockNumber,statement:statement?{id:statementId,...statement}:undefined});
 });
});
app.post('/api/import/snapshot',async req=>importSnapshot(String(req.body?.url??'')));
app.get('/api/operators',async()=>{const n=Number(await read(manifest.registry,'AgoraRegistry','operatorCount'));return Promise.all(Array.from({length:n},async(_,i)=>{const id=await read(manifest.registry,'AgoraRegistry','operatorIds',[BigInt(i)]);const [evaluator,manifestHash]=await read(manifest.registry,'AgoraRegistry','operators',[id]);return{id,evaluator,manifestHash};}));});
app.get('/api/markets',async()=>({markets:await markets(),observedBlock:await pc.getBlockNumber()}));
app.get('/api/portfolio/:address',async req=>{const a=req.params.address;if(!isAddress(a))throw new Error('Invalid address');const ms=await markets();return{eth:await pc.getBalance({address:a}),t:await pc.readContract({address:manifest.token,abi:erc20Abi,functionName:'balanceOf',args:[a]}),positions:await Promise.all(ms.map(async m=>({...m,yes:await read(manifest.ctf,'ConditionalTokens','balanceOf',[a,m.positionIds[0]]),no:await read(manifest.ctf,'ConditionalTokens','balanceOf',[a,m.positionIds[1]]),lp:await Promise.all(m.pools.map(async p=>({pool:p.address,balance:await read(p.address,'FixedProductMarketMaker','balanceOf',[a])})))})))};});
app.post('/api/faucet',async req=>{await assertLocalChain();const address=req.body?.address;if(!isAddress(address))throw new Error('Valid local address required');const w=devWallet(0);const hash=await w.writeContract({address:manifest.token,abi:erc20Abi,functionName:'transfer',args:[address,parseEther('1000')]});await pc.waitForTransactionReceipt({hash});const gas=await w.sendTransaction({to:address,value:parseEther('1')});await pc.waitForTransactionReceipt({hash:gas});return{hash,gas,notice:'Public test tokens on Agora chain 31371 only'};});
app.post('/api/metadata',{bodyLimit:3*1024*1024},async req=>{const {title,source='',description='',tag='Foundations',externalRef=null,goalHash=null,files={},fixtureId=null,provenance=null,externalCertificate=null}=req.body??{};if(!title||title.length>180||typeof source!=='string'||Buffer.byteLength(source,'utf8')>512*1024||description.length>10000)throw new Error('Title or source length is invalid');if(stringify(files).length>500000)throw new Error('Package file set too large');if(externalCertificate&&stringify(externalCertificate).length>8192)throw Error('External provenance too large');const m={title,source,description,tag,externalRef,files,fixtureId,provenance,...externalCertificate&&{externalCertificate:{...externalCertificate,sourceGoalRelation:'not-verified'}},sourceHash:keccak256(toHex(source)),goalHash,createdAt:new Date().toISOString()};const uri=`agora:${keccak256(toHex(stringify(m)))}`;db.metadata[uri]=m;save();return{uri,...m};});
app.get('/api/package/:id',async req=>{
 const m=(await markets()).find(x=>x.id===req.params.id);if(!m)throw new Error('Unknown statement');
 const source=m.metadata.source??m.metadata.goal??'';const files={...m.metadata.files,'Statement.lean':source};
 const owner=sessionToken(req)?session(req).address:undefined;
 const completed=packageJobs(db.jobs,m,owner);
 const artifacts=completed.map(j=>({action:j.input.action,source:j.input.source,result:j.result}));
 const profile=packageProfile(root,m.profileId,loadGenericProfiles(root));
 return {schemaVersion:2,sourceFile:'Statement.lean',statementId:m.id,goalHash:m.goalHash,profileId:m.profileId,source,metadata:m.metadata,chainId:31371,conditionId:m.conditionId,files,fileHashes:Object.fromEntries(Object.entries(files).map(([name,content])=>[name,keccak256(toHex(content))])),profile,artifacts,registrationCertificate:completed.find(j=>j.input.action==='register')?.result.registrationCertificate,warning:'Public statement files and commitments are exported. Completed job artifacts are included only for their signed-in owner; sign in to include your own results. A profile-specific checker and its pinned dependencies are required to reproduce the proof; a registry label is not settlement evidence.'};
});
app.post('/api/auth/challenge',async req=>{const address=req.body?.address;if(!isAddress(address))throw new Error('Invalid address');const nonce=crypto.randomBytes(16).toString('hex');const message=createSiweMessage({address,chainId:31371,domain:network.webDomain,uri:network.webOrigin,version:'1',nonce,issuedAt:new Date(),expirationTime:new Date(Date.now()+600000),statement:'Sign in to Agora private research and proof jobs. This does not authorize blockchain transactions.'});nonces.set(nonce,{address,message,expires:Date.now()+600000});return{message};});
app.post('/api/auth/verify',async(req,reply)=>{const {message,signature}=req.body;const p=parseSiweMessage(message);const record=nonces.get(p.nonce);if(!record||record.message!==message||record.expires<Date.now())throw new Error('Expired or unknown sign-in challenge');nonces.delete(p.nonce);if(p.chainId!==31371||p.uri!==network.webOrigin||!await pc.verifySiweMessage({message,signature,domain:network.webDomain,nonce:p.nonce,address:record.address}))throw new Error('Invalid sign-in signature');const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{address:record.address,expires:Date.now()+3600000});reply.header('set-cookie',`agora_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);return{address:record.address,token};});
app.get('/api/auth/session',async req=>session(req));app.post('/api/auth/logout',async(req,reply)=>{sessions.delete(sessionToken(req));reply.header('set-cookie','agora_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return{ok:true};});
app.get('/api/shelf',async req=>research.shelf(session(req).address));
app.put('/api/shelf/:id',async req=>{const address=session(req).address;await read(manifest.registry,'AgoraRegistry','getStatement',[req.params.id]);return research.saveBookmark(address,req.params.id,req.body);});
app.delete('/api/shelf/:id',async req=>research.removeBookmark(session(req).address,req.params.id));
app.get('/api/notebook',async req=>research.revisions(session(req).address));
app.post('/api/notebook',async req=>research.saveRevision(session(req).address,req.body));
const socialOptions=req=>({viewer:isAddress(req.query.viewer??'')?req.query.viewer:undefined,cursor:Number(req.query.cursor??0),limit:Math.min(10,Number(req.query.limit??10)),sort:req.query.sort==='new'?'new':'top'});
app.get('/api/profiles/:address',async req=>socialReader().profile(req.params.address,req.query.version===undefined?{}:{version:req.query.version}));
app.get('/api/comments/:id',async req=>socialReader().discussion(req.params.id,socialOptions(req)));
app.get('/api/social/posts/:id',async req=>socialSDK().post(req.params.id,{viewer:req.query.viewer}));
app.get('/api/social/posts/:id/replies',async req=>socialReader().children(req.params.id,socialOptions(req)));
app.get('/api/social/posts/:id/history',async req=>socialSDK().revisionHistory(req.params.id,socialOptions(req)));
app.get('/api/social/posts/:id/votes',async req=>socialSDK().voteHistory(req.params.id,socialOptions(req)));
app.get('/api/social/posts/:id/visibility',async req=>socialSDK().visibilityHistory(req.params.id,socialOptions(req)));
app.get('/api/social/blogs/:address',async req=>socialReader().blogs(req.params.address,socialOptions(req)));
app.get('/api/social/rebuild',async req=>socialReader().rebuild(socialOptions(req)));
const directSocialWrite=async()=>{throw Object.assign(Error('Social writes are wallet transactions to AgoraSocial. Legacy offchain records remain an archive and are not migrated as signed posts.'),{statusCode:410});};
app.put('/api/profiles/me',directSocialWrite);app.post('/api/comments/:id',directSocialWrite);app.post('/api/comments/:id/vote',directSocialWrite);app.patch('/api/comments/:id',directSocialWrite);
const proofJobs=createProofJobs({db,save,execute:createProofWorker(root)});
registerProofJobRoutes(app,{jobs:proofJobs,session});
app.get('/api/allocations',async req=>{
 const block=await pc.getBlock();const blockNumber=block.number;
 const at=(address,name,fn,args=[])=>read(address,name,fn,args,{blockNumber});
 const epoch=Number(await at(manifest.allocation,'AllocationController','currentEpoch'));
 const recipients=await at(manifest.allocation,'AllocationController','recipients');
 const n=Number(await at(manifest.allocation,'AllocationController','proposalCount'));
 // AllocationApplied records preserve the exact old recipients, including removed
 // beneficiaries. Reading only today's recipients would misdescribe stale proposals.
 const applied=await pc.getContractEvents({address:manifest.allocation,abi:abis.AllocationController,eventName:'AllocationApplied',fromBlock:0n,toBlock:blockNumber});
 const baselines=new Map(applied.map(event=>[String(event.args.epoch),{payees:event.args.payees,shares:event.args.shares}]));
 baselines.set(String(epoch),{payees:recipients[0],shares:recipients[1]});
 const proposals=await Promise.all(Array.from({length:n},async(_,i)=>{
  const p=await at(manifest.allocation,'AllocationController','proposal',[BigInt(i)]);
  const baseline=baselines.get(String(p.baseVersion));if(!baseline)throw Error('Allocation baseline unavailable; refresh from an archive RPC');
  const approvals=await Promise.all(baseline.payees.map(a=>at(manifest.allocation,'AllocationController','approved',[BigInt(i),a])));
  return allocationProposalView({id:i,...p},baseline,approvals,{epoch,timestamp:block.timestamp});
 }));
 const epochs=await Promise.all(Array.from({length:epoch+1},async(_,i)=>{
  const split=await at(manifest.allocation,'AllocationController','splits',[BigInt(i)]);
  const balance=await pc.readContract({address:manifest.token,abi:erc20Abi,functionName:'balanceOf',args:[split],blockNumber});
  let claimable=0n;if(req.query.account&&isAddress(req.query.account))claimable=await at(split,'PaymentSplitter','releasable',[manifest.token,req.query.account]);
  return{epoch:i,split,balance,claimable};
 }));
 return{epoch,recipients:recipients[0],shares:recipients[1],proposals,epochs,observedBlock:blockNumber,observedBlockHash:block.hash,observedAt:block.timestamp};
});
const currentGovernance=()=>governanceSnapshot({client:pc,read,manifest,proposals:db.governance,rpcUrl:chain.rpcUrls.default.http[0]});
app.get('/api/governance',currentGovernance);
app.post('/api/dev/advance-time',async req=>{authorizeDevTime(req,session);return advanceLocalTime({client:pc,rpcUrl:chain.rpcUrls.default.http[0]});});
app.post('/api/governance',async req=>{const author=session(req).address;const b=req.body;const data=b.kind==='operator'?encodeFunctionData({abi:abis.AgoraRegistry,functionName:'configureOperator',args:[b.profileId,b.verifier,b.manifestHash]}):b.kind==='disable'?encodeFunctionData({abi:abis.AgoraRegistry,functionName:'setProfileEnabled',args:[b.profileId,!!b.enabled]}):encodeFunctionData({abi:abis.AgoraRegistry,functionName:'configureProfile',args:[b.profileId,b.verifier,b.manifestHash]});const salt=keccak256(toHex(crypto.randomUUID()));const target=manifest.registry;const delay=await read(manifest.timelock,'AgoraTimelock','getMinDelay');const scheduleData=encodeFunctionData({abi:abis.AgoraTimelock,functionName:'schedule',args:[target,0n,data,zeroHash,salt,delay]});const nonce=await read(manifest.safe,'Safe','nonce');const safeArgs=[manifest.timelock,0n,scheduleData,0,0n,0n,0n,zeroAddress,zeroAddress,nonce];const hash=await read(manifest.safe,'Safe','getTransactionHash',safeArgs);const operationId=await read(manifest.timelock,'AgoraTimelock','hashOperation',[target,0n,data,zeroHash,salt]);const p={id:crypto.randomUUID(),title:String(b.title??'Protocol profile change'),author,target,data,salt,operationId,scheduleData,nonce:nonce.toString(),safeHash:hash,signatures:[],createdAt:new Date().toISOString()};db.governance.push(p);save();return p;});
app.post('/api/governance/:id/signatures',async req=>{const p=db.governance.find(x=>x.id===req.params.id);if(!p)throw new Error('Unknown proposal');const address=await recoverMessageAddress({message:{raw:p.safeHash},signature:req.body.signature});if(!manifest.council.some(a=>a.toLowerCase()===address.toLowerCase()))throw new Error('Council signature required');p.signatures=p.signatures.filter(s=>s.address.toLowerCase()!==address.toLowerCase());p.signatures.push({address,signature:req.body.signature});save();return p;});
app.get('/api/activity',async req=>{socialConfig();const head=await pc.getBlockNumber();const from=BigInt(req.query.from??(head>50n?head-50n:0n));const to=from+50n<head?from+50n:head;const blocks=[];for(let number=to;number>=from;--number){const block=await pc.getBlock({blockNumber:number,includeTransactions:true});const txs=await Promise.all(block.transactions.map(async tx=>{const receipt=await pc.getTransactionReceipt({hash:tx.hash});const events=receipt.logs.map(log=>{for(const [contract,abi]of Object.entries(abis)){try{const e=decodeEventLog({abi,data:log.data,topics:log.topics});return{address:log.address,event:e.eventName,args:e.args,contract,logIndex:log.logIndex};}catch{}}return{address:log.address,event:'Raw log',topics:log.topics,data:log.data,logIndex:log.logIndex};});const changes=[];for(const e of events){if(e.event==='Transfer')changes.push({asset:e.address,from:e.args.from,to:e.args.to,amount:e.args.value});if(e.event==='TransferSingle')changes.push({asset:e.address,positionId:e.args.id,from:e.args.from,to:e.args.to,amount:e.args.value});if(e.event==='TransferBatch')e.args.ids.forEach((id,i)=>changes.push({asset:e.address,positionId:id,from:e.args.from,to:e.args.to,amount:e.args.values[i]}));}const deltas=new Map();const add=(asset,positionId,address,delta)=>{if(address===zeroAddress)return;const key=`${asset}/${positionId??''}/${address.toLowerCase()}`;const d=deltas.get(key)??{asset,positionId,address,delta:0n};d.delta+=BigInt(delta);deltas.set(key,d);};for(const c of changes){add(c.asset,c.positionId,c.from,-BigInt(c.amount));add(c.asset,c.positionId,c.to,c.amount);}add('ETH',null,tx.from,-(tx.value+receipt.gasUsed*receipt.effectiveGasPrice));if(tx.to&&tx.value)add('ETH',null,tx.to,tx.value);return{balanceDeltas:[...deltas.values()].filter(d=>d.delta!==0n),hash:tx.hash,actor:tx.from,to:tx.to,value:tx.value,status:receipt.status,gasUsed:receipt.gasUsed,gasCost:receipt.gasUsed*receipt.effectiveGasPrice,events,changes};}));blocks.push({number,hash:block.hash,timestamp:block.timestamp,transactions:txs});if(number===0n)break;}return{head,blocks};});
app.get('/api/palomar',async req=>searchPalomar(String(req.query.q??'').slice(0,200)));
app.post('/api/import/palomar',async req=>importPalomar(String(req.body.id),Number(req.body.version)));
app.setErrorHandler((error,req,reply)=>reply.code(error.statusCode??400).send({error:error.shortMessage??error.message,details:error.details??''}));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{app.close().then(()=>process.exit(signal==='SIGINT'?130:143),error=>{console.error(error);process.exit(1);});});
await app.listen({port:network.apiPort,host:'127.0.0.1'});console.log('Agora API listening on '+network.apiUrl);
