#!/usr/bin/env python3
"""Tiny worker lifecycle checks. Never starts a prover or allocates >64 MiB."""
import json
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
output = {'tests': results, 'allPassed': True,
          'scope': 'Synthetic lifecycle checks; no Lean or prover; allocation at most 64 MiB'}
(root / 'resource-guard-lifecycle-validation.json').write_text(json.dumps(output, indent=2) + '\n')
print(json.dumps(output))
