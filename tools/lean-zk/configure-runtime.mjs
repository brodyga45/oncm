#!/usr/bin/env node
// Read-only by default. Configuration and reports are written only to NEW paths.
// This script never installs tools, rebuilds code, launches Lean jobs or proves.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const HELP = `ONCM macOS ARM proof runtime configuration

node configure-runtime.mjs [options]

Default: validate existing runtime.local.json without changing any file.
  --runtime-dir PATH     Runtime bundle to validate (default: this directory)
  --config PATH          Read an existing configuration instead of runtime.local.json
  --prefix PATH          Isolated toolchain prefix (cargo/, rustup/, risc0/, Lean archive)
  --exporter-dir PATH    Checkout containing .lake/build/bin/lean4export
  --risc0-source PATH    Pinned RISC Zero checkout with built groth16_proof/
  --output PATH          Save validated config to a NEW file; never overwrite
  --report PATH          Save check report to a NEW file; never overwrite
  --print-config         Print validated JSON to stdout; checks go to stderr
  --verify-key           Also SHA-256 the 2.4 GiB compressed ceremony archive
  --ceremony-archive P   Override archive path for --verify-key
  --strict-provenance    Require source checkouts and exact commits
  --help                Show this help

No downloads, installations, builds, prover jobs, chain calls or server restarts.
Successful validation establishes configuration consistency, not a completed proof.
See SETUP.md for the staged source-build recipe and verification boundaries.
`;
const valueOptions = new Set(['runtime-dir', 'config', 'prefix', 'exporter-dir',
  'risc0-source', 'output', 'report', 'ceremony-archive']);
const flagOptions = new Set(['help', 'print-config', 'verify-key', 'strict-provenance']);
const options = {};
try {
  for (let i = 2; i < process.argv.length; i++) {
    const name = process.argv[i].replace(/^--/, '');
    if (!process.argv[i].startsWith('--') || (!valueOptions.has(name) && !flagOptions.has(name)))
      throw Error(`Unknown option: ${process.argv[i]}`);
    if (Object.hasOwn(options, name)) throw Error(`Repeated option: --${name}`);
    if (valueOptions.has(name)) {
      const value = process.argv[++i];
      if (!value || value.startsWith('--')) throw Error(`Missing value for --${name}`);
      options[name] = path.resolve(value);
    } else options[name] = true;
  }
  if (options.help) { process.stdout.write(HELP); process.exit(0); }
  await main();
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exitCode = 2;
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const part of fs.createReadStream(file)) hash.update(part);
  return hash.digest('hex');
}
async function main() {
  const root = options['runtime-dir'] || here;
  const pins = JSON.parse(await fsp.readFile(path.join(here, 'setup-pins.json'), 'utf8'));
  const configPath = options.config || path.join(root, 'runtime.local.json');
  let config;
  if (fs.existsSync(configPath)) config = JSON.parse(await fsp.readFile(configPath, 'utf8'));
  else {
    if (options.config || !options.prefix || !options['exporter-dir'] || !options['risc0-source'])
      throw Error('Provide an existing --config or all of --prefix, --exporter-dir and --risc0-source');
    config = { env: {}, groth16: {} };
  }
  if (options.prefix) {
    const prefix = options.prefix;
    config.lean = path.join(prefix, `lean-${pins.lean.version}-darwin_aarch64/bin/lean`);
    config.r0vm = path.join(prefix, 'cargo/bin/r0vm');
    config.env = { ...config.env, CARGO_HOME: path.join(prefix, 'cargo'),
      RUSTUP_HOME: path.join(prefix, 'rustup'), RISC0_HOME: path.join(prefix, 'risc0') };
    config.groth16 = { ...config.groth16, provingKey: path.join(prefix, 'stark_verify_final.pk.dmp') };
  }
  if (options['exporter-dir']) config.exporter = path.join(options['exporter-dir'], '.lake/build/bin/lean4export');
  if (options['risc0-source']) {
    const source = path.join(options['risc0-source'], 'groth16_proof');
    config.groth16 = { ...config.groth16,
      witness: path.join(source, 'groth16/stark_verify_cpp/stark_verify'),
      prover: path.join(source, 'circom-compat/prover'),
      workingDirectory: path.join(source, 'groth16/stark_verify_cpp'),
      constraintSystem: path.join(source, 'groth16/stark_verify.cs') };
  }
  for (const out of [options.output, options.report].filter(Boolean)) {
    if (fs.existsSync(out)) throw Error(`Refusing to overwrite existing file: ${out}`);
    if (!fs.existsSync(path.dirname(out))) throw Error(`Output parent does not exist: ${path.dirname(out)}`);
  }
  if (options.output && options.output === options.report) throw Error('Config and report paths must differ');
  const checks = [];
  function record(name, ok, detail, warn = false) {
    const status = ok ? 'PASS' : warn ? 'WARN' : 'FAIL';
    checks.push({ name, status, detail });
    console.error(`${status} ${name}: ${detail}`);
    return ok;
  }
  record('platform', process.platform === 'darwin' && process.arch === 'arm64', `${process.platform}/${process.arch}`);
  record('Node', Number(process.versions.node.split('.')[0]) >= 22, process.versions.node);
  for (const [name, value] of Object.entries({ lean: config.lean, exporter: config.exporter,
    r0vm: config.r0vm, ...config.env, ...config.groth16 })) {
    record(`absolute path ${name}`, typeof value === 'string' && path.isAbsolute(value), String(value));
  }
  if (!config.groth16) throw Error('This configure script targets the native macOS ARM Groth16 layout');
  async function existing(name, file, executable = false, directory = false) {
    try {
      const st = await fsp.stat(file);
      if (directory ? !st.isDirectory() : !st.isFile() || !st.size) throw Error('Wrong type or empty file');
      if (executable) await fsp.access(file, fs.constants.X_OK);
      return record(name, true, directory ? file : `${file} (${st.size} bytes)`);
    } catch (error) { return record(name, false, `${file}: ${error.message}`); }
  }
  const binaries = { Lean: config.lean, lean4export: config.exporter, r0vm: config.r0vm,
    nativeChecker: path.join(root, 'bin/check-native'), host: path.join(root, 'bin/oncm-proof-host'),
    witness: config.groth16.witness, gnarkProver: config.groth16.prover,
    adapter: path.join(root, 'native-adapter/docker'), sandbox: '/usr/bin/sandbox-exec' };
  const available = {};
  for (const [name, file] of Object.entries(binaries)) available[name] = await existing(name, file, true);
  for (const [name, file] of Object.entries({ constraintSystem: config.groth16.constraintSystem,
    provingKey: config.groth16.provingKey,
    witnessData: path.join(config.groth16.workingDirectory || '', 'stark_verify.dat'),
    program: path.join(root, 'lean-checker.bin'), foundation: path.join(root, 'lean/foundation.ndjson') }))
    await existing(name, file);
  for (const name of ['CARGO_HOME', 'RUSTUP_HOME', 'RISC0_HOME'])
    await existing(name, config.env?.[name], false, true);
  const env = { ...process.env, ...config.env, RISC0_DEV_MODE: '' };
  function version(name, file, args, expected) {
    const r = spawnSync(file, args, { env, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
    const output = `${r.stdout || ''}${r.stderr || ''}`.trim();
    record(name, r.status === 0 && expected.test(output), output || r.error?.message || `exit ${r.status}`);
  }
  if (available.Lean) version('Lean version', config.lean, ['--version'], /version 4\.33\.1[,)]/);
  if (available.r0vm) version('r0vm version', config.r0vm, ['--version'], /risc0-r0vm 3\.0\.6\b/);
  if (config.env?.CARGO_HOME && config.env?.RUSTUP_HOME) {
    const rustc = path.join(config.env.CARGO_HOME, 'bin/rustc');
    const toolchains = path.join(config.env.RUSTUP_HOME, 'toolchains');
    // Require existing toolchains before invoking a rustup proxy: no implicit install.
    const installed = fs.existsSync(toolchains) ? fs.readdirSync(toolchains) : [];
    const hostToolchain = installed.find(x => /^(1\.98\.1|stable)-aarch64-apple-darwin$/.test(x));
    if (record('host Rust installed', Boolean(hostToolchain), installed.join(', ')))
      version('host rustc', rustc, ['+' + hostToolchain, '--version'], /rustc 1\.98\.1\b/);
    if (record('risc0 Rust installed', installed.includes('risc0'), 'rustup toolchain link risc0'))
      version('guest rustc', rustc, ['+risc0', '--version'], /rustc 1\.97\.0(?:-dev)?\b/);
  }
  const manifest = JSON.parse(await fsp.readFile(path.join(root, 'manifest.json'), 'utf8'));
  for (const [name, file, expected] of [
    ['packed guest SHA-256', path.join(root, 'lean-checker.bin'), manifest.binarySha256],
    ['foundation SHA-256', path.join(root, 'lean/foundation.ndjson'), manifest.foundationSha256],
  ]) {
    if (fs.existsSync(file)) {
      const actual = await sha256(file);
      record(name, actual === String(expected).replace(/^0x/, ''), actual);
    }
  }
  record('profile/exporter version', manifest.lean === pins.lean.version && manifest.exporterCommit === pins.exporter.commit,
    `${manifest.lean} / ${manifest.exporterCommit}`);
  for (const lock of ['Cargo.lock', 'guest/Cargo.lock']) {
    const text = await fsp.readFile(path.join(root, lock), 'utf8');
    const block = text.split('[[package]]').find(x => /\nname = "risc0-zkvm"\n/.test(x));
    record(`${lock} risc0-zkvm`, Boolean(block && /\nversion = "3\.0\.6"\n/.test(block)), 'expected 3.0.6; preserve all transitive lockfile entries');
  }
  // The bundled exporter is a pinned upstream source subset plus an explicit
  // allocation-only patch, not a fabricated Git checkout. Verify the bundle and
  // selected executable against setup pins before accepting archived provenance.
  let bundledExporterVerified = false;
  if (pins.exporter.bundledProvenance) {
    try {
      const provenancePath = path.join(root, pins.exporter.bundledProvenance);
      const provenanceDigest = await sha256(provenancePath);
      if (provenanceDigest !== pins.exporter.provenanceSha256) throw Error('Exporter provenance pin mismatch');
      const bundle = JSON.parse(await fsp.readFile(provenancePath, 'utf8'));
      const bundleDir = path.dirname(provenancePath);
      if (bundle.upstreamCommit !== pins.exporter.commit || bundle.binarySha256 !== pins.exporter.binarySha256)
        throw Error('Exporter source/binary pins disagree');
      for (const [relative, expected] of Object.entries(bundle.bundleSha256)) {
        const file = path.resolve(bundleDir, relative);
        if (!file.startsWith(bundleDir + path.sep) || await sha256(file) !== expected)
          throw Error(`Exporter source/recipe mismatch: ${relative}`);
      }
      if (await sha256(config.exporter) !== pins.exporter.binarySha256) throw Error('Configured exporter binary hash mismatch');
      bundledExporterVerified = record('lean4export patched source and binary', true,
        `${bundle.upstreamCommit} + ${pins.exporter.patch}; SHA-256 ${bundle.binarySha256}`);
    } catch (error) { record('lean4export patched source and binary', false, error.message); }
  }
  const exporterSource = options['exporter-dir'] || path.resolve(path.dirname(config.exporter), '../../..');
  const risc0Source = options['risc0-source'] || path.resolve(config.groth16.workingDirectory, '../../..');
  for (const [name, dir, commit] of [['lean4export', exporterSource, pins.exporter.commit], ['RISC Zero', risc0Source, pins.risc0.commit]]) {
    if (name === 'lean4export' && bundledExporterVerified) continue;
    if (!fs.existsSync(path.join(dir, '.git'))) {
      record(`${name} source provenance`, false, `No .git checkout at ${dir}; archived source needs independent provenance`, !options['strict-provenance']);
      continue;
    }
    const r = spawnSync('/usr/bin/git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 10000 });
    record(`${name} source commit`, r.status === 0 && r.stdout.trim() === commit, r.stdout?.trim() || 'git failed');
  }
  const prefix = options.prefix || path.dirname(config.env.CARGO_HOME);
  const archive = options['ceremony-archive'] || path.join(prefix, 'stark_verify_final.zkey.gz');
  if (options['verify-key']) {
    if (await existing('ceremony archive', archive)) {
      const digest = await sha256(archive);
      record('ceremony archive SHA-256', digest === pins.groth16.ceremonySha256, digest);
    }
  } else record('ceremony archive SHA-256', false, 'Not read in the quick check; use --verify-key for the large-file checksum', true);
  const report = { format: 'oncm-runtime-configuration-check-v1', checkedAt: new Date().toISOString(),
    runtimeDirectory: root, profileId: manifest.profileId, imageId: manifest.imageId,
    result: checks.some(c => c.status === 'FAIL') ? 'failed' : 'configuration-consistent',
    proofGenerated: false, cleanMachineInstallationVerified: false, checks };
  if (options.report) await fsp.writeFile(options.report, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (report.result === 'failed') { process.exitCode = 1; return; }
  if (options.output) {
    await fsp.writeFile(options.output, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.error(`WROTE new configuration: ${options.output}`);
  }
  if (options['print-config']) process.stdout.write(JSON.stringify(config, null, 2) + '\n');
  console.error('Configuration consistent. This check did not execute Lean source or generate/verify a proof receipt.');
}
