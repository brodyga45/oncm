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


class DarwinProcess(ctypes.Structure):
    # proc_bsdshortinfo (public Apple SDK sys/proc_info.h). Unlike full BSDINFO,
    # SHORTBSDINFO does not require the target process to have our effective UID.
    _fields_ = [(name, ctypes.c_uint32) for name in ('pid', 'ppid', 'pgid', 'status')] + [
        ('name', ctypes.c_char * 16)] + [(name, ctypes.c_uint32) for name in (
            'flags', 'uid', 'gid', 'ruid', 'rgid', 'svuid', 'svgid', 'reserved')]


class DarwinIdentity(ctypes.Structure):
    # Public SDK proc_bsdinfo: 136 bytes. Start time is independent of footprint
    # accounting, allowing cleanup after a same-user proc_pid_rusage failure.
    _fields_ = [(name, ctypes.c_uint32) for name in (
        'flags', 'status', 'exit_status', 'pid', 'ppid', 'uid', 'gid', 'ruid',
        'rgid', 'svuid', 'svgid', 'reserved')] + [
        ('comm', ctypes.c_char * 16), ('name', ctypes.c_char * 32)] + [
        (name, ctypes.c_uint32) for name in ('nfiles', 'pgid', 'jobc', 'tdev', 'tpgid')] + [
        ('nice', ctypes.c_int32), ('start_seconds', ctypes.c_uint64),
        ('start_microseconds', ctypes.c_uint64)]


class AccountingError(OSError):
    def __init__(self, code, pid, metadata=None):
        self.diagnostic = {'operation': 'proc_pid_rusage', 'errno': code, 'pid': pid,
                           **(metadata or {})}
        super().__init__(code, 'Cannot account for worker: ' + json.dumps(self.diagnostic))


if sys.platform == 'darwin':
    libproc = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    libproc.proc_pid_rusage.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_void_p]
    libproc.proc_pid_rusage.restype = ctypes.c_int
    libproc.proc_listallpids.argtypes = [ctypes.c_void_p, ctypes.c_int]
    libproc.proc_listallpids.restype = ctypes.c_int
    libproc.proc_pidinfo.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_uint64,
                                   ctypes.c_void_p, ctypes.c_int]
    libproc.proc_pidinfo.restype = ctypes.c_int


def process_info(pid):
    result = DarwinProcess()
    ctypes.set_errno(0)
    # arg=1 includes zombies, so callers explicitly distinguish exited workers.
    size = libproc.proc_pidinfo(pid, 13, 1, ctypes.byref(result), ctypes.sizeof(result))
    if size != ctypes.sizeof(result):
        code = ctypes.get_errno()
        if code == errno.ESRCH:
            return None
        raise OSError(code or errno.EIO, f'Cannot inspect process PID {pid}: received {size} bytes')
    if result.pid != pid:
        raise RuntimeError(f'Process inventory PID mismatch: {pid}/{result.pid}')
    return {'pid': pid, 'ppid': result.ppid, 'pgid': result.pgid, 'status': result.status,
            'uid': result.uid, 'ruid': result.ruid,
            'name': bytes(result.name).decode('utf-8', 'replace')}


def process_identity(pid):
    result = DarwinIdentity()
    ctypes.set_errno(0)
    size = libproc.proc_pidinfo(pid, 3, 1, ctypes.byref(result), ctypes.sizeof(result))
    if size != ctypes.sizeof(result):
        code = ctypes.get_errno()
        if code == errno.ESRCH:
            return None
        raise OSError(code or errno.EIO, f'Cannot identify worker PID {pid}: received {size} bytes')
    if result.pid != pid:
        raise RuntimeError(f'Worker identity PID mismatch: {pid}/{result.pid}')
    if result.status == 5:
        return None
    return result.start_seconds, result.start_microseconds


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
        metadata = process_info(pid)
        if metadata is None or metadata['status'] == 5:  # SZOMB
            return None
        raise AccountingError(code, pid, metadata)
    return result.footprint, result.started


def processes():
    # Do not spawn ps: on macOS it is setuid root and an enclosing guard can
    # legitimately refuse its footprint. In-process inventory avoids that child.
    ctypes.set_errno(0)
    count = libproc.proc_listallpids(None, 0)
    if count <= 0:
        raise OSError(ctypes.get_errno() or errno.EIO, 'Cannot size process inventory')
    capacity = max(count + 256, count * 2)
    for attempt in range(4):
        if capacity > 1048576:
            raise RuntimeError('Process inventory exceeds bounded capacity')
        buffer = (ctypes.c_int * capacity)()
        ctypes.set_errno(0)
        count = libproc.proc_listallpids(buffer, ctypes.sizeof(buffer))
        if count <= 0:
            raise OSError(ctypes.get_errno() or errno.EIO, 'Cannot list processes')
        if count < capacity:
            break
        capacity *= 2
    else:
        raise RuntimeError('Process inventory repeatedly truncated')
    table = {}
    for pid in buffer[:count]:
        if pid <= 0:
            continue
        metadata = process_info(pid)
        if metadata is not None and metadata['status'] != 5:
            table[pid] = (metadata['ppid'], metadata['pgid'])
    return table


def descendants(seeds, table):
    selected = set(seeds)
    while True:
        expanded = selected | {pid for pid, (ppid, _) in table.items() if ppid in selected}
        if expanded == selected:
            return selected
        selected = expanded


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
    failure = None
    cleanup_errors = []
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda signum, frame: interrupted.append(signum))

    def stop_tree():
        if child is None:
            return
        def remember(error, operation, pid=None):
            if len(cleanup_errors) < 32:
                cleanup_errors.append({'operation': operation, 'pid': pid,
                    'errno': getattr(error, 'errno', None), 'message': str(error)[:1024]})
        for sig in (signal.SIGTERM, signal.SIGKILL):
            # Do not reap before collecting the original group: even a zombie
            # leader pins its PID until wait/poll, anchoring fast-spawned children.
            leader_unreaped = child.returncode is None
            try:
                table = processes()
            except Exception as error:
                remember(error, 'cleanup-inventory')
                table = {}
            # A live, unreaped leader cannot have its PID reused. Even if memory
            # accounting/inventory fails, still attempt to stop its own group.
            groups = {child.pid} if leader_unreaped else set()
            targets = {}
            for pid, started in list(known.items()):
                try:
                    if process_identity(pid) == started:
                        targets[pid] = started
                except Exception as error:
                    remember(error, 'cleanup-identity', pid)
            # Include separately grouped descendants while their ancestry is
            # still established, even when one of them cannot be accounted for.
            seeds = set(targets) | ({child.pid} if leader_unreaped else set())
            if leader_unreaped:
                seeds.update(pid for pid, (_, pgid) in table.items() if pgid == child.pid)
            selected = descendants(seeds, table)
            for pid in selected.intersection(table) - set(targets):
                try:
                    identity = process_identity(pid)
                    # Never replace an already known PID's identity after reuse.
                    if identity and (pid not in known or known[pid] == identity):
                        targets[pid] = known[pid] = identity
                except Exception as error:
                    remember(error, 'cleanup-identity', pid)
            groups.update(table[pid][1] for pid in targets if pid in table)
            if not groups and not targets:
                return
            for group in groups:
                try:
                    # After reap, a numeric PGID alone is not ownership. Require
                    # an independently identified live member in that same group.
                    owned = group == child.pid and child.returncode is None
                    if not owned:
                        for pid, identity in targets.items():
                            metadata = process_info(pid)
                            if metadata and metadata['pgid'] == group and process_identity(pid) == identity:
                                owned = True
                                break
                    if owned:
                        os.killpg(group, sig)
                except ProcessLookupError:
                    pass
                except PermissionError as error:
                    try:
                        if any(pgid == group for _, pgid in processes().values()):
                            remember(error, 'killpg', group)
                    except Exception as inspection_error:
                        remember(error, 'killpg', group)
                        remember(inspection_error, 'cleanup-inventory')
                except OSError as error:
                    # Continue the other cleanup attempts; never let a failed
                    # diagnostic or individual signal abort the kill pass.
                    remember(error, 'killpg', group)
            for pid, identity in targets.items():
                try:
                    if process_identity(pid) == identity:
                        os.kill(pid, sig)
                except ProcessLookupError:
                    pass
                except PermissionError as error:
                    try:
                        if process_identity(pid) == identity:
                            remember(error, 'kill', pid)
                    except Exception as inspection_error:
                        remember(error, 'kill', pid)
                        remember(inspection_error, 'cleanup-identity', pid)
                except OSError as error:
                    remember(error, 'kill', pid)
            if sig == signal.SIGTERM:
                time.sleep(0.2)
        try:
            child.wait(timeout=2)
        except subprocess.TimeoutExpired as error:
            remember(error, 'cleanup-wait', child.pid)

    try:
        # Verify both accounting and process inventory before starting work.
        usage(os.getpid())
        process_identity(os.getpid())
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
            leader_unreaped = child.returncode is None
            selected = {child.pid} if leader_unreaped else set()
            for pid, started in list(known.items()):
                if pid in table and process_identity(pid) == started:
                    selected.add(pid)
            # A group is included only while an owned live identity anchors it.
            groups = {table[pid][1] for pid in selected if pid in table}
            if leader_unreaped:
                groups.add(child.pid)
            selected.update(pid for pid, (_, pgid) in table.items() if pgid in groups)
            selected = descendants(selected, table)
            current_bytes = usage(os.getpid())[0]
            for pid in selected:
                identity = process_identity(pid)
                if identity is None or (pid in known and known[pid] != identity):
                    continue
                known[pid] = identity
                current = usage(pid)
                if current:
                    current_bytes += current[0]
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
        failure = getattr(error, 'diagnostic', {'operation': 'guard',
            'errno': getattr(error, 'errno', None), 'message': str(error)[:1024]})
        print(f'Resource guard failed: {error}', file=sys.stderr)
    finally:
        try:
            stop_tree()
        finally:
            if cleanup_errors and code == 0:
                reason, code = 'cleanup-error', 126
            report = {'wallSeconds': round(time.monotonic() - began, 3),
                      'peakTreeFootprintBytes': peak, 'memoryLimitBytes': args.memory_mib * 1024 * 1024,
                      'reason': reason, 'exitCode': code, 'accounting': 'darwin-phys-footprint',
                      'sampleIntervalSeconds': 0.1, 'kernelHardLimit': False,
                      'inventory': 'darwin-libproc-in-process', 'failure': failure,
                      'identity': 'darwin-bsd-start-time',
                      'cleanupErrors': cleanup_errors}
            report_path.write_text(json.dumps(report, indent=2) + '\n')
            if held_lock:
                held_lock.close()
            if code:
                print(f'Worker stopped: {reason}; see {report_path}', file=sys.stderr)
    return code


if __name__ == '__main__':
    sys.exit(main())
