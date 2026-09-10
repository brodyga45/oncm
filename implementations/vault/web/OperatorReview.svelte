<script>
 import {onMount,onDestroy} from 'svelte';import {readOperatorReview} from '../sdk/operator-review.mjs';
 export let sdk,statementId;
 let review=null,error='',loading=false,alive=true,epoch=0;
 async function refresh(){const ticket=++epoch,client=sdk,id=statementId;loading=true;error='';
  try{const next=await readOperatorReview({provider:client.provider,registry:client.registry},id);if(alive&&ticket===epoch&&client===sdk&&id===statementId)review=next;}
  catch(e){if(alive&&ticket===epoch){review=null;error=e.shortMessage||e.message;}}
  finally{if(alive&&ticket===epoch)loading=false;}
 }
 onMount(refresh);onDestroy(()=>{alive=false;epoch++;});
</script>
<section aria-label="Governance operator details">
 <h3>Governance operator</h3><button class="text-button" disabled={loading} onclick={refresh}>Обновить данные оператора</button>
 {#if error}<p role="alert">{error}</p>{/if}
 {#if review}<dl>
  <dt>Operator ID</dt><dd>{review.operatorId}</dd><dt>Adapter</dt><dd>{review.implementation}</dd>
  <dt>Specification hash</dt><dd>{review.specification}</dd><dt>Runtime code hash</dt><dd>{review.runtimeHash}</dd>
  <dt>Новые регистрации</dt><dd>{review.enabled?'Разрешены':'Отключены; существующие условия сохраняют evaluator'}</dd>
  {#if review.decoded.known}<dt>Оператор</dt><dd>{review.decoded.name}</dd>
   <dt>Исходное утверждение из operands</dt><dd>{review.decoded.dependency}</dd>
   <dt>Начало окна (включительно)</dt><dd>{review.decoded.startUTC||'Вне диапазона календарного отображения'} · Unix {review.decoded.start}</dd>
   <dt>Конец окна (включительно)</dt><dd>{review.decoded.endUTC||'Вне диапазона календарного отображения'} · Unix {review.decoded.end}</dd>
   <dt>Ожидаемый исход</dt><dd>{review.decoded.expected===1?'True':'False'}</dd>
  {/if}
  <dt>Точные ABI operands</dt><dd>{review.params}</dd>
 </dl>
 {#if !review.decoded.known}<p>{review.decoded.reason}</p>{/if}
 <p class="footnote">Снимок блока {review.blockNumber}. Для governance module зависимости и параметры задаются его operands; общее поле dependency реестра здесь не используется. Декодер — представление данных; окончательный исход вычисляет допущенный onchain adapter.</p>
 {:else if loading}<p>Чтение текущего operator mapping и bytecode…</p>{/if}
</section>
