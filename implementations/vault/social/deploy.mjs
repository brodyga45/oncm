import {assertLocalConfig} from '../sdk/local-endpoints.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ContractFactory,Contract,JsonRpcProvider,HDNodeWallet,NonceManager,keccak256,toUtf8Bytes} from 'ethers';
import {createSDK} from '../sdk/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(fs.readFileSync(path.join(root,'.state/deployment.json')));
assertLocalConfig(config);
const provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
const file=path.join(root,'.state/social-deployment.json');
const artifact=n=>JSON.parse(fs.readFileSync(path.join(root,'social/artifacts',n+'.json')));
async function protectedState() {
  const abis=JSON.parse(fs.readFileSync(path.join(root,'.state/abis.json'))),sdk=createSDK(config,abis,provider);
  const statements=await sdk.statements(),pools=await sdk.pools();
  const profiles=Object.fromEntries(await Promise.all([...new Set([config.proof.profileId,...statements.filter(s=>s.kind===0).map(s=>s.profileId)])].map(async id=>[id,[...await sdk.registry.profiles(id)]])));
  const codeHashes=Object.fromEntries(await Promise.all(Object.entries(config.addresses).map(async([name,a])=>[name,keccak256(await provider.getCode(a))])));
  return JSON.parse(JSON.stringify({chainInstance:config.chainInstance.id,statements,pools,profiles,codeHashes},(_,v)=>typeof v==='bigint'?v.toString():v));
}
try {
  if((await provider.getNetwork()).chainId!==31373n)throw Error('Wrong chain');
  if(await provider.getCode(config.addresses.StatementRegistry)==='0x')throw Error('Existing StatementRegistry absent; never reset/recreate markets');
  if(fs.existsSync(file)) {
    const old=JSON.parse(fs.readFileSync(file));
    if(old.chainInstance!==config.chainInstance.id||old.statementRegistry!==config.addresses.StatementRegistry)throw Error('Existing social descriptor from another chain; explicit migration required');
    for(const [key,hash] of Object.entries(old.codeHashes)) if(keccak256(await provider.getCode(old[key]))!==hash)throw Error('Existing social runtime mismatch '+key);
    console.log('Existing social deployment verified; no transactions sent.');
  } else {
    const before=await protectedState();
    const wallet=HDNodeWallet.fromPhrase('test test test test test test test test test test test junk',undefined,"m/44'/60'/0'/0/0").connect(provider);
    const signer=new NonceManager(wallet),receipts=[],addresses={};
    async function deploy(name,args,key) {
      const a=artifact(name),c=await new ContractFactory(a.abi,a.bytecode,signer).deploy(...args);
      const r=await c.deploymentTransaction().wait();addresses[key]=await c.getAddress();
      receipts.push({contract:name,address:addresses[key],hash:r.hash,blockNumber:r.blockNumber,blockHash:r.blockHash,status:r.status,gasUsed:r.gasUsed.toString()});
      console.log(name,addresses[key],'block',r.blockNumber);return c;
    }
    const schemaRegistry=await deploy('SchemaRegistry',[],'schemaRegistry');
    const eas=await deploy('EAS',[await schemaRegistry.getAddress()],'eas');
    const resolver=await deploy('VaultSocialResolver',[await eas.getAddress(),config.addresses.StatementRegistry],'resolver');
    const schemas={profile:await resolver.profileSchema(),entry:await resolver.entrySchema(),vote:await resolver.voteSchema()};
    for(const uid of Object.values(schemas)){const s=await schemaRegistry.getSchema(uid);if(s.resolver!==addresses.resolver||s.revocable)throw Error('Schema registration failed');}
    const after=await protectedState();
    if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Protected market/profile state changed during additive social deployment');
    const descriptor={format:'oncm-vault-eas-social-v1',chainId:31373,chainInstance:config.chainInstance.id,
      statementRegistry:config.addresses.StatementRegistry,...addresses,schemas,deploymentBlock:receipts[0].blockNumber,
      easPackage:'1.9.0',contractVersion:await eas.version(),releaseCommit:'3683c3ec9383091eebd6f183e67b485e09a53dd7',
      codeHashes:Object.fromEntries(await Promise.all(Object.entries(addresses).map(async([key,a])=>[key,keccak256(await provider.getCode(a))]))),
      receipts,protectedState:{unchanged:true,digest:keccak256(toUtf8Bytes(JSON.stringify(before))),statementCount:before.statements.length,poolCount:before.pools.length,codeHashes:before.codeHashes},createdAt:new Date().toISOString()};
    fs.writeFileSync(file+'.tmp',JSON.stringify(descriptor,null,2));fs.renameSync(file+'.tmp',file);
    console.log('Saved additive social descriptor; existing deployment and markets unchanged.');
  }
} finally {provider.destroy();}
