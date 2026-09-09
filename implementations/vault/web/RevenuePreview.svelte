<script>
  import { onMount } from 'svelte';
  import { formatEther, ZeroAddress } from 'ethers';
  export let sdk, account = '', statements = [], token;
  let snapshot = null, error = '', loading = false;
  const name = (address) => address.toLowerCase() === token.toLowerCase() ? 'T'
    : statements.some((s) => s.yes.toLowerCase() === address.toLowerCase()) ? 'YES' : 'NO';
  const short = (address) => address.slice(0, 10) + '…' + address.slice(-4);
  async function refresh() {
    loading = true; error = '';
    try { snapshot = await sdk.revenueSnapshot(account || ZeroAddress); }
    catch (e) { error = e.shortMessage || e.message; }
    finally { loading = false; }
  }
  onMount(() => { refresh(); });
</script>

<article class="panel">
  <div class="panel-heading"><h2>Доход по этапам</h2><button class="secondary" disabled={loading} onclick={refresh}>Обновить суммы</button></div>
  {#if error}<p class="callout" role="alert">{error}</p>{/if}
  {#if snapshot}
    <p>Снимок блока {snapshot.blockNumber} · активная эпоха {snapshot.activeEpoch}. Все суммы в исходных активах.</p>
    <p class="footnote">Pending creator — доля aggregate fees, ещё находящихся в Vault, рассчитанная по on-chain ставкам и округлению Controller. Controller creator уже собраны, но ещё не отправлены в Split. Collect переводит обе части в эпоху, действующую в момент транзакции.</p>
    {#each snapshot.pools as pool}<details><summary>Пул {short(pool.pool)}</summary>
      <table><thead><tr><th>Актив</th><th>Pending creator</th><th>Controller creator</th></tr></thead><tbody>
        {#each pool.assets as asset}<tr><td title={asset.token}>{name(asset.token)} {short(asset.token)}</td><td>{formatEther(asset.pendingCreator)}</td><td>{formatEther(asset.controllerCreator)}</td></tr>{/each}
      </tbody></table>
    </details>{/each}
    {#each snapshot.epochs as epoch}<details><summary>Эпоха {epoch.epoch} · Split {short(epoch.split)} · до distribute</summary>
      <table><thead><tr><th>Актив</th><th>Баланс Split</th></tr></thead><tbody>{#each epoch.assets as asset}
        <tr><td title={asset.token}>{name(asset.token)} {short(asset.token)}</td><td>{formatEther(asset.undistributed)}</td></tr>
      {/each}</tbody></table>
    </details>{/each}
    <table><thead><tr><th>Актив</th><th>Forwarded → sweep</th><th>Доступно кошельку</th></tr></thead><tbody>
      {#each snapshot.assets as asset}<tr><td title={asset.token}>{name(asset.token)} {short(asset.token)}</td><td>{formatEther(asset.forwarded)}</td><td>{account ? formatEther(asset.claimable) : 'Подключите кошелёк'}</td></tr>{/each}
    </tbody></table>
    <p class="footnote">Сбор, distribute и получение выполняются отдельными кнопками ниже. Балансы Split могут содержать сохраняемый upstream dust. Они не равны уже зачисленным суммам Warehouse.</p>
  {/if}
</article>

<style>details { margin: 14px 0; } summary { cursor: pointer; } td { overflow-wrap: anywhere; }</style>
