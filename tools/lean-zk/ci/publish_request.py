#!/usr/bin/env python3
"""Publish compact terminal data to a per-request public branch.

Only this small CI job receives contents:write. It never executes request source
or proof artifacts, and re-verifies successful receipts with original r0vm.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request

from receipt import require, verify_original
from request import HERE, REPOSITORY, HEX40, git_context, strict_json, validate_request
from request_result import MAX_RESULT, MAX_PUBLIC_RECEIPT, terminal, validate_terminal


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('Unexpected GitHub API redirect')


class GitHub:
    def __init__(self, token):
        require(type(token) is str and bool(token), 'Publisher requires its job-scoped token')
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def call(self, method, path, value=None, missing=False):
        require(path.startswith('/git/') or path.startswith('/contents/'), 'Unsupported publisher API route')
        request = urllib.request.Request('https://api.github.com/repos/' + REPOSITORY + path,
            data=json.dumps(value).encode() if value is not None else None, method=method,
            headers={'Authorization': 'Bearer ' + self.token, 'Accept': 'application/vnd.github+json',
                     'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json',
                     'User-Agent': 'oncm-verified-result-publisher'})
        try:
            with self.opener.open(request, timeout=20) as response:
                data = response.read(2 * MAX_RESULT + 1)
                require(len(data) <= 2 * MAX_RESULT, 'Oversized GitHub metadata')
                return strict_json(data, 2 * MAX_RESULT)
        except urllib.error.HTTPError as error:
            if missing and error.code == 404:
                return None
            # Never include request headers or raw response body in diagnostics.
            raise RuntimeError('GitHub publisher HTTP status ' + str(error.code)) from None


def publish(api, context, result, receipt):
    branch = 'heads/codex/proof-results/' + context['requestDigest']
    existing = api.call('GET', '/git/ref/' + branch, missing=True)
    parent = None
    if existing is not None:
        parent = existing.get('object', {}).get('sha')
        require(type(parent) is str and HEX40.fullmatch(parent), 'Invalid existing result commit')
        content = api.call('GET', '/contents/result.json?ref=' + parent)
        require(content.get('encoding') == 'base64', 'Unexpected existing result encoding')
        old = strict_json(base64.b64decode(content['content']), MAX_RESULT)
        for key in ('requestDigest', 'requestCommit', 'baseCommit'):
            require(old.get(key) == context[key], 'Existing branch belongs to a different request')
        require(old.get('format') == 'oncm-public-proof-result-v1' and old.get('status') in ('verified', 'failed'),
                'Unexpected existing terminal status')
        # Preserve the first verified result; failed retries can advance safely.
        if old['status'] == 'verified':
            return parent
        require(old.get('runId') == context['runId'], 'Conflicting workflow run for request')
        require(re.fullmatch(r'[1-9][0-9]{0,5}', str(old.get('runAttempt', ''))), 'Invalid prior attempt')
        if int(old['runAttempt']) >= int(context['runAttempt']):
            return parent
    payload = json.dumps(result, indent=2).encode() + b'\n'
    require(len(payload) <= MAX_RESULT, 'Public result size limit')
    files = {'result.json': payload}
    if receipt is not None:
        files['receipt.bin'] = receipt
        files['certificate.bin'] = bytes.fromhex(result['proof']['certificate'][2:])
    tree = []
    for filename, data in files.items():
        blob = api.call('POST', '/git/blobs', {'content': base64.b64encode(data).decode(), 'encoding': 'base64'})
        require(HEX40.fullmatch(blob.get('sha', '')), 'Invalid published blob ID')
        tree.append({'path': filename, 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
    created_tree = api.call('POST', '/git/trees', {'tree': tree})
    require(HEX40.fullmatch(created_tree.get('sha', '')), 'Invalid published tree ID')
    commit = api.call('POST', '/git/commits', {
        'message': 'Publish ' + result['status'] + ' proof request ' + context['requestDigest'],
        'tree': created_tree['sha'], 'parents': [parent] if parent else []})
    require(HEX40.fullmatch(commit.get('sha', '')), 'Invalid published commit ID')
    if parent is None:
        api.call('POST', '/git/refs', {'ref': 'refs/' + branch, 'sha': commit['sha']})
    else:
        api.call('PATCH', '/git/refs/' + branch, {'sha': commit['sha'], 'force': False})
    return commit['sha']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--public', type=Path, required=True)
    parser.add_argument('--work', type=Path, required=True)
    args = parser.parse_args()
    context = git_context(args.request)
    request = None
    try:
        request = validate_request(args.request.read_bytes())
    except Exception:
        pass  # A valid branch can publish that its data request was rejected.
    receipt = None
    result = terminal(context, request, error='Workflow ended without a verified result')
    result_file = args.public / 'result.json'
    try:
        if result_file.exists():
            require(not result_file.is_symlink() and result_file.stat().st_size <= MAX_RESULT, 'Unsafe result file')
            result = strict_json(result_file.read_bytes(), MAX_RESULT)
            if result.get('status') == 'verified':
                receipt_file = args.public / 'receipt.bin'
                require(not receipt_file.is_symlink() and receipt_file.stat().st_size <= MAX_PUBLIC_RECEIPT,
                        'Unsafe receipt file')
                receipt = receipt_file.read_bytes()
            validate_terminal(result, context, request, receipt)
            if receipt is not None:
                env = dict(os.environ, RISC0_DEV_MODE='', RAYON_NUM_THREADS='2')
                env.pop('GITHUB_TOKEN', None)
                # Download only the original verifier executable, no Docker pull/prove.
                subprocess.run([sys.executable, str(HERE / 'prepare.py'), '--work', str(args.work),
                                '--verifier-only'], check=True, timeout=180, env=env)
                verify_original(receipt, args.work, env, args.work / 'bin/r0vm', request['body']['imageId'][2:])
    except Exception:
        receipt = None
        result = terminal(context, request, error='Publisher rejected the proof artifact or original verification failed')
    validate_terminal(result, context, request, receipt)
    commit = publish(GitHub(os.environ.get('GITHUB_TOKEN')), context, result, receipt)
    print(json.dumps({'status': result['status'], 'resultCommit': commit,
                      'resultUrl': 'https://raw.githubusercontent.com/' + REPOSITORY + '/' + commit + '/result.json'}))


if __name__ == '__main__':
    main()
