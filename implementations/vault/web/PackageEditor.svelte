<script>
  import { onMount } from 'svelte';
  export let api, account, statement = null, currentSource = '', onUseSource;
  let challengeSource = '', solutionSource = '', description = '', lakefile = '', lakeManifest = '',
    leanVersion = '', outcome = '1', publicConsent = false, records = [], selected = '', prepared = null,
    error = '', working = false, preparedKey = '', consentKey = '';
  $: record = records.find((p) => p.id === selected) || records.at(-1);
  $: isAuthor = account && statement?.author.toLowerCase() === account.toLowerCase();
  $: formKey = JSON.stringify([challengeSource, solutionSource, description, lakefile, lakeManifest, leanVersion, outcome]);
  $: if (consentKey !== formKey) publicConsent = false;
  const input = () => ({
    statementId: statement?.id, challengeSource, solutionSource, description,
    lakefile: lakefile || undefined, lakeManifest: lakeManifest || undefined,
    leanVersion: leanVersion || undefined, outcome: Number(outcome),
  });
  async function run(fn) {
    working = true; error = '';
    try { return await fn(); } catch (e) { error = e.message; } finally { working = false; }
  }
  async function load() {
    if (statement) records = await api('/statements/' + statement.id + '/publications');
  }
  async function prepare() {
    const key = formKey, submitted = input();
    return run(async () => {
      prepared = await api('/packages/prepare', { method: 'POST', body: JSON.stringify(submitted) });
      preparedKey = key;
    });
  }
  async function download() {
    await run(async () => {
      const response = await fetch('/api/packages/download', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input()),
      });
      if (!response.ok) throw Error((await response.json()).error || response.statusText);
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
      link.href = url; link.download = 'vault-lean-package.zip'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  async function publish() {
    await run(async () => {
      await api('/statements/' + statement.id + '/publications', {
        method: 'POST', body: JSON.stringify({ ...input(), publish: publicConsent }),
      });
      publicConsent = false;
      await load();
    });
  }
  onMount(() => { run(load); });
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
      <p class="callout">Это исходник автора. Хеши файлов обеспечивают точность скачивания; соответствие формальной цели ончейн проверяется отдельно. Публикация не является принятым доказательством.</p>
      <pre class="public-source">{record.files.find((f) => f.path === 'Challenge.lean')?.content}</pre>
      <details><summary>Solution и метаданные</summary>
        {#each record.files.filter((f) => ['Solution.lean', 'formalization.yaml', 'lean-toolchain'].includes(f.path)) as f}
          <h3>{f.path}</h3><code>SHA-256 {f.sha256}</code><pre class="public-source">{f.content}</pre>
        {/each}
      </details>
      <a class="secondary" download href={'/api/statements/' + statement.id + '/publications/' + record.id + '/package.zip'}>Скачать публичный ZIP</a>
      <button class="secondary" onclick={() => onUseSource(record.files.find((f) => f.path === 'Runner.lean').content)}>Открыть исходник в Lean Lab</button>
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
      <button class="secondary" disabled={working || !account || !challengeSource.trim()} onclick={prepare}>Предпросмотр файлов</button>
      <button class="secondary" disabled={working || !account || !challengeSource.trim()} onclick={download}>Скачать личный ZIP</button>
    </div>
    {#if prepared && preparedKey === formKey}
      <ul>{#each prepared.files as f}<li>{f.path} · SHA-256 <code>{f.sha256}</code></li>{/each}</ul>
      <button class="secondary" onclick={() => onUseSource(prepared.files.find((f) => f.path === 'Runner.lean').content)}>Загрузить пакет в Lean Lab для проверки</button>
      <p class="footnote">Загрузка не запускает вычисление. Проверка и отправка сертификата выполняются отдельными действиями.</p>
    {/if}
    {#if isAuthor}
      <label class="checkbox"><input type="checkbox" bind:checked={publicConsent} onchange={() => consentKey = formKey} />Я публикую показанные тексты Challenge, Solution, описание и конфигурацию. Они станут доступны всем.</label>
      <button class="primary" disabled={working || !publicConsent || !challengeSource.trim()} onclick={publish}>Опубликовать новую ревизию исходника</button>
    {/if}
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
