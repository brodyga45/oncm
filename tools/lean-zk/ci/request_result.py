"""Compact public result packaging and binding validation; no new cryptography."""
import math
from pathlib import Path

from receipt import ReceiptReader, require
from request import HERE, sha, strict_json, exact_keys
from run import abi_certificate

FORMAT = 'oncm-public-proof-result-v1'
MAX_RESULT = 128 * 1024
MAX_PUBLIC_RECEIPT = 1024 * 1024


def validate_proof(proof, receipt, request, context):
    require(type(proof) is dict, 'Expected verified proof metadata')
    body = request['body']
    expected = {
        'format': 'oncm-real-groth16-ci-v1', 'profile': body['profile'],
        'case': 'generic-' + {0: 'registration', 1: 'proof', 2: 'refutation'}[body['outcome']],
        'imageId': body['imageId'], 'profileId': body['profileId'], 'goalHash': body['goalHash'],
        'outcome': body['outcome'], 'requestNonce': body['requestNonce'],
        'requestDigest': context['requestDigest'], 'sourceCommit': context['requestCommit'],
        'sourceSha256': body['source']['sha256'], 'goalExportSha256': body['goal']['sha256'],
        'exportSha256': body['export']['sha256'], 'runId': context['runId'],
        'runAttempt': context['runAttempt'], 'receiptKind': 'Groth16', 'evmVerified': False,
    }
    for key, value in expected.items():
        require(type(proof.get(key)) is type(value) and proof[key] == value, 'Result binding mismatch: ' + key)
    require(type(receipt) is bytes and 0 < len(receipt) <= MAX_PUBLIC_RECEIPT, 'Public receipt size limit')
    require(sha(receipt) == proof.get('receiptSha256'), 'Receipt SHA256 mismatch')
    seal, parameters, journal = ReceiptReader(receipt).groth16()
    require(journal == request['journal'], 'Receipt journal does not bind request')
    pins = strict_json((HERE / 'pins.json').read_bytes())
    require('0x' + parameters[:4].hex() == pins['ethereum']['selector'], 'Wrong original verifier selector')
    evm_seal = parameters[:4] + seal
    for key, value in {'rawSeal': seal, 'evmSeal': evm_seal, 'journal': journal,
                       'verifierParameters': parameters,
                       'certificate': abi_certificate(evm_seal, journal)}.items():
        require(proof.get(key) == '0x' + value.hex(), 'Noncanonical result transport: ' + key)
    require(proof.get('pins') == pins, 'Unexpected proof tool/resource pins')
    elapsed = proof.get('elapsedSeconds')
    require(type(elapsed) in (int, float) and math.isfinite(elapsed) and elapsed >= 0, 'Invalid measured elapsed time')
    # Still not cryptographic acceptance: publisher calls original VerifyRequest.
    return journal


def terminal(context, request=None, proof=None, resources=None, error=None):
    result = {'format': FORMAT, **context, 'status': 'verified' if proof is not None else 'failed',
              'proof': proof, 'resources': resources, 'error': error}
    if request is not None:
        body = request['body']
        result['input'] = {key: body[key] for key in ('requestNonce', 'profile', 'profileId', 'imageId', 'goalHash', 'outcome')}
        result['input'].update(sourceSha256=body['source']['sha256'],
                               goalExportSha256=body['goal']['sha256'], exportSha256=body['export']['sha256'])
    else:
        result['input'] = None
    return result


def validate_terminal(result, context, request=None, receipt=None):
    exact_keys(result, {'format', *context.keys(), 'status', 'proof', 'resources', 'error', 'input'}, 'public result')
    require(result['format'] == FORMAT and result['status'] in ('verified', 'failed'), 'Invalid terminal result')
    for key, value in context.items():
        require(result[key] == value, 'Public provenance mismatch: ' + key)
    expected_input = terminal(context, request)['input']
    require(result['input'] == expected_input, 'Public input metadata mismatch')
    require(result['resources'] is None or type(result['resources']) is dict, 'Invalid resource summary')
    if result['status'] == 'verified':
        require(result['error'] is None and request is not None and receipt is not None, 'Incomplete successful result')
        validate_proof(result['proof'], receipt, request, context)
    else:
        require(result['proof'] is None and type(result['error']) is str and 0 < len(result['error']) <= 2048,
                'Failed result must not contain a proof')
    return result


def compact_resources(case_dir):
    path = case_dir / 'cgroup-summary.json'
    if not path.exists():
        return None
    value = strict_json(path.read_bytes(), MAX_RESULT)
    result = {key: value.get(key) for key in ('kernelParentPeakBytes', 'parentMemoryEvents',
                                             'sampleIntervalSeconds', 'samples', 'observerOutsideSharedSlice')}
    parent = value.get('lastSeen', {}).get('.', {})
    result.update(parentMemorySwapCurrentBytes=parent.get('memory.swap.current'),
                  parentCpuStat=parent.get('cpu.stat'))
    return result
