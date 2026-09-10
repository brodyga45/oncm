/** A tab-local checkpoint. A submitted hash is inspected before any retry. No automatic background writes. */
export function newCreation({owner,registry,token,funding,fee,title,registerCall}){
 return{owner,registry,token,funding,fee,title,registerCall,statementId:null,pool:null,receipts:{},pending:null,complete:false};
}
export async function resumeCreation(state,{owner,registry,send,receipt,event,allowance,assertCurrent=()=>{}}){
 const check=()=>{assertCurrent();if(owner.toLowerCase()!==state.owner.toLowerCase()||registry.toLowerCase()!==state.registry.toLowerCase())throw Error('Creation belongs to a different wallet or registry');};
 check();
 async function step(key,address,contract,method,args){
  check();if(state.receipts[key])return state.receipts[key];
  let result;
  if(state.pending){if(state.pending.step!==key)throw Error('Inspect the pending creation transaction before continuing');result=await receipt(state.pending.hash);check();}
  else result=await send(address,contract,method,args,{onSubmitted:hash=>{state.pending={step:key,hash};}});
  check();if(result.status==='reverted'){state.pending=null;throw Error(`${key} transaction reverted; no step was applied`);}if(result.status!=='success')throw Error('Creation transaction status is not confirmed');
  const name={register:'StatementRegistered',pool:'MarketCreated',approve:'Approval',funding:'FPMMFundingAdded'}[key];
  let valid=false;
  try{const e=event(result,name,address,contract);valid=key==='register'?e.creator.toLowerCase()===state.owner.toLowerCase():key==='pool'?e.statementId===state.statementId&&e.creator.toLowerCase()===state.owner.toLowerCase()&&e.fee===state.fee:key==='approve'?e.owner.toLowerCase()===state.owner.toLowerCase()&&e.spender.toLowerCase()===state.pool.toLowerCase()&&e.value===state.funding:e.funder.toLowerCase()===state.owner.toLowerCase()&&e.amountsAdded.length===2&&e.amountsAdded.some(x=>x===state.funding);}catch{}
  if(!valid){throw Error('Receipt does not confirm the expected '+key+' action; inspect it before retrying');}
  state.receipts[key]=result;state.pending=null;return result;
 }
 if(!state.statementId){const r=await step('register',state.registry,'AgoraRegistry',state.registerCall.method,state.registerCall.args);state.statementId=event(r,'StatementRegistered',state.registry,'AgoraRegistry').statementId;}
 if(!state.pool){const r=await step('pool',state.registry,'AgoraRegistry','createPool',[state.statementId,state.fee]);state.pool=event(r,'MarketCreated',state.registry,'AgoraRegistry').pool;}
 if(state.funding>0n&&!state.receipts.funding){
  // Receipt uncertainty is handled before looking at allowance or sending another transaction.
  if(state.pending?.step==='approve')await step('approve',state.token,'TrueToken','approve',[state.pool,state.funding]);
  if(state.pending?.step!=='funding'&&await allowance(state.pool)<state.funding){check();delete state.receipts.approve;await step('approve',state.token,'TrueToken','approve',[state.pool,state.funding]);}
  await step('funding',state.pool,'FixedProductMarketMaker','addFunding',[state.funding,[]]);
 }
 state.complete=true;return state.receipts.funding??state.receipts.pool;
}
