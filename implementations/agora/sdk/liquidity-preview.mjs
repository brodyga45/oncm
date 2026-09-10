import {assertBaseUnits} from './amounts.mjs';
const mul=(a,b)=>assertBaseUnits(a*b);
/** Exact floor divisions from pinned Gnosis FPMM addFunding([], no distribution hint). */
export function fundingPreview({balances,totalSupply},addedFunds){
 const n=assertBaseUnits(addedFunds),s=assertBaseUnits(BigInt(totalSupply)),b=balances.map(x=>assertBaseUnits(BigInt(x)));if(n===0n||b.length!==2)throw Error('Enter a positive amount for this binary pool');
 if(s===0n)return{t:n,shares:n,retained:[n,n],returned:[0n,0n]};
 const weight=b[0]>b[1]?b[0]:b[1];if(weight===0n)throw Error('Funded pool has no reserves');
 const retained=b.map(x=>mul(n,x)/weight);return{t:n,shares:mul(n,s)/weight,retained,returned:retained.map(x=>n-x)};
}
/** _burn first withdraws all accrued sender fees, not just a proportional part. */
export function withdrawalPreview({balances,totalSupply,ownedShares,fees},shares){
 const n=assertBaseUnits(shares),s=assertBaseUnits(BigInt(totalSupply));if(n===0n||s===0n||n>BigInt(ownedShares)||n>s)throw Error('Amount exceeds available LP shares or is zero');
 return{shares:n,returned:balances.map(x=>mul(BigInt(x),n)/s),tFees:BigInt(fees)};
}
export function completeSetPreview({yes,no,t},n,merge=false){
 n=assertBaseUnits(n);const limit=merge?(BigInt(yes)<BigInt(no)?BigInt(yes):BigInt(no)):BigInt(t);if(n===0n||n>limit)throw Error(merge?'Insufficient matched YES and NO balances':'Insufficient T balance');return{amount:n,limit,merge};
}
export async function readLiquiditySnapshot({client,pool,owner,abi}){
 const blockNumber=await client.getBlockNumber();const read=(functionName,args=[])=>client.readContract({address:pool,abi,functionName,args,blockNumber});
 const [balances,totalSupply,ownedShares]=await Promise.all([read('getPoolBalances'),read('totalSupply'),read('balanceOf',[owner])]);
 const fees=totalSupply===0n?0n:await read('feesWithdrawableBy',[owner]);return{pool,owner,blockNumber,balances,totalSupply,ownedShares,fees};
}
