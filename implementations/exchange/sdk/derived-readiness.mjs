import {ZeroAddress} from 'ethers';

/** Solidity evaluates the predicate; all explanatory reads share its block. */
export async function readDerivedReadiness({provider,registry},id) {
  const block=await provider.getBlock('latest');
  if(!block)throw Error('The current chain block is unavailable.');
  const at={blockTag:block.number},s=await registry.statements(id,at);
  const snapshot={id,blockNumber:block.number,blockHash:block.hash,timestamp:block.timestamp,
    kind:Number(s.kind),dependency:s.dependency,deadline:Number(s.deadline),targetOutcome:Number(s.targetOutcome)};
  const no=(status,reason,extra={})=>({...snapshot,ready:false,status,reason,...extra});
  if(s.market.toLowerCase()===ZeroAddress)return no('unknown','This statement does not exist on this chain.');
  if(Number(s.outcome)!==0)return no('resolved','This statement has already been resolved.',{outcome:Number(s.outcome)});
  if(Number(s.kind)===0)return no('base','A Lean statement requires an external proof or refutation certificate.');
  // Do not turn transport errors or disabled-operator failures into "pending".
  const outcome=Number(await registry.derivedOutcome(id,at));
  if(outcome!==0){
    if(outcome!==1&&outcome!==2)throw Error('The registry returned an invalid outcome.');
    return {...snapshot,ready:true,status:'ready',outcome,reason:`The registry evaluates this predicate as ${outcome===1?'True':'False'} at this block. Submission checks the chain again.`};
  }
  if(Number(s.kind)===4)return no('pending','The governance operator has not determined an outcome yet. No transaction was sent.');
  const parent=await registry.statements(s.dependency,at);
  return no('pending',Number(s.kind)===2
    ?'The dependency is still unresolved. This predicate waits for its recorded outcome. No transaction was sent.'
    :'The dependency is still unresolved and the deadline has not passed. No transaction was sent.',
    {parentOutcome:Number(parent.outcome),parentResolvedAt:Number(parent.resolvedAt)});
}
