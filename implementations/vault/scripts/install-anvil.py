#!/usr/bin/env python3
"""Install only the official, checksum-pinned macOS ARM Anvil binary. No build."""
import hashlib
import json
import os
from pathlib import Path
import platform
import tarfile
import urllib.request

VERSION = '1.7.1'
ASSET = 'foundry_v1.7.1_darwin_arm64.tar.gz'
URL = f'https://github.com/foundry-rs/foundry/releases/download/v{VERSION}/{ASSET}'
SHA256 = 'eacdc67718fac857cad9e19c7f6729dd80de731d09df81856391d093cfcab547'
ASSET_BYTES = 88161744
MAX_BYTES = 100_000_000
ROOT = Path(__file__).resolve().parent.parent
DIRECTORY = ROOT / '.toolchain'
TARGET = DIRECTORY / 'anvil'

if platform.system() != 'Darwin' or platform.machine() != 'arm64':
    raise SystemExit('This installer is pinned to macOS ARM64; configure an official compatible Anvil explicitly on another platform.')
DIRECTORY.mkdir(exist_ok=True)
if TARGET.exists():
    existing_hash = hashlib.sha256()
    with TARGET.open('rb') as source:
        while chunk := source.read(256 * 1024):
            existing_hash.update(chunk)
    if existing_hash.hexdigest() == '5c9f9aad323062b1c0421a63595741430acaea150da3611e38c45071e4cf4e28':
        print(f'Pinned Anvil {VERSION} is already installed: {TARGET}')
        raise SystemExit(0)
archive = DIRECTORY / (ASSET + '.partial')
temporary = DIRECTORY / 'anvil.partial'
try:
    digest = hashlib.sha256()
    count = 0
    request = urllib.request.Request(URL, headers={'User-Agent': 'oncm-vault-anvil-installer'})
    with urllib.request.urlopen(request, timeout=30) as response, archive.open('wb') as destination:
        length = response.headers.get('Content-Length')
        if length and int(length) > MAX_BYTES:
            raise RuntimeError('Official binary archive exceeds the 100 MB cap')
        while chunk := response.read(256 * 1024):
            count += len(chunk)
            if count > MAX_BYTES:
                raise RuntimeError('Official binary archive exceeds the 100 MB cap')
            digest.update(chunk)
            destination.write(chunk)
    if count != ASSET_BYTES or digest.hexdigest() != SHA256:
        raise RuntimeError('Official release size or SHA-256 does not match the pinned manifest')
    extracted = False
    with tarfile.open(archive, 'r|gz') as package:
        for member in package:
            if member.name not in ('anvil', './anvil'):
                continue
            if not member.isfile() or member.size > MAX_BYTES:
                raise RuntimeError('Unexpected Anvil archive entry')
            with package.extractfile(member) as source, temporary.open('wb') as destination:
                while chunk := source.read(256 * 1024):
                    destination.write(chunk)
            extracted = True
            break
    if not extracted:
        raise RuntimeError('Official archive did not contain anvil')
    temporary.chmod(0o755)
    os.replace(temporary, TARGET)
    binary_hash = hashlib.sha256()
    with TARGET.open('rb') as source:
        while chunk := source.read(256 * 1024):
            binary_hash.update(chunk)
    (DIRECTORY / 'anvil-provenance.json').write_text(json.dumps({
        'version': VERSION, 'platform': 'darwin-arm64', 'release': f'https://github.com/foundry-rs/foundry/releases/tag/v{VERSION}',
        'asset': URL, 'assetBytes': count, 'assetSha256': SHA256,
        'binarySha256': binary_hash.hexdigest(), 'binaryBytes': TARGET.stat().st_size,
        'license': 'MIT OR Apache-2.0', 'installedOnly': ['anvil'],
    }, indent=2) + '\n')
    print(f'Installed checksum-verified Anvil {VERSION}: {TARGET}')
finally:
    archive.unlink(missing_ok=True)
    temporary.unlink(missing_ok=True)
