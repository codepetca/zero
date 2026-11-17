import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {portableDigest, writePublicPortable} from './windows-portable-package.mjs';
import {root} from './release.mjs';

// Reuse the verified school's launcher and embed only a vendor download plan.
const [candidate, outputDirectory, manifestFile] = process.argv.slice(2);
if (!candidate || !outputDirectory || process.argv.length > 5)
  throw new Error('Usage: node scripts/package-windows-portable-public.mjs PRIVATE_ZIP NEW_OUTPUT_DIRECTORY [LOCAL_MANIFEST]');
const manifest = JSON.parse(readFileSync(manifestFile ?? path.join(root, 'release/windows-portable-pilot.json'), 'utf8'));
const measured = manifest.localAsset;
const privateBytes = readFileSync(candidate);
assert.equal(privateBytes.length, measured.size);
assert.equal(portableDigest(privateBytes), measured.sha256);
const extract = name => execFileSync('unzip', ['-p', path.resolve(candidate), `Zero Portable/${name}`], {maxBuffer:16 * 1024 * 1024});
const metadata = JSON.parse(extract('BUILD.json'));
assert.equal(metadata.kitVersion, manifest.kitVersion);
assert.equal(metadata.sourceRevision, manifest.sourceRevision);
writePublicPortable(root, metadata, extract, path.resolve(outputDirectory), measured);
