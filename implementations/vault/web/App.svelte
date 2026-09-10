<script>
  import { proofNotice } from './proof-status.mjs';
  import { bindOutcomeCertificate, bindProofJob, proofBindingMatches } from './proof-binding.mjs';
  import PackageEditor from './PackageEditor.svelte';
  import RevenuePreview from './RevenuePreview.svelte';
  import GovernanceProposal from './GovernanceProposal.svelte';
  import ExternalCertificate from './ExternalCertificate.svelte';
  import { quotedSwapLimits } from '../sdk/swap-limits.mjs';
  import { onMount } from 'svelte';
  import {
    createSDK,
    localWallet,
    injectedWallet,
    parseEther,
    formatEther,
    keccak256,
    toUtf8Bytes,
  } from '../sdk/index.mjs';
  let page = 'overview',
    config,
    abis,
    sdk,
    signer,
    walletKind = '',
    account = '',
    walletOpen = false,
    devIndex = '0',
    busy = false,
    error = '',
    notice = '',
    lastTx = '',
    data = {
      statements: [],
      pools: [],
      balances: {},
      allocations: [],
      allocationProposals: [],
      block: {},
    },
    sid = '',
    poolAddress = '',
    search = '',
    statusFilter = 'all',
    comments = [],
    comment = '',
    editing = null,
    activity = { blocks: [] },
    gov = { proposals: [] },
    jobs = [],
    fixtures = [],
    latestJob,
    claimables = {};
  let votingPower = '0';
  let liquidityQuote = null;
  let palomarEntries = [],
    palomarQuery = '';
  let profileView = null,
    profileBalances = {},
    displayName = '',
    bio = '',
    replyTo = null,
    commentSort = 'top',
    newOperator = '',
    operatorImpl = '',
    operatorSpec = '',
    operationId = '',
    operationParams = '0x',
    operationTitle = '',
    stress = null,
    preflight = null;
  let title = '',
    goalHash = '',
    profileId = '',
    manifest = '',
    registrationCertificate = '',
    source = '-- Import a published Lean challenge, or write a theorem here.\n',
    outcome = '1',
    fixtureId = '',
    declaration = '',
    certificate = '';
  let certificateBinding = null, proofEpoch = 0;
  let splitAmount = '100',
    mergeAmount = '10',
    side = '0',
    weight = '0.5',
    fee = '0.01',
    initialT = '100',
    initialOutcome = '200',
    bpt = '10',
    tradeAmount = '10',
    direction = 'buy',
    tradeQuote = null,
    slippage = '100',
    derivedKind = '1',
    derivedExpected = '1',
    deadline = '',
    derivedTitle = '';
  let repository = '',
    commit = '',
    challengePath = 'Challenge.lean',
    govAction = 'operator',
    description = '',
    target = '',
    calldata = '0x',
    newMember = '',
    newVerifier = '',
    newProfile = '',
    newManifest = '',
    enabled = true,
    allocationText = '';
  const nav = [
    ['overview', '◈', 'Обзор'],
    ['research', '⌕', 'Исследования'],
    ['capital', '◉', 'Капитал'],
    ['create', '＋', 'Новый рынок'],
    ['lab', '⌘', 'Lean Lab'],
    ['governance', '◇', 'Управление'],
    ['revenue', '↗', 'Доход'],
    ['activity', '▤', 'Блоки'],
  ];
  $: proofBusy = ['queued', 'running', 'cancelling'].includes(latestJob?.status);
  $: statement = data.statements.find((s) => s.id === sid);
  $: proofReady = proofBindingMatches(certificateBinding, statement, outcome, certificate);
  $: if (certificateBinding && !proofReady) clearProofCertificate();
  $: pool = data.pools.find((p) => p.address === poolAddress);
  $: tradeKey = JSON.stringify([poolAddress, direction, String(tradeAmount), String(slippage), account]);
  $: quoteCurrent = tradeQuote?.key === tradeKey;
  $: liquidityKey = [poolAddress, account, String(bpt), String(slippage), String(initialT), String(initialOutcome)].join('|');
  $: liquidityCurrent = liquidityQuote?.key === liquidityKey;
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  $: activeAllocation = data.allocations.at(-1);
  $: visible = data.statements.filter(
    (s) =>
      (s.title + ' ' + s.id).toLowerCase().includes(search.toLowerCase()) &&
      (statusFilter === 'all' || String(s.outcome) === statusFilter),
  );
  const short = (a, n = 6) => (a ? a.slice(0, n + 2) + '…' + a.slice(-4) : '—');
  const amount = (v, d = 3) => {
    try {
      return Number(formatEther(v || '0')).toLocaleString('en-US', { maximumFractionDigits: d });
    } catch {
      return '0';
    }
  };
  const status = (o) => ['Открыто', 'Доказано', 'Опровергнуто'][o];
  const raw = (v) => parseEther(String(v));
  async function api(url, options = {}) {
    const r = await fetch('/api' + url, {
      credentials: 'include',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error || r.statusText);
    return result;
  }
  async function refresh() {
    if (!config) return;
    const owner = account;
    const snapshot = await api('/snapshot' + (owner ? '?account=' + owner : ''));
    if (owner !== account) return;
    data = snapshot;
    if (
      data.config.proof.profileId !== config.proof.profileId ||
      data.config.addresses.PoolCoordinator !== config.addresses.PoolCoordinator
    ) {
      const current = await api('/config');
      config = current.config;
      abis = current.abis;
      profileId = config.proof.profileId;
      sdk = createSDK(config, abis, signer || sdk.provider);
    }
    if (!sid && data.statements.length) sid = data.statements[0].id;
    if (!poolAddress && data.pools.length) poolAddress = data.pools[0].address;
    if (page === 'governance') await refreshGovernance();
    if (page === 'revenue') await loadClaims();
  }
  async function refreshGovernance() {
    const owner = account, client = sdk;
    const snapshot = await client.governanceSnapshot(owner);
    if (owner !== account || client !== sdk) return;
    gov = snapshot;
    votingPower = snapshot.currentVotes;
  }
  async function go(next) {
    page = next;
    error = '';
    try {
      if (next === 'activity') activity = await api('/activity');
      if (next === 'governance') {
        await refreshGovernance();
      }
      if (next === 'lab') {
        fixtures = await api('/fixtures');
        jobs = account ? await api('/jobs') : [];
      }
      if (next === 'detail')
        comments = await api('/comments?statementId=' + sid + '&sort=' + commentSort);
      if (next === 'revenue') await loadClaims();
    } catch (e) {
      error = e.message;
    }
  }
  async function task(label, fn) {
    if (busy) return;
    busy = true;
    error = '';
    notice = label;
    try {
      const r = await fn();
      if (r?.hash) {
        lastTx = r.hash;
        notice = 'Подтверждено в блоке ' + r.blockNumber + ' · ' + short(r.hash);
      } else if (r?.id && r?.input?.action) notice = proofNotice(r);
      else notice = label + ' — готово';
      await refresh();
      return r;
    } catch (e) {
      error = e.shortMessage || e.reason || e.message;
      notice = '';
    } finally {
      busy = false;
    }
  }
  async function login(connectedSigner, connectedAccount) {
    const { nonce } = await api('/auth/nonce');
    const message =
      location.host +
      ' wants you to sign in with your Ethereum account:\n' +
      connectedAccount +
      '\n\nSign in to Vault comments and Lean jobs. This does not authorize token transfers.\n\nURI: ' +
      location.origin +
      '\nVersion: 1\nChain ID: 31373\nNonce: ' +
      nonce +
      '\nIssued At: ' +
      new Date().toISOString();
    const signature = await connectedSigner.signMessage(message);
    await api('/auth/verify', { method: 'POST', body: JSON.stringify({ message, signature }) });
  }
  function clearWalletState() {
    signer = undefined;
    account = '';
    walletKind = '';
    if (config && abis) sdk = createSDK(config, abis);
    latestJob = undefined;
    jobs = [];
    tradeQuote = null;
    liquidityQuote = null;
    claimables = {};
    profileView = null;
    profileBalances = {};
    displayName = '';
    bio = '';
    source = '-- Import a published Lean challenge, or write a theorem here.\n';
    clearProofCertificate();
    registrationCertificate = '';
    fixtureId = '';
    declaration = '';
    comment = '';
    editing = null;
    replyTo = null;
    votingPower = '0';
    gov = { proposals: [] };
    data = { ...data, balances: {} };
  }
  async function disconnectWallet(reason = 'Кошелёк отключён. Приватные данные очищены с экрана.') {
    clearWalletState();
    walletOpen = false;
    notice = reason;
    try { await api('/auth/logout', { method: 'POST' }); }
    catch (e) { error = 'Не удалось завершить серверную сессию: ' + e.message; }
  }
  async function connect(local) {
    await task('Подключение кошелька', async () => {
      if (account || latestJob || jobs.length) clearWalletState();
      await api('/auth/logout', { method: 'POST' });
      const connectedSigner = local
        ? await localWallet(config, Number(devIndex))
        : await injectedWallet(window.ethereum);
      const connectedAccount = await connectedSigner.getAddress();
      await login(connectedSigner, connectedAccount);
      if (!local) {
        const currentAccounts = await window.ethereum.request({ method: 'eth_accounts' });
        const currentChain = await window.ethereum.request({ method: 'eth_chainId' });
        if (currentAccounts[0]?.toLowerCase() !== connectedAccount.toLowerCase() || BigInt(currentChain) !== 31373n) {
          await api('/auth/logout', { method: 'POST' });
          throw Error('Кошелёк изменился во время входа. Подключите его повторно.');
        }
      }
      signer = connectedSigner;
      account = connectedAccount;
      walletKind = local ? 'local' : 'injected';
      sdk = createSDK(config, abis, signer);
      if (page === 'lab') jobs = await api('/jobs');
      walletOpen = false;
    });
  }
  async function tx(label, fn) {
    return task(label, async () => {
      if (!signer) throw Error('Подключите кошелёк');
      await sdk.ensureChain();
      return fn();
    });
  }
  async function select(s) {
    clearProofCertificate();
    sid = s.id;
    goalHash = s.goalHash;
    profileId = s.profileId;
    manifest = s.manifest;
    title = s.title;
    const p = data.pools.find((p) => p.statementId === sid);
    if (p) poolAddress = p.address;
    await go('detail');
  }
  async function job(action) {
    const capturedEpoch = proofEpoch, owner = account;
    const submitted = await tx('Lean / ' + action, async () => {
      const j = await api('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          action,
          source,
          statementId: action === 'prove' ? sid || undefined : undefined,
          goalHash: action === 'prove' ? statement?.goalHash : undefined,
          profileId: action === 'prove' ? statement?.profileId : config.proof.profileId,
          outcome: Number(outcome),
          fixtureId: fixtureId || undefined,
          targetDeclaration: declaration || undefined,
        }),
      });
      latestJob = j;
      jobs = await api('/jobs');
      return j;
    });
    if (submitted) poll(submitted.id, owner, capturedEpoch).catch((e) => { error = e.message; });
  }
  async function poll(id, owner, capturedEpoch = proofEpoch) {
    if (owner !== account || latestJob?.id !== id) return;
    const current = await api('/jobs/' + id);
    if (owner !== account || latestJob?.id !== id) return;
    latestJob = current;
    notice = proofNotice(current);
    if (['queued', 'running', 'cancelling'].includes(latestJob.status)) {
      await new Promise((r) => setTimeout(r, 1200));
      return poll(id, owner, capturedEpoch);
    }
    const history = await api('/jobs');
    if (owner !== account || latestJob?.id !== id) return;
    jobs = history;
    if (latestJob.status === 'failed')
      throw Error(latestJob.diagnostics || latestJob.result?.diagnostics || latestJob.result?.error || 'Proof job failed');
    if (latestJob.status === 'cancelled') return;
    const r = latestJob.result || {};
    if (latestJob.input.action === 'prove') {
      const binding = bindProofJob(latestJob, data.statements.find(s => s.id === sid), outcome);
      if (capturedEpoch === proofEpoch && binding) {
        certificate = binding.certificate; certificateBinding = binding;
      } else if (r.certificate) {
        notice = 'Сертификат сохранён в истории. Выбор утверждения или исхода изменился; форма не перезаписана.';
      }
      return;
    }
    // A completed check/registration must not overwrite a newer imported source/profile.
    if (latestJob.input.source !== source || latestJob.input.profileId !== profileId) return;
    if (r.goalHash) goalHash = r.goalHash;
    if (r.profileId) profileId = r.profileId;
    if (r.registrationCertificate) registrationCertificate = r.registrationCertificate;
    if (r.certificate) {
      if (latestJob.input.action === 'register') registrationCertificate = r.certificate;
    }
  }
  async function inspectJob(id) {
    const owner = account, capturedEpoch = proofEpoch;
    const current = await api('/jobs/' + id);
    if (owner !== account) return;
    latestJob = current;
    poll(id, owner, capturedEpoch).catch((e) => { error = e.message; });
  }
  async function cancelJob() {
    const id = latestJob?.id;
    if (!id) return;
    await task('Остановка Lean задачи', async () => {
      const current = await api('/jobs/' + id + '/cancel', { method: 'POST', body: '{}' });
      if (latestJob?.id === id) latestJob = current;
      jobs = await api('/jobs');
      return current;
    });
  }
  function downloadJob() {
    if (!latestJob) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(latestJob, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `vault-private-job-${latestJob.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function restoreJobInput() {
    if (!latestJob?.input) return;
    clearProofCertificate();
    const input = latestJob.input;
    source = input.source || '';
    fixtureId = input.fixtureId || '';
    declaration = input.targetDeclaration || '';
    if (input.statementId) sid = input.statementId;
    if (input.goalHash) goalHash = input.goalHash;
    if (input.profileId) profileId = input.profileId;
    if (input.outcome) outcome = String(input.outcome);
    notice = 'Источник загружен в редактор. Запуск выполняется отдельной кнопкой.';
  }
  function pickFixture() {
    const f = fixtures.find((f) => (f.id || f.fixtureId) === fixtureId);
    if (!f) return;
    source = f.source || source;
    title = f.title || title;
    goalHash = f.goalHash || goalHash;
    profileId = f.profileId || profileId;
    declaration = f.targetDeclaration || declaration;
    manifest = JSON.stringify({
      repository: f.repositoryUrl || f.repository,
      version: f.version,
      upstreamDeclaration: f.upstreamDeclaration,
      targetDeclaration: f.targetDeclaration,
      proofDeclaration: f.proofDeclaration,
    });
    repository = f.repositoryUrl || f.repository || repository;
    commit = f.commit || commit;
    challengePath = f.challengePath || challengePath;
  }
  async function register() {
    await tx('Регистрация проверенного утверждения', async () => {
      const r = await sdk.register({
        goalHash,
        profileId,
        title,
        manifest,
        registrationCertificate,
      });
      const l = r.logs
        .map((l) => {
          try {
            return sdk.registry.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((l) => l?.name === 'StatementCreated');
      if (l) { clearProofCertificate(); sid = l.args.statementId; }
      return r;
    });
  }
  async function useExternalCertificate(review, descriptor) {
    if (review.outcome === 0) {
      clearProofCertificate();
      goalHash = review.goalHash; profileId = review.profileId;
      registrationCertificate = review.certificate; title = review.goal.title;
      source = review.goal.source; fixtureId = ''; declaration = 'Oncm.goal';
      manifest = JSON.stringify({ sourceUrl: review.goal.sourceUrl, sourceSha256: review.goal.sourceSha256,
        goalExportSha256: review.goal.goalExportSha256, profile: descriptor.tag, imageId: review.imageId,
        sourceCommit: review.sourceCommit, runId: review.runId });
      await go('create');
    } else {
      if (!statement || statement.kind !== 0 || statement.goalHash.toLowerCase() !== review.goalHash.toLowerCase()
        || statement.profileId.toLowerCase() !== review.profileId.toLowerCase()) {
        error = 'Сначала выберите утверждение с точно такими же goal hash и profile ID.'; return;
      }
      const binding = bindOutcomeCertificate(statement, review.outcome, review.certificate);
      if (!binding || !proofBindingMatches(binding, statement, review.outcome, review.certificate)) {
        error = 'Сертификат не соответствует открытому утверждению и выбранному исходу.'; return;
      }
      clearProofCertificate();
      outcome = String(review.outcome); certificate = review.certificate; certificateBinding = binding;
      notice = 'Настоящий сертификат связан с выбранным утверждением. Отправка ончейн — отдельная кнопка.';
    }
  }
  function clearProofCertificate() {
    certificate = ''; certificateBinding = null; proofEpoch++;
  }
  function setOutcomeCertificate(value) {
    clearProofCertificate(); certificate = value;
    certificateBinding = bindOutcomeCertificate(data.statements.find(s => s.id === sid), outcome, value);
  }
  async function submitOutcomeProof() {
    const binding = certificateBinding, client = sdk;
    await tx('Проверка сертификата и CTF payout', () => {
      if (client !== sdk || binding !== certificateBinding
        || !proofBindingMatches(binding, data.statements.find(s => s.id === sid), outcome, certificate))
        throw Error('Выбор или сертификат изменился. Снова примените сертификат к утверждению.');
      return client.prove(binding.statementId, binding.outcome, binding.certificate);
    });
  }
  async function proposeExternalProfile(descriptor, deployment) {
    govAction = 'profile'; newProfile = descriptor.profileId; newVerifier = deployment.bridge;
    newManifest = descriptor.manifest; enabled = true;
    description = deployment.proposal.description; preflight = null;
    await go('governance');
  }
  async function createPool() {
    await tx('Создание WeightedPool', () => sdk.createPool(sid, Number(side), weight, fee));
    const ps = data.pools.filter((p) => p.statementId === sid);
    if (ps.length) poolAddress = ps.at(-1).address;
    initialOutcome = String((Number(initialT) * Number(weight)) / (1 - Number(weight)) / 0.5);
    await go('capital');
  }
  function tradeTokens() {
    const s = data.statements.find((s) => s.id === pool.statementId),
      t = config.addresses.TrueToken,
      w = pool.side === 0 ? s.yes : s.no;
    return direction === 'buy' ? [t, w] : [w, t];
  }
  async function getQuote() {
    await task('Расчёт Balancer', async () => {
      if (!pool) throw Error('Выберите пул');
      const key = tradeKey, poolId = pool.address, [tokenIn, tokenOut] = tradeTokens(),
        input = raw(tradeAmount), bps = Number(slippage);
      tradeQuote = null;
      if (input <= 0n) throw Error('Сумма обмена должна быть положительной');
      const [output, swapFee] = await Promise.all([
        sdk.quote(poolId, tokenIn, tokenOut, input),
        sdk.vault.getStaticSwapFeePercentage(poolId),
      ]);
      const block = await sdk.provider.getBlock('latest');
      tradeQuote = {
        key, pool: poolId, tokenIn, tokenOut, amount: input, slippageBps: bps, output, swapFee,
        ...quotedSwapLimits(output, bps, block.timestamp),
      };
    });
  }
  async function swap() {
    const receipt = await tx('Обмен через Balancer Router', () => {
      if (!quoteCurrent || !tradeQuote) throw Error('Рассчитайте котировку для текущих параметров');
      const q = tradeQuote;
      return sdk.swap(q.pool, q.tokenIn, q.tokenOut, q.amount, q.slippageBps, {
        minimumAmountOut: q.minimumAmountOut, deadline: q.deadline,
      });
    });
    if (receipt) tradeQuote = null;
  }
  async function getLiquidityQuote(kind, all = false) {
    await task('Расчёт ликвидности Balancer', async () => {
      if (!pool || !account) throw Error('Выберите пул и подключите кошелёк');
      if (all) bpt = formatEther(data.balances[pool.address] || '0');
      const key = [poolAddress, account, String(bpt), String(slippage), String(initialT), String(initialOutcome)].join('|');
      const amounts = kind === 'initialize' ? pool.tokens.map((token) => raw(token.toLowerCase() === config.addresses.TrueToken.toLowerCase() ? initialT : initialOutcome)) : null;
      liquidityQuote = null;
      const q = kind === 'initialize' ? await sdk.quoteInitialize(pool.address, amounts, Number(slippage))
        : kind === 'join' ? await sdk.quoteJoin(pool.address, raw(bpt), Number(slippage))
          : await sdk.quoteExit(pool.address, raw(bpt), Number(slippage));
      liquidityQuote = { ...q, key };
    });
  }
  async function executeLiquidity() {
    const receipt = await tx('Ликвидность с показанными пределами', () => {
      if (!liquidityCurrent || !liquidityQuote) throw Error('Рассчитайте ликвидность для текущих параметров');
      const q = liquidityQuote;
      return q.kind === 'initialize' ? sdk.initialize(q.pool, q.amounts, q)
        : q.kind === 'join' ? sdk.join(q.pool, q.bpt, Number(slippage), q)
          : sdk.exit(q.pool, q.bpt, Number(slippage), q);
    });
    if (receipt) liquidityQuote = null;
  }
  async function addComment() {
    await tx('Сохранение комментария', async () => {
      await api('/comments' + (editing ? '/' + editing : ''), {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({ statementId: sid, text: comment, parentId: replyTo }),
      });
      comment = '';
      editing = null;
      replyTo = null;
      comments = await api('/comments?statementId=' + sid + '&sort=' + commentSort);
    });
  }
  async function importPackage() {
    await tx('Импорт GitHub snapshot', async () => {
      const p = await api('/import', {
        method: 'POST',
        body: JSON.stringify({ repository, commit, challengePath }),
      });
      source = p.source;
      manifest = JSON.stringify({
        repository: p.repository,
        commit: p.commit,
        challengePath: p.challengePath,
      });
    });
  }
  async function browsePalomar() {
    await task('Чтение опубликованного Palomar registry', async () => {
      const r = await api('/palomar');
      palomarEntries = r.data.entries || [];
    });
  }
  async function importPalomar(e) {
    await tx('Импорт Palomar ' + e.id, async () => {
      const p = await api('/palomar/import', {
        method: 'POST',
        body: JSON.stringify({ id: e.id, version: e.version }),
      });
      source = p.source;
      title = p.title;
      declaration = p.targetDeclaration;
      repository = p.repository;
      commit = p.commit;
      challengePath = p.challengePath;
      manifest = JSON.stringify({
        externalRef: p.externalRef,
        repository: p.repository,
        commit: p.commit,
        challengePath: p.challengePath,
      });
    });
  }
  async function loadClaims() {
    if (!account || !sdk) return;
    const owner = account, client = sdk;
    const tokens = [config.addresses.TrueToken, ...data.statements.flatMap((s) => [s.yes, s.no])];
    const w = client.c('SplitsWarehouse');
    const result = Object.fromEntries(
      await Promise.all(
        tokens.map(async (t) => [t, String(await w.balanceOf(owner, BigInt(t)))]),
      ),
    );
    if (owner === account && client === sdk) claimables = result;
  }
  function govCall() {
    let t, d;
    if (govAction === 'operator') {
      t = config.addresses.StatementRegistry;
      d = sdk.registry.interface.encodeFunctionData('setOperator', [
        newOperator,
        operatorImpl,
        operatorSpec,
        enabled,
      ]);
    } else if (govAction === 'profile') {
      t = config.addresses.StatementRegistry;
      d = sdk.registry.interface.encodeFunctionData('setProfile', [
        newProfile,
        newVerifier,
        enabled,
        newManifest,
      ]);
    } else if (govAction === 'membership') {
      t = config.addresses.Membership;
      d = sdk.c('Membership').interface.encodeFunctionData('setMember', [newMember, enabled]);
    } else {
      t = target;
      d = calldata;
    }
    return [t, d];
  }
  async function proposeGov() {
    await tx('Предложение Governor', async () => {
      const [t, d] = govCall();
      return sdk.send(sdk.c('Governor', 'VaultGovernor').propose([t], [0], [d], description));
    });
    await refreshGovernance();
  }
  async function vote(p, support) {
    await tx('Голосование membership', () =>
      sdk.send(sdk.c('Governor', 'VaultGovernor').castVote(p.id, support)),
    );
    await refreshGovernance();
  }
  async function moveGov(p, execute = false) {
    await tx(execute ? 'Исполнение Timelock' : 'Очередь Timelock', () =>
      sdk.send(
        sdk
          .c('Governor', 'VaultGovernor')
          [
            execute ? 'execute' : 'queue'
          ](p.targets, p.values, p.calldatas, keccak256(toUtf8Bytes(p.description))),
      ),
    );
    await refreshGovernance();
  }
  async function cancelGov(p) {
    await tx('Отмена автором Pending proposal', () => sdk.send(() =>
      sdk.c('Governor', 'VaultGovernor').cancel(p.targets, p.values, p.calldatas, p.descriptionHash)));
    await refreshGovernance();
  }
  async function proposeAllocation() {
    await tx('Предложение новых долей', () => {
      const rows = allocationText
        .trim()
        .split('\n')
        .map((l) => l.trim().split(/\s+/))
        .map(([a, w]) => [a, Math.round(Number(w) * 100)])
        .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
      return sdk.send(
        sdk.allocation.propose(
          rows.map((r) => r[0]),
          rows.map((r) => r[1]),
        ),
      );
    });
  }
  async function mine(count) {
    await task(count === 1 ? '1 локальный блок + 1 секунда' : '10 локальных блоков + 10 секунд', async () => {
      if (![1, 10].includes(count)) throw Error('Only 1 or 10 local blocks are supported');
      if (config.chainId !== 31373) throw Error('Local chain only');
      await sdk.ensureChain();
      await sdk.provider.send('evm_increaseTime', [count]);
      await sdk.provider.send('hardhat_mine', ['0x' + count.toString(16)]);
    });
    if (page === 'governance') await refreshGovernance();
  }
  async function openProfile(a) {
    profileView = await api('/profiles/' + a);
    displayName = profileView.displayName;
    bio = profileView.bio;
    profileBalances = (await api('/snapshot?account=' + a)).balances;
    location.hash = 'profile/' + a;
  }
  async function saveProfile() {
    await tx(
      'Сохранение профиля',
      async () =>
        (profileView = await api('/profile', {
          method: 'PUT',
          body: JSON.stringify({ displayName, bio }),
        })),
    );
  }
  async function voteComment(c, value) {
    await tx('Голос за комментарий', async () => {
      await api('/comments/' + c.id + '/vote', {
        method: 'POST',
        body: JSON.stringify({
          value: (c.votes?.[account.toLowerCase()] || 0) === value ? 0 : value,
        }),
      });
      comments = await api('/comments?statementId=' + sid + '&sort=' + commentSort);
    });
  }

  onMount(() => {
    const injectedChanged = () => {
      if (walletKind === 'injected') disconnectWallet('Адрес или сеть кошелька изменились. Подключите кошелёк заново.');
    };
    window.ethereum?.on?.('accountsChanged', injectedChanged);
    window.ethereum?.on?.('chainChanged', injectedChanged);
    let timer;
    (async () => {
      try {
        ({ config, abis } = await api('/config'));
        sdk = createSDK(config, abis);
        profileId = config.proof.profileId || '';
        newProfile = config.proof.profileId || '';
        newVerifier = config.proof.verifier || '';
        newManifest = config.proof.manifest || '';
        newOperator = config.exampleOperator?.id || '';
        operatorImpl = config.exampleOperator?.implementation || '';
        operatorSpec = config.exampleOperator?.specification || '';
        await refresh();
        if (/^#profile\/0x[0-9a-f]{40}$/i.test(location.hash))
          await openProfile(location.hash.slice(9));
        timer = setInterval(() => refresh().catch(() => {}), 7000);
      } catch (e) {
        error = e.message;
      }
    })();
    return () => {
      clearInterval(timer);
      window.ethereum?.removeListener?.('accountsChanged', injectedChanged);
      window.ethereum?.removeListener?.('chainChanged', injectedChanged);
    };
  });
</script>

<div class="app-shell">
  <aside class="sidebar">
    <a class="brand" href="/" onclick={() => go('overview')}><span>▱</span> VAULT<i></i></a>
    <div class="sidebar-tag">MATHEMATICS / CAPITAL</div>
    <nav>
      {#each nav as [n, icon, label]}<button
          class:active={page === n || (n === 'research' && page === 'detail')}
          onclick={() => go(n)}><span>{icon}</span>{label}</button
        >{/each}
    </nav>
    <div class="sidebar-bottom">
      <i class="network-dot"></i>LOCAL NETWORK<small>Anvil · Balancer V3 · chain 31373</small>
      {#if config?.chainInstance}<small title={config.chainInstance.id}>Сеть {short(config.chainInstance.id, 8)}</small>{/if}<a
        href="/api/config"
        target="_blank">Deployment & ABI ↗</a
      >
    </div>
  </aside>
  <main>
    <header class="topbar">
      <div class="breadcrumb">
        Vault workspace <span>/</span>
        {nav.find((n) => n[0] === page)?.[2] || 'Утверждение'}
      </div>
      <div class="top-actions">
        <span class="block-chip">◉ Блок {data.block.number || '—'}</span>{#if account}<button
            class="text-button"
            onclick={() => openProfile(account)}>Мой профиль</button
          >{/if}<button class="wallet" onclick={() => (walletOpen = !walletOpen)}
          >{account ? short(account) : 'Подключить кошелёк'} ⌄</button
        >
      </div>
    </header>
    {#if walletOpen}<div class="wallet-panel">
        <h3>Ваш кошелёк</h3>
        <p>Транзакции подписываются кошельком. Вход в обсуждения — подпись SIWE.</p>
        <button class="primary full" onclick={() => connect(false)} disabled={busy}
          >Browser wallet ↗</button
        >
        {#if account}<button class="secondary full" disabled={busy} onclick={() => disconnectWallet()}>Отключить кошелёк и выйти</button>{/if}
        <div class="divider"></div>
        <label
          >Публичный devnet-кошелёк<select bind:value={devIndex}
            ><option value="0">Account 0 · LP / member</option><option value="1"
              >Account 1 · trader / member</option
            ><option value="2">Account 2 · member</option><option value="3"
              >Account 3 · participant</option
            ></select
          ></label
        ><button class="secondary full" onclick={() => connect(true)} disabled={busy}
          >Подключить локальный</button
        ><small>Только localhost:9547 / chain 31373. Тестовые T без стоимости.</small>
      </div>{/if}
    <div class="content">
      {#if error}<div class="banner error" role="alert">
          <b>Действие не выполнено</b><span>{error}</span><button onclick={() => (error = '')}
            >×</button
          >
        </div>{/if}{#if notice}<div class="banner notice" role="status">
          <span class:spinner={busy}>{busy ? '' : '✓'}</span><span>{notice}</span
          >{#if lastTx}<button onclick={() => go('activity')}>Посмотреть блок ↗</button>{/if}
        </div>{/if}
      {#if page === 'overview'}
        <section class="page-heading">
          <div>
            <div class="eyebrow">A PORTFOLIO OF IDEAS</div>
            <h1>Математика.<br /><span>Обеспеченная капиталом.</span></h1>
            <p>
              Формальные утверждения, открытая ликвидность и разрешение через проверяемое
              доказательство.
            </p>
          </div>
          <button class="primary" onclick={() => go('create')}>Создать рынок ＋</button>
        </section>
        <div class="metrics">
          <article>
            <div class="metric-label">Ваш базовый актив</div>
            <strong
              >{amount(config ? data.balances[config.addresses.TrueToken] : 0, 2)}
              <span>T</span></strong
            ><small>True · обеспеченные позиции</small>
          </article>
          <article>
            <div class="metric-label">Утверждения</div>
            <strong
              >{data.statements.length}<span class="metric-note">
                / {data.statements.filter((s) => s.outcome === 0).length} открыто</span
              ></strong
            ><small>Gnosis Conditional Tokens</small>
          </article>
          <article>
            <div class="metric-label">Пулы капитала</div>
            <strong>{data.pools.length}<span class="metric-note"> Weighted</span></strong><small
              >Balancer V3 · реальные резервы</small
            >
          </article>
          <article>
            <div class="metric-label">Эпоха дохода</div>
            <strong
              >{activeAllocation?.epoch || '—'}<span class="metric-note"> in-kind</span></strong
            ><small>Неизменяемый Splits wallet</small>
          </article>
        </div>
        <div class="two-columns">
          <article class="panel capital-panel">
            <div class="panel-heading">
              <h2>Распределение капитала</h2>
              <button class="text-button" onclick={() => go('capital')}>Управлять ↗</button>
            </div>
            <div class="capital-visual">
              <div
                class="donut"
                style={'background:conic-gradient(#468d91 0% ' +
                  (pool ? Number(pool.outcomeWeight) / 1e16 : 0) +
                  '%,#c9dedf 0% 100%)'}
              >
                <div>
                  <strong>{pool ? Number(pool.outcomeWeight) / 1e16 : 0}%</strong><span
                    >вес outcome</span
                  >
                </div>
              </div>
              <div class="legend">
                <p>
                  <i></i><strong
                    >{amount(
                      data.pools.reduce(
                        (n, p) =>
                          n +
                          BigInt(
                            p.balances[
                              p.tokens.findIndex(
                                (t) =>
                                  t.toLowerCase() === config?.addresses.TrueToken.toLowerCase(),
                              )
                            ] || 0,
                          ),
                        0n,
                      ),
                      2,
                    )} T</strong
                  ><span>в резервах пулов</span>
                </p>
                <p>
                  <i class="pale"></i><strong>YES / NO</strong><span
                    >канонические ERC-20 wrappers</span
                  >
                </p>
                <div class="subtle">
                  Вес пула задаёт формулу цены. Это параметр AMM, а не вероятность истины.
                </div>
              </div>
            </div>
          </article>
          <article class="panel principles">
            <div class="eyebrow">SETTLEMENT BY CONSTRUCTION</div>
            <h2>Доказанное становится True.</h2>
            <p>
              Полный комплект YES + NO обеспечен 1 T. После разрешения выигравшая позиция погашается
              в T, проигравшая — в 0.
            </p>
            <div class="flow-mini">
              <span>Lean</span><b>→</b><span>zk certificate</span><b>→</b><span class="accent"
                >On-chain</span
              >
            </div>
            <button class="text-button" onclick={() => go('lab')}>Открыть Lean Lab ↗</button>
          </article>
        </div>
        <div class="section-heading">
          <h2>Открытые исследования</h2>
          <button class="text-button" onclick={() => go('research')}>Все утверждения ↗</button>
        </div>
        {#if !data.statements.length}<div class="empty-state">
            <span>∴</span>
            <h3>Первое утверждение — начало рынка</h3>
            <p>
              Импортируйте опубликованный Lean challenge, получите сертификат регистрации и создайте
              настоящий рынок.
            </p>
            <button class="secondary" onclick={() => go('lab')}>Начать в Lean Lab ↗</button>
          </div>{:else}<div class="research-grid">
            {#each data.statements.slice(-3).reverse() as s}<button
                class="research-card"
                onclick={() => select(s)}
                ><div>
                  <span class="status">{status(s.outcome)}</span><small
                    >{s.kind === 0 ? 'LEAN THEOREM' : 'DERIVED CLAIM'}</small
                  >
                </div>
                <h3>{s.title}</h3>
                <p>{short(s.goalHash, 10)}</p>
                <footer>
                  <span>{data.pools.filter((p) => p.statementId === s.id).length} пулов</span><b
                    >↗</b
                  >
                </footer></button
              >{/each}
          </div>{/if}
      {:else if page === 'research'}
        <section class="page-heading compact">
          <div>
            <div class="eyebrow">RESEARCH REGISTRY</div>
            <h1>Утверждения</h1>
            <p>Точное формальное содержание определяет исход. Описание помогает его прочитать.</p>
          </div>
          <button class="primary" onclick={() => go('create')}>Новое утверждение ＋</button>
        </section>
        <div class="toolbar">
          <input
            aria-label="Поиск"
            placeholder="Поиск по названию или statement ID"
            bind:value={search}
          /><select bind:value={statusFilter}
            ><option value="all">Все статусы</option><option value="0">Открытые</option><option
              value="1">Доказанные</option
            ><option value="2">Опровергнутые</option></select
          >
        </div>
        <div class="research-grid">
          {#each visible as s}<button class="research-card" onclick={() => select(s)}
              ><div>
                <span class="status">{status(s.outcome)}</span><small
                  >{s.kind === 0 ? 'LEAN' : 'ON-CHAIN OPERATOR'}</small
                >
              </div>
              <h3>{s.title}</h3>
              <p>{short(s.id, 10)}</p>
              <footer><span>Автор {short(s.author)}</span><b>↗</b></footer></button
            >{/each}
        </div>
        {#if !visible.length}<div class="empty-state">
            <h3>Утверждений пока нет</h3>
            <p>Новые записи появятся после подтверждения транзакции регистрации.</p>
          </div>{/if}
      {:else if page === 'detail' && statement}
        <section class="page-heading compact">
          <div>
            <div class="eyebrow">
              {statement.kind === 0 ? 'LEAN THEOREM' : 'DERIVED CLAIM'} / {short(statement.id, 10)}
            </div>
            <h1 class="statement-title">{statement.title}</h1>
            <span class="status">{status(statement.outcome)}</span>
          </div>
          <a class="secondary" href={'/api/export/' + statement.id} download>Экспорт свидетельств JSON ↗</a>
        </section>
        <div class="two-columns">
          <article class="panel">
            <h2>Формальное содержание</h2>
            <dl>
              <dt>Goal hash</dt>
              <dd>{statement.goalHash}</dd>
              <dt>Proof profile</dt>
              <dd>{statement.profileId}</dd>
              <dt>CTF condition</dt>
              <dd>{statement.conditionId}</dd>
              <dt>Snapshot / metadata</dt>
              <dd>{statement.manifest || 'Производное ончейн утверждение'}</dd>
              {#if statement.kind === 4}<dt>Operator ID / operands</dt>
                <dd>{statement.operatorId}<br />{statement.operatorParams}</dd>{/if}
              <dt>YES / NO</dt>
              <dd>{statement.yes}<br />{statement.no}</dd>
            </dl>
            {#if statement.kind > 0}<p>
                Зависимость: {short(statement.dependency, 10)} · {[
                  '',
                  'ResolvedBy',
                  'ResolvedAs',
                  'ResolvedAsBy',
                  'Governance module',
                ][statement.kind]}
                {#if statement.kind === 2 || statement.kind === 3}
                  · ожидаемый исход: {statement.expected === 1 ? 'True' : 'False'}
                {/if}
                {statement.deadline ? new Date(statement.deadline * 1000).toLocaleString() + ' (' + localTimeZone + ')' : ''}
              </p>
              {#if statement.kind === 1 || statement.kind === 3}<p class="footnote">
                Учитывается время принятия исхода в блокчейне, включая точное равенство дедлайну.
                После срока без нужного события производное можно разрешить как False.
                Это не опровержение исходной математической теоремы.
              </p>{/if}
              <button
                class="primary"
                disabled={busy || statement.outcome !== 0}
                onclick={() => tx('Вычисление производного', () => sdk.resolveDerived(sid))}
                >Разрешить по состоянию chain</button
              >{:else}<button class="secondary" onclick={() => go('lab')}
                >Открыть доказательство в Lean Lab ↗</button
              >{/if}
          </article>
          <article class="panel">
            <h2>Полные комплекты</h2>
            <p>
              1 T ⇄ 1 YES + 1 NO. Активы хранятся в CTF; wrappers дают стандартный ERC-20 интерфейс.
            </p>
            <div class="position-balances">
              <span>YES <strong>{amount(data.balances[statement.yes])}</strong></span><span
                >NO <strong>{amount(data.balances[statement.no])}</strong></span
              >
            </div>
            <div class="inline-form">
              <input
                aria-label="Количество split"
                type="number"
                min="0"
                bind:value={splitAmount}
              /><button
                class="primary"
                disabled={busy}
                onclick={() => tx('Split T → YES + NO', () => sdk.split(sid, raw(splitAmount)))}
                >Split</button
              >
            </div>
            <div class="inline-form">
              <input
                aria-label="Количество merge"
                type="number"
                min="0"
                bind:value={mergeAmount}
              /><button
                class="secondary"
                disabled={busy}
                onclick={() => tx('Merge YES + NO → T', () => sdk.merge(sid, raw(mergeAmount)))}
                >Merge</button
              >
            </div>
            {#if statement.outcome !== 0}<button
                class="primary full"
                disabled={busy}
                onclick={() =>
                  tx('Погашение позиций в T', () =>
                    sdk.redeem(
                      sid,
                      data.balances[statement.yes] || 0,
                      data.balances[statement.no] || 0,
                    ),
                  )}>Погасить все позиции → T</button
              >{/if}
          </article>
        </div>
        <div class="two-columns">
          <article class="panel">
            <h2>Рынок и ликвидность</h2>
            <p>
              Открытый вход для LP. Вес outcome фиксируется при создании; изменение весов требует
              нового пула.
            </p>
            <div class="field-row">
              <label
                >Актив<select bind:value={side}
                  ><option value="0">YES / T</option><option value="1">NO / T</option></select
                ></label
              ><label
                >Вес outcome<select bind:value={weight}
                  ><option value="0.5">50%</option><option value="0.8">80%</option><option
                    value="0.2">20%</option
                  ></select
                ></label
              ><label
                >Swap fee<select bind:value={fee}
                  ><option value="0.003">0.3%</option><option value="0.01">1%</option><option
                    value="0.02">2%</option
                  ></select
                ></label
              >
            </div>
            <button class="primary" disabled={busy || statement.outcome !== 0} onclick={createPool}
              >Создать WeightedPool</button
            ><button class="text-button" onclick={() => go('capital')}>Торговля и LP ↗</button>
          </article>
          <article class="panel">
            <h2>Производное утверждение</h2>
            <label
              >Оператор<select bind:value={derivedKind}
                ><option value="1">ResolvedBy — разрешено до даты</option><option value="2"
                  >ResolvedAs — разрешено как исход</option
                ><option value="3">ResolvedAsBy — исход до даты</option></select
              ></label
            >
            <div class="field-row">
              <label
                >Ожидаемый исход<select bind:value={derivedExpected}
                  ><option value="1">True</option><option value="2">False</option></select
                ></label
              ><label>Дедлайн<input type="datetime-local" bind:value={deadline} /></label>
            </div>
            <p class="footnote">Часовой пояс: {localTimeZone}. Ончейн сохраняется Unix timestamp.</p>
            <label
              >Название<input
                bind:value={derivedTitle}
                placeholder="Будет ли утверждение доказано до…"
              /></label
            ><button
              class="secondary"
              disabled={busy}
              onclick={() =>
                tx('Регистрация производного', () =>
                  sdk.derived(
                    sid,
                    Number(derivedKind),
                    Number(derivedExpected),
                    derivedKind === '2' ? 0 : Math.floor(new Date(deadline).getTime() / 1000),
                    derivedTitle,
                  ),
                )}>Создать условие</button
            >
            <details class="epoch">
              <summary>Governance operator module</summary><label
                >Operator ID<input bind:value={operationId} placeholder="0x…" /></label
              ><label
                >ABI-encoded operands<textarea class="code-input" bind:value={operationParams}
                ></textarea></label
              ><label>Название<input bind:value={operationTitle} /></label><button
                class="secondary"
                disabled={busy}
                onclick={() =>
                  tx('Регистрация governance operation', () =>
                    sdk.send(
                      sdk.registry.registerOperation(operationId, operationParams, operationTitle),
                    ),
                  )}>Создать operation</button
              >
            </details>
          </article>
        </div>
        <article class="panel">
          <div class="panel-heading">
            <h2>Обсуждение <span class="muted">{comments.length}</span></h2>
            <select
              aria-label="Сортировка комментариев"
              bind:value={commentSort}
              onchange={async () =>
                (comments = await api('/comments?statementId=' + sid + '&sort=' + commentSort))}
              ><option value="top">Лучшие</option><option value="new">Новые</option></select
            >
          </div>
          <p>Комментарии находятся вне блокчейна и не меняют критерий разрешения.</p>
          {#each comments as c}<div class="comment" class:reply={c.parentId}>
              <div>
                <button class="profile-link" onclick={() => openProfile(c.author)}
                  >{c.profile?.displayName || short(c.author)}</button
                ><small>{short(c.author)}</small><small
                  >{new Date(c.createdAt).toLocaleString()}</small
                >{#if account.toLowerCase() === c.author.toLowerCase()}<button
                    class="text-button"
                    onclick={() => {
                      editing = c.id;
                      comment = c.text;
                    }}>Изменить</button
                  >{/if}
              </div>
              <p>
                {#if c.parentId}<span class="reply-label">↳ Ответ: {short(c.parentId, 8)}</span
                  >{/if}{c.text}
              </p>
              <div class="comment-actions">
                <button
                  class:chosen={c.votes?.[account.toLowerCase()] === 1}
                  disabled={busy || !account || account.toLowerCase() === c.author.toLowerCase()}
                  onclick={() => voteComment(c, 1)}>↑</button
                ><strong>{c.score || 0}</strong><button
                  class:chosen={c.votes?.[account.toLowerCase()] === -1}
                  disabled={busy || !account || account.toLowerCase() === c.author.toLowerCase()}
                  onclick={() => voteComment(c, -1)}>↓</button
                ><button
                  class="text-button"
                  onclick={() => {
                    replyTo = c.id;
                    editing = null;
                  }}>Ответить</button
                >
              </div>
              {#if c.history.length}<details>
                  <summary>История изменений ({c.history.length})</summary>{#each c.history as h}<p>
                      {h.editedAt}: {h.text}
                    </p>{/each}
                </details>{/if}
            </div>{/each}{#if replyTo}<p>
              Ответ на {short(replyTo, 10)}
              <button class="text-button" onclick={() => (replyTo = null)}>Отменить</button>
            </p>{/if}<textarea
            bind:value={comment}
            placeholder="Вопрос о формализации, подход к доказательству…"
            maxlength="4000"
          ></textarea><button
            class="primary"
            disabled={busy || !comment.trim()}
            onclick={addComment}>{editing ? 'Сохранить изменение' : 'Добавить комментарий'}</button
          >
        </article>
      {:else if page === 'capital'}
        <section class="page-heading compact">
          <div>
            <div class="eyebrow">WEIGHTED CAPITAL</div>
            <h1>Ваш капитал</h1>
            <p>Самостоятельные Balancer WeightedPool с каноническими активами T и YES либо NO.</p>
          </div>
          <span class="pill">20% swap fee → creator revenue</span>
        </section>
        <div class="panel">
          <div class="panel-heading">
            <h2>Пулы</h2>
            <select aria-label="Выбрать пул" bind:value={poolAddress}
              ><option value="">Выберите пул</option>{#each data.pools as p}<option
                  value={p.address}
                  >{data.statements.find((s) => s.id === p.statementId)?.title} · {p.side === 0
                    ? 'YES'
                    : 'NO'}
                  {Number(p.outcomeWeight) / 1e16}%</option
                >{/each}</select
            >
          </div>
          {#if !data.pools.length}<div class="empty-state small">
              <h3>Пулов пока нет</h3>
              <p>Зарегистрируйте утверждение и создайте пул на его странице.</p>
              <button class="secondary" onclick={() => go('research')}
                >Выбрать утверждение ↗</button
              >
            </div>{:else}<div class="pool-table">
              {#each data.pools as p}<button
                  class:selected={p.address === poolAddress}
                  onclick={() => (poolAddress = p.address)}
                  ><span
                    ><b>{data.statements.find((s) => s.id === p.statementId)?.title}</b><small
                      >{short(p.address)} · {p.side === 0 ? 'YES' : 'NO'} / T</small
                    ></span
                  ><span class="weight-line"
                    ><i style={'width:' + Number(p.outcomeWeight) / 1e16 + '%'}></i></span
                  ><span
                    >{Number(p.outcomeWeight) / 1e16}% / {100 -
                      Number(p.outcomeWeight) / 1e16}%</span
                  ><strong>{amount(data.balances[p.address])} BPT</strong></button
                >{/each}
            </div>{/if}
        </div>
        {#if pool}<div class="metrics pool-metrics">
            {#each pool.tokens as t, i}<article>
                <div class="metric-label">
                  Резерв {t.toLowerCase() === config.addresses.TrueToken.toLowerCase()
                    ? 'True (T)'
                    : pool.side === 0
                      ? 'YES'
                      : 'NO'}
                </div>
                <strong>{amount(pool.balances[i])}</strong><small>{short(t)}</small>
              </article>{/each}
            <article>
              <div class="metric-label">Ваша доля LP</div>
              <strong
                >{BigInt(pool.totalSupply) > 0n
                  ? (
                      (Number(data.balances[pool.address] || 0) / Number(pool.totalSupply)) *
                      100
                    ).toFixed(2)
                  : '0'}<span>%</span></strong
              ><small>{amount(data.balances[pool.address])} BPT</small>
            </article>
          </div>
          <div class="two-columns">
            <article class="panel">
              <h2>Торговля</h2>
              {#if data.statements.find((s) => s.id === pool.statementId)?.outcome !== 0}<div
                  class="callout"
                >
                  Исход зафиксирован. FinalityHook остановил обмены; LP может выйти и погасить
                  выигравшие токены.
                </div>{:else}<div class="segmented">
                  <button
                    class:active={direction === 'buy'}
                    onclick={() => {
                      direction = 'buy';
                      tradeQuote = null;
                    }}>Купить {pool.side === 0 ? 'YES' : 'NO'}</button
                  ><button
                    class:active={direction === 'sell'}
                    onclick={() => {
                      direction = 'sell';
                      tradeQuote = null;
                    }}>Продать</button
                  >
                </div>
                <label
                  >Отдаёте {direction === 'buy' ? 'T' : pool.side === 0 ? 'YES' : 'NO'}<input
                    type="number"
                    min="0"
                    bind:value={tradeAmount}
                  /></label
                >
                <div class="quote-box">
                  <span>Получите ≈</span><strong
                    >{quoteCurrent ? amount(tradeQuote.output) : '—'}
                    {direction === 'buy' ? (pool.side === 0 ? 'YES' : 'NO') : 'T'}</strong
                  >
                </div>
                {#if quoteCurrent}<p class="footnote">
                  Swap fee на момент расчёта: {Number(formatEther(tradeQuote.swapFee)) * 100}%.
                  Котировка уже учитывает комиссию.
                  Минимум: {formatEther(tradeQuote.minimumAmountOut)}
                  {direction === 'buy' ? (pool.side === 0 ? 'YES' : 'NO') : 'T'}. Срок:
                  {new Date(Number(tradeQuote.deadline) * 1000).toLocaleString()} ({localTimeZone}).
                  Эти ограничения сохраняются при подтверждении и выдаче разрешений.
                </p>{/if}
                <label
                  >Допуск проскальзывания (bps)<input
                    type="number"
                    min="1"
                    max="1000"
                    bind:value={slippage}
                  /></label
                >
                <div class="button-row">
                  <button class="secondary" disabled={busy || !pool.initialized} onclick={getQuote}
                    >Рассчитать</button
                  ><button class="primary" disabled={busy || !pool.initialized || !quoteCurrent} onclick={swap}
                    >Обменять ↗</button
                  >
                </div>{/if}
              <p class="footnote">
                Цена выводится из резервов и весов. Информированный участник может торговать до
                публикации доказательства.
              </p>
            </article>
            <article class="panel">
              <h2>{pool.initialized ? 'Управление ликвидностью' : 'Инициализировать пул'}</h2>
              {#if !pool.initialized}<p>
                  Подготовьте outcome через split T на странице утверждения.
                </p>
                <p>
                  Начальная цена до fee: <strong
                    >{(
                      ((Number(initialT) / Number(initialOutcome)) *
                        (Number(pool.outcomeWeight) / 1e18)) /
                      (1 - Number(pool.outcomeWeight) / 1e18)
                    ).toFixed(4)} T / outcome</strong
                  >
                </p>
                <button
                  class="text-button"
                  onclick={() =>
                    (initialOutcome = String(
                      (Number(initialT) * (Number(pool.outcomeWeight) / 1e18)) /
                        (1 - Number(pool.outcomeWeight) / 1e18) /
                        0.5,
                    ))}>Подобрать outcome для стартовой цены 0.5 T</button
                >
                <div class="field-row">
                  <label>Внести T<input type="number" min="0" bind:value={initialT} /></label><label
                    >Внести outcome<input
                      type="number"
                      min="0"
                      bind:value={initialOutcome}
                    /></label
                  >
                </div>
                <button
                  class="primary full"
                  disabled={busy ||
                    data.statements.find((s) => s.id === pool.statementId)?.outcome !== 0}
                  onclick={() => getLiquidityQuote('initialize')}>Рассчитать взнос и BPT</button
                >{:else}<p>
                  Пропорциональное пополнение сохраняет веса. Выход возвращает фактические активы
                  пула.
                </p>
                <label
                  >BPT для пополнения или выхода<input
                    type="number"
                    min="0"
                    bind:value={bpt}
                  /></label
                >
                <div class="button-row">
                  <button
                    class="primary"
                    disabled={busy ||
                      data.statements.find((s) => s.id === pool.statementId)?.outcome !== 0}
                    onclick={() => getLiquidityQuote('join')}>Рассчитать взнос LP</button
                  ><button
                    class="secondary"
                    disabled={busy}
                    onclick={() => getLiquidityQuote('exit')}>Рассчитать выход LP</button
                  >
                </div>
                <button
                  class="text-button"
                  disabled={busy || !BigInt(data.balances[pool.address] || 0)}
                  onclick={() => getLiquidityQuote('exit', true)}>Рассчитать выход всей доли ↗</button
                >{/if}
              <label>Допуск LP (bps)<input type="number" min="0" max="10000" bind:value={slippage} /></label>
              {#if liquidityCurrent}<div class="callout">
                <strong>{liquidityQuote.kind === 'exit' ? 'Вывод' : 'Взнос'} · расчёт в блоке {liquidityQuote.blockNumber}</strong>
                <p>{liquidityQuote.kind === 'exit' ? 'Списывается' : 'Ожидается'} {formatEther(liquidityQuote.bpt)} BPT.
                  {#if liquidityQuote.kind === 'initialize'}Минимум BPT: {formatEther(liquidityQuote.minimumBpt)}.{/if}</p>
                <table><thead><tr><th>Актив</th><th>Ожидается</th><th>{liquidityQuote.kind === 'exit' ? 'Минимум' : liquidityQuote.kind === 'join' ? 'Максимум' : 'Точно'}</th></tr></thead>
                  <tbody>{#each liquidityQuote.tokens as token, i}<tr>
                    <td title={token}>{token.toLowerCase() === config.addresses.TrueToken.toLowerCase() ? 'T' : pool.side === 0 ? 'YES' : 'NO'}</td>
                    <td>{formatEther(liquidityQuote.amounts[i])}</td><td>{formatEther(liquidityQuote.limits[i])}</td>
                  </tr>{/each}</tbody></table>
                <p class="footnote">Ограничения сохраняются при выдаче разрешений и подтверждении. Возврат активов и последующее погашение — отдельные операции.</p>
                <button class="primary" disabled={busy} onclick={executeLiquidity}>Подтвердить показанные пределы ↗</button>
              </div>{/if}
              <div class="divider"></div>
              <button
                class="text-button"
                onclick={() => select(data.statements.find((s) => s.id === pool.statementId))}
                >Split / merge / погашение ↗</button
              >
              <p class="footnote">
                После resolve состав пула остаётся риском LP. Hook запрещает swap после payout, но
                не устраняет adverse selection до него.
              </p>
              <div class="divider"></div>
              <button
                class="secondary"
                disabled={busy || !account || !pool.initialized}
                onclick={() =>
                  task(
                    'Сценарии погашения LP',
                    async () => (stress = await sdk.settlementStress(pool.address, account)),
                  )}>Сценарии True / False</button
              >{#if stress && stress.pool === pool.address}<div class="stress-results">
                  <div>
                    <span>Ваш текущий inventory</span><strong
                      >{amount(stress.baseInventory)} T + {amount(stress.outcomeInventory)} outcome</strong
                    >
                  </div>
                  <div><span>Если True</span><strong>{amount(stress.truePayout)} T</strong></div>
                  <div><span>Если False</span><strong>{amount(stress.falsePayout)} T</strong></div>
                  <p>
                    Срез блока {stress.blockNumber}; пропорциональный выход сейчас и затем
                    redemption. Будущие swap, gas и движения ликвидности не моделируются.
                  </p>
                </div>{/if}
            </article>
          </div>{/if}
      {:else if page === 'create'}
        <section class="page-heading compact">
          <div>
            <div class="eyebrow">REGISTER A PRECISE CLAIM</div>
            <h1>Новый рынок</h1>
            <p>
              Сначала формальное утверждение с сертификатом корректности, затем независимые пулы
              ликвидности.
            </p>
          </div>
        </section>
        <div class="two-columns">
          <article class="panel">
            <h2>01 / Регистрация утверждения</h2>
            <label
              >Название<input
                bind:value={title}
                maxlength="180"
                placeholder="Описание формальной теоремы"
              /></label
            ><label>Goal hash<input bind:value={goalHash} placeholder="0x…" /></label><label
              >Immutable proof profile<input bind:value={profileId} placeholder="0x…" /></label
            ><label
              >Snapshot / metadata<textarea
                bind:value={manifest}
                maxlength="1500"
                placeholder="Repository, exact commit, environment and declaration"
              ></textarea></label
            ><label
              >Сертификат регистрации<textarea
                class="code-input"
                bind:value={registrationCertificate}
                placeholder="Получите его в Lean Lab"
              ></textarea></label
            ><button
              class="primary full"
              disabled={busy || !registrationCertificate || !goalHash || !title}
              onclick={register}>Зарегистрировать в CTF ↗</button
            >
          </article>
          <article class="panel principles">
            <div class="eyebrow">WHAT IS COMMITTED</div>
            <h2>Теорема определяет контракт.</h2>
            <p>
              Goal и профиль закрепляют формальную цель, окружение Lean и допущения. Текст описания
              и отзывы не являются доказательствами.
            </p>
            <ol class="steps">
              <li>
                <b>01</b>
                <div>
                  <strong>Импортировать или написать Lean</strong><span
                    >Challenge и точный snapshot пакета.</span
                  >
                </div>
              </li>
              <li>
                <b>02</b>
                <div>
                  <strong>Проверить и получить сертификат</strong><span
                    >Реальный runner, без admin resolve.</span
                  >
                </div>
              </li>
              <li>
                <b>03</b>
                <div>
                  <strong>Зарегистрировать и открыть пул</strong><span
                    >CTF → wrappers → WeightedPool.</span
                  >
                </div>
              </li>
            </ol>
            <button class="secondary full" onclick={() => go('lab')}
              >Подготовить в Lean Lab ↗</button
            >{#if statement}<div class="divider"></div>
              <button class="text-button" onclick={() => select(statement)}
                >Перейти к созданному утверждению ↗</button
              >{/if}
          </article>
        </div>
      {:else if page === 'lab'}
        <section class="page-heading compact">
          <div>
            <div class="eyebrow">REPRODUCIBLE MATHEMATICS</div>
            <h1>Lean Lab</h1>
            <p>Источник → проверка окружения → сертификат → разрешение ончейн.</p>
          </div>
          <span class="pill">{config?.proof?.status || 'runner loading'}</span>
        </section>
        <ExternalCertificate {sdk} onuse={useExternalCertificate} onproposal={proposeExternalProfile} />
        <div class="two-columns lab-layout">
          <article class="panel">
            <div class="panel-heading">
              <h2>Challenge & solution</h2>
              <select
                aria-label="Опубликованный fixture"
                bind:value={fixtureId}
                onchange={pickFixture}
                ><option value="">Опубликованный пример</option>{#each fixtures as f}<option
                    value={f.id || f.fixtureId}>{f.title || f.id}</option
                  >{/each}</select
              >
            </div>
            <textarea
              class="lean-editor"
              bind:value={source}
              spellcheck="false"
              aria-label="Lean source"
            ></textarea><label
              >Исходная декларация<input
                readonly
                bind:value={declaration}
                placeholder="Oncm.goal"
              /></label
            >
            <div class="button-row">
              <button class="secondary" disabled={busy || proofBusy || profileId !== config.proof.profileId} onclick={() => job('check')}
                >Проверить Lean</button
              ><button class="primary" disabled={busy || proofBusy || profileId !== config.proof.profileId} onclick={() => job('register')}
                >Сертификат регистрации</button
              >
            </div>
            {#if profileId !== config.proof.profileId}<p class="footnote">Выбран отдельный профиль {profileId}.
              Локальный runner настроен на v3; используйте импорт соответствующего внешнего сертификата выше.</p>{/if}
            <p class="footnote">
              Задача выполняется в фоне. Источник и результаты очереди видны только вашему кошельку;
              опубликованный on-chain сертификат публичен. Профиль проверяет цель Oncm.goal и
              доказательство Oncm.solution. Декларацию импортированного пакета нужно связать с ними
              в Lean source.
            </p>
            <p class="footnote">Одна задача за раз; до 4 задач на кошелёк и 16 всего, включая выполняемую.
              Лимиты: проверка 5 с, регистрация 30 с, доказательство 120 с; память 2 GiB.</p>
            <button class="text-button" onclick={() => go('create')}
              >Продолжить регистрацию ↗</button
            >{#if latestJob}<div class="job-result">
                <span class="status">{latestJob.status}</span><code>{latestJob.id}</code>
                <div class="button-row">
                  <button class="secondary" onclick={downloadJob}>Скачать задачу JSON</button>
                  <button class="secondary" disabled={busy || proofBusy} onclick={restoreJobInput}>Загрузить источник в редактор</button>
                </div>
                {#if proofBusy}<button class="secondary" disabled={busy || latestJob.status === 'cancelling'} onclick={cancelJob}>Отменить задачу</button>{/if}
                <pre>{JSON.stringify(
                    latestJob.result || { status: latestJob.status, diagnostics: latestJob.diagnostics },
                    null,
                    2,
                  )}</pre>
              </div>{/if}
          </article>
          <div>
            <article class="panel">
              <h2>Доказательство исхода</h2>
              <label
                >Утверждение<select
                  value={sid} disabled={busy}
                  onchange={event => {
                    clearProofCertificate(); sid = event.currentTarget.value;
                    const selected = data.statements.find(s => s.id === sid);
                    if (selected) {
                      goalHash = selected.goalHash;
                      profileId = selected.profileId;
                    }
                  }}
                  ><option value="">Выберите утверждение</option
                  >{#each data.statements.filter((s) => s.kind === 0) as s}<option value={s.id}
                      >{s.title}</option
                    >{/each}</select
                ></label
              ><label
                >Доказать<select value={outcome} disabled={busy}
                  onchange={event => { clearProofCertificate(); outcome = event.currentTarget.value; }}
                  ><option value="1">P → True</option><option value="2">¬P → False</option></select
                ></label
              ><button
                class="primary full"
                disabled={busy || proofBusy || !sid || statement?.profileId !== config.proof.profileId}
                onclick={() => job('prove')}>Запустить Lean + zk proof</button
              ><label
                >Сертификат исхода<textarea
                  class="code-input"
                  value={certificate} disabled={busy}
                  oninput={event => setOutcomeCertificate(event.currentTarget.value)}
                  placeholder="0x…"
                ></textarea></label
              ><button
                class="secondary full"
                disabled={busy || !proofReady}
                onclick={submitOutcomeProof}>Отправить proof ончейн ↗</button
              >
              {#if certificate && !proofReady}<p class="footnote">Journal сертификата должен точно совпадать с открытым утверждением, профилем и исходом. Проверка кодировки не заменяет криптографическую проверку EVM.</p>{/if}
            </article>
            <article class="panel">
              <h2>Импорт snapshot</h2>
              <button class="secondary full" disabled={busy} onclick={browsePalomar}
                >Открыть публикации Palomar ↗</button
              >{#if palomarEntries.length}<input
                  aria-label="Поиск в Palomar"
                  bind:value={palomarQuery}
                  placeholder="Поиск публикаций"
                />
                <div class="palomar-list">
                  {#each palomarEntries.filter((e) => (e.title + ' ' + e.id)
                      .toLowerCase()
                      .includes(palomarQuery.toLowerCase())) as e}<button
                      disabled={busy}
                      onclick={() => importPalomar(e)}
                      ><strong>{e.title}</strong><small>{e.id} · v{e.version}</small><span
                        >Импортировать ↗</span
                      ></button
                    >{/each}
                </div>{/if}
              <p>
                Palomar помогает обнаружить публикацию. Критерий разрешения проверяется нашим
                профилем отдельно.
              </p>
              <label
                >GitHub repository<input
                  bind:value={repository}
                  placeholder="https://github.com/owner/repository"
                /></label
              ><label
                >Точный commit<input bind:value={commit} placeholder="40 hex characters" /></label
              ><label>Challenge path<input bind:value={challengePath} /></label><button
                class="secondary"
                disabled={busy}
                onclick={importPackage}>Импортировать Lean source</button
              >
            </article>
          </div>
        </div>
        <article class="panel">
          <h2>История задач</h2>
          {#if !jobs.length}<p>Задачи появятся после первого запуска.</p>{/if}{#each jobs
            .slice()
            .reverse() as j}<button
              class="job-row"
              onclick={() => inspectJob(j.id)}
              ><span class="status">{j.status}</span><strong>{j.input.action}</strong><code
                >{short(j.id, 12)}</code
              ><small>{new Date(j.createdAt).toLocaleString()}</small></button
            >{/each}
        </article>
      {:else if page === 'governance'}
        <section class="page-heading compact">
          <div>
            <div class="eyebrow">VAULT ASSEMBLY</div>
            <h1>Управление</h1>
            <p>
              Отдельное непередаваемое членство, OpenZeppelin Governor и Timelock. T не даёт
              голосов.
            </p>
          </div>
          <div class="button-row"><button class="secondary" disabled={busy} onclick={() => task('Обновление Governor', refreshGovernance)}>Обновить состояние</button>
          <button class="secondary" disabled={busy} onclick={() => mine(1)}>+1 local block</button>
          <button class="secondary" disabled={busy} onclick={() => mine(10)}>+10 local blocks</button></div>
        </section>
        <div class="two-columns">
          <article class="panel">
            <h2>Предложить изменение</h2>
            <label
              >Действие<select bind:value={govAction}
                ><option value="profile">Добавить / выключить proof profile</option><option
                  value="operator">Добавить / выключить оператор</option
                ><option value="membership">Изменить membership</option><option value="call"
                  >Произвольный protocol call</option
                ></select
              ></label
            >{#if govAction === 'operator'}<label
                >Operator ID<input bind:value={newOperator} placeholder="0x…" /></label
              ><label
                >Implementation address<input bind:value={operatorImpl} placeholder="0x…" /></label
              ><label>Specification hash<input bind:value={operatorSpec} placeholder="0x…" /></label
              >{:else if govAction === 'profile'}<label
                >Profile ID<input bind:value={newProfile} placeholder="0x…" /></label
              ><label>Verifier address<input bind:value={newVerifier} placeholder="0x…" /></label
              ><label>Manifest<textarea bind:value={newManifest}></textarea></label
              >{:else if govAction === 'membership'}<label
                >Адрес участника<input bind:value={newMember} placeholder="0x…" /></label
              >{:else}<label>Target address<input bind:value={target} placeholder="0x…" /></label
              ><label>Calldata<textarea class="code-input" bind:value={calldata}></textarea></label
              >{/if}{#if govAction !== 'call'}<label class="checkbox"
                ><input type="checkbox" bind:checked={enabled} />Активировать</label
              >{/if}<label
              >Обоснование<textarea bind:value={description} placeholder="Что изменится и почему"
              ></textarea></label
            ><button class="primary" disabled={busy || !description || !account || gov.account !== account || !gov.canPropose} onclick={proposeGov}
              >Создать proposal ↗</button
            ><button
              class="secondary"
              disabled={busy}
              onclick={() =>
                task(
                  'Симуляция вызова Timelock',
                  async () => (preflight = await sdk.governancePreflight(...govCall())),
                )}>Проверить вызов</button
            >{#if preflight}<div class="callout">
                <strong>{preflight.ok ? 'Симуляция успешна' : 'Вызов будет отклонён'}</strong>
                <p>
                  Блок {preflight.blockNumber} · от имени Timelock · без изменения chain. Результат может
                  измениться до исполнения.
                </p>
                <pre>{JSON.stringify(preflight, null, 2)}</pre>
              </div>{/if}
          </article>
          <article class="panel">
            <h2>Полномочия и границы</h2>
            <div class="quote-box">
              <span>Ваш текущий голосовой вес</span><strong>{amount(votingPower)} MEMBER</strong>
            </div>
            <dl>
              <dt>Governor</dt>
              <dd>{config?.addresses.Governor}</dd>
              <dt>Timelock</dt>
              <dd>{gov.timelock || config?.addresses.Timelock}</dd>
              <dt>Задержка</dt>
              <dd>{gov.timelockDelay ?? '—'} секунд</dd>
              <dt>Голосование</dt>
              <dd>{gov.votingDelay ?? '—'} ожидания · {gov.votingPeriod ?? '—'} голосования в единицах Governor clock</dd>
              <dt>Кворум (текущая настройка)</dt><dd>{gov.quorumNumerator ?? '—'} / {gov.quorumDenominator ?? '—'} от исторического membership supply</dd>
              <dt>Порог предложения</dt><dd>{gov.proposalThreshold === undefined ? '—' : formatEther(gov.proposalThreshold)} MEMBER</dd>
              <dt>Право предложить</dt><dd>{!account ? 'Подключите кошелёк' : gov.account !== account ? 'Обновите снимок' : gov.canPropose ? 'Порог достигнут на предыдущем Governor clock' : 'Голосового веса на предыдущем clock недостаточно'}</dd>
              <dt>Часы Governor</dt><dd>{gov.clockMode || '—'} · {gov.clock ?? '—'}</dd>
              <dt>Снимок чтения</dt><dd>Блок {gov.blockNumber ?? '—'} · {gov.blockHash || '—'}</dd>
            </dl>
            <p>
              Профиль неизменяем: новый verifier требует нового profile ID. Выключение останавливает
              новые регистрации, сохраняя разрешение уже открытых условий.
            </p>
            <p>
              Governor может изменять поддерживаемые настройки протокола, членство и разрешения
              Vault. Он не может назначить исход теоремы.
            </p>
          </article>
        </div>
        {#each gov.proposals as p (p.id)}<GovernanceProposal proposal={p} snapshot={gov} {account} {busy} onVote={vote} onMove={moveGov} onCancel={cancelGov} />{/each}
        {#if !gov.proposals.length}<article class="panel"><p>В этой цепи пока нет предложений Governor.</p></article>{/if}
      {:else if page === 'revenue'}
        {#key account}<RevenuePreview {sdk} {account} statements={data.statements} token={config.addresses.TrueToken} />{/key}
        <section class="page-heading compact">
          <div>
            <div class="eyebrow">SHARED PROTOCOL REVENUE</div>
            <h1>Доход и доли</h1>
            <p>Creator fee собирается в активах пула. Эпоха определяется транзакцией сбора.</p>
          </div>
          <span class="pill">Эпоха {activeAllocation?.epoch || '—'}</span>
        </section>
        <div class="two-columns">
          <article class="panel">
            <h2>Активное распределение</h2>
            {#each activeAllocation?.recipients || [] as r, i}<div class="allocation-row">
                <span>{short(r, 12)}</span><strong
                  >{Number(activeAllocation.weights[i]) / 100}%</strong
                >
                <div style={'width:' + Number(activeAllocation.weights[i]) / 100 + '%'}></div>
              </div>{/each}
            <p class="footnote">
              Split {short(activeAllocation?.split, 12)} · owner = zero. Старые эпохи и начисленные права
              не изменяются.
            </p>
            <h3>Предложить новые доли</h3>
            <label
              >Адрес и процент, одна строка на получателя<textarea
                class="code-input tall"
                bind:value={allocationText}
                placeholder={config?.accounts[0] + ' 60\n' + config?.accounts[1] + ' 40'}
              ></textarea></label
            ><button class="primary" disabled={busy} onclick={proposeAllocation}
              >Предложить распределение</button
            >
          </article>
          <article class="panel">
            <h2>Сбор и получение</h2>
            <label
              >Пул<select bind:value={poolAddress}
                ><option value="">Выберите пул</option>{#each data.pools as p}<option
                    value={p.address}
                    >{short(p.address)} · {data.statements.find((s) => s.id === p.statementId)
                      ?.title}</option
                  >{/each}</select
              ></label
            ><button
              class="secondary full"
              disabled={busy || !poolAddress}
              onclick={() => tx('Сбор creator fees', () => sdk.collect(poolAddress))}
              >Собрать creator fees → Split</button
            >
            <div class="divider"></div>
            {#each Object.entries(claimables) as [t, b]}<div class="claim-row">
                <span>{t === config.addresses.TrueToken ? 'T' : short(t)} <b>{amount(b)}</b></span
                ><button
                  class="text-button"
                  disabled={busy || BigInt(b) === 0n}
                  onclick={async () => {
                    await tx('Получение дохода', () => sdk.claim(t));
                    await loadClaims();
                  }}>Получить ↗</button
                >
              </div>{/each}
            <p class="footnote">
              Public Balancer withdraw может перевести активы на controller. sweep(token) направляет
              их в текущую эпоху. Выигравшие outcome погашаются в T.
            </p>
          </article>
        </div>
        {#each data.allocationProposals as p}<article class="panel">
            <div class="panel-heading">
              <h2>Распределение #{p.id}</h2>
              <span class="status"
                >{p.applied
                  ? 'Применено'
                  : p.baseEpoch === activeAllocation?.epoch
                    ? 'Ожидает согласий'
                    : 'Устарело'}</span
              >
            </div>
            <p>
              {p.recipients
                .map((r, i) => short(r) + ': ' + Number(p.weights[i]) / 100 + '%')
                .join(' · ')}
            </p>
            {#each p.decreasing as r, i}<div class="claim-row">
                <span
                  >{short(r)} · доля уменьшается · {p.consents[i]
                    ? 'согласен'
                    : 'нет согласия'}</span
                >{#if r.toLowerCase() === account.toLowerCase() && !p.applied && p.baseEpoch === activeAllocation?.epoch}<button
                    class="secondary"
                    disabled={busy}
                    onclick={() =>
                      tx('Изменение согласия', () =>
                        sdk.send(sdk.allocation.setConsent(p.id, !p.consents[i])),
                      )}>{p.consents[i] ? 'Отозвать' : 'Согласиться'}</button
                  >{/if}
              </div>{/each}<button
              class="primary"
              disabled={busy ||
                p.applied ||
                p.baseEpoch !== activeAllocation?.epoch ||
                p.consents.some((c) => !c)}
              onclick={() =>
                tx('Активация эпохи', () => sdk.send(sdk.allocation.applyAllocation(p.id)))}
              >Активировать эпоху</button
            >
          </article>{/each}
        <article class="panel">
          <h2>Неизменяемые эпохи</h2>
          {#each data.allocations as a}<details class="epoch">
              <summary>Эпоха {a.epoch} · {short(a.split, 12)}</summary>
              <p>
                {a.recipients
                  .map((r, i) => short(r) + ': ' + Number(a.weights[i]) / 100 + '%')
                  .join(' · ')}
              </p>
              <div class="button-row">
                {#each [config.addresses.TrueToken, ...data.statements.flatMap( (s) => [s.yes, s.no], )] as t}<button
                    class="secondary"
                    disabled={busy}
                    onclick={async () => {
                      await tx('Splits distribution', () => sdk.distribute(a.epoch, t));
                      await loadClaims();
                    }}>Распределить {t === config.addresses.TrueToken ? 'T' : short(t, 3)}</button
                  ><button
                    class="text-button"
                    disabled={busy}
                    onclick={() =>
                      tx('Sweep forwarded fees', () => sdk.send(sdk.allocation.sweep(t)))}
                    >Sweep {short(t, 3)}</button
                  >{/each}
              </div>
            </details>{/each}
        </article>
      {:else if page === 'activity'}
        <section class="page-heading compact">
          <div>
            <div class="eyebrow">BLOCK BY BLOCK</div>
            <h1>Журнал блокчейна</h1>
            <p>Реальные RPC-блоки, транзакции, события и изменения балансов из Transfer logs.</p>
          </div>
          <button
            class="secondary"
            onclick={() =>
              task('Обновление блоков', async () => (activity = await api('/activity')))}
            >Обновить ↻</button
          >
        </section>
        <div class="explorer-summary">
          <i class="network-dot"></i>VAULT CHAIN 31373
          <span>Блоки {activity.from}–{activity.to}</span><code>RPC :9547</code>
          {#if config?.chainInstance}<code title={config.chainInstance.id}>Сеть {short(config.chainInstance.id, 8)}</code>{/if}
        </div>
        {#each activity.blocks as block}<article class="block">
            <div class="block-heading">
              <div>
                <span class="block-icon">▱</span>
                <h2>Блок {block.number}</h2>
                <span>{block.transactions.length} tx</span>
              </div>
              <time>{new Date(block.timestamp * 1000).toLocaleString()}</time>
            </div>
            <code class="block-hash">{block.hash}</code>{#each block.transactions as t}<details
                class="transaction"
                open={t.hash === lastTx}
              >
                <summary
                  ><span class="tx-status" class:failed={!t.status}>{t.status ? '✓' : '×'}</span
                  ><strong
                    >{t.call?.method || (t.to ? 'Transfer / call' : 'Contract deployment')}</strong
                  ><code>{short(t.hash, 12)}</code><span>{short(t.from)} → {short(t.to)}</span
                  ></summary
                >
                <div class="tx-details">
                  <dl>
                    <dt>Transaction</dt>
                    <dd>{t.hash}</dd>
                    <dt>From</dt>
                    <dd>{t.from}</dd>
                    <dt>To</dt>
                    <dd>{t.to || 'Contract creation'}</dd>
                    <dt>Gas</dt>
                    <dd>{t.gasUsed} units · {formatEther(t.gasCost)} ETH</dd>
                  </dl>
                  {#if t.balanceDeltas.length}<h4>Изменения токенов в этой транзакции</h4>
                    {#each t.balanceDeltas as d}<div class="balance-delta">
                        <span>{short(d.account, 10)}</span><code>{short(d.token)}</code><strong
                          class:negative={BigInt(d.delta) < 0n}
                          >{BigInt(d.delta) > 0n ? '+' : ''}{amount(d.delta, 8)}</strong
                        >
                      </div>{/each}{/if}
                  <h4>События ({t.events.length})</h4>
                  {#each t.events as e}<details class="event">
                      <summary>#{e.index} <b>{e.event}</b> <code>{short(e.address)}</code></summary>
                      <pre>{JSON.stringify(
                          e.args || { topics: e.topics, data: e.data },
                          null,
                          2,
                        )}</pre>
                    </details>{/each}
                </div>
              </details>{/each}
          </article>{/each}{#if activity.previous}<button
            class="secondary full"
            onclick={() =>
              task(
                'Предыдущие блоки',
                async () => (activity = await api('/activity?to=' + activity.previous)),
              )}>Ранее: до блока {activity.previous} ↓</button
          >{/if}
      {/if}
      {#if page === 'lab' || (page === 'detail' && statement?.kind === 0)}
        {#key account + ':' + (statement?.id || '')}
          <PackageEditor {api} {account} statement={statement?.kind === 0 ? statement : null}
            currentSource={source} onUseSource={(text) => { source = text; fixtureId = ''; declaration = ''; go('lab'); }} />
        {/key}
      {/if}
      <footer class="page-footer">
        <span>VAULT / ONCM</span><span>Open-source foundations. Verifiable outcomes.</span><a
          href="/api/health"
          target="_blank">Network status ↗</a
        >
      </footer>
    </div>
  </main>
</div>

{#if profileView}<div class="modal-backdrop">
    <section class="profile-modal" role="dialog" aria-modal="true" aria-label="Профиль кошелька">
      <div class="panel-heading">
        <div>
          <div class="eyebrow">WALLET PROFILE</div>
          <h2>{profileView.displayName || 'Участник Vault'}</h2>
        </div>
        <button
          class="secondary"
          onclick={() => {
            profileView = null;
            history.replaceState(null, '', location.pathname);
          }}>Закрыть ×</button
        >
      </div>
      <code class="profile-address">{profileView.address}</code>
      <p class="profile-bio">{profileView.bio || 'Описание пока не добавлено.'}</p>
      <div class="metrics">
        <article>
          <div class="metric-label">Обсуждения</div>
          <strong>{profileView.commentCount}</strong>
        </article>
        <article>
          <div class="metric-label">True</div>
          <strong>{amount(profileBalances[config.addresses.TrueToken])} T</strong>
        </article>
      </div>
      <h3>Позиции кошелька</h3>
      {#each data.statements as s}{#if BigInt(profileBalances[s.yes] || 0) || BigInt(profileBalances[s.no] || 0)}<button
            class="profile-holding"
            onclick={() => {
              profileView = null;
              select(s);
            }}
            ><span>{s.title}</span><strong
              >{amount(profileBalances[s.yes])} YES · {amount(profileBalances[s.no])} NO</strong
            ></button
          >{/if}{/each}{#each data.pools as p}{#if BigInt(profileBalances[p.address] || 0)}<div
            class="profile-holding"
          >
            <span>LP {short(p.address)}</span><strong
              >{amount(profileBalances[p.address])} BPT</strong
            >
          </div>{/if}{/each}{#if account.toLowerCase() === profileView.address.toLowerCase()}<div
          class="divider"
        ></div>
        <label>Отображаемое имя<input bind:value={displayName} maxlength="40" /></label><label
          >О себе<textarea bind:value={bio} maxlength="1000"></textarea></label
        ><button class="primary" disabled={busy} onclick={saveProfile}>Сохранить профиль</button
        >{/if}
      <p class="footnote">
        Имя и репутация относятся к обсуждениям. Адрес остаётся идентификатором; голоса за
        комментарии не влияют на settlement или Governor.
      </p>
    </section>
  </div>{/if}
