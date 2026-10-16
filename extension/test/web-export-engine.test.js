'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { exportForWeb, _test } = require('../src/web-export');
const { zipFiles, crc32 } = require('../src/web-export/zip');
const { generateProject } = require('../src/web-export/project');
const lock = require('../src/web-export/toolchain-lock.json');
async function temporary(t) {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'zero-web-test-'))
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test('WebFX artifacts use fixed timestamp coordinates and checked SHA-256 values', () => {
  assert.equal(lock.webfx.length, 37);
  for (const artifact of lock.webfx) {
    assert.match(artifact.version, /^0\.1\.0-\d{8}\.\d{6}-\d+$/);
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.ok(artifact.url.endsWith(artifact.file));
  }
});
test('ZIP contains index.html at root with valid CRC and deflated bytes', () => {
  const content = Buffer.from('<!doctype html>\nHello');
  const zip = zipFiles([{ path: 'index.html', bytes: content }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(14), crc32(content));
  const nameLength = zip.readUInt16LE(26);
  assert.equal(zip.subarray(30, 30 + nameLength).toString(), 'index.html');
  const length = zip.readUInt32LE(18);
  assert.deepEqual(
    zlib.inflateRawSync(
      zip.subarray(30 + nameLength, 30 + nameLength + length)
    ),
    content
  );
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});
test('source digest includes paths, content and deterministic ordering', () => {
  const a = { path: 'Main.java', bytes: Buffer.from('class Main {}') },
    b = { path: 'x.png', bytes: Buffer.from([0, 1]) };
  assert.equal(_test.sourceDigest([a, b]), _test.sourceDigest([b, a]));
  assert.notEqual(
    _test.sourceDigest([a]),
    _test.sourceDigest([{ ...a, path: 'Other.java' }])
  );
});
test('GWT diagnostics refer to original source and remove package-line offset', () => {
  const log =
    "[ERROR] Errors in 'file:/cache/src/main/java/zero/exported/Main.java'\n[ERROR] Line 12: broken";
  const mapped = _test.mapDiagnostics(log, {
    'zero/exported/Main.java': { originalPath: 'Main.java', lineOffset: 1 }
  });
  assert.match(mapped, /src\/main\/java\/Main.java/);
  assert.match(mapped, /Line 11: broken/);
});
test('escaping source symlinks are rejected without reading or changing sources', async (t) => {
  const root = await temporary(t);
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'secret'), 'private');
  await fs.symlink(
    path.join(root, 'secret'),
    path.join(root, 'src', 'bad.java')
  );
  await assert.rejects(
    _test.readTree(path.join(root, 'src')),
    /symbolic links/
  );
  assert.equal(await fs.readFile(path.join(root, 'secret'), 'utf8'), 'private');
});
test('generated project uses pinned plugins and relative GWT directory overrides in spaced paths', async (t) => {
  const root = path.join(await temporary(t), 'Build Root With Spaces');
  await generateProject(
    root,
    {
      sources: { 'demo/Main.java': 'package demo; class Main {}' },
      mainClass: 'demo.Main'
    },
    [{ path: 'images/bird.png', bytes: Buffer.from([1, 2]) }],
    path.join(root, 'artifacts')
  );
  const pom = await fs.readFile(path.join(root, 'pom.xml'), 'utf8');
  assert.ok(!pom.includes('SNAPSHOT'));
  assert.ok(!pom.includes('<parent>'));
  assert.ok(pom.includes('<zero.artifactRoot>' + path.join(root, 'artifacts') + '</zero.artifactRoot>'));
  assert.match(pom, /<version>1\.2\.0<\/version>/);
  assert.match(pom, /<version>3\.1\.0<\/version>/);
  assert.match(pom, /<compilerArgs><arg>-war<\/arg><arg>\$\{project\.build\.finalName\}<\/arg><arg>-workDir<\/arg><arg>gwt\/work<\/arg><arg>-deploy<\/arg><arg>gwt\/deploy<\/arg><\/compilerArgs>/);

  assert.deepEqual(
    await fs.readFile(
      path.join(root, 'src/main/resources/public/images/bird.png')
    ),
    Buffer.from([1, 2])
  );
  const html = await fs.readFile(
    path.join(root, 'src/main/resources/public/index.html'),
    'utf8'
  );
  assert.match(html, /src="\.\/zero_web\.nocache\.js"/);
});
test(
  'failed Maven status stays failed even if its output says BUILD SUCCESS',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = await temporary(t);
    const wrapper = path.join(root, 'mvnw');
    await fs.writeFile(wrapper, '#!/bin/sh\necho BUILD SUCCESS\nexit 7\n', {
      mode: 0o755
    });
    const result = await _test.runMaven({
      wrapper,
      projectRoot: root,
      buildRoot: root,
      cacheRoot: path.join(root, 'cache'),
      onProgress: () => {}
    });
    assert.equal(result.code, 7);
    assert.match(result.output, /BUILD SUCCESS/);
  }
);
test(
  'Maven cache/settings arguments stay private and inherited override hooks are cleared',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = await temporary(t);
    const wrapper = path.join(root, 'mvnw');
    await fs.writeFile(
      wrapper,
      '#!/bin/sh\nprintf "%s\\n" "$@"\nprintf "cache=%s args=%s opts=%s\\n" "$MAVEN_USER_HOME" "$MAVEN_ARGS" "$MAVEN_OPTS"\n',
      { mode: 0o755 }
    );
    const result = await _test.runMaven({
      wrapper,
      projectRoot: root,
      buildRoot: root,
      cacheRoot: path.join(root, 'cache'),
      env: {
        MAVEN_ARGS: '-Dunexpected=true',
        MAVEN_OPTS: '-Duser.home=/private-data'
      },
      onProgress: () => {}
    });
    assert.equal(result.code, 0);
    assert.match(result.output, /-Dmaven\.repo\.local=.*\/cache\/repository/);
    assert.match(result.output, /-s\n.*settings.xml\n-gs/);
    assert.ok(!result.output.includes('private-data'));
    assert.ok(!result.output.includes('unexpected'));
  }
);
test(
  'cancellation stops Maven and releases its result',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = await temporary(t);
    const wrapper = path.join(root, 'mvnw');
    await fs.writeFile(wrapper, '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
    const controller = new AbortController();
    const running = _test.runMaven({
      wrapper,
      projectRoot: root,
      buildRoot: root,
      cacheRoot: path.join(root, 'cache'),
      signal: controller.signal,
      onProgress: () => {}
    });
    setTimeout(() => controller.abort(), 50);
    const result = await running;
    assert.notEqual(result.code, 0);
  }
);
test('invalid project cannot overwrite a previous exported site or student Java', async (t) => {
  const root = await temporary(t);
  await fs.mkdir(path.join(root, 'src/main/java'), { recursive: true });
  await fs.mkdir(path.join(root, '.zero/web-export/site'), { recursive: true });
  await fs.mkdir(path.join(root, '.mvn/wrapper'), { recursive: true });
  const source = 'public class Main {}\n';
  await fs.writeFile(path.join(root, 'src/main/java/Main.java'), source);
  await fs.writeFile(
    path.join(root, 'pom.xml'),
    '<project><dependencies><dependency><groupId>private.example</groupId></dependency></dependencies></project>'
  );
  await fs.writeFile(
    path.join(root, '.zero/web-export/site/index.html'),
    'previous success'
  );
  await assert.rejects(
    exportForWeb({
      projectRoot: root,
      cacheRoot: path.join(path.dirname(root), path.basename(root) + '-cache')
    }),
    /Unsupported browser dependency/
  );
  assert.equal(
    await fs.readFile(
      path.join(root, '.zero/web-export/site/index.html'),
      'utf8'
    ),
    'previous success'
  );
  assert.equal(
    await fs.readFile(path.join(root, 'src/main/java/Main.java'), 'utf8'),
    source
  );
  await fs.rm(path.join(path.dirname(root), path.basename(root) + '-cache'), {
    recursive: true,
    force: true
  });
});

test('missing compiler output cannot reuse an old successful site', () => {
  assert.throws(() => _test.validateSite([]), /complete fresh app/);
  assert.throws(
    () =>
      _test.validateSite([{ path: 'index.html', bytes: Buffer.from('old') }]),
    /complete fresh app/
  );
  assert.throws(
    () =>
      _test.validateSite([
        { path: 'index.html', bytes: Buffer.from('old') },
        { path: 'zero_web.nocache.js', bytes: Buffer.alloc(0) },
        { path: 'hash.cache.js', bytes: Buffer.from('code') }
      ]),
    /complete fresh app/
  );
});

test('Windows batch arguments reject expansion and control characters and quote spaces', () => {
  for (const character of ['%', '!', '&', '|', '<', '>', '^', '"', '\n', '\r'])
    assert.throws(
      () =>
        _test.processSpecification(
          'C:\\Zero\\mvnw.cmd',
          ['C:\\student' + character + 'folder'],
          'win32'
        ),
      /shell control/
    );
  const result = _test.processSpecification(
    'C:\\My Zero\\mvnw.cmd',
    ['-f', 'C:\\My Project\\pom.xml'],
    'win32'
  );
  assert.equal(result.command, 'cmd.exe');
  assert.deepEqual(result.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(
    result.args[3],
    '""C:\\My Zero\\mvnw.cmd" "-f" "C:\\My Project\\pom.xml""'
  );
});

test('JavaFX control emulation, peers, registry and scrolling are locked and exposed to GWT', async () => {
  for (const name of [
    'webfx-kit-javafxcontrols-emul',
    'webfx-kit-javafxcontrols-peers-base',
    'webfx-kit-javafxcontrols-peers-elemental2',
    'webfx-kit-javafxcontrols-registry-elemental2',
    'webfx-kit-perfectscrollbar-elemental2-gwt-j2cl'
  ])
    assert.ok(
      lock.webfx.some((a) => a.artifactId === name),
      name
    );
  const module = await fs.readFile(
    path.join(__dirname, '../src/web-export/template/module.gwt.xml'),
    'utf8'
  );
  for (const source of [
    'javafx/scene/control',
    'javafx/scene/control/skin',
    'dev/webfx/kit/mapper/peers/javafxcontrols/base',
    'dev/webfx/kit/mapper/peers/javafxcontrols/elemental2/html',
    'dev/webfx/kit/registry/javafxcontrols',
    'dev/webfx/kit/perfectscrollbar/elemental2'
  ])
    assert.ok(module.includes(`<source path="${source}"/>`), source);
  assert.ok(
    module.includes(
      '<public path="" includes="dev/webfx/kit/perfectscrollbar/"/>'
    )
  );
  const css = await fs.readFile(
    path.join(__dirname, '../src/web-export/template/main.css'),
    'utf8'
  );
  assert.match(css, /webfx-kit-javafxcontrols-web/);
});
test('edited Maven wrappers and duplicate properties cannot fabricate a successful build', async (t) => {
  const root = await temporary(t), project = path.join(root, 'student'), cache = path.join(root, 'cache');
  await fs.mkdir(path.join(project, 'src/main/java'), { recursive: true });
  await fs.mkdir(path.join(project, '.mvn/wrapper'), { recursive: true });
  await fs.mkdir(path.join(project, '.zero/web-export/site'), { recursive: true });
  await fs.writeFile(path.join(project, 'src/main/java/Main.java'), 'public class Main {}');
  await fs.writeFile(path.join(project, 'pom.xml'), '<project/>');
  await fs.writeFile(path.join(project, '.zero/web-export/site/index.html'), 'previous success');
  const wrapperName = process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw';
  const canonical = path.resolve(__dirname, '../../student-template');
  const properties = await fs.readFile(path.join(canonical, '.mvn/wrapper/maven-wrapper.properties'));
  await fs.writeFile(path.join(project, '.mvn/wrapper/maven-wrapper.properties'), properties);
  await fs.writeFile(path.join(project, wrapperName), '#!/bin/sh\necho BUILD SUCCESS\n', { mode: 0o755 });
  const options = { projectRoot: project, cacheRoot: cache };
  await assert.rejects(exportForWeb(options), /reviewed pinned Maven wrapper/);
  await fs.copyFile(path.join(canonical, wrapperName), path.join(project, wrapperName));
  await fs.appendFile(path.join(project, '.mvn/wrapper/maven-wrapper.properties'), '\ndistributionUrl=https://example.invalid/other.zip\n');
  await assert.rejects(exportForWeb(options), /reviewed pinned Maven wrapper/);
  assert.equal(await fs.readFile(path.join(project, '.zero/web-export/site/index.html'), 'utf8'), 'previous success');
  assert.equal((await fs.readdir(path.join(cache, 'logs'))).length, 1);
  assert.deepEqual(await fs.readdir(path.join(cache, 'locks')), []);
});
test('pinned upstream mouse adapter uses standard DOM button masks in GWT super-source', async (t) => {
  const root = await temporary(t);
  await generateProject(
    root,
    {
      sources: { 'demo/Main.java': 'package demo; class Main{}' },
      mainClass: 'demo.Main'
    },
    [],
    path.join(root, 'artifacts')
  );
  const source = await fs.readFile(
    path.join(
      root,
      'src/main/resources/super/dev/webfx/kit/mapper/peers/javafxgraphics/elemental2/util/FxEvents.java'
    ),
    'utf8'
  );
  assert.match(source, /newMiddleButtonDown\s*=\s*\(me\.buttons & 4\)/);
  assert.match(source, /newSecondaryButtonDown\s*=\s*\(me\.buttons & 2\)/);
  const crypto = require('node:crypto');
  assert.equal(
    crypto.createHash('sha256').update(source).digest('hex'),
    lock.runtimePatches[0].patchedSourceSha256
  );
});
