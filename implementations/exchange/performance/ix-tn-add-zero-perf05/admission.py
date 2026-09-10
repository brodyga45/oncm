"""One-shot, guarded Lean/export/native/executor admission; never proves."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
PERF = HERE.parent / 'perf05'
LEAN = Path('/private/tmp/oncm-toolchains/lean-4.33.1-darwin_aarch64/bin/lean')
EXPORTER = ROOT / 'implementations/exchange/proof/exporter/.lake/build/bin/lean4export'
HOST = ROOT / 'implementations/exchange/proof/bin/oncm-proof-host'
R0VM = Path('/private/tmp/oncm-toolchains/cargo/bin/r0vm')
PROFILE = '93cf174539debc6ddce2691f3def1e36023cf77fe1d93f1692f330150bd37e10'
sha = lambda b: hashlib.sha256(b).hexdigest()

def run(label, command, seconds, isolated=False):
    report = HERE / (label + '-resources.json')
    if report.exists():
        raise RuntimeError('Refusing to repeat a recorded admission phase: ' + label)
    if isolated:
        roots = [HERE, LEAN.parent.parent, EXPORTER.parent, Path('/System'),
                 Path('/usr/lib'), Path('/usr/bin'), Path('/bin'),
                 Path('/Library/Apple'), Path('/private/var/db/dyld')]
        sandbox = '(version 1) (deny default)\n' \
            '(allow process-exec) (allow process-fork) (allow sysctl-read)\n' \
            '(allow file-read-metadata)\n(allow file-read* ' + ' '.join(
                '(subpath ' + json.dumps(str(p)) + ')' for p in roots) + \
            ' (literal "/") (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom"))\n' \
            '(allow file-write* (subpath ' + json.dumps(str(HERE)) + ') (literal "/dev/null"))\n' \
            '(allow mach-lookup (global-name "com.apple.system.logger") (global-name "com.apple.logd") (global-name "com.apple.notifyd"))'
        command = ['/usr/bin/sandbox-exec', '-p', sandbox, *map(str, command)]
    command = ['/usr/bin/python3', str(ROOT / 'tools/lean-zk/resource-guard.py'),
               '--memory-mib', '512', '--timeout', str(seconds),
               '--report', str(report), '--lock-file',
               '/private/tmp/oncm-worker-' + str(os.getuid()) + '.lock', '--', *map(str, command)]
    (HERE / (label + '-command.json')).write_text(json.dumps(command, indent=2) + '\n')
    env = dict(os.environ, PATH=str(LEAN.parent) + ':/usr/bin:/bin',
               LEAN_PATH=str(HERE), LEAN_NUM_THREADS='2', RAYON_NUM_THREADS='2',
               GOMAXPROCS='2', RISC0_DEV_MODE='', RISC0_PROVER='ipc',
               RISC0_SERVER_PATH=str(R0VM), RISC0_HOME='/private/tmp/oncm-toolchains/risc0',
               RUSTUP_HOME='/private/tmp/oncm-toolchains/rustup',
               CARGO_HOME='/private/tmp/oncm-toolchains/cargo', RUSTUP_AUTO_INSTALL='0')
    with (HERE / (label + '-stdout.txt')).open('wb') as out, \
            (HERE / (label + '-stderr.txt')).open('wb') as err:
        completed = subprocess.run(command, cwd=HERE, env=env, stdout=out, stderr=err)
    print(label, completed.returncode, flush=True)
    completed.check_returncode()
    return (HERE / (label + '-stdout.txt')).read_bytes()

def main():
    pins = {
        EXPORTER: 'ddd765975ec6bf53de8e511958218de2f38927ff594cf83c3253971296c7144e',
        PERF / 'bin/check-native': '7f58bc86e80174f519987808d571f6f8380f8b33b6d50d3b23a16e25e51c7fc8',
        PERF / 'lean-checker.bin': '0f57d516124e0fe3e36ed3a0957e3321536d872f55826bc555319c1af3a4f208',
        HOST: 'eb7724c93851f886c32fa41d280e044e153458b26e23107bcbd29d1cdda10dba',
    }
    for path, expected in pins.items():
        assert sha(path.read_bytes()) == expected, str(path)
    run('lean', [LEAN, '-j', '2', '-o', HERE / 'OncmInput.olean', HERE / 'OncmInput.lean'], 5, True)
    exported = run('export', [EXPORTER, 'OncmInput', '--', 'False', 'Oncm.goal', 'Oncm.solution'], 5, True)
    foundation = (PERF / 'lean/foundation.ndjson').read_bytes()
    assert sha(foundation) == '94661738a0c260b50a6dc27a09015793d2c0205919f97448a1a4937d13d12124'
    assert exported.startswith(foundation), 'Exact existing perf05 foundation mismatch'
    (HERE / 'proof.ndjson').write_bytes(exported)
    # This locates a prefix only. The existing checker validates every record.
    names = {0: ()}
    offset = 0
    boundary = None
    declars = []
    for raw in exported.splitlines(keepends=True):
        assert raw.endswith(b'\n')
        row = json.loads(raw)
        offset += len(raw)
        if 'in' in row:
            assert row['in'] not in names
            part = row.get('str', row.get('num'))
            names[row['in']] = (*names[part['pre']], part.get('str', part.get('i')))
        for kind in ('axiom', 'def', 'thm', 'opaque'):
            if kind in row:
                name = names[row[kind]['name']]
                declars.append({'kind': kind, 'name': '.'.join(map(str, name))})
                assert kind != 'axiom', 'Zero-axiom policy'
                if kind == 'def' and name == ('Oncm', 'goal'):
                    assert boundary is None
                    boundary = offset
        if 'inductive' in row:
            for family in ('types', 'ctors', 'recs'):
                for decl in row['inductive'].get(family, []):
                    declars.append({'kind': family, 'name': '.'.join(map(str, names[decl['name']]))})
    assert boundary is not None
    goal = exported[:boundary]
    (HERE / 'goal.ndjson').write_bytes(goal)
    journal = sha(b'ONCM_LEAN_CLAIM_V1') + sha(goal) + PROFILE + '0' * 63 + '1'
    native = run('native', [PERF / 'bin/check-native', HERE / 'proof.ndjson', str(boundary), '1'], 5)
    assert native.decode().strip() == journal
    result = {'profileId': '0x' + PROFILE,
              'imageId': '0x296fb3bbf5eb7df9fb7115826df31c71411ee0f8153970c7618c76ab01539feb',
              'goalHash': '0x' + sha(goal), 'goalBytes': len(goal), 'proofBytes': len(exported),
              'proofSha256': sha(exported), 'sourceSha256': sha((HERE / 'OncmInput.lean').read_bytes()),
              'foundationSha256': sha(foundation), 'axiomCount': 0, 'declarations': declars,
              'journal': '0x' + journal, 'outcome': 1, 'nativeChecked': True,
              'certificateGenerated': False}
    (HERE / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    executed = run('executor', [HOST, 'execute', PERF / 'lean-checker.bin', HERE / 'proof.ndjson', str(boundary), '1'], 10)
    session = json.loads(executed.decode().strip().splitlines()[-1])
    assert session['journal'] == journal
    result.update(executorChecked=True, segments=session['segments'])
    (HERE / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ('goalHash', 'goalBytes', 'proofBytes', 'segments', 'certificateGenerated')}))

if __name__ == '__main__':
    main()
