const UINT256_MAX=(1n<<256n)-1n;
/** Decimal human units → integer base units, with no float or rounding step. */
export function parseDecimalUnits(value,decimals=18,label='Amount'){
 if(typeof value==='number'){
  if(!Number.isSafeInteger(value))throw Error(`${label}: use a decimal string to preserve precision`);
  value=String(value);
 }
 if(typeof value!=='string')throw Error(`${label}: enter a decimal string`);
 const text=value.trim();
 if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))throw Error(`${label}: enter a nonnegative decimal, without exponent notation`);
 const [whole='0',fraction='']=text.split('.');
 if(fraction.length>decimals)throw Error(`${label}: at most ${decimals} decimal places; rounding is not applied`);
 const units=BigInt(whole||'0')*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');
 if(units>UINT256_MAX)throw Error(`${label}: exceeds the uint256 token amount limit`);
 return units;
}
export const parseTokenAmount=value=>parseDecimalUnits(value,18,'Token amount');
export function parsePercent(value,decimals,max,label){
 const scaled=parseDecimalUnits(value,decimals,label);
 if(scaled>BigInt(max)*10n**BigInt(decimals))throw Error(`${label}: maximum ${max}%`);
 return scaled;
}
export const parseFeePercent=value=>parsePercent(value,16,10,'Trading fee');
export const parseSlippagePercent=value=>parsePercent(value,2,20,'Slippage');
export const parseAllocationPercent=value=>parsePercent(value,4,100,'Allocation');
export function assertBaseUnits(value){
 if(typeof value!=='bigint'||value<0n||value>UINT256_MAX)throw Error('SDK amounts must be nonnegative uint256 bigint base units; convert decimal strings with parseTokenAmount');
 return value;
}
