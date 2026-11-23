'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

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
  const result = {schema: 1, zeroVersion: identity.version, platform: process.platform, architecture: process.arch};
  let stage = 'fixture-copy';

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
