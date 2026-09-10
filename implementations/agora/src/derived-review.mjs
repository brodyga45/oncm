// Local independent copy of reviewed Exchange calendar parser; Agora argument order.
const names={1:'Resolved by deadline',2:'Resolved as outcome',3:'Resolved as outcome by deadline'};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
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
export function derivedReview({kind,dependencyId,deadlineInput,targetOutcome,markets}){
 if(!Object.hasOwn(names,kind))return null;
 const base={kind,type:names[kind],valid:false,args:null};
 const dependency=markets.find(m=>same(m.id,dependencyId));
 if(!dependency)return{...base,error:'Select an existing dependency statement.'};
 const target=kind===1?0:Number(targetOutcome);
 if(kind!==1&&![1,2].includes(target))return{...base,error:'Select True or False as the required outcome.'};
 const deadline=kind===2?null:parseLocalDeadline(deadlineInput);
 if(deadline&&!deadline.valid)return{...base,error:deadline.error};
 return Object.freeze({...base,valid:true,dependencyId:dependency.id,dependencyTitle:dependency.metadata?.title||dependency.id,
  targetOutcome:target,targetLabel:target===0?'Either recorded outcome':target===1?'True':'False',deadline,
  // These exact reviewed values are the transaction arguments; submission never reparses the input.
  args:Object.freeze([kind,dependency.id,target,BigInt(deadline?.unix||0)])});
}
export function reviewedDerivedArguments(review){
 if(!review?.valid||!Array.isArray(review.args))throw Error(review?.error||'Review a valid derived statement before creating it.');
 return review.args;
}
