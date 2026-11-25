import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
import {root} from './release.mjs';
import {verifyKit} from './verify-kit.mjs';
import {validateManifest} from '../website/lib/contracts.mjs';

const metadataPaths = ['release/kit.json', 'release/published-kit.json', 'release/windows-portable-bundle.json'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function git(cwd, args, maxBuffer = 64 * 1024 * 1024) {
  const result = spawnSync('git', args, {cwd, maxBuffer, encoding:null});
  if (result.error || result.status !== 0) throw new Error(`Git could not verify published source: ${args[0]}`);
  return result.stdout;
}

// Read only reviewed committed metadata, and fail if the working copy differs.
export function publishedBinding(repositoryRoot) {
  const data = {};
  for (const name of metadataPaths) {
    const committed = git(repositoryRoot, ['show', `HEAD:${name}`]);
    const working = readFileSync(path.join(repositoryRoot, name));
    assert.deepEqual(working, committed, `Published metadata must match HEAD: ${name}`);
    data[name] = JSON.parse(committed.toString('utf8'));
  }
  const manifest = validateManifest(data['release/kit.json']);
  assert.equal(manifest.publication.status, 'published', 'Published kit required');
  assert.deepEqual(manifest, validateManifest(data['release/published-kit.json']), 'Published kit manifest differs from its reviewed record');
  const bundle = data['release/windows-portable-bundle.json'];
  assert.equal(bundle.publication?.status, 'published', 'Published Portable source binding required');
  assert.equal(bundle.kitVersion, manifest.kitVersion, 'Portable and published kit versions differ');
  assert.equal(bundle.kitSha256, manifest.assets.kit.sha256, 'Portable references a different published kit');
  assert.match(bundle.kitSourceRevision || '', /^[a-f0-9]{40}$/, 'Published kit source revision is missing');
  const tagCommit = git(repositoryRoot, ['rev-parse', '--verify', `refs/tags/${manifest.publication.tag}^{commit}`]).toString('utf8').trim();
  assert.equal(tagCommit, bundle.kitSourceRevision, 'Published tag and recorded kit source differ');
  return {manifest, sourceRevision:bundle.kitSourceRevision};
}

// git archive is generated from the locally verified commit, never from a kit.
// Validate every tracked entry before writing a temporary, isolated source tree.
function snapshotSource(repositoryRoot, sourceRevision, destination) {
  const listing = git(repositoryRoot, ['ls-tree', '-rz', '--full-tree', sourceRevision]).toString('utf8');
  const names = new Map();
  for (const entry of listing.split('\0').filter(Boolean)) {
    const match = /^(100644|100755) blob [a-f0-9]{40}\t(.+)$/.exec(entry);
    assert.ok(match, 'Published source must contain only regular tracked files');
    const name = match[2];
    assert.ok(name.split('/').every(part => part && part !== '.' && part !== '..' && !/[\\:\x00-\x1f]/.test(part)), 'Unsafe published source path');
    const folded = name.toLowerCase();
    assert.ok(!names.has(folded), 'Published source has colliding paths');
    names.set(folded, name);
  }
  assert.ok(names.size > 0 && names.size < 20000, 'Invalid published source inventory');
  const archive = git(repositoryRoot, ['archive', '--format=zip', sourceRevision]);
  const entries = unzipSync(archive);
  const files = Object.keys(entries).filter(name => !name.endsWith('/'));
  assert.equal(files.length, names.size, 'Published source archive inventory differs');
  let total = 0;
  for (const name of files) {
    assert.equal(names.get(name.toLowerCase()), name, 'Unexpected published source archive entry');
    const bytes = entries[name];
    total += bytes.length;
    assert.ok(bytes.length <= 32 * 1024 * 1024 && total <= 256 * 1024 * 1024, 'Published source archive is too large');
    const target = path.join(destination, ...name.split('/'));
    mkdirSync(path.dirname(target), {recursive:true});
    writeFileSync(target, bytes, {flag:'wx'});
  }
  return {legacyBrowserBuilder:!files.some(name => name.startsWith('teaching/published-builder/'))};
}

export function verifyPublishedKit({repositoryRoot = root, artifactRoot = path.join(root, 'dist'), verify = verifyKit} = {}) {
  const {manifest, sourceRevision} = publishedBinding(repositoryRoot);
  const receipt = JSON.parse(readFileSync(path.join(artifactRoot, 'release.json'), 'utf8'));
  assert.deepEqual(receipt, manifest, 'Published receipt differs from the reviewed manifest');
  for (const key of ['kit', 'starter', 'extension']) {
    const asset = manifest.assets[key];
    const bytes = readFileSync(path.join(artifactRoot, asset.filename));
    assert.equal(bytes.length, asset.size, `Published ${key} size drift`);
    assert.equal(sha256(bytes), asset.sha256, `Published ${key} checksum drift`);
  }
  const sourceRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'zero-published-source-')));
  try {
    const {legacyBrowserBuilder} = snapshotSource(repositoryRoot, sourceRevision, sourceRoot);
    // The original commit records a local candidate; the reviewed published
    // manifest and receipt deliberately bind its immutable released bytes.
    // Do not run the downloaded kit's Maven wrapper or any other kit code.
    verify({sourceRoot, artifactRoot, release:manifest, compile:false, legacyBrowserBuilder});
  } finally {
    rmSync(sourceRoot, {recursive:true, force:true});
  }
  return {sourceRevision, kitVersion:manifest.kitVersion, kitSha256:manifest.assets.kit.sha256};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyPublishedKit();
  console.log(`Verified published kit ${result.kitVersion} against reviewed source ${result.sourceRevision}; no downloaded kit code was executed.`);
  console.log('This immutable kit predates any later PR extension changes; current-source checks remain separate.');
}
