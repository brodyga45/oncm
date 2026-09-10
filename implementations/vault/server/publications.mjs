import crypto from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const file = (path, content) => ({ path, content, sha256: sha256(content) });
function source(value, label, required = false) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 250000 || (required && !value.trim()))
    throw Error(`${label}: ${required ? 'nonempty ' : ''}text up to 250 KB required`);
  return value;
}

// Only explicit request fields enter the package. No access to private jobs,
// imported-package database, filesystem paths, or automatic Lean execution.
export function preparePackage(input, context = {}) {
  const challenge = source(input.challengeSource, 'Challenge', true);
  const solution = source(input.solutionSource || '', 'Solution');
  if (/^\s*import\s+Challenge\b/m.test(solution))
    throw Error('Solution editor expects the body; import Challenge is added by the package');
  const description = source(input.description || '', 'Description');
  const leanVersion = context.descriptor?.lean || input.leanVersion;
  if (typeof leanVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/.test(leanVersion))
    throw Error('An exact Lean version is required');
  const runnerInput = {
    action: 'check',
    source: challenge + '\n\n' + solution,
    ...(context.statement ? {
      statementId: context.statement.id,
      goalHash: context.statement.goalHash,
      profileId: context.statement.profileId,
    } : { profileId: context.profileId || context.descriptor?.profileId }),
    outcome: input.outcome === 2 ? 2 : 1,
  };
  const defaultLake = 'import Lake\nopen Lake DSL\npackage vaultSubmission\nlean_lib Challenge\nlean_lib Solution\n';
  const files = [
    file('Challenge.lean', challenge),
    // Import exactly Challenge's environment. A default Challenge already
    // imports Init transitively; a prelude Challenge must not gain a second,
    // implicit Init with conflicting declarations (e.g. its pinned False).
    file('Solution.lean', 'prelude\nimport Challenge\n\n' + solution),
    file('Runner.lean', runnerInput.source),
    file('lean-toolchain', 'leanprover/lean4:v' + leanVersion + '\n'),
    file('lakefile.lean', source(input.lakefile || defaultLake, 'Lake configuration', true)),
    file('runner-input.json', json(runnerInput)),
    // JSON is valid YAML 1.2. This is a disclosure template, not a claim of
    // Palomar schema acceptance or external registry publication.
    file('formalization.yaml', json({
      title: context.statement?.title || input.title || 'Vault Lean submission',
      description,
      theorem_names: ['Oncm.goal'],
      challenge_path: 'Challenge.lean',
      solution_path: 'Solution.lean',
      disclosures: {
        source_origin: 'Explicitly supplied by the package author',
        verification: 'Not yet compared with the on-chain semantic commitment',
        external_registry: 'Not submitted to Palomar; review its current schema before submission',
      },
    })),
    file('oncm-context.json', json(context)),
    file('README.md', '# Vault Lean package\n\n'
      + 'Challenge.lean contains the supplied claim/environment; Solution.lean imports it and adds the supplied solution body. Runner.lean combines both for the ONCM runner. Files are not executed during export.\n\n'
      + 'Solution starts with prelude and imports only Challenge, so it inherits that module\'s exact imports instead of introducing implicit Init. An ordinary Challenge already imports Init; an explicit prelude Challenge may deliberately omit it. Use the exact lean-toolchain. Inspect lakefile.lean and any dependency lock before running `lake build Challenge Solution`; Lake configuration is executable author-provided code. The default Lake project has no external dependencies. If your imports require Mathlib or other libraries, include their pinned Lake configuration and lake-manifest.json before export; dependencies themselves are not vendored.\n\n'
      + 'From an independently trusted ONCM installation, submit runner-input.json to `node proof/runner.mjs` only when local resource policy permits. Compare the resulting goalHash/profileId with oncm-context.json. A file hash or successful Lean check is not an on-chain proof certificate. Source text is author-supplied metadata; the chain commitment identifies the checked elaborated goal/environment.\n\n'
      + 'formalization.yaml is a metadata/disclosure starting point. Export does not guarantee Palomar acceptance or publish anything there. A Challenge with sorry is not a solution; no axiom or missing proof is silently accepted.\n'),
  ];
  if (input.lakeManifest) {
    const lock = source(input.lakeManifest, 'Lake manifest');
    JSON.parse(lock);
    files.push(file('lake-manifest.json', lock));
  }
  return {
    format: 'oncm-vault-lean-package-v1',
    verification: 'author-supplied; source-to-goal comparison required',
    context, files,
    packageHash: sha256(json(files.map(({ path, sha256 }) => ({ path, sha256 })))),
  };
}

export function packageZip(pkg) {
  const files = Object.fromEntries(pkg.files.map((f) => [f.path, strToU8(f.content)]));
  files['package-manifest.json'] = strToU8(json({ ...pkg, files: pkg.files.map(({ content, ...f }) => f) }));
  return Buffer.from(zipSync(files, { level: 1 }));
}

export function publications(db, save = () => {}) {
  const records = () => db.records || [];
  function list(chain, statementId) {
    return records().filter((p) => p.chainInstance === chain && p.statementId === statementId);
  }
  function publish(actor, input, context) {
    if (input.publish !== true) throw Error('Explicit public publication consent is required');
    if (!context.statement || context.statement.author.toLowerCase() !== actor.toLowerCase())
      throw Error('Only the on-chain statement author may publish its challenge');
    if (Number(context.statement.kind) !== 0) throw Error('Lean source belongs to a base statement');
    const pkg = preparePackage(input, context);
    const existing = list(context.chainInstance, context.statement.id);
    const same = existing.find((p) => p.packageHash === pkg.packageHash);
    if (same) return same;
    if (existing.length >= 32) throw Error('Publication revision limit reached');
    const record = {
      id: crypto.randomUUID(),
      chainInstance: context.chainInstance,
      statementId: context.statement.id,
      author: actor,
      revision: existing.length + 1,
      publishedAt: new Date().toISOString(),
      ...pkg,
    };
    db.records ??= [];
    db.records.push(record);
    save();
    return record;
  }
  return { list, publish };
}
