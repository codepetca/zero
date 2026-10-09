'use strict';
// Plans only: the extension applies a reviewed plan with a native editor edit.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {loadPublicCatalog, REPOSITORY_ID: PUBLIC_REPOSITORY} = require('./public-components');
const GROUP = 'school.zero.community';
const ARTIFACT = 'zero-community';
const PREVIOUS = 'zero.community.previousVersion';
const REPOSITORY = 'zero-community-local';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const xmlEscape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function plain(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 8000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) fail(`Invalid catalog ${label}.`);
  return value;
}
function releaseVersion(value) {
  if (typeof value !== 'string' || value.length > 60 || !versionPattern.test(value) || !value.split('.').every(part => Number.isSafeInteger(Number(part)))) fail('Use an exact immutable release version (for example 0.1.1).');
  return value;
}
function relativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..') || /[:\x00-\x1f]/.test(value)) fail('Catalog paths must remain inside the local repository.');
  return value;
}
async function ordinaryFile(filename, label) {
  const resolved = path.resolve(filename);
  const actual = await fs.realpath(resolved);
  const stat = await fs.lstat(resolved);
  if (actual !== resolved || !stat.isFile()) fail(`${label} must be a regular file without symbolic links.`);
  return resolved;
}
async function loadCatalog(catalogPath) {
  if (typeof catalogPath !== 'string' || !path.isAbsolute(catalogPath)) fail('Choose an absolute local catalog file path.');
  catalogPath = await ordinaryFile(catalogPath, 'The catalog');
  const bytes = await fs.readFile(catalogPath);
  if (bytes.length > 1024 * 1024) fail('The local catalog is too large.');
  let catalog;
  try { catalog = JSON.parse(bytes.toString('utf8')); } catch { fail('The catalog is not valid JSON.'); }
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) fail('The catalog must be a JSON object.');
  const library = catalog.library;
  if (catalog.schemaVersion !== 1 || catalog.origin !== 'local-proof' || !['repository', 'component-repository'].includes(catalog.repositorySubdirectory) || library?.groupId !== GROUP || library?.artifactId !== ARTIFACT || library.javaRelease !== 17 || library.javafxVersion !== '21.0.12') fail('Only the local Zero community proof catalog for Java 17 and JavaFX 21.0.12 is supported.');
  const repositoryPath = path.join(path.dirname(catalogPath), catalog.repositorySubdirectory);
  if (await fs.realpath(repositoryPath) !== repositoryPath || !(await fs.lstat(repositoryPath)).isDirectory()) fail('The local Maven repository must be an ordinary directory without symbolic links.');
  if (!Array.isArray(catalog.releases) || !catalog.releases.length || catalog.releases.length > 100) fail('The catalog needs immutable releases.');
  const versions = new Set();
  for (const release of catalog.releases) {
    if (!release || typeof release !== 'object') fail('Invalid catalog release.');
    releaseVersion(release.version);
    if (versions.has(release.version)) fail('The catalog contains a duplicate release version.');
    versions.add(release.version);
    const suffixes = {jar: '.jar', pom: '.pom', sources: '-sources.jar', javadoc: '-javadoc.jar'};
    for (const [kind, suffix] of Object.entries(suffixes)) {
      const artifact = release.artifacts?.[kind];
      const expected = `school/zero/community/${ARTIFACT}/${release.version}/${ARTIFACT}-${release.version}${suffix}`;
      if (!artifact || relativePath(artifact.path) !== expected || !/^[a-f0-9]{64}$/.test(artifact.sha256 || '')) fail(`Invalid ${kind} artifact for release ${release.version}.`);
      const filename = await ordinaryFile(path.join(repositoryPath, artifact.path), 'A release artifact');
      const content = await fs.readFile(filename);
      if (hash(content) !== artifact.sha256) fail(`The ${kind} digest for ${release.version} does not match. Rebuild the local proof; do not replace an existing release.`);
      if (kind === 'pom') {
        const pom = parseXml(content.toString('utf8'));
        if (value(single(pom, 'groupId')) !== GROUP || value(single(pom, 'artifactId')) !== ARTIFACT || value(single(pom, 'version')) !== release.version) fail('Release POM coordinates do not match the catalog.');
      }
    }
  }
  if (!versions.has(releaseVersion(catalog.latest)) || (library.version !== undefined && library.version !== catalog.latest)) fail('The latest release must identify an indexed version.');
  if (!Array.isArray(catalog.components) || !catalog.components.length || catalog.components.length > 100) fail('The catalog needs component descriptions.');
  const ids = new Set();
  const classes = new Set();
  for (const component of catalog.components) {
    if (!component || typeof component !== 'object') fail('Invalid component description.');
    if (!/^[a-z][a-z0-9-]{0,79}$/.test(component.id || '') || ids.has(component.id) || !/^zero\.community\.[A-Z][A-Za-z0-9]*$/.test(component.className || '') || classes.has(component.className)) fail('Invalid or duplicate component identity.');
    ids.add(component.id); classes.add(component.className);
    plain(component.name, 'name'); plain(component.description, 'description');
    // License labels do not grant review or maintainer authority.
    // Keep older local UNLICENSED catalogs usable alongside owner-licensed MIT source.
    if (component.status !== 'experimental' || !['MIT', 'UNLICENSED'].includes(component.license) || component.maintainer !== null) fail('Local proof components must remain experimental, use MIT or historical UNLICENSED metadata, and have no named maintainer.');
    if (!Array.isArray(component.api) || !component.api.length || component.api.length > 100 || !Array.isArray(component.examples) || component.examples.length > 100) fail('Invalid component API or examples.');
    component.api.forEach(entry => plain(entry, 'API entry'));
    for (const example of component.examples) {
      if (!example || typeof example !== 'object') fail('Invalid component example.');
      if (!/^[a-z][a-z0-9-]{0,79}$/.test(example.id || '')) fail('Invalid example identity.');
      relativePath(example.path); plain(example.description, 'example description');
    }
  }
  return {catalog, catalogPath, repositoryPath, repositoryUrl: pathToFileURL(repositoryPath).href, fingerprint: hash(bytes)};
}

// A deliberately small, structural XML reader. Offsets preserve all unowned bytes.
// Unsupported namespaces, entities, DTDs and processing instructions fail closed.
function parseXml(text) {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text)) fail('Unsupported POM XML. Use the ordinary Zero starter POM without DTDs or entities.');
  const document = {name: '#document', children: [], comments: []};
  const stack = [document];
  let offset = 0;
  const tokens = /<!--[\s\S]*?-->|<\?xml\s[^?]*\?>|<\/?[A-Za-z_][^<>]*>/g;
  let match;
  while ((match = tokens.exec(text))) {
    appendText(text.slice(offset, match.index), stack.at(-1));
    const token = match[0];
    if (token.startsWith('<!--')) {
      if (token.slice(4, -3).includes('--')) fail('Unsupported POM comment.');
      stack.at(-1).comments.push({text: token.slice(4, -3), start: match.index, end: tokens.lastIndex});
    } else if (token.startsWith('<?')) {
      if (match.index !== 0 || stack.length !== 1) fail('Unsupported POM processing instruction.');
      if (!/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>$/i.test(token)) fail('Use UTF-8 XML 1.0 for the project POM.');
    } else if (token.startsWith('</')) {
      const name = /^<\/([A-Za-z_][A-Za-z0-9_.-]*)\s*>$/.exec(token)?.[1];
      const node = stack.pop();
      if (!name || stack.length < 1 || node.name !== name) fail('The project POM XML is not well formed.');
      node.close = match.index; node.end = tokens.lastIndex;
    } else {
      const parts = /^<([A-Za-z_][A-Za-z0-9_.-]*)([\s\S]*?)(\/?)>$/.exec(token);
      if (!parts) fail('Unsupported POM XML names or namespaces.');
      const [, name, attributes, self] = parts;
      if (attributes.trim() && !(name === 'project' && stack.length === 1 && validRootAttributes(attributes))) fail('Unsupported POM attributes. Use the ordinary Zero starter layout.');
      const node = {name, children: [], comments: [], text: '', start: match.index, open: tokens.lastIndex, parent: stack.at(-1)};
      stack.at(-1).children.push(node);
      if (self) { node.close = match.index; node.end = tokens.lastIndex; node.selfClosing = true; } else stack.push(node);
    }
    offset = tokens.lastIndex;
  }
  appendText(text.slice(offset), stack.at(-1));
  if (stack.length !== 1 || document.children.length !== 1 || document.children[0].name !== 'project' || document.text?.trim()) fail('The project POM XML is not well formed.');
  const project = document.children[0];
  if (allNodes(project).some(node => node.children.length && node.text.trim())) fail('Unsupported mixed XML content in the project POM.');
  return project;
}
function validRootAttributes(input) {
  const entries = input.match(/(?:xmlns(?::xsi)?|xsi:schemaLocation)\s*=\s*(?:"[^"]*"|'[^']*')/g) || [];
  if (input.replace(/(?:xmlns(?::xsi)?|xsi:schemaLocation)\s*=\s*(?:"[^"]*"|'[^']*')/g, '').trim()) return false;
  const names = entries.map(item => item.split(/\s*=/)[0]);
  return names.length === new Set(names).size && entries.every(entry => {
    const content = entry.match(/=(?:\s*)["']([\s\S]*)["']$/)[1];
    if (entry.startsWith('xmlns:xsi')) return content === 'http://www.w3.org/2001/XMLSchema-instance';
    if (entry.startsWith('xmlns=' ) || /^xmlns\s*=/.test(entry)) return content === 'http://maven.apache.org/POM/4.0.0';
    return content === 'http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd';
  });
}
function appendText(text, node) {
  if (text.includes('<') || /&(?!amp;|lt;|gt;|quot;|apos;)/.test(text) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) fail('Unsupported POM XML text or entity.');
  node.text = (node.text || '') + text;
}
function value(node) {
  if (!node || node.children.length) fail('Expected one ordinary POM value.');
  return node.text.trim().replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ({amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"})[name]);
}
function single(node, name, optional = false) {
  const nodes = node.children.filter(child => child.name === name);
  if (nodes.length > 1 || (!optional && nodes.length !== 1)) fail(`Expected one ${name} in the ordinary Zero POM.`);
  return nodes[0];
}
function allNodes(node) { return [node, ...node.children.flatMap(allNodes)]; }
function markers(text, parent, kind, required) {
  const start = ` Zero community ${kind}: start `;
  const end = ` Zero community ${kind}: end `;
  const starts = parent.comments.filter(comment => comment.text === start);
  const ends = parent.comments.filter(comment => comment.text === end);
  if (!starts.length && !ends.length && !required) return null;
  if (starts.length !== 1 || ends.length !== 1 || starts[0].end > ends[0].start) fail('The managed community POM blocks were edited. Restore them or manage this dependency manually.');
  const nodes = parent.children.filter(node => node.start > starts[0].end && node.end < ends[0].start);
  if (nodes.length !== 1 || text.slice(starts[0].end, nodes[0].start).trim() || text.slice(nodes[0].end, ends[0].start).trim()) fail('The managed community POM block is ambiguous.');
  return {start: starts[0].start, end: ends[0].end, node: nodes[0]};
}
async function projectFiles(root, catalog) {
  root = path.resolve(root);
  if (await fs.realpath(root) !== root || !(await fs.lstat(root)).isDirectory()) fail('Open the ordinary student project directory without symbolic links.');
  await ordinaryFile(path.join(root, 'zero.json'), 'The Zero project marker');
  const pomPath = await ordinaryFile(path.join(root, 'pom.xml'), 'The project POM');
  const beforeText = await fs.readFile(pomPath, 'utf8');
  const classes = new Set(catalog.components.map(component => component.className));
  const sourceRoot = path.join(root, 'src');
  async function walk(directory) {
    let entries;
    try { entries = await fs.readdir(directory, {withFileTypes: true}); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail('The student source tree contains a symbolic link. Use ordinary source files before adding the library.');
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile() && entry.name.endsWith('.java')) {
        const source = (await fs.readFile(filename, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\r\n]*/g, ' ');
        const packageName = /\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/.exec(source)?.[1];
        for (const name of classes) {
          const simple = name.split('.').at(-1);
          if ((packageName === name.slice(0, -(simple.length + 1)) && new RegExp(`\\b(?:class|interface|enum|record)\\s+${simple}\\b`).test(source)) || filename.endsWith(path.join(...name.split('.')) + '.java')) fail(`A student source copy shadows ${name}. Keep your edits and move or rename the copy before using the Maven library.`);
        }
      }
    }
  }
  const sourceStat = await fs.lstat(sourceRoot).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (sourceStat?.isSymbolicLink()) fail('The student source tree contains a symbolic link.');
  if (sourceStat) await walk(sourceRoot);
  return {root, pomPath, beforeText, beforeHash: hash(beforeText)};
}
async function inspectProject(root, context) {
  const repositoryId = context.repositoryId || REPOSITORY;
  const snapshot = await projectFiles(root, context.catalog);
  const document = parseXml(snapshot.beforeText);
  const properties = single(document, 'properties');
  const dependencies = single(document, 'dependencies');
  const repositories = single(document, 'repositories', true);
  if (properties.selfClosing || dependencies.selfClosing || repositories?.selfClosing) fail('Use ordinary nonempty POM containers for community dependencies.');
  if (value(single(properties, 'maven.compiler.release')) !== '17' || value(single(properties, 'javafx.version')) !== '21.0.12') fail('This component requires Java 17 and JavaFX 21.0.12. Zero will not change your Java versions.');
  // Profiles/parents/management can override apparently compatible project values.
  if (single(document, 'parent', true)) fail('Parent-managed Maven projects require manual component configuration.');
  for (const node of allNodes(document)) {
    if (['sourceDirectory', 'testSourceDirectory'].includes(node.name)) fail('Custom source directories require manual component configuration.');
    if (['maven.compiler.release', 'maven.compiler.source', 'maven.compiler.target', 'javafx.version'].includes(node.name) && node.parent !== properties) fail('Profile or plugin Java compatibility overrides require manual component configuration.');
  }
  for (const node of allNodes(document)) {
    if (node.name === 'dependency') {
      const group = single(node, 'groupId', true);
      const artifact = single(node, 'artifactId', true);
      if ((group && value(group).includes('${')) || (artifact && value(artifact).includes('${'))) fail('Property-managed dependency coordinates require manual community configuration.');
      if (group && value(group) === 'org.openjfx') {
        const specified = value(single(node, 'version'));
        if (!['21.0.12', '${javafx.version}'].includes(specified)) fail('The project JavaFX dependency does not use 21.0.12. Zero will not change it.');
      }
    }
    if (node.name === 'plugin' && node.children.some(child => child.name === 'artifactId' && value(child) === 'maven-compiler-plugin')) {
      const configuration = single(node, 'configuration', true);
      if (configuration && allNodes(configuration).some(child => ['release', 'source', 'target', 'compilerArgs', 'compilerArguments', 'jdkToolchain'].includes(child.name))) fail('Compiler configuration overrides require manual compatibility review.');
    }
  }
  const communityDependencies = allNodes(document).filter(node => node.name === 'dependency' && node.children.some(child => child.name === 'artifactId' && value(child) === ARTIFACT));
  const dependencyBlock = markers(snapshot.beforeText, dependencies, 'dependency', communityDependencies.length > 0);
  const historyBlock = markers(snapshot.beforeText, properties, 'history', Boolean(dependencyBlock));
  const repositoryBlock = repositories ? markers(snapshot.beforeText, repositories, 'repository', Boolean(dependencyBlock)) : null;
  const historyNodes = allNodes(document).filter(node => node.name === PREVIOUS);
  const repositoryNodes = allNodes(document).filter(node => node.name === 'repository' && node.children.some(child => child.name === 'id' && [REPOSITORY, PUBLIC_REPOSITORY].includes(value(child))));
  let currentVersion = null;
  let previousVersion = null;
  if (dependencyBlock) {
    const dependency = dependencyBlock.node;
    if (communityDependencies.length !== 1 || dependency !== communityDependencies[0] || dependency.name !== 'dependency' || dependency.children.length !== 3 || value(single(dependency, 'groupId')) !== GROUP || value(single(dependency, 'artifactId')) !== ARTIFACT) fail('A manual or duplicate community dependency needs manual configuration.');
    currentVersion = releaseVersion(value(single(dependency, 'version')));
    if (!context.catalog.releases.some(release => release.version === currentVersion)) fail('The installed library version is not in this catalog. Use the catalog that supplied this project’s library.');
    if (!historyBlock || historyBlock.node.name !== PREVIOUS || historyNodes.length !== 1 || !repositoryBlock) fail('Community dependency history or repository is missing.');
    previousVersion = value(historyBlock.node);
    if (previousVersion === 'none') previousVersion = null;
    else if (!context.catalog.releases.some(release => release.version === releaseVersion(previousVersion))) fail('The preceding version is not in this catalog. Use the catalog that supplied this project’s library.');
    const repository = repositoryBlock.node;
    if (repositoryNodes.length !== 1 || repository !== repositoryNodes[0] || repository.name !== 'repository' || repository.children.length !== 4 || value(single(repository, 'id')) !== repositoryId || value(single(repository, 'url')) !== context.repositoryUrl || value(single(single(repository, 'releases'), 'enabled')) !== 'true' || value(single(single(repository, 'snapshots'), 'enabled')) !== 'false' || single(repository, 'releases').children.length !== 1 || single(repository, 'snapshots').children.length !== 1) fail('The managed community repository was changed. Review its origin manually or choose the original catalog.');
  } else if (historyBlock || repositoryBlock || historyNodes.length || repositoryNodes.length) fail('Incomplete managed community configuration. Restore the complete blocks before continuing.');
  // No stray/renamed markers may acquire ownership or be silently ignored.
  const managedComments = allNodes(document).flatMap(node => node.comments).filter(comment => /^\s*Zero community [A-Za-z]+:/.test(comment.text));
  if (managedComments.length !== (dependencyBlock ? 6 : 0)) fail('Unrecognized community POM markers. Review the configuration manually.');
  return {...snapshot, currentVersion, previousVersion, _xml: {document, properties, dependencies, repositories, dependencyBlock, historyBlock, repositoryBlock}};
}
async function readProject(root, context) {
  const {_xml, ...snapshot} = await inspectProject(root, context);
  return snapshot;
}
function block(kind, body, newline) {
  return `<!-- Zero community ${kind}: start -->${newline}${body}${newline}    <!-- Zero community ${kind}: end -->`;
}
async function prepareChange(root, context, targetVersion, {operation = 'add'} = {}) {
  if (!['add', 'update', 'revert'].includes(operation)) fail('Choose add, update or revert.');
  const project = await inspectProject(root, context);
  if (operation === 'add' && project.currentVersion) fail('The community library is already installed. Choose Update or Revert.');
  if (operation !== 'add' && !project.currentVersion) fail('Add a component library before updating or reverting it.');
  if (operation === 'revert') {
    if (!project.previousVersion) fail('No preceding library version is recorded. Revert becomes available after updating this library.');
    if (targetVersion != null && targetVersion !== project.previousVersion) fail('Revert only restores the recorded preceding library version.');
    targetVersion = project.previousVersion;
  }
  releaseVersion(targetVersion);
  if (!context.catalog.releases.some(release => release.version === targetVersion)) fail('Choose an immutable release listed in the catalog.');
  if (targetVersion === project.currentVersion) fail('That library version is already installed.');
  if (operation === 'update') {
    const a = targetVersion.split('.').map(Number); const b = project.currentVersion.split('.').map(Number);
    if (a[0] !== b[0] || a[1] !== b[1] || a[2] <= b[2]) fail('Update supports a newer compatible patch. Use Revert for the recorded preceding version.');
  }
  await verifyRelease(context, targetVersion);
  const newline = project.beforeText.includes('\r\n') ? '\r\n' : '\n';
  const dependency = block('dependency', `    <dependency>${newline}      <groupId>${GROUP}</groupId>${newline}      <artifactId>${ARTIFACT}</artifactId>${newline}      <version>${targetVersion}</version>${newline}    </dependency>`, newline);
  const history = block('history', `    <${PREVIOUS}>${project.currentVersion || 'none'}</${PREVIOUS}>`, newline);
  const repository = block('repository', `    <repository>${newline}      <id>${context.repositoryId || REPOSITORY}</id>${newline}      <url>${xmlEscape(context.repositoryUrl)}</url>${newline}      <releases><enabled>true</enabled></releases>${newline}      <snapshots><enabled>false</enabled></snapshots>${newline}    </repository>`, newline);
  const edits = [];
  const xml = project._xml;
  function change(container, owned, content) {
    if (owned) edits.push({start: owned.start, end: owned.end, text: content});
    else {
      const lineStart = project.beforeText.lastIndexOf('\n', container.close - 1) + 1;
      if (/^[ \t]*$/.test(project.beforeText.slice(lineStart, container.close))) edits.push({start: lineStart, end: lineStart, text: `    ${content}${newline}`});
      else edits.push({start: container.close, end: container.close, text: `${newline}    ${content}${newline}  `});
    }
  }
  change(xml.dependencies, xml.dependencyBlock, dependency);
  change(xml.properties, xml.historyBlock, history);
  if (xml.repositories) change(xml.repositories, xml.repositoryBlock, repository);
  else edits.push({start: xml.document.close, end: xml.document.close, text: `  <repositories>${newline}    ${repository}${newline}  </repositories>${newline}`});
  let afterText = project.beforeText;
  for (const edit of edits.sort((a, b) => b.start - a.start)) afterText = afterText.slice(0, edit.start) + edit.text + afterText.slice(edit.end);
  parseXml(afterText);
  const {_xml, ...snapshot} = project;
  return {...snapshot, afterText, targetVersion, operation, catalogFingerprint: context.fingerprint, repositoryUrl: context.repositoryUrl, summary: `${operation === 'add' ? 'Add' : operation === 'update' ? 'Update' : 'Revert'} ${context.catalog.origin === 'public-release' ? '' : 'experimental '}Zero community library: ${project.currentVersion || 'not installed'} → ${targetVersion}. Only pom.xml changes; your Java source stays yours.`};
}
async function validatePrepared(plan, context) {
  const fresh = await reloadCatalog(context);
  if (fresh.fingerprint !== context.fingerprint || plan.catalogFingerprint !== fresh.fingerprint || fresh.repositoryUrl !== plan.repositoryUrl) fail(`The component catalog or ${context.catalog.origin === 'public-release' ? 'public' : 'local'} repository changed. Review a new plan.`);
  const project = await readProject(plan.root, fresh);
  if (project.root !== plan.root || project.pomPath !== plan.pomPath || project.beforeHash !== plan.beforeHash || project.beforeText !== plan.beforeText || project.currentVersion !== plan.currentVersion || project.previousVersion !== plan.previousVersion) fail('Your POM changed after review. Prepare a new component change to preserve your edits.');
  const again = await prepareChange(plan.root, fresh, plan.targetVersion, {operation: plan.operation});
  if (again.afterText !== plan.afterText) fail('The prepared component change is no longer valid. Review a new plan.');
  return true;
}
async function reloadCatalog(context) {
  return context.catalog.origin === 'public-release' ? context.reload() : loadCatalog(context.catalogPath);
}
async function verifyRelease(context, version) {
  if (context.catalog.origin !== 'public-release') return;
  const contents = await context.verifyRelease(version);
  const pom = parseXml(contents.pom.toString('utf8'));
  if (value(single(pom, 'groupId')) !== GROUP || value(single(pom, 'artifactId')) !== ARTIFACT || value(single(pom, 'version')) !== version) fail('Release POM coordinates do not match the public catalog.');
  const licenses = single(pom, 'licenses', true);
  const mit = licenses?.children.some(license => {
    if (license.name !== 'license') return false;
    const name = single(license, 'name', true), url = single(license, 'url', true);
    return (name && ['MIT','MIT License'].includes(value(name))) || (url && value(url) === 'https://opensource.org/licenses/MIT');
  });
  if (!mit) fail('The public release POM must declare the MIT license.');
}
module.exports = {loadCatalog, loadPublicCatalog, reloadCatalog, verifyRelease, readProject, prepareChange, validatePrepared};
