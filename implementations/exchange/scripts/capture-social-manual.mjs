// Read-only evidence capture for the 2026-09-10 browser session. Never submits transactions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JsonRpcProvider,Contract,Interface} from 'ethers';
import {ExchangeSDK} from '../sdk/index.mjs';
import {ExchangeSocialSDK} from '../sdk/social.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const deployment=read('data/deployment.json'),socialDeployment=read('data/social-deployment.json');
const abis=read('web/generated/abis.json'),socialAbis=read('web/generated/social-abis.json');
const provider=new JsonRpcProvider('http://127.0.0.1:9546');
assert.equal(Number((await provider.getNetwork()).chainId),31372);
const sdk=new ExchangeSDK(provider,null,deployment,abis),social=new ExchangeSocialSDK(sdk,socialDeployment,socialAbis);
const chainBlock=173,statementId='0x9b78961455b75385a452ae8278e749b2a897d75eb615bde01f43726a64e49d7f';
const accounts=['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266','0x70997970C51812dc3A010C7d01b50e0d17dc79C8'];
const steps=[[159,'Alice publishes profile'],[160,'Alice publishes full blog'],[161,'Alice edits blog; original retained'],[162,'Alice posts on exact market'],[163,'Bob votes +1'],[164,'Bob withdraws vote'],[165,'Bob votes -1'],[166,'Bob atomically changes -1 to +1'],[167,'Bob replies to market comment'],[170,'Bob replies to wallet blog'],[173,'Bob tombstones blog reply; text retained']];
const token=new Contract(deployment.contracts.token,abis.TrueToken,provider),registry=new Contract(deployment.contracts.protocol,abis.ExchangeProtocol,provider);
const parsers=['CommentManager','ChannelManager','ExchangeSocialHook'].map(n=>[n,new Interface(socialAbis[n])]);
const receipts=[];
for(const [number,action] of steps){
 const block=await provider.send('eth_getBlockByNumber',['0x'+number.toString(16),true]);
 const transactions=block.transactions.filter(tx=>tx.to?.toLowerCase()===socialDeployment.comments.toLowerCase());assert.equal(transactions.length,1);
 const transaction=transactions[0],receipt=await provider.send('eth_getTransactionReceipt',[transaction.hash]);assert.equal(receipt.status,'0x1');assert.equal(BigInt(transaction.value),0n);
 const before=await Promise.all(accounts.map(a=>token.balanceOf(a,{blockTag:number-1}))),after=await Promise.all(accounts.map(a=>token.balanceOf(a,{blockTag:number})));
 assert.deepEqual(after,before,'Social action changes T');
 const beforeStatement=Array.from(await registry.statements(statementId,{blockTag:number-1})),afterStatement=Array.from(await registry.statements(statementId,{blockTag:number}));assert.deepEqual(afterStatement,beforeStatement,'Social action changes mathematical statement');
 const decodedEvents=receipt.logs.flatMap(log=>{for(const [contract,iface]of parsers){try{const parsed=iface.parseLog(log);if(parsed)return[{address:log.address,contract,event:parsed.name,args:Object.fromEntries(parsed.fragment.inputs.map((input,i)=>[input.name||String(i),parsed.args[i]]))}];}catch{}}return[];});
 receipts.push({action,block:{number,hash:block.hash,timestamp:Number(BigInt(block.timestamp))},transaction,receipt,decodedEvents,tokenBalances:{accounts,before,after},statementUnchanged:true});
}
const block=await provider.getBlock(chainBlock),ids=await social.ids('all',undefined,{blockTag:chainBlock}),entries=[];
for(const id of ids)entries.push({...await social.entry(id,{blockTag:chainBlock}),history:await social.history(id,{blockTag:chainBlock})});
const marketComment='0xc4bf31556a4d80bcf21ec36b40338e431536c342a0dabf96131e1200bebe0d90';
const voteSequence=[];for(const [number,expected]of [[163,1],[164,0],[165,-1],[166,1]]){const e=await social.entry(marketComment,{blockTag:number,viewer:accounts[1]});assert.equal(e.myVote,expected);assert.equal(Number(e.score),expected);voteSequence.push({block:number,vote:e.myVote,score:e.score});}
const output={format:'oncm-exchange-social-browser-evidence-v1',date:'2026-09-10',browserTabId:'102825262',chainId:31372,statementId,socialDeployment:{comments:socialDeployment.comments,hook:socialDeployment.hook,channelId:socialDeployment.channelId},receipts,voteSequence,index:{format:'oncm-exchange-ecp-index-v1',block:{number:block.number,hash:block.hash,timestamp:block.timestamp},entries},scope:'All listed transactions were initiated with visible React controls in the dedicated Chrome tab. Financial transactions from another tab may be interleaved, and are excluded. This script only reads RPC and writes this local evidence file.'};
fs.mkdirSync('data/manual-validation',{recursive:true});fs.writeFileSync('data/manual-validation/onchain-social.json',JSON.stringify(output,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
console.log(JSON.stringify({transactions:receipts.length,entries:entries.length,block:chainBlock,voteSequence,allTAndStatementUnchanged:true}));await provider.destroy();
