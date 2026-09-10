<script>
  import { formatEther } from 'ethers';
  export let proposal, snapshot, account = '', busy = false, onVote, onMove, onCancel;
  const amount = (value) => value === null ? 'Ещё не определён' : formatEther(value);
  const date = (value) => BigInt(value) === 0n ? 'Ещё не поставлено в очередь' : new Date(Number(value) * 1000).toLocaleString();
  $: walletCurrent = snapshot.account === account;
  $: allowed = (action) => !busy && walletCurrent && proposal.actions[action].available;
</script>

<article class="panel proposal">
  <div class="panel-heading"><h2>{proposal.description}</h2><span class="status">{proposal.stateName}</span></div>
  <details><summary>Идентификатор и происхождение</summary>
    <dl><dt>Proposal ID</dt><dd>{proposal.id}</dd><dt>Автор</dt><dd>{proposal.proposer}</dd>
      <dt>Создание</dt><dd>Блок {proposal.blockNumber} · {proposal.txHash}</dd>
      <dt>Хеш обоснования</dt><dd>{proposal.descriptionHash}</dd></dl>
  </details>
  <dl>
    <dt>Snapshot</dt><dd>{proposal.start} · {snapshot.clockMode.includes('mode=blocknumber') ? 'номер блока' : 'Governor clock'}</dd>
    <dt>Конец голосования</dt><dd>{proposal.end} · текущий clock {snapshot.clock}</dd>
    <dt>ETA Timelock</dt><dd>{date(proposal.eta)}{#if BigInt(proposal.eta) > 0n} · Unix {proposal.eta}{/if}</dd>
    <dt>Кворум на snapshot</dt><dd>{amount(proposal.quorum)}{#if proposal.quorum !== null} MEMBER · набрано {amount(proposal.quorumVotes)} · {proposal.quorumReached ? 'достигнут' : 'не достигнут'}{/if}</dd>
    <dt>За / против / воздержались</dt><dd>{amount(proposal.votes[1])} / {amount(proposal.votes[0])} / {amount(proposal.votes[2])} MEMBER</dd>
    <dt>Ваш вес на snapshot</dt><dd>{account && walletCurrent ? proposal.snapshotVotes === null ? 'Будет известен после snapshot' : amount(proposal.snapshotVotes) + ' MEMBER' : 'Подключите кошелёк / обновите снимок'}</dd>
    <dt>Ваш голос</dt><dd>{account && walletCurrent ? (proposal.hasVoted ? 'Уже учтён; изменить нельзя' : 'Ещё не подан') : '—'}</dd>
  </dl>
  <p class="footnote">Кворум учитывает «за» и «воздержались». Для победы голосов «за» должно быть строго больше, чем «против». Вес фиксируется на snapshot; новые MEMBER после него не меняют этот вес.</p>
  {#if proposal.quorum === null}<p class="footnote">Snapshot ещё не стал историческим: Governor не позволяет читать будущий вес и кворум. Это не нулевой кворум.</p>{/if}
  <details>
    <summary>Исполняемые вызовы: {proposal.calls.length} · всего {formatEther(proposal.totalValue)} ETH</summary>
    <p class="footnote">Порядок и bytes взяты из ProposalCreated и сверены через Governor.hashProposal. Ниже ABI-декодирование известных адресов, а не обещание будущего результата.</p>
    {#each proposal.calls as call, index}<section class="call">
      <h3>Вызов {index + 1}{#if call.decoded} · {call.decoded.contract}{/if}</h3>
      <dl><dt>Target</dt><dd>{call.target}</dd><dt>Value</dt><dd>{call.value} wei · {formatEther(call.value)} ETH</dd></dl>
      {#if call.decoded}<strong>{call.decoded.signature}</strong>
        {#each call.decoded.args as argument}<p><code>{argument.name}: {argument.type}</code></p><pre>{JSON.stringify(argument.value, null, 2)}</pre>{/each}
      {:else}<p>Для этого target нет известного ABI. Проверьте исходник и calldata самостоятельно.</p>{/if}
      <details><summary>Точные calldata</summary><pre>{call.data}</pre></details>
    </section>{/each}
  </details>
  {#if BigInt(proposal.totalValue) > 0n}<p class="callout">Вызовы переводят ETH. Баланс текущего Timelock: {formatEther(snapshot.timelockBalance)} ETH. Эта кнопка исполнения отправляет 0 ETH от кошелька; если имеющихся средств недостаточно, симуляция отклонит её. SDK Governor.execute поддерживает явный msg.value.</p>{/if}
  <div class="button-row">
    {#if proposal.state === 1}
      <button class="primary" disabled={!allowed('vote')} onclick={() => onVote(proposal, 1)}>За</button>
      <button class="secondary" disabled={!allowed('vote')} onclick={() => onVote(proposal, 0)}>Против</button>
      <button class="secondary" disabled={!allowed('vote')} onclick={() => onVote(proposal, 2)}>Воздержаться</button>
    {/if}
    {#if proposal.state === 4}<button class="primary" disabled={!allowed('queue')} onclick={() => onMove(proposal)}>Поставить в Timelock</button>{/if}
    {#if proposal.state === 5}<button class="primary" disabled={!allowed('execute')} onclick={() => onMove(proposal, true)}>Исполнить ↗</button>{/if}
    {#if proposal.state === 0 && account.toLowerCase() === proposal.proposer.toLowerCase()}<button class="secondary" disabled={!allowed('cancel')} onclick={() => onCancel(proposal)}>Отменить предложение</button>{/if}
  </div>
  {#each Object.entries(proposal.actions) as [action, result]}
    {#if (action === 'vote' && proposal.state === 1) || (action === 'queue' && proposal.state === 4) || (action === 'execute' && proposal.state === 5) || (action === 'cancel' && proposal.state === 0)}
      <p class="footnote">{{ vote: 'Голосование', queue: 'Очередь', execute: 'Исполнение', cancel: 'Отмена' }[action]}:
        {walletCurrent ? result.available ? 'проверено eth_call с вашего адреса' : result.reason : 'обновите снимок для текущего кошелька'}.</p>
    {/if}
  {/each}
  <p class="footnote">Доступность проверена на блоке {snapshot.blockNumber}, {new Date(snapshot.blockTimestamp * 1000).toLocaleString()}. Между проверкой и транзакцией состояние может измениться.</p>
</article>

<style>
  details { margin: 14px 0; } summary { cursor: pointer; } dd, pre, strong { overflow-wrap: anywhere; }
  pre { white-space: pre-wrap; } .call { margin: 18px 0; padding-top: 10px; border-top: 1px solid #ddd; }
</style>
