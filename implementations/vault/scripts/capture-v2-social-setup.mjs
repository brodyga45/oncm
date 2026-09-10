// Public historical deployment receipts and immutable bindings; read-only.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {JsonRpcProvider,Contract,AbiCoder,Interface,keccak256} from 'ethers';
import {sha256} from './monetary-bootstrap.mjs';import {SOCIAL_SCHEMAS} from '../sdk/social.mjs';
import {assertLocalConfig} from '../sdk/local-endpoints.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),config=read('.state/deployment-v2.json'),d=read('.state/social-deployment-v2.json'),old=read('.state/social-deployment.json'),prior=read('evidence/monetary-policy/deployment-261-277.json');
assertLocalConfig(config);const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1}),at={blockTag:280};
const artifact=n=>read('social/artifacts/'+n+'.json'),abis=['SchemaRegistry','EAS','VaultSocialResolver'].map(n=>new Interface(artifact(n).abi));
const same=(a,b)=>assert.equal(a.toLowerCase(),b.toLowerCase());
try{
 assert.equal((await provider.getNetwork()).chainId,31373n);assert.equal(d.chainInstance,config.chainInstance.id);same(d.statementRegistry,config.addresses.StatementRegistry);
 const receipts=[];
 for(const saved of d.receipts){const [r,t,b]=await Promise.all([provider.getTransactionReceipt(saved.hash),provider.getTransaction(saved.hash),provider.getBlock(saved.blockNumber)]),a=artifact(saved.contract);
  assert.equal(r.status,1);assert.equal(r.blockHash,saved.blockHash);same(r.contractAddress,saved.address);assert.equal(t.data.slice(0,a.bytecode.length),a.bytecode);
  const definition=a.abi.find(x=>x.type==='constructor'),decoded=AbiCoder.defaultAbiCoder().decode(definition?.inputs??[],'0x'+t.data.slice(a.bytecode.length));
  if(saved.contract==='EAS')same(decoded[0],d.schemaRegistry);
  if(saved.contract==='VaultSocialResolver'){same(decoded[0],d.eas);same(decoded[1],config.addresses.StatementRegistry);}
  const events=r.logs.map(l=>{let decoded=null;for(const abi of abis){try{const e=abi.parseLog(l);if(e){decoded={name:e.name,args:Array.from(e.args)};break;}}catch{}}return{address:l.address,index:l.index,topics:l.topics,data:l.data,decoded};});
  receipts.push({...saved,timestamp:b.timestamp,from:t.from,nonce:t.nonce,constructorArguments:Array.from(decoded),creationBytecodeMatchesPinnedArtifact:true,events});
 }
 assert.deepEqual(receipts.map(x=>x.blockNumber),[278,279,280]);
 const sr=new Contract(d.schemaRegistry,artifact('SchemaRegistry').abi,provider),eas=new Contract(d.eas,artifact('EAS').abi,provider),resolver=new Contract(d.resolver,artifact('VaultSocialResolver').abi,provider);
 same(await eas.getSchemaRegistry(at),d.schemaRegistry);same(await resolver.statementRegistry(at),config.addresses.StatementRegistry);
 const schemas={};for(const kind of ['profile','entry','vote']){const uid=await resolver[kind+'Schema'](at),record=await sr.getSchema(uid,at);assert.equal(uid,d.schemas[kind]);same(record.resolver,d.resolver);assert.equal(record.revocable,false);assert.equal(record.schema,SOCIAL_SCHEMAS[kind]);schemas[kind]={uid,resolver:record.resolver,revocable:record.revocable,schema:record.schema};}
 const codeChecks={};for(const key of ['schemaRegistry','eas','resolver']){codeChecks[key]=keccak256(await provider.getCode(d[key],280));assert.equal(codeChecks[key],d.codeHashes[key]);}
 const oldCode={};for(const key of ['schemaRegistry','eas','resolver']){const a=keccak256(await provider.getCode(old[key],277)),b=keccak256(await provider.getCode(old[key],280));assert.equal(a,b);assert.equal(a,old.codeHashes[key]);oldCode[key]={address:old[key],beforeHash:a,afterHash:b};}
 const oldHash=sha256(fs.readFileSync('.state/social-deployment.json'));assert.equal(oldHash,prior.legacy.before.files['social-deployment.json']);
 const report={format:'vault-v2-eas-setup-evidence-v1',chainId:31373,chainInstance:config.chainInstance.id,blocks:[278,279,280],addresses:{schemaRegistry:d.schemaRegistry,eas:d.eas,resolver:d.resolver,statementRegistry:d.statementRegistry},receipts,schemas,codeChecks,
  legacy:{descriptorSha256:oldHash,expectedDescriptorSha256:prior.legacy.before.files['social-deployment.json'],unchanged:true,code:oldCode},scope:'Three additive original EAS social deployments only. New resolver binds V2 registry; legacy social descriptor/code retained. No profile/comment/blog/attestation write or automatic social migration in this capture.'};
 fs.writeFileSync('evidence/monetary-policy/social-setup-278-280.json',JSON.stringify(report,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
 console.log(JSON.stringify({blocks:report.blocks,receipts:receipts.length,schemas:Object.keys(schemas),legacyDescriptorUnchanged:true,registry:d.statementRegistry},null,2));
}finally{provider.destroy();}
