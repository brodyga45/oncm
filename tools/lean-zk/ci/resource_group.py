"""Linux cgroup-v2 resources for CI only; no proof/runtime implementation."""
import json
from pathlib import Path
import re
import subprocess
import time

from receipt import require

GIB = 1024 ** 3


def slice_name(case_name):
    require(re.fullmatch(r'oncm-ci-[A-Za-z0-9-]+', case_name), 'Invalid CI case name')
    # No hyphens: a single top-level slice, not an implicit chain of parent slices.
    return 'oncmci' + case_name.removeprefix('oncm-ci-').replace('-', '') + '.slice'


def check_kernel_limits(group):
    require((group / 'memory.max').read_text().strip() == str(13 * GIB), 'Shared memory.max must be 13 GiB')
    require((group / 'memory.swap.max').read_text().strip() == '0', 'Shared swap must be disabled')
    quota, period = (group / 'cpu.max').read_text().split()
    require(quota != 'max' and int(quota) == 4 * int(period), 'Shared CPU quota must be 4 CPUs')
    require((group / 'memory.peak').is_file() and (group / 'memory.events').is_file(),
            'Require kernel cgroup peak and event counters')


def create_slice(directory, case_name):
    name = slice_name(case_name)
    (directory / 'slice.txt').write_text(name)
    spec = ('[Unit]\nDescription=ONCM isolated CI proof budget\n'
            '[Slice]\nMemoryAccounting=yes\nMemoryMax=13G\nMemorySwapMax=0\n'
            'CPUAccounting=yes\nCPUQuota=400%\nTasksAccounting=yes\nTasksMax=256\n')
    (directory / 'slice-unit.txt').write_text(spec)
    destination = '/run/systemd/system/' + name
    subprocess.run(['sudo', 'tee', destination], input=spec, text=True, check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['sudo', 'systemctl', 'daemon-reload'], check=True)
    subprocess.run(['sudo', 'systemctl', 'start', name], check=True)
    control = subprocess.check_output(['systemctl', 'show', name, '--property=ControlGroup', '--value'], text=True).strip()
    require(control == '/' + name, 'Shared slice has unexpected cgroup location')
    group = Path('/sys/fs/cgroup') / name
    check_kernel_limits(group)
    return name, group


def cleanup_command(command, errors):
    try:
        result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, timeout=15)
        if result.returncode:
            errors.append({'command': command, 'returnCode': result.returncode,
                           'stderr': result.stderr[-2048:] if result.stderr else ''})
    except (subprocess.TimeoutExpired, OSError) as error:
        errors.append({'command': command, 'error': str(error)})


def cleanup_slice(directory, errors):
    marker = directory / 'slice.txt'
    if not marker.exists():
        return
    name = marker.read_text().strip()
    require(re.fullmatch(r'oncmci[A-Za-z0-9]+\.slice', name), 'Refusing unrelated slice cleanup')
    cleanup_command(['sudo', 'systemctl', 'stop', name], errors)
    cleanup_command(['sudo', 'rm', '-f', '--', '/run/systemd/system/' + name], errors)
    cleanup_command(['sudo', 'systemctl', 'daemon-reload'], errors)


class Observer:
    """Lives in caller's cgroup, outside the bounded host+Docker slice.

    Parent memory.events/peak survive disappearing child scopes. Samples are
    diagnostic only; kernel memory.max enforces the bound independently.
    """
    def __init__(self, group, directory, proc_cgroup=None):
        self.group, self.directory = group, directory
        self.proc_cgroup = Path('/proc/self/cgroup').read_text() if proc_cgroup is None else proc_cgroup
        require(all('/' + group.name not in line.split(':', 2)[-1].splitlines()[0]
                    for line in self.proc_cgroup.splitlines()), 'Observer must remain outside shared slice')
        self.started = time.monotonic()
        self.last_heartbeat = self.started
        self.last, self.maximum = {}, {}
        self.samples = 0
        self.sample()

    def sample(self):
        snapshot = {}
        for group in [self.group] + list(self.group.glob('*.scope')):
            name = '.' if group == self.group else group.name
            values = {}
            for filename in ['memory.current', 'memory.peak', 'memory.max', 'memory.swap.current',
                             'memory.swap.max', 'memory.events', 'memory.events.local', 'cpu.stat']:
                try:
                    raw = (group / filename).read_text().strip()
                    values[filename] = ({key: int(value) for key, value in (line.split() for line in raw.splitlines())}
                                        if '\n' in raw or filename.endswith(('events', 'local', 'stat'))
                                        else int(raw) if raw.isdigit() else raw)
                except (FileNotFoundError, ProcessLookupError):
                    continue  # Transient child may disappear between two reads.
            if values:
                snapshot[name] = values
                self.last[name] = values
                self.maximum[name] = max(self.maximum.get(name, 0), values.get('memory.current', 0))
        self.samples += 1
        with (self.directory / 'cgroup-samples.jsonl').open('a') as stream:
            stream.write(json.dumps({'elapsedSeconds': time.monotonic() - self.started, 'groups': snapshot}) + '\n')
        # Persist every sample, so even an external CI interruption leaves useful counters.
        summary = {'sharedCgroup': str(self.group), 'sampleIntervalSeconds': 0.5,
                   'samples': self.samples, 'lastSeen': self.last, 'sampledMaxCurrentBytes': self.maximum,
                   'kernelParentPeakBytes': self.last.get('.', {}).get('memory.peak'),
                   'parentMemoryEvents': self.last.get('.', {}).get('memory.events'),
                   'observerOutsideSharedSlice': True, 'observerProcCgroup': self.proc_cgroup}
        pending = self.directory / 'cgroup-summary.json.tmp'
        pending.write_text(json.dumps(summary, indent=2) + '\n')
        pending.replace(self.directory / 'cgroup-summary.json')
        now = time.monotonic()
        if now - self.last_heartbeat >= 30:
            parent = self.last.get('.', {})
            events = parent.get('memory.events', {})
            cpu_seconds = parent.get('cpu.stat', {}).get('usage_usec', 0) / 1_000_000
            print(f"Proof progress: elapsed={now - self.started:.0f}s "
                  f"memory={parent.get('memory.current', 0) / GIB:.2f}GiB "
                  f"peak={parent.get('memory.peak', 0) / GIB:.2f}GiB "
                  f"cpu={cpu_seconds:.1f}s avgCPUs={cpu_seconds / max(now - self.started, 1):.2f} "
                  f"oom={events.get('oom', 0)} oomKills={events.get('oom_kill', 0)}", flush=True)
            self.last_heartbeat = now

    def execute(self, command, log, timeout):
        child = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
        started = time.monotonic()
        try:
            while child.poll() is None:
                self.sample()
                if time.monotonic() - started >= timeout:
                    raise subprocess.TimeoutExpired(command, timeout)
                time.sleep(0.5)
            self.sample()
            if child.returncode:
                raise subprocess.CalledProcessError(child.returncode, command)
        finally:
            # Outer cleanup also stops the scope and container; this reaps their CLI parent.
            if child.poll() is None:
                try:
                    child.terminate()
                except (PermissionError, ProcessLookupError):
                    pass  # sudo may change UID; outer cleanup stops the root-owned scope.
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    try:
                        child.kill()
                    except (PermissionError, ProcessLookupError):
                        pass
            try:
                child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                pass  # Preserve the original failure; outer finally performs privileged cleanup.
