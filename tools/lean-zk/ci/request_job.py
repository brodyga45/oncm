#!/usr/bin/env python3
"""Run one inline request with the existing original-prover path; data only."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys

from request import HERE, git_context, validate_request, strict_json
from request_result import terminal, validate_proof, compact_resources


def write_json(path, body):
    path.write_text(json.dumps(body, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--work', type=Path, required=True)
    parser.add_argument('--public', type=Path, required=True)
    args = parser.parse_args()
    args.public.mkdir(parents=True, exist_ok=True)
    context = git_context(args.request)
    request, case_dir, result = None, None, None
    try:
        request = validate_request(args.request.read_bytes())
        body = request['body']
        kind = {0: 'registration', 1: 'proof', 2: 'refutation'}[body['outcome']]
        case_dir = args.work / 'artifacts' / (body['profile'] + '-generic-' + kind)
        write_json(args.public / 'admission.json', {
            **context, 'requestNonce': body['requestNonce'], 'profileId': body['profileId'],
            'goalHash': body['goalHash'], 'outcome': body['outcome'],
            'goalBytes': len(request['goal']), 'exportBytes': len(request['export']),
            'sourceBytes': len(body['source']['text'].encode()),
            'admission': 'strict data/hash/foundation/prefix validation; not native typing or a segment limit'})
        subprocess.run([sys.executable, str(HERE / 'prepare.py'), '--work', str(args.work)], check=True, timeout=600)
        subprocess.run([sys.executable, str(HERE / 'run.py'), 'prove', '--work', str(args.work),
                        '--request', str(args.request.resolve())], check=True, timeout=1920)
        proof = strict_json((case_dir / 'verified.json').read_bytes())
        receipt = (case_dir / 'receipt.bin').read_bytes()
        validate_proof(proof, receipt, request, context)
        (args.public / 'receipt.bin').write_bytes(receipt)
        (args.public / 'certificate.bin').write_bytes(bytes.fromhex(proof['certificate'][2:]))
        result = terminal(context, request, proof, compact_resources(case_dir))
    except BaseException as error:
        # No source, logs, environment or token headers are published in failures.
        result = terminal(context, request, resources=compact_resources(case_dir) if case_dir else None,
                          error=('Request validation or original proof failed: ' + type(error).__name__)[:2048])
        raise
    finally:
        if result is not None:
            write_json(args.public / 'result.json', result)
        if (args.work / 'environment.json').exists():
            # Independent cleanup still runs if the outer timeout killed run.py.
            try:
                subprocess.run([sys.executable, str(HERE / 'run.py'), 'cleanup', '--work', str(args.work)],
                               check=True, timeout=90)
            except (subprocess.SubprocessError, OSError):
                print('Resource cleanup reported failure; inspect workflow log.', file=sys.stderr)


if __name__ == '__main__':
    def interrupted(signum, _frame):
        raise RuntimeError('Interrupted request worker: ' + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    main()
