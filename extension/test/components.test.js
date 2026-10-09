'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {loadCatalog, readProject, prepareChange, validatePrepared} = require('../src/components');
const digest = text => createHash('sha256').update(text).digest('hex');
const starter = path.join(__dirname, '../../student-template/pom.xml');
async function fixture(t, subdirectory = 'component-repository') {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-components-')));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  const root = path.join(directory, 'app');
  const repositoryPath = path.join(directory, subdirectory);
  const catalogPath = path.join(directory, 'catalog.json');
  await fs.mkdir(path.join(root, 'src/main/java'), {recursive: true});
  await fs.writeFile(path.join(root, 'zero.json'), '{}\n');
  await fs.writeFile(path.join(root, 'pom.xml'), await fs.readFile(starter));
  await fs.writeFile(path.join(root, 'src/main/java/Main.java'), 'class Main { /* my source */ }\n');
  const catalog = {schemaVersion: 1, origin: 'local-proof', repositorySubdirectory: subdirectory, latest: '0.1.1', library: {groupId: 'school.zero.community', artifactId: 'zero-community', javaRelease: 17, javafxVersion: '21.0.12'}, releases: [], components: [{id: 'health-bar', name: 'HealthBar', className: 'zero.community.HealthBar', description: 'App-owned health.', api: ['Node view()'], examples: [{id: 'demo', path: 'examples/demo/Main.java', description: 'Try health.'}], status: 'experimental', license: 'UNLICENSED', maintainer: null}]};
  for (const version of ['0.1.0', '0.1.1']) {
    const artifacts = {};
    for (const [kind, suffix] of Object.entries({jar: '.jar', pom: '.pom', sources: '-sources.jar', javadoc: '-javadoc.jar'})) {
      const relative = `school/zero/community/zero-community/${version}/zero-community-${version}${suffix}`;
      const text = kind === 'pom' ? `<project><groupId>school.zero.community</groupId><artifactId>zero-community</artifactId><version>${version}</version></project>` : `immutable ${version} ${kind}`;
      const filename = path.join(repositoryPath, relative);
      await fs.mkdir(path.dirname(filename), {recursive: true});
      await fs.writeFile(filename, text);
      artifacts[kind] = {path: relative, sha256: digest(text)};
    }
    catalog.releases.push({version, artifacts});
  }
  const saveCatalog = () => fs.writeFile(catalogPath, JSON.stringify(catalog, null, 2));
  await saveCatalog();
  return {directory, root, repositoryPath, catalogPath, catalog, saveCatalog, context: await loadCatalog(catalogPath)};
}
async function writePlan(f, plan) { await fs.writeFile(path.join(f.root, 'pom.xml'), plan.afterText); }
async function editPom(f, edit) {
  const filename = path.join(f.root, 'pom.xml');
  await fs.writeFile(filename, edit(await fs.readFile(filename, 'utf8')));
}
test('planning and cancelled review write nothing; add/update/revert preserve source and unowned POM bytes', async t => {
  const f = await fixture(t);
  await editPom(f, text => text.replace('<app.mainClass>Main</app.mainClass>', '<!-- my setting -->\n    <app.mainClass>MyApp</app.mainClass>'));
  const sourcePath = path.join(f.root, 'src/main/java/Main.java');
  const source = await fs.readFile(sourcePath, 'utf8');
  const before = await fs.readFile(path.join(f.root, 'pom.xml'), 'utf8');
  const add = await prepareChange(f.root, f.context, '0.1.0', {operation: 'add'});
  assert.equal(add.currentVersion, null);
  assert.equal(await fs.readFile(path.join(f.root, 'pom.xml'), 'utf8'), before);
  assert.equal(await validatePrepared(add, f.context), true);
  await writePlan(f, add);
  const installed = await readProject(f.root, f.context);
  assert.equal(installed.currentVersion, '0.1.0'); assert.equal(installed.previousVersion, null);
  const update = await prepareChange(f.root, f.context, '0.1.1', {operation: 'update'});
  assert.equal(update.previousVersion, null);
  await writePlan(f, update);
  assert.equal((await readProject(f.root, f.context)).previousVersion, '0.1.0');
  const revert = await prepareChange(f.root, f.context, null, {operation: 'revert'});
  assert.equal(revert.targetVersion, '0.1.0');
  await writePlan(f, revert);
  const reverted = await readProject(f.root, f.context);
  assert.equal(reverted.currentVersion, '0.1.0'); assert.equal(reverted.previousVersion, '0.1.1');
  assert.equal(await fs.readFile(sourcePath, 'utf8'), source);
  // Removing the exact generated blocks restores every original byte.
  const stripped = reverted.beforeText.replace(/    <!-- Zero community history: start -->[\s\S]*?<!-- Zero community history: end -->\n/, '').replace(/    <!-- Zero community dependency: start -->[\s\S]*?<!-- Zero community dependency: end -->\n/, '').replace(/  <repositories>\n[\s\S]*?<\/repositories>\n/, '');
  assert.equal(stripped, before);
  await assert.rejects(prepareChange(f.root, f.context, '0.1.1', {operation: 'add'}), /already installed/);
});
test('POM edits after preview reject the stale plan; unrelated source edits remain untouched', async t => {
  const f = await fixture(t);
  const plan = await prepareChange(f.root, f.context, '0.1.1');
  const java = path.join(f.root, 'src/main/java/Main.java');
  await fs.writeFile(java, 'class Main { int studentEdit = 42; }');
  assert.equal(await validatePrepared(plan, f.context), true);
  assert.equal(await fs.readFile(java, 'utf8'), 'class Main { int studentEdit = 42; }');
  await editPom(f, text => text.replace('<app.mainClass>Main', '<app.mainClass>Different'));
  await assert.rejects(validatePrepared(plan, f.context), /POM changed/);
});
test('catalog bytes, release digests and plan text are rechecked before application', async t => {
  const f = await fixture(t);
  const plan = await prepareChange(f.root, f.context, '0.1.1');
  await assert.rejects(validatePrepared({...plan, afterText: plan.afterText.replace('<version>0.1.1</version>', '<version>99.9.9</version>')}, f.context), /no longer valid/);
  f.catalog.components[0].description = 'changed after review'; await f.saveCatalog();
  await assert.rejects(validatePrepared(plan, f.context), /catalog or local repository changed/);
  const fresh = await loadCatalog(f.catalogPath);
  const plan2 = await prepareChange(f.root, fresh, '0.1.1');
  await fs.writeFile(path.join(f.repositoryPath, f.catalog.releases[0].artifacts.jar.path), 'replaced old release');
  await assert.rejects(validatePrepared(plan2, fresh), /digest/);
});
test('safe fixed indexed versions only; local fixtures cannot promote their own status', async t => {
  const f = await fixture(t, 'repository');
  for (const version of ['0.1.2', 'LATEST', '0.1.1-SNAPSHOT', '../1.2.3', '1.2.3</version>']) await assert.rejects(prepareChange(f.root, f.context, version), /indexed|listed|immutable/);
  await assert.rejects(prepareChange(f.root, f.context, null, {operation: 'revert'}), /Add a component/);
  f.catalog.components[0].status = 'community-reviewed'; await f.saveCatalog();
  await assert.rejects(loadCatalog(f.catalogPath), /experimental/);
});
test('MIT catalogs support local library plans without granting review or maintainer authority', async t => {
  const f = await fixture(t);
  f.catalog.components[0].license = 'MIT'; await f.saveCatalog();
  const context = await loadCatalog(f.catalogPath);
  const plan = await prepareChange(f.root, context, '0.1.1', {operation: 'add'});
  assert.equal(await validatePrepared(plan, context), true);
  assert.equal(context.catalog.components[0].status, 'experimental');
  assert.equal(context.catalog.components[0].maintainer, null);
  f.catalog.components[0].status = 'community-reviewed'; await f.saveCatalog();
  await assert.rejects(loadCatalog(f.catalogPath), /experimental/);
  f.catalog.components[0].status = 'experimental';
  f.catalog.components[0].maintainer = 'self-appointed'; await f.saveCatalog();
  await assert.rejects(loadCatalog(f.catalogPath), /no named maintainer/);
  f.catalog.components[0].maintainer = null;
  f.catalog.components[0].license = 'invented-license'; await f.saveCatalog();
  await assert.rejects(loadCatalog(f.catalogPath), /MIT or historical UNLICENSED/);
});
test('catalog traversal, symlink escape, coordinates and release POM identity are refused', async t => {
  const f = await fixture(t);
  const artifact = f.catalog.releases[0].artifacts.jar;
  const originalPath = artifact.path;
  artifact.path = '../escaped.jar'; await f.saveCatalog();
  await assert.rejects(loadCatalog(f.catalogPath), /inside the local repository/);
  artifact.path = originalPath; await f.saveCatalog();
  const originalJar = path.join(f.repositoryPath, originalPath);
  const outside = path.join(f.directory, 'outside.jar');
  await fs.rename(originalJar, outside); await fs.symlink(outside, originalJar);
  await assert.rejects(loadCatalog(f.catalogPath), /symbolic links/);
  await fs.unlink(originalJar); await fs.rename(outside, originalJar);
  f.catalog.library.groupId = 'attacker'; await f.saveCatalog();
  await assert.rejects(loadCatalog(f.catalogPath), /Only the local/);
  f.catalog.library.groupId = 'school.zero.community';
  const pomArtifact = f.catalog.releases[0].artifacts.pom;
  const badPom = '<project><groupId>attacker</groupId><artifactId>zero-community</artifactId><version>0.1.0</version></project>';
  await fs.writeFile(path.join(f.repositoryPath, pomArtifact.path), badPom); pomArtifact.sha256 = digest(badPom); await f.saveCatalog();
  await assert.rejects(loadCatalog(f.catalogPath), /coordinates/);
});
test('symlinked project marker, POM and source folders are refused', async t => {
  const f = await fixture(t);
  const pomPath = path.join(f.root, 'pom.xml');
  const outside = path.join(f.directory, 'outside.xml');
  await fs.rename(pomPath, outside); await fs.symlink(outside, pomPath);
  await assert.rejects(prepareChange(f.root, f.context, '0.1.1'), /symbolic links/);
  await fs.unlink(pomPath); await fs.rename(outside, pomPath);
  await fs.symlink(f.directory, path.join(f.root, 'src/external'));
  await assert.rejects(prepareChange(f.root, f.context, '0.1.1'), /symbolic link/);
});
test('source copies present initially or introduced during review refuse library shadowing', async t => {
  const f = await fixture(t);
  const plan = await prepareChange(f.root, f.context, '0.1.1');
  const copied = path.join(f.root, 'src/main/java/MyCopy.java');
  const studentSource = 'package zero.community; public class HealthBar { int myChange = 1; }';
  await fs.writeFile(copied, studentSource);
  await assert.rejects(prepareChange(f.root, f.context, '0.1.1'), /shadows/);
  await assert.rejects(validatePrepared(plan, f.context), /shadows/);
  assert.equal(await fs.readFile(copied, 'utf8'), studentSource);
});
test('manual and duplicated community dependencies, aliases and damaged managed blocks are refused', async t => {
  const f = await fixture(t);
  const baseline = await fs.readFile(path.join(f.root, 'pom.xml'), 'utf8');
  const manual = '<dependency><groupId>school.zero.community</groupId><artifactId>zero-community</artifactId><version>0.1.0</version></dependency>';
  await editPom(f, text => text.replace('</dependencies>', `${manual}</dependencies>`));
  await assert.rejects(prepareChange(f.root, f.context, '0.1.1'), /managed community POM blocks/);
  await fs.writeFile(path.join(f.root, 'pom.xml'), baseline);
  const add = await prepareChange(f.root, f.context, '0.1.0'); await writePlan(f, add);
  await editPom(f, text => text.replace('</dependencies>', `${manual}</dependencies>`));
  await assert.rejects(readProject(f.root, f.context), /duplicate/);
  await writePlan(f, add);
  await editPom(f, text => text.replace('<version>0.1.0</version>', '<version>${community.version}</version>'));
  await assert.rejects(readProject(f.root, f.context), /immutable/);
  await fs.writeFile(path.join(f.root, 'pom.xml'), baseline.replace('<artifactId>javafx-controls</artifactId>', '<artifactId>${custom.artifact}</artifactId>'));
  await assert.rejects(readProject(f.root, f.context), /Property-managed/);
});
test('ambiguous and unsupported XML and Java compatibility overrides are refused without writes', async t => {
  const f = await fixture(t);
  const filename = path.join(f.root, 'pom.xml');
  const baseline = await fs.readFile(filename, 'utf8');
  const cases = [
    baseline.replace('<project ', '<!DOCTYPE project [<!ENTITY bad "x">]>\n<project '),
    baseline.replace('<app.mainClass>Main</app.mainClass>', '<app.mainClass>&bad;</app.mainClass>'),
    baseline.replace('</properties>', '</properties><properties/>'),
    baseline.replace('<maven.compiler.release>17', '<maven.compiler.release>21'),
    baseline.replace('<javafx.version>21.0.12', '<javafx.version>24.0.0'),
    baseline.replace('<version>${javafx.version}</version>', '<version>24.0.0</version>'),
    baseline.replace('</project>', '<profiles><profile><id>compatibility-override</id><properties><javafx.version>24</javafx.version></properties></profile></profiles></project>'),
    baseline.replace('<artifactId>maven-compiler-plugin</artifactId>', '<artifactId>maven-compiler-plugin</artifactId><configuration><release>8</release></configuration>'),
    baseline.replace('</project>', '</wrong>'),
    baseline.replace('<properties>', '<properties unexpected="yes">')
  ];
  for (const text of cases) {
    await fs.writeFile(filename, text);
    await assert.rejects(prepareChange(f.root, f.context, '0.1.1'));
    assert.equal(await fs.readFile(filename, 'utf8'), text);
  }
});
test('CRLF and unrelated repository/dependency/comments survive update; patch downgrade uses Revert', async t => {
  const f = await fixture(t);
  await editPom(f, text => text.replace('</dependencies>', '<dependency><groupId>other</groupId><artifactId>helper</artifactId><version>2.3.4</version></dependency></dependencies>').replace('</project>', '<repositories><!-- keep me --><repository><id>other</id><url>file:///elsewhere</url></repository></repositories>\n</project>').replace(/\n/g, '\r\n'));
  const add = await prepareChange(f.root, f.context, '0.1.0'); await writePlan(f, add);
  assert.equal(add.afterText.replace(/\r\n/g, '').includes('\n'), false);
  const update = await prepareChange(f.root, f.context, '0.1.1', {operation: 'update'}); await writePlan(f, update);
  assert.match(update.afterText, /<!-- keep me -->/);
  assert.match(update.afterText, /<artifactId>helper<\/artifactId><version>2.3.4<\/version>/);
  await assert.rejects(prepareChange(f.root, f.context, '0.1.0', {operation: 'update'}), /newer compatible patch/);
  const revert = await prepareChange(f.root, f.context, undefined, {operation: 'revert'});
  assert.equal(revert.targetVersion, '0.1.0');
});
test('unknown recorded history, moved project root and altered managed local repository refuse application', async t => {
  const f = await fixture(t);
  const add = await prepareChange(f.root, f.context, '0.1.0'); await writePlan(f, add);
  await assert.rejects(prepareChange(f.root, f.context, null, {operation: 'revert'}), /No preceding/);
  await editPom(f, text => text.replace('<zero.community.previousVersion>none', '<zero.community.previousVersion>0.1.9'));
  await assert.rejects(readProject(f.root, f.context), /preceding version/);
  await writePlan(f, add);
  await editPom(f, text => text.replace(f.context.repositoryUrl, 'https://external.example/repository'));
  await assert.rejects(readProject(f.root, f.context), /repository was changed/);
  await writePlan(f, add);
  const update = await prepareChange(f.root, f.context, '0.1.1', {operation: 'update'});
  const moved = path.join(f.directory, 'moved');
  await fs.rename(f.root, moved); await fs.symlink(moved, f.root);
  await assert.rejects(validatePrepared(update, f.context), /without symbolic links/);
});
test('ordinary comments mentioning Zero community remain unowned and metadata cannot inject XML', async t => {
  const f = await fixture(t);
  await editPom(f, text => text.replace('</properties>', '<!-- I use Zero community here. -->\n  </properties>'));
  f.catalog.components[0].description = 'literal <dependency> from metadata'; await f.saveCatalog();
  const fresh = await loadCatalog(f.catalogPath);
  const plan = await prepareChange(f.root, fresh, '0.1.1');
  assert.match(plan.afterText, /<!-- I use Zero community here\. -->/);
  assert.equal(plan.afterText.includes('literal <dependency> from metadata'), false);
  await writePlan(f, plan);
  assert.equal((await readProject(f.root, fresh)).currentVersion, '0.1.1');
});
