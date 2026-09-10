#!/usr/bin/env python3
"""Verify the pinned catalogue; --restore fetches missing upstream files only.

No build, import execution, dependency installation, branch update, or proving.
Changing the snapshot is a reviewed manifest change, never a silent refresh.
"""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--restore', action='store_true')
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    catalog = json.loads((base / 'catalog.json').read_text())
    commit = catalog['snapshot']['commit']
    if len(commit) != 40 or any(c not in '0123456789abcdef' for c in commit):
        raise ValueError('Expected an immutable Git commit')
    total = 0
    for record in catalog['files']:
        path = (base / record['path']).resolve()
        if not path.is_relative_to(base) or path == base:
            raise ValueError('Path escapes catalogue')
        if record['bytes'] > 1024 * 1024:
            raise ValueError('File exceeds 1 MiB budget')
        if not path.exists() and args.restore and 'originPath' in record:
            expected = f'https://raw.githubusercontent.com/argumentcomputer/ix/{commit}/{record["originPath"]}'
            if record['url'] != expected:
                raise ValueError('Unexpected upstream URL')
            with urllib.request.urlopen(expected, timeout=15) as response:
                data = response.read(record['bytes'] + 1)
            if len(data) != record['bytes'] or hashlib.sha256(data).hexdigest() != record['sha256']:
                raise ValueError('Downloaded bytes do not match immutable pin')
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
                temp = Path(stream.name)
                stream.write(data)
            temp.replace(path)
        if path.stat().st_size != record['bytes']:
            raise ValueError(f'Size mismatch: {record["path"]}')
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != record['sha256']:
            raise ValueError(f'SHA256 mismatch: {record["path"]}')
        total += len(data)
        if total > 1024 * 1024:
            raise ValueError('Catalogue exceeds 1 MiB total budget')
    # Verify exact extraction independently of the generated file's hash.
    for entry in catalog['entries']:
        original = (base / 'upstream' / entry['origin']['path']).read_text()
        start, end = entry['origin']['lines']
        expected = ''.join(original.splitlines(keepends=True)[start - 1:end])
        extracted = (base / entry['package']['sourcePath']).read_text()
        if entry['slug'] != 'nat-reflexivity':
            expected = 'namespace Tests.Ix.Kernel.TutorialDefs\n\n' + expected + '\nend Tests.Ix.Kernel.TutorialDefs\n'
        if extracted != expected:
            raise ValueError(f'Non-exact extraction: {entry["slug"]}')
    print(json.dumps({'status': 'source-integrity-verified', 'files': len(catalog['files']), 'bytes': total, 'entries': len(catalog['entries'])}))


if __name__ == '__main__':
    main()
