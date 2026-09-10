<script>
  import {onDestroy} from 'svelte';
  import SocialEntry from './SocialEntry.svelte';
  import {ZeroHash} from 'ethers';
  export let client=null,account='',statementId=ZeroHash,blogOwner='';
  export let onProfile=()=>{},onReceipt=()=>{};
  let rows=[],posts=[],selectedBlog='',draft='',draftTitle='',editing=null,reply=null;
  let sort='top',busy=false,loading=false,error='',notice='',epoch=0,previousClient,previousKey='',block=null;
  $: key=[account,statementId,blogOwner].join(':');
  $: if(client!==previousClient||key!==previousKey){previousClient=client;previousKey=key;epoch++;draft='';draftTitle='';editing=null;reply=null;selectedBlog='';rows=[];posts=[];busy=false;refresh();}
  onDestroy(()=>epoch++);
  async function refresh(rebuild=false) {
    const ticket=epoch,current=client,postId=selectedBlog;
    if(!current) return;
    loading=true;error='';
    try {
      const state=await current.snapshot({rebuild});
      const nextPosts=blogOwner?await current.blog(blogOwner):[];
      const nextRows=blogOwner?(postId?await current.blogThread(postId,sort):[]):await current.comments(statementId,sort);
      if(ticket!==epoch||current!==client||postId!==selectedBlog)return;
      block=state.block;posts=nextPosts;rows=nextRows;
    }catch(e){if(ticket===epoch)error=e.shortMessage||e.message;}finally{if(ticket===epoch)loading=false;}
  }
  async function act(label,fn) {
    if(busy||!client)return;
    const ticket=epoch,current=client,owner=account;
    const options={isCurrent:()=>ticket===epoch&&current===client&&owner===account};
    busy=true;error='';notice=label;
    try {
      if(!owner)throw Error('Подключите кошелёк: запись отправляется в EAS транзакцией.');
      const receipt=await fn(current,options);
      if(!options.isCurrent())return;
      notice=`Подтверждено в блоке ${receipt.blockNumber} · ${receipt.hash}`;onReceipt(receipt);
      draft='';draftTitle='';editing=null;reply=null;await refresh(true);
    }catch(e){if(ticket===epoch){error=e.shortMessage||e.reason||e.message;notice='';}}finally{if(ticket===epoch)busy=false;}
  }
  function chooseBlog(post){epoch++;selectedBlog=post.id;editing=null;reply=null;draft='';draftTitle='';refresh();}
  function edit(entry){epoch++;editing=entry;reply=null;draft=entry.text;draftTitle=entry.title;}
  function respond(entry){epoch++;editing=null;reply=entry;draft='';draftTitle='';if(blogOwner&&entry.kind===1)selectedBlog=entry.id;refresh();}
  function newBlog(){epoch++;selectedBlog='';editing=null;reply=null;draft='';draftTitle='';rows=[];}
  function submit(){
    const text=draft,title=draftTitle,old=editing,parent=reply||(selectedBlog?posts.find(p=>p.id===selectedBlog):null);
    if(!old&&parent?.deleted){error='Автор скрыл родительскую запись. Её существующее обсуждение доступно для чтения.';return;}
    return act(old?'Редакция в EAS':blogOwner&&!parent?'Публикация в EAS':'Комментарий в EAS',(c,o)=>old
      ?c.editEntry(old.id,{title:old.kind===1?title:'',text,deleted:false},{...o,previousUID:old.uid})
      :c.createEntry({kind:blogOwner&&!parent?1:2,statementId:blogOwner?ZeroHash:statementId,parentId:parent?.id??null,title:blogOwner&&!parent?title:'',text},o));
  }
  function vote(entry,value){const next=entry.votes?.[account.toLowerCase()]===value?0:value;return act('Голос в EAS',(c,o)=>c.vote(entry.id,next,o));}
  function remove(entry){return act('Новая редакция со скрытием',(c,o)=>c.editEntry(entry.id,{deleted:true},{...o,previousUID:entry.uid}));}
  $: writingBlog=editing?editing.kind===1:!!blogOwner&&!selectedBlog&&!reply;
  $: selectedPost=selectedBlog?posts.find(p=>p.id===selectedBlog):null;
  $: replyTarget=reply?(rows.find(p=>p.id===reply.id)||posts.find(p=>p.id===reply.id)||reply):selectedPost;
  $: canCompose=!!editing||!replyTarget?.deleted;
</script>
<section class="social-panel">
  <div class="panel-heading"><h2>{blogOwner?'Личный исследовательский блог':'Обсуждение ончейн'}</h2>
    <button class="secondary" disabled={loading||busy||!client} onclick={()=>refresh(true)}>Перечитать блокчейн</button></div>
  <p class="footnote">Полный текст, автор, ответы, редакции и голоса хранятся в EAS на цепи 31373. Каждая запись требует транзакцию. Голоса обсуждения не меняют разрешение теоремы или governance вес.</p>
  {#if !client}<p>Социальные контракты ещё не подключены к этой сети.</p>{:else}
    {#if block}<small>Прочитан блок {block.number} · {block.hash}</small>{/if}
    {#if loading}<p>Чтение EAS…</p>{/if}{#if error}<p class="error">{error}</p>{/if}{#if notice}<p class="footnote">{notice}</p>{/if}
    {#if blogOwner}
      {#if account.toLowerCase()===blogOwner.toLowerCase()}<button class="secondary" disabled={busy} onclick={newBlog}>Новая запись блога</button>{/if}
      {#each posts as entry(entry.id)}<SocialEntry {entry} {account} {busy} {onProfile} onEdit={edit} onOpenDiscussion={chooseBlog} onReply={respond} onVote={vote} onDelete={remove}/>{/each}
      {#if selectedBlog}<h3>Обсуждение записи {selectedBlog.slice(0,12)}…</h3>{/if}
    {/if}
    {#if !blogOwner||selectedBlog}<label>Сортировка веток<select bind:value={sort} onchange={()=>refresh()}><option value="top">Лучшие</option><option value="new">Новые</option></select></label>{/if}
    {#each rows as entry(entry.id)}<SocialEntry {entry} {account} {busy} {onProfile} onEdit={edit} onReply={respond} onVote={vote} onDelete={remove}/>{/each}
    {#if !canCompose}<p class="footnote">Автор скрыл родительскую запись. Существующие ответы и история доступны; новый ответ на скрытую запись не принимается.</p>{/if}
    {#if canCompose&&(!blogOwner||selectedBlog||reply||editing||account.toLowerCase()===blogOwner.toLowerCase())}
      {#if editing}<p>Редакция {editing.id.slice(0,12)}… · прежний текст остаётся доступным</p>{:else if reply}<p>Ответ на {reply.id.slice(0,12)}…</p>{/if}
      {#if writingBlog}<label>Заголовок<input bind:value={draftTitle} maxlength="180" disabled={busy}/></label>{/if}
      <textarea bind:value={draft} disabled={busy} placeholder={writingBlog?'Полный текст записи блога':'Вопрос о формализации, подход к доказательству…'}></textarea>
      <p class="footnote">Лимит текста: {writingBlog?'16 384':'8 192'} UTF-8 байт. Скрытие не стирает историю.</p>
      <button class="primary" disabled={busy||!account||!draft.trim()||(writingBlog&&!draftTitle.trim())} onclick={submit}>{editing?'Сохранить редакцию ончейн':writingBlog?'Опубликовать ончейн':reply||selectedBlog?'Отправить ответ ончейн':'Добавить комментарий ончейн'}</button>
      {#if editing||reply}<button class="text-button" disabled={busy} onclick={()=>{epoch++;editing=null;reply=null;draft='';draftTitle='';}}>Отменить редактор</button>{/if}
    {/if}
  {/if}
</section>
<style>.social-panel{margin-top:1rem}.social-panel>small,.footnote{overflow-wrap:anywhere}.error{color:#f29083}textarea{min-height:100px}</style>
