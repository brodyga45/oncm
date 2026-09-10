import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Interface,keccak256} from 'ethers';import {ensureSocialSetup} from '../scripts/social-setup.mjs';import {SOCIAL_SCHEMAS} from '../sdk/social.mjs';
const address=n=>'0x'+String(n).padStart(40,'0'),uid=n=>'0x'+String(n).padStart(64,'0');
const views=new Interface(['function getSchemaRegistry() view returns(address)','function statementRegistry() view returns(address)','function profileSchema() view returns(bytes32)','function entrySchema() view returns(bytes32)','function voteSchema() view returns(bytes32)','function getSchema(bytes32) view returns((bytes32 uid,address resolver,bool revocable,string schema))']);
function harness(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vault-social-setup-')),config={chainId:31373,rpcUrl:'http://127.0.0.1:9547',chainInstance:{id:'test-chain'},addresses:{StatementRegistry:address(1)}},code='0x1234';
 const descriptor={chainId:31373,chainInstance:'test-chain',statementRegistry:address(1),eas:address(2),schemaRegistry:address(3),resolver:address(4),schemas:{profile:uid(1),entry:uid(2),vote:uid(3)},codeHashes:{eas:keccak256(code),schemaRegistry:keccak256(code),resolver:keccak256(code)}};
 fs.mkdirSync(path.join(root,'.state'));fs.mkdirSync(path.join(root,'social/artifacts'),{recursive:true});
 for(const contractName of ['EAS','SchemaRegistry','VaultSocialResolver'])fs.writeFileSync(path.join(root,'social/artifacts',contractName+'.json'),JSON.stringify({contractName,compiler:'0.8.29+fixture',bytecode:code}));
 const file=path.join(root,'.state/social-deployment.json'),calls=[];
 const rpc=async(method,args=[])=>{calls.push(method);if(method==='eth_chainId')return'0x7a8d';if(method==='eth_getCode')return code;if(method!=='eth_call')throw Error('Forbidden mutation RPC '+method);
  const call=views.parseTransaction({data:args[0].data});let values;if(call.name==='getSchemaRegistry')values=[descriptor.schemaRegistry];else if(call.name==='statementRegistry')values=[descriptor.statementRegistry];else if(call.name==='getSchema'){
   const kind=Object.keys(descriptor.schemas).find(k=>descriptor.schemas[k]===call.args[0]);values=[[call.args[0],descriptor.resolver,false,SOCIAL_SCHEMAS[kind]]];
  }else values=[descriptor.schemas[call.name.replace('Schema','')]];
  return views.encodeFunctionResult(call.name,values);
 };
 return {root,file,config,descriptor,calls,args:{root,config,rpc,runDeployment:async()=>{calls.push('deploy');fs.writeFileSync(file,JSON.stringify(descriptor));}},close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('fresh setup uses one explicit artifact deployment then verifies actual runtime/schema bindings',async()=>{
 const h=harness();try{const r=await ensureSocialSetup(h.args);assert.equal(r.mode,'deployed-new');assert.equal(h.calls.filter(x=>x==='deploy').length,1);assert.ok(h.calls.indexOf('deploy')<h.calls.indexOf('eth_getCode'));assert.equal(r.descriptor.resolver,h.descriptor.resolver);}finally{h.close();}
});
test('existing deployment is verified without requiring test artifacts or recompilation',async()=>{
 const h=harness();try{fs.writeFileSync(h.file,JSON.stringify(h.descriptor));fs.rmSync(path.join(h.root,'social/artifacts'),{recursive:true});h.args.runDeployment=async()=>{h.calls.push('existing-idempotent-script');};const r=await ensureSocialSetup(h.args);assert.equal(r.mode,'verified-existing');assert.ok(!h.calls.includes('deploy'));}finally{h.close();}
});
test('foreign descriptor, wrong network and missing production artifacts fail before deployment',async()=>{
 for(const variant of ['foreign','wrong-chain','missing']){const h=harness();try{
  if(variant==='foreign')fs.writeFileSync(h.file,JSON.stringify({...h.descriptor,chainInstance:'other'}));
  if(variant==='wrong-chain')h.args.rpc=async()=>'0x1';
  if(variant==='missing')fs.unlinkSync(path.join(h.root,'social/artifacts/EAS.json'));
  await assert.rejects(()=>ensureSocialSetup(h.args));assert.ok(!h.calls.includes('deploy'));
 }finally{h.close();}}
});
test('missing/changed runtime never causes automatic redeployment or silent reset',async()=>{
 const h=harness();try{fs.writeFileSync(h.file,JSON.stringify(h.descriptor));h.args.runDeployment=async()=>{};const rpc=h.args.rpc;h.args.rpc=(m,a)=>m==='eth_getCode'?'0x':rpc(m,a);await assert.rejects(()=>ensureSocialSetup(h.args),/runtime missing or changed/);assert.ok(!h.calls.includes('deploy'));}finally{h.close();}
});
test('post-deploy schema policy mismatch is a startup error',async()=>{
 const h=harness();try{const rpc=h.args.rpc;h.args.rpc=(m,a)=>{
  if(m==='eth_call'){const call=views.parseTransaction({data:a[0].data});if(call.name==='getSchema')return views.encodeFunctionResult('getSchema',[[call.args[0],h.descriptor.resolver,true,'bad schema']]);}
  return rpc(m,a);
 };await assert.rejects(()=>ensureSocialSetup(h.args),/schema policy differs/);}finally{h.close();}
});
test('V2 social setup verifies its own descriptor and leaves legacy social bytes intact',async()=>{
 const h=harness();try{
  h.config.protocolVersion='2';const legacy=JSON.stringify({...h.descriptor,statementRegistry:address(9)});fs.writeFileSync(h.file,legacy);
  const v2file=path.join(h.root,'.state/social-deployment-v2.json');
  h.args.runDeployment=async()=>{fs.writeFileSync(v2file,JSON.stringify(h.descriptor));};
  const result=await ensureSocialSetup(h.args);
  assert.equal(result.mode,'deployed-new');assert.equal(result.descriptor.statementRegistry,address(1));
  assert.equal(fs.readFileSync(h.file,'utf8'),legacy);
 }finally{h.close();}
});
