// Read-only historical supplement to the coordinator/agent browser receipts.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Contract,Interface,parseEther} from 'ethers';
import {createLocalProvider} from '../sdk/local-provider.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const d=read('data/deployment.json'),abis=read('web/generated/abis.json');
const raw=read('docs/evidence/derived/through-229-242.json');
const id='0x6624a45383aa60c6444d0d639e4aa8f17a601fc17bfcdd6aaef4b1b2bf573d0f';
const p=createLocalProvider('http://127.0.0.1:9546');
try{
 assert.equal((await p.getNetwork()).chainId,31372n);
 const registry=new Contract(d.contracts.protocol,abis.ExchangeProtocol,p);
 const statement=await registry.statements(id,{blockTag:242});
 const market=new Contract(statement.market,abis.Market,p),factory=new Contract(d.contracts.factory,abis.UniswapV2Factory,p);
 const yes=await market.outcomeTokens(0,{blockTag:242}),no=await market.outcomeTokens(1,{blockTag:242});
 const yesPair=await factory.getPair(yes,d.contracts.token,{blockTag:242}),noPair=await factory.getPair(no,d.contracts.token,{blockTag:242});
 const actors={Alice:d.accounts[0],Bob:d.accounts[1],Carol:d.accounts[2],strategy:d.contracts.arbitrage};
 const assets={T:d.contracts.token,YES:yes,NO:no,YES_LP:yesPair,NO_LP:noPair};
 const snapshot={};
 for(const block of [230,232,235,238,240,241,242]){
  const balances={};for(const [name,actor]of Object.entries(actors)){balances[name]={};for(const [symbol,address]of Object.entries(assets))balances[name][symbol]=await new Contract(address,abis.TrueToken,p).balanceOf(actor,{blockTag:block});}
  const pools={};for(const [name,address]of Object.entries({YES:yesPair,NO:noPair})){const pair=new Contract(address,abis.UniswapV2Pair,p),t0=await pair.token0({blockTag:block}),reserves=await pair.getReserves({blockTag:block});pools[name]={address,token0:t0,reserveT:t0.toLowerCase()===d.contracts.token.toLowerCase()?reserves[0]:reserves[1],reserveOutcome:t0.toLowerCase()===d.contracts.token.toLowerCase()?reserves[1]:reserves[0],totalSupply:await pair.totalSupply({blockTag:block})};}
  snapshot[block]={balances,pools,ctfCollateral:await new Contract(assets.T,abis.TrueToken,p).balanceOf(d.contracts.ctf,{blockTag:block})};
 }
 const amount=parseEther('10');
 const quote=block=>{const out=side=>{const r=snapshot[block].pools[side];return amount*997n*r.reserveT/(r.reserveOutcome*1000n+amount*997n);};const YES=out('YES'),NO=out('NO');return{block,inputT:amount,YES,NO,returnedT:YES+NO,profitT:YES+NO-amount};};
 const symmetric=quote(238),before=quote(240),after=quote(242);
 const tx=raw.blocks.find(b=>b.block.number===242).transactions[0];
 const iface=new Interface(abis.FullSetArbitrage),call=iface.parseTransaction({data:tx.transaction.input,value:tx.transaction.value});
 assert.equal(call.name,'execute');assert.equal(call.args.statementId,id);assert.equal(call.args.amount,amount);assert.equal(call.args.minProfit,parseEther('2'));assert.equal(tx.receipt.status,'0x1');
 const event=tx.decodedEvents.find(e=>e.event==='FullSetExecuted');assert(event);const args=event.args;
 assert.equal(BigInt(args.profitT),before.profitT);assert.equal(BigInt(args.returnedT),before.returnedT);assert.equal(BigInt(args.inputT),amount);assert(before.profitT>=parseEther('2')&&before.profitT<parseEther('3'));
 const swaps=tx.decodedEvents.filter(e=>e.event==='Swap');assert.equal(swaps.length,2);assert.deepEqual(new Set(swaps.map(e=>e.address.toLowerCase())),new Set([yesPair,noPair].map(a=>a.toLowerCase())));
 for(const swap of swaps){assert.equal(BigInt(swap.args.amount1In),amount);assert.equal(BigInt(swap.args.amount0In),0n);assert.equal(BigInt(swap.args.amount1Out),0n);assert.equal(swap.args.to.toLowerCase(),d.contracts.arbitrage.toLowerCase());}
 assert.equal(swaps.reduce((sum,e)=>sum+BigInt(e.args.amount0Out),0n),before.returnedT);
 assert.equal(snapshot[242].balances.Carol.T-snapshot[241].balances.Carol.T,before.profitT);
 for(const name of ['Carol','strategy'])for(const symbol of ['YES','NO'])assert.equal(snapshot[242].balances[name][symbol],0n);
 assert.equal(snapshot[242].balances.strategy.T,0n);assert.equal(snapshot[242].ctfCollateral-snapshot[241].ctfCollateral,amount);
 assert(symmetric.profitT<0n&&after.profitT<0n);assert.equal(snapshot[238].balances.Alice.T-snapshot[230].balances.Alice.T,-parseEther('80'));
 assert.equal(statement.outcome,0n);assert(snapshot[242].balances.Alice.YES_LP>0n&&snapshot[242].balances.Alice.NO_LP>0n);
 const gasCost=block=>{const t=raw.blocks.find(b=>b.block.number===block).transactions[0];return BigInt(t.receipt.gasUsed)*BigInt(t.receipt.effectiveGasPrice);};
 const result={format:'oncm-exchange-browser-arbitrage-evidence-v1',chainId:31372,throughBlock:242,id,market:statement.market,assets,actors,snapshot,quotes:{symmetric,before,after},execution:{transaction:tx.transaction,receipt:tx.receipt,call:{statementId:call.args.statementId,amount:call.args.amount,minProfit:call.args.minProfit,deadline:call.args.deadline},swaps,event,approvalGasCostWei:gasCost(241),executionGasCostWei:gasCost(242)},assertions:'passed',scope:'Actual browser actions with local test funds. Original V2 reserves and two Swap legs checked against historical onchain balances. Minimum3T was disabled in UI; minimum2T executed successfully. No forced/rejected transaction or mainnet profitability claim. Native gas is excluded from T profit. Alice retains both live LP positions; Bob retains purchased YES; parent and child remain unresolved.'};
 fs.mkdirSync('docs/evidence/arbitrage-browser',{recursive:true});fs.writeFileSync('docs/evidence/arbitrage-browser/through-242.json',JSON.stringify(result,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({id,assets,quotes:result.quotes,profitT:args.profitT,gasCostWei:result.execution.executionGasCostWei,checks:result.assertions},(_,v)=>typeof v==='bigint'?String(v):v));
}finally{await p.destroy();}
