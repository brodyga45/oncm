import React,{useState,useEffect,useRef} from 'react';
const short=x=>x?x.slice(0,8)+'…'+x.slice(-6):'';
const same=(a,b)=>a?.toLowerCase()===b?.toLowerCase();
const download=(data,name)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function useChain(load,deps){
 const [data,setData]=useState(null),[error,setError]=useState('');const current=useRef({generation:0,alive:false,load});current.current.load=load;
 async function refresh(){const r=current.current,ticket=++r.generation;try{const next=await r.load();if(r.alive&&ticket===r.generation){setData(next);setError('');}}catch(e){if(r.alive&&ticket===r.generation)setError(e.shortMessage||e.message);}}
 useEffect(()=>{current.current.alive=true;setData(null);refresh();return()=>{current.current.alive=false;current.current.generation++;};},deps);
 return {data,error,refresh};
}
function Notice(){return <p className="note">Full text, authorship, replies, votes and revisions are onchain. Each write is a wallet transaction with network gas; the social protocol fee is zero. Votes do not change mathematical resolution or governance weight.</p>;}
function History({social,id}){
 const [open,setOpen]=useState(false),state=useChain(()=>open?social.history(id):null,[social,id,open]);
 return <div><button className="link" onClick={()=>setOpen(v=>!v)}>{open?'Hide':'Read'} onchain history</button>{open&&<div className="social-history">{state.error&&<p role="alert">{state.error}</p>}{state.data?.map(r=><article key={r.revision}><small>Revision {r.revision} · {new Date(r.timestamp*1000).toLocaleString()} · {r.deleted?'tombstone':'published'}</small><h4>{r.title}</h4><p>{r.text}</p><code>{r.pointer}</code></article>)}</div>}</div>;
}
function Entry({entry:e,social,address,run,refresh,onProfile,onReply,depth=0}){
 const [editing,setEditing]=useState(false),[text,setText]=useState(e.text),[title,setTitle]=useState(e.title);
 const own=same(address,e.address);
 return <article className="comment" style={{marginLeft:Math.min(depth,8)*16}}>
  <div className="comment-votes">{[1,-1].map(v=><button key={v} className={e.myVote===v?'voted':''} disabled={!address||own||e.deleted} aria-label={(v===1?'Upvote ':'Downvote ')+e.id} onClick={()=>run('Record vote onchain',async()=>{await social.vote(e.id,e.myVote===v?0:v);await refresh();})}>{v===1?'▲':'▼'}</button>)}<strong>{e.score}</strong></div>
  <div className="comment-body"><div className="comment-byline"><button className="author" onClick={()=>onProfile?.(e.address)}><b>{e.profile?.displayName||short(e.address)}</b><code>{e.address}</code></button><time>{new Date(e.createdAt).toLocaleString()}</time></div>
   {e.deleted?<p className="note">Author marked this entry deleted. Its historical text remains onchain.</p>:<><h4>{e.title}</h4><p>{e.text}</p></>}
   <small>{e.utf8Valid===false?"Invalid UTF-8 displayed with replacement; exact bytes remain in chain export. ":""}Observed block {e.observedBlock} · {e.revisionCount} revision(s) · <code>{short(e.id)}</code></small>
   <div className="comment-actions">{e.deleted&&e.myVote!==0&&<button className="link" onClick={()=>run("Withdraw vote onchain",async()=>{await social.vote(e.id,0);await refresh();})}>Withdraw my vote</button>}{!e.deleted&&onReply&&<button className="link" onClick={()=>onReply(e)}>Reply</button>}{own&&!e.deleted&&<><button className="link" onClick={()=>{setText(e.text);setTitle(e.title);setEditing(v=>!v);}}>Edit</button><button className="link" onClick={()=>run('Record tombstone onchain',async()=>{await social.remove(e.id);await refresh();})}>Delete · retain history</button></>}</div>
   {editing&&!e.deleted&&<div className="comment-composer">{e.kind===2&&<input aria-label="Edited blog title" value={title} onChange={x=>setTitle(x.target.value)}/>}<textarea aria-label="Edited text" value={text} onChange={x=>setText(x.target.value)}/><button className="button" disabled={!text.trim()} onClick={()=>run('Publish revision onchain',async()=>{await social.edit(e.id,text,title);setEditing(false);await refresh();})}>Publish revision</button></div>}
   <History social={social} id={e.id}/>
  </div>
 </article>;
}
function ordered(items,root){const byParent=new Map();for(const e of items){const p=e.parentId||null;if(!byParent.has(p))byParent.set(p,[]);byParent.get(p).push(e);}const stack=(byParent.get(root||null)||[]).slice().reverse().map(e=>[e,0]),result=[];while(stack.length){const [e,depth]=stack.pop();result.push([e,depth]);for(const child of (byParent.get(e.id)||[]).slice().reverse())stack.push([child,depth+1]);}return result;}
export function OnchainComments({id,blogRoot,social,address,run,onProfile}){
 const [sort,setSort]=useState('top'),[text,setText]=useState(''),[reply,setReply]=useState(null);
 const state=useChain(()=>!social?null:blogRoot?social.thread(blogRoot,{viewer:address,sort}):social.comments(id,{viewer:address,sort}),[social,id,blogRoot,address,sort]);
 useEffect(()=>{setText('');setReply(null);},[social,id,blogRoot,address]);
 if(!social)return <div className="panel"><h3>Onchain discussion</h3><p>Social contracts are being prepared. Legacy offchain records are preserved separately and are not chain-authored posts.</p></div>;
 return <div className="panel"><div className="section-head"><h3>{blogRoot?'Article discussion':'Research discussion'}</h3><div className="segmented small">{['top','new'].map(s=><button key={s} className={sort===s?'active':''} onClick={()=>setSort(s)}>{s==='top'?'Top':'New'}</button>)}</div></div><Notice/>
  {state.error&&<p className="alert" role="alert">{state.error}</p>}{state.data===null?<p className="note">Reading chain…</p>:ordered(state.data,blogRoot).map(([e,d])=><Entry key={e.id} entry={e} depth={d} social={social} address={address} run={run} refresh={state.refresh} onProfile={onProfile} onReply={setReply}/>)}
  {state.data?.length===0&&<p className="note">No onchain observations yet.</p>}
  {address?<div className="comment-composer">{reply&&<p>Reply to {short(reply.address)} <button className="link" onClick={()=>setReply(null)}>Cancel</button></p>}<textarea aria-label="Onchain comment" value={text} onChange={e=>setText(e.target.value)} placeholder="Add a mathematical observation…"/><button className="button" disabled={!text.trim()} onClick={()=>run('Publish comment onchain',async()=>{if(reply||blogRoot)await social.reply(reply?.id||blogRoot,text);else await social.postComment(id,text);setText('');setReply(null);await state.refresh();})}>{reply||blogRoot?'Post reply':'Post comment'} onchain</button></div>:<p className="note">Connect a wallet to write or vote. Public reading needs no sign-in.</p>}
 </div>;
}
export function OnchainProfile({address,currentAddress,social,run,sdk,markets,onClose,error,onProfile}){
 const [name,setName]=useState(''),[bio,setBio]=useState(''),[title,setTitle]=useState(''),[body,setBody]=useState(''),[activeBlog,setActiveBlog]=useState(null);
 const own=same(address,currentAddress);const current=useRef(0);
 const state=useChain(async()=>{
  if(!social)return null;const block=await social.block();const [profile,blogs,balance]=await Promise.all([social.profile(address,{blockTag:block.number}),social.blogs(address,{viewer:currentAddress,blockTag:block.number}),sdk.contract('token').balanceOf(address,{blockTag:block.number})]);return{profile,blogs,balance:String(balance),block:block.number};
 },[social,address,currentAddress,sdk]);
 useEffect(()=>{current.current++;setName('');setBio('');setTitle('');setBody('');setActiveBlog(null);return()=>{current.current++;};},[social,address,currentAddress]);
 useEffect(()=>{if(state.data){setName(state.data.profile.displayName);setBio(state.data.profile.bio);}},[state.data?.profile.updatedAt,state.data?.profile.id]);
 const article=state.data?.blogs.find(e=>e.id===activeBlog);
 return <div className="modal-overlay"><div className="modal profile-modal">
  <div className="section-head"><span className="eyebrow">ONCHAIN WALLET JOURNAL</span><button className="close" onClick={onClose}>×</button></div>{(error||state.error)&&<p className="alert" role="alert">{error||state.error}</p>}
  <h2>{state.data?.profile.displayName||'Researcher'}</h2><code>{address}</code> <a className="link" href={"?wallet="+address}>Permanent wallet page</a><p>{state.data?.profile.bio||'This address has not published a bio.'}</p><Notice/>
  {!social?<p>Social contracts are not yet deployed. Old offchain profiles remain archived.</p>:<>
   <p className="note">Observed block {state.data?.block??'…'} · {markets.filter(m=>same(m.creator,address)).length} created markets · {state.data?Number(BigInt(state.data.balance)/10n**14n)/10000:'…'} available T</p>
   {state.data?.profile.id&&<History social={social} id={state.data.profile.id}/>}
   {own&&<><div className="rule"/><h3>Profile</h3><label className="field"><span>DISPLAY NAME</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label><label className="field"><span>BIO</span><textarea value={bio} onChange={e=>setBio(e.target.value)}/></label><button className="button" onClick={()=>run('Save onchain profile',async()=>{await social.saveProfile(name,bio);await state.refresh();})}>Save profile onchain</button>
    <div className="rule"/><h3>Write a blog post</h3><label className="field"><span>ARTICLE TITLE</span><input value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="field"><span>FULL ARTICLE · UP TO 8 KiB UTF-8</span><textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="A thesis, trading note, or mathematical question…"/></label><button className="button" disabled={!title.trim()||!body.trim()} onClick={()=>run('Publish wallet blog onchain',async()=>{await social.publishBlog(title,body);setTitle('');setBody('');await state.refresh();})}>Publish article onchain</button></>}
   <div className="rule"/><h3>Personal blog</h3>{!state.data?.blogs.length&&<p className="note">No onchain articles yet.</p>}{state.data?.blogs.map(e=><div key={e.id}><Entry entry={e} social={social} address={currentAddress} run={run} refresh={state.refresh} onProfile={onProfile}/><button className="link" onClick={()=>setActiveBlog(activeBlog===e.id?null:e.id)}>{activeBlog===e.id?'Close':'Open'} article discussion</button></div>)}
   {article&&<OnchainComments key={article.id} blogRoot={article.id} social={social} address={currentAddress} run={run} onProfile={onProfile}/>}
   <div className="rule"/><button className="button secondary" onClick={()=>run('Rebuild social archive from chain',async()=>{const ticket=current.current;const data=await social.rebuildIndex();if(ticket===current.current)download(data,'exchange-onchain-social.json');})}>Rebuild & export onchain social archive</button><p className="note">The export includes original text, all revisions, blog entries and votes with the exact observed block. It can be reconstructed from RPC.</p>
  </>}
 </div></div>;
}
