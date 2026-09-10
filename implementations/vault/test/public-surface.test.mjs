import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {createPublicPolicy,browserConfig,publicMiddleware,publicRouteAllowed,publicRouteWrapper,validSiweBinding} from '../server/public-surface.mjs';

const origin='https://vault-test.example',owner='0x'+'23'.repeat(20),headers={host:'vault-test.example',origin};
const policy=()=>createPublicPolicy({VAULT_PUBLIC_ORIGIN:origin,VAULT_PUBLIC_OWNER:owner});
async function serve(t,app){
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>{server.closeAllConnections();server.close();});return 'http://127.0.0.1:'+server.address().port;
}
function request(url,{method='GET',headers={},body}={}){
  return new Promise((resolve,reject)=>{const req=http.request(url,{method,headers},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode}));});req.on('error',reject);req.end(body);});
}
const config={protocolVersion:'2',chainId:31373,name:'Vault',rpcUrl:'http://127.0.0.1:9547',deploymentBlock:261,
  addresses:{StatementRegistry:owner},accounts:[{privateKey:'SECRET'}],legacy:{privateNotes:'SECRET'},localPortOffset:0,
  chainInstance:{id:'instance',kind:'anvil-persistent',chainId:31373,recovery:{privatePath:'/private/secret'}},
  proof:{profileId:'p'},monetaryPolicy:{version:'vault-monetary-v1',status:'deployed',runtimeHashes:{}},
  social:{resolver:owner,schemas:{profile:'hash'},protectedState:{privateNote:'SECRET'}}};

test('public origin and selected graph are explicit; browser config never leaks local credentials or filesystem recovery',async()=>{
  for(const v of ['http://vault-test.example','https://vault-test.example/','https://vault-test.example/path','https://127.0.0.1','https://user:pass@vault-test.example'])assert.throws(()=>createPublicPolicy({VAULT_PUBLIC_ORIGIN:v}),/HTTPS/);
  const result=await browserConfig(config,policy());assert.equal(result.rpcUrl,origin+'/rpc');assert.equal(result.apiUrl,origin+'/api');
  assert.equal(result.publicMode,true);assert.equal(result.publicWriteEnabled,false);assert.equal(result.capabilities.externalCertificates,true);
  for(const key of ['devWallet','mining','proofJobs','nativeLean','sourceImport','sourcePublication','walletTransactions'])assert.equal(result.capabilities[key],false);
  assert.equal(JSON.stringify(result).includes('SECRET'),false);assert.equal(JSON.stringify(result).includes('/private'),false);
  assert.equal(Object.hasOwn(result,'accounts'),false);assert.equal(Object.hasOwn(result,'legacy'),false);
  assert.equal(config.rpcUrl,'http://127.0.0.1:9547');assert.equal(config.accounts[0].privateKey,'SECRET');
  await assert.rejects(browserConfig({...config,protocolVersion:'legacy'},policy()),/selected Vault V2/);
  assert.equal(await browserConfig(config,createPublicPolicy({})),config);
});

test('an env flag cannot bypass missing/failed migration verification; config and gateway share live readiness',async()=>{
  const env={VAULT_PUBLIC_ORIGIN:origin,VAULT_PUBLIC_OWNER:owner,VAULT_PUBLIC_WRITES:'1'};
  assert.equal(await createPublicPolicy(env).writeEnabled(),false);
  assert.equal(await createPublicPolicy(env,{writeReadiness:()=>{throw Error('old role');}}).writeEnabled(),false);
  let ready=false;const p=createPublicPolicy(env,{writeReadiness:()=>ready});
  assert.equal((await browserConfig(config,p)).publicWriteEnabled,false);ready=true;
  assert.equal((await browserConfig(config,p)).publicWriteEnabled,true);ready=false;
  assert.equal((await browserConfig(config,p)).capabilities.walletTransactions,false);
  assert.equal(await createPublicPolicy({...env,VAULT_PUBLIC_OWNER:undefined},{writeReadiness:()=>true}).writeEnabled(),false);
});

test('allowlist permits public chain/certificate reads but excludes private import/publication/jobs and unrecognized routes',()=>{
  for(const path of ['/api/config','/api/snapshot','/api/fixtures','/api/external-proofs','/api/comments','/api/blog/'+owner,'/api/profiles/'+owner])assert(publicRouteAllowed('GET',path),path);
  for(const path of ['/api/import','/api/palomar/import','/api/packages','/api/packages/prepare','/api/packages/download','/api/jobs','/api/jobs/x/cancel','/api/statements/x/publications','/api/dev/advance-time','/api/prover','/api/filesystem/import']){
    assert.equal(publicRouteAllowed('POST',path),false,path);assert.equal(publicRouteAllowed('GET',path),false,path);
  }
  assert(publicRouteAllowed('POST','/rpc'));assert.equal(publicRouteAllowed('GET','/rpc'),false);
});

test('real HTTP middleware denies hostile Host/Origin and local writes before their handlers; authentication requires same-origin',async t=>{
  let touched=0;const app=express();app.use(publicMiddleware(policy()));app.use(express.json());
  app.all('*',(req,res)=>{touched++;res.json({ok:true});});const url=await serve(t,app);
  assert.equal((await request(url+'/api/import',{method:'POST',headers,body:'{}'})).status,404);
  assert.equal((await request(url+'/api/config',{headers:{...headers,host:'evil.example'}})).status,403);
  assert.equal((await request(url+'/api/config',{headers:{...headers,origin:'https://evil.example'}})).status,403);
  assert.equal((await request(url+'/api/auth/verify',{method:'POST',headers:{host:headers.host}})).status,403);
  assert.equal((await request(url+'/api/social/snapshot?rebuild=true',{headers})).status,400);
  assert.equal(touched,0);
  assert.equal((await request(url+'/api/external-proofs',{headers})).status,200);assert.equal(touched,1);
  assert.equal((await request(url+'/rpc',{method:'POST',headers:{...headers,origin:'chrome-extension://wallet'}})).status,200);
  assert.equal(touched,2); // RPC has no session/cookie authority; signed admission is separate.
});

test('read timeout keeps underlying admission occupied; oversized response returns an explicit failure',async t=>{
  const app=express();let release;const wrap=publicRouteWrapper(policy(),{timeout:20,maxInflight:1,responseBytes:50});
  app.get('/hold',wrap(async(req,res)=>{await new Promise(r=>{release=r;});res.json({done:true});}));
  app.get('/big',wrap(async(req,res)=>res.json({value:'x'.repeat(100)})));
  const url=await serve(t,app);assert.equal((await fetch(url+'/hold')).status,504);
  assert.equal((await fetch(url+'/big')).status,429);release();await new Promise(r=>setImmediate(r));
  assert.equal((await fetch(url+'/big')).status,503);
});

test('SIWE binds exact HTTPS authority and chain, rather than trusting message-provided domains',()=>{
  const message={chainId:31373,domain:'vault-test.example',uri:origin+'/login'};
  assert(validSiweBinding(message,policy(),new Set()));
  for(const changes of [{chainId:1},{domain:'evil.example'},{uri:'http://vault-test.example/login'},{uri:'https://evil.example/login'}])assert.equal(validSiweBinding({...message,...changes},policy(),new Set()),false);
  const local={chainId:31373,domain:'127.0.0.1:5173',uri:'http://127.0.0.1:5173'};
  assert(validSiweBinding(local,createPublicPolicy({}),new Set([local.uri])));
  assert.equal(validSiweBinding({...local,domain:'localhost:5173'},createPublicPolicy({}),new Set([local.uri])),false);
});
