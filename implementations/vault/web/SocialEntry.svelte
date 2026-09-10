<script>
  export let entry;
  export let account='';
  export let busy=false;
  export let onProfile=()=>{},onEdit=()=>{},onReply=()=>{},onVote=()=>{},onDelete=()=>{};
  export let onOpenDiscussion=null;
  const short=x=>x?.slice(0,10)+'…'+x?.slice(-5);
  $: own=account.toLowerCase()===entry.author.toLowerCase();
</script>
<div class="comment" class:reply={(entry.depth??0)>0} style={`--comment-depth:${Math.min(entry.depth??0,6)}`}>
  <div><button class="profile-link" onclick={()=>onProfile(entry.author)}>{entry.profile?.displayName||short(entry.author)}</button>
    <small>{short(entry.author)}</small><small>{new Date(entry.createdAt).toLocaleString()}</small>
    <small>Блок {entry.revisionBlock??entry.blockNumber}</small>
    {#if own}<button class="text-button" disabled={busy} onclick={()=>onEdit(entry)}>{entry.deleted?'Восстановить / править':'Изменить'}</button>
      {#if !entry.deleted}<button class="text-button" disabled={busy} onclick={()=>onDelete(entry)}>Скрыть новой редакцией</button>{/if}{/if}
  </div>
  {#if entry.title}<h3>{entry.title}</h3>{/if}
  {#if entry.deleted}<p class="muted">Автор скрыл запись. Предыдущие версии сохранены в блокчейне.</p>{:else}<p class="social-text">{entry.text}</p>{/if}
  <div class="comment-actions">
    {#if onOpenDiscussion}<button class="text-button" disabled={busy} onclick={()=>onOpenDiscussion(entry)}>Открыть обсуждение</button>{/if}
    <button disabled={busy||!account||own||(entry.deleted&&entry.votes?.[account.toLowerCase()]!==1)} class:chosen={entry.votes?.[account.toLowerCase()]===1} onclick={()=>onVote(entry,1)}>↑</button>
    <strong>{entry.score||0}</strong>
    <button disabled={busy||!account||own||(entry.deleted&&entry.votes?.[account.toLowerCase()]!==-1)} class:chosen={entry.votes?.[account.toLowerCase()]===-1} onclick={()=>onVote(entry,-1)}>↓</button>
    <button class="text-button" disabled={busy||entry.deleted} onclick={()=>onReply(entry)}>Ответить</button>
  </div>
  <details><summary>Ончейн запись · {short(entry.uid)}</summary>
    <p class="footnote">EAS UID {entry.uid}<br/>Транзакция {entry.transactionHash}<br/>Root {entry.id}</p>
    <p class="footnote">Блок {entry.revisionBlock??entry.blockNumber} · {entry.blockHash}</p>
  </details>
  {#if entry.history.length}<details><summary>История редакций ({entry.history.length})</summary>
    {#each entry.history as h}<div class="revision"><small>Блок {h.revisionBlock??h.blockNumber} · {h.uid}</small>
      {#if h.title}<strong>{h.title}</strong>{/if}<p class="social-text">{h.text}</p><small>Транзакция {h.transactionHash}</small></div>{/each}
  </details>{/if}
  {#if entry.voteHistory.length}<details><summary>История голосов ({entry.voteHistory.length})</summary>
    {#each entry.voteHistory as v}<p class="footnote">{short(v.author)} · {v.value>0?'+':''}{v.value} · блок {v.blockNumber}<br/>{v.transactionHash}</p>{/each}
  </details>{/if}
</div>
<style>.social-text{white-space:pre-wrap;overflow-wrap:anywhere}.revision{padding:.7rem;border-top:1px solid #243b3d}.revision small,.revision strong{display:block;overflow-wrap:anywhere}.footnote{overflow-wrap:anywhere}</style>
