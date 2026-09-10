// Only RPC reads and a local report. No signer, transaction, mining, deployment or proof execution.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Contract,Interface} from 'ethers';
import {createLocalProvider} from '../sdk/local-provider.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const deployment=read('data/deployment.json'),abis=read('web/generated/abis.json'),social=read('data/social-deployment.json');
const provider=createLocalProvider('http://127.0.0.1:9546');assert.equal(Number((await provider.getNetwork()).chainId),31372);
const through=Number(process.argv[2]||188);assert(Number.isInteger(through)&&through>=188&&through<=400);
const scenario=process.argv[3]||'true';assert(['true','false'].includes(scenario));
const first=scenario==='true'?158:202;assert(through>=first);
const id=scenario==='true'?'0x9b78961455b75385a452ae8278e749b2a897d75eb615bde01f43726a64e49d7f':'0x8594060552f0d9bf4b2ae4ef9aba4693c0b7a3ffcaea2b17d9608aa791f767bb';
const registry=new Contract(deployment.contracts.protocol,abis.ExchangeProtocol,provider),s=await registry.statements(id,{blockTag:through});
const market=new Contract(s.market,abis.Market,provider),yes=await market.outcomeTokens(0),no=await market.outcomeTokens(1),conditionId=await market.conditionId();
const factory=new Contract(deployment.contracts.factory,abis.UniswapV2Factory,provider),pairs=await Promise.all([yes,no].map(t=>factory.getPair(t,deployment.contracts.token)));
const accounts=(await provider.send('eth_accounts',[])).slice(0,3);
const assets={T:deployment.contracts.token,YES:yes,NO:no,YES_LP:pairs[0],NO_LP:pairs[1]};
const ctf=new Contract(deployment.contracts.ctf,abis.ConditionalTokens,provider);
const parsers=Object.entries(abis).map(([name,abi])=>[name,new Interface(abi)]);
async function balances(blockTag){const out={};for(const account of accounts){out[account]={};for(const [symbol,address]of Object.entries(assets))out[account][symbol]=String(await new Contract(address,abis.TrueToken,provider).balanceOf(account,{blockTag}));}return out;}
const blocks=[];
for(let number=first;number<=through;number++){
 const b=await provider.send('eth_getBlockByNumber',['0x'+number.toString(16),true]);assert(b,'Requested block unavailable');
 for(const transaction of b.transactions){
  if(transaction.to?.toLowerCase()===social.comments.toLowerCase())continue;
  const receipt=await provider.send('eth_getTransactionReceipt',[transaction.hash]);
  const decodedEvents=receipt.logs.flatMap(log=>{for(const [abi,iface]of parsers){try{const p=iface.parseLog(log);if(p)return[{address:log.address,abi,event:p.name,args:Object.fromEntries(p.fragment.inputs.map((x,i)=>[x.name||String(i),p.args[i]]))}];}catch{}}return[];});
  let call=null;for(const [abi,iface]of parsers){try{const p=iface.parseTransaction({data:transaction.input,value:transaction.value});if(p){call={abi,name:p.name,args:Object.fromEntries(p.fragment.inputs.map((x,i)=>[x.name||String(i),p.args[i]]))};break;}}catch{}}
  const before=number===first?null:await balances(number-1),after=await balances(number),delta={};if(before)for(const a of accounts){delta[a]={};for(const symbol of Object.keys(assets))delta[a][symbol]=String(BigInt(after[a][symbol])-BigInt(before[a][symbol]));}
  blocks.push({block:{number,hash:b.hash,timestamp:Number(BigInt(b.timestamp))},transaction,receipt,call,decodedEvents,balances:{before,after,delta}});
 }
}
const pools=[];for(const address of pairs){const p=new Contract(address,abis.UniswapV2Pair,provider);pools.push({address,token0:await p.token0(),token1:await p.token1(),reserves:Array.from(await p.getReserves({blockTag:through})),totalSupply:await p.totalSupply({blockTag:through}),kLast:await p.kLast({blockTag:through})});}
const token=new Contract(assets.T,abis.TrueToken,provider);
const evidence={format:'oncm-exchange-browser-market-evidence-v1',chainId:31372,throughBlock:through,statementId:id,market:s.market,goal:s.goal,profile:s.profile,conditionId,assets,actors:{Alice:accounts[0],Bob:accounts[1],Carol:accounts[2]},blocks,final:{statement:Array.from(await registry.statements(id,{blockTag:through})),balances:await balances(through),pools,tokenSupply:await token.totalSupply({blockTag:through}),ctfCollateral:await token.balanceOf(deployment.contracts.ctf,{blockTag:through}),payoutDenominator:await ctf.payoutDenominator(conditionId,{blockTag:through}),payoutNumerators:await Promise.all([0,1].map(i=>ctf.payoutNumerators(conditionId,i,{blockTag:through}))),feeTo:await factory.feeTo({blockTag:through})},browserObservations:scenario==='false'?[{afterBlock:201,action:'Generic registration original+bridge verification and exact-goal download',result:'Coordinator browser passed; canonical export1358B/SHA f3970d998f81087ef438303d55b460425ccf4622df367ae485e09deab064afb4.'},{afterBlock:211,action:'Generic CI6 refutation original+bridge verification',result:'Coordinator browser accepted exact profile/goal/outcome2; actual resolution receipt212.'}]:[{afterBlock:172,action:'Merge10 after YES/NO approvals',result:'Root observed generic coalesce error, no merge receipt; retry174 succeeded.'},{afterBlock:188,action:'Bob redemption after approval',result:'Root observed generic coalesce error, no redemption receipt in this initial188 snapshot. Subsequent retries are represented only by actual receipts.'}],scope:'Root performed wallet actions in its separate browser. All matching financial receipts in the selected scenario interval through selected end block are preserved; social CommentManager transactions are excluded. This capture is read-only and does not claim additional browser actions.'};
fs.mkdirSync('data/manual-validation',{recursive:true});const file=`data/manual-validation/perf05-${scenario}-through-${through}.json`;fs.writeFileSync(file,JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
console.log(JSON.stringify({file,through,transactions:blocks.length,operations:blocks.map(x=>[x.block.number,x.call?.name]),payout:evidence.final.payoutNumerators.map(String)}));await provider.destroy();
