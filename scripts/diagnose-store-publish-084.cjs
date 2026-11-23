'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// Report a fixed vocabulary. The build logs stay on the disposable runner.
function diagnostic(error) {
  const message = String(error.message || '');
  const log = String(error.logText || '');
  const combined = message + '\n' + log;
  const http = /Toolchain download failed \(HTTP ([1-5]\d\d)\)/.exec(message);
  const maven = /^Web compilation failed \(Maven exit (-?\d+)\)/.exec(message);
  const filesystem = /\b(ENOENT|ENAMETOOLONG|EACCES|EPERM|EINVAL|EBUSY|ENOSPC)\b/.exec(message);
  const network = /\b(ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN)\b/.exec(message);
  const reasons = [
    [/toolchain download timed out/i, 'download-timeout'],
    [/web compiler checksum mismatch|artifact.*checksum/i, 'artifact-integrity'],
    [/no Java sources found/i, 'missing-java-source'],
    [/incomplete fresh app/i, 'incomplete-output'],
    [/saved files are missing, changed or undeclared/i, 'saved-tooling-inventory'],
    [/reviewed pinned Maven wrapper/i, 'maven-wrapper-integrity'],
    [/path.*too long|filename or extension is too long/i, 'path-too-long'],
    [/could not (?:resolve|transfer)|failed to (?:read artifact descriptor|collect dependencies)/i, 'maven-artifact-resolution'],
    [/is not recognized as an internal or external command|not recognized as the name of a cmdlet/i, 'command-unavailable'],
    [/could not find or load main class/i, 'java-classpath'],
    [/invalid target release|unsupportedclassversionerror/i, 'java-version'],
    [/compilation error|cannot find symbol/i, 'java-compilation'],
    [/compiler dependency|browser compatibility requires/i, 'browser-compatibility'],
    [/compiler output|web compilation failed/i, 'compiler-process'],
  ];
  const reason = reasons.find(([pattern]) => pattern.test(combined))?.[1];
  return {
    ...(reason && {reason}),
    ...(http && {httpStatus: Number(http[1])}),
    ...(maven && {mavenExitCode: Number(maven[1])}),
    ...(filesystem && {filesystemError: filesystem[1]}),
    ...(network && {networkError: network[1]}),
    hadCompilerLog: Boolean(log),
  };
}

async function run() {
  const [extensionPath, starterPath, mode] = process.argv.slice(2);
  assert.ok(path.isAbsolute(extensionPath) && path.isAbsolute(starterPath));
  assert.ok(['preflight-only', 'windows-build'].includes(mode));

  const identity = require(path.join(extensionPath, 'package.json'));
  assert.equal(identity.version, '0.5.84');
  assert.equal(identity.publisher, 'zero');
  const upgrade = require(path.join(extensionPath, 'src/project-builder-upgrade.js'));
  const {createProjectBuilder} = require(path.join(extensionPath, 'src/project-builder.js'));
  const scratch = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'zero-report9-'));
  const projectRoot = path.join(scratch, 'starter');
  const result = {schema: 1, zeroVersion: identity.version, platform: process.platform, architecture: process.arch, osRelease: os.release()};
  let stage = 'fixture-copy';
  let buildPhase = 'not-started';

  try {
    await fs.cp(starterPath, projectRoot, {recursive: true, errorOnExist: true, force: false});
    stage = 'clean-preflight';
    const clean = await upgrade.planUpgrade({projectRoot, extensionPath});
    assert.equal(clean.changed, false);
    result.cleanPreflight = 'passed';

    stage = 'incomplete-tooling-control';
    const lock = path.join(projectRoot, '.zero-build', 'runtime-lock.json');
    const original = await fs.readFile(lock);
    await fs.unlink(lock);
    await assert.rejects(upgrade.planUpgrade({projectRoot, extensionPath}), {code: 'ZERO_BUILDER_UNAVAILABLE'});
    await fs.writeFile(lock, original, {flag: 'wx'});
    assert.equal((await upgrade.planUpgrade({projectRoot, extensionPath})).changed, false);
    result.incompleteToolingControl = 'ZERO_BUILDER_UNAVAILABLE';

    if (mode === 'windows-build') {
      stage = 'private-runtime';
      assert.equal(process.platform, 'win32');
      assert.equal(process.arch, 'x64');
      assert.equal(process.env.ZERO_WINDOWS_DISTRIBUTION, 'store');
      assert.ok(path.isAbsolute(process.env.ZERO_NODE_EXECUTABLE));
      assert.equal(await fs.realpath(process.execPath), await fs.realpath(process.env.ZERO_NODE_EXECUTABLE));
      stage = 'local-browser-build';
      const builder = createProjectBuilder({isTrusted: () => true, extensionPath, deadlineMs: 8 * 60_000});
      const exported = await builder.ensureValidatedExport({
        projectRoot, cacheRoot: path.join(scratch, 'web-cache'), explicitAction: true,
        onProgress(message) {
          if (message === 'Checking Java sources and resources') buildPhase = 'checking-inputs';
          if (message.startsWith('Preparing web compiler (')) buildPhase = 'downloading-web-compiler';
          if (message === 'Compiling Java for the browser.') buildPhase = 'compiling';
        },
      });
      assert.equal(exported.profileHash, clean.newProfileHash);
      assert.equal(exported.runtimeEvidence.nodeVersion, process.versions.node);
      assert.match(exported.runtimeEvidence.javaVersion, /^21\./);
      result.localBrowserBuild = 'passed';
      result.runtime = exported.runtimeEvidence;
    }
    result.outcome = 'passed';
  } catch (error) {
    const knownCodes = new Set(['ZERO_BUILDER_UNAVAILABLE', 'ZERO_BUILDER_OPERATION_FAILED', 'ZERO_BUILDER_UPDATE_REQUIRED', 'ERR_ASSERTION']);
    result.outcome = 'failed';
    result.stage = stage;
    result.code = knownCodes.has(error.code) ? error.code : 'OTHER';
    if (stage === 'local-browser-build') result.build = {phase: buildPhase, ...diagnostic(error)};
    process.exitCode = 1;
  } finally {
    await fs.rm(scratch, {recursive: true, force: true});
    console.log(JSON.stringify(result));
  }
}

run().catch(() => {
  console.error('Probe could not start or clean up its synthetic fixture.');
  process.exitCode = 1;
});
