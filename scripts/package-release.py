#!/usr/bin/env python3
"""Create portable kits from pinned official Node distributions, never from private runtime data."""
import argparse, hashlib, json, os, stat, tarfile, urllib.request, zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
PIN = json.loads((ROOT / 'runtime-sources.json').read_text())
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
DIRECTORIES = ['src', 'public', 'scripts', 'docs', 'site', 'test']
FILES = ['package.json', 'package-lock.json', 'README.md', 'AGENTS.md', 'LICENSE', 'SECURITY.md', 'CONTRIBUTING.md', 'compose.yaml', 'Dockerfile', '.dockerignore', 'runtime-sources.json', '启动大肥鱼.command', '启动大肥鱼.cmd']

def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()

def safe(name):
    parts = PurePosixPath(name).parts
    if name.startswith('/') or '..' in parts:
        raise ValueError('Unsafe archive entry')
    return parts

def add_bytes(archive, name, data, mode=0o644):
    info = zipfile.ZipInfo(name, (2026, 11, 1, 0, 0, 0))
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | mode) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, data)

def build(platform, cache, out):
    pin = PIN['platforms'][platform]
    runtime = cache / pin['file']
    if not runtime.exists():
        temp = runtime.with_suffix(runtime.suffix + '.partial')
        with urllib.request.urlopen(pin['url'], timeout=60) as source, temp.open('wb') as dest:
            import shutil
            shutil.copyfileobj(source, dest)
        temp.replace(runtime)
    if digest(runtime) != pin['sha256']:
        raise ValueError(f'{pin["file"]} SHA-256 mismatch; do not use or publish it')
    result = out / f'dafeiyu-{VERSION}-{platform}.zip'
    prefix = f'dafeiyu-{VERSION}/'
    with zipfile.ZipFile(result, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        paths = [ROOT / name for name in FILES]
        for directory in DIRECTORIES:
            paths += [p for p in (ROOT / directory).rglob('*') if p.is_file() and not p.is_symlink() and p.name != '.DS_Store' and '__pycache__' not in p.parts]
        # ws is pure JS; install scripts and optional native add-ons are deliberately excluded.
        ws = ROOT / 'node_modules/ws'
        if not (ws / 'package.json').exists():
            raise ValueError('Run npm ci --ignore-scripts before packaging')
        paths += [p for p in ws.rglob('*') if p.is_file() and not p.is_symlink()]
        for path in sorted(paths):
            add_bytes(archive, prefix + path.relative_to(ROOT).as_posix(), path.read_bytes(), 0o755 if path.suffix == '.command' else 0o644)
        manifest = json.loads((ROOT / 'version-manifest.json').read_text())
        manifest.update(artifacts=[], packaged=True, releaseManifestUrl='https://raw.githubusercontent.com/youseff37/echo-companion/main/version-manifest.json')
        add_bytes(archive, prefix + 'version-manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2).encode())
        if platform == 'macos-arm64':
            with tarfile.open(runtime) as source:
                for member in source:
                    parts = safe(member.name)[1:]
                    relative = '/'.join(parts)
                    if not member.isfile() or not (relative == 'bin/node' or relative.startswith('lib/node_modules/npm/') or relative in ['LICENSE', 'README.md', 'CHANGELOG.md']):
                        continue
                    add_bytes(archive, prefix + '.bundled/' + relative, source.extractfile(member).read(), member.mode & 0o777)
            for command, script in [('npm', 'npm-cli.js'), ('npx', 'npx-cli.js')]:
                wrapper = f'#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/../lib/node_modules/npm/bin/{script}" "$@"\n'
                add_bytes(archive, prefix + '.bundled/bin/' + command, wrapper.encode(), 0o755)
        else:
            with zipfile.ZipFile(runtime) as source:
                for name in source.namelist():
                    if name.endswith('/'):
                        continue
                    relative = '/'.join(safe(name)[1:])
                    add_bytes(archive, prefix + '.bundled/' + relative, source.read(name), 0o755 if relative.endswith('.exe') else 0o644)
    checksum = digest(result)
    result.with_suffix('.zip.sha256').write_text(checksum + '  ' + result.name + '\n')
    print(json.dumps({'platform': platform, 'file': str(result), 'sha256': checksum, 'bytes': result.stat().st_size}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--platform', choices=list(PIN['platforms']), required=True)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--out-dir', type=Path, required=True)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    build(args.platform, args.cache, args.out_dir)
