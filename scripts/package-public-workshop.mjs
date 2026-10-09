// Maintainer-only assembly. The extracted Workshop needs JDK 17+, not Node/Python.
import {readFile, readdir, lstat, realpath, mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {zipSync, unzipSync} from 'fflate';
import {releaseDefinition} from './release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const community = path.resolve(process.argv[2] || path.join(root, '../zero-community'));
if (process.argv.length > 3) throw new Error('Usage: node scripts/package-public-workshop.mjs [community-root]');
const {loadCatalog} = createRequire(import.meta.url)('../extension/src/components.js');
const prepared = await loadCatalog(path.join(root, '.verification/component-catalog.json'));
const source = JSON.parse(await readFile(path.join(root, '.verification/component-workshop-source.json'), 'utf8'));
const version = '0.1.2';
const coreVersion = releaseDefinition().coreVersion;
assert.equal(coreVersion, '0.1.1', 'Public Workshop preserves the existing local core.');
assert.equal(prepared.catalog.latest, version, 'Run Workshop preparation with --public first.');
assert.deepEqual(prepared.catalog.releases.map(item => item.version), [version]);
assert.equal(prepared.catalog.releases[0].sourceRevision, source.sourceRevision);
assert.equal(prepared.catalog.releases[0].sourceDigest, source.sourceDigest);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function git(directory, args) {
  const result = spawnSync('git', ['-C', directory, ...args], {encoding:'utf8'});
  if (result.status !== 0) throw new Error('Commit the exact Workshop/community source before packaging: ' + result.stderr);
  return result.stdout.trim();
}
const zeroRevision = git(root, ['rev-parse', 'HEAD']);
const communityRevision = git(community, ['rev-parse', 'HEAD']);
assert.equal(communityRevision, source.sourceRevision, 'Prepared community source revision is stale.');
const members = {};
const prefix = `zero-community-workshop-${version}/`;
const timestamp = new Date('2026-10-09T00:00:00Z');
async function ordinary(filename) {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || await realpath(filename) !== filename)
    throw new Error('Package only ordinary declared files: ' + filename);
  return readFile(filename);
}
function addBytes(key, bytes) {
  assert.ok(!members[prefix + key], 'Duplicate archive path: ' + key);
  members[prefix + key] = [new Uint8Array(bytes), {os:3, mtime:timestamp,
    attrs:((key.endsWith('/mvnw') ? 0o100755 : 0o100644) << 16) >>> 0}];
}
async function add(filename, key) {addBytes(key, await ordinary(filename));}
async function addCommitted(directory, relative, key) {
  git(directory, ['ls-files', '--error-unmatch', '--', relative]);
  git(directory, ['diff', '--exit-code', 'HEAD', '--', relative]);
  await add(path.join(directory, relative), key);
}
async function workshopTree(directory, relative) {
  for (const entry of (await readdir(path.join(directory, relative), {withFileTypes:true})).sort((a,b) => a.name.localeCompare(b.name))) {
    if (['target', '.DS_Store'].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error('No symbolic links in Workshop source.');
    const filename = relative + '/' + entry.name;
    if (entry.isDirectory()) await workshopTree(directory, filename);
    else await addCommitted(directory, filename, filename);
  }
}
await addCommitted(root, 'LICENSE', 'LICENSE');
await workshopTree(root, 'component-workshop');
for (const name of ['mvnw', 'mvnw.cmd', '.mvn/wrapper/maven-wrapper.properties', '.mvn/wrapper/LICENSE-APACHE-2.0.txt', '.mvn/wrapper/NOTICE']) {
  await addCommitted(root, 'student-template/' + name, 'component-workshop/' + name);
}
// Only committed readable community source/tooling. No local/private/generated files.
const sourceFiles = git(community, ['ls-files', '-z']).split('\0').filter(Boolean).sort();
for (const filename of sourceFiles) {
  if (!/^(?:LICENSE|README\.md|AGENTS\.md|\.gitignore|\.gitattributes|pom\.xml|mvnw|mvnw\.cmd|(?:\.mvn|\.github|src|examples|docs|catalog|scripts|releases)\/[^\x00]+)$/.test(filename)) continue;
  if (filename.split('/').some(part => ['target', '.git', '.proof', '.verification', '__pycache__'].includes(part)))
    throw new Error('Generated content is tracked in community source: ' + filename);
  await addCommitted(community, filename, 'zero-community/' + filename);
}
for (const file of source.files) {
  assert.equal(sha(members[prefix + 'zero-community/' + file.path][0]), file.sha256, 'Prepared source digest is stale: ' + file.path);
}
assert.equal(sha(Buffer.from(JSON.stringify(source.files))), source.sourceDigest);
const metadata = JSON.parse(Buffer.from(members[prefix + 'zero-community/catalog/components.json'][0]).toString('utf8'));
assert.deepEqual(metadata.library, prepared.catalog.library);
assert.deepEqual(metadata.components, prepared.catalog.components);
for (const artifact of Object.values(prepared.catalog.releases[0].artifacts)) {
  const filename = path.join(prepared.repositoryPath, artifact.path);
  const bytes = await ordinary(filename);
  assert.equal(bytes.length, artifact.size);
  assert.equal(sha(bytes), artifact.sha256);
  addBytes('component-repository/' + artifact.path, bytes);
  addBytes('component-repository/' + artifact.path + '.sha256', Buffer.from(sha(bytes) + '\n'));
  addBytes('component-repository/' + artifact.path + '.sha1', Buffer.from(createHash('sha1').update(bytes).digest('hex') + '\n'));
}
for (const suffix of ['.jar', '-sources.jar', '.pom']) {
  const relative = `school/zero/zero-core/${coreVersion}/zero-core-${coreVersion}${suffix}`;
  const bytes = await ordinary(path.join(prepared.repositoryPath, relative));
  assert.equal((await readFile(path.join(prepared.repositoryPath, relative + '.sha256'), 'utf8')).trim(), sha(bytes));
  addBytes('component-repository/' + relative, bytes);
  addBytes('component-repository/' + relative + '.sha256', Buffer.from(sha(bytes) + '\n'));
  addBytes('component-repository/' + relative + '.sha1', Buffer.from(createHash('sha1').update(bytes).digest('hex') + '\n'));
}
addBytes('catalog.json', Buffer.from(JSON.stringify(prepared.catalog, null, 2) + '\n'));
addBytes('SOURCE.txt', Buffer.from(`Zero source: https://github.com/codepetca/zero/tree/${zeroRevision}\nZero Community source: https://github.com/codepetca/zero-community/tree/${communityRevision}\nCommunity sourceDigest: ${source.sourceDigest}\nCore: school.zero:zero-core:${coreVersion} (local, unchanged)\nCommunity: school.zero.community:zero-community:${version}\nExperimental owner-authorized candidate; contributor checks are not human acceptance.\n`));
addBytes('README.md', Buffer.from(`# Zero Community Workshop ${version}\n\nExtract the entire folder and keep its sibling folders together. JDK 17+ is\nrequired. Open component-workshop in VS Code and use the normal build shortcut,\nor run ./mvnw compile javafx:run there (Windows: .\\mvnw.cmd compile javafx:run).\nThe first run downloads pinned Maven/JavaFX dependencies. No Node.js or Python\nis needed to run, check or export.\n\nEdit zero-community/src/main/java/zero/community/HealthBar.java, then choose\nBuild local source & check in Workshop. Preview, Examples, API and Checks describe\nthe same component. Prepare contribution exports only declared source and evidence\nto a new folder; it never uploads or accepts work. Trusted local candidate Java\nruns with normal computer permissions.\n\nTo contribute, fork https://github.com/codepetca/zero-community and make your\nsource changes on a branch. Open a pull request and include the packet/check\nevidence. Existing maintain/admin users independently review and accept changes;\ncontributor, CI or AI receipts cannot do so. HealthBar ${version} is experimental.\nNo AI provider is configured. Students own coursework repositories and submit\nlinks separately in Pika.\n\nThis catalog is a verified local copy for portable use. Selecting catalog.json\nfrom Zero's (…) Browse components menu pins the library using its local Maven\nrepository; keep the extracted folder in place. The public app-consumption path\nuses the fixed HTTPS Maven service instead.\n\nOriginal Zero and Zero Community source uses MIT; preserve both LICENSE files\nand upstream Maven wrapper notices. SOURCE.txt records the exact source commits.\nmacOS finite JavaFX checks are recorded separately; physical Windows/Linux,\nDirectoryChooser interaction and novice classroom trials remain unverified.\n`));
const archive = zipSync(members, {level:6});
const extracted = unzipSync(archive);
assert.deepEqual(Object.keys(extracted).sort(), Object.keys(members).sort());
for (const [key, [bytes]] of Object.entries(members)) assert.deepEqual(extracted[key], bytes);
assert.ok(!Object.keys(extracted).some(key => /\/(?:target|\.git|\.proof|\.verification|__pycache__)\//.test(key)));
assert.ok(Buffer.from(extracted[prefix + 'component-workshop/mvnw.cmd']).includes(Buffer.from('\r\n')), 'Windows wrapper must retain CRLF.');
const filename = `zero-community-workshop-${version}.zip`;
await mkdir(path.join(root, 'dist'), {recursive:true});
await writeFile(path.join(root, 'dist', filename), archive);
const receipt = {filename, size:archive.length, sha256:sha(archive), zeroRevision, communityRevision,
  sourceDigest:source.sourceDigest, members:Object.keys(members).length,
  scope:'Portable local Workshop; no publication or human acceptance.'};
await writeFile(path.join(root, '.verification/public-workshop-package.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
