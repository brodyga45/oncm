// launchd entry point. No deployment, reset, private wallet, or proof computation.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {keccak256} from 'ethers';
import {rotatingLog} from './rotating-log.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const role=process.argv[2];
if(!['chain','api','nginx','ngrok'].includes(role))throw Error('Expected chain, api, nginx or ngrok');
const state=path.join(root,'.state/pilot');
fs.mkdirSync(state,{recursive:true});
const log=rotatingLog(path.join(state,role+'.log'));
let child,stopping=false,killTimer;
async function main(){
  const config=JSON.parse(fs.readFileSync(path.join(state,'config.json')));
  const env={...process.env,NODE_OPTIONS:'--max-old-space-size=512',VAULT_PROTOCOL_VERSION:'2',VAULT_PUBLIC_ORIGIN:config.origin,VAULT_PUBLIC_OWNER:config.owner,VAULT_PUBLIC_WRITES:'1'};
  let executable=process.execPath,args;
  if(role==='chain'){
    args=['scripts/chain.mjs'];env.VAULT_BLOCK_TIME='5';env.VAULT_MAX_PERSISTED_STATES='16';
  }else if(role==='api'){
    // Same chain ID alone is insufficient; reject an empty/replaced chain.
    const rpc=async(method,params=[])=>{
      const response=await fetch('http://127.0.0.1:9547',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(3000)});
      const body=await response.json();if(!response.ok||body.error)throw Error('Persistent Vault RPC unavailable');return body.result;
    };
    if(await rpc('eth_chainId')!=='0x7a8d')throw Error('Persistent Vault chain31373 is unavailable');
    const deployment=JSON.parse(fs.readFileSync('.state/deployment-v2.json'));
    for(const key of ['StatementRegistry','TrueToken']){
      const address=deployment.addresses[key],expected=Object.entries(deployment.monetaryPolicy.runtimeHashes).find(([a])=>a.toLowerCase()===address.toLowerCase())?.[1];
      const code=await rpc('eth_getCode',[address,'latest']);
      if(!expected||code==='0x'||keccak256(code).toLowerCase()!==expected.toLowerCase())throw Error('Persistent V2 code mismatch: '+key);
    }
    args=['server/index.mjs'];
  }else if(role==='nginx'){executable=config.nginx;args=['-c',path.join(state,'nginx.conf'),'-g','daemon off;'];}
  else{executable=config.ngrok;args=['http','--url',config.origin,'http://127.0.0.1:8080','--log','stdout','--log-format','json','--log-level','warn','--inspect=false'];}
  // Keep the launchd process group: it cleans descendants if this supervisor dies.
  // An orderly signal reaches the launcher first, so Anvil can finish its dump.
  if(stopping)return;
  child=spawn(executable,args,{stdio:['ignore','pipe','pipe'],env});
  child.stdout.on('data',log);child.stderr.on('data',log);
  child.once('error',error=>{log(error.stack+'\n');process.exitCode=1;});
  child.once('close',(code)=>{clearTimeout(killTimer);process.exitCode=stopping?0:(code??1);});
}
function stop(){
  if(stopping)return;stopping=true;
  if(child){child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),15_000);}
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
await main().catch(error=>{log(error.stack+'\n');process.exitCode=1;});
