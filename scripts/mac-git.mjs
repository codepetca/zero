import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {selectSparklePython} from './mac-updater.mjs';

const architectures = ['arm64', 'x64'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = root => JSON.parse(readFileSync(join(root, 'setup/mac-downloads.json')));
const license = root => JSON.parse(readFileSync(join(root, 'setup/mac-git-license.json')));

function verifiedBytes(file, pin) {
  const metadata = lstatSync(file);
  assert.ok(metadata.isFile() && metadata.size === pin.size, `Pinned size for ${file}`);
  const bytes = readFileSync(file);
  assert.equal(digest(bytes), pin.sha256, `Pinned checksum for ${file}`);
  return bytes;
}

function acquire(run, cache, pin) {
  const file = join(cache, pin.sha256);
  if (existsSync(file)) {
    verifiedBytes(file, pin);
    return file;
  }
  const work = mkdtempSync(join(cache, 'download-'));
  try {
    const temporary = join(work, 'asset');
    run('/usr/bin/curl', ['--disable', '--fail', '--location', '--silent', '--show-error', '--proto', '=https',
      '--proto-redir', '=https', '--connect-timeout', '20', '--max-time', '150',
      '--max-filesize', String(pin.size), '--output', temporary, pin.url]);
    verifiedBytes(temporary, pin);
    renameSync(temporary, file);
    return file;
  } finally {
    rmSync(work, {recursive:true, force:true});
  }
}

export function verifyBundledMacGit(root, folder) {
  const pins = manifest(root).architectures;
  const files = ['COPYING', 'NOTICE', ...architectures.map(arch => `${arch}.tar.xz`)];
  assert.ok(lstatSync(folder).isDirectory(), 'Git resources must be a real folder');
  assert.deepEqual(readdirSync(folder).sort(), files.sort(), 'Bundled Git resource layout');
  for (const arch of architectures) verifiedBytes(join(folder, `${arch}.tar.xz`), pins[arch].git.bundled);
  verifiedBytes(join(folder, 'COPYING'), license(root).COPYING);
  const notice = readFileSync(join(root, 'setup/mac-git-notice.txt'));
  assert.deepEqual(verifiedBytes(join(folder, 'NOTICE'), {size:notice.length, sha256:digest(notice)}), notice);
}

export function bundleMacGit(run, root, resources) {
  const cache = join(root, '.verification', 'mac-git-cache');
  const configuration = join(root, 'setup/mac-downloads.json');
  const pins = manifest(root).architectures;
  mkdirSync(cache, {recursive:true});
  const work = mkdtempSync(join(cache, 'package-'));
  const output = join(resources, 'Git');
  try {
    for (const arch of architectures) copyFileSync(acquire(run, cache, pins[arch].git), join(work, `${arch}.tar.gz`));
    copyFileSync(acquire(run, cache, license(root).COPYING), join(work, 'COPYING'));
    run(selectSparklePython(run, root), [join(root, 'setup/package-mac-git.py'), configuration, work, output]);
    verifyBundledMacGit(root, output);
  } finally {
    rmSync(work, {recursive:true, force:true});
  }
}

// The Mac release publishes the corresponding Git source beside its binary.
export function macGitSourceAssets(run, root) {
  const cache = join(root, '.verification', 'mac-git-cache');
  mkdirSync(cache, {recursive:true});
  const pins = license(root);
  return Object.fromEntries(Object.entries(pins).filter(([name]) => name !== 'COPYING').map(([name, pin]) =>
    [name, verifiedBytes(acquire(run, cache, pin), pin)]));
}
