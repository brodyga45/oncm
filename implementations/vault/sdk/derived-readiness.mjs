import {ZeroAddress} from 'ethers';
const zero=x=>!x||x.toLowerCase()===ZeroAddress.toLowerCase();
function revertName(error,registry){
 if(error?.revert?.name)return error.revert.name;
 const candidates=[error?.data,error?.info?.error?.data,error?.error?.data];
 for(const candidate of candidates){
  for(const data of [candidate,candidate?.data,candidate?.result]){
   if(typeof data!=='string')continue;
   try{const parsed=registry.interface.parseError(data);if(parsed)return parsed.name;}catch{}
  }
 }
 return null;
}
/** Actual registry eth_call determines readiness. Explanations use the same
 * block's dependency data; they do not replace operator evaluation in Solidity. */
export async function readDerivedReadiness({provider,registry},statementId){
 if((await provider.getNetwork()).chainId!==31373n)throw Error('Для проверки производного выберите цепь Vault 31373.');
 const block=await provider.getBlock('latest'),at={blockTag:block.number};
 const s=await registry.getStatement(statementId,at),base={statementId,blockNumber:block.number,blockHash:block.hash,timestamp:block.timestamp,kind:Number(s.kind),dependency:s.dependency};
 const no=(status,reason,extra={})=>({...base,ready:false,status,reason,...extra});
 if(zero(s.author))return no('unknown','Утверждение не найдено в текущей цепи.');
 if(Number(s.outcome)!==0)return no('resolved','Производное утверждение уже разрешено. Обновите страницу утверждения.');
 if(Number(s.kind)===0)return no('base','Математической цели нужен внешний сертификат доказательства или опровержения.');
 try{
  await registry.resolveDerived.staticCall(statementId,at);
  return {...base,ready:true,status:'ready',reason:'Контракт определяет исход на этом блоке. При отправке он проверит состояние снова.'};
 }catch(error){
  const name=revertName(error,registry);
  if(name==='NotResolvableYet'){
   if(Number(s.kind)===4)return no('pending','Данные управляющего оператора пока не определяют исход. Обновите проверку после изменения его зависимостей.',{contractError:name});
   const parent=await registry.getStatement(s.dependency,at);
   const reason=Number(s.kind)===2&&Number(parent.outcome)===0
    ?'Родительское утверждение ещё не разрешено. ResolvedAs ждёт его окончательного исхода; транзакция не отправлена.'
    :'Производное пока не разрешимо: ожидается исход зависимости или наступление срока. Транзакция не отправлена.';
   return no('pending',reason,{contractError:name,parentOutcome:Number(parent.outcome),parentResolvedAt:Number(parent.resolvedAt),deadline:Number(s.deadline)});
  }
  if(name==='AlreadyResolved')return no('resolved','Утверждение уже разрешено.',{contractError:name});
  if(name==='UnknownStatement')return no('unknown','Утверждение не найдено в текущей цепи.',{contractError:name});
  // A provider failure or unrelated rejection must not be mislabelled pending.
  throw error;
 }
}
