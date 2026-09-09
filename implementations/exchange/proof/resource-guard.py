#!/usr/bin/env python3
"""Bound a worker tree with sampled memory accounting and explicit cleanup.

On macOS use physical footprint (including compressed-memory accounting), not
RSS alone. This watchdog can overshoot between samples; it is not a kernel
cgroup memory limit. Unknown accounting fails closed. No proof logic lives here.
"""
import argparse
import ctypes
import errno
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


class DarwinUsage(ctypes.Structure):
    # rusage_info_v0, from the installed Apple SDK sys/resource.h.
    _fields_ = [('uuid', ctypes.c_uint8 * 16)] + [
        (name, ctypes.c_uint64) for name in (
            'user', 'system', 'idle_wakeups', 'interrupt_wakeups', 'pageins',
            'wired', 'resident', 'footprint', 'started', 'exited')]


if sys.platform == 'darwin':
    libproc = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    libproc.proc_pid_rusage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
    libproc.proc_pid_rusage.restype = ctypes.c_int


def usage(pid):
    if sys.platform != 'darwin':
        raise RuntimeError('This guard requires macOS footprint accounting; configure a cgroup worker on another OS')
    result = DarwinUsage()
    if libproc.proc_pid_rusage(pid, 0, ctypes.byref(result)) != 0:
        code = ctypes.get_errno()
        if code == errno.ESRCH:
            return None
        # macOS can also return EPERM while a process is exiting. Only ignore
        # failed accounting after a fresh inventory confirms it is gone (or a
        # zombie). A live process with unavailable accounting still fails closed.
        if pid not in processes():
            return None
        raise OSError(code, f'Cannot account for worker PID {pid}')
    return result.footprint, result.started


def processes():
    result = subprocess.run(['/bin/ps', '-axo', 'pid=,ppid=,pgid=,stat='],
                            check=True, capture_output=True, text=True, timeout=2)
    table = {}
    for row in result.stdout.splitlines():
        pid, parent, group, state = row.split()
        if not state.startswith('Z'):  # A zombie has exited; it cannot compute.
            table[int(pid)] = (int(parent), int(group))
    return table


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--memory-mib', type=int, default=2048)
    parser.add_argument('--timeout', type=float, default=120)
    parser.add_argument('--report', required=True)
    parser.add_argument('--lock-file')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command or args.memory_mib < 16 or args.timeout <= 0:
        parser.error('A command, memory >= 16 MiB and positive timeout are required')
    report_path = Path(args.report)
    if report_path.exists():
        parser.error('Report must be a new file')
    report_path.parent.mkdir(parents=True, exist_ok=True)
    parent = os.getppid()
    began = time.monotonic()
    peak = 0
    reason = 'completed'
    code = 1
    child = None
    known = {}
    held_lock = None
    interrupted = []
    leader_finished_at = None
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda signum, frame: interrupted.append(signum))

    def stop_tree():
        if child is None:
            return
        for sig in (signal.SIGTERM, signal.SIGKILL):
            child.poll()  # Reap the leader before signalling a departed group.
            table = processes()
            group_alive = any(group == child.pid for _, group in table.values())
            targets = []
            for pid, started in list(known.items()):
                if pid in table:
                    current = usage(pid)
                    if current and current[1] == started:
                        targets.append(pid)
            if not group_alive and not targets:
                return
            if group_alive:
                try:
                    os.killpg(child.pid, sig)
                except ProcessLookupError:
                    pass
                except PermissionError:
                    # Like proc_pid_rusage, killpg may report EPERM when the
                    # last members have just exited. Never suppress denial for
                    # a group which still contains a live process.
                    if any(group == child.pid for _, group in processes().values()):
                        raise
            for pid in targets:
                try:
                    os.kill(pid, sig)
                except ProcessLookupError:
                    pass
                except PermissionError:
                    if pid in processes():
                        raise
            if sig == signal.SIGTERM:
                time.sleep(0.2)
        try:
            child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass

    try:
        # Verify both accounting and process inventory before starting work.
        usage(os.getpid())
        processes()
        if args.lock_file:
            lock_path = Path(args.lock_file)
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            held_lock = open(lock_path, 'a+')
            try:
                fcntl.flock(held_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                reason, code = 'busy', 75
                return code
        env = {**os.environ, 'RAYON_NUM_THREADS': '2', 'GOMAXPROCS': '2',
               'OMP_NUM_THREADS': '2', 'OPENBLAS_NUM_THREADS': '1'}
        child = subprocess.Popen(command, env=env, start_new_session=True)
        while True:
            table = processes()
            selected = {child.pid}
            selected.update(pid for pid, (_, pgid) in table.items() if pgid == child.pid)
            # Include descendants even when a worker creates a separate group.
            while True:
                expanded = selected | {pid for pid, (ppid, _) in table.items() if ppid in selected}
                if expanded == selected:
                    break
                selected = expanded
            for pid, started in list(known.items()):
                if pid in table:
                    current = usage(pid)
                    if current and current[1] == started:
                        selected.add(pid)
            current_bytes = usage(os.getpid())[0]
            for pid in selected:
                current = usage(pid)
                if current:
                    current_bytes += current[0]
                    known[pid] = current[1]
            peak = max(peak, current_bytes)
            if current_bytes > args.memory_mib * 1024 * 1024:
                reason, code = 'memory-limit', 125
                break
            if interrupted or os.getppid() != parent:
                reason, code = 'cancelled', 128 + (interrupted[0] if interrupted else signal.SIGTERM)
                break
            if time.monotonic() - began >= args.timeout:
                reason, code = 'timeout', 124
                break
            result = child.poll()
            if result is not None:
                # Parent completion must not leave computing children behind.
                survivors = selected.intersection(table) - {child.pid}
                if survivors:
                    # IPC shutdown can finish just after its parent. Retain the
                    # lock, memory accounting and cancellation throughout grace.
                    if leader_finished_at is None:
                        leader_finished_at = time.monotonic()
                    if time.monotonic() - leader_finished_at < 0.5:
                        time.sleep(0.05)
                        continue
                    reason, code = 'orphaned-descendants', 126
                else:
                    code = result if result >= 0 else 128 - result
                    reason = 'completed' if code == 0 else 'worker-failed'
                break
            time.sleep(0.1)
    except Exception as error:
        reason, code = 'guard-error', 126
        print(f'Resource guard failed: {error}', file=sys.stderr)
    finally:
        try:
            stop_tree()
        finally:
            report = {'wallSeconds': round(time.monotonic() - began, 3),
                      'peakTreeFootprintBytes': peak, 'memoryLimitBytes': args.memory_mib * 1024 * 1024,
                      'reason': reason, 'exitCode': code, 'accounting': 'darwin-phys-footprint',
                      'sampleIntervalSeconds': 0.1, 'kernelHardLimit': False}
            report_path.write_text(json.dumps(report, indent=2) + '\n')
            if held_lock:
                held_lock.close()
            if code:
                print(f'Worker stopped: {reason}; see {report_path}', file=sys.stderr)
    return code


if __name__ == '__main__':
    sys.exit(main())
