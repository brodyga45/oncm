<script>
  import { onMount } from 'svelte';
  import { createCertificateImporter } from './certificate-import.mjs';
  export let sdk;
  export let onuse;
  export let onproposal;
  let state;
  const importer = createCertificateImporter({
    publish: value => { state = value; },
    loadCatalog: async () => {
      const response = await fetch('/api/external-proofs');
      if (!response.ok) throw Error('External proof catalog HTTP ' + response.status);
      return response.json();
    },
  });
  state = importer.state;
  $: importer.setClient(sdk);
  $: ({ catalog, selected, input, review, verifiedEntry, loading, error } = state);
  $: entry = catalog.find(item => item.descriptor.tag === selected);
  onMount(() => { importer.refresh(); return () => importer.dispose(); });
</script>

<article class="panel">
  <div class="eyebrow">EXTERNAL REAL PROOF · NO LOCAL PROVING</div>
  <h2>Готовые внешние сертификаты</h2>
  <p>Подготовьте сертификат вне сайта или выберите опубликованный пример ниже.
    verified.json проверяется заново через исходный RISC Zero verifier на текущей цепи.
    Импорт не включает профиль и не отправляет транзакцию.</p>
  <label>Ожидаемый профиль<select value={selected} onchange={event => importer.setProfile(event.currentTarget.value)}>
    {#each catalog as item}<option value={item.descriptor.tag}>{item.descriptor.label}</option>{/each}
  </select></label>
  {#if entry}
    <p class="footnote">{entry.descriptor.description}</p>
    <dl><dt>Image</dt><dd>{entry.descriptor.imageId}</dd><dt>Profile</dt><dd>{entry.descriptor.profileId}</dd>
      <dt>Отдельный bridge</dt><dd>{entry.deployment?.bridge || 'Ещё не развёрнут'}</dd></dl>
    <div class="button-row">{#each entry.examples as example}<button class="secondary" disabled={loading}
      onclick={() => importer.setInput(JSON.stringify(example.record, null, 2))}>Загрузить {example.key} из CI</button>{/each}</div>
    <p class="footnote">Два отдельных примера: «∀ P : Prop, P → P» и опровержимое «∀ P : Prop, P».
      Goal hash относится к точному export и foundation;
      отображаемый Lean source отдельно закреплён хэшем исходника. Сертификат регистрации доказывает
      корректность цели, но ещё не разрешает рынок.</p>
  {/if}
  <label>Импорт verified.json<input type="file" accept="application/json,.json" onchange={event => importer.readFile(event.currentTarget.files?.[0])} /></label>
  <label>Точный JSON сертификата<textarea class="code-input" value={input} oninput={event => importer.setInput(event.currentTarget.value)} placeholder="Вставьте полный verified.json" rows="5"></textarea></label>
  <button class="primary" disabled={loading || !sdk || !entry || !input} onclick={() => importer.verify()}>
    {loading ? 'Выполняется eth_call…' : 'Проверить original EVM и профиль'}
  </button>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if review && verifiedEntry}
    <div class="callout">
      <strong>Оригинальный Groth16 verifier принял сертификат · блок {review.blockNumber}</strong>
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
