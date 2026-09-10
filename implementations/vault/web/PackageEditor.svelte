<script>
  import { onDestroy } from 'svelte';
  import { createPackageEditor } from './package-editor.mjs';
  export let api, account, statement = null, currentSource = '', onUseSource,
    client, chainId, chainInstance, registry, selectedProfileId, allowPublication = true;
  let challengeSource = '', solutionSource = '', description = '', lakefile = '', lakeManifest = '',
    leanVersion = '', outcome = '1', records = [], selected = '', prepared = null,
    error = '', working = false, publicConsent = false;
  const editor = createPackageEditor({
    request: (...args) => api(...args),
    onChange: (state) => { ({records, prepared, error, working, consent: publicConsent} = state); },
    onReset: () => { challengeSource = ''; solutionSource = ''; description = ''; lakefile = '';
      lakeManifest = ''; leanVersion = ''; outcome = '1'; selected = ''; },
    download: async (submitted, isCurrent) => {
      const response = await fetch('/api/packages/download', {
        method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(submitted),
      });
      if (!response.ok) throw Error((await response.json()).error || response.statusText);
      const blob = await response.blob();
      if (!isCurrent()) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'vault-lean-package.zip'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  $: editor.setContext({account, statement, client, chainId, chainInstance, registry, profileId: selectedProfileId});
  $: editor.setDraft({challengeSource, solutionSource, description, lakefile: lakefile || undefined,
    lakeManifest: lakeManifest || undefined, leanVersion: leanVersion || undefined, outcome: Number(outcome)});
  $: record = records.find((p) => p.id === selected) || records.at(-1);
  $: isAuthor = account && statement?.kind === 0 && statement?.author.toLowerCase() === account.toLowerCase();
  const useSource = pkg => onUseSource(pkg.files.find(f => f.path === 'Runner.lean').content,
    {profileId:pkg.context?.statement?.profileId || pkg.context?.profileId || selectedProfileId});
  onDestroy(() => editor.dispose());
</script>

<article class="panel package-editor">
  <h2>{statement ? 'Опубликованная Lean-постановка и пакет' : 'Подготовить переносимый Lean-пакет'}</h2>
  {#if error}<p class="callout" role="alert">{error}</p>{/if}
  {#if statement}
    <p class="footnote">Проверяемый goal commitment: <code>{statement.goalHash}</code> · profile <code>{statement.profileId}</code>.</p>
    {#if record}
      <label>Публичная ревизия<select bind:value={selected}>
        <option value="">Последняя</option>{#each records as p}<option value={p.id}>{p.revision} · {p.publishedAt}</option>{/each}
      </select></label>
      <p>Опубликовано адресом <code>{record.author}</code>. SHA-256 пакета: <code>{record.packageHash}</code>.</p>
      <p class="callout">Это исходник автора. Хеши файлов обеспечивают точность скачивания; Связь этого исходника с canonical goal не проверена (sourceGoalRelation: not-verified). Публикация не является принятым доказательством.</p>
      <pre class="public-source">{record.files.find((f) => f.path === 'Challenge.lean')?.content}</pre>
      <details><summary>Solution и метаданные</summary>
        {#each record.files.filter((f) => ['Solution.lean', 'formalization.yaml', 'lean-toolchain'].includes(f.path)) as f}
          <h3>{f.path}</h3><code>SHA-256 {f.sha256}</code><pre class="public-source">{f.content}</pre>
        {/each}
      </details>
      <a class="secondary" download href={'/api/statements/' + statement.id + '/publications/' + record.id + '/package.zip'}>Скачать публичный ZIP</a>
      <button class="secondary" onclick={() => useSource(record)}>Открыть исходник в Lean Lab</button>
    {:else}<p>Автор ещё не опубликовал читаемый исходник. Goal hash сам по себе не позволяет восстановить Lean-код.</p>{/if}
  {/if}
  <details>
    <summary>Редактор пакета {statement ? '/ явная публикация автором' : ''}</summary>
    <p class="footnote">Экспорт остаётся личным скачиванием. Публичное размещение — отдельная кнопка и отдельное согласие. Приватные jobs не читаются при публикации.</p>
    <button class="secondary" onclick={() => { challengeSource = currentSource; prepared = null; }}>Скопировать текущий текст редактора в Challenge</button>
    <p class="footnote">Если текущий текст уже содержит решение, оно также попадёт в Challenge. Перед публикацией просмотрите и разделите файлы вручную.</p>
    <label>Challenge.lean — постановка и окружение<textarea class="lean-editor" bind:value={challengeSource} spellcheck="false"></textarea></label>
    <label>Solution — тело решения; import Challenge добавляется автоматически<textarea class="lean-editor" bind:value={solutionSource} spellcheck="false"></textarea></label>
    <label>Неформальное описание<textarea bind:value={description}></textarea></label>
    <label>Проверяемая сторона<select bind:value={outcome}><option value="1">P</option><option value="2">¬P</option></select></label>
    <details><summary>Окружение и зависимости</summary>
      <p class="footnote">Известный профиль задаёт точную версию Lean. Для иного профиля укажите версию сами. По умолчанию проект без сторонних зависимостей; Mathlib требует собственного закреплённого Lake config/lock.</p>
      <label>Lean version для неизвестного профиля<input bind:value={leanVersion} placeholder="4.33.1" /></label>
      <label>lakefile.lean (необязательно)<textarea bind:value={lakefile}></textarea></label>
      <label>lake-manifest.json (необязательно)<textarea bind:value={lakeManifest}></textarea></label>
    </details>
    <div class="button-row">
      <button class="secondary" disabled={working || !account || !challengeSource.trim()} onclick={() => editor.prepare()}>Предпросмотр файлов</button>
      <button class="secondary" disabled={working || !account || !challengeSource.trim()} onclick={() => editor.download()}>Скачать личный ZIP</button>
    </div>
    {#if prepared}
      <ul>{#each prepared.files as f}<li>{f.path} · SHA-256 <code>{f.sha256}</code></li>{/each}</ul>
      <button class="secondary" onclick={() => useSource(prepared)}>Загрузить пакет в Lean Lab для проверки</button>
      <p class="footnote">Загрузка не запускает вычисление. Native-проверка доступна только для установленного локального профиля; внешние сертификаты импортируются отдельно. Сам пакет не восстанавливает готовность сертификата.</p>
    {/if}
    {#if isAuthor && allowPublication}
      <label class="checkbox"><input type="checkbox" checked={publicConsent} onchange={(event) => editor.setConsent(event.currentTarget.checked)} />Я публикую показанные тексты Challenge, Solution, описание и конфигурацию. Они станут доступны всем.</label>
      <button class="primary" disabled={working || !publicConsent || !challengeSource.trim()} onclick={() => editor.publish()}>Опубликовать новую ревизию исходника</button>
    {/if}
    {#if !allowPublication}<p class="footnote">Публикация исходников через сервер отключена в публичном режиме. Готовый сертификат импортируется отдельно.</p>{/if}
    <p class="footnote">Пакет содержит отдельные Challenge/Solution, Runner, lean-toolchain, Lake config, метаданные и инструкции. Внешние зависимости не скачиваются; принятие в Palomar не гарантируется.</p>
  </details>
</article>

<style>
  .package-editor { margin-top: 24px; }
  .public-source { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 480px; overflow: auto; padding: 16px; background: #f4f5f0; }
  code { overflow-wrap: anywhere; }
  details { margin: 18px 0; }
  summary { cursor: pointer; }
</style>
