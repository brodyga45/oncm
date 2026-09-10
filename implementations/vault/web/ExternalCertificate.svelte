<script>
  import { onMount } from 'svelte';
  import { createCertificateImporter } from './certificate-import.mjs';
  import {mergeExternalProofCatalog} from '../sdk/external-profile-catalog.mjs';
  import {decodeBase64} from 'ethers';
  export let sdk;
  export let onuse;
  export let onproposal;
  let state;
  const importer = createCertificateImporter({
    publish: value => { state = value; },
    loadCatalog: async () => {
      // Generic profile/foundation pins live in the standalone app bundle.
      // The API adds optional curated examples and deployment-proposal metadata.
      try {const response = await fetch('/api/external-proofs');
        if(response.ok)return mergeExternalProofCatalog(await response.json());
      }catch{}
      return mergeExternalProofCatalog();
    },
  });
  state = importer.state;
  $: importer.setClient(sdk);
  $: ({ catalog, selected, input, review, verifiedEntry, loading, error } = state);
  $: entry = catalog.find(item => item.descriptor.tag === selected);
  onMount(() => { importer.refresh(); return () => importer.dispose(); });
  function downloadGoal(){
    const url=URL.createObjectURL(new Blob([decodeBase64(review.goalExport.base64)],{type:'application/x-ndjson'}));
    const link=document.createElement('a');link.href=url;link.download=`goal-${review.goalHash.slice(2,14)}.ndjson`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
</script>

<article class="panel">
  <div class="eyebrow">EXTERNAL REAL PROOF · NO LOCAL PROVING</div>
  <h2>Готовые внешние сертификаты</h2>
  <p>Подготовьте сертификат вне сайта или выберите опубликованный пример ниже.
    verified.json или общий пакет с точным goal export проверяется заново через исходный RISC Zero verifier на текущей цепи.
    Импорт не включает профиль и не отправляет транзакцию.</p>
  <label>Ожидаемый профиль<select value={selected} onchange={event => importer.setProfile(event.currentTarget.value)}>
    {#each catalog as item}<option value={item.descriptor.tag}>{item.descriptor.label}</option>{/each}
  </select></label>
  {#if entry}
    <p class="footnote">{entry.descriptor.description}</p>
    <dl><dt>Image</dt><dd>{entry.descriptor.imageId}</dd><dt>Profile</dt><dd>{entry.descriptor.profileId}</dd>
      <dt>Отдельный bridge</dt><dd>{entry.deployment?.bridge || 'Адрес ещё не подтверждён для выбранного registry'}</dd>
      {#if entry.deployment?.registryObservation}<dt>Выбранный registry · блок {entry.deployment.registryObservation.blockNumber}</dt>
        <dd>{entry.deployment.registryObservation.registry} · {entry.deployment.registryObservation.registered ? (entry.deployment.registryObservation.enabled ? 'Профиль включён' : 'Новые регистрации выключены') : 'Профиль ещё не допущен'}</dd>{/if}</dl>
    <div class="button-row">{#each entry.examples as example}<button class="secondary" disabled={loading}
      onclick={() => importer.setInput(JSON.stringify(example.record, null, 2))}>Загрузить {example.key} из CI</button>{/each}</div>
    {#if entry.examples.length}<p class="footnote">Два отдельных примера: «∀ P : Prop, P → P» и опровержимое «∀ P : Prop, P».
      Goal hash относится к точному export и foundation;
      отображаемый Lean source отдельно закреплён хэшем исходника. Сертификат регистрации доказывает
      корректность цели, но ещё не разрешает рынок.</p>{/if}
  {/if}
  <label>Импорт verified.json или external bundle<input type="file" accept="application/json,.json" onchange={event => importer.readFile(event.currentTarget.files?.[0])} /></label>
  <label>Точный JSON сертификата / пакета<textarea class="code-input" value={input} oninput={event => importer.setInput(event.currentTarget.value)} placeholder="verified.json для примера; oncm-external-certificate-bundle-v1 для новой цели" rows="5"></textarea></label>
  <p class="footnote">Новая цель: пакет oncm-external-certificate-bundle-v1 содержит artifact и goalExport (base64, sha256, bytes), необязательные source и metadata. Общий лимит 2 MiB, goal ≤1 MiB, source ≤512 KiB. Проверяется точный kernel export; соответствие произвольного Lean-исходника этой цели не подтверждается одним хешем.</p>
  <button class="primary" disabled={loading || !sdk || !entry || !input} onclick={() => importer.verify()}>
    {loading ? 'Выполняется eth_call…' : 'Проверить original EVM и профиль'}
  </button>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if review && verifiedEntry}
    <div class="callout">
      <strong>Оригинальный Groth16 verifier принял сертификат · блок {review.blockNumber}</strong>
      {#if review.genericBundle}
        <p><strong>Внешняя цель: проверен точный kernel artifact.</strong> Название, описание и Lean-исходник предоставлены автором пакета. Связь source → goal не проверена.</p>
        <dl><dt>Bundle SHA256</dt><dd>{review.bundleSha256}</dd><dt>Goal export SHA256</dt><dd>{review.goalExport.sha256}</dd>
          <dt>Source relation</dt><dd>{review.sourceGoalRelation}</dd><dt>Source SHA256</dt><dd>{review.source?.sha256||'Исходник не приложен'}</dd></dl>
        <button class="secondary" onclick={downloadGoal}>Скачать точный goal export</button>
        {#if review.source}<details><summary>Исходник как provenance, без semantic verification</summary><pre>{review.source.text}</pre>
          {#if review.source.origin}<pre>{JSON.stringify(review.source.origin,null,2)}</pre>{/if}</details>{/if}
      {/if}
      <dl><dt>Verifier</dt><dd>{review.originalVerifier}</dd><dt>Bridge verifier</dt><dd>{review.bridgeVerifier}</dd>
        <dt>Одинаковый runtime code hash</dt><dd>{review.verifierCodeHash}</dd><dt>Goal hash</dt><dd>{review.goalHash}</dd>
        <dt>Назначение</dt><dd>{review.outcome === 0 ? 'Регистрация цели (outcome 0)' : 'Доказательство исхода ' + review.outcome}</dd>
        <dt>Exact bridge</dt><dd>{review.bridgeVerified ? 'Проверка успешна' : 'Нужен отдельный bridge'}</dd>
        <dt>Registry admission</dt><dd>{review.profileEnabled ? 'Профиль включён governance' : review.registered ? 'Новые регистрации выключены' : 'Профиль ещё не включён governance'}</dd></dl>
      {#if review.outcome === 0}
        <button class="primary" disabled={!review.readyForRegistration} onclick={() => onuse(review, verifiedEntry.descriptor)}>
          Заполнить новый рынок этим сертификатом ↗
        </button>
      {:else}
        <button class="primary" disabled={!review.readyForResolution} onclick={() => onuse(review, verifiedEntry.descriptor)}>
          Применить к выбранному утверждению ↗
        </button>
      {/if}
      {#if !review.profileEnabled && verifiedEntry.deployment?.proposal && review.bridgeVerified}
        <button class="secondary" onclick={() => onproposal(verifiedEntry.descriptor, verifiedEntry.deployment)}>
          Подготовить governance proposal ↗
        </button>
      {/if}
      <p class="footnote">Приём профиля проходит обычные proposal → vote → queue → execute.
        После исполнения нажмите проверку снова. Существующий v3 не изменяется.</p>
      <details><summary>Exact profile manifest</summary><pre>{verifiedEntry.descriptor.manifest}</pre></details>
    </div>
  {/if}
</article>
