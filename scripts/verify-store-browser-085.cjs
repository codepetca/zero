'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Report fixed fields without raw process output, app logs or local paths.
function failure(error) {
  const codes = ['ZERO_BUILDER_UNAVAILABLE', 'ZERO_BUILDER_OPERATION_FAILED', 'ZERO_BUILDER_UPDATE_REQUIRED', 'ERR_ASSERTION'];
  const message = String(error.message || '');
  const filesystemError = /\b(ENOENT|ENAMETOOLONG|EACCES|EPERM|EINVAL|EBUSY|ENOSPC)\b/.exec(message);
  const operation = /\b(open|stat|lstat|realpath|mkdtemp|mkdir|rename|unlink|copyfile|spawn|scandir|opendir|access)\s+'([^'\r\n]+)'/i.exec(message);
  return {
    code: codes.includes(error.code) ? error.code : 'OTHER',
    ...(filesystemError && {filesystemError: filesystemError[1]}),
    ...(operation && {fileOperation: operation[1].toLowerCase(), subjectPathLength: operation[2].length}),
    hadCompilerLog: Boolean(error.logText),
  };
}

async function run() {
  const [extensionPath, starterPath] = process.argv.slice(2);
  const result = {schema: 1, zeroVersion: '0.5.85', outcome: 'failed'};
  let scratch;
  let stage = 'private-runtime';
  let buildPhase;
  try {
    assert.ok(path.isAbsolute(extensionPath) && path.isAbsolute(starterPath));
    assert.equal(process.platform, 'win32');
    assert.equal(process.arch, 'x64');
    assert.equal(process.env.ZERO_WINDOWS_DISTRIBUTION, 'store');
    assert.equal(process.env.GITHUB_ACTIONS, 'true');
    assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
    assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
    assert.ok(path.isAbsolute(process.env.ZERO_JAVA_HOME) && path.isAbsolute(process.env.ZERO_NODE_EXECUTABLE));
    assert.equal(await fs.realpath(process.execPath), await fs.realpath(process.env.ZERO_NODE_EXECUTABLE));
    const manifest = require(path.join(path.dirname(starterPath), 'setup', 'windows-downloads.json'));
    const runtimes = manifest.architectures.x64;
    assert.equal(process.versions.node, runtimes.node.version.replace(/^v/, ''));
    assert.equal(path.basename(process.env.ZERO_JAVA_HOME), `jdk-${runtimes.jdk.sha256}`);

    stage = 'packaged-fixture';
    const identity = require(path.join(extensionPath, 'package.json'));
    assert.equal(identity.version, result.zeroVersion);
    assert.equal(identity.publisher, 'zero');
    assert.equal(identity.name, 'zero');
    const adapterPath = path.join(extensionPath, 'src', 'project-builder.js');
    const {createProjectBuilder, readSavedBuilder, browserCacheRoot} = require(adapterPath);
    const {planUpgrade, applyUpgrade} = require(path.join(extensionPath, 'src', 'project-builder-upgrade.js'));
    result.adapterSha256 = sha256(await fs.readFile(adapterPath));
    scratch = await fs.realpath(await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'z085-')));
    const projectRoot = path.join(scratch, 'starter');
    await fs.cp(starterPath, projectRoot, {recursive: true, errorOnExist: true, force: false});
    const builder = createProjectBuilder({isTrusted: () => true, extensionPath, deadlineMs: 8 * 60_000});
    const options = {projectRoot, explicitAction: true};
    const reviewOptions = {projectRoot, extensionPath};
    const editorStorage = path.join(path.dirname(path.dirname(extensionPath)), 'user-data', 'User', 'globalStorage', 'zero.zero');
    const cacheRoot = browserCacheRoot(editorStorage);
    assert.equal(cacheRoot, path.join(os.tmpdir(), 'zero-web'));

    stage = 'clean-preflight';
    const clean = await planUpgrade(reviewOptions);
    assert.equal(clean.changed, false);
    assert.equal((await readSavedBuilder(projectRoot)).profileHash, clean.newProfileHash);
    result.cleanPreflight = 'passed';

    stage = 'missing-runtime-lock';
    const savedDirectory = path.join(projectRoot, '.zero-build');
    const runtimeLock = path.join(savedDirectory, 'runtime-lock.json');
    const originalRuntime = await fs.readFile(runtimeLock);
    const originalManifest = await fs.readFile(path.join(savedDirectory, 'builder.json'));
    await fs.unlink(runtimeLock);
    await assert.rejects(builder.ensureValidatedExport({...options, cacheRoot}), {code: 'ZERO_BUILDER_UNAVAILABLE'});
    result.incompleteToolingControl = 'ZERO_BUILDER_UNAVAILABLE';

    stage = 'repair';
    const repair = await planUpgrade(reviewOptions);
    assert.equal(repair.repairing, true);
    assert.equal(repair.changed, true);
    assert.equal(repair.newProfileHash, clean.newProfileHash);
    const restored = await applyUpgrade(repair);
    assert.equal(restored.cleanupWarning, undefined);
    assert.equal(path.dirname(path.dirname(restored.backupPath)), projectRoot);
    assert.deepEqual(await fs.readFile(path.join(restored.backupPath, 'builder.json')), originalManifest);
    await assert.rejects(fs.access(path.join(restored.backupPath, 'runtime-lock.json')), {code: 'ENOENT'});
    assert.deepEqual(await fs.readFile(runtimeLock), originalRuntime);
    assert.equal((await readSavedBuilder(projectRoot)).profileHash, clean.newProfileHash);
    assert.equal((await planUpgrade(reviewOptions)).changed, false);
    result.repair = {restoredExactRuntimeLock: true, retainedPartialBackup: true};

    stage = 'cold-browser-build';
    await assert.rejects(fs.lstat(cacheRoot), {code: 'ENOENT'});
    const started = Date.now();
    const exported = await builder.ensureValidatedExport({
      ...options, cacheRoot,
      onProgress(message) {
        if (message === 'Checking Java sources and resources') buildPhase = 'checking-inputs';
        if (message.startsWith('Preparing web compiler (')) buildPhase = 'downloading-web-compiler';
        if (message.startsWith('Checking every original Java API against ')) buildPhase = 'checking-java-apis';
        if (message === 'Preparing and verifying the pinned Maven distribution') buildPhase = 'preparing-maven';
        if (message === 'Compiling Java for the browser.') buildPhase = 'compiling';
        if (message === 'Web export ready') buildPhase = 'validating-output';
      },
    });
    assert.equal(exported.profileHash, clean.newProfileHash);
    const runtime = exported.runtimeEvidence;
    assert.equal(runtime.platform, 'win32-x64');
    assert.equal(runtime.nodeVersion, process.versions.node);
    assert.equal(runtime.javaVersion, runtimes.jdk.version.replace(/^jdk-/, '').split('+')[0]);
    assert.equal(runtime.matchesTestedVersions, true);
    assert.ok(exported.zipBytes.length > 0);
    assert.ok(exported.manifest.files.some(file => file.path === 'index.html'));

    stage = 'retained-browser-export';
    const retained = await builder.validateExport({...options, cacheRoot, result: exported});
    assert.equal(retained.buildId, exported.buildId);
    assert.equal(retained.sourceHash, exported.sourceHash);
    assert.deepEqual(retained.zipBytes, exported.zipBytes);
    assert.equal((await readSavedBuilder(projectRoot)).profileHash, clean.newProfileHash);
    result.coldBrowserBuild = {
      elapsedSeconds: Math.round((Date.now() - started) / 1000),
      cacheBaseLength: cacheRoot.length,
      retainedExport: true,
      zipBytes: exported.zipBytes.length,
      zipSha256: sha256(exported.zipBytes),
      runtime: {platform: runtime.platform, nodeVersion: runtime.nodeVersion, javaVersion: runtime.javaVersion},
    };
    result.outcome = 'passed';
  } catch (error) {
    Object.assign(result, {stage, ...(buildPhase && {buildPhase}), ...failure(error)});
  } finally {
    if (scratch) {
      try { await fs.rm(scratch, {recursive: true, force: true}); }
      catch { result.outcome = 'failed'; result.cleanupFailed = true; }
    }
    if (result.outcome !== 'passed') process.exitCode = 1;
    console.log(JSON.stringify(result));
  }
}

run();
