import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash, randomUUID} from 'node:crypto';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicKeys, reviewPlan, verifyReviewAssets} from './release-review.mjs';
import {verifyStarterAtPublication} from './verify-project-new.mjs';
import {downloadPage} from './release-download-page.mjs';
import {releaseDownloadFiles, releaseDownloads, portableForPromotion, verifiedDownload, verifyPortableArchive} from './check-windows-portable-release.mjs';
import {bundleForPromotion, downloadBundle, verifyBundleArchive} from './check-windows-portable-bundle.mjs';
import {windowsPortableBundleHref} from '../website/lib/windows-portable-bundle.mjs';
import {validateInstallerManifest} from '../website/lib/installer.mjs';
import {windowsPortablePilotHref} from '../website/lib/windows-portable-pilot.mjs';
import {availableInstaller, validatePublishedInstaller} from '../website/lib/published-installer.mjs';

export const repository = 'codepetca/zero';
export const website = 'https://zero.codepet.ca';
export const windowsStoreURL = 'https://apps.microsoft.com/detail/9mxkd6dqlfgx';
const workflow = 'release-review.yml';
const shaPattern = /^[a-f0-9]{40}$/;
const definitionFiles = ['extension/package.json', 'framework/pom.xml'];
const portableManifestPath = 'release/windows-portable-pilot.json';
const bundleManifestPath = 'release/windows-portable-bundle.json';
const projectNewGateSources = ['.github/workflows/release-review.yml', 'scripts/verify-project-new.mjs',
  'scripts/project-new-playthrough.mjs', 'scripts/ProjectNewGreetingCheck.java',
  'website/lib/example-projects.mjs', 'website/lib/project-templates.mjs',
  'website/content/project-templates.json', 'website/lib/tutorial-after-code.mjs'];
const packagedSources = ['extension', 'framework', 'student-template', 'profile', 'setup', 'LICENSE', 'release/START-HERE.md',
  'sharing/harness/ZeroLibraryHarness.java', 'release/sharing.json', 'scripts/package.mjs', 'scripts/prepare-extension-assets.mjs', 'scripts/prepare-starter.mjs', 'scripts/kit.mjs', 'scripts/verify-kit.mjs', 'scripts/release-review.mjs', ...projectNewGateSources];
const exec = promisify(execFile);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = bytes => JSON.parse(String(bytes));

// Errors deliberately omit command output: gh can include authenticated API data.
export async function execute(command, args, options = {}) {
  try {
    return await exec(command, args, {...options, encoding: options.encoding ?? 'utf8',
      timeout: options.timeout ?? 120000, maxBuffer: 64 * 1024 * 1024,
      env: {...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1'}});
  } catch (cause) {
    const error = new Error(`${command} ${args[0]} failed; inspect that operation with the existing CLI sign-in.`);
    error.httpStatus = Number(String(cause.stderr || '').match(/HTTP (\d{3})/)?.[1]) || undefined;
    throw error;
  }
}

export function parseArguments(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--verify-only' && !options.verifyOnly) options.verifyOnly = true;
    else if (args[i] === '--version' && !options.version) options.version = args[++i];
    else if (args[i] === '--run-id' && !options.runId) options.runId = args[++i];
    else if (args[i] === '--portable-manifest' && !Object.hasOwn(options, 'portableManifest')) options.portableManifest = args[++i];
    else if (args[i] === '--portable-bundle-manifest' && !Object.hasOwn(options, 'bundleManifest')) options.bundleManifest = args[++i];
    else throw new Error('Usage: npm run release:publish -- --version X.Y.Z [--run-id DIGITS [--portable-manifest FILE] [--portable-bundle-manifest FILE]] [--verify-only]');
  }
  assert.match(options.version || '', /^\d+\.\d+\.\d+$/, 'Select one numeric version with --version.');
  if (options.runId !== undefined) assert.match(options.runId, /^\d+$/, 'Run ID must contain digits.');
  assert.ok(!options.verifyOnly || !options.runId, 'Verification does not use a preparation run.');
  if (Object.hasOwn(options, 'portableManifest')) {
    assert.ok(options.portableManifest && options.runId && !options.verifyOnly,
      'Portable promotion requires an explicit candidate manifest and preparation run ID.');
  }
  if (Object.hasOwn(options, 'bundleManifest')) {
    assert.ok(options.bundleManifest && options.runId && !options.verifyOnly,
      'Complete Portable promotion requires its candidate manifest and preparation run ID.');
  }
  return options;
}

export async function readDefinition(directory) {
  const release = json(await readFile(path.join(directory, 'release/kit.json')));
  const [extension, core] = await Promise.all(definitionFiles.map(name => readFile(path.join(directory, name), 'utf8')));
  assert.equal(release.schema, 1, 'Unsupported release definition.');
  assert.equal(json(extension).version, release.kitVersion, 'Extension version drift.');
  assert.ok(core.includes(`<artifactId>zero-core</artifactId>\n  <version>${release.coreVersion}</version>`), 'Canonical core version drift.');
  for (const asset of Object.values(release.assets)) {
    assert.ok(asset.label && /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(asset.filename), 'Invalid asset definition.');
  }
  reviewPlan(release, {repository});
  return release;
}

export function promoteDefinition(release, receipt, assets) {
  const result = structuredClone(release);
  result.publication.status = 'published';
  for (const key of publicKeys) {
    const expected = receipt.assets[key];
    const actual = assets.find(asset => asset.name === expected.filename);
    assert.ok(actual, 'Missing release asset.');
    result.assets[key] = {...result.assets[key], size: expected.size, sha256: expected.sha256, url: actual.browser_download_url};
  }
  return result;
}

export function promoteReadme(readme, version, url) {
  const expression = /\[Manual setup — complete kit ZIP [^\]\n]+\]\([^\)\n]+\)/g;
  assert.equal([...readme.matchAll(expression)].length, 1, 'README must contain exactly one manual complete-kit link.');
  return readme.replace(expression, `[Manual setup — complete kit ZIP ${version}](${url})`);
}

// The public website intentionally presents platform installers, not the manual kit.
// Use the same public Mac fallback selection as the website; local candidates stay private.
export async function readPlatformDownloads(directory, kit, {readJSON} = {}) {
  const optional = readJSON || (async name => {
    try {return json(await readFile(path.join(directory, 'release', name)));}
    catch (error) {if (error.code === 'ENOENT') return null; throw error;}
  });
  const current = validateInstallerManifest(await optional('installer.json'), kit);
  const published = validatePublishedInstaller(await optional('published-installer.json'), kit);
  const mac = availableInstaller(current, published);
  assert.ok(mac, 'Public platform verification requires published Mac installer metadata.');
  return {mac, windows:windowsStoreURL};
}
export function verifyPlatformDownloadPage(html, platforms) {
  const sections = downloadPage(html).sections;
  assert.equal(sections.length, 1, 'Live page must have one downloads section.');
  const anchors = sections[0].anchors;
  assert.equal(anchors.length, 2, 'Live downloads must contain exactly the Mac and Microsoft Store choices.');
  const mac = anchors.filter(anchor => anchor.href === platforms.mac.asset.url && anchor.text);
  const windows = anchors.filter(anchor => anchor.href === platforms.windows && anchor.text);
  assert.equal(mac.length, 1, 'Live downloads must have one verified Mac installer link.');
  assert.equal(windows.length, 1, 'Live downloads must have one Microsoft Store link.');
  return {mac:mac[0].href, windows:windows[0].href};
}

export function verifyRelease(release, receipt, sourceSha) {
  assert.equal(release.tag_name, receipt.publication.tag, 'Release tag drift.');
  assert.equal(release.target_commitish, sourceSha, 'Release target must be the exact prepared source commit.');
  assert.ok(!release.prerelease, 'Unexpected prerelease.');
  assert.equal(release.assets.length, 3, 'Release must contain exactly three public assets.');
  assert.deepEqual(release.assets.map(asset => asset.name).sort(), publicKeys.map(key => receipt.assets[key].filename).sort(), 'Release asset names drift.');
  const draftSlug = String(release.html_url || '').match(/^https:\/\/github\.com\/codepetca\/zero\/releases\/tag\/(untagged-[a-zA-Z0-9-]+)$/)?.[1];
  for (const key of publicKeys) {
    const expected = receipt.assets[key], actual = release.assets.find(asset => asset.name === expected.filename);
    assert.equal(actual.size, expected.size, 'Release asset size drift.');
    assert.equal(actual.state, 'uploaded', 'Release upload is incomplete.');
    if (actual.digest) assert.equal(actual.digest, `sha256:${expected.sha256}`, 'Release asset digest drift.');
    const canonicalUrl = `https://github.com/${repository}/releases/download/${receipt.publication.tag}/${expected.filename}`;
    const draftUrl = draftSlug && `https://github.com/${repository}/releases/download/${draftSlug}/${expected.filename}`;
    assert.ok(actual.browser_download_url === canonicalUrl || (release.draft && actual.browser_download_url === draftUrl), 'Unexpected public asset URL.');
    assert.ok(Number.isSafeInteger(actual.id) && actual.id > 0, 'Missing release asset ID.');
  }
}

export function verifyPreparation(run, version, sourceSha, requestId) {
  assert.equal(run.event, 'workflow_dispatch', 'Preparation must be a manual workflow run.');
  assert.equal(run.headSha, sourceSha, 'Preparation head differs from the selected main commit.');
  assert.equal(run.workflowName, 'Release checks and preparation', 'Unexpected preparation workflow.');
  if (requestId) assert.equal(run.displayTitle, `Prepare Zero ${version} [${requestId}]`, 'Preparation request correlation drift.');
  assert.ok(['queued', 'in_progress', 'waiting', 'requested', 'pending', 'completed'].includes(run.status), 'Unknown preparation status.');
  if (run.status === 'completed') assert.equal(run.conclusion, 'success', 'Preparation did not succeed.');
}

export function verifyChecks(pr, runs, expectedHead) {
  assert.equal(pr.headRefOid, expectedHead, 'Metadata PR head changed.');
  assert.equal(pr.baseRefName, 'main', 'Metadata PR must target main.');
  assert.ok(!pr.isDraft, 'Metadata PR remains draft.');
  assert.ok(!['CHANGES_REQUESTED', 'REVIEW_REQUIRED'].includes(pr.reviewDecision), 'Metadata PR needs review.');
  assert.equal(pr.reviewRequests?.length ?? 0, 0, 'Metadata PR has outstanding review requests.');
  const checks = pr.statusCheckRollup || [];
  const optionalLanes = new Map([
    ['Browser export compatibility/browser-tests', 'compatible'],
    ['Windows launcher checks/windows-tests', 'windows'],
    ['Windows launcher checks/portable-bundle', 'windows']
  ]);
  const runId = check => /^https:\/\/github\.com\/codepetca\/zero\/actions\/runs\/(\d+)\/job\/\d+$/.exec(check.detailsUrl || '')?.[1];
  function verifiedScopedSkip(check) {
    const gateName = optionalLanes.get(`${check.workflowName}/${check.name}`), id = runId(check);
    if (!gateName || !id) return false;
    const sameRun = item => item.__typename === 'CheckRun' && item.workflowName === check.workflowName && runId(item) === id;
    const passed = name => checks.filter(item => sameRun(item) && item.name === name && item.status === 'COMPLETED' && item.conclusion === 'SUCCESS').length === 1;
    return passed('scope / classify') && passed(gateName);
  }
  for (const check of checks) {
    if (check.__typename === 'StatusContext') {
      assert.ok(['SUCCESS', 'PENDING', 'EXPECTED'].includes(check.state), 'Metadata PR status failed or unknown.');
    } else {
      assert.ok(['QUEUED', 'IN_PROGRESS', 'PENDING', 'WAITING', 'REQUESTED', 'COMPLETED'].includes(check.status), 'Metadata PR check status unknown.');
      if (check.status === 'COMPLETED' && check.conclusion !== 'SUCCESS') {
        if (check.conclusion === 'SKIPPED' && optionalLanes.has(`${check.workflowName}/${check.name}`) && runId(check)) continue;
        assert.fail('Metadata PR check did not succeed.');
      }
    }
  }
  assert.ok(!['DIRTY', 'BLOCKED', 'DRAFT'].includes(pr.mergeStateStatus), 'Metadata PR is blocked by branch rules or conflicts.');
  assert.ok(['CLEAN', 'UNSTABLE', 'UNKNOWN', 'BEHIND', 'HAS_HOOKS'].includes(pr.mergeStateStatus), 'Unknown merge state.');
  const prepared = runs.find(run => run.headSha === expectedHead && run.event === 'pull_request' && run.workflowName === 'Release checks and preparation');
  if (prepared?.status === 'completed') assert.equal(prepared.conclusion, 'success', 'Metadata preparation CI failed.');
  return Boolean(pr.statusCheckRollup?.length) && pr.mergeStateStatus === 'CLEAN' && Boolean(prepared?.status === 'completed' && prepared.conclusion === 'success') &&
    checks.every(check => check.__typename === 'StatusContext' ? check.state === 'SUCCESS' : check.status === 'COMPLETED' && (check.conclusion === 'SUCCESS' || (check.conclusion === 'SKIPPED' && verifiedScopedSkip(check))));
}

// All transports are injectable; tests use disposable files and never contact GitHub.
export async function publishZero(options, dependencies = {}) {
  parseArguments(['--version', options.version, ...(options.runId ? ['--run-id', options.runId] : []), ...(options.verifyOnly ? ['--verify-only'] : []),
    ...(options.portableManifest ? ['--portable-manifest', options.portableManifest] : []),
    ...(options.bundleManifest ? ['--portable-bundle-manifest', options.bundleManifest] : [])]);
  const suppliedBundle = options.bundleManifest ? json(await readFile(options.bundleManifest)) : null;
  if (options.bundleManifest) windowsPortableBundleHref(suppliedBundle);
  const suppliedPortable = options.portableManifest ? json(await readFile(options.portableManifest)) : null;
  if (options.portableManifest) assert.ok(suppliedPortable && typeof suppliedPortable === 'object' &&
    !Array.isArray(suppliedPortable), 'Portable candidate manifest must be a JSON object.');
  const runner = dependencies.runner || execute, request = dependencies.fetch || fetch;
  const now = dependencies.now || Date.now, sleep = dependencies.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const log = dependencies.log || console.log;
  const directory = await (dependencies.makeTemp || (() => mkdtemp(path.join(tmpdir(), 'zero-publish-'))))();
  const source = path.join(directory, 'source'), candidate = path.join(directory, 'candidate'), review = path.join(directory, 'review');
  const state = {version: options.version, phase: 'source verification'};
  let succeeded = false;
  const command = async (name, args, cwd = source, extra = {}) => (await runner(name, args, {cwd, ...extra})).stdout;
  const gh = (args, extra = {}) => command('gh', [...args, '--repo', repository], directory, extra);
  // gh api uses a repository-qualified endpoint, not --repo.
  const api = async (endpoint, args = []) => json(await command('gh', ['api', `repos/${repository}/${endpoint}`, ...args], directory));
  const maybeApi = async endpoint => {
    try {return await api(endpoint);} catch (error) {if (error.httpStatus === 404) return null; throw error;}
  };
  const releases = async () => (await api('releases', ['--paginate', '--slurp'])).flat();
  const findRelease = async tag => {
    const matches = (await releases()).filter(item => item.tag_name === tag);
    assert.ok(matches.length <= 1, 'Conflicting releases for this version.');
    return matches[0];
  };
  async function publicBytes(asset) {
    const response = await request(asset.browser_download_url || asset.url, {signal: AbortSignal.timeout(30000), redirect: 'follow'});
    assert.equal(response.status, 200, 'Public asset download failed.');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, asset.size, 'Public download size drift.');
    assert.equal(hash(bytes), asset.sha256 || asset.digest?.replace(/^sha256:/, ''), 'Public download SHA256 drift.');
  }
  async function verifyPublic(release, receipt) {
    for (const key of publicKeys) {
      const actual = release.assets.find(asset => asset.name === receipt.assets[key].filename);
      await publicBytes({...actual, sha256: receipt.assets[key].sha256});
    }
  }
  async function verifyTag(sha, {allowAbsent = false, tag = `v${options.version}`} = {}) {
    const endpoint = `git/ref/tags/${tag}`;
    let reference = allowAbsent ? await maybeApi(endpoint) : await api(endpoint);
    if (!reference) return;
    if (reference.object.type === 'tag') reference = await api(`git/tags/${reference.object.sha}`);
    assert.equal(reference.object.type, 'commit', 'Unsupported release tag target.');
    assert.equal(reference.object.sha, sha, 'Release tag target drift.');
  }
  async function live(platforms, portable = null, bundle = null) {
    const deadline = now() + (dependencies.liveTimeout ?? 10 * 60000);
    let reason = 'The live platform download choices do not match published metadata yet.';
    while (now() < deadline) {
      try {
        // Home is the only platform download page; /downloads redirects there.
        const page = '/';
        const response = await request(`${website}${page}?zero_release=${encodeURIComponent(options.version)}&check=${now()}`, {signal: AbortSignal.timeout(30000), headers: {'Cache-Control': 'no-cache'}});
        assert.equal(response.status, 200, 'Live platform downloads unavailable.');
        if (response.url) {
          const destination = new URL(response.url);
          assert.ok(destination.origin === website && destination.pathname === page, 'Live platform downloads redirected outside the expected page.');
        }
        const found = verifyPlatformDownloadPage(await response.text(), platforms);
        // Measure the actual Mac button target. Store delivery has its own native acceptance.
        await publicBytes({...platforms.mac.asset, url:found.mac});
        if (portable || bundle) {
          const downloads = await request(`${website}/downloads?check=${now()}`,
            {signal: AbortSignal.timeout(30000), headers: {'Cache-Control':'no-cache'}});
          assert.equal(downloads.status, 200, 'Live Portable downloads unavailable.');
          if (downloads.url) {
            const destination = new URL(downloads.url);
            assert.ok(destination.origin === website && destination.pathname === '/downloads',
              'Live Portable downloads redirected outside the expected page.');
          }
          const links = downloadPage(await downloads.text()).anchors;
          for (const choice of [portable, bundle].filter(Boolean)) {
            assert.ok(links.some(link => link.href === choice.asset.url && link.text.includes(choice.kitVersion)),
              'Live Downloads page does not show the verified Portable ZIP yet.');
          }
        }
        return;
      } catch (error) {reason = error.message;}
      await sleep(dependencies.pollInterval ?? 10000);
    }
    throw new Error(`Live platform verification timed out: ${reason}`);
  }

  async function checkPortablePromotion(kit, sourceSha, review) {
    const manifests = new Map(await Promise.all(releaseDownloadFiles.map(async name => {
      try { return [name, json(await readFile(path.join(source, `release/${name}.json`)))]; }
      catch (error) { if (error.code === 'ENOENT') return [name, null]; throw error; }
    })));
    const before = releaseDownloads(name => manifests.get(name));
    const after = {...before, kit, portable:suppliedPortable ?? before.portable, bundle:suppliedBundle ?? before.bundle};
    const required = portableForPromotion(before, after);
    if (required || suppliedPortable) {
      const {portable} = after;
      assert.ok(windowsPortablePilotHref(portable), 'Portable candidate needs a canonical public ZIP URL.');
      assert.equal(portable.sourceRevision, sourceSha, 'Portable source must match this exact preparation run.');
      assert.equal(portable.kitVersion, kit.kitVersion, 'Portable version must match the kit.');
      assert.equal(portable.kitSha256, kit.assets.kit.sha256, 'Portable must embed the exact prepared kit.');
      await verifyTag(sourceSha, {tag:portable.publication.tag});
      const zip = await verifiedDownload(portable.asset, request);
      verifyPortableArchive(portable, zip, await readFile(path.join(review, kit.assets.kit.filename)));
    }
    if (before.bundle || suppliedBundle) {
      const promotion = bundleForPromotion(before, after);
      if (promotion || suppliedBundle) {
        const bundle = after.bundle;
        windowsPortableBundleHref(bundle, kit);
        assert.equal(bundle.kitSourceRevision, sourceSha, 'Complete Portable kit source differs from the preparation run.');
        await verifyTag(bundle.sourceRevision, {tag:bundle.publication.tag});
        const checkDirectory = await mkdtemp(path.join(directory, 'complete-'));
        try {
          const zip = await downloadBundle(bundle.asset, checkDirectory, request);
          verifyBundleArchive(zip, bundle, await readFile(path.join(review, kit.assets.kit.filename)));
        } finally { await rm(checkDirectory, {recursive:true, force:true}); }
      }
    }
  }

  try {
    await command('git', ['clone', '--no-checkout', '--single-branch', '--branch', 'main', `https://github.com/${repository}.git`, source], directory);
    const mainSha = String(await command('git', ['rev-parse', 'origin/main'])).trim();
    assert.match(mainSha, shaPattern, 'Invalid main commit.');
    await command('git', ['checkout', '--detach', mainSha]);
    const initial = await readDefinition(source);
    assert.equal(initial.kitVersion, options.version, 'Requested version differs from current main.');
    // Validate the promotion contract before dispatching or publishing any release.
    promoteReadme(await readFile(path.join(source, 'README.md'), 'utf8'), options.version,
      `https://github.com/${repository}/releases/download/${initial.publication.tag}/${initial.assets.kit.filename}`);
    const initialPlatforms = await readPlatformDownloads(source, initial);
    if (options.verifyOnly || (initial.publication.status === 'published' && !options.runId)) {
      assert.equal(initial.publication.status, 'published', 'Verify-only requires published metadata.');
      const release = await findRelease(initial.publication.tag);
      assert.ok(release && !release.draft, 'Published release is missing.');
      assert.match(release.target_commitish, shaPattern, 'Published target is not a pinned commit.');
      verifyRelease(release, {...initial, assets: Object.fromEntries(publicKeys.map(key => [key, initial.assets[key]]))}, release.target_commitish);
      for (const key of publicKeys) assert.equal(initial.assets[key].url, release.assets.find(asset => asset.name === initial.assets[key].filename).browser_download_url, 'Published metadata URL drift.');
      await verifyTag(release.target_commitish);
      const readme = await readFile(path.join(source, 'README.md'), 'utf8');
      assert.equal(promoteReadme(readme, options.version, initial.assets.kit.url), readme, 'Published README link drift.');
      await verifyPublic(release, initial);
      await live(initialPlatforms);
      succeeded = true;
      log(`Verified Zero ${options.version}: public manual-kit assets, README and platform downloads match.`);
      return {...state, phase: 'verified', releaseUrl: release.html_url};
    }
    let sourceSha = mainSha, runId = options.runId, run, requestId;
    if (runId) {
      run = json(await gh(['run', 'view', runId, '--json', 'databaseId,workflowName,event,headSha,status,conclusion,displayTitle']));
      assert.match(run.headSha, shaPattern, 'Invalid preparation commit.');
      sourceSha = run.headSha;
      // A supplied run must belong to this workflow file, even if another workflow has the same display name.
      const rawRun = await api(`actions/runs/${runId}`);
      assert.equal(rawRun.path, `.github/workflows/${workflow}`, 'Unexpected preparation workflow file.');
      assert.equal(String(rawRun.id), runId, 'Preparation run ID drift.');
    } else {
      reviewPlan(initial, {manual: true, expectedVersion: options.version, repository});
      assert.ok(!await findRelease(initial.publication.tag), 'Existing release/draft requires its exact preparation --run-id.');
      assert.ok(!await maybeApi(`git/ref/tags/${initial.publication.tag}`), 'Existing tag prevents preparation.');
      requestId = (dependencies.uuid || randomUUID)();
      await gh(['workflow', 'run', workflow, '--ref', 'main', '-f', `version=${options.version}`, '-f', `request_id=${requestId}`]);
      log(`Preparation requested for ${options.version} at ${sourceSha}; request ${requestId}.`);
    }
    await command('git', ['worktree', 'add', '--detach', candidate, sourceSha]);
    await command('git', ['merge-base', '--is-ancestor', sourceSha, mainSha]);
    const definition = await readDefinition(candidate);
    reviewPlan(definition, {manual: true, expectedVersion: options.version, repository});
    state.sourceSha = sourceSha;
    state.phase = 'CI preparation';
    const preparationDeadline = now() + (dependencies.preparationTimeout ?? 35 * 60000);
    while (now() < preparationDeadline) {
      if (!runId) {
        const runs = json(await gh(['run', 'list', '--workflow', workflow, '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId,workflowName,event,headSha,status,conclusion,displayTitle']));
        const matches = runs.filter(item => item.displayTitle === `Prepare Zero ${options.version} [${requestId}]`);
        assert.ok(matches.length <= 1, 'Ambiguous preparation request.');
        if (matches[0]) runId = String(matches[0].databaseId);
      }
      if (runId) {
        state.runId = runId;
        run = json(await gh(['run', 'view', runId, '--json', 'databaseId,workflowName,event,headSha,status,conclusion,displayTitle']));
        verifyPreparation(run, options.version, sourceSha, requestId);
        if (run.status === 'completed') break;
      }
      await sleep(dependencies.pollInterval ?? 10000);
    }
    assert.ok(run?.status === 'completed' && run.conclusion === 'success', 'Preparation timed out. Retry with the reported run ID once successful.');
    state.runId = runId;
    log(`Preparation ${runId} succeeded at ${sourceSha}. Resume with --version ${options.version} --run-id ${runId}.`);
    await mkdir(review);
    await gh(['run', 'download', runId, '--name', `zero-${options.version}-review-${runId}`, '--dir', review]);
    const sourceReceipt = await readFile(path.join(review, 'SOURCE.txt'), 'utf8');
    assert.equal(sourceReceipt, `Repository: ${repository}\nCommit: ${sourceSha}\nVersion: ${options.version}\nRun: ${runId}\n`, 'SOURCE receipt drift.');
    const sums = verifyReviewAssets(review, definition, candidate);
    assert.equal(await readFile(path.join(review, 'SHA256SUMS'), 'utf8'), sums, 'SHA256SUMS drift.');
    const receipt = json(await readFile(path.join(review, 'release.json')));
    // The helper checks source; also prevent extra metadata fields from being promoted.
    for (const key of publicKeys) {
      assert.deepEqual(receipt.assets[key], {...definition.assets[key], size: receipt.assets[key].size, sha256: receipt.assets[key].sha256}, 'Review asset metadata drift.');
      assert.match(receipt.assets[key].sha256, /^[a-f0-9]{64}$/);
    }
    const expectedPublished = promoteDefinition(definition, receipt, publicKeys.map(key => ({name: receipt.assets[key].filename,
      browser_download_url: `https://github.com/${repository}/releases/download/${definition.publication.tag}/${receipt.assets[key].filename}`})));
    assert.ok(JSON.stringify(initial) === JSON.stringify(definition) || JSON.stringify(initial) === JSON.stringify(expectedPublished), 'Selected main release definition differs from the preparation candidate.');
    for (const name of definitionFiles) assert.equal(await readFile(path.join(source, name), 'utf8'), await readFile(path.join(candidate, name), 'utf8'), `Selected main definition drift: ${name}`);
    assert.equal(String(await command('git', ['diff', '--name-only', sourceSha, mainSha, '--', ...packagedSources])).trim(), '', 'Packaged source changed since preparation.');
    state.phase = 'Portable promotion verification';
    await checkPortablePromotion(expectedPublished, sourceSha, review);
    state.phase = 'release publication';
    let release = await findRelease(definition.publication.tag);
    let projectNew;
    if (!release || release.draft) {
      await gh(['run', 'download', runId, '--name', `zero-${options.version}-project-new-${runId}`, '--dir', review]);
      projectNew = json(await readFile(path.join(review, 'PROJECT-NEW.json')));
      await verifyStarterAtPublication(candidate, projectNew, receipt.assets.extension, request);
    }
    if (!release) {
      assert.ok(!await maybeApi(`git/ref/tags/${definition.publication.tag}`), 'Existing tag without matching release; publication stopped.');
      await gh(['release', 'create', definition.publication.tag, '--target', sourceSha, '--draft', '--title', `Zero ${options.version}`,
        '--notes', `Zero ${options.version}. Exact assets prepared by workflow run ${runId} at ${sourceSha}.`,
        ...publicKeys.map(key => path.join(review, receipt.assets[key].filename))]);
      release = await findRelease(definition.publication.tag);
      assert.ok(release, 'Could not read back the created draft. Resume with --run-id; do not recreate assets manually.');
    }
    // Fetch by ID: releases/tags can return 404 for drafts.
    release = await api(`releases/${release.id}`);
    verifyRelease(release, receipt, sourceSha);
    // Draft target_commitish does not override an existing tag's actual commit.
    await verifyTag(sourceSha, {allowAbsent: release.draft});
    for (const key of publicKeys) {
      const expected = receipt.assets[key], asset = release.assets.find(item => item.name === expected.filename);
      const bytes = await command('gh', ['api', `repos/${repository}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream'], directory, {encoding: 'buffer'});
      assert.equal(bytes.length, expected.size, 'Uploaded release byte size drift.');
      assert.equal(hash(bytes), expected.sha256, 'Uploaded release byte checksum drift.');
    }
    if (release.draft) {
      // Check the complete draft again immediately before the deliberate transition.
      verifyRelease(await api(`releases/${release.id}`), receipt, sourceSha);
      await verifyTag(sourceSha, {allowAbsent: true});
      await verifyStarterAtPublication(candidate, projectNew, receipt.assets.extension, request);
      await api(`releases/${release.id}`, ['--method', 'PATCH', '-F', 'draft=false']);
    }
    release = await api(`releases/${release.id}`);
    assert.equal(release.draft, false, 'Release did not become public.');
    verifyRelease(release, receipt, sourceSha);
    await verifyTag(sourceSha);
    state.releaseUrl = release.html_url;
    log(`Published release verified: ${release.html_url}`);
    await verifyPublic(release, receipt);
    state.phase = 'website metadata PR';
    await command('git', ['fetch', 'origin', 'main']);
    const latestSha = String(await command('git', ['rev-parse', 'origin/main'])).trim();
    assert.match(latestSha, shaPattern);
    await command('git', ['checkout', '--detach', latestSha]);
    const current = await readDefinition(source);
    const promoted = promoteDefinition(definition, receipt, release.assets);
    assert.ok(JSON.stringify(current) === JSON.stringify(definition) || JSON.stringify(current) === JSON.stringify(promoted), 'Main release definition drift; preserve the release and review the metadata manually.');
    for (const name of definitionFiles) assert.equal(await readFile(path.join(source, name), 'utf8'), await readFile(path.join(candidate, name), 'utf8'), `Main definition drift: ${name}`);
    assert.equal(String(await command('git', ['diff', '--name-only', sourceSha, latestSha, '--', ...packagedSources])).trim(), '', 'Packaged source changed on latest main.');
    const beforeReadme = await readFile(path.join(source, 'README.md'), 'utf8');
    const promotedReadme = promoteReadme(beforeReadme, options.version, promoted.assets.kit.url);
    const promotedJson = JSON.stringify(promoted, null, 2) + '\n';
    await checkPortablePromotion(promoted, sourceSha, review);
    const promotionEntries = [];
    if (JSON.stringify(current) !== JSON.stringify(promoted) || beforeReadme !== promotedReadme) {
      promotionEntries.push(['README.md', promotedReadme], ['release/kit.json', promotedJson]);
    }
    const portableJson = suppliedPortable && JSON.stringify(suppliedPortable, null, 2) + '\n';
    const currentPortable = portableJson && await readFile(path.join(source, portableManifestPath), 'utf8')
      .catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (portableJson && portableJson !== currentPortable) promotionEntries.push([portableManifestPath, portableJson]);
    const bundleJson = suppliedBundle && JSON.stringify(suppliedBundle, null, 2) + '\n';
    if (bundleJson) {
      const currentBundle = await readFile(path.join(source, bundleManifestPath), 'utf8')
        .catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (bundleJson !== currentBundle) promotionEntries.push([bundleManifestPath, bundleJson]);
    }
    const promotionFiles = promotionEntries.map(([name]) => name).sort();
    let prUrl;
    if (promotionEntries.length) {
      const branch = `codex/publish-${options.version.replaceAll('.', '-')}`;
      const branchRef = await maybeApi(`git/ref/heads/${branch}`);
      let head;
      if (branchRef) {
        head = branchRef.object.sha;
        assert.match(head, shaPattern);
        await command('git', ['fetch', 'origin', branch]);
        for (const [name, expected] of promotionEntries) {
          assert.equal(String(await command('git', ['show', `${head}:${name}`])), expected, 'Existing metadata branch differs from generated state.');
        }
        assert.deepEqual(String(await command('git', ['diff', '--name-only', latestSha, head])).trim().split('\n').sort(), promotionFiles, 'Existing branch has arbitrary changes or a stale base.');
      } else {
        const user = json(await command('gh', ['api', 'user'], directory));
        assert.match(user.login || '', /^[a-zA-Z0-9][a-zA-Z0-9-]*$/, 'Cannot establish the signed-in release author.');
        assert.ok(Number.isSafeInteger(user.id) && user.id > 0, 'Cannot establish the signed-in release author ID.');
        await command('git', ['checkout', '-b', branch, latestSha]);
        for (const [name, body] of promotionEntries) await writeFile(path.join(source, name), body);
        assert.deepEqual(String(await command('git', ['diff', '--name-only'])).trim().split('\n').sort(), promotionFiles, 'Generated diff must contain only release metadata and README.');
        await command('git', ['diff', '--check']);
        await command('git', ['add', '--', ...promotionFiles]);
        await command('git', ['-c', `user.name=${user.login}`, '-c', `user.email=${user.id}+${user.login}@users.noreply.github.com`, 'commit', '-m', `Publish verified Zero ${options.version} download metadata`]);
        head = String(await command('git', ['rev-parse', 'HEAD'])).trim();
        assert.match(head, shaPattern);
        await command('git', ['push', 'origin', `HEAD:refs/heads/${branch}`]);
      }
      const prs = json(await gh(['pr', 'list', '--head', branch, '--base', 'main', '--state', 'all', '--json', 'number,url,state,headRefOid']));
      assert.ok(prs.length <= 1, 'Ambiguous metadata PR.');
      if (prs[0]) {
        assert.equal(prs[0].state, 'OPEN', 'Existing metadata PR is closed; inspect its state before continuing.');
        assert.equal(prs[0].headRefOid, head, 'Existing metadata PR head differs.');
        prUrl = prs[0].url;
      } else {
        prUrl = String(await gh(['pr', 'create', '--base', 'main', '--head', branch, '--title', `Publish Zero ${options.version} download metadata`,
          '--body', `Promote the exact three immutable assets from ${release.html_url}, prepared by run ${runId} at ${sourceSha}. Public unauthenticated sizes and SHA256 values match the review receipts. Optional components remain local. The release preparation workflow must pass on this exact PR head before merge.`])).trim();
      }
      assert.match(prUrl, /^https:\/\/github\.com\/codepetca\/zero\/pull\/\d+$/, 'Unexpected metadata PR URL.');
      state.prUrl = prUrl;
      log(`Metadata PR: ${prUrl}`);
      const ciDeadline = now() + (dependencies.ciTimeout ?? 20 * 60000);
      let green = false;
      while (now() < ciDeadline) {
        const pr = json(await gh(['pr', 'view', prUrl, '--json', 'headRefOid,baseRefName,isDraft,reviewDecision,reviewRequests,statusCheckRollup,mergeStateStatus,state']));
        assert.equal(pr.state, 'OPEN', 'Metadata PR is no longer open.');
        const diff = String(await gh(['pr', 'diff', prUrl, '--name-only'])).trim().split('\n').sort();
        assert.deepEqual(diff, promotionFiles, 'Metadata PR contains arbitrary changes.');
        const runs = json(await gh(['run', 'list', '--workflow', workflow, '--event', 'pull_request', '--commit', head, '--limit', '20', '--json', 'workflowName,event,headSha,status,conclusion']));
        green = verifyChecks(pr, runs, head);
        if (green) break;
        await sleep(dependencies.pollInterval ?? 10000);
      }
      assert.ok(green, 'Metadata CI/branch rules did not permit merge before timeout. Resume this exact PR after checks/review succeed.');
      await command('git', ['fetch', 'origin', 'main']);
      const mergeBase = String(await command('git', ['rev-parse', 'origin/main'])).trim();
      if (mergeBase !== latestSha) {
        assert.match(mergeBase, shaPattern, 'Invalid current main commit.');
        await command('git', ['checkout', '--detach', mergeBase]);
        await checkPortablePromotion(promoted, sourceSha, review);
      }
      await gh(['pr', 'merge', prUrl, '--merge', '--match-head-commit', head]);
      const merged = json(await gh(['pr', 'view', prUrl, '--json', 'state,headRefOid,mergeCommit']));
      assert.equal(merged.state, 'MERGED', 'Metadata PR did not merge.');
      assert.equal(merged.headRefOid, head, 'Merged metadata PR head changed.');
      assert.match(merged.mergeCommit?.oid || '', shaPattern, 'Missing merge commit.');
    }
    await command('git', ['fetch', 'origin', 'main']);
    const mergedMainSha = String(await command('git', ['rev-parse', 'origin/main'])).trim();
    assert.match(mergedMainSha, shaPattern, 'Invalid merged main commit.');
    assert.equal(String(await command('git', ['show', `${mergedMainSha}:release/kit.json`])), promotedJson, 'Merged metadata readback drift.');
    assert.equal(String(await command('git', ['show', `${mergedMainSha}:README.md`])), promotedReadme, 'Merged README readback drift.');
    if (portableJson) {
      assert.equal(String(await command('git', ['show', `${mergedMainSha}:${portableManifestPath}`])),
        portableJson, 'Merged Portable metadata readback drift.');
    }
    if (bundleJson) {
      assert.equal(String(await command('git', ['show', `${mergedMainSha}:${bundleManifestPath}`])),
        bundleJson, 'Merged complete Portable metadata readback drift.');
    }
    // A concurrent Mac promotion may have advanced main while the kit PR was pending.
    // Read all final metadata from one fetched commit, without changing the checkout.
    const platformFiles = new Set(String(await command('git', ['ls-tree', '--name-only', mergedMainSha, '--',
      'release/installer.json', 'release/published-installer.json'])).trim().split('\n'));
    const platforms = await readPlatformDownloads(source, promoted, {readJSON:async name =>
      platformFiles.has(`release/${name}`) ? json(await command('git', ['show', `${mergedMainSha}:release/${name}`])) : null});
    state.phase = 'live platform verification';
    await live(platforms, suppliedPortable, suppliedBundle);
    succeeded = true;
    log(`Verified Zero ${options.version}: release assets, merged manual-kit metadata/README and platform downloads match.`);
    return {...state, phase: 'verified', prUrl};
  } catch (error) {
    error.message = `${state.phase}: ${error.message}\nRelease: ${state.releaseUrl || 'not yet verified'}; PR: ${state.prUrl || 'not yet created'}; preparation: ${state.runId || options.runId || 'see request correlation above'}. Resume with the recorded version and run ID, including the verified Portable manifest when required. Published assets remain immutable.`;
    throw error;
  } finally {
    // Contains only public source/artifacts, but no credentials or persisted auth state.
    if (succeeded || !dependencies.keepTemp) await rm(directory, {recursive: true, force: true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {await publishZero(parseArguments(process.argv.slice(2)));}
  catch (error) {console.error(error.message); process.exitCode = 1;}
}
