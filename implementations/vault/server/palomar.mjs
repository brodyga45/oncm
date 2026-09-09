import crypto from 'node:crypto';
const BASE = 'https://data.palomar-registry.org';
async function fetchJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!r.ok) throw Error('Published registry HTTP ' + r.status);
  return r.json();
}
export async function palomarRecent() {
  return fetchJSON(BASE + '/recent.json');
}
export async function palomarSnapshot(id, version) {
  if (
    !/^PALOMAR-\d{4}-\d{2}-\d{2}-\d{6}$/.test(id) ||
    !Number.isSafeInteger(version) ||
    version < 1
  )
    throw Error('Exact Palomar ID/version required');
  const record = await fetchJSON(BASE + '/entries/' + id + '-v' + version + '.json');
  const src = record.source,
    f = record.formalization;
  if (!src || !f || !f.challenge_path) throw Error('Incomplete Palomar record');
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(src.repository) ||
    !/^([a-f0-9]{40}|[a-f0-9]{64})$/i.test(src.commit)
  )
    throw Error('Registry source must pin an exact GitHub commit');
  const base = src.project_path ? src.project_path.replace(/\/$/, '') + '/' : '';
  const paths = [
    f.challenge_path,
    f.solution_path,
    f.formalization_metadata_path,
    f.comparator_config_path,
    f.lakefile_path,
    'lean-toolchain',
    'lake-manifest.json',
  ].filter(Boolean);
  const files = [];
  for (const file of [...new Set(paths)]) {
    const path = base + file;
    if (
      path.startsWith('/') ||
      path.split('/').some((x) => !x || x === '.' || x === '..') ||
      /[?#%\\]/.test(path)
    )
      throw Error('Unsafe snapshot path');
    const url =
      'https://raw.githubusercontent.com/' +
      src.repository +
      '/' +
      src.commit +
      '/' +
      path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (response.status === 404 && file === 'lake-manifest.json') continue;
    if (!response.ok) throw Error(path + ' HTTP ' + response.status);
    const content = await response.text();
    if (content.length > 1000000) throw Error('Imported file exceeds 1 MB');
    files.push({
      path,
      sourceUrl: url,
      content,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
    });
  }
  const challenge = files.find((x) => x.path === base + f.challenge_path);
  return {
    id: crypto.randomUUID(),
    title: record.title,
    description: record.abstract,
    source: challenge.content,
    repository: 'https://github.com/' + src.repository,
    commit: src.commit,
    challengePath: base + f.challenge_path,
    targetDeclaration: f.theorem_names?.[0] || '',
    files,
    externalRef: { registry: 'Palomar', id, version },
    registryRecord: record,
    verification:
      'Imported publication, not settlement evidence. Our immutable Lean/zk profile must accept the goal separately.',
    importedAt: new Date().toISOString(),
  };
}
