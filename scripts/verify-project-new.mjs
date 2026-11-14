import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
import {buildCourseStarter} from '../website/lib/example-projects.mjs';
import {templateDefinition} from '../website/lib/project-templates.mjs';
import {tutorialAfterLines, tutorialAfterCopyText} from '../website/lib/tutorial-after-code.mjs';
import {verifyNativeGreeting, verifyWebGreeting} from './project-new-playthrough.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const {validateBundle} = require('../extension/src/lesson-projects.js');
const {createProjectBuilder, readSavedBuilder} = require('../extension/src/project-builder.js');
const {planUpgrade} = require('../extension/src/project-builder-upgrade.js');
const {ORIGINAL_TEMPLATE, assertStarterIdentity, assertCompatibleStarter, installedStarterInventory} = require('../extension/src/github-app/starter-template.js');
const template = templateDefinition('zero-starter');
const targetRepository = `${ORIGINAL_TEMPLATE.owner}/${ORIGINAL_TEMPLATE.repo}`;
assert.equal(template.repository, targetRepository, 'Review the release check when Project → New changes templates.');
const github = 'https://api.github.com/repos/' + template.repository;
const gitHash = /^[a-f0-9]{40}$/;
const bundlePath = 'media/lesson-projects.json';

export const expectedStarter = root => buildCourseStarter({root, template});

async function publicJson(request, suffix) {
  const response = await request(github + suffix, {
    headers: {Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache'},
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000)
  });
  assert.ok(response.ok, `Cannot verify public ${template.repository}${suffix} (HTTP ${response.status}).`);
  if (!response.body) throw Error('GitHub returned no public starter data.');
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    assert.ok(length <= 512 * 1024, 'Public starter metadata exceeds 512 KiB.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function branchIdentity(branch) {
  assert.equal(branch?.name, 'main', 'Public starter branch changed.');
  const commit = branch.commit?.sha;
  const tree = branch.commit?.commit?.tree?.sha;
  assert.match(commit || '', gitHash);
  assert.match(tree || '', gitHash);
  return {commit, tree};
}

const blobId = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

export function assertStarterTree(payload, tree, files) {
  assert.equal(payload?.sha, tree, 'GitHub returned a different starter tree.');
  assert.equal(payload.truncated, false, 'Public starter tree response is incomplete.');
  assert.ok(Array.isArray(payload.tree) && payload.tree.length <= 512, 'Public starter tree has too many entries.');
  const expected = new Map(files.map(file => [file.path, {sha: blobId(file.data), mode: (file.mode & 0o111) ? '100755' : '100644'}]));
  const directories = new Set(files.flatMap(({path: filename}) => filename.split('/').slice(1).map((_, i) => filename.split('/').slice(0, i + 1).join('/'))));
  const seen = new Set();
  const differences = [];
  for (const entry of payload.tree) {
    const filename = entry?.path;
    assert.ok(typeof filename === 'string' && !seen.has(filename), 'Public starter tree has a duplicate or invalid path.');
    seen.add(filename);
    if (directories.has(filename) && entry.type === 'tree' && entry.mode === '040000') continue;
    const file = expected.get(filename);
    if (!file || entry.type !== 'blob' || entry.mode !== file.mode || entry.sha !== file.sha) differences.push(filename);
    expected.delete(filename);
  }
  differences.push(...expected.keys());
  assert.equal(differences.length, 0, `Public starter differs from the generated project. Refresh ${template.repository} through its reviewed template PR before release. Changed, missing or unexpected paths: ${JSON.stringify(differences.sort().slice(0, 20))}`);
}

async function readPublicStarter(root, request) {
  const publication = JSON.parse(await readFile(path.join(root, 'website/content/project-templates.json'), 'utf8'));
  const approved = publication.templates.find(entry => entry.id === template.id && entry.repository === template.repository);
  assert.ok(Number.isSafeInteger(approved?.repositoryId) && approved.repositoryId > 0, 'Public starter repository ID is missing.');
  const [repo, branch] = await Promise.all([publicJson(request, ''), publicJson(request, '/branches/main')]);
  assert.equal(repo?.id, approved.repositoryId, 'Public starter repository ID changed.');
  assert.equal(repo.full_name, template.repository);
  assert.equal(repo.private, false, 'Starter must be public.');
  assert.equal(repo.is_template, true, 'Starter must be a GitHub template.');
  assert.equal(repo.default_branch, 'main', 'Starter default branch changed.');
  assertStarterIdentity(repo);
  return {repository: template.repository, ...branchIdentity(branch)};
}

export async function verifyPublicStarter(root, files, request = fetch, inventory) {
  const identity = await readPublicStarter(root, request);
  const tree = await publicJson(request, `/git/trees/${identity.tree}?recursive=1`);
  assertStarterTree(tree, identity.tree, files);
  if (inventory) assertCompatibleStarter(tree, identity.tree, inventory);
  assert.deepEqual(branchIdentity(await publicJson(request, '/branches/main')),
    {commit: identity.commit, tree: identity.tree}, 'Public starter changed during verification. Retry.');
  return identity;
}

export async function verifyStarterAtPublication(root, receipt, extension, request = fetch) {
  assert.equal(receipt?.repository, template.repository, 'Missing Project → New release evidence.');
  assert.match(receipt.commit || '', gitHash);
  assert.match(receipt.tree || '', gitHash);
  assert.equal(receipt.vsixSha256, extension.sha256, 'Project → New check used a different VSIX.');
  assert.equal(receipt.native?.starter, 'UI_READY', 'Unedited starter Run was not verified.');
  assert.deepEqual(receipt.native?.greetings, ['Hello, Sam!', 'Hello, Ada!'], 'Native greeting was not verified.');
  assert.deepEqual(receipt.web?.greetings, receipt.native.greetings, 'WebFX greeting was not verified.');
  const current = await readPublicStarter(root, request);
  assert.equal(current.tree, receipt.tree,
    'Public starter content changed after the Project → New release check. Restore the reviewed tree before resuming this draft, or review a new candidate and version.');
  return current;
}

export function replayGreeting(lessons) {
  // Lesson 1 provides the complete starting file. Apply only numbered actions
  // using the same added/removed lines the website uses for its Copy button.
  let source;
  for (const [name, markdown] of lessons) {
    const actions = markdown.split(/^### /m)[0];
    let applied = 0;
    for (const [, language, block] of actions.matchAll(/^```(java(?:-after-\d+(?:-\d+)*(?:-r\d+(?:-\d+)*)?)?)\r?\n([\s\S]*?)^```[ \t]*$/gm)) {
      if (language === 'java') {
        assert.equal(source, undefined, `Unexpected complete Java file in ${name}.`);
        source = block;
      } else {
        assert.ok(source, `Missing complete starting file before an edit in ${name}.`);
        const lines = tutorialAfterLines(block, 'language-' + language);
        const before = lines.filter(line => !line.added).map(line => line.code).join('\n');
        assert.ok(before.trim() && source.split(before).length === 2, `Tutorial edit in ${name} must match exactly once: ${before}`);
        source = source.replace(before, () => tutorialAfterCopyText(lines).slice(0, -1));
      }
      applied++;
    }
    assert.ok(applied, `No authored code found in ${name}.`);
  }
  assert.ok(source);
  return source;
}

export async function checkProjectNew({root = sourceRoot, vsixPath, receiptPath, request = fetch}) {
  const {files} = await expectedStarter(root);
  const verified = await verifyPublicStarter(root, files, request);
  // Materialize reviewed source only after proving the public tree has those
  // exact bytes and modes. Never run a downloaded starter archive.
  const work = await mkdtemp(path.join(await realpath(tmpdir()), 'zero-project-new-'));
  const project = path.join(work, 'project');
  const extensionPath = path.join(work, 'extension');
  try {
    const vsixBytes = await readFile(vsixPath);
    const vsix = unzipSync(vsixBytes, {filter: ({name}) =>
      name === 'extension/' + bundlePath || name === 'extension/package.json'});
    const editor = JSON.parse(Buffer.from(vsix['extension/package.json']).toString('utf8')).version;
    const bundle = vsix['extension/' + bundlePath];
    validateBundle(JSON.parse(Buffer.from(bundle).toString('utf8')));
    await mkdir(path.join(extensionPath, 'media'), {recursive: true});
    await writeFile(path.join(extensionPath, bundlePath), bundle);
    const inventory = await installedStarterInventory(extensionPath);
    for (const file of files) {
      const destination = path.join(project, file.path);
      await mkdir(path.dirname(destination), {recursive: true});
      await writeFile(destination, file.data, {mode: file.mode & 0o777, flag: 'wx'});
    }
    const plan = await planUpgrade({projectRoot: project, extensionPath});
    assert.equal(plan.changed, false, `Public starter builder does not match VSIX ${editor}.`);
    const framework = await readFile(path.join(project, 'zero-core.json'), 'utf8');
    const lessons = await Promise.all(['00-hello-world.md', '01-hello-button.md', '02-hello-name.md'].map(async name =>
      [name, await readFile(path.join(root, 'student-template/lessons', name), 'utf8')]));
    const starter = (await verifyNativeGreeting(project, {starter: true})).greetings[0];
    await writeFile(path.join(project, 'src/main/java/Main.java'), replayGreeting(lessons));
    console.log(`Project → New: replaying Greeting from ${verified.repository}@${verified.commit} with VSIX ${editor}.`);
    const native = {...await verifyNativeGreeting(project), starter};
    const builder = createProjectBuilder({extensionPath, isTrusted: () => true});
    // Keep the normal saved-builder compatibility and retained output checks.
    const exported = await builder.ensureValidatedExport({
      projectRoot: project, explicitAction: true,
      cacheRoot: path.join(root, '.verification/project-new-webfx'),
      onProgress: console.log
    });
    const web = await verifyWebGreeting(exported.sitePath);
    assert.deepEqual(await verifyPublicStarter(root, files, request, inventory), verified, 'Public starter changed during the tutorial replay. Retry.');
    const receipt = {...verified, editor, vsixSha256: createHash('sha256').update(vsixBytes).digest('hex'),
      builder: (await readSavedBuilder(project)).profileHash,
      core: JSON.parse(framework).sourceSha256, native, web};
    if (receiptPath) await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify(receipt, null, 2));
    return receipt;
  } finally {
    await rm(work, {recursive: true, force: true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [vsixPath, receiptPath, ...extra] = process.argv.slice(2);
  assert.ok(vsixPath && extra.length === 0, 'Usage: node scripts/verify-project-new.mjs <candidate.vsix> [receipt.json]');
  await checkProjectNew({vsixPath, receiptPath});
}
