// Explicit isolated source-copy QA driver, never part of npm test/dev.
import fs from 'node:fs';import path from 'node:path';import net from 'node:net';
import {spawn} from 'node:child_process';import {pathToFileURL,fileURLToPath} from 'node:url';
import {Contract,JsonRpcProvider,sha256} from 'ethers';
import {localEndpoints} from '../sdk/local-endpoints.mjs';
import {waitForHttp} from './http-ready.mjs';
const original=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(process.env.VAULT_SMOKE_COPY||''),e=localEndpoints(10000);
if(!root.startsWith('/private/tmp/oncm-vault-fresh-')||root===original||process.env.VAULT_SMOKE_ALLOW_DEPLOY!=='1')throw Error('Explicit isolated fresh-copy opt-in required');
for(const file of ['.state/deployment.json','.state/social-deployment.json','.state/chain-instance.json','proof/deployment.json'])if(fs.existsSync(path.join(root,file)))throw Error('Fresh smoke refuses an existing deployment/state: '+file);
async function rpc(url,method,params=[]){
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(3000)});
 const j=await response.json();if(j.error)throw Error(j.error.message);return j.result;
}
const listening=port=>new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});const done=value=>{socket.destroy();resolve(value);};socket.on('connect',()=>done(true));socket.on('error',()=>done(false));socket.setTimeout(300,()=>done(false));});
for(const port of [e.rpcPort,e.apiPort,e.webPort])if(await listening(port))throw Error('Isolated port already occupied; nothing will replace it: '+port);
const liveBefore=await rpc('http://127.0.0.1:9547','eth_getBlockByNumber',['latest',false]);
const output=path.join(original,'evidence/fresh-start');fs.mkdirSync(output,{recursive:true});
const log=fs.openSync(path.join(root,'fresh-start.log'),'a');
const child=spawn(process.execPath,['scripts/start.mjs'],{cwd:root,stdio:['ignore',log,log],env:{...process.env,VAULT_PORT_OFFSET:'10000',VAULT_ANVIL:path.join(original,'.toolchain/anvil')}});fs.closeSync(log);
const closed=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
let provider,report={format:'vault-actual-fresh-start-v1',root,endpoints:e,liveBefore:{number:Number(BigInt(liveBefore.number)),hash:liveBefore.hash},success:false},failure;
try{
 let payload;
 for(let i=0;i<160;i++){
  if(child.exitCode!==null)throw Error('Startup exited before health; inspect fresh-start.log');
  try{const r=await fetch(e.apiUrl+'/api/config',{signal:AbortSignal.timeout(1000)});if(r.ok){payload=await r.json();break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(!payload)throw Error('Fresh API did not become ready');
 const {config,abis}=payload;
 if(config.localPortOffset!==10000||config.rpcUrl!==e.rpcUrl||config.apiUrl!==e.apiUrl||config.webUrl!==e.webUrl||config.chainId!==31373||!config.social)throw Error('Fresh endpoint/social configuration differs');
 await waitForHttp([e.webUrl,e.webUrl+'/api/health'],{isStopped:()=>child.exitCode!==null});
 const web=await fetch(e.webUrl,{signal:AbortSignal.timeout(3000)}),webText=await web.text();if(!web.ok||!webText.includes('/web/main'))throw Error('Fresh website not served');
 const proxy=await fetch(e.webUrl+'/api/health',{signal:AbortSignal.timeout(3000)});if(!proxy.ok)throw Error('Fresh website API proxy failed');
 provider=new JsonRpcProvider(e.rpcUrl,undefined,{cacheTimeout:-1});
 const {createSDK,localWallet}=await import(pathToFileURL(path.join(root,'sdk/index.mjs')).href),sdk=createSDK(config,abis,provider);
 const profile=await sdk.registry.profiles(config.proof.profileId);
 if(config.proof.status!=='configured'||!profile.enabled||profile.verifier.toLowerCase()!==config.proof.verifier.toLowerCase())throw Error('Actual immutable proof profile is absent');
 const statements=await sdk.statements(),pools=await sdk.pools(),social=await sdk.social.snapshot({rebuild:true});
 const signer=await localWallet(config,0);if((await signer.getAddress()).toLowerCase()!==config.accounts[0].toLowerCase())throw Error('Offset local-wallet guard returned unexpected account');signer.provider.destroy();
 const bridge=new Contract(config.proof.verifier,['function verifier() view returns(address)','function imageId() view returns(bytes32)','function profileId() view returns(bytes32)'],provider);
 const verifierAddress=await bridge.verifier(),originalVerifier=new Contract(verifierAddress,['function verify(bytes seal,bytes32 imageId,bytes32 journalDigest) view'],provider);
 const published=JSON.parse(fs.readFileSync(path.join(root,'external-proofs/perf05/true-registration.json')));
 await originalVerifier.verify.staticCall(published.evmSeal,published.imageId,sha256(published.journal));
 let changedRejected=false;try{await originalVerifier.verify.staticCall(published.evmSeal,published.imageId,'0x'+'11'.repeat(32));}catch{changedRejected=true;}
 if(!changedRejected)throw Error('Original verifier accepted a changed claim');
 report={...report,runtimeChecksPassed:true,configuration:config,profile:{verifier:profile.verifier,enabled:profile.enabled,manifest:profile.manifest},
  originalVerifier:{address:verifierAddress,realPublishedClaimAccepted:true,changedJournalRejected:true,scope:'original generic RISC Zero verifier only; perf05 is not silently installed into v3 bridge'},
  webStatus:web.status,proxyStatus:proxy.status,statementCount:statements.length,poolCount:pools.length,socialSnapshot:social,
  deployment:JSON.parse(fs.readFileSync(path.join(root,'.state/deployment-txs.json'))),socialDeployment:JSON.parse(fs.readFileSync(path.join(root,'.state/social-deployment.json')))};
  fs.writeFileSync(path.join(root,'fresh-ready.json'),JSON.stringify({web:e.webUrl,chainId:config.chainId,chainInstance:config.chainInstance.id,block:await provider.getBlockNumber()}));
  console.log('Fresh Vault ready for isolated browser QA: '+e.webUrl);
  if(process.env.VAULT_SMOKE_BROWSER==='1'){
    const browserFile=path.join(root,'fresh-browser-result.json');
    for(let i=0;i<160&&!fs.existsSync(browserFile);i++)await new Promise(resolve=>setTimeout(resolve,250));
    if(!fs.existsSync(browserFile))throw Error('Browser QA handoff timed out');
    report.browser=JSON.parse(fs.readFileSync(browserFile));
  }
  report.success=true;
}catch(error){failure=error;report.error=error.stack;}
finally{
 provider?.destroy();if(child.exitCode===null)child.kill('SIGTERM');
 let shutdownTimer;const shutdown=await Promise.race([closed,new Promise(resolve=>{shutdownTimer=setTimeout(()=>resolve(null),15000);})]);clearTimeout(shutdownTimer);
 if(!shutdown){report.cleanupError='Startup did not close within15s';if(child.exitCode===null)child.kill('SIGKILL');}
 report.shutdown=shutdown;report.portsClosed={};
 for(const port of [e.rpcPort,e.apiPort,e.webPort])report.portsClosed[port]=!(await listening(port));
 const liveAfter=await rpc('http://127.0.0.1:9547','eth_getBlockByNumber',['latest',false]);report.liveAfter={number:Number(BigInt(liveAfter.number)),hash:liveAfter.hash};report.originalChainUnchanged=liveAfter.hash===liveBefore.hash;
 fs.writeFileSync(path.join(output,'actual-start.json'),JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');
 const bytes=fs.readFileSync(path.join(root,'fresh-start.log'));fs.writeFileSync(path.join(output,'startup.log'),bytes.subarray(0,100000));
}
if(failure)throw failure;
if(report.cleanupError||!Object.values(report.portsClosed).every(Boolean))throw Error('Fresh smoke cleanup incomplete');
console.log(JSON.stringify({success:true,root,block:report.liveAfter.number,originalChainUnchanged:report.originalChainUnchanged,portsClosed:report.portsClosed,originalVerifier:report.originalVerifier}));
