#!/usr/bin/env python3
"""Sequential real proofs with original r0vm and official Docker Groth16."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import struct
import subprocess
import sys
import time

from receipt import ReceiptReader, require, verify_original
from resource_group import Observer, create_slice, cleanup_slice, cleanup_command

HERE = Path(__file__).resolve().parent
CASES = ['true-registration', 'true-proof', 'false-registration', 'false-refutation']


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def abi_certificate(evm_seal, journal):
    """Standard abi.encode(bytes,bytes), transport encoding only."""
    def dynamic(data):
        return len(data).to_bytes(32, 'big') + data + bytes((-len(data)) % 32)
    first = dynamic(evm_seal)
    return (64).to_bytes(32, 'big') + (64 + len(first)).to_bytes(32, 'big') + first + dynamic(journal)


def inputs(profile_name, case):
    root = HERE / 'profiles' / profile_name
    profile = json.loads((root / 'profile.json').read_text())
    for filename, expected in profile['files'].items():
        require(hashlib.sha256((root / filename).read_bytes()).hexdigest() == expected,
                'Pinned asset changed: ' + filename)
    side = case.split('-')[0]
    goal = (root / 'fixtures' / (side + '-goal.ndjson')).read_bytes()
    registration = case.endswith('registration')
    export = goal if registration else (root / 'fixtures' / (side + '-proof.ndjson')).read_bytes()
    require(export.startswith(goal), 'Canonical prefix changed')
    goal_hash = hashlib.sha256(goal).hexdigest()
    require('0x' + goal_hash == profile['fixtures'][side]['goalHash'], 'Goal binding mismatch')
    outcome = 0 if registration else profile['fixtures'][side]['outcome']
    # Exact original host .write(u32).write(u32).write(Vec<u8>) wire: each byte is a LE u32.
    wire = struct.pack('<III', len(goal), outcome, len(export))
    wire += b''.join(struct.pack('<I', byte) for byte in export)
    journal = hashlib.sha256(b'ONCM_LEAN_CLAIM_V1').digest()
    journal += bytes.fromhex(goal_hash + profile['profileId'][2:]) + outcome.to_bytes(32, 'big')
    return root, profile, goal_hash, outcome, wire, journal


def clean_case(case_dir, real_docker):
    errors = []
    scope_file = case_dir / 'scope.txt'
    if scope_file.exists():
        scope = scope_file.read_text().strip()
        if re.fullmatch(r'oncm-ci-[A-Za-z0-9-]+\.scope', scope):
            cleanup_command(['sudo', 'systemctl', 'stop', scope], errors)
    name_file = case_dir / 'container-name.txt'
    if name_file.exists():
        name = name_file.read_text().strip()
        if re.fullmatch(r'oncm-ci-[A-Za-z0-9-]+', name):
            cleanup_command([real_docker, 'rm', '-f', name], errors)
    cleanup_slice(case_dir, errors)
    if errors:
        write_json(case_dir / 'cleanup-errors.json', errors)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prove', 'cleanup'])
    parser.add_argument('--work', required=True, type=Path)
    parser.add_argument('--profile', choices=['perf05', 'v3'], default='perf05')
    parser.add_argument('--case', choices=['all'] + CASES, default='true-registration')
    parser.add_argument('--request', type=Path, help='Strict inline generic request; no source execution')
    args = parser.parse_args()
    work = args.work.resolve()
    setup = json.loads((work / 'environment.json').read_text())
    pins = setup['pins']
    real_docker = setup['dockerBinary']
    artifacts = work / 'artifacts'
    artifacts.mkdir(exist_ok=True)
    if args.action == 'cleanup':
        for directory in artifacts.iterdir():
            if directory.is_dir():
                clean_case(directory, real_docker)
        return
    require(setup.get('dockerCgroupDriver') == 'systemd' and str(setup.get('dockerCgroupVersion')) == '2',
            'Require verified cgroup-v2/systemd setup')
    run_id = os.environ.get('GITHUB_RUN_ID', 'manual') + '-' + os.environ.get('GITHUB_RUN_ATTEMPT', '1')
    require(re.fullmatch(r'[A-Za-z0-9-]+', run_id), 'Invalid run ID')
    r0vm = work / 'bin/r0vm'
    require(not os.environ.get('RISC0_DEV_MODE'), 'Dev mode forbidden')
    ci_env = {'PATH': str(HERE) + ':/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
              'RAYON_NUM_THREADS': str(pins['host']['workerThreads']), 'TOKIO_WORKER_THREADS': '2',
              'OMP_NUM_THREADS': str(pins['host']['workerThreads']),
              'RISC0_DEV_MODE': '', 'RUST_LOG': pins['host']['rustLog'], 'ONCM_REAL_DOCKER': real_docker,
              'ONCM_CI_RUN': run_id, 'HOME': os.environ['HOME']}
    image = None
    request = None
    if args.request:
        from request import validate_request
        request = validate_request(args.request.read_bytes())
        args.profile = request['body']['profile']
        cases = ['generic-' + {0: 'registration', 1: 'proof', 2: 'refutation'}[request['body']['outcome']]]
    else:
        cases = CASES if args.case == 'all' else [args.case]
    for case in cases:
        if request is None:
            root, profile, goal_hash, outcome, wire, expected_journal = inputs(args.profile, case)
        else:
            root, profile = request['root'], request['profile']
            goal_hash, outcome = request['body']['goalHash'][2:], request['body']['outcome']
            wire, expected_journal = request['wire'], request['journal']
        image = profile['imageId'][2:]
        directory = artifacts / (args.profile + '-' + case)
        directory.mkdir()  # Refuse accidentally overwriting proof results.
        (directory / 'stdin.bin').write_bytes(wire)
        (directory / 'expected-journal.bin').write_bytes(expected_journal)
        write_json(directory / 'profile.json', profile)
        name = 'oncm-ci-' + run_id + '-' + args.profile + '-' + case
        scope = name + '.scope'
        (directory / 'scope.txt').write_text(scope)
        (directory / 'container-name.txt').write_text(name)
        env = dict(ci_env, RISC0_WORK_DIR=str(directory), ONCM_CASE_DIR=str(directory), ONCM_CONTAINER_NAME=name)
        original_cmd = [str(r0vm), '--elf', str(root / 'lean-checker.bin'),
                        '--initial-input', str(directory / 'stdin.bin'), '--receipt-kind', 'groth16',
                        '--receipt', str(directory / 'receipt.bin')]
        # Host and Docker are siblings below one kernel-enforced 13 GiB parent.
        command = ['sudo', 'systemd-run', '--quiet', '--scope', '--unit=' + scope,
                   '--property=MemoryMax=' + pins['host']['memoryMax'],
                   '--property=MemorySwapMax=0', '--property=CPUQuota=' + pins['host']['cpuQuota'], '--property=TasksMax=128',
                   'sudo', '-u', os.environ['USER'], 'env']
        command += [key + '=' + value for key, value in env.items()]
        command += original_cmd
        write_json(directory / 'original-command.json', original_cmd)
        started = time.monotonic()
        observer = None
        try:
            shared_slice, shared_group = create_slice(directory, name)
            observer = Observer(shared_group, directory)
            env['ONCM_CGROUP_SLICE'] = shared_slice
            # Insert resource and environment arguments without changing original r0vm flags.
            command.insert(command.index('--unit=' + scope) + 1, '--slice=' + shared_slice)
            command.insert(command.index(original_cmd[0]), 'ONCM_CGROUP_SLICE=' + shared_slice)
            actual_image = subprocess.check_output([str(r0vm), '--elf', str(root / 'lean-checker.bin'), '--id'],
                                                  env=env, text=True, timeout=10).strip()
            require(actual_image == image, 'Original r0vm computed a different image ID')
            with (directory / 'prover.log').open('wb') as log:
                observer.execute(command, log, pins['host']['caseTimeoutSeconds'])
            receipt_path = directory / 'receipt.bin'
            require(receipt_path.stat().st_size <= 8 * 1024 ** 2, 'Unexpectedly large receipt')
            receipt = receipt_path.read_bytes()
            seal, parameters, journal = ReceiptReader(receipt).groth16()
            require(journal == expected_journal, 'Wrong authenticated claim journal')
            verify_original(receipt, directory, env, r0vm, image)
            require('0x' + parameters[:4].hex() == pins['ethereum']['selector'],
                    'Unexpected Groth16 verifier selector')
            evm_seal = parameters[:4] + seal
            certificate = abi_certificate(evm_seal, journal)
            require((directory / 'proof.json').stat().st_size <= 4096, 'Unexpected proof JSON size')
            proof_json = json.loads((directory / 'proof.json').read_text())
            require(all(key in proof_json for key in ['pi_a', 'pi_b', 'pi_c']), 'Missing original proof JSON')
            (directory / 'seal.bin').write_bytes(seal)
            (directory / 'evm-seal.bin').write_bytes(evm_seal)
            (directory / 'certificate.bin').write_bytes(certificate)
            (directory / 'journal.bin').write_bytes(journal)
            verified = {
                'format': 'oncm-real-groth16-ci-v1', 'profile': args.profile, 'case': case,
                'imageId': '0x' + image, 'profileId': profile['profileId'], 'goalHash': '0x' + goal_hash,
                'outcome': outcome, 'journal': '0x' + journal.hex(), 'rawSeal': '0x' + seal.hex(),
                'evmSeal': '0x' + evm_seal.hex(), 'certificate': '0x' + certificate.hex(),
                'verifierParameters': '0x' + parameters.hex(),
                'receiptSha256': hashlib.sha256(receipt).hexdigest(),
                'receiptKind': 'Groth16', 'verifiedBy': 'official r0vm 3.0.6 VerifyRequest / Receipt::verify',
                'elapsedSeconds': time.monotonic() - started, 'evmVerified': False,
                'pins': pins, 'sourceCommit': os.environ.get('GITHUB_SHA'),
                'runId': os.environ.get('GITHUB_RUN_ID'),
                'runAttempt': os.environ.get('GITHUB_RUN_ATTEMPT')}
            if request is not None:
                verified.update(requestDigest=request['digest'], requestNonce=request['body']['requestNonce'],
                                sourceSha256=request['body']['source']['sha256'],
                                goalExportSha256=request['body']['goal']['sha256'],
                                exportSha256=request['body']['export']['sha256'])
            write_json(directory / 'verified.json', verified)
            print('Verified real Groth16:', args.profile, case, flush=True)
        except BaseException as error:
            write_json(directory / 'failure.json', {'error': str(error), 'elapsedSeconds': time.monotonic() - started})
            raise
        finally:
            try:
                if observer is not None:
                    observer.sample()  # Preserve peak/events before scope/container/slice cleanup.
            finally:
                clean_case(directory, real_docker)


if __name__ == '__main__':
    def interrupted(signum, _frame):
        raise RuntimeError('Interrupted: ' + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    main()
