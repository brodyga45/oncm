#!/usr/bin/env python3
"""Offline five-step build of bundled pinned exporter; invoke under resource-guard."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
args = argparse.ArgumentParser()
args.add_argument('--lean-root', required=True, type=Path)
args.add_argument('--output', required=True, type=Path)
options = args.parse_args()
lean = options.lean_root.resolve()
work = options.output.resolve()
assert not work.exists(), 'Output must be a new directory; installed binaries are never overwritten'
pins = json.loads((HERE / 'pins.json').read_text())
def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()
for relative, expected in pins['bundleSha256'].items():
    assert digest(HERE / relative) == expected, 'Bundled source/recipe drift: ' + relative
version = subprocess.run([str(lean / 'bin/lean'), '--version'], check=True, text=True, capture_output=True).stdout
assert 'version 4.33.1' in version and pins['leanCommit'] in version, 'Wrong Lean toolchain'
work.mkdir()
for relative in ['.lake/build/lib/lean', '.lake/build/ir', '.lake/build/bin']:
    (work / relative).mkdir(parents=True, exist_ok=True)
for module in ['Export', 'Main']:
    source = (HERE / 'upstream' / (module + '.lean')).read_text()
    if module == 'Export':
        before = 'visitedExprs : HashMap Expr Nat := HashMap.emptyWithCapacity 10000000'
        assert source.count(before) == 1
        source = source.replace(before, 'visitedExprs : HashMap Expr Nat := {}')
        assert hashlib.sha256(source.encode()).hexdigest() == pins['patchedExportSha256']
    (work / (module + '.lean')).write_text(source)
    setup = {'plugins': [], 'package': 'lean4export', 'options': {}, 'name': module, 'isModule': False, 'importArts': {}, 'dynlibs': []}
    if module == 'Main':
        setup['importArts'] = {'Export': [[str(work / '.lake/build/lib/lean/Export.olean')]]}
    (work / ('.lake/build/ir/' + module + '.setup.json')).write_text(json.dumps(setup))
replace = lambda text: text.replace('{work}', str(work)).replace('{toolchain}', str(lean))
(work / '.lake/build/bin/lean4export.rsp').write_text(replace((HERE / 'link.rsp.template').read_text()))
commands = [[replace(arg) for arg in row] for row in json.loads((HERE / 'commands.template.json').read_text())]
env = {**os.environ, 'PATH': str(lean / 'bin') + ':/usr/bin:/bin', 'LEAN_PATH': str(work / '.lake/build/lib/lean'), 'LEAN_NUM_THREADS': '1', 'MACOSX_DEPLOYMENT_TARGET': '99.0'}
for command in commands:
    print(json.dumps(command), flush=True)
    subprocess.run(command, cwd=work, env=env, check=True)
binary = work / '.lake/build/bin/lean4export'
result = {'sourcePin': pins['upstreamCommit'], 'patchSha256': pins['bundleSha256']['std-default-capacity.patch'], 'binary': str(binary), 'binarySha256': digest(binary), 'leanVersion': version.strip(), 'sequentialSteps': len(commands)}
(work / 'build-result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
