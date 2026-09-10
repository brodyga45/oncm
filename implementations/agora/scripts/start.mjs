import {createShutdown} from './shutdown.mjs';
import {network} from '../sdk/local-network.mjs';
import {ensureProofBootstrap} from './proof-bootstrap.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import ganache from 'ganache';
import {mnemonic,publicClient,keccak256} from '../sdk/chain.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));process.chdir(root);
const run=(cmd,args)=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{cwd:root,stdio:'inherit'});p.on('exit',code=>code===0?resolve():reject(new Error(`${cmd} exited ${code}`)));});
if(process.argv.includes('--reset'))fs.rmSync(path.join(root,'.local'),{recursive:true,force:true});fs.mkdirSync('.local',{recursive:true});
ensureProofBootstrap(root);
await run(process.execPath,['scripts/compile.mjs']);
await run(process.execPath,['scripts/compile-social.mjs']);
const server=ganache.server({chain:{chainId:31371,hardfork:'shanghai'},wallet:{mnemonic,totalAccounts:6,defaultBalance:1000},miner:{blockGasLimit:30_000_000},database:{dbPath:path.join(root,'.local/chain')},logging:{quiet:true}});
await server.listen(network.rpcPort,'127.0.0.1');
const manifestPath=path.join(root,'.local/deployment.json');let reuse=false;if(fs.existsSync(manifestPath)){const m=JSON.parse(fs.readFileSync(manifestPath));const code=await publicClient.getCode({address:m.registry});reuse=!!code&&code!=='0x';}
if(!reuse){const {deploy}=await import('./deploy.mjs');await deploy();}
const socialPath=path.join(root,'.local/social-deployment.json');
if(!fs.existsSync(socialPath))await run(process.execPath,['scripts/deploy-social.mjs']);
else {const d=JSON.parse(fs.readFileSync(socialPath)),m=JSON.parse(fs.readFileSync(manifestPath));const code=await publicClient.getCode({address:d.social});if(d.registry.toLowerCase()!==m.registry.toLowerCase()||!code||code==='0x'||keccak256(code)!==d.runtimeHash)throw Error('Saved social deployment does not match this chain; refusing replacement');}
const children=[spawn(process.execPath,['--watch','server/index.mjs'],{cwd:root,stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(network.webPort),'--strictPort'],{cwd:root,stdio:'inherit'})];
console.log(`Agora: ${network.webOrigin} · API :${network.apiPort} · chain 31371 / RPC :${network.rpcPort}`);
const shutdown=createShutdown({children,closeServer:()=>server.close(),onExit:code=>process.exit(code),onError:error=>console.error('Agora shutdown: '+error.message)});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,shutdown);
