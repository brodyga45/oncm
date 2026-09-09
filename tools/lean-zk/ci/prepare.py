#!/usr/bin/env python3
"""Download only pinned official release binaries/container; no source build."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import urllib.request

HERE = Path(__file__).resolve().parent


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--work', type=Path, required=True)
    work = args.parse_args().work.resolve()
    if platform.system() != 'Linux' or platform.machine() != 'x86_64':
        raise RuntimeError('This prepared CI recipe requires Linux x86_64')
    memory = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines()
                      if line.startswith('MemTotal:'))) * 1024
    if memory < 14 * 1024 ** 3:
        raise RuntimeError('Public 16 GB runner required; private 8 GB runner is insufficient')
    docker = shutil.which('docker')
    if not docker:
        raise RuntimeError('Official GitHub Ubuntu runner must provide Docker')
    info = json.loads(subprocess.check_output([docker, 'info', '--format', '{{json .}}']))
    if info.get('CgroupDriver') != 'systemd' or str(info.get('CgroupVersion')) != '2':
        raise RuntimeError('Shared CI budget requires Docker systemd driver and cgroup v2')
    if any('rootless' in item for item in info.get('SecurityOptions', [])):
        raise RuntimeError('Shared CI slice requires the system Docker daemon')
    controllers = Path('/sys/fs/cgroup/cgroup.controllers').read_text().split()
    if not {'cpu', 'memory'}.issubset(controllers):
        raise RuntimeError('Require cgroup-v2 CPU and memory controllers')
    work.mkdir(parents=True, exist_ok=True)
    (HERE / 'docker').chmod(0o755)
    if shutil.disk_usage(work).free < 9 * 1024 ** 3:
        raise RuntimeError('Require 9 GiB free disk before pulling the pinned prover image')
    pins = json.loads((HERE / 'pins.json').read_text())
    (work / 'bin').mkdir(exist_ok=True)
    archive = work / 'r0vm.tgz'
    with urllib.request.urlopen(pins['r0vm']['url'], timeout=60) as response, archive.open('wb') as out:
        count = 0
        while chunk := response.read(1024 * 1024):
            count += len(chunk)
            if count > pins['r0vm']['archiveBytes']:
                raise RuntimeError('Release asset larger than pinned size')
            out.write(chunk)
    if archive.stat().st_size != pins['r0vm']['archiveBytes']:
        raise RuntimeError('Release asset size mismatch')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != pins['r0vm']['sha256']:
        raise RuntimeError('Release asset SHA256 mismatch')
    with tarfile.open(archive) as package:
        candidates = [member for member in package.getmembers()
                      if member.isfile() and Path(member.name).name == 'r0vm']
        if len(candidates) != 1 or candidates[0].size > 600 * 1024 ** 2:
            raise RuntimeError('Unexpected release archive layout')
        with package.extractfile(candidates[0]) as source, (work / 'bin/r0vm').open('wb') as out:
            shutil.copyfileobj(source, out)
    (work / 'bin/r0vm').chmod(0o755)
    archive.unlink()
    subprocess.run([docker, 'pull', '--platform=linux/amd64', pins['docker']['pinnedImage']], check=True)
    image = json.loads(subprocess.check_output([docker, 'image', 'inspect', pins['docker']['pinnedImage']]))[0]
    if image['Architecture'] != 'amd64':
        raise RuntimeError('Wrong Docker image architecture')
    version = subprocess.check_output([str(work / 'bin/r0vm'), '--version'], text=True).strip()
    if version != 'risc0-r0vm 3.0.6' and version != 'r0vm 3.0.6':
        raise RuntimeError('Unexpected original r0vm version: ' + version)
    if shutil.disk_usage(work).free < 2 * 1024 ** 3:
        raise RuntimeError('Require 2 GiB working disk after pulling image')
    record = {'r0vmVersion': version, 'r0vmSha256': hashlib.sha256((work / 'bin/r0vm').read_bytes()).hexdigest(),
              'dockerBinary': docker, 'dockerImageId': image['Id'], 'dockerImageSize': image['Size'],
              'dockerCgroupDriver': info['CgroupDriver'], 'dockerCgroupVersion': info['CgroupVersion'],
              'systemdVersion': subprocess.check_output(['systemctl', '--version'], text=True).splitlines()[0],
              'pins': pins, 'freeDiskAfterPull': shutil.disk_usage(work).free, 'memoryTotal': memory}
    (work / 'environment.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record, indent=2))


if __name__ == '__main__':
    main()
