import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {artifactResponse, catalogResponse, validateCommunityManifest, repositoryUrl} from '../lib/community.mjs';

const sha = (bytes, kind = 'sha256') => createHash(kind).update(bytes).digest('hex');
function fixture() {
  const version = '0.1.2';
  const bodies = new Map();
  const artifacts = {};
  for (const [kind, suffix] of Object.entries({jar: '.jar', pom: '.pom', sources: '-sources.jar', javadoc: '-javadoc.jar'})) {
    const filename = `zero-community-${version}${suffix}`;
    const bytes = Buffer.from(`reviewed ${kind} content`);
    const url = `https://github.com/codepetca/zero-community/releases/download/v${version}/${filename}`;
    artifacts[kind] = {path: `school/zero/community/zero-community/${version}/${filename}`, size: bytes.length, sha256: sha(bytes), url};
    bodies.set(url, bytes);
  }
  const filename = `zero-community-workshop-${version}.zip`, bytes = Buffer.from('reviewed portable Workshop');
  const workshop = {filename, size: bytes.length, sha256: sha(bytes), url: `https://github.com/codepetca/zero-community/releases/download/v${version}/${filename}`};
  bodies.set(workshop.url, bytes);
  const manifest = {schemaVersion: 1, origin: 'public-release', publication: {status: 'published', repository: 'codepetca/zero-community'}, repositoryUrl,
    library: {groupId: 'school.zero.community', artifactId: 'zero-community', version, javaRelease: 17, javafxVersion: '21.0.12'}, latest: version,
    components: [{id: 'health-bar', name: 'HealthBar', className: 'zero.community.HealthBar', description: 'A health display.', api: ['HealthBar(int maximum)'], examples: [{id: 'adventure', path: 'examples/adventure/Main.java', description: 'Use it in an app.'}], status: 'experimental', license: 'MIT', maintainer: null}],
    releases: [{version, sourceRevision: 'a'.repeat(40), sourceDigest: 'b'.repeat(64), notes: 'First public MIT release.', artifacts, workshop}]};
  const calls = [];
  const request = async (url, options) => {
    calls.push({url, options});
    assert.ok(bodies.has(url), 'Only pinned GitHub asset URLs can be fetched.');
    return new Response(bodies.get(url));
  };
  return {manifest, bodies, request, calls};
}

test('public catalog retains exact pinned manifest and publishes no local placeholder', async () => {
  const {manifest} = fixture();
  assert.deepEqual(await catalogResponse(manifest).json(), manifest);
  const local = {...manifest, publication: {...manifest.publication, status: 'local'}, components: [], releases: []};
  assert.equal(catalogResponse(local).status, 503);
  assert.equal(catalogResponse(local).headers.get('cache-control'), 'no-store');
});

for (const kind of ['jar', 'pom', 'sources', 'javadoc']) test(`Maven ${kind} and checksum routes return only verified pinned bytes`, async () => {
  const {manifest, bodies, request, calls} = fixture();
  const item = manifest.releases[0].artifacts[kind];
  for (const checksum of ['', '.sha1', '.sha256']) {
    const response = await artifactResponse(manifest, (item.path + checksum).split('/'), {request});
    assert.equal(response.status, 200);
    const actual = Buffer.from(await response.arrayBuffer());
    const expected = checksum ? Buffer.from(sha(bodies.get(item.url), checksum.slice(1)) + '\n') : bodies.get(item.url);
    assert.deepEqual(actual, expected);
    assert.match(response.headers.get('cache-control'), /immutable/);
  }
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.url === item.url && call.options.cache === 'no-store'));
});

test('unknown paths, traversal, unsupported coordinates and checksum types never fetch', async () => {
  const f = fixture();
  const path = f.manifest.releases[0].artifacts.jar.path;
  for (const value of ['../secret', path.replace('school/', 'elsewhere/'), path.replace('0.1.2/', '0.1.1/'), path + '.md5', path + '%2fsecret', path + '?url=https://example.com', '__proto__/constructor']) {
    assert.equal((await artifactResponse(f.manifest, value.split('/'), {request: f.request})).status, 404);
  }
  assert.equal(f.calls.length, 0);
});

test('corrupt, oversized and unavailable upstream bytes are refused without caching', async () => {
  const {manifest} = fixture();
  const item = manifest.releases[0].artifacts.jar;
  for (const request of [
    async () => new Response(Buffer.alloc(item.size)),
    async () => new Response(Buffer.alloc(item.size + 1)),
    async () => new Response('not found', {status: 404}),
    async () => {throw new Error('Timed out');},
    async () => new Response('content', {headers: {'Content-Length': String(3 * 1024 * 1024)}}),
    async () => new Response(null),
  ]) {
    const response = await artifactResponse(manifest, item.path.split('/'), {request});
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(!response.headers.has('location'), 'No unchecked redirect is returned.');
  }
});

test('failed downloads can retry and HEAD verifies actual bytes without returning a body', async () => {
  const f = fixture();
  const item = f.manifest.releases[0].artifacts.jar;
  assert.equal((await artifactResponse(f.manifest, item.path.split('/'), {request: async () => {throw new Error('offline');}})).status, 502);
  const response = await artifactResponse(f.manifest, item.path.split('/'), {request: f.request, head: true});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(item.size));
  assert.equal((await response.arrayBuffer()).byteLength, 0);
  assert.equal(f.calls.length, 1);
});

test('portable Workshop download uses its own exact receipt', async () => {
  const f = fixture();
  const response = await artifactResponse(f.manifest, [], {workshop: true, request: f.request});
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.bodies.get(f.manifest.releases[0].workshop.url));
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.match(response.headers.get('content-disposition'), /zero-community-workshop-0.1.2.zip/);
});

test('manifest cannot redirect downloads, grant acceptance or add executable fields', () => {
  const mutations = [
    m => {m.repositoryUrl = 'https://example.com/maven';},
    m => {m.publication.repository = 'someone/else';},
    m => {m.library.javaRelease = 21;},
    m => {m.components[0].status = 'community-reviewed';},
    m => {m.components[0].commands = ['shell'];},
    m => {m.releases[0].artifacts.jar.url = 'https://example.com/file';},
    m => {m.releases[0].artifacts.jar.path = '../file.jar';},
    m => {m.releases[0].artifacts.jar.sha256 = 'not a checksum';},
    m => {m.releases[0].artifacts.jar.size = 3 * 1024 * 1024;},
    m => {m.releases[0].sourceRevision = 'main';},
    m => {m.releases.push(structuredClone(m.releases[0]));},
    m => {delete m.releases[0].artifacts.sources;},
  ];
  for (const mutate of mutations) {const {manifest} = fixture(); mutate(manifest); assert.throws(() => validateCommunityManifest(manifest));}
});
