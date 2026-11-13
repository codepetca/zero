import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {hubListingThumbnailResponse, listingThumbnailPath} from '../lib/hub-listing-thumbnail.mjs';
import {projectPattern, projectPatternSeed} from '../lib/project-pattern.mjs';

const crcTable = Array.from({length:256}, (_, value) => { for (let bit = 0; bit < 8; bit++) value = value >>> 1 ^ (value & 1 ? 0xedb88320 : 0); return value >>> 0; });
const crc32 = bytes => { let crc = 0xffffffff; for (const byte of bytes) crc = crc >>> 8 ^ crcTable[(crc ^ byte) & 255]; return (crc ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]), out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4); return out;
}
function png(width, height = width) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}

const env = {ZERO_HUB_LISTINGS_ENABLED:'1'};
const commit = 'a'.repeat(40), repositoryId = '123';
const listed = {repositoryUrl:'https://github.com/Student/space-game', pagesUrl:'https://student.github.io/space-game/'};
function serve({entry = listed, body = png(256), status = 200, headers = {}} = {}) {
  const requests = [];
  const getStore = () => ({listedPublication:async (...args) => { requests.push(['store', ...args]); return entry; }});
  const fetchImpl = async (url, options) => { requests.push(['fetch', url, options.redirect]); return new Response(body, {status, headers}); };
  return {requests, response:hubListingThumbnailResponse(new Request('https://zero.codepet.ca/x'), {repositoryId, commit}, {env, getStore, fetchImpl})};
}

test('a listed app serves its checked zero-thumbnail.png from its canonical Pages address', async () => {
  const {requests, response} = serve();
  const result = await response;
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-type'), 'image/png');
  assert.match(result.headers.get('cache-control'), /s-maxage=86400/);
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), png(256));
  assert.deepEqual(requests, [['store', repositoryId, commit], ['fetch', 'https://student.github.io/space-game/zero-thumbnail.png', 'error']]);
});

test('missing, invalid, oversized, unlisted or non-canonical thumbnails are 404s for the pattern fallback', async () => {
  const cases = [
    serve({status:404, body:'missing'}),
    serve({body:png(256, 200)}),
    serve({body:png(64)}),
    serve({body:Buffer.from('<svg/>'), headers:{'content-type':'image/svg+xml'}}),
    serve({body:Buffer.alloc(1024 * 1024 + 1), headers:{'content-length':String(1024 * 1024 + 1)}}),
    serve({entry:null}),
    serve({entry:{...listed, pagesUrl:'https://games.example.com/'}}),
  ];
  for (const {response, requests} of cases) {
    const result = await response;
    assert.equal(result.status, 404);
    assert.match(result.headers.get('cache-control'), /s-maxage=3600/);
    assert.ok(requests.filter(item => item[0] === 'fetch').every(item => item[1].startsWith('https://student.github.io/')));
  }
  const invalid = await hubListingThumbnailResponse(new Request('https://zero.codepet.ca/x'), {repositoryId:'0', commit}, {env, getStore:() => assert.fail('no lookup')});
  assert.equal(invalid.status, 404);
  const disabled = await hubListingThumbnailResponse(new Request('https://zero.codepet.ca/x'), {repositoryId, commit}, {env:{}, getStore:() => assert.fail('no lookup')});
  assert.equal(disabled.status, 404);
});

test('thumbnail links name an exact listed commit', () => {
  assert.equal(listingThumbnailPath(repositoryId, commit), `/api/hub/listings/thumbnail/123/${commit}`);
  assert.equal(listingThumbnailPath('x', commit), undefined);
  assert.equal(listingThumbnailPath(repositoryId, 'main'), undefined);
});

test('the default pattern is a deterministic mirrored block grid seeded by username and repository', () => {
  const seed = projectPatternSeed('Student', 'Space-Game');
  assert.equal(seed, 'student/space-game');
  const first = projectPattern(seed), again = projectPattern('student/space-game'), other = projectPattern('student/other-game');
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, other);
  assert.match(first.foreground, /^hsl\(\d+ 62% 52%\)$/);
  assert.ok(first.cells.length > 0 && first.cells.length < 25);
  const cells = new Set(first.cells.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of first.cells) assert.ok(cells.has(`${first.size - 1 - x},${y}`), 'pattern is mirrored');
});
