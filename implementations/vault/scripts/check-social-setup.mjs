// Read-only startup verification. Does not launch start/deploy/compile or send transactions.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureSocialSetup} from './social-setup.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(fs.readFileSync(path.join(root,'.state/deployment.json')));
if(!fs.existsSync(path.join(root,'.state/social-deployment.json')))throw Error('Read-only check requires existing social deployment');
async function rpc(method,params=[]){
 if(!['eth_chainId','eth_blockNumber','eth_getCode','eth_call'].includes(method))throw Error('Non-read RPC denied');
 const response=await fetch(config.rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(3000)});
 const json=await response.json();if(json.error)throw Error(json.error.message);return json.result;
}
const before=await rpc('eth_blockNumber');
const result=await ensureSocialSetup({root,config,rpc,runDeployment:async()=>{}});
const after=await rpc('eth_blockNumber');
const report={format:'vault-social-startup-readonly-v1',blockBefore:Number(BigInt(before)),blockAfter:Number(BigInt(after)),
 chainInstance:config.chainInstance.id,mode:result.mode,addresses:{eas:result.descriptor.eas,schemaRegistry:result.descriptor.schemaRegistry,resolver:result.descriptor.resolver},
 verified:['chain','runtime hashes','immutable EAS registry','immutable statement registry','three canonical nonrevocable schemas'],
 transactionsSent:0,freshFullStartupExecuted:false};
fs.mkdirSync(path.join(root,'evidence/onchain-social'),{recursive:true});
fs.writeFileSync(path.join(root,'evidence/onchain-social/startup-runtime.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
