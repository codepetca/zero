import {createHash} from 'node:crypto';
import discovery from '../../extension/src/component-discovery.js';
export const {discoveryGroups, recommendationFor, componentVersion, componentVersions} = discovery;

export const repositoryUrl = 'https://zero.codepet.ca/community/maven';
const repository = 'codepetca/zero-community';
const suffixes = {jar: '.jar', pom: '.pom', sources: '-sources.jar', javadoc: '-javadoc.jar'};
const maxBytes = 2 * 1024 * 1024;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const requireValue = (value, message) => {if (!value) throw new Error(message);};
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed) {
  requireValue(object(value) && Object.keys(value).every(key => allowed.includes(key)), 'Unexpected community manifest fields.');
}
function text(value, limit = 8000) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
}
function version(value) {
  return typeof value === 'string' && value.length <= 60 && versionPattern.test(value) && value.split('.').every(part => Number.isSafeInteger(Number(part)));
}
function asset(value, releaseVersion, filename) {
  keys(value, ['path', 'filename', 'size', 'sha256', 'url']);
  requireValue(Number.isSafeInteger(value.size) && value.size > 0 && value.size <= maxBytes && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256), 'Invalid public component asset receipt.');
  requireValue(value.url === `https://github.com/${repository}/releases/download/v${releaseVersion}/${filename}`, 'Unexpected community asset URL.');
}

// This is a reviewed build snapshot, never metadata supplied by a browser or PR.
export function validateCommunityManifest(manifest) {
  keys(manifest, ['schemaVersion', 'origin', 'publication', 'repositoryUrl', 'library', 'latest', 'components', 'releases', 'discovery']);
  keys(manifest.publication, ['status', 'repository']);
  keys(manifest.library, ['groupId', 'artifactId', 'version', 'javaRelease', 'javafxVersion']);
  requireValue([1, 2].includes(manifest.schemaVersion) && manifest.origin === 'public-release' && manifest.publication.repository === repository && ['local', 'published'].includes(manifest.publication.status), 'Unsupported community publication.');
  requireValue(manifest.repositoryUrl === repositoryUrl && manifest.library.groupId === 'school.zero.community' && manifest.library.artifactId === 'zero-community' && manifest.library.javaRelease === 17 && manifest.library.javafxVersion === '21.0.12' && version(manifest.latest) && manifest.library.version === manifest.latest, 'Unsupported community library.');
  requireValue(Array.isArray(manifest.releases) && manifest.releases.length <= 100 && Array.isArray(manifest.components), 'Invalid community catalog.');
  if (manifest.publication.status === 'local') {
    requireValue(manifest.releases.length === 0 && manifest.components.length === 0 && manifest.discovery === undefined, 'Unpublished community placeholders cannot contain download claims.');
    return manifest;
  }
  requireValue(manifest.components.length > 0 && manifest.components.length <= 100, 'Invalid public component count.');
  const ids = new Set(), classes = new Set();
  for (const component of manifest.components) {
    keys(component, ['id', 'name', 'className', 'description', 'api', 'examples', 'status', 'license', 'maintainer', 'category', 'versions']);
    requireValue(typeof component.id === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(component.id) && !ids.has(component.id) && typeof component.className === 'string' && /^zero\.community\.[A-Z][A-Za-z0-9]*$/.test(component.className) && !classes.has(component.className) && text(component.name, 200) && component.status === 'experimental' && component.license === 'MIT' && component.maintainer === null && text(component.description), 'Unsupported public component.');
    ids.add(component.id); classes.add(component.className);
    requireValue(Array.isArray(component.api) && component.api.length > 0 && component.api.length <= 100 && component.api.every(entry => text(entry)) && Array.isArray(component.examples) && component.examples.length <= 100, 'Invalid public API.');
    const examples = new Set();
    for (const example of component.examples) {
      keys(example, ['id', 'path', 'description']);
      requireValue(typeof example.id === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(example.id) && !examples.has(example.id) && example.path === `examples/${example.id}/Main.java` && text(example.description), 'Invalid public example.');
      examples.add(example.id);
    }
  }
  const versions = new Set();
  for (const release of manifest.releases) {
    keys(release, ['version', 'sourceRevision', 'sourceDigest', 'notes', 'artifacts', 'workshop']);
    requireValue(version(release.version) && !versions.has(release.version) && typeof release.sourceRevision === 'string' && /^[a-f0-9]{40}$/.test(release.sourceRevision) && typeof release.sourceDigest === 'string' && /^[a-f0-9]{64}$/.test(release.sourceDigest) && text(release.notes, 2000), 'Invalid community release provenance.');
    versions.add(release.version);
    keys(release.artifacts, Object.keys(suffixes));
    requireValue(Object.keys(release.artifacts).length === 4, 'A library needs its binary, POM, source and API artifacts.');
    for (const [kind, suffix] of Object.entries(suffixes)) {
      const filename = `zero-community-${release.version}${suffix}`;
      const item = release.artifacts[kind];
      asset(item, release.version, filename);
      requireValue(item.path === `school/zero/community/zero-community/${release.version}/${filename}` && item.filename === undefined, 'Unexpected Maven path.');
    }
    if (release.workshop) {
      const filename = `zero-community-workshop-${release.version}.zip`;
      asset(release.workshop, release.version, filename);
      requireValue(release.workshop.filename === filename && release.workshop.path === undefined, 'Unexpected Workshop filename.');
    }
  }
  requireValue(versions.has(manifest.latest), 'The latest community version is missing.');
  discovery.validateDiscovery(manifest);
  return manifest;
}

async function verifiedBytes(asset, request) {
  const response = await request(asset.url, {cache: 'no-store', signal: AbortSignal.timeout(20000), redirect: 'follow'});
  requireValue(response.status === 200, 'Community artifact unavailable.');
  const length = response.headers.get('content-length');
  requireValue(length === null || (/^\d+$/.test(length) && Number(length) <= maxBytes), 'Community artifact exceeded its size bound.');
  requireValue(response.body, 'Community artifact has no body.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      requireValue(size <= asset.size && size <= maxBytes, 'Community artifact size drift.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = Buffer.concat(chunks);
  requireValue(size === asset.size && digest(bytes) === asset.sha256, 'Community artifact checksum drift.');
  return bytes;
}
const failure = (status, message) => new Response(message, {status, headers: {'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff'}});

// Older released extensions reject new discovery fields. Keep their endpoint
// on its original shape while newer extensions use catalog-v2.json.
export function legacyCommunityCatalog(manifest) {
  validateCommunityManifest(manifest);
  const component = manifest.components.find(item => item.id === 'health-bar' && item.className === 'zero.community.HealthBar');
  if (!component) return null;
  const versions = discovery.componentVersions(manifest, component);
  if (!versions.length) return null;
  const latest = versions.at(-1);
  const {discovery: ignored, ...legacy} = manifest;
  const {category: ignoredCategory, versions: ignoredVersions, ...healthBar} = component;
  return {...legacy, schemaVersion:1, latest, library:{...manifest.library, version:latest}, components:[healthBar]};
}

export function catalogResponse(manifest, head = false, {legacy = false} = {}) {
  validateCommunityManifest(manifest);
  if (manifest.publication.status !== 'published') return failure(503, 'The public component catalog is not ready.');
  const payload = legacy ? legacyCommunityCatalog(manifest) : manifest;
  if (!payload) return failure(503, 'The catalog for this older Zero version is unavailable.');
  return new Response(head ? null : JSON.stringify(payload) + '\n', {headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff'}});
}

export async function artifactResponse(manifest, parts, {request = fetch, head = false, workshop = false} = {}) {
  validateCommunityManifest(manifest);
  if (manifest.publication.status !== 'published') return failure(503, 'The public component library is not ready.');
  let selected, checksum, filename;
  if (workshop) {
    selected = manifest.releases.find(release => release.version === manifest.latest)?.workshop;
    filename = selected?.filename;
  } else {
    if (!Array.isArray(parts) || parts.some(part => typeof part !== 'string' || !/^[A-Za-z0-9.-]+$/.test(part) || part === '.' || part === '..')) return failure(404, 'Unknown component artifact.');
    let relative = parts.join('/');
    const match = /\.(sha1|sha256)$/.exec(relative);
    if (match) {checksum = match[1]; relative = relative.slice(0, -match[0].length);}
    selected = manifest.releases.flatMap(release => Object.values(release.artifacts)).find(item => item.path === relative);
    filename = relative.split('/').at(-1);
  }
  if (!selected) return failure(404, 'Unknown component artifact.');
  try {
    const bytes = await verifiedBytes(selected, request);
    const body = checksum ? Buffer.from(digest(bytes, checksum) + '\n') : bytes;
    return new Response(head ? null : new Uint8Array(body), {headers: {
      'Content-Type': checksum ? 'text/plain; charset=utf-8' : filename.endsWith('.pom') ? 'application/xml' : workshop ? 'application/zip' : 'application/java-archive',
      'Content-Length': String(body.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      ...(workshop ? {'Content-Disposition': `attachment; filename="${filename}"`} : {}),
    }});
  } catch {
    return failure(502, 'The component download is unavailable or failed verification. Try again later.');
  }
}
