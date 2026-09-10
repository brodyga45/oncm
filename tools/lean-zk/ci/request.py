"""Strict data-only requests for the existing immutable proof profiles.

This transport validation does not implement Lean typing or cryptography. The
unchanged guest and original receipt verifier provide those checks.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import uuid

from receipt import require

HERE = Path(__file__).resolve().parent
REPOSITORY = 'brodyga45/oncm'
MAX_REQUEST = 4 * 1024 ** 2
MAX_SOURCE = 512 * 1024
MAX_EXPORT = 1024 ** 2
HEX32 = re.compile(r'[0-9a-f]{64}')
HEX40 = re.compile(r'[0-9a-f]{40}')
TOP_KEYS = {'format', 'requestNonce', 'profile', 'profileId', 'imageId',
            'goalHash', 'outcome', 'source', 'goal', 'export'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def exact_keys(value, expected, label):
    require(type(value) is dict and set(value) == set(expected), 'Invalid ' + label + ' fields')


def strict_json(raw, limit=MAX_REQUEST):
    require(type(raw) is bytes and 0 < len(raw) <= limit, 'JSON size limit')
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'Duplicate JSON key')
            result[key] = value
        return result
    def constant(_):
        raise RuntimeError('Non-finite JSON value')
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=constant)
    except (UnicodeError, ValueError, RecursionError) as error:
        raise RuntimeError('Invalid bounded UTF-8 JSON') from error


def hex_value(value, prefixed=False):
    require(type(value) is str, 'Expected hash string')
    require(bool(re.fullmatch(r'0x[0-9a-f]{64}', value) if prefixed else HEX32.fullmatch(value)),
            'Expected canonical lowercase SHA256/bytes32')
    return value


def decoded_part(value, label):
    exact_keys(value, {'base64', 'sha256', 'bytes'}, label)
    require(type(value['bytes']) is int and 0 < value['bytes'] <= MAX_EXPORT, label + ' size limit')
    require(type(value['base64']) is str and len(value['base64']) <= 4 * ((MAX_EXPORT + 2) // 3),
            label + ' base64 size limit')
    try:
        raw = base64.b64decode(value['base64'], validate=True)
    except (ValueError, UnicodeError) as error:
        raise RuntimeError('Invalid ' + label + ' base64') from error
    require(base64.b64encode(raw).decode() == value['base64'], 'Noncanonical base64')
    require(len(raw) == value['bytes'], label + ' byte count mismatch')
    require(sha(raw) == hex_value(value['sha256']), label + ' SHA256 mismatch')
    return raw


def goal_boundary(exported):
    """Locate structural Oncm.goal only; guest checks all declaration semantics."""
    # Keep only the three relevant structural states, not growing ancestor
    # tuples: adversarial deeply nested names must not allocate O(n²) memory.
    names, offset, boundary = {0: 'root'}, 0, None
    for line in exported.splitlines(keepends=True):
        require(line.endswith(b'\n'), 'NDJSON must end at complete newline records')
        row = strict_json(line, MAX_EXPORT)
        require(type(row) is dict, 'Expected NDJSON object')
        offset += len(line)
        if 'in' in row:
            index = row['in']
            require(type(index) is int and index > 0 and index not in names, 'Invalid structural name index')
            require(('str' in row) != ('num' in row), 'Invalid structural name record')
            value = row.get('str', row.get('num'))
            require(type(value) is dict and type(value.get('pre')) is int and value['pre'] in names,
                    'Missing structural name parent')
            if 'str' in row:
                require(type(value.get('str')) is str, 'Invalid name string')
                state = 'namespace' if names[value['pre']] == 'root' and value['str'] == 'Oncm' \
                    else 'goal' if names[value['pre']] == 'namespace' and value['str'] == 'goal' else 'other'
            else:
                require(type(value.get('i')) is int and value['i'] >= 0, 'Invalid numeric name')
                state = 'other'
            names[index] = state
        if 'def' in row:
            require(type(row['def']) is dict and type(row['def'].get('name')) is int,
                    'Invalid definition record')
            if names.get(row['def']['name']) == 'goal':
                require(boundary is None, 'Duplicate canonical goal definition')
                boundary = offset
    require(boundary is not None, 'Missing structural Oncm.goal definition')
    return boundary


def validate_request(raw, profiles_root=None):
    body = strict_json(raw)
    exact_keys(body, TOP_KEYS, 'request')
    require(body['format'] == 'oncm-proof-request-v1', 'Unsupported request format')
    require(type(body['requestNonce']) is str, 'Expected requestNonce UUID')
    try:
        require(str(uuid.UUID(body['requestNonce'])) == body['requestNonce'], 'Noncanonical requestNonce UUID')
    except (ValueError, AttributeError) as error:
        raise RuntimeError('Invalid requestNonce UUID') from error
    require(type(body['profile']) is str and body['profile'] in ('perf05', 'v3'), 'Unsupported immutable profile')
    require(type(body['outcome']) is int and body['outcome'] in (0, 1, 2), 'Expected outcome0/1/2')
    root = (profiles_root or HERE / 'profiles') / body['profile']
    profile = strict_json((root / 'profile.json').read_bytes())
    for key in ('profileId', 'imageId'):
        require(hex_value(body[key], True) == profile[key], key + ' does not match immutable profile')
    for filename, expected in profile['files'].items():
        require(sha((root / filename).read_bytes()) == expected, 'Pinned profile asset changed: ' + filename)
    exact_keys(body['source'], {'text', 'sha256'}, 'source')
    require(type(body['source']['text']) is str, 'Expected source text')
    try:
        source = body['source']['text'].encode('utf-8')
    except UnicodeError as error:
        raise RuntimeError('Invalid source UTF-8') from error
    require(0 < len(source) <= MAX_SOURCE, 'Source size limit')
    require(sha(source) == hex_value(body['source']['sha256']), 'Source SHA256 mismatch')
    goal, exported = decoded_part(body['goal'], 'goal'), decoded_part(body['export'], 'export')
    require('0x' + sha(goal) == hex_value(body['goalHash'], True), 'Goal commitment mismatch')
    foundation = (root / 'fixtures/foundation.ndjson').read_bytes()
    require(sha(foundation) == profile['foundationSha256'], 'Pinned foundation changed')
    require(goal.startswith(foundation), 'Goal foundation mismatch')
    require(exported.startswith(goal), 'Proof must begin with exact goal export')
    require(goal_boundary(exported) == len(goal), 'Goal must end at its canonical declaration boundary')
    if body['outcome'] == 0:
        require(goal == exported, 'Registration contains only goal')
    wire = struct.pack('<III', len(goal), body['outcome'], len(exported))
    wire += b''.join(struct.pack('<I', byte) for byte in exported)
    journal = hashlib.sha256(b'ONCM_LEAN_CLAIM_V1').digest()
    journal += bytes.fromhex(body['goalHash'][2:] + body['profileId'][2:]) + body['outcome'].to_bytes(32, 'big')
    return {'body': body, 'digest': sha(raw), 'root': root, 'profile': profile,
            'goal': goal, 'export': exported, 'wire': wire, 'journal': journal}


def git_context(request_path, env=None, git=None):
    env = os.environ if env is None else env
    require(env.get('GITHUB_REPOSITORY') == REPOSITORY, 'Allowlisted public repository required')
    require(env.get('GITHUB_EVENT_NAME') == 'push', 'Only request-branch push is supported')
    branch = env.get('GITHUB_REF', '')
    match = re.fullmatch(r'refs/heads/codex/proof-requests/([0-9a-f]{64})', branch)
    require(match, 'Invalid request branch')
    head = env.get('GITHUB_SHA', '')
    require(HEX40.fullmatch(head), 'Invalid request commit')
    git = git or (lambda args: subprocess.check_output(['git', *args]))
    require(git(['rev-parse', 'HEAD']).decode().strip() == head, 'Checkout differs from request commit')
    parents = git(['rev-list', '--parents', '-n', '1', head]).decode().split()
    require(len(parents) == 2 and parents[0] == head and HEX40.fullmatch(parents[1]),
            'Request must have exactly one trusted-source parent')
    changed = git(['diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', parents[1], head])
    require(changed == b'oncm-request.json\0', 'Request commit must change only oncm-request.json')
    entry = git(['ls-tree', '-z', head, '--', 'oncm-request.json'])
    require(re.fullmatch(rb'100644 blob [0-9a-f]{40}\toncm-request.json\0', entry),
            'Request must be a regular nonexecutable blob')
    require(not request_path.is_symlink() and request_path.stat().st_size <= MAX_REQUEST, 'Unsafe request file')
    blob_size = git(['cat-file', '-s', head + ':oncm-request.json']).decode().strip()
    require(blob_size.isdigit() and 0 < int(blob_size) <= MAX_REQUEST, 'Committed request size limit')
    raw = request_path.read_bytes()
    require(sha(raw) == match[1], 'Request branch does not match exact JSON digest')
    require(git(['show', head + ':oncm-request.json']) == raw, 'Request file differs from committed bytes')
    run_id, attempt = env.get('GITHUB_RUN_ID', ''), env.get('GITHUB_RUN_ATTEMPT', '')
    require(re.fullmatch(r'[1-9][0-9]{0,19}', run_id) and re.fullmatch(r'[1-9][0-9]{0,5}', attempt),
            'Invalid workflow provenance')
    return {'repository': REPOSITORY, 'requestDigest': match[1], 'requestCommit': head,
            'baseCommit': parents[1], 'requestBranch': branch, 'runId': run_id, 'runAttempt': attempt}
