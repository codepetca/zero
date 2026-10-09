'use strict';
// Public discovery has one trusted root. Maven still resolves every dependency.
const {createHash} = require('node:crypto');
const CATALOG_URL = 'https://zero.codepet.ca/community/catalog.json';
const REPOSITORY_URL = 'https://zero.codepet.ca/community/maven';
const REPOSITORY_ID = 'zero-community-public';
const SUFFIXES = {jar: '.jar', pom: '.pom', sources: '-sources.jar', javadoc: '-javadoc.jar'};
const MAX_ARTIFACT = 2 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
function fields(value, names, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !names.includes(key))) fail(`Unsupported public catalog ${label} fields.`);
}
function plain(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 8000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) fail(`Invalid public catalog ${label}.`);
}
function version(value) {
  if (typeof value !== 'string' || value.length > 60 || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) || !value.split('.').every(part => Number.isSafeInteger(Number(part)))) fail('The public catalog must use exact immutable release versions.');
}
function receipt(value, expectedPath, expectedUrl, label, limit = MAX_ARTIFACT) {
  if (value.path !== expectedPath || value.url !== expectedUrl || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.size) || value.size <= 0 || value.size > limit) fail(`Invalid public ${label} path, URL, size or SHA256.`);
}
function validateCatalog(catalog) {
  fields(catalog, ['schemaVersion','origin','publication','repositoryUrl','library','latest','components','releases'], 'root');
  fields(catalog.publication, ['status','repository'], 'publication');
  fields(catalog.library, ['groupId','artifactId','version','javaRelease','javafxVersion'], 'library');
  if (catalog.schemaVersion !== 1 || catalog.origin !== 'public-release' || catalog.publication.status !== 'published' || catalog.publication.repository !== 'codepetca/zero-community' || catalog.repositoryUrl !== REPOSITORY_URL || catalog.library.groupId !== 'school.zero.community' || catalog.library.artifactId !== 'zero-community' || catalog.library.javaRelease !== 17 || catalog.library.javafxVersion !== '21.0.12') fail('Only the published Zero community catalog for Java 17 and JavaFX 21.0.12 is supported.');
  version(catalog.latest);
  if (catalog.library.version !== catalog.latest || !Array.isArray(catalog.releases) || !catalog.releases.length || catalog.releases.length > 100) fail('The public catalog needs indexed immutable releases.');
  const versions = new Set();
  for (const release of catalog.releases) {
    fields(release, ['version','sourceRevision','sourceDigest','notes','artifacts','workshop'], 'release');
    version(release.version);
    if (versions.has(release.version) || typeof release.sourceRevision !== 'string' || !/^[a-f0-9]{40}$/.test(release.sourceRevision) || typeof release.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(release.sourceDigest)) fail('Invalid or duplicate public release provenance.');
    versions.add(release.version); plain(release.notes, 'release notes');
    fields(release.artifacts, Object.keys(SUFFIXES), 'artifacts');
    for (const [kind, suffix] of Object.entries(SUFFIXES)) {
      const artifact = release.artifacts[kind];
      fields(artifact, ['path','size','sha256','url'], `${kind} artifact`);
      const name = `zero-community-${release.version}${suffix}`;
      receipt(artifact, `school/zero/community/zero-community/${release.version}/${name}`, `https://github.com/codepetca/zero-community/releases/download/v${release.version}/${name}`, kind);
    }
    if (release.workshop !== undefined) {
      fields(release.workshop, ['filename','size','sha256','url'], 'workshop');
      const name = `zero-community-workshop-${release.version}.zip`;
      receipt({...release.workshop, path: release.workshop.filename}, name, `https://github.com/codepetca/zero-community/releases/download/v${release.version}/${name}`, 'Workshop');
    }
  }
  if (!versions.has(catalog.latest)) fail('The latest public version is not indexed.');
  if (!Array.isArray(catalog.components) || catalog.components.length !== 1) fail('The public catalog supports one HealthBar component.');
  const component = catalog.components[0];
  fields(component, ['id','name','className','description','api','examples','status','license','maintainer'], 'component');
  if (component.id !== 'health-bar' || component.className !== 'zero.community.HealthBar' || component.license !== 'MIT' || !['experimental','checked','community-reviewed','deprecated'].includes(component.status) || !(component.maintainer === null || (typeof component.maintainer === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(component.maintainer)))) fail('Invalid public HealthBar identity, license or status.');
  plain(component.name, 'component name'); plain(component.description, 'component description');
  if (!Array.isArray(component.api) || !component.api.length || component.api.length > 100 || !Array.isArray(component.examples) || component.examples.length > 100) fail('Invalid public component API or examples.');
  component.api.forEach(entry => plain(entry, 'API entry'));
  const examples = new Set();
  for (const example of component.examples) {
    fields(example, ['id','path','description'], 'example');
    if (!/^[a-z][a-z0-9-]{0,79}$/.test(example.id || '') || examples.has(example.id) || typeof example.path !== 'string' || !/^examples\/[a-z][a-z0-9-]{0,79}\/Main\.java$/.test(example.path)) fail('Invalid public example identity or path.');
    examples.add(example.id); plain(example.description, 'example description');
  }
  return catalog;
}
async function readBytes(url, limit, fetchBytes, timeoutMs) {
  const controller = new AbortController();
  let timer, reader;
  const operation = (async () => {
    const response = await fetchBytes(url, {redirect:'error', credentials:'omit', cache:'no-store', signal:controller.signal});
    if (!response.ok) fail(`Public community download returned HTTP ${response.status}. Try the component action again when the service is available.`);
    if (response.url && response.url !== url) fail('The public community download redirected away from its trusted URL.');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) fail('The public community download exceeds its size limit.');
    if (!response.body) fail('The public community download has no content.');
    reader = response.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) fail('The public community download exceeds its size limit.');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  })();
  try {
    return await Promise.race([operation, new Promise((_, reject) => {timer = setTimeout(() => {
      controller.abort(); reject(new Error('The public community download timed out. Check your connection and try the component action again.'));
    }, timeoutMs);})]);
  } catch (error) {
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
    if (error.message.startsWith('The public community') || error.message.startsWith('Public community')) throw error;
    fail('The public community download failed. Check your connection and try the component action again.');
  } finally { clearTimeout(timer); }
}
async function loadPublicCatalog({fetch: fetchBytes = globalThis.fetch, timeoutMs = 15000} = {}) {
  const bytes = await readBytes(CATALOG_URL, 1024 * 1024, fetchBytes, timeoutMs);
  let catalog;
  try { catalog = JSON.parse(bytes.toString('utf8')); } catch { fail('The public community catalog is not valid JSON.'); }
  validateCatalog(catalog);
  return {catalog, catalogUrl:CATALOG_URL, repositoryUrl:REPOSITORY_URL, repositoryId:REPOSITORY_ID, fingerprint:hash(bytes),
    reload: () => loadPublicCatalog({fetch:fetchBytes, timeoutMs}),
    async verifyRelease(releaseVersion) {
      const release = catalog.releases.find(item => item.version === releaseVersion);
      if (!release) fail('Choose an immutable release listed in the public catalog.');
      const contents = await Promise.all(Object.entries(release.artifacts).map(async ([kind, artifact]) => {
        const content = await readBytes(`${REPOSITORY_URL}/${artifact.path}`, artifact.size, fetchBytes, timeoutMs);
        if (content.length !== artifact.size || hash(content) !== artifact.sha256) fail(`The public ${kind} digest or size for ${releaseVersion} does not match. No dependency change was applied; try again after the release is repaired.`);
        return [kind, content];
      }));
      return Object.fromEntries(contents);
    }};
}
module.exports = {CATALOG_URL, REPOSITORY_URL, REPOSITORY_ID, loadPublicCatalog};
