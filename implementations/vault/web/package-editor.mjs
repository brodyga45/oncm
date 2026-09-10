const lower=x=>(x||'').toLowerCase();
const scopeKey=c=>JSON.stringify([lower(c.account),c.chainId,c.chainInstance,lower(c.registry),
 c.statement?.id,c.statement?.goalHash,c.statement?.profileId,c.statement?.kind,lower(c.statement?.author),c.profileId]);
/** Public reads survive form edits; private results/consent never survive a
 * wallet, deployment, immutable statement/profile, client or form ABA change. */
export function createPackageEditor({request,download,onChange=()=>{},onReset=()=>{}}){
 let context=null,key='',draft={},draftKey='',contextEpoch=0,formEpoch=0,operation=0,loadEpoch=0,disposed=false;
 let state={records:[],prepared:null,error:'',working:false,consent:false};
 const emit=patch=>{state={...state,...patch};onChange(state);};
 const author=()=>!!context?.account&&lower(context.statement?.author)===lower(context.account)&&context.statement?.kind===0;
 const ticket=(form=false)=>{const c=contextEpoch,f=formEpoch;return()=>!disposed&&c===contextEpoch&&(!form||f===formEpoch);};
 const input=()=>({...draft,statementId:context.statement?.id,profileId:context.statement?.profileId||context.profileId,
  expectedContext:{account:context.account,chainId:context.chainId,chainInstance:context.chainInstance,registry:context.registry,
   statementId:context.statement?.id||null,goalHash:context.statement?.goalHash||null,profileId:context.statement?.profileId||context.profileId}});
 async function load(){
  if(!context?.statement||disposed)return;
  const live=ticket(),n=++loadEpoch,id=context.statement.id;
  try{const records=await request('/statements/'+id+'/publications');if(live()&&n===loadEpoch)emit({records});}
  catch(error){if(live()&&n===loadEpoch)emit({error:error.message});}
 }
 async function run(action){
  if(disposed||!context?.account||!draft.challengeSource?.trim())return;
  if(action==='publish'&&(!author()||!state.consent))throw Error('Explicit current-author publication consent is required');
  const bound=ticket(true),n=++operation,live=()=>bound()&&n===operation,submitted=input(),id=context.statement?.id;
  emit({working:true,error:''});
  try{
   if(action==='download')await download(submitted,live);
   else if(action==='prepare'){
    const prepared=await request('/packages/prepare',{method:'POST',body:JSON.stringify(submitted)});
    if(live()&&n===operation)emit({prepared});
   }else{
    await request('/statements/'+id+'/publications',{method:'POST',body:JSON.stringify({...submitted,publish:true})});
    if(live()&&n===operation){emit({consent:false});await load();}
   }
  }catch(error){if(live()&&n===operation)emit({error:error.message});}
  finally{if(live()&&n===operation)emit({working:false});}
 }
 return {
  setContext(next){const nextKey=scopeKey(next);if(disposed||(key===nextKey&&context?.client===next.client))return;
   context={...next,statement:next.statement?{...next.statement}:null};key=nextKey;contextEpoch++;formEpoch++;operation++;loadEpoch++;
   draft={};draftKey='';emit({records:[],prepared:null,error:'',working:false,consent:false});onReset();void load();},
  setDraft(next){const nextKey=JSON.stringify(next);if(disposed||nextKey===draftKey)return;draft={...next};draftKey=nextKey;formEpoch++;operation++;
   emit({prepared:null,error:'',working:false,consent:false});},
  setConsent(value){emit({consent:!!value&&author()&&!!draft.challengeSource?.trim()});},
  prepare:()=>run('prepare'),download:()=>run('download'),publish:()=>run('publish'),load,
  dispose(){disposed=true;contextEpoch++;},
 };
}
