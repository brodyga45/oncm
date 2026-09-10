import {AbiCoder,keccak256,ZeroAddress} from 'ethers';
const abi=AbiCoder.defaultAbiCoder(),types=['bytes32','uint64','uint64','uint8'];
export const WINDOW_OPERATOR={id:'0xd071a697d013e4780588b5bb51903dc7ea03506c89bc543039b16be6b588cec6',specification:'0xe8a1c08559ce5792298458b87b496ecf6eafcaf4a0f8bccc29684b7ac55f04f1',runtimeHash:'0x093ec21ed5b620d42cffe8da37a4e40b5404d1fb0908becbdaa1c5f3d35c8404'};
const same=(a,b)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase();
const utc=seconds=>seconds<=8640000000000n?new Date(Number(seconds)*1000).toISOString():null;
export function decodeOperatorReview(record){
 if(!same(record.operatorId,WINDOW_OPERATOR.id)||!same(record.specification,WINDOW_OPERATOR.specification)||!same(record.runtimeHash,WINDOW_OPERATOR.runtimeHash))return{known:false,reason:'Для этой комбинации ID, specification и runtime нет встроенного декодера. Точные operands сохранены ниже.'};
 try{
  const [dependency,start,end,expected]=abi.decode(types,record.params);
  if(abi.encode(types,[dependency,start,end,expected])!==record.params.toLowerCase()||start>end||![1n,2n].includes(expected)||dependency==='0x'+'00'.repeat(32))throw Error('Invalid canonical operands');
  return{known:true,name:'ResolvedWithinWindow',dependency,start:String(start),end:String(end),expected:Number(expected),startUTC:utc(start),endUTC:utc(end),inclusive:true};
 }catch{return{known:false,reason:'Operands не являются допустимым canonical ABI этого оператора. Читаемые аргументы не подставлены.'};}
}
export async function readOperatorReview({provider,registry},statementId){
 if((await provider.getNetwork()).chainId!==31373n)throw Error('Operator review requires Vault chain 31373');
 const block=await provider.getBlock('latest'),at={blockTag:block.number},s=await registry.getStatement(statementId,at);
 if(s.author===ZeroAddress||Number(s.kind)!==4)throw Error('Statement is not a registered governance operation');
 const operatorId=await registry.statementOperator(statementId,at),params=await registry.operationParams(statementId,at),o=await registry.operators(operatorId,at);
 const code=await provider.getCode(o.implementation,block.number);if(code==='0x')throw Error('Registered operator implementation has no bytecode');
 const record={statementId,blockNumber:block.number,blockHash:block.hash,operatorId,params,implementation:o.implementation,specification:o.specification,enabled:o.enabled,runtimeHash:keccak256(code)};
 return{...record,decoded:decodeOperatorReview(record)};
}
