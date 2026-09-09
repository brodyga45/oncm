import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import ganache from 'ganache';
import {mnemonic,publicClient} from '../sdk/chain.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));process.chdir(root);
const run=(cmd,args)=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{cwd:root,stdio:'inherit'});p.on('exit',code=>code===0?resolve():reject(new Error(`${cmd} exited ${code}`)));});
if(process.argv.includes('--reset'))fs.rmSync(path.join(root,'.local'),{recursive:true,force:true});fs.mkdirSync('.local',{recursive:true});
await run(process.execPath,['scripts/compile.mjs']);
const server=ganache.server({chain:{chainId:31371,hardfork:'shanghai'},wallet:{mnemonic,totalAccounts:6,defaultBalance:1000},miner:{blockGasLimit:30_000_000},database:{dbPath:path.join(root,'.local/chain')},logging:{quiet:true}});
await server.listen(9545,'127.0.0.1');
const manifestPath=path.join(root,'.local/deployment.json');let reuse=false;if(fs.existsSync(manifestPath)){const m=JSON.parse(fs.readFileSync(manifestPath));const code=await publicClient.getCode({address:m.registry});reuse=!!code&&code!=='0x';}
if(!reuse){const {deploy}=await import('./deploy.mjs');await deploy();}
const children=[spawn(process.execPath,['--watch','server/index.mjs'],{cwd:root,stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5171','--strictPort'],{cwd:root,stdio:'inherit'})];
console.log('Agora: http://127.0.0.1:5171 · API :4171 · chain 31371 / RPC :9545');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{children.forEach(p=>p.kill('SIGTERM'));await server.close();process.exit(0);});
