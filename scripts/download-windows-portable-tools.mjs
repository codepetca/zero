import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, rm, open} from 'node:fs/promises';
import path from 'node:path';
import {root} from './release.mjs';

const [output, ...extra] = process.argv.slice(2);
assert.ok(output && !extra.length, 'Usage: node scripts/download-windows-portable-tools.mjs NEW_DIRECTORY');
const directory = path.resolve(output);
await mkdir(directory);
const readJSON = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const runtimes = (await readJSON('setup/windows-downloads.json')).architectures.x64;
const pins = {jdk:runtimes.jdk, node:runtimes.node, git:runtimes.git,
  vscodium:await readJSON('native-installer/windows/portable-editor.json'),
  java:await readJSON('native-installer/windows/portable-java.json')};
await Promise.all(Object.entries(pins).map(async ([name, asset]) => {
  const url = new URL(asset.url);
  assert.ok(url.protocol === 'https:' && ['github.com', 'nodejs.org'].includes(url.host));
  assert.ok(Number.isSafeInteger(asset.size) && asset.size > 0 && /^[a-f0-9]{64}$/.test(asset.sha256));
  const filename = path.join(directory, name === 'java' ? 'java.vsix' : name + '.zip');
  const partial = filename + '.partial';
  try {
    const response = await fetch(url, {signal:AbortSignal.timeout(300000)});
    assert.equal(response.status, 200, 'Portable vendor download failed for ' + name);
    const hash = createHash('sha256');
    let size = 0;
    const handle = await open(partial, 'wx');
    try {
      for await (const bytes of response.body) {
        size += bytes.length;
        assert.ok(size <= asset.size, 'Portable vendor download is oversized');
        hash.update(bytes);
        await handle.writeFile(bytes);
      }
    } finally { await handle.close(); }
    assert.equal(size, asset.size, name + ' vendor size drift');
    assert.equal(hash.digest('hex'), asset.sha256, name + ' vendor checksum drift');
    await rename(partial, filename);
    console.log('Verified ' + name);
  } catch (error) {
    await rm(partial, {force:true});
    throw error;
  }
}));
