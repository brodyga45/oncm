// One explicitly isolated copy only. Never connects to the existing RPC9546.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Contract,JsonRpcProvider,ZeroAddress} from 'ethers';
import {localEndpoints} from '../sdk/local-endpoints.mjs';
const copy=path.resolve(process.argv[2]||''),report=path.resolve(process.argv[3]||'');
assert(copy.startsWith('/private/tmp/oncm-exchange-clean-'),'Explicit isolated copy directory required');
assert(report!==path.resolve(''),'Explicit report path required');
const endpoints=localEndpoints('10000'),results={scope:'Actual fresh intended-public source copy; existing locked node_modules symlink reused, no fresh npm installation, no native prover, no active-chain connection',endpoints,checks:[]};
for(const port of [endpoints.rpcPort,endpoints.apiPort,endpoints.webPort])await new Promise((resolve,reject)=>{
 const server=net.createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve));
});
for(const name of ['data','artifacts','web/generated','proof/deployment.json','proof/runtime.local.json','proof/bin'])assert(!fs.existsSync(path.join(copy,name)),'Fresh copy unexpectedly contains '+name);
const log=fs.openSync(path.join(copy,'fresh-start.log'),'a'),child=spawn(process.execPath,['scripts/start.mjs'],{cwd:copy,env:{...process.env,EXCHANGE_PORT_OFFSET:'10000',NODE_OPTIONS:'--max-old-space-size=384'},stdio:['ignore',log,log]});fs.closeSync(log);
let provider;const started=Date.now();
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(3000)});assert.equal(r.status,200,url);return r.json();}
try{
 let ready=false;
 while(Date.now()-started<100000){
  if(child.exitCode!==null||child.signalCode!==null)throw Error('Fresh startup exited; inspect '+path.join(copy,'fresh-start.log'));
  try{ready=(await fetch(endpoints.web,{signal:AbortSignal.timeout(500)})).status===200;}catch{}
  if(ready)break;await new Promise(r=>setTimeout(r,250));
 }
 assert(ready,'Fresh web did not become ready within100s');results.startupSeconds=(Date.now()-started)/1000;
 const deployment=await json(endpoints.api+'/api/deployment'),social=await json(endpoints.api+'/api/social/deployment');
 assert.equal(deployment.rpc,endpoints.rpc);assert.equal(deployment.chainId,31372);assert.equal(deployment.testHarness,false);assert.equal(deployment.proofReady,true);
 assert.equal(social.registry,deployment.contracts.protocol);assert.equal(social.status,'ready');results.deployment=deployment;results.social=social;
 const markets=await json(endpoints.api+'/api/markets');assert.equal(markets.markets.length,0);
 provider=new JsonRpcProvider(endpoints.rpc,undefined,{cacheTimeout:-1});
 const abis=JSON.parse(fs.readFileSync(path.join(copy,'web/generated/social-abis.json'))),hook=new Contract(social.hook,abis.ExchangeSocialHook,provider),comments=new Contract(social.comments,abis.CommentManager,provider),channels=new Contract(social.channels,abis.ChannelManager,provider);
 assert.equal(await comments.owner(),ZeroAddress);assert.equal(await channels.owner(),ZeroAddress);assert.equal(await channels.ownerOf(social.channelId),social.hook);
 assert.equal(await channels.getCommentCreationFee(),0n);assert.equal(await channels.getChannelCreationFee(),0n);assert.equal(await channels.getHookTransactionFee(),0n);
 assert.equal(await hook.registry(),deployment.contracts.protocol);
 const index=await json(endpoints.api+'/api/social/index');assert.equal(index.entries.length,0);
 const profile=await json(endpoints.api+'/api/profiles/'+deployment.accounts[0]);assert.equal(profile.source,'onchain-ecp');assert.equal(profile.bio,'');
 const bundleModule=await fetch(endpoints.web+'/web/main.jsx',{signal:AbortSignal.timeout(15000)});assert.equal(bundleModule.status,200);assert((await bundleModule.text()).includes('localEndpoints'));
 const original=new Contract(deployment.verifier,['function verifier() view returns(address)','function profileId() view returns(bytes32)'],provider);
 const originalAddress=await original.verifier();assert.notEqual(await provider.getCode(originalAddress),'0x');
 results.checks=['real original bridge and ECP deployed from fresh source','Shanghai node with persisted database','correct offset API/web/RPC','original ECP zero fees/renounced managers/locked channel','empty market/social index; onchain profile read','Vite transforms application entry with generated social ABI','no native binaries or proof execution'];
 results.block=Number(BigInt(await provider.send('eth_blockNumber',[])));results.originalVerifier=originalAddress;results.status='passed';
}catch(error){results.status='failed';results.error=error.message;throw error;}
finally{
 provider?.destroy();
 const exited=new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null)return resolve();child.once('exit',resolve);});
 child.kill('SIGTERM');await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,3000))]);
 assert(child.exitCode!==null||child.signalCode!==null,'Startup supervisor did not clean up');
 results.supervisorExit={code:child.exitCode,signal:child.signalCode};results.elapsedSeconds=(Date.now()-started)/1000;
 results.portsClosed=[];
 for(const port of [endpoints.rpcPort,endpoints.apiPort,endpoints.webPort])await new Promise(resolve=>{
  const socket=net.connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve();});socket.once('error',()=>{results.portsClosed.push(port);resolve();});socket.setTimeout(1000,()=>{socket.destroy();resolve();});
 });
 fs.mkdirSync(path.dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(results,null,2)+'\n');
 assert.equal(results.portsClosed.length,3,'Fresh instance left listeners alive');
 console.log(JSON.stringify({status:results.status,elapsedSeconds:results.elapsedSeconds,portsClosed:results.portsClosed,report}));
}
