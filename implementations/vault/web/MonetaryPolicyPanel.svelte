<script>
  import {onMount,onDestroy} from 'svelte';
  import {formatMonetaryAmount} from '../sdk/monetary-policy.mjs';
  import {monetaryWindow} from './monetary-window.mjs';
  export let sdk, config, account='', busy=false, onPrepared=async()=>{}, onClaim=async()=>{}, onStake=async()=>{}, onWithdraw=async()=>{}, onClose=async()=>{}, onSyncFees=async()=>{};
  let closePlan=null,feeSyncPlan=null,feeSyncResult=null,feeSyncPool='',feeSyncEpoch=0;
  let snapshot=null,discoveredMeter=null,programOffset='0',stakeAmounts={}, stakeEpoch=0, error='', loading=false, preparing=false, alive=true, readEpoch=0, formEpoch=0;
  let meter='',quantity='',start='',end='',claimDeadline='',remainderRecipient=config.addresses.Timelock,pool='',metric='0',lastKey='';
  let issuanceRecipient='',issuanceAmount='';
  let policyKind='swap-fee',policyPercent='',policyPool='';
  $: formKey=[account,meter,quantity,start,end,claimDeadline,remainderRecipient,pool,metric,policyKind,policyPercent,policyPool,issuanceRecipient,issuanceAmount].join('|');
  $: if(formKey!==lastKey){lastKey=formKey;formEpoch++;}
  $: availableMeters=[...(snapshot?.meters??[]),...(discoveredMeter?[discoveredMeter]:[])].filter((m,i,all)=>all.findIndex(x=>x.address===m.address)===i);
  $: selectedMeter=availableMeters.find(m=>m.address===meter);
  $: periodReview=monetaryWindow({start,end,claimDeadline},snapshot?.timestamp);
  const units=value=>formatMonetaryAmount(String(value??'0'));
  async function refresh(){
    const epoch=++readEpoch,client=sdk,owner=account;loading=true;error='';closePlan=null;
    try{
      const value=client.monetaryPolicy?await client.monetaryPolicy.snapshot(owner,{offset:programOffset,limit:'20'}):{
        supported:false,status:'legacy',token:config.addresses.TrueToken,
        reason:'Этот T поддерживает только genesis-выпуск. Для управляемой эмиссии требуется отдельная явно выбранная версия развёртывания.'
      };
      if(alive&&epoch===readEpoch&&client===sdk&&owner===account)snapshot=value;
    }catch(e){if(alive&&epoch===readEpoch)error=e.shortMessage||e.message;}
    finally{if(alive&&epoch===readEpoch)loading=false;}
  }
  async function prepareFunding(){
    const client=sdk,owner=account,key=formKey,epoch=formEpoch;preparing=true;error='';
    try{
      if(!periodReview.valid)throw Error(periodReview.error);
      const plan=await client.monetaryPolicy.prepare({kind:'create-program',meter,budgetT:quantity,...periodReview.values,remainderRecipient,pool,metric});
      if(alive&&client===sdk&&owner===account&&key===formKey&&epoch===formEpoch)await onPrepared(plan);
    }catch(e){if(alive&&client===sdk&&owner===account&&epoch===formEpoch)error=e.shortMessage||e.message;}
    finally{if(alive)preparing=false;}
  }
  async function discover(){
    const client=sdk,owner=account,key=formKey,epoch=formEpoch;preparing=true;error='';
    try{const found=await client.monetaryPolicy.discoverMeter(pool);if(alive&&client===sdk&&owner===account&&epoch===formEpoch&&key===formKey){discoveredMeter=found;meter=found.address;}}
    catch(e){if(alive&&client===sdk&&owner===account&&epoch===formEpoch)error=e.shortMessage||e.message;}
    finally{if(alive)preparing=false;}
  }
  async function stake(id){const client=sdk,owner=account,value=stakeAmounts[id],epoch=stakeEpoch;await onStake(id,value,{isCurrent:()=>alive&&client===sdk&&owner===account&&value===stakeAmounts[id]&&epoch===stakeEpoch});if(alive&&client===sdk&&owner===account)await refresh();}
  function changeFeePool(){feeSyncEpoch++;feeSyncPlan=null;feeSyncResult=null;}
  async function prepareFeeSync(){
    const client=sdk,owner=account,value=feeSyncPool,epoch=feeSyncEpoch;feeSyncPlan=null;feeSyncResult=null;preparing=true;error='';
    try{const plan=await client.monetaryPolicy.prepareProtocolFeeSync(value);if(alive&&client===sdk&&owner===account&&value===feeSyncPool&&epoch===feeSyncEpoch)feeSyncPlan=plan;}
    catch(e){if(alive&&client===sdk&&owner===account&&epoch===feeSyncEpoch)error=e.shortMessage||e.message;}
    finally{if(alive)preparing=false;}
  }
  async function syncFees(){
    const plan=feeSyncPlan,client=sdk,owner=account,epoch=feeSyncEpoch;
    if(!plan)return;
    const result=await onSyncFees(plan,{isCurrent:()=>alive&&client===sdk&&owner===account&&feeSyncPlan===plan&&epoch===feeSyncEpoch});
    if(result&&alive&&client===sdk&&owner===account&&feeSyncPlan===plan&&epoch===feeSyncEpoch){feeSyncResult=result;feeSyncPlan=null;await refresh();}
  }
  async function prepareClose(id){
    const client=sdk,owner=account,epoch=readEpoch;closePlan=null;preparing=true;error='';
    try{const plan=await client.monetaryPolicy.prepareClose(id);if(alive&&client===sdk&&owner===account&&epoch===readEpoch)closePlan=plan;}
    catch(e){if(alive&&client===sdk&&owner===account)error=e.shortMessage||e.message;}
    finally{if(alive)preparing=false;}
  }
  async function closeProgram(){
    const plan=closePlan,client=sdk,owner=account;
    if(!plan)return;
    await onClose(plan,{isCurrent:()=>alive&&client===sdk&&owner===account&&closePlan===plan});
    if(alive&&client===sdk&&owner===account){closePlan=null;await refresh();}
  }
  async function withdraw(id){await onWithdraw(id);if(alive)await refresh();}
  async function programPage(offset){programOffset=offset;await refresh();}
  async function prepareIssuance(){
    const client=sdk,owner=account,key=formKey,epoch=formEpoch;preparing=true;error='';
    try{const plan=await client.monetaryPolicy.prepare({kind:'mint',recipient:issuanceRecipient,amountT:issuanceAmount});
      if(alive&&client===sdk&&owner===account&&key===formKey&&epoch===formEpoch)await onPrepared(plan);
    }catch(e){if(alive&&client===sdk&&owner===account&&epoch===formEpoch)error=e.shortMessage||e.message;}
    finally{if(alive)preparing=false;}
  }
  async function prepareFees(){
    const client=sdk,owner=account,key=formKey,epoch=formEpoch;preparing=true;error='';
    try{const plan=await client.monetaryPolicy.prepare({kind:policyKind,pool:policyPool,percent:policyPercent});
      if(alive&&client===sdk&&owner===account&&key===formKey&&epoch===formEpoch)await onPrepared(plan);
    }catch(e){if(alive&&client===sdk&&owner===account&&epoch===formEpoch)error=e.shortMessage||e.message;}
    finally{if(alive)preparing=false;}
  }
  async function claim(id){
    const client=sdk,owner=account;
    await onClaim(id);
    if(alive&&client===sdk&&owner===account)await refresh();
  }
  onMount(refresh);onDestroy(()=>{alive=false;readEpoch++;});
</script>

<article class="panel">
  <div class="panel-heading"><h2>Эмиссия и программы наград</h2><button class="secondary" disabled={busy||loading} onclick={refresh}>Обновить денежную политику</button></div>
  <p>T — базовый токен рынков. Для работы протокола не нужна обязательная пара с USDC или ETH. Выпуск T не создаёт голосовой вес MEMBER.</p>
  {#if error}<p class="callout" role="alert">{error}</p>{/if}
  {#if !snapshot}<p>Проверяется версия токена и исполнителя governance…</p>
  {:else if !snapshot.supported}
    <p class="callout">{snapshot.reason}</p>
    <dl><dt>Текущий T</dt><dd><code>{snapshot.token}</code></dd><dt>Версия</dt><dd>{snapshot.status}</dd>{#if snapshot.totalSupply!=null}<dt>totalSupply · блок {snapshot.blockNumber}</dt><dd>{units(snapshot.totalSupply)} T</dd>{/if}</dl>
    <p>Старые рынки сохраняют свой collateral, сертификаты, баланс и историю. Наличие нового исходника не добавляет mint в существующий контракт.</p>
  {:else}
    <dl><dt>Версия политики</dt><dd>{snapshot.version}</dd><dt>Снимок</dt><dd>Блок {snapshot.blockNumber}</dd><dt>T</dt><dd><code>{snapshot.token}</code></dd><dt>Текущий totalSupply</dt><dd>{units(snapshot.totalSupply)} T</dd><dt>Исполнитель</dt><dd><code>{snapshot.executor}</code></dd></dl>
    <h3>Первичный доступ к T и дополнительная эмиссия</h3>
    <p>Governance может отдельно выпустить T выбранному получателю, например для начальной ликвидности. Награды за ещё не состоявшуюся торговлю не обеспечивают начальный баланс.</p>
    <label>Получатель новой эмиссии<input bind:value={issuanceRecipient} placeholder="0x…" /></label><label>Выпустить T<input bind:value={issuanceAmount} inputmode="decimal" /></label>
    <button class="secondary" disabled={busy||preparing||!account||!issuanceRecipient||!issuanceAmount} onclick={prepareIssuance}>Проверить эмиссию и подготовить Governor</button>
    <h3>Бюджет программы</h3>
    <p>Точная эмиссия поступает в программу наград. Это отдельный поток от протокольных комиссий и собственного дохода казны.</p>
    <label>Ончейн-счётчик<select bind:value={meter}><option value="">Выберите измеритель</option>{#each availableMeters as m}<option value={m.address}>{m.name} · {m.kind} · {m.address}</option>{/each}</select></label>
    <label>Пул Balancer программы<input bind:value={pool} placeholder="0x…" /></label><button class="secondary" disabled={busy||preparing||!pool} onclick={discover}>Найти ончейн-счётчик этого пула</button>
    {#if discoveredMeter}<p class="footnote">{discoveredMeter.validation} · {discoveredMeter.statementId} · фактический hash {discoveredMeter.observedRuntimeHash}</p>{/if}
    {#if selectedMeter?.kind==='trade'}<label>Формула веса<select bind:value={metric}><option value="0">Фактический объём T: вход или выход</option><option value="1">Фактическая swap-комиссия только при входе T</option></select></label><p class="footnote">Режим1 не начисляет вес за продажи с выходом T и за EXACT_OUT swaps. Gross volume сам по себе не защищает от торговли между собственными адресами.</p>{/if}
    <p>Даты в местном часовом поясе браузера: ГГГГ-ММ-ДД ЧЧ:ММ, при необходимости с секундами.</p>
    <label>Начало программы<input bind:value={start} placeholder="2030-01-01 12:00" /></label><label>Конец начислений<input bind:value={end} placeholder="2030-01-08 12:00" /></label><label>Конец получения наград<input bind:value={claimDeadline} placeholder="2030-02-01 12:00" /></label>
    {#if periodReview.valid}<div class="callout" aria-label="Проверка периода программы">{#each periodReview.rows as date}<p><strong>{date.label}</strong>: {date.local}<br />UTC {date.utc} · Unix {date.unix}</p>{/each}</div>{:else if start||end||claimDeadline}<p class="callout">{periodReview.error}</p>{/if}
    <label>Неизменяемый получатель остатка<input bind:value={remainderRecipient} /></label>
    <label>Выпустить T в бюджет<input bind:value={quantity} inputmode="decimal" placeholder="Точная сумма, до 18 знаков" /></label>
    <button class="secondary" disabled={busy||preparing||!account||!meter||!quantity||!periodReview.valid||!remainderRecipient||!pool} onclick={prepareFunding}>Проверить выпуск и подготовить решение</button>
    <p class="footnote">Проверка не выпускает токены. После точного review требуется обычное предложение Governor, голосование, Timelock и исполнение.</p>
    <p>Бюджеты уже существующих программ не увеличиваются задним числом. Каждое решение создаёт новую программу с будущим периодом; при изменении programCount требуется новое review.</p>
    <h3>Комиссионная политика</h3>
    <label>Настройка<select bind:value={policyKind}><option value="swap-fee">Общая комиссия обмена пула</option><option value="creator-fee">Protocol creator share пула</option><option value="global-protocol-fee">Global protocol swap share</option></select></label>
    {#if policyKind!=='global-protocol-fee'}<label>Пул политики<input bind:value={policyPool} placeholder="0x…" /></label>{/if}
    <label>Точная ставка · %<input bind:value={policyPercent} inputmode="decimal" /></label>
    <button class="secondary" disabled={busy||preparing||!account||!policyPercent||(policyKind!=='global-protocol-fee'&&!policyPool)} onclick={prepareFees}>Проверить ставку и подготовить решение</button>
    <h3>Применить global protocol ставку к существующему пулу</h3>
    <p>Голосование меняет глобальное значение по умолчанию. Уже созданный пул сохраняет свою закешированную ставку до отдельного обновления. Пул с собственной override-ставкой эта операция не меняет.</p>
    <label>Существующий пул для обновления<input bind:value={feeSyncPool} oninput={changeFeePool} placeholder="0x…" /></label>
    <button class="secondary" disabled={busy||preparing||!account||!feeSyncPool} onclick={prepareFeeSync}>Проверить обновление ставки пула</button>
    {#if feeSyncPlan}<div class="callout"><p>Пул {feeSyncPlan.pool} · блок {feeSyncPlan.blockNumber}. Protocol сейчас {feeSyncPlan.cachedPercent}% → глобальная ставка {feeSyncPlan.globalPercent}%. Контроллер {feeSyncPlan.target}; переводов на выбранный адрес нет.</p><p>{feeSyncPlan.simulation}</p><button disabled={busy||preparing} onclick={syncFees}>Обновить protocol ставку этого пула</button><button class="secondary" disabled={busy} onclick={()=>feeSyncPlan=null}>Отменить обновление ставки</button></div>{/if}
    {#if feeSyncResult}<p class="callout">В блоке {feeSyncResult.after.blockNumber} ставка пула {feeSyncResult.after.pool}: {feeSyncResult.after.cachedPercent}%; глобальная {feeSyncResult.after.globalPercent}%. Транзакция {feeSyncResult.receipt.hash}.</p>{/if}
    <h3>Начисления участника</h3><p>Всего программ: {snapshot.programCount}; страница с {programOffset}. В контракте наград {units(snapshot.balance)} T, зарезервировано {units(snapshot.reserved)} T, свободно {units(snapshot.unreserved)} T.</p><div class="button-row"><button disabled={busy||loading||programOffset==='0'} onclick={()=>programPage('0')}>К первым программам</button><button disabled={busy||loading||snapshot.nextOffset===null} onclick={()=>programPage(snapshot.nextOffset)}>Следующие программы</button></div>
    {#each snapshot.programs??[] as p}<section class="program">
      <strong>Программа {p.id} · {p.name||p.kind}</strong>
      <dl><dt>Формула</dt><dd>{p.formula}</dd><dt>Период Unix</dt><dd>{p.start} → {p.end}; claim до {p.claimDeadline}</dd><dt>Бюджет / уже выплачено</dt><dd>{units(p.budget)} / {units(p.paid)} T</dd><dt>Ваш вес / общий вес</dt><dd>{p.accountWeight??'—'} / {p.totalWeight??'—'}</dd><dt>Доступно claim</dt><dd>{units(p.claimable)} T</dd></dl>
      {#if p.kind==='lp'}<p>Пул BPT {p.pool} · заблокировано {units(p.deposit)} BPT. Досрочного выхода нет; LP fee остаётся в цене BPT.</p><label>Внести BPT в программу<input bind:value={stakeAmounts[p.id]} oninput={()=>stakeEpoch++} inputmode="decimal" /></label><button class="secondary" disabled={busy||!account||!p.canStake||!stakeAmounts[p.id]} onclick={()=>stake(p.id)}>Заблокировать BPT программы {p.id}</button><button class="secondary" disabled={busy||!account||!p.canWithdraw} onclick={()=>withdraw(p.id)}>Вернуть BPT программы {p.id}</button>{/if}
      {#if p.meterValidationError}<p class="callout">Счётчик этой программы не подтверждён каталогом: {p.meterValidationError}</p>{/if}
      <button class="secondary" disabled={busy||!account||BigInt(p.claimable??'0')===0n} onclick={()=>claim(p.id)}>Получить награду программы {p.id}</button>
      <p>Остаток программы направляется только получателю, закреплённому первоначальным решением: <code>{p.remainderRecipient}</code>. Уже возвращено {units(p.reclaimed)} T.</p>
      <button class="secondary" disabled={busy||preparing||!account||p.closed||BigInt(snapshot.timestamp)<BigInt(p.claimDeadline)} onclick={()=>prepareClose(p.id)}>Проверить закрытие программы {p.id}</button>
      {#if p.closed}<p>Программа закрыта.</p>{/if}
      {#if closePlan?.programId===p.id}<div class="callout"><strong>Закрытие программы {closePlan.programId}</strong><p>{units(closePlan.remainder)} T из {closePlan.target} → {closePlan.remainderRecipient}. Точный остаток: {closePlan.remainder} raw T; блок проверки {closePlan.blockNumber}. Отправитель вызывает permissionless close и не выбирает получателя.</p><button disabled={busy||preparing} onclick={closeProgram}>Закрыть программу и вернуть остаток</button><button class="secondary" disabled={busy} onclick={()=>closePlan=null}>Отменить закрытие</button></div>{/if}
    </section>{/each}
  {/if}
  <p class="footnote">Вся собранная протокольная комиссия принадлежит действующему распределителю выгодополучателей. Governance получает только свою долю. LP-комиссия остаётся отдельным потоком. T-награда не является точным возвратом затрат ETH-газа.</p>
</article>

<style>dd,code {overflow-wrap:anywhere;} .program {border-top:1px solid #ddd;padding-top:12px;margin-top:16px;} </style>
