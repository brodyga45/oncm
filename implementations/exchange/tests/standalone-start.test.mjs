// Execute the actual startup module with isolated process/RPC/filesystem doubles.
// No real listener, child process, deployment, compilation or active-chain call.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {localEndpoints} from '../sdk/local-endpoints.mjs';
const root=path.resolve(import.meta.dirname,'..'),source=fs.readFileSync(path.join(root,'scripts/start.mjs'),'utf8');
const core={chainId:31372,contracts:{protocol:'0x1000000000000000000000000000000000000001'}};
const social={chainId:31372,registry:core.contracts.protocol,hook:'0x2000000000000000000000000000000000000002',comments:'0x3000000000000000000000000000000000000003',channels:'0x4000000000000000000000000000000000000004'};
async function run({chain=undefined,saved=false,missingCode,failStep,orphanSocial=false}={}){
 const files=new Map(),calls=[],killed=[],signals=new Map(),writes=[];let destroyed=false,exited;
 const write=(p,v)=>files.set(p,typeof v==='string'?v:JSON.stringify(v));
 if(saved){for(const name of ['artifacts/ExchangeProtocol.json','web/generated/abis.json','artifacts/social/ExchangeSocialHook.json','web/generated/social-abis.json'])write(name,{});write('data/deployment.json',core);write('data/social-deployment.json',social);}
 if(orphanSocial)write('data/social-deployment.json',social);
 const fakeFs={mkdirSync(){},openSync(){return 7;},closeSync(){},existsSync:p=>files.has(p),readFileSync:p=>{assert(files.has(p),'Missing fixture file '+p);return files.get(p);},writeFileSync:(p,v)=>{writes.push(p);write(p,v);}};
 const spawn=(_exe,args)=>{
  const step=args[0];calls.push(step);const p=new EventEmitter();p.exitCode=null;p.signalCode=null;
  p.kill=signal=>{killed.push({step,signal});p.signalCode=signal;p.emit('exit',null,signal);return true;};
  if(step==='scripts/chain.mjs')chain=31372;
  if(!['scripts/chain.mjs','api/server.mjs','node_modules/vite/bin/vite.js'].includes(step))queueMicrotask(()=>{
   const code=failStep===step?1:0;
   if(code===0){
    if(step==='scripts/compile.mjs'){write('artifacts/ExchangeProtocol.json',{});write('web/generated/abis.json',{});}
    if(step==='scripts/deploy.mjs')write('data/deployment.json',core);
    if(step==='scripts/compile-social.mjs'){write('artifacts/social/ExchangeSocialHook.json',{});write('web/generated/social-abis.json',{});}
    if(step==='scripts/deploy-social.mjs')write('data/social-deployment.json',social);
   }
   p.exitCode=code;p.emit('exit',code,null);
  });return p;
 };
 class Provider{async getNetwork(){if(chain===undefined)throw Error('Unavailable');return{chainId:BigInt(chain)};}async getCode(address){return address===missingCode?'0x':'0x6000';}destroy(){destroyed=true;}}
 const context=vm.createContext({console:{log(){},error(){}},process:{execPath:'node',env:{},chdir(){},on:(name,fn)=>signals.set(name,fn),exit:code=>{exited=code;}},setTimeout:(fn,ms)=>ms===200?setTimeout(fn,0):setTimeout(fn,ms),clearTimeout});
 const imports={'node:child_process':{spawn},'node:fs':{default:fakeFs},'node:path':{default:path},ethers:{JsonRpcProvider:Provider},'./proof-bootstrap.mjs':{ensureProofBootstrap(){/* Independently tested against real isolated files. */}},'../sdk/local-endpoints.mjs':{localEndpoints}};
 const module=new vm.SourceTextModule(source,{context,initializeImportMeta(meta){meta.dirname=path.join(root,'scripts');}});
 await module.link(spec=>{assert(imports[spec],'Unexpected module '+spec);const values=imports[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
 let error;try{await module.evaluate();}catch(e){error=e;}
 return{error,calls,killed,writes,files,get destroyed(){return destroyed;},async stop(){signals.get('SIGTERM')();await new Promise(r=>setImmediate(r));assert.equal(exited,0);}};
}
test('Fresh standalone orchestration builds original ECP graph and deploys it before API/web start',async()=>{
 const r=await run();assert.equal(r.error,undefined);
 assert.deepEqual(r.calls,['scripts/compile.mjs','scripts/chain.mjs','scripts/deploy.mjs','scripts/compile-social.mjs','scripts/deploy-social.mjs','api/server.mjs','node_modules/vite/bin/vite.js']);
 assert.deepEqual(JSON.parse(r.files.get('web/generated/social-deployment.json')),social);
 await r.stop();assert.deepEqual(r.killed.map(p=>p.step),['scripts/chain.mjs','api/server.mjs','node_modules/vite/bin/vite.js']);assert(r.destroyed);
});
test('Existing healthy deployment is reused; stopping cannot terminate an externally owned chain',async()=>{
 const r=await run({chain:31372,saved:true});assert.equal(r.error,undefined);
 assert.deepEqual(r.calls,['api/server.mjs','node_modules/vite/bin/vite.js']);await r.stop();assert(!r.killed.some(p=>p.step==='scripts/chain.mjs'));
});
test('Wrong chain and missing persisted core/social code fail closed without replacement deployment',async()=>{
 for(const options of [{chain:1,saved:true},{chain:31372,saved:true,missingCode:core.contracts.protocol},{chain:31372,saved:true,missingCode:social.hook},{chain:31372,saved:true,missingCode:social.comments},{chain:31372,orphanSocial:true}]){
  const r=await run(options);assert(r.error);assert(!r.calls.some(c=>c==='scripts/deploy.mjs'||c==='scripts/deploy-social.mjs'||c==='api/server.mjs'||c==='node_modules/vite/bin/vite.js'));assert(r.destroyed);
 }
});
test('Failure after starting an owned chain cleans it before startup rejects',async()=>{
 const r=await run({failStep:'scripts/compile-social.mjs'});assert.match(r.error.message,/compile-social.*failed/);
 assert.deepEqual(r.killed,[{step:'scripts/chain.mjs',signal:'SIGTERM'}]);assert(r.destroyed);assert(!r.calls.includes('api/server.mjs'));
});
test('Fresh ECP compiler inputs and verifier artifact are app-local, with explicit Shanghai target',()=>{
 const compile=fs.readFileSync(path.join(root,'scripts/compile-social.mjs'),'utf8');
 assert.match(compile,/evmVersion:'shanghai'/);assert.match(compile,/'vendor\/social'/);
 for(const file of ['contracts/social/ExchangeSocialHook.sol','vendor/social/ecp/src/CommentManager.sol','vendor/social/ecp/src/ChannelManager.sol','vendor/social/ECP-LICENSE.md','vendor/social/OZ-LICENSE.txt','vendor/social/SOLADY-LICENSE.txt','proof/deployment.json','proof/manifest.json'])assert(fs.existsSync(path.join(root,file)),file);
 const d=JSON.parse(fs.readFileSync(path.join(root,'proof/bootstrap-deployment.json'))),a=JSON.parse(fs.readFileSync(path.join(root,'proof',d.artifact)));
 assert(/^0x[0-9a-f]+$/i.test(a.bytecode));assert(Array.isArray(a.abi));assert.equal(d.args.length,2);
});
