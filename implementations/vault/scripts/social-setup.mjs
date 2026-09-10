import {runtimeFiles} from '../server/runtime-version.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {Interface,isAddress,keccak256} from 'ethers';
import {SOCIAL_SCHEMAS} from '../sdk/social.mjs';
import {assertLocalConfig} from '../sdk/local-endpoints.mjs';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const views=new Interface(['function getSchemaRegistry() view returns(address)','function statementRegistry() view returns(address)',
 'function profileSchema() view returns(bytes32)','function entrySchema() view returns(bytes32)','function voteSchema() view returns(bytes32)',
 'function getSchema(bytes32) view returns((bytes32 uid,address resolver,bool revocable,string schema))']);
function descriptorBinding(d,config){
 if(d.chainId!==31373||d.chainInstance!==config.chainInstance.id||!same(d.statementRegistry,config.addresses.StatementRegistry))throw Error('Saved social descriptor belongs to another chain/deployment; explicit recovery required');
 for(const key of ['eas','schemaRegistry','resolver'])if(!isAddress(d[key])||!/^0x[0-9a-f]{64}$/i.test(d.codeHashes?.[key]||''))throw Error('Invalid saved social address/runtime pin: '+key);
}
/** Runs only the existing pinned deployment script, never a compiler/prover.
 * Existing records are verified and preserved; missing contracts are not reset. */
export async function ensureSocialSetup({root,config,rpc,runDeployment}){
 assertLocalConfig(config);
 const file=runtimeFiles(root,config.protocolVersion??'legacy').social,existed=fs.existsSync(file);
 if(existed)descriptorBinding(JSON.parse(fs.readFileSync(file)),config);
 else for(const name of ['EAS','SchemaRegistry','VaultSocialResolver']){
  const p=path.join(root,'social/artifacts',name+'.json');if(!fs.existsSync(p))throw Error('Missing '+name+' social artifact; run node social/compile.mjs explicitly (dev never compiles)');
  const a=JSON.parse(fs.readFileSync(p));if(a.contractName!==name||!a.compiler?.startsWith('0.8.29+')||!/^0x[0-9a-f]+$/i.test(a.bytecode||''))throw Error('Invalid pinned social production artifact '+name);
 }
 if(BigInt(await rpc('eth_chainId'))!==31373n)throw Error('Actual RPC chain differs from Vault configuration');
 // The script checks existing runtime pins or deploys the three original-contract
 // components additively, preserving all existing market/profile state.
 await runDeployment();
 if(!fs.existsSync(file))throw Error('Social deployment completed without its descriptor');
 const descriptor=JSON.parse(fs.readFileSync(file));descriptorBinding(descriptor,config);
 for(const key of ['schemaRegistry','eas','resolver']){
  const code=await rpc('eth_getCode',[descriptor[key],'latest']);
  if(code==='0x'||keccak256(code)!==descriptor.codeHashes[key])throw Error('Saved social runtime missing or changed: '+key);
 }
 const call=async(address,method,args=[])=>views.decodeFunctionResult(method,await rpc('eth_call',[{to:address,data:views.encodeFunctionData(method,args)},'latest']));
 if(!same((await call(descriptor.eas,'getSchemaRegistry'))[0],descriptor.schemaRegistry)
  ||!same((await call(descriptor.resolver,'statementRegistry'))[0],config.addresses.StatementRegistry))throw Error('Social immutable registry binding differs');
 for(const kind of ['profile','entry','vote']){
  const uid=(await call(descriptor.resolver,kind+'Schema'))[0];if(!same(uid,descriptor.schemas?.[kind]))throw Error('Social schema UID differs: '+kind);
  const record=(await call(descriptor.schemaRegistry,'getSchema',[uid]))[0];
  if(!same(record.uid,uid)||!same(record.resolver,descriptor.resolver)||record.revocable||record.schema!==SOCIAL_SCHEMAS[kind])throw Error('Original EAS schema policy differs: '+kind);
 }
 return {descriptor,mode:existed?'verified-existing':'deployed-new'};
}
