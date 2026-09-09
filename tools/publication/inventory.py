#!/usr/bin/env python3
"""Read-only publication audit. Outputs only paths, sizes, hashes and categories.

Does not stage, edit .gitignore, delete repository metadata, publish, follow
symlinks or emit matched secret values. Uses Git's own ignore interpretation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=HERE / 'local-report')
args = parser.parse_args()
OUT = args.output.resolve()
OUT.mkdir(parents=True, exist_ok=True)
def git(*argv, input=None, ok=(0,)):
    run = subprocess.run(['git', *argv], cwd=ROOT, input=input, capture_output=True)
    if run.returncode not in ok:
        raise RuntimeError('Git inventory command failed; no repository changes made')
    return run.stdout
paths = sorted(set(p.decode() for p in git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split(b'\0') if p))
ignored = set(p.decode() for p in git('-c', 'core.excludesfile=' + str(HERE / 'ignore.rules'), 'check-ignore', '--no-index', '-z', '--stdin', input=''.join(p + '\0' for p in paths).encode(), ok=(0, 1)).split(b'\0') if p)
secrets = [
    re.compile(rb'\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}'),
    re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    re.compile(rb'-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----'),
    re.compile(rb'\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}'),
    re.compile(rb'''(?i)(?:private[_-]?key|api[_-]?key|secret|token|password|mnemonic)["']?\s*(?:=|:)\s*["'][^"'\r\n]{16,}["']'''),
]
development_assignment = re.compile(rb'''(?i)(?:private[_-]?key|api[_-]?key|secret|token|password|mnemonic)["']?\s*(?:=|:)\s*["']([^"'\r\n]{16,})["']''')
known_public_mnemonic = b'test test test test test test test test test test test junk'
manifest = []
findings = {'possibleSecrets': [], 'knownPublicDevelopmentCredentials': [], 'includedOver50MB': [], 'excludedOver50MB': [], 'symlinks': [], 'directoryCandidates': [], 'nestedGitMetadata': [], 'gitlinks': [], 'changedDuringScan': [], 'excluded': sorted(ignored)}
for relative in paths:
    file = ROOT / relative
    if file.is_symlink():
        if relative not in ignored: findings['symlinks'].append(relative)
        continue
    if file.is_dir():
        findings['directoryCandidates'].append(relative)
        continue
    if not file.is_file(): continue
    before_stat = file.stat()
    size = before_stat.st_size
    if size > 50_000_000:
        findings['excludedOver50MB' if relative in ignored else 'includedOver50MB'].append(relative)
    if relative in ignored: continue
    if size > 50_000_000: continue
    digest = hashlib.sha256()
    suspected = False
    only_public_development = True
    carry = b''
    with file.open('rb') as stream:
        for part in iter(lambda: stream.read(64 * 1024), b''):
            digest.update(part)
            block = carry + part
            if any(pattern.search(block) for pattern in secrets):
                suspected = True
                values = development_assignment.findall(block)
                if any(pattern.search(block) for pattern in secrets[:-1]) or not values or any(v != known_public_mnemonic for v in values):
                    only_public_development = False
            carry = block[-1024:]
    after_stat = file.stat()
    if (before_stat.st_size, before_stat.st_mtime_ns) != (after_stat.st_size, after_stat.st_mtime_ns):
        findings['changedDuringScan'].append(relative)
        continue
    if suspected: findings['knownPublicDevelopmentCredentials' if only_public_development else 'possibleSecrets'].append(relative)
    manifest.append({'path': relative, 'bytes': size, 'sha256': digest.hexdigest()})
for raw in git('ls-files', '--stage', '-z').split(b'\0'):
    if raw.startswith(b'160000 '): findings['gitlinks'].append(raw.split(b'\t', 1)[1].decode())
prune = {'node_modules', 'target', '.jobs', '.cache', '.lake', '.toolchains', '.toolchain', '.venv', '.state', '.local'}
for base, directories, files in os.walk(ROOT, followlinks=False):
    directories[:] = [d for d in directories if d not in prune]
    if '.git' in directories:
        if Path(base) != ROOT: findings['nestedGitMetadata'].append(str((Path(base) / '.git').relative_to(ROOT)))
        directories.remove('.git')
    if '.git' in files:
        findings['nestedGitMetadata'].append(str((Path(base) / '.git').relative_to(ROOT)))
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(OUT / 'findings.json').write_text(json.dumps(findings, indent=2) + '\n')
summary = {'candidatePathsBeforeProposal': len(paths), 'includedFiles': len(manifest), 'includedBytes': sum(x['bytes'] for x in manifest), 'excludedPaths': len(ignored), 'findings': {k: v for k, v in findings.items() if k != 'excluded'}}
(OUT / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
