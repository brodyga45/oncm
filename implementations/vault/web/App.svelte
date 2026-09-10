<script>
  import {browserConfig, publicOrigin, assertPublicWrites} from '../sdk/public-transport.mjs';
  import {assertLocalConfig} from '../sdk/local-endpoints.mjs';
  import {derivedReview,derivedArguments} from './derived-review.mjs';
  import {createSnapshotImport} from './snapshot-draft.mjs';
  import nativeManifest from '../proof/manifest.json';
  import { proofNotice } from './proof-status.mjs';
  import { bindOutcomeCertificate, bindProofJob, proofBindingMatches } from './proof-binding.mjs';
  import PackageEditor from './PackageEditor.svelte';
  import RevenuePreview from './RevenuePreview.svelte';
  import TreasuryPanel from './TreasuryPanel.svelte';
  import MonetaryPolicyPanel from './MonetaryPolicyPanel.svelte';
  import {protocolIdentity} from './protocol-identity.mjs';
  import OperatorReview from './OperatorReview.svelte';
  import GovernanceProposal from './GovernanceProposal.svelte';
  import ExternalCertificate from './ExternalCertificate.svelte';
  import SocialPanel from './SocialPanel.svelte';
  import {createSettlementScenario,scenarioMatches} from './settlement-scenario.mjs';
  import {genericRegistrationFields} from './generic-registration.mjs';
  let profileEpoch = 0, launchPublicUrl = '';
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
  let treasuryDraft = null, monetaryDraft = null, monetaryReviewEpoch = 0;
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
  const scenarioReader=createSettlementScenario({publish:value=>{stress=value;}});
  let registrationImport = null, snapshotInfo=null, sourceImportEpoch=0;
  function applySnapshotFields(fields){
    ({source,goalHash,profileId,registrationCertificate,registrationImport,fixtureId,declaration,title,manifest,latestJob}=fields);
    if(fields.snapshotInfo){snapshotInfo=fields.snapshotInfo;repository=snapshotInfo.repository;commit=snapshotInfo.commit;challengePath=snapshotInfo.challengePath;}
  }
  const snapshotImporter=createSnapshotImport({reset:fields=>{clearProofCertificate();snapshotInfo=null;sourceImportEpoch++;applySnapshotFields(fields);},accept:applySnapshotFields});
  $: if(registrationImport&&(registrationImport.goalHash!==goalHash||registrationImport.profileId!==profileId||registrationImport.certificate!==registrationCertificate))registrationImport=null;
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
  $: snapshotImporter.setContext({account,client:sdk,chainId:config?.chainId,chainInstance:config?.chainInstance?.id,registry:config?.addresses.StatementRegistry,statementId:sid});
  $: proofBusy = ['queued', 'running', 'cancelling'].includes(latestJob?.status);
  $: statement = data.statements.find((s) => s.id === sid);
  $: derivedPreview=derivedReview({statement,kind:derivedKind,expected:derivedExpected,deadlineInput:deadline});
  $: proofReady = proofBindingMatches(certificateBinding, statement, outcome, certificate);
  $: if (certificateBinding && !proofReady) clearProofCertificate();
  $: pool = data.pools.find((p) => p.address === poolAddress);
  $: scenarioContext={client:sdk,account,pool:poolAddress,chainId:config?.chainId};
  $: scenarioReader.setContext(scenarioContext);
  $: tradeKey = JSON.stringify([poolAddress, direction, String(tradeAmount), String(slippage), account]);
  $: quoteCurrent = tradeQuote?.key === tradeKey;
  $: liquidityKey = [poolAddress, account, String(bpt), String(slippage), String(initialT), String(initialOutcome)].join('|');
  $: liquidityCurrent = liquidityQuote?.key === liquidityKey;
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  $: selectedProtocolIdentity=protocolIdentity(config);
  $: activeAllocation = data.allocations.at(-1);
  $: visible = data.statements.filter(
    (s) =>
      (s.title + ' ' + s.id).toLowerCase().includes(search.toLowerCase()) &&
      (statusFilter === 'all' || String(s.outcome) === statusFilter),
  );
  const short = (a, n = 6) => (a ? a.slice(0, n + 2) + '…' + a.slice(-4) : '—');
  const amount = (v, d = 3) => {
    try {
      const value = Number(formatEther(v || '0'));
      return value.toLocaleString('en-US', value !== 0 && Math.abs(value) < 10 ** -d
        ? { maximumSignificantDigits: 3 }
        : { maximumFractionDigits: d });
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
      data.config.addresses.PoolCoordinator !== config.addresses.PoolCoordinator ||
      data.config.social?.resolver !== config.social?.resolver ||
      data.config.publicMode !== config.publicMode ||
      data.config.publicWriteEnabled !== config.publicWriteEnabled
    ) {
      const current = await api('/config');
      config = browserConfig(current.config, location.origin);
      abis = current.abis;
      clearWalletState();
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
        jobs = account && !config.publicMode ? await api('/jobs') : [];
      }
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
      '\n\nSign in to private Vault Lean jobs and source tools. Social posts are separate onchain transactions. This does not authorize token transfers.\n\nURI: ' +
      location.origin +
      '\nVersion: 1\nChain ID: 31373\nNonce: ' +
      nonce +
      '\nIssued At: ' +
      new Date().toISOString();
    const signature = await connectedSigner.signMessage(message);
    await api('/auth/verify', { method: 'POST', body: JSON.stringify({ message, signature }) });
  }
  function clearWalletState() {
    profileEpoch++;snapshotImporter.invalidate();snapshotInfo=null;sourceImportEpoch++;
    signer = undefined;
    account = '';
    walletKind = '';
    if (config && abis) sdk = createSDK(config, abis);
    latestJob = undefined;
    jobs = [];
    tradeQuote = null;
    liquidityQuote = null;
    scenarioReader.clear();
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
    treasuryDraft = null; monetaryDraft = null; monetaryReviewEpoch++;
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
        : await injectedWallet(window.ethereum, config);
      const connectedAccount = await connectedSigner.getAddress();
      try { await login(connectedSigner, connectedAccount); }
      catch { notice = 'Кошелёк подключается для ончейн действий. SIWE для приватных инструментов недоступен.'; }
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
      if (page === 'lab' && !config.publicMode) jobs = await api('/jobs');
      walletOpen = false;
    });
  }
  async function tx(label, fn) {
    return task(label, async () => {
      assertPublicWrites(config);
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
  async function createDerived() {
    const args=derivedArguments(derivedPreview), client=sdk, owner=account, parent=sid, name=derivedTitle;
    const fingerprint=JSON.stringify(args);
    return tx('Регистрация производного',()=>{
      if(client!==sdk||owner!==account||parent!==sid||name!==derivedTitle||fingerprint!==JSON.stringify(derivedPreview?.args))throw Error('Параметры или кошелёк изменились. Проверьте условие заново.');
      return client.derived(...args,name);
    });
  }
  async function checkLean() {
    if (config.publicMode) { error = 'В публичном режиме Lean выполняется вне сайта; импортируйте готовый сертификат.'; return; }
    const action = 'check';
    const capturedEpoch = proofEpoch, owner = account;
    const submitted = await tx('Lean / ' + action, async () => {
      const j = await api('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          action,
          source,
          profileId: config.proof.profileId,
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
    snapshotImporter.invalidate();snapshotInfo=null;
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
    snapshotImporter.invalidate();snapshotInfo=null;
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
    const client=sdk,owner=account,payload={goalHash,profileId,title,manifest,registrationCertificate};
    const isCurrent=()=>client===sdk&&owner===account&&JSON.stringify(payload)===JSON.stringify({goalHash,profileId,title,manifest,registrationCertificate});
    await tx('Регистрация проверенного утверждения', async () => {
      if(!isCurrent())throw Error('Кошелёк или поля регистрации изменились. Проверьте форму ещё раз.');
      const r = await client.register(payload,{isCurrent});
      const l = r.logs
        .map((l) => {
          try {
            return client.registry.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((l) => l?.name === 'StatementCreated');
      if (l&&isCurrent()) { clearProofCertificate(); sid = l.args.statementId; }
      return r;
    });
  }
  async function useExternalCertificate(review, descriptor) {
    snapshotImporter.invalidate();snapshotInfo=null;
    if (review.outcome === 0) {
      clearProofCertificate();
      goalHash = review.goalHash; profileId = review.profileId;
      registrationCertificate = review.certificate;
      if(review.genericBundle){
        const fields=genericRegistrationFields(review);
        title=fields.title;source=fields.source;manifest=fields.manifest;
        registrationImport=review;
      }else{
        title=review.goal.title;source=review.goal.source;registrationImport=null;
        manifest = JSON.stringify({ sourceUrl: review.goal.sourceUrl, sourceSha256: review.goal.sourceSha256,
          goalExportSha256: review.goal.goalExportSha256, profile: descriptor.tag, imageId: review.imageId,
          sourceCommit: review.sourceCommit, runId: review.runId });
      }
      fixtureId = ''; declaration = 'Oncm.goal';
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
  async function resolveSelectedDerived(){
    const id=sid,client=sdk,owner=account;
    const isCurrent=()=>id===sid&&client===sdk&&owner===account;
    await tx('Вычисление производного',()=>{
      if(!isCurrent())throw Error('Кошелёк или производное утверждение изменилось.');
      return client.resolveDerived(id,{isCurrent});
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
  async function importPackage() {
    const request={repository,commit,challengePath};
    await tx('Импорт GitHub snapshot',()=>snapshotImporter.load(()=>api('/import',{method:'POST',body:JSON.stringify(request)}),nativeManifest.lean));
  }
  async function browsePalomar() {
    await task('Чтение опубликованного Palomar registry', async () => {
      const r = await api('/palomar');
      palomarEntries = r.data.entries || [];
    });
  }
  async function importPalomar(e) {
    const request={id:e.id,version:e.version};
    await tx('Импорт Palomar '+e.id,()=>snapshotImporter.load(()=>api('/palomar/import',{method:'POST',body:JSON.stringify(request)}),nativeManifest.lean));
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
    if (govAction === 'treasury') {
      if (!treasuryDraft) throw Error('Подготовьте действие казны заново');
      t = treasuryDraft.target; d = treasuryDraft.data;
    } else if (govAction === 'operator') {
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
    const owner=account,client=sdk,plan=govAction==='monetary'?monetaryDraft:treasuryDraft,reason=description,action=govAction,reviewEpoch=monetaryReviewEpoch;
    await tx('Предложение Governor', async () => {
      if(action==='monetary')return client.monetaryPolicy.propose(plan,reason,{isCurrent:()=>owner===account&&client===sdk&&plan===monetaryDraft&&reason===description&&govAction===action&&reviewEpoch===monetaryReviewEpoch});
      if(action==='treasury')return client.treasury.propose(plan,reason,{isCurrent:()=>owner===account&&client===sdk&&plan===treasuryDraft&&reason===description&&govAction===action});
      const [t, d] = govCall();
      return sdk.send(sdk.c('Governor', 'VaultGovernor').propose([t], [0], [d], description));
    });
    await refreshGovernance();
  }
  async function reviewMonetaryPlan(plan) {
    monetaryDraft=plan;monetaryReviewEpoch++;govAction='monetary';preflight=null;
    description=plan.input.kind==='create-program'
      ? `Mint ${plan.input.budgetT} T directly into RewardBudget; create program ${plan.input.expectedId} with exact meter, period and fixed remainder recipient. Protocol fees remain beneficiary income.`
      : plan.input.kind==='mint' ? `Mint ${plan.input.amountT} T to ${plan.input.recipient}; new supply without MEMBER votes or protocol revenue diversion.`
      : `Set ${plan.input.kind} to ${plan.input.percent}% through the pinned fee authority; collected protocol income remains beneficiary income.`;
    await go('governance');
  }
  async function claimMonetary(id) {const owner=account,client=sdk;await tx('Получение награды',()=>client.monetaryPolicy.claim(id,{isCurrent:()=>owner===account&&client===sdk}));}
  async function stakeMonetary(id,amount,options={}) {const owner=account,client=sdk;await tx('Блокировка BPT до конца программы',()=>client.monetaryPolicy.stake(id,amount,{isCurrent:()=>owner===account&&client===sdk&&options.isCurrent?.()!==false}));}
  async function withdrawMonetary(id) {const owner=account,client=sdk;await tx('Возврат BPT программы',()=>client.monetaryPolicy.withdraw(id,{isCurrent:()=>owner===account&&client===sdk}));}
  async function closeMonetary(plan,options={}) {const owner=account,client=sdk;await tx('Закрытие программы с фиксированным получателем остатка',()=>client.monetaryPolicy.close(plan,{isCurrent:()=>owner===account&&client===sdk&&options.isCurrent?.()!==false}));}
  async function syncMonetaryFees(plan,options={}) {const owner=account,client=sdk;let result;await tx('Обновление protocol fee существующего пула',async()=>{result=await client.monetaryPolicy.syncProtocolFee(plan,{isCurrent:()=>owner===account&&client===sdk&&options.isCurrent?.()!==false});return result.receipt;});return result;}
  async function reviewTreasuryPlan(plan) {
    treasuryDraft=plan;govAction='treasury';preflight=null;
    description=plan.input.kind==='consent'
      ? `DAO ${plan.input.approved?'approves':'revokes consent for'} allocation #${plan.input.proposalId}; treasury share ${Number(plan.detail.oldBps)/100}% → ${Number(plan.detail.newBps)/100}%; base epoch ${plan.detail.baseEpoch}.`
      : `Treasury transfer ${plan.input.amount} raw units of ${plan.input.token} to ${plan.input.recipient}.`;
    await go('governance');
  }
  async function prepareTreasuryConsent(p,approved) {
    const owner=account,client=sdk;
    await task('Проверка согласия казны',async()=>{
      const plan=await client.treasury.prepare({kind:'consent',proposalId:String(p.id),approved});
      if(owner===account&&client===sdk)await reviewTreasuryPlan(plan);
    });
  }
  function treasuryAllocationDraft() {
    const draft=sdk.treasury.allocation20(activeAllocation);
    allocationText=draft.recipients.map((r,i)=>r+' '+(Number(draft.weights[i])/100).toFixed(2)).join('\n');
    notice=`Новый черновик DAO20 из эпохи ${draft.baseEpoch}. Проверьте получателей и создайте отдельное предложение; существующие предложения не изменены.`;
  }
  async function claimTreasury(token) {
    const owner=account,client=sdk;
    await tx('Получение Warehouse → Timelock казны',()=>client.treasury.claim(token,{isCurrent:()=>owner===account&&client===sdk}));
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
      assertLocalConfig(config);
      await sdk.ensureChain();
      await sdk.provider.send('evm_increaseTime', [count]);
      await sdk.provider.send('hardhat_mine', ['0x' + count.toString(16)]);
    });
    if (page === 'governance') await refreshGovernance();
  }
  async function openProfile(a) {
    const ticket = ++profileEpoch, client = sdk;
    if (!client.social) { error = 'Социальные контракты пока не подключены'; return; }
    const [view, balances] = await Promise.all([client.social.profile(a), api('/snapshot?account=' + a)]);
    if (ticket !== profileEpoch || client !== sdk) return;
    profileView = view;
    displayName = view.displayName;
    bio = view.bio;
    profileBalances = balances.balances;
    location.hash = 'profile/' + a;
  }
  async function saveProfile() {
    const ticket = profileEpoch, client = sdk, owner = account, viewed = profileView?.address;
    const name = displayName, biography = bio, previousUID = profileView?.uid;
    const isCurrent = () => ticket === profileEpoch && client === sdk && owner === account && viewed === profileView?.address;
    const receipt = await tx('Профиль в EAS', async () => {
      if (!isCurrent() || owner.toLowerCase() !== viewed?.toLowerCase()) throw Error('Профиль или кошелёк изменился');
      return client.social.updateProfile(name, biography, { previousUID, isCurrent });
    });
    if (receipt && isCurrent()) await openProfile(viewed);
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
        const loaded = await api('/config');
        abis = loaded.abis;
        try { config = browserConfig(loaded.config, location.origin); }
        catch (e) {
          if (loaded.config.publicMode) launchPublicUrl = publicOrigin(loaded.config.publicOrigin);
          throw e;
        }
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
        // Public tunnel quotas count polling too; writes still refresh immediately.
        let refreshing = false;
        timer = setInterval(async () => {
          if (refreshing || document.hidden) return;
          refreshing = true;
          try { await refresh(); } catch {} finally { refreshing = false; }
        }, config.publicMode ? 30000 : 7000);
      } catch (e) {
        error = e.message;
      }
    })();
    return () => {
      scenarioReader.dispose();
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
        Vault workspace <span class="block-chip">{selectedProtocolIdentity.label}</span><span>/</span>
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
    {#if config}<section class="panel" aria-label="Выбранная версия протокола"><p><strong>{selectedProtocolIdentity.label}</strong> · {selectedProtocolIdentity.notice}</p><details><summary>Адреса выбранной версии</summary><p>T: <code>{config.addresses.TrueToken}</code><br />Реестр: <code>{config.addresses.StatementRegistry}</code></p><a href="/api/config" target="_blank">Deployment и ABI ↗</a></details></section>{/if}
    {#if launchPublicUrl}<section class="panel" role="alert"><p>Этот экземпляр настроен на публичный HTTPS-адрес. Откройте его для чтения блокчейна и подключения кошелька.</p><a class="primary" href={launchPublicUrl}>Открыть публичный Vault ↗</a></section>{/if}
    {#if walletOpen && config}<div class="wallet-panel">
        <h3>Ваш кошелёк</h3>
        {#if config.publicMode}<p>Нужен кошелёк с поддержкой пользовательских сетей (custom RPC), например MetaMask.</p>{/if}
        <p>Профиль, блог и обсуждения записываются в блокчейн транзакциями кошелька. Подпись SIWE используется для личных инструментов.</p>
        <button class="primary full" onclick={() => connect(false)} disabled={busy}
          >Browser wallet ↗</button
        >
        {#if config?.publicMode}<p>Сеть Vault 31373 · тестовый ETH нужен для газа, T — для торговли и ликвидности. Начальные тестовые средства распределяет владелец со своего кошелька.</p><code>{config.rpcUrl}</code><p>Кошелёк попросит подтвердить добавление или переключение сети, если это необходимо.</p>{#if config.publicOwnerAddress}<p>Адрес владельца: <code>{config.publicOwnerAddress}</code></p>{/if}{/if}
        {#if account}<button class="secondary full" disabled={busy} onclick={() => disconnectWallet()}>Отключить кошелёк и выйти</button>{/if}
        {#if !config?.publicMode}<div class="divider"></div>
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
        ><small>Только {config?.rpcUrl || "локальный RPC"} / chain 31373. Тестовые T без стоимости.</small>{/if}
      </div>{/if}
    {#if config?.publicMode}<section class="panel" aria-label="Публичный режим"><strong>{config.publicWriteEnabled && config.capabilities?.walletTransactions ? "Публичный Vault · транзакции подтверждаются вашим кошельком" : "Публичный Vault · только чтение, отправка транзакций пока отключена"}</strong><p>Готовые сертификаты можно импортировать и проверить. Локальные кошельки, ускорение времени и вычисление Lean на сервере недоступны.</p></section>{/if}
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
              Импортируйте Lean challenge и подготовленный вне сайта сертификат регистрации,
              проверьте его и создайте рынок.
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
              <dt>YES / NO</dt>
              <dd>{statement.yes}<br />{statement.no}</dd>
            </dl>
            {#if statement.kind > 0}
              {#if statement.kind===4}{#key sdk}{#key statement.id}<OperatorReview {sdk} statementId={statement.id} />{/key}{/key}
              {:else}<p>
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
              </p>{/if}
              {#if statement.kind === 1 || statement.kind === 3}<p class="footnote">
                Учитывается время принятия исхода в блокчейне, включая точное равенство дедлайну.
                После срока без нужного события производное можно разрешить как False.
                Это не опровержение исходной математической теоремы.
              </p>{/if}
              <button
                class="primary"
                disabled={busy || statement.outcome !== 0}
                onclick={resolveSelectedDerived}
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
              ><label>Дедлайн<input type="text" bind:value={deadline} placeholder="2030-01-01 00:00" disabled={derivedKind==='2'} /></label>
            </div>
            <div class="callout" aria-label="Проверка производного перед транзакцией">
              {#if derivedPreview.valid}<strong>Точные параметры транзакции</strong><dl>
                <dt>Родитель</dt><dd>{derivedPreview.parentTitle}</dd><dt>Dependency ID</dt><dd><code>{derivedPreview.parentId}</code></dd>
                <dt>Ожидаемый исход</dt><dd>{derivedPreview.expectedLabel}</dd>
                {#if derivedPreview.deadline}<dt>Срок · местное время</dt><dd>{derivedPreview.deadline.local}</dd><dt>Срок · UTC</dt><dd>{derivedPreview.deadline.utc}</dd><dt>Срок · Unix seconds</dt><dd>{derivedPreview.deadline.unix}</dd>
                {:else}<dt>Срок</dt><dd>Отсутствует · аргумент 0</dd>{/if}</dl>
                <p class="footnote">Эти значения отправятся в registry. Граница включительна: resolvedAt ≤ deadline. Прошедшая дата допустима; создание не разрешает условие.</p>
              {:else}<p role="alert">{derivedPreview.error}</p>{/if}
            </div>
            <label
              >Название<input
                bind:value={derivedTitle}
                placeholder="Будет ли утверждение доказано до…"
              /></label
            ><button
              class="secondary"
              disabled={busy || !account || !derivedPreview.valid || !derivedTitle.trim()}
              onclick={createDerived}>Создать условие</button
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
          <SocialPanel client={sdk?.social} {account} statementId={sid} onProfile={openProfile}
            onReceipt={(r)=>{lastTx=r.hash;notice='Социальная запись подтверждена в блоке '+r.blockNumber;}} />
        </article>
      {:else if page === 'capital'}
        <section class="page-heading compact">
          <div>
            <div class="eyebrow">WEIGHTED CAPITAL</div>
            <h1>Ваш капитал</h1>
            <p>Самостоятельные Balancer WeightedPool с каноническими активами T и YES либо NO.</p>
          </div>
          <span class="pill">Комиссии по политике выбранного пула</span>
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
                    () => scenarioReader.load(),
                  )}>Сценарии True / False</button
              >{#if scenarioMatches(stress,scenarioContext)}<div class="stress-results">
                  <div>
                    <span>Ваш текущий inventory</span><strong
                      >{amount(stress.baseInventory)} T + {amount(stress.outcomeInventory)} outcome</strong
                    >
                  </div>
                  <div><span>Если True</span><strong>{amount(stress.truePayout)} T</strong></div>
                  <div><span>Если False</span><strong>{amount(stress.falsePayout)} T</strong></div>
                  <p>
                    Кошелёк {stress.account} · срез блока {stress.blockNumber}; пропорциональный выход сейчас и затем
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
            {#if registrationImport}<p class="footnote">Внешний пакет: original EVM и immutable bridge проверили точный goal export. Название и исходник — сведения автора; source → goal: not-verified. Исходник не подменяет математическую цель.</p>{/if}
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
                placeholder="Вставьте готовый сертификат или загрузите verified.json в Lean Lab"
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
                  <strong>Проверить внешний сертификат</strong><span
                    >Подготовьте его вне сайта и загрузите в Lean Lab.</span
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
              >Импортировать сертификат в Lean Lab ↗</button
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
            <p>{config.publicMode ? 'Импорт и проверка готовых сертификатов для действий ончейн. Lean и переносимые пакеты подготовьте вне сайта.' : 'Проверка Lean и импорт готовых сертификатов для действий ончейн.'}</p>
          </div>
          <span class="pill">{config.publicMode ? "Импорт внешнего сертификата" : "Native Lean check · внешний сертификат"}</span>
        </section>
        {#key sourceImportEpoch}<ExternalCertificate {sdk} onuse={useExternalCertificate} onproposal={proposeExternalProfile} />{/key}
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
              oninput={()=>{snapshotImporter.invalidate();if(snapshotInfo)snapshotInfo={...snapshotInfo,edited:true};}}
            ></textarea><label
              >Исходная декларация<input
                readonly
                bind:value={declaration}
                placeholder="Oncm.goal"
              /></label
            >
            {#if snapshotInfo}<div class="callout" aria-label="Происхождение импортированного snapshot">
              <strong>Импортирован исходник · сертификат не проверен</strong>
              <dl><dt>Repository</dt><dd>{snapshotInfo.repository}</dd><dt>Exact commit</dt><dd>{snapshotInfo.commit}</dd><dt>Challenge path</dt><dd>{snapshotInfo.challengePath}</dd><dt>Imported source SHA256</dt><dd>{snapshotInfo.sourceSha256}</dd><dt>Toolchain из snapshot</dt><dd>{snapshotInfo.toolchain||'Не указан в этом импорте'}</dd><dt>Source → goal</dt><dd>not-verified</dd></dl>
              {#if snapshotInfo.edited}<p>Редактор изменён после импорта. Хэш выше относится к исходному snapshot.</p>{/if}
              {#if snapshotInfo.compatibility==='incompatible'}<p role="alert">Версия snapshot {snapshotInfo.version} несовместима с локальным runner {snapshotInfo.localLean}. Автоматический запуск этого профиля отключён; нужен подходящий immutable profile или явная адаптация исходника.</p>
              {:else}<p>{snapshotInfo.compatibility==='unknown'?'Совместимость неизвестна: версия Lean не получена.':'Совпала только версия Lean.'} Зависимости, foundation и декларации Oncm.goal/Oncm.solution не проверялись. Импорт не выбирает proof profile автоматически.</p>
              {#if !config.publicMode}<button class="secondary" disabled={busy} onclick={()=>{profileId=config.proof.profileId;}}>Выбрать v3 для отдельной native-проверки</button>{/if}{/if}
              <p class="footnote">Импорт сохраняется локальным API как запись публичного источника с автором импорта. Публикация вашего изменённого Lean-пакета — отдельное явное действие.</p>
            </div>{/if}
            {#if !config.publicMode}<div class="button-row">
              <button class="secondary" disabled={busy || proofBusy || profileId !== config.proof.profileId} onclick={checkLean}
                >Проверить Lean</button
              >
            </div>
            {#if profileId !== config.proof.profileId}<p class="footnote">{profileId?'Выбран отдельный профиль '+profileId+'.':'Proof profile не выбран.'}
              Локальный runner настроен на v3; используйте явный выбор для native-проверки или импорт соответствующего внешнего сертификата выше.</p>{/if}
            <p class="footnote">
              Проверка Lean выполняется в фоне и не создаёт ZK-сертификат. Источник и результаты очереди видны только вашему кошельку;
              опубликованный on-chain сертификат публичен. Профиль проверяет цель Oncm.goal и
              доказательство Oncm.solution. Декларацию импортированного пакета нужно связать с ними
              в Lean source.
            </p>
            {/if}<p class="footnote">Сертификаты регистрации и исхода подготовьте вне сайта, затем загрузите и проверьте выше.
              Сайт не запускает и не заказывает их вычисление.</p>
            {#if !config.publicMode}<p class="footnote">Проверка Lean: до 5 с и 2 GiB. Одна задача за раз;
              до 4 задач на кошелёк и 16 всего, включая выполняемую.</p>{/if}
            <button class="text-button" onclick={() => go('create')}
              >Продолжить регистрацию ↗</button
            >{#if latestJob && !config.publicMode}<div class="job-result">
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
              <h2>Применить готовый сертификат исхода</h2>
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
                >Подтверждённый исход<select value={outcome} disabled={busy}
                  onchange={event => { clearProofCertificate(); outcome = event.currentTarget.value; }}
                  ><option value="1">P → True</option><option value="2">¬P → False</option></select
                ></label
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
                onclick={submitOutcomeProof}>Разрешить по сертификату ончейн ↗</button
              >
              {#if certificate && !proofReady}<p class="footnote">Journal сертификата должен точно совпадать с открытым утверждением, профилем и исходом. Проверка кодировки не заменяет криптографическую проверку EVM.</p>{/if}
            </article>
            {#if !config.publicMode}<article class="panel">
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
                  oninput={()=>snapshotImporter.invalidate()}
                  placeholder="https://github.com/owner/repository"
                /></label
              ><label
                >Точный commit<input bind:value={commit} oninput={()=>snapshotImporter.invalidate()} placeholder="40 hex characters" /></label
              ><label>Challenge path<input bind:value={challengePath} oninput={()=>snapshotImporter.invalidate()} /></label><button
                class="secondary"
                disabled={busy}
                onclick={importPackage}>Импортировать Lean source</button
              >
            </article>{/if}
          </div>
        </div>
        {#if !config.publicMode}<article class="panel">
          <h2>История задач</h2>
          {#if !jobs.length}<p>Здесь появятся проверки Lean. Ранее сохранённые задачи остаются в истории.</p>{/if}{#each jobs
            .slice()
            .reverse() as j}<button
              class="job-row"
              onclick={() => inspectJob(j.id)}
              ><span class="status">{j.status}</span><strong>{j.input.action}</strong><code
                >{short(j.id, 12)}</code
              ><small>{new Date(j.createdAt).toLocaleString()}</small></button
            >{/each}
        </article>{/if}
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
          {#if !config?.publicMode}<button class="secondary" disabled={busy} onclick={() => mine(1)}>+1 local block</button>
          <button class="secondary" disabled={busy} onclick={() => mine(10)}>+10 local blocks</button>{/if}</div>
        </section>
        {#key sdk}{#key account}<MonetaryPolicyPanel {sdk} {config} {account} {busy} onPrepared={reviewMonetaryPlan} onClaim={claimMonetary} onStake={stakeMonetary} onWithdraw={withdrawMonetary} onClose={closeMonetary} onSyncFees={syncMonetaryFees} />{/key}{/key}
        <div class="two-columns">
          <article class="panel">
            <h2>Предложить изменение</h2>
            <label
              >Действие<select bind:value={govAction} onchange={()=>monetaryReviewEpoch++}
                ><option value="profile">Добавить / выключить proof profile</option><option
                  value="operator">Добавить / выключить оператор</option
                ><option value="membership">Изменить membership</option><option value="treasury">Подготовленное действие казны</option><option value="monetary">Подготовленная денежная политика</option><option value="call"
                  >Произвольный protocol call</option
                ></select
              ></label
            >{#if govAction === 'monetary'}
              {#if monetaryDraft}<div class="callout"><strong>{monetaryDraft.review.method}</strong><p>Точный упорядоченный batch от Timelock {monetaryDraft.executor}. Блок review {monetaryDraft.blockNumber}; повторная проверка перед proposal.</p>{#if monetaryDraft.review.totalSupplyBefore}<p>Supply сейчас {formatEther(monetaryDraft.review.totalSupplyBefore)} T → после этого выпуска {formatEther(monetaryDraft.review.hypotheticalTotalSupplyAfter)} T при неизменной другой эмиссии. {#if monetaryDraft.review.budget!==undefined}Бюджет {formatEther(monetaryDraft.review.budget)} T поступает в RewardBudget.{:else}Получатель {monetaryDraft.review.recipient}, сумма {formatEther(monetaryDraft.review.amount)} T.{/if}</p>{/if}<p>{monetaryDraft.review.simulation}</p><pre>{JSON.stringify(monetaryDraft,null,2)}</pre></div>{:else}<p>Сначала подготовьте точную политику в панели выше.</p>{/if}
            {:else if govAction === 'treasury'}
              {#if treasuryDraft}<div class="callout"><strong>Казна: {treasuryDraft.method}</strong>
                <p>Caller при исполнении: Timelock {treasuryDraft.treasury}. Проверено на блоке {treasuryDraft.blockNumber}; перед созданием proposal проверка выполняется заново.</p>
                <pre>{JSON.stringify(treasuryDraft,null,2)}</pre></div>
              {:else}<p>Подготовьте согласие на уменьшение доли DAO или перевод в разделе «Доход».</p>{/if}
            {:else if govAction === 'operator'}<label
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
              >{/if}{#if !['call','treasury','monetary'].includes(govAction)}<label class="checkbox"
                ><input type="checkbox" bind:checked={enabled} />Активировать</label
              >{/if}<label
              >Обоснование<textarea bind:value={description} oninput={()=>monetaryReviewEpoch++} placeholder="Что изменится и почему"
              ></textarea></label
            ><button class="primary" disabled={busy || !description || !account || gov.account !== account || !gov.canPropose || (govAction==='treasury'&&!treasuryDraft) || (govAction==='monetary'&&!monetaryDraft)} onclick={proposeGov}
              >Создать proposal ↗</button
            ><button
              class="secondary"
              disabled={busy || govAction==='monetary'}
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
        {#key sdk}{#key account}<TreasuryPanel {sdk} {account} {config} {busy} statements={data.statements} onPrepared={reviewTreasuryPlan} onClaim={claimTreasury} onAllocationDraft={treasuryAllocationDraft} />{/key}{/key}
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
                <span title={r}>{r.toLowerCase()===config.addresses.Timelock.toLowerCase()?'DAO · Timelock '+short(r,12):short(r, 12)}</span><strong
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
                placeholder={(config?.accounts?.[0] || '0x…') + ' 60\n' + (config?.accounts?.[1] || '0x…') + ' 40'}
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
              onclick={() => tx(config.protocolVersion==='2'?'Сбор protocol + creator fees в Split':'Сбор creator fees', () => sdk.collect(poolAddress))}
              >{config.protocolVersion==='2'&&config.monetaryPolicy?.status==='deployed'?'Собрать protocol + creator fees → Split':'Собрать creator fees → Split'}</button
            >
            <div class="divider"></div>
            {#each Object.entries(claimables) as [t, b]}<div class="claim-row">
                <span>{t === config.addresses.TrueToken ? 'T' : short(t)} <b>{formatEther(b)}</b></span
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
                    ? (p.consents.some((c) => !c) ? 'Ожидает согласий' : 'Готово к применению')
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
                  >{:else if r.toLowerCase()===config.addresses.Timelock.toLowerCase()&&!p.applied&&p.baseEpoch===activeAllocation?.epoch}<button class="secondary" disabled={busy} onclick={()=>prepareTreasuryConsent(p,!p.consents[i])}>{p.consents[i]?'Подготовить отзыв DAO через Governor':'Подготовить согласие DAO через Governor'}</button>{/if}
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
          <span>Блоки {activity.from}–{activity.to}</span><code>{config?.rpcUrl || "Локальный RPC"}</code>
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
      {#if !config?.publicMode && (page === 'lab' || (page === 'detail' && statement?.kind === 0))}
        {#key account + ':' + (statement?.id || '') + ':' + sourceImportEpoch}
          <PackageEditor {api} {account} statement={statement?.kind === 0 ? statement : null}
            allowPublication={!config?.publicMode}
            client={sdk} chainId={config?.chainId} chainInstance={config?.chainInstance?.id}
            registry={config?.addresses.StatementRegistry} selectedProfileId={profileId || config?.proof.profileId}
            currentSource={source} onUseSource={(text, packageContext) => {
              snapshotImporter.invalidate();snapshotInfo=null;sourceImportEpoch++;
              clearProofCertificate(); registrationCertificate = ''; registrationImport = null;
              source = text; profileId = packageContext.profileId; fixtureId = ''; declaration = ''; go('lab');
            }} />
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
            profileEpoch++; profileView = null;
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
      <details><summary>История профиля в EAS ({profileView.history?.length || 0})</summary>
        {#each profileView.history || [] as h}<p class="footnote">Блок {h.blockNumber} · {h.uid}<br/>{h.displayName}<br/>{h.bio}<br/>{h.transactionHash}</p>{/each}
      </details>
      {#if profileView.uid}<p class="footnote">Текущий EAS UID: {profileView.uid}</p>{/if}
      <SocialPanel client={sdk?.social} {account} blogOwner={profileView.address} onProfile={openProfile}
        onReceipt={(r)=>{lastTx=r.hash;notice='Запись блога подтверждена в блоке '+r.blockNumber;}} />
      <p class="footnote">
        Полный текст имени, описания и истории профиля хранится в EAS. Имя и репутация относятся к обсуждениям. Адрес остаётся идентификатором; голоса за
        комментарии не влияют на settlement или Governor.
      </p>
    </section>
  </div>{/if}
