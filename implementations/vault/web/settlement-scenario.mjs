// Owns the public LP scenario read; an old wallet's result must never be labelled
// as the current wallet's inventory. No approval or transaction is performed.
const address=x=>(x||'').toLowerCase();
const same=(a,b)=>a?.client===b?.client&&address(a?.account)===address(b?.account)
 &&address(a?.pool)===address(b?.pool)&&a?.chainId===b?.chainId;
export function scenarioMatches(result,context){
 return !!result&&same(result.binding,context)&&address(result.account)===address(context.account)
  &&address(result.pool)===address(context.pool);
}
export function createSettlementScenario({publish}){
 let context=null,epoch=0,value=null,disposed=false;
 const clear=()=>{epoch++;value=null;if(!disposed)publish(null);};
 const current=(ticket,captured)=>!disposed&&ticket===epoch&&same(context,captured);
 return {
  get value(){return value;},
  setContext(next){if(!same(context,next)){context={...next};clear();}},
  clear,
  dispose(){disposed=true;epoch++;value=null;},
  async load(){
   clear();const captured={...context},ticket=epoch;
   if(!captured.client||!captured.account||!captured.pool)throw Error('Select a wallet and pool for LP scenarios');
   try{
    const network=await captured.client.provider.getNetwork();
    if(!current(ticket,captured))return null;
    if(Number(network.chainId)!==Number(captured.chainId))throw Error('LP scenario wallet is on a different chain');
    const result=await captured.client.settlementStress(captured.pool,captured.account);
    if(!current(ticket,captured))return null;
    const bound={...result,binding:captured};
    if(!scenarioMatches(bound,captured))throw Error('LP scenario returned another wallet or pool');
    value=bound;publish(bound);return bound;
   }catch(error){if(current(ticket,captured))throw error;return null;}
  },
 };
}
