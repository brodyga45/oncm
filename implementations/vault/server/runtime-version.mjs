import fs from 'node:fs';
import path from 'node:path';

export function runtimeFiles(root, selected = 'legacy') {
  if (!['legacy', '2'].includes(selected)) throw Error('VAULT_PROTOCOL_VERSION must be legacy or 2');
  const suffix = selected === '2' ? '-v2' : '';
  const file = name => path.join(root, '.state', name + suffix + '.json');
  return { version: selected, deployment: file('deployment'), abis: file('abis'),
    social: file('social-deployment'), community: file('community'), publications: file('publications') };
}

export function readRuntimeDeployment(files) {
  if (!fs.existsSync(files.deployment)) {
    throw Error(`Missing ${path.basename(files.deployment)}; deploy the selected protocol version explicitly. Existing deployments are not replaced.`);
  }
  const config = JSON.parse(fs.readFileSync(files.deployment, 'utf8'));
  if ((config.protocolVersion ?? 'legacy') !== files.version) throw Error('Protocol version does not match the selected deployment');
  if (config.chainId !== 31373 || !config.chainInstance?.id) throw Error('Invalid Vault chain identity');
  for (const key of ['StatementRegistry', 'TrueToken', 'PoolCoordinator', 'Vault']) {
    if (!/^0x[0-9a-f]{40}$/i.test(config.addresses?.[key] ?? '')) throw Error('Missing deployment identity: ' + key);
  }
  if (files.version === '2' && (!config.monetaryPolicy || config.monetaryPolicy.version !== 'vault-monetary-v1'
      || config.monetaryPolicy.status !== 'deployed')) throw Error('V2 deployment lacks deployed monetary policy metadata');
  return config;
}

// A common chain and Governor do not identify a protocol graph: legacy and V2
// deliberately coexist with different collateral, registries and pools.
export function assertSameRuntime(actual, expected) {
  if (actual.chainId !== expected.chainId || actual.chainInstance?.id !== expected.chainInstance?.id
      || actual.rpcUrl !== expected.rpcUrl || (actual.protocolVersion ?? 'legacy') !== (expected.protocolVersion ?? 'legacy')) {
    throw Error('Running API belongs to another protocol deployment');
  }
  for (const key of ['StatementRegistry', 'TrueToken', 'PoolCoordinator', 'Vault']) {
    if (!actual.addresses?.[key] || actual.addresses[key].toLowerCase() !== expected.addresses[key]?.toLowerCase()) {
      throw Error('Running API belongs to another protocol deployment: ' + key);
    }
  }
}
