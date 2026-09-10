// Calendar parser reused from Exchange; no protocol/clock change.
const pad=n=>String(n).padStart(2,'0');
/** Parse exactly the browser's local calendar input. Reject Date normalization
 * (invalid calendar days or nonexistent DST wall times) before obtaining Unix. */
export function parseLocalDeadline(input){
 if(typeof input!=='string'||!input)return{valid:false,error:'Enter a local deadline before creating this statement.'};
 const match=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input);
 if(!match)return{valid:false,error:'Deadline must be a local date and time: YYYY-MM-DD HH:mm, optionally with seconds.'};
 const [year,month,day,hour,minute,second]=match.slice(1).map((n,i)=>i===5&&n===undefined?0:Number(n));
 if(year<1970||month<1||month>12||day<1||day>31||hour>23||minute>59||second>59)return{valid:false,error:'Deadline contains an invalid calendar date or time.'};
 const date=new Date(year,month-1,day,hour,minute,second,0);
 if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day||date.getHours()!==hour||date.getMinutes()!==minute||date.getSeconds()!==second)return{valid:false,error:'This local date/time does not exist in the selected calendar or timezone.'};
 const unix=date.getTime()/1000;
 if(!Number.isSafeInteger(unix)||unix<=0)return{valid:false,error:'Deadline Unix timestamp must be a positive whole number of seconds.'};
 const offset=-date.getTimezoneOffset(),sign=offset<0?'-':'+',absolute=Math.abs(offset),zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 return Object.freeze({valid:true,input,unix,utc:date.toISOString(),timeZone:zone,
  local:`${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)} UTC${sign}${pad(Math.floor(absolute/60))}:${pad(absolute%60)} (${zone})`});
}
export function derivedReview({statement,kind,expected,deadlineInput}) {
 const k=Number(kind),e=k===1?0:Number(expected),base={valid:false,args:null};
 if(!statement?.id)return{...base,error:'Выберите существующее родительское утверждение.'};
 if(![1,2,3].includes(k)||k!==1&&![1,2].includes(e))return{...base,error:'Выберите оператор и ожидаемый исход.'};
 const deadline=k===2?null:parseLocalDeadline(deadlineInput);
 if(deadline&&!deadline.valid)return{...base,error:deadline.error};
 return Object.freeze({valid:true,parentId:statement.id,parentTitle:statement.title,kind:k,expected:e,
  expectedLabel:e===0?'Любой записанный исход':e===1?'True':'False',deadline,
  args:Object.freeze([statement.id,k,e,deadline?.unix||0])});
}
export function derivedArguments(review){if(!review?.valid)throw Error(review?.error||'Проверьте параметры производного.');return review.args;}
