#!/usr/bin/env python3
"""Tiny worker lifecycle checks. Never starts a prover or allocates >64 MiB."""
import json
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent
cases = [
    ('short-ipc-shutdown', "import subprocess,time; subprocess.Popen(['/usr/bin/python3','-c','import time; time.sleep(.3)']); time.sleep(.1)", 128, 3, 0, 'completed'),
    ('zombie-is-finished', "import os,time; p=os.fork(); (os._exit(0) if p==0 else time.sleep(.3))", 128, 3, 0, 'completed'),
    ('live-orphan-stopped', "import subprocess,time; subprocess.Popen(['/usr/bin/python3','-c','import time; time.sleep(20)']); time.sleep(.2)", 128, 3, 126, 'orphaned-descendants'),
    ('memory', "import time; x=bytearray(64*1024*1024); time.sleep(20)", 32, 3, 125, 'memory-limit'),
    ('timeout', "import time; time.sleep(20)", 128, .6, 124, 'timeout'),
]
results = []
with tempfile.TemporaryDirectory(prefix='oncm-guard-test-') as directory:
    for name, worker, memory, timeout, expected_code, expected_reason in cases:
        report = Path(directory) / (name + '.json')
        run = subprocess.run([sys.executable, str(root / 'resource-guard.py'),
            '--memory-mib', str(memory), '--timeout', str(timeout),
            '--report', str(report), '--', '/usr/bin/python3', '-c', worker],
            capture_output=True, text=True, timeout=6)
        data = json.loads(report.read_text())
        assert run.returncode == expected_code, (name, run.returncode, data)
        assert data['reason'] == expected_reason, (name, data)
        results.append({'test': name, **data})
    # Exercise the real nesting used by outer API guard -> runner -> inner guard.
    # Separate process groups and a short-lived IPC child must remain accounted.
    for iteration in range(3):
        report = Path(directory) / f'nested-{iteration}.json'
        inner = Path(directory) / f'nested-{iteration}-inner.json'
        command = [sys.executable, str(root / 'resource-guard.py')]
        run = subprocess.run(command + ['--memory-mib', '192', '--timeout', '3',
            '--report', str(report), '--'] + command + ['--memory-mib', '128', '--timeout', '2',
            '--report', str(inner), '--', '/usr/bin/python3', '-c', cases[0][1]],
            capture_output=True, text=True, timeout=6)
        data, inner_data = json.loads(report.read_text()), json.loads(inner.read_text())
        assert run.returncode == 0, (run.stderr, data)
        assert data['reason'] == inner_data['reason'] == 'completed', (data, inner_data)
        assert data['inventory'] == inner_data['inventory'] == 'darwin-libproc-in-process'
        assert not data['cleanupErrors'] and not inner_data['cleanupErrors']
        results.append({'test': f'nested-guard-{iteration}', **data, 'inner': inner_data})

    # Inject a memory-accounting failure only in this separate test process.
    # The real process inventory, child group, signals and cleanup still execute.
    # A live unaccountable worker must fail closed AND must actually be stopped.
    injected = '''
import ctypes,errno,importlib.util,os,sys
spec=importlib.util.spec_from_file_location('guard',sys.argv[1]); g=importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
original_usage=g.libproc.proc_pid_rusage
allowed_calls=int(sys.argv[4]); seen={}
def denied(pid,flavor,out):
    if pid != os.getpid():
        seen[pid]=seen.get(pid,0)+1
        if seen[pid]>allowed_calls:
            ctypes.set_errno(errno.EPERM); return -1
    return original_usage(pid,flavor,out)
g.libproc.proc_pid_rusage=denied
original_popen=g.subprocess.Popen
pid_file=sys.argv[2]
def capture(*a,**kw):
    p=original_popen(*a,**kw)
    with open(pid_file,'w') as f: f.write(str(p.pid))
    return p
g.subprocess.Popen=capture
sys.argv=['guard','--memory-mib','128','--timeout','2','--report',sys.argv[3],
          '--','/usr/bin/python3','-c','import time; time.sleep(20)']
sys.exit(g.main())
'''
    spec = importlib.util.spec_from_file_location('guard', root / 'resource-guard.py')
    guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)
    for allowed, name in [(0, 'unaccountable-live-worker-stopped'), (1, 'known-accounting-failure-cleanup')]:
        report, pid_file = Path(directory) / f'denied-{allowed}.json', Path(directory) / f'denied-{allowed}.pid'
        run = subprocess.run([sys.executable, '-c', injected, str(root / 'resource-guard.py'),
            str(pid_file), str(report), str(allowed)], capture_output=True, text=True, timeout=6)
        data = json.loads(report.read_text())
        assert run.returncode == 126 and data['reason'] == 'guard-error', (run.stderr, data)
        assert data['failure']['errno'] == 1
        assert data['failure']['pid'] == int(pid_file.read_text())
        assert data['failure']['uid'] == os.getuid() and data['failure']['name']
        assert guard.process_info(int(pid_file.read_text())) is None, data
        if allowed:
            assert not data['cleanupErrors'], data  # Cleanup identity is independent of denied footprint.
        results.append({'test': name, **data})

    report, pid_file = Path(directory) / 'orphan-denied.json', Path(directory) / 'orphan-denied.pid'
    orphan_injected = '''
import ctypes,errno,importlib.util,os,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('guard',sys.argv[1]); g=importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
pid_file=Path(sys.argv[2]); report=sys.argv[3]
original_usage=g.libproc.proc_pid_rusage
def denied(pid,flavor,out):
    metadata=g.process_info(pid)
    if pid_file.exists() and pid==int(pid_file.read_text()) and metadata and metadata['ppid']==1:
        ctypes.set_errno(errno.EPERM); return -1
    return original_usage(pid,flavor,out)
g.libproc.proc_pid_rusage=denied
leaf="import os,time; from pathlib import Path; Path("+repr(str(pid_file))+").write_text(str(os.getpid())); time.sleep(20)"
parent="import subprocess,time; subprocess.Popen(['/usr/bin/python3','-c',"+repr(leaf)+"],start_new_session=True); time.sleep(.35)"
sys.argv=['guard','--memory-mib','128','--timeout','2','--report',report,'--','/usr/bin/python3','-c',parent]
sys.exit(g.main())
'''
    run = subprocess.run([sys.executable, '-c', orphan_injected, str(root / 'resource-guard.py'),
        str(pid_file), str(report)], capture_output=True, text=True, timeout=6)
    data = json.loads(report.read_text())
    assert run.returncode == 126 and data['failure']['errno'] == 1, (run.stderr, data)
    assert data['failure']['ppid'] == 1 and data['failure']['pgid'] == data['failure']['pid'], data
    metadata = guard.process_info(int(pid_file.read_text()))
    assert metadata is None or metadata['status'] == 5, (metadata, data)
    assert not data['cleanupErrors'], data
    results.append({'test': 'reparented-session-footprint-denied-stopped', **data})

    # Force a completed leader before the first inventory, without reaping it.
    # Its unreaped original PID must still anchor the child's inherited group.
    report, pid_file = Path(directory) / 'fast-leader.json', Path(directory) / 'fast-leader.pid'
    fast_leader = '''
import importlib.util,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('guard',sys.argv[1]); g=importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
pid_file=Path(sys.argv[2]); report=sys.argv[3]
original_popen=g.subprocess.Popen
def delay_inventory(*a,**kw):
    p=original_popen(*a,**kw); time.sleep(.25); return p
g.subprocess.Popen=delay_inventory
leaf="import os,time; from pathlib import Path; Path("+repr(str(pid_file))+").write_text(str(os.getpid())); time.sleep(20)"
parent="import os,subprocess; subprocess.Popen(['/usr/bin/python3','-c',"+repr(leaf)+"]); os._exit(0)"
sys.argv=['guard','--memory-mib','128','--timeout','2','--report',report,'--','/usr/bin/python3','-c',parent]
sys.exit(g.main())
'''
    run = subprocess.run([sys.executable, '-c', fast_leader, str(root / 'resource-guard.py'),
        str(pid_file), str(report)], capture_output=True, text=True, timeout=6)
    data = json.loads(report.read_text())
    assert run.returncode == 126 and data['reason'] == 'orphaned-descendants', (run.stderr, data)
    metadata = guard.process_info(int(pid_file.read_text()))
    assert metadata is None or metadata['status'] == 5, (metadata, data)
    results.append({'test': 'unreaped-fast-leader-anchors-orphan-group', **data})
output = {'tests': results, 'allPassed': True,
          'scope': 'Synthetic lifecycle checks; no Lean or prover; allocation at most 64 MiB'}
(root / 'resource-guard-lifecycle-validation.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps(output))
