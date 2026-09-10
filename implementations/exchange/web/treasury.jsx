import React,{useEffect,useRef,useState} from 'react';
import {formatUnits} from 'ethers';
import {createProofImportGuard} from './proof-import-state.mjs';
import {TreasuryCallReview} from './treasury-review.mjs';

export function DaoTreasury({sdk,address,markets=[],run,busy,onProposed}){
  const assets=markets.flatMap(m=>m.pairs.map((address,i)=>({address,label:`${m.metadata.title||m.id} · ${i?'NO':'YES'}/T LP`})));
  const assetsKey=JSON.stringify(assets),[snapshot,setSnapshot]=useState(null),[error,setError]=useState(''),
    [input,setInput]=useState({kind:'claim',asset:'',proposalId:'',recipient:'',amount:''}),[prepared,setPrepared]=useState(null);
  const guard=useRef(createProofImportGuard()).current,reads=useRef(0);
  guard.select(JSON.stringify([address,input,assetsKey]),sdk);
  const change=(key,value)=>{guard.invalidate();setPrepared(null);setInput(p=>({...p,[key]:value}));};
  async function refresh(){
    const ticket=++reads.current;if(!sdk)return;
    try{const next=await sdk.treasurySnapshot(assets);sdk.assertCurrent?.();if(reads.current===ticket){setSnapshot(next);setError('');}}
    catch(e){if(reads.current===ticket){setSnapshot(null);setError(e.shortMessage||e.message);}}
  }
  useEffect(()=>{setSnapshot(null);setPrepared(null);refresh();return()=>{reads.current++;guard.invalidate();};},[sdk,address,assetsKey]);
  async function prepare(){
    const ticket=guard.begin(),client=sdk,captured={...input};setPrepared(null);
    const result=await client.prepareTreasuryCall(captured,assets);client.assertCurrent?.();
    if(guard.current(ticket))setPrepared({call:result,input:captured,ticket});
  }
  async function submit(){
    const pending=prepared,client=sdk;
    const current=()=>{if(!pending||!guard.current(pending.ticket))throw Error('DAO draft changed; prepare the call again');};
    current();await client.proposeTreasuryCall(pending.call,pending.input,assets,current);current();
    setPrepared(null);await refresh();await onProposed?.();
  }
  return <section className="panel" aria-label="DAO beneficiary and treasury">
    <div className="section-head"><h3>DAO beneficiary & treasury</h3><button className="button secondary" disabled={!sdk||!!busy} onClick={()=>run('Refresh DAO treasury',refresh)}>Refresh DAO treasury</button></div>
    <p>The DAO is one top-level beneficiary. Its existing Timelock owns the received assets; each internal distribution requires its own Governor decision.</p>
    {error&&<div className="alert">Treasury snapshot unavailable: {error}</div>}
    {snapshot&&<><p>DAO recipient / Governor executor <code>{snapshot.treasury}</code><br/>Current allocation epoch {snapshot.currentEpoch}: <b>{formatUnits(snapshot.share,2)}%</b> · observed block #{snapshot.blockNumber}<br/>Warehouse permissionless withdrawals {snapshot.withdrawalPaused?'paused':'enabled'}; governed owner withdrawal remains available.</p>
      <p className="note">A zero share means the DAO has not yet been added. Use Fee income → Prepare DAO 20% table, then obtain the consent of every beneficiary whose share decreases.</p>
      <table><thead><tr><th>Asset and exact address</th><th>Held by DAO</th><th>DAO Warehouse credit available</th></tr></thead><tbody>
        {snapshot.assets.map(a=><tr key={a.address}><td>{a.label}<br/><code>{a.address}</code></td><td>{formatUnits(a.balance,a.decimals)} {a.kind}</td><td>{formatUnits(a.claimable,a.decimals)} {a.kind}</td></tr>)}
      </tbody></table>
      <p className="note">LP token units are separate from T. Warehouse credit stays in the original Warehouse until claimed; one raw unit is retained by its withdrawal implementation. No conversion or distribution to voters occurs automatically.</p>
    </>}
    <label className="field"><span>DAO GOVERNANCE ACTION</span><select value={input.kind} onChange={e=>change('kind',e.target.value)}>
      <option value="claim">Claim DAO Warehouse credit</option><option value="consent">Consent to a lower DAO share</option><option value="revoke">Revoke DAO reduction consent</option><option value="transfer">Distribute a DAO-held ERC20 asset</option>
    </select></label>
    {['consent','revoke'].includes(input.kind)?<>
      <label className="field"><span>DAO LOSING ALLOCATION PROPOSAL</span><select value={input.proposalId} onChange={e=>change('proposalId',e.target.value)}>
        <option value="">Choose a current proposal</option>{snapshot?.proposals.filter(p=>p.current&&!p.applied&&p.losing).map(p=><option key={p.id} value={p.id}>#{p.id} · epoch {p.baseEpoch} · {p.consent?'DAO consent present':'DAO consent missing'}</option>)}
      </select></label><p className="note">Only a Governor → Timelock call can speak for the DAO address. Revocation is possible before allocation application; once all consents exist, anyone may apply, so a later vote cannot undo an already applied epoch.</p>
    </>:<label className="field"><span>DAO ASSET</span><select value={input.asset} onChange={e=>change('asset',e.target.value)}><option value="">Choose T or an LP asset</option>{snapshot?.assets.map(a=><option key={a.address} value={a.address}>{a.label} · {a.address}</option>)}</select></label>}
    {input.kind==='transfer'&&<><label className="field"><span>DAO TRANSFER RECIPIENT</span><input value={input.recipient} onChange={e=>change('recipient',e.target.value)}/></label>
      <label className="field"><span>DAO TRANSFER AMOUNT (SELECTED TOKEN UNITS)</span><input value={input.amount} onChange={e=>change('amount',e.target.value)}/></label></>}
    <button className="button secondary" disabled={!sdk||!snapshot||!!busy} onClick={()=>run('Prepare exact DAO governance call',prepare)}>Prepare DAO governance call</button>
    <TreasuryCallReview call={prepared?.call}/>
    <button className="button" disabled={!address||!!busy||!prepared||!guard.current(prepared.ticket)} onClick={()=>run('Create DAO governance proposal',submit)}>Create DAO governance proposal</button>
  </section>;
}
