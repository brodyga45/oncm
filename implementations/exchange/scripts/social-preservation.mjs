import {Contract,keccak256} from 'ethers';
export async function financialSnapshot(provider,deployment,abis){
 const b=await provider.getBlock('latest'),at={blockTag:b.number},contracts=deployment.contracts;
 const p=new Contract(contracts.protocol,abis.ExchangeProtocol,provider),t=new Contract(contracts.token,abis.TrueToken,provider),f=new Contract(contracts.factory,abis.UniswapV2Factory,provider);
 const count=Number(await p.count(at));if(count>100)throw Error('Preservation snapshot bound exceeded');
 const statements=[];for(let i=0;i<count;i++){const id=await p.statementIds(i,at);statements.push({id,value:Array.from(await p.statements(id,at))});}
 const addresses=[...(await provider.send('eth_accounts',[])),...Object.values(contracts)];const tokenBalances={};for(const a of [...new Set(addresses)])tokenBalances[a]=String(await t.balanceOf(a,at));
 const n=Number(await f.allPairsLength(at)),pairs=[];if(n>200)throw Error('Pair snapshot bound exceeded');for(let i=0;i<n;i++){const address=await f.allPairs(i,at),pair=new Contract(address,abis.UniswapV2Pair,provider);pairs.push({address,reserves:Array.from(await pair.getReserves(at)),supply:String(await pair.totalSupply(at))});}
 const code={};for(const [key,address]of Object.entries(contracts))code[key]=keccak256(await provider.getCode(address,b.number));
 const state=JSON.parse(JSON.stringify({registry:contracts.protocol,count,statements,tokenSupply:String(await t.totalSupply(at)),tokenBalances,pairs,feeTo:await f.feeTo(at),feeToSetter:await f.feeToSetter(at),code},(_,v)=>typeof v==='bigint'?String(v):v));
 return{block:{number:b.number,hash:b.hash,timestamp:b.timestamp},state};
}
