import React,{useEffect,useRef,useState} from 'react';
import {createProofImportGuard} from './proof-import-state.mjs';
import {readOperatorDetails,OperatorDetails} from './operator-details.mjs';

export function DerivedResolution({m,sdk,address,run,busy}) {
  const [snapshot,setSnapshot]=useState(null),[error,setError]=useState('');
  const guard=useRef(createProofImportGuard());
  guard.current.select(JSON.stringify([m.id,address,m.outcome]),sdk);
  async function refresh(){
    const ticket=guard.current.begin();setSnapshot(null);setError('');
    try{const next=await sdk.derivedReadiness(m);if(next.kind===4)next.operator=await readOperatorDetails(sdk.contract('protocol'),m.id,next.blockNumber);if(guard.current.current(ticket))setSnapshot(next);}
    catch(e){if(guard.current.current(ticket))setError(e.message);}
  }
  useEffect(()=>{refresh();return()=>guard.current.invalidate();},[m.id,m.outcome,sdk,address]);
  async function resolve(){
    const ticket=guard.current.begin();
    await sdk.resolveDerived(m,{isCurrent:()=>guard.current.current(ticket)});
    if(guard.current.current(ticket))await refresh();
  }
  return <div className="panel">
    <h3>Resolve from blockchain history</h3>
    <p>{m.kind===4?'The registered evaluator computes the outcome from this statement’s exact operands. Resolution requires a separate transaction.':'The contract evaluates the recorded dependency outcome and timestamp. Passing a deadline does not send a transaction automatically.'}</p>
    <dl><dt>Statement</dt><dd><code>{m.id}</code></dd></dl>
    {m.kind===4?<OperatorDetails details={snapshot?.operator}/>:<dl><dt>Dependency</dt><dd><code>{m.dependency}</code></dd>
      <dt>Predicate</dt><dd>{['Lean','ResolvedBy','ResolvedAs','ResolvedAsBy'][m.kind]}</dd>
      <dt>Required outcome</dt><dd>{m.kind===1?'Either outcome':m.targetOutcome===1?'True':'False'}</dd>
      <dt>Deadline</dt><dd>{m.deadline?`${new Date(Number(m.deadline)*1000).toISOString()} · Unix ${m.deadline} · inclusive`:'No deadline'}</dd></dl>}
    {error?<p role="alert">{error}</p>:snapshot?<p role="status">{snapshot.reason} Observed at block #{snapshot.blockNumber}.</p>:<p role="status">Reading the predicate at one chain block…</p>}
    <div className="button-row"><button className="button secondary" disabled={busy} onClick={()=>run('Check predicate readiness',refresh)}>Refresh predicate state</button>
    <button className="button" disabled={busy||!address||m.outcome>0||!snapshot?.ready} onClick={()=>run('Resolve derived statement',resolve)}>Resolve when ready</button></div>
  </div>;
}
