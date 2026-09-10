<script>
  import {onMount,onDestroy} from 'svelte';
  import {formatEther,parseEther} from 'ethers';
  export let sdk, account='', config, statements=[], busy=false, onPrepared, onClaim, onAllocationDraft;
  let snapshot=null, error='', loading=false, preparing=false, alive=true, readEpoch=0;
  let token=config.addresses.TrueToken, recipient='', quantity='',formEpoch=0,lastFormKey='';
  $: assets=[...new Set([config.addresses.TrueToken,...statements.flatMap(s=>[s.yes,s.no])])];
  $: formKey=[token,recipient,quantity,account].join('|');
  $: if(formKey!==lastFormKey){lastFormKey=formKey;formEpoch++;}
  const name=t=>t.toLowerCase()===config.addresses.TrueToken.toLowerCase()?'T':statements.some(s=>s.yes.toLowerCase()===t.toLowerCase())?'YES':'NO';
  const short=a=>a.slice(0,10)+'…'+a.slice(-4);
  async function refresh(){
    const epoch=++readEpoch,client=sdk; loading=true; error='';
    try{const value=await client.treasury.snapshot(assets);if(alive&&epoch===readEpoch&&client===sdk)snapshot=value;}
    catch(e){if(alive&&epoch===readEpoch)error=e.shortMessage||e.message;}
    finally{if(alive&&epoch===readEpoch)loading=false;}
  }
  async function prepareTransfer(){
    const key=formKey,epoch=formEpoch,client=sdk;preparing=true;error='';
    try{
      const plan=await client.treasury.prepare({kind:'transfer',token,recipient,amount:String(parseEther(quantity))});
      if(alive&&epoch===formEpoch&&key===formKey&&client===sdk)await onPrepared(plan);
    }catch(e){if(alive&&epoch===formEpoch&&key===formKey&&client===sdk)error=e.shortMessage||e.message;}
    finally{if(alive)preparing=false;}
  }
  async function claim(t){await onClaim(t);if(alive)await refresh();}
  onMount(refresh);onDestroy(()=>{alive=false;readEpoch++;});
</script>

<article class="panel">
  <div class="panel-heading"><h2>Казна governance</h2><button class="secondary" disabled={busy||loading} onclick={refresh}>Обновить казну</button></div>
  <p>Отдельный выгодополучатель — существующий Timelock. Голосование membership и задержка управляют согласием на уменьшение его доли и расходованием средств. Автоматических выплат всем голосующим нет.</p>
  <dl><dt>Казна / executor</dt><dd><code>{config.addresses.Timelock}</code></dd><dt>Governor</dt><dd><code>{config.addresses.Governor}</code></dd></dl>
  <button class="secondary" disabled={busy||!snapshot} onclick={onAllocationDraft}>Подготовить доли с DAO 20%</button>
  <p class="footnote">Заполняет новый черновик. Текущая эпоха и уже созданные предложения не меняются. Остальные доли масштабируются пропорционально; каждое уменьшение требует согласия получателя.</p>
  {#if error}<p class="callout" role="alert">{error}</p>{/if}
  {#if snapshot}
    <p>Блок {snapshot.blockNumber} · эпоха {snapshot.epoch} · доля DAO {Number(snapshot.shareBps)/100}% · ETH в казне {formatEther(snapshot.nativeBalance)}. Governor вправе планировать вызовы: {snapshot.governorCanSchedule?'да':'нет'}.</p>
    <table><thead><tr><th>Актив</th><th>В казне</th><th>В Warehouse</th><th>Получение</th></tr></thead><tbody>
      {#each snapshot.assets as a}<tr><td title={a.token}>{name(a.token)} {short(a.token)}</td><td>{formatEther(a.balance)}</td><td>{formatEther(a.claimable)}</td><td><button class="text-button" disabled={busy||!account||BigInt(a.claimable)===0n} onclick={()=>claim(a.token)}>Получить → казна</button></td></tr>{/each}
    </tbody></table>
  {:else}<p>Баланс казны ещё не загружен.</p>{/if}
  <p class="footnote">Warehouse withdrawal общедоступен, но owner и получатель incentive зафиксированы как Timelock: средства не переходят вызывающему кошельку. Накопленное в старых эпохах принадлежит прежним получателям.</p>
  <h3>Внутреннее распределение казны</h3>
  <label>Актив казны<select bind:value={token}>{#each assets as t}<option value={t}>{name(t)} · {t}</option>{/each}</select></label>
  <label>Получатель перевода<input bind:value={recipient} placeholder="0x…" /></label>
  <label>Количество (18 decimals)<input bind:value={quantity} placeholder="Например 0.01" /></label>
  <button class="secondary" disabled={busy||preparing||!recipient||!quantity} onclick={prepareTransfer}>Проверить и подготовить proposal</button>
  <p class="footnote">Подготовка выполняет eth_call от Timelock без транзакции. Далее требуется обычное предложение Governor, голосование, queue и execute. Предложение содержит точную сумму ERC20.transfer; текущего баланса должно хватать. Этот помощник переводит T и wrapped outcomes; для ETH здесь показан только баланс.</p>
</article>
