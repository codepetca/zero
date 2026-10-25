import {manifestData} from '../../jams/manifest.mjs';
import {readFile, lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {zipSync, strToU8} from 'fflate';

export const JAM_TEMPLATE_VERSION = '1.0.0';
// Explicit source inventory: never include checkout/private/generated files.
export const JAM_TEMPLATE_FILES = Object.freeze([
  'index.html', 'zero-jam.json', 'README.md', 'LICENSE', 'assets/jam.css',
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
export async function jamTemplateFiles(type = 'game', root, customManifest) {
  if (!['game', 'app'].includes(type)) throw new TypeError('Choose Game Jam or App Jam.');
  if (customManifest && customManifest.type !== type) throw new TypeError('The jam type must match its details.');
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
  files['zero-jam.json'] = strToU8(`${JSON.stringify(customManifest ? manifestData(customManifest) : manifest, null, 2)}\n`);
  return files;
}
export async function createJamTemplateZip(type = 'game', customManifest) {
  const files = await jamTemplateFiles(type, undefined, customManifest);
  // Fixed timestamps make repeated downloads of unchanged source reproducible.
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, bytes]) => [`zero-${type}-jam/${path}`, [bytes, {mtime:new Date('2026-01-01T00:00:00Z')}]])), {level:6});
}

// Preview the exact canonical source without granting it the parent origin or
// network access. User metadata stays in escaped JSON and is rendered as text.
export async function createJamTemplatePreview(input) {
  const manifest=manifestData(input);
  const files=await jamTemplateFiles(manifest.type,undefined,manifest);
  const decode=path=>new TextDecoder().decode(files[path]);
  const mark=`data:image/svg+xml;base64,${Buffer.from(files['assets/mark.svg']).toString('base64')}`;
  const data=JSON.stringify(manifest).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";
  const html=decode('index.html')
    .replace('<head>',()=>`<head><meta http-equiv="Content-Security-Policy" content="${policy}">`)
    .replace('<link rel="stylesheet" href="assets/jam.css">',()=>`<style>${decode('assets/jam.css')}</style>`)
    .replace('<script src="assets/jam.js" defer></script>','')
    .replaceAll('assets/mark.svg',mark)
    // CSP does not stop document navigation. Disable preview anchors as well;
    // downloaded source keeps every original link and in-page shortcut.
    .replace(/(<a\b[^>]*?)\s+href="[^"]*"/g,'$1 aria-disabled="true"')
    .replace('</body>',()=>`<script id="zero-jam-preview-data" type="application/json">${data}</script><script>${decode('assets/jam.js')}</script></body>`);
  return {html,manifest};
}
