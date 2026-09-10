import fs from 'node:fs';
import path from 'node:path';
import {ContractFactory,Contract,JsonRpcProvider,ZeroAddress} from 'ethers';
import {financialSnapshot} from './social-preservation.mjs';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
export function socialArtifact(name){return JSON.parse(fs.readFileSync(path.join(root,'artifacts/social',name+'.json')));}
export async function deploySocial(provider,signer,registry){
 if(Number((await provider.getNetwork()).chainId)!==31372)throw Error('Exchange social deployment requires chain31372');
 if(await provider.getCode(registry)==='0x')throw Error('Missing existing registry');
 const receipts=[],libraries={};const owner=await signer.getAddress();
 async function create(name,args=[]){
  const a=socialArtifact(name);let code=a.bytecode.slice(2);
  for(const [file,refs] of Object.entries(a.linkReferences||{}))for(const [lib,positions]of Object.entries(refs)){
   if(!libraries[file+':'+lib])libraries[file+':'+lib]=await create(lib);
   const address=(await libraries[file+':'+lib].getAddress()).slice(2);
   for(const p of positions){if(p.length!==20)throw Error('Unexpected link width');code=code.slice(0,p.start*2)+address+code.slice((p.start+p.length)*2);}
  }
  if(!/^[0-9a-f]+$/i.test(code))throw Error('Unresolved library');
  const c=await new ContractFactory(args.length?a.abi:[], '0x'+code,signer).deploy(...args);const r=await c.deploymentTransaction().wait();receipts.push({operation:'deploy '+name,hash:r.hash,blockNumber:r.blockNumber,address:await c.getAddress()});return c;
 }
 async function tx(operation,fn){const t=await fn();const r=await t.wait();receipts.push({operation,hash:r.hash,blockNumber:r.blockNumber});}
 const channels=await create('ChannelManager',[owner]),comments=await create('CommentManager',[owner]);
 await tx('zero channel creation fee',()=>channels.setChannelCreationFee(0));
 await tx('zero comment creation fee',()=>channels.setCommentCreationFee(0));
 await tx('zero hook transaction fee',()=>channels.setHookTransactionFee(0));
 await tx('bind original channel manager',()=>comments.updateChannelContract(channels.target));
 const hook=await create('ExchangeSocialHook',[comments.target,channels.target,registry]);
 await tx('initialize locked app channel',()=>hook.initialize());
 await tx('freeze comment manager',()=>comments.renounceOwnership());
 await tx('freeze channel fee configuration',()=>channels.renounceOwnership());
 const channelId=await hook.channelId();
 if(await comments.owner()!==ZeroAddress||await channels.owner()!==ZeroAddress||await channels.ownerOf(channelId)!==hook.target||await channels.getCommentCreationFee()!==0n)throw Error('Social initialization failed');
 return{format:'oncm-exchange-social-v1',status:'ready',chainId:31372,registry,comments:comments.target,channels:channels.target,hook:hook.target,channelId:String(channelId),deploymentBlock:receipts[0].blockNumber,configuredAtBlock:receipts.at(-1).blockNumber,libraries:Object.fromEntries(await Promise.all(Object.entries(libraries).map(async([k,c])=>[k,c.target]))),owners:{comments:ZeroAddress,channels:ZeroAddress,channelToken:hook.target},fees:{channelCreation:'0',commentCreation:'0',hookBps:0},receipts};
}
async function main(){
 const provider=new JsonRpcProvider('http://127.0.0.1:9546',undefined,{cacheTimeout:-1});
 const original=JSON.parse(fs.readFileSync(path.join(root,'data/deployment.json'))), protocol=original.contracts.protocol, originalAbis=JSON.parse(fs.readFileSync(path.join(root,'web/generated/abis.json')));
 const output=path.join(root,'data/social-deployment.json');
 if(fs.existsSync(output)){const old=JSON.parse(fs.readFileSync(output));if(old.registry!==protocol||await provider.getCode(old.hook)==='0x')throw Error('Saved social deployment differs or is absent; inspect before any new deployment');console.log('Existing social deployment preserved');return;}
 // Legacy records retain their original provenance and are never fabricated as wallet transactions.
 const archive=path.join(root,'data/legacy-social-before-onchain');fs.mkdirSync(archive,{recursive:true});
 for(const name of ['social.json','profiles.json','comments.json','comment-votes.json']){const file=path.join(root,'data',name);if(fs.existsSync(file)&&!fs.existsSync(path.join(archive,name)))fs.copyFileSync(file,path.join(archive,name));}
 const before=await financialSnapshot(provider,original,originalAbis);
 const deployment=await deploySocial(provider,await provider.getSigner(0),protocol);
 const after=await financialSnapshot(provider,original,originalAbis);
 const unchanged=JSON.stringify(before.state)===JSON.stringify(after.state);
 fs.writeFileSync(path.join(root,'data/social-deployment-preservation.json'),JSON.stringify({before,after,unchanged,excluded:'Test ETH network gas and chain block/time advance'},null,2));
 fs.writeFileSync(output,JSON.stringify(deployment,null,2));fs.writeFileSync(path.join(root,'web/generated/social-deployment.json'),JSON.stringify(deployment,null,2));console.log(JSON.stringify(deployment,null,2));if(!unchanged)throw Error('Financial state changed across deployment; inspect preservation report before proceeding');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
