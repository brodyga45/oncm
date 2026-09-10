import {parseLocalDeadline} from './derived-review.mjs';

/** Calendar UI uses the same strict parser as derived predicates. The SDK still
 * receives exact uint64 strings; neither display formatting nor Date coercion
 * can change the ordered proposal arguments. */
export function monetaryWindow({start,end,claimDeadline}, now) {
  const rows=[];
  for(const [key,label] of [['start','Начало'],['end','Конец начислений'],['claimDeadline','Конец получения наград']]) {
    const input={start,end,claimDeadline}[key], date=parseLocalDeadline(input);
    if(!date.valid)return{valid:false,error:`${label}: ${date.error}`};
    rows.push({key,label,...date});
  }
  const values=Object.fromEntries(rows.map(r=>[r.key,String(r.unix)]));
  if(BigInt(values.start)>=BigInt(values.end)||BigInt(values.end)>=BigInt(values.claimDeadline))return{valid:false,error:'Начало должно предшествовать концу начислений, а получение наград — заканчиваться позже начислений.'};
  if(now!=null&&BigInt(values.start)<=BigInt(now))return{valid:false,error:'Начало программы должно быть позже времени последнего прочитанного блока.'};
  return Object.freeze({valid:true,rows:Object.freeze(rows),values:Object.freeze(values)});
}
