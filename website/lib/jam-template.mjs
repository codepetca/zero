import {readFile, lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {zipSync, strToU8} from 'fflate';

export const JAM_TEMPLATE_VERSION = '1.0.0';
// Explicit source inventory: never include checkout/private/generated files.
export const JAM_TEMPLATE_FILES = Object.freeze([
  'index.html', 'zero-jam.json', 'README.md', 'assets/jam.css',
  'assets/jam.js', 'assets/mark.svg', '.github/workflows/pages.yml',
]);
async function canonicalTemplateRoot() {
  // Both repository-root tooling and the website server are supported. Traced
  // deployments retain jam-template beside website; no bundle-relative URL or
  // arbitrary ancestor search is needed. next.config traces this exact source.
  const cwd = process.cwd();
  for (const candidate of [resolve(cwd, 'jam-template'), resolve(cwd, '../jam-template')]) {
    try {
      const directory = await lstat(candidate);
      if (directory.isSymbolicLink()) throw new Error('Linked jam template sources are unavailable.');
      if (directory.isDirectory() && (await lstat(resolve(candidate, 'zero-jam.json'))).isFile()) return candidate;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Jam template source is unavailable.');
}
export async function jamTemplateFiles(type = 'game', root) {
  if (!['game', 'app'].includes(type)) throw new TypeError('Choose Game Jam or App Jam.');
  root ??= await canonicalTemplateRoot();
  // A fixed inventory must not turn a linked source asset into a download of
  // another local file. Validate owned directories and files before reading any.
  const sourceRoot = await lstat(root);
  if (!sourceRoot.isDirectory() || sourceRoot.isSymbolicLink()) throw new Error('Linked jam template sources are unavailable.');
  for (const path of JAM_TEMPLATE_FILES) {
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const info = await lstat(resolve(root,...parts.slice(0,i)));
      if (info.isSymbolicLink() || (i < parts.length ? !info.isDirectory() : !info.isFile() || info.size > 1_048_576))
        throw new Error('Invalid or linked jam template source.');
    }
  }
  const files = Object.fromEntries(await Promise.all(JAM_TEMPLATE_FILES.map(async path => [path, new Uint8Array(await readFile(resolve(root, path)))])));
  const manifest = JSON.parse(new TextDecoder().decode(files['zero-jam.json']));
  if (manifest.schema !== 1 || manifest.templateVersion !== JAM_TEMPLATE_VERSION) throw new Error('Jam template version is unavailable.');
  manifest.type = type;
  if (type === 'app') {
    manifest.title = 'Small Ideas App Jam';
    manifest.summary = 'An example weekend jam: make a small app that makes someone’s day easier.';
    manifest.theme = 'A little everyday help';
  }
  files['zero-jam.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);
  return files;
}
export async function createJamTemplateZip(type = 'game') {
  const files = await jamTemplateFiles(type);
  // Fixed timestamps make repeated downloads of unchanged source reproducible.
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`zero-${type}-jam/${path}`, [bytes, {mtime:new Date('2026-01-01T00:00:00Z')}]])), {level:6});
}
