#!/usr/bin/env python3
"""Build and exercise the trusted local starter-ui module without personal caches."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import time
import zipfile
import xml.etree.ElementTree as ET

ZERO = Path(__file__).resolve().parent.parent
VERSION = '0.1.0-prototype.1'
COORDINATE = 'ca.codepet.zero:starter-ui:' + VERSION
NAMES = ('StartScreen', 'Hud', 'ScoreDisplay')
PACKAGE = 'zero/starterui/'
ARTIFACT = 'starter-ui-' + VERSION
NS = {'m': 'http://maven.apache.org/POM/4.0.0'}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(argv, cwd, log, env=None, marker=None):
    result = subprocess.run([str(a) for a in argv], cwd=cwd, env=env,
                            capture_output=True, text=True, timeout=180)
    log.write_text(result.stdout + '\n' + result.stderr)
    if result.returncode or (marker and marker not in result.stdout):
        raise RuntimeError(f'Check failed; see {log}')
    print(f'Passed {log.name}', flush=True)


def archive(path, expected):
    with zipfile.ZipFile(path) as jar:
        files = [name for name in jar.namelist() if not name.endswith('/')]
        if len(files) != len(set(files)) or set(files) != expected:
            raise RuntimeError(f'Unexpected archive contents in {path}: {files}')
        return {name: jar.read(name) for name in files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-from', type=Path,
                        help='Copy an existing trusted Maven cache into the isolated evidence cache.')
    parser.add_argument('--output', type=Path, default=ZERO / '.verification/starter-ui',
                        help='Fresh evidence directory; existing paths are refused.')
    args = parser.parse_args()
    module = ZERO / 'libraries/starter-ui'
    source_paths = [module / 'pom.xml', module / 'LICENSE', module / 'README.md', module / 'API.md',
                    module / 'checks/StarterUiCheck.java', module / 'src/main/resources/META-INF/LICENSE']
    source_paths += [module / ('src/main/java/' + PACKAGE + name + '.java') for name in NAMES]
    for path in source_paths:
        if path.is_symlink() or path.resolve().is_relative_to(module.resolve()) is False or not path.is_file():
            raise RuntimeError(f'Missing or indirect module source: {path}')
    for path in module.rglob('*'):
        if path.is_symlink():
            raise RuntimeError(f'Symlink module input refused: {path}')
    pom = ET.parse(module / 'pom.xml').getroot()
    coordinate = ':'.join(pom.findtext('m:' + field, namespaces=NS) or ''
                          for field in ('groupId', 'artifactId', 'version'))
    if coordinate != COORDINATE:
        raise RuntimeError('Unexpected starter-ui coordinate')
    dependencies = pom.findall('m:dependencies/m:dependency', NS)
    declared = [(dep.findtext('m:groupId', namespaces=NS), dep.findtext('m:artifactId', namespaces=NS),
                 dep.findtext('m:version', namespaces=NS)) for dep in dependencies]
    if declared != [('org.openjfx', 'javafx-controls', '${javafx.version}')]:
        raise RuntimeError('Only the pinned JavaFX controls dependency is permitted')
    if pom.findtext('m:properties/m:javafx.version', namespaces=NS) != '21.0.12':
        raise RuntimeError('JavaFX version drift')
    if pom.findtext('m:properties/m:maven.compiler.release', namespaces=NS) != '17':
        raise RuntimeError('Java release drift')
    license_bytes = (module / 'LICENSE').read_bytes()
    if license_bytes != (ZERO / 'LICENSE').read_bytes() or license_bytes != source_paths[5].read_bytes():
        raise RuntimeError('MIT notice drift')
    # Namespace is the sole source change from the separate educational copies.
    for name in NAMES:
        origin = 'shared' if name == 'ScoreDisplay' else 'composition-shared'
        expected = b'package zero.starterui;\n\n' + (ZERO / f'student-template/examples/{origin}/{name}.java').read_bytes()
        if (module / ('src/main/java/' + PACKAGE + name + '.java')).read_bytes() != expected:
            raise RuntimeError(f'Educational behavior/source drift: {name}')
    output = args.output.absolute()
    # mkdir(exist_ok=False) also refuses files and dangling symlinks.
    output.mkdir(parents=True, exist_ok=False)
    output = output.resolve()
    cache = output / 'cache'
    if args.cache_from:
        shutil.copytree(args.cache_from.resolve(strict=True), cache)
    settings = output / 'settings.xml'
    settings.write_text('<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"/>\n')
    wrapper = ZERO / 'student-template' / ('mvnw.cmd' if os.name == 'nt' else 'mvnw')
    common = [wrapper, '-B', '-s', settings, '-gs', settings, f'-Dmaven.repo.local={cache}']
    started = time.monotonic()
    hashes = {str(path.relative_to(ZERO)): digest(path) for path in source_paths}
    source_digest = hashlib.sha256(json.dumps(hashes, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    metadata = 'META-INF/maven/ca.codepet.zero/starter-ui/'
    binary_files = {'META-INF/MANIFEST.MF', 'META-INF/LICENSE', metadata + 'pom.xml', metadata + 'pom.properties'}
    binary_files.update(PACKAGE + name + '.class' for name in NAMES)
    source_files = {'META-INF/MANIFEST.MF', 'META-INF/LICENSE', metadata + 'pom.xml', metadata + 'pom.properties'}
    source_files.update(PACKAGE + name + '.java' for name in NAMES)
    artifacts = output / 'artifacts'
    artifacts.mkdir()
    builds = []
    for number in (1, 2):
        build = output / f'build-{number}'
        shutil.copytree(module, build, ignore=shutil.ignore_patterns('target'))
        run(common + ['-f', build / 'pom.xml', 'clean', 'verify'], ZERO, output / f'build-{number}.log')
        binary = build / 'target' / (ARTIFACT + '.jar')
        sources = build / 'target' / (ARTIFACT + '-sources.jar')
        for jar, expected_files in [(binary, binary_files), (sources, source_files)]:
            entries = archive(jar, expected_files)
            if entries['META-INF/LICENSE'] != license_bytes or entries[metadata + 'pom.xml'] != (module / 'pom.xml').read_bytes():
                raise RuntimeError('Archive license/POM source binding failed')
            if jar == sources:
                for name in NAMES:
                    if entries[PACKAGE + name + '.java'] != (module / ('src/main/java/' + PACKAGE + name + '.java')).read_bytes():
                        raise RuntimeError('Sources JAR does not contain canonical source')
        builds.append({'binary': digest(binary), 'sources': digest(sources)})
        if number == 1:
            shutil.copy2(binary, artifacts / binary.name)
            shutil.copy2(sources, artifacts / sources.name)
            shutil.copy2(module / 'pom.xml', artifacts / (ARTIFACT + '.pom'))
    if builds[0] != builds[1]:
        raise RuntimeError('Two clean builds were not reproducible')
    # Re-check exact source bytes after compilation before install/consumer execution.
    if hashes != {str(path.relative_to(ZERO)): digest(path) for path in source_paths}:
        raise RuntimeError('Source changed during verification')
    run(common + ['-f', output / 'build-1/pom.xml', 'install', '-DskipTests'], ZERO, output / 'install.log')
    installed = cache / 'ca/codepet/zero/starter-ui' / VERSION / (ARTIFACT + '.jar')
    installed_sources = installed.with_name(ARTIFACT + '-sources.jar')
    installed_pom = installed.with_suffix('.pom')
    if digest(installed) != builds[0]['binary'] or digest(installed_sources) != builds[0]['sources'] or installed_pom.read_bytes() != (module / 'pom.xml').read_bytes():
        raise RuntimeError('Installed artifact drift')
    consumer = output / 'finite-check'
    java = consumer / 'src/main/java'
    java.mkdir(parents=True)
    shutil.copy2(module / 'checks/StarterUiCheck.java', java / 'StarterUiCheck.java')
    check_pom = (ZERO / 'student-template/pom.xml').read_text()
    dependency = f'<dependency><groupId>ca.codepet.zero</groupId><artifactId>starter-ui</artifactId><version>{VERSION}</version></dependency>'
    (consumer / 'pom.xml').write_text(check_pom.replace('</dependencies>', dependency + '\n</dependencies>'))
    env = os.environ.copy()
    env['EXPECTED_STARTER_UI_JAR'] = str(installed)
    run(common + ['-f', consumer / 'pom.xml', '-Dapp.mainClass=StarterUiCheck', 'clean', 'compile', 'javafx:run'],
        ZERO, output / 'finite-check.log', env, 'STARTER_UI_OK')
    run(['python3', ZERO / 'scripts/verify-examples.py', '--only', 'packaged-study', 'packaged-game',
         '--starter-ui-repository', cache, '--maven-settings', settings], ZERO, output / 'consumers.log', marker='All 2 selected GUI example checks passed')
    if hashes != {str(path.relative_to(ZERO)): digest(path) for path in source_paths}:
        raise RuntimeError('Source changed during consumer checks')
    receipt = {'schema': 1, 'status': 'local-verified', 'coordinate': COORDINATE,
               'zeroRoot': str(ZERO), 'module': 'libraries/starter-ui', 'sourceState': 'working-tree', 'sourceFiles': hashes,
               'sourceDigestSha256': source_digest, 'reproducibleBuilds': builds,
               'artifacts': {p.name: {'sha256': digest(p), 'bytes': p.stat().st_size} for p in artifacts.iterdir()},
               'installedJar': str(installed), 'checks': ['exact archives', 'canonical source binding', 'MIT notices',
               'two clean reproducible builds', 'installed JAR origin', 'finite JavaFX behavior', 'packaged-study', 'packaged-game'],
               'seconds': round(time.monotonic() - started, 2),
               'limits': ['trusted local Java execution', 'synthetic button actions', 'physical input untested',
                          'Windows/Linux untested', 'no publication or ZeroHub submission']}
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(f'STARTER_UI_VERIFIED {output / "receipt.json"}', flush=True)


if __name__ == '__main__':
    main()
