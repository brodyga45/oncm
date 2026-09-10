const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const addressKey=value=>{
 if(typeof value!=='string'||!/^0x[0-9a-f]{40}$/i.test(value))throw Error('Invalid balance address');
 return value.toLowerCase();
};
export function uniqueBalanceActors(addresses){
 const found=new Map();for(const address of addresses.filter(Boolean)){const key=addressKey(address);if(!found.has(key))found.set(key,address);}
 return [...found.values()];
}
// Position-aware identity is explicit; it does not imply that this endpoint reads ERC1155 balances.
export function balanceAssetKey(asset){
 const a=typeof asset==='string'?{address:asset,kind:'erc20'}:asset;
 const kind=a.kind||'erc20';
 const idField=a.positionId!==undefined?'positionId':a.tokenId!==undefined?'tokenId':null;
 if(a.positionId!==undefined&&a.tokenId!==undefined)throw Error('Ambiguous balance position identity');
 const id=idField?BigInt(a[idField]):null;if(id!==null&&id<0n)throw Error('Invalid balance position');
 return JSON.stringify([addressKey(a.address),kind,idField,id?.toString()??null]);
}
export function uniqueBalanceAssets(assets){
 const found=new Map();for(const asset of assets){const key=balanceAssetKey(asset);if(!found.has(key))found.set(key,asset);}
 return [...found.values()];
}
export function historicalDelta(before,after){return(BigInt(after)-BigInt(before)).toString();}

export async function activityBalanceRows({transaction,receipt,collateral,hasCode,readBalance}){
 const candidates=[transaction.from,transaction.to].filter(Boolean),assets=[collateral];
 for(const log of receipt.logs){
  if(log.topics[0]!==transferTopic)continue;
  assets.push(log.address);
  if(log.topics.length===3)for(const topic of log.topics.slice(1))if(!/^0x0+$/.test(topic))candidates.push('0x'+topic.slice(-40));
 }
 const actors=uniqueBalanceActors(candidates),beforeBlock=Math.max(0,receipt.blockNumber-1),rows=[];
 for(const asset of uniqueBalanceAssets(assets)){
  let existed;try{existed=await hasCode(asset,beforeBlock);}catch{continue;}
  for(const actor of actors){
   try{
    const before=existed?String(await readBalance(asset,actor,beforeBlock)):'0';
    const after=String(await readBalance(asset,actor,receipt.blockNumber));
    rows.push({asset,actor,before,after,delta:historicalDelta(before,after)});
   }catch{/* Preserve the endpoint's existing behavior for contracts without balanceOf(address). */}
  }
 }
 return rows;
}
