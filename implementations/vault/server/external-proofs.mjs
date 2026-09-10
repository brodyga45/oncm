import fs from 'node:fs';
import path from 'node:path';

// An explicit public allowlist. Private proof jobs and uploaded sources are not read.
export function externalProofCatalog(root, config) {
  const directory = path.join(root, 'external-proofs/perf05');
  const descriptor = JSON.parse(fs.readFileSync(path.join(directory, 'descriptor.json')));
  const stateFile = path.join(root, '.state/additional-profiles/perf05.json');
  const saved = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : null;
  const deployment = saved?.chainInstance === config.chainInstance.id
    && saved?.registry === config.addresses.StatementRegistry ? saved : null;
  const examples = ['true-registration', 'true-proof', 'false-registration', 'false-refutation'].flatMap(key => {
    const file = path.join(directory, key + '.json');
    return fs.existsSync(file) ? [{ key, record: JSON.parse(fs.readFileSync(file)) }] : [];
  });
  return [{ descriptor, deployment, examples }];
}
