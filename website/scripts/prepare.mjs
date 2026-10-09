import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../lib/contracts.mjs';
const site = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(site, '..');
const sources = {
  setup: 'docs/GETTING-STARTED.md', api: 'student-template/API.md', starter: 'student-template/README.md',
  exercises: 'student-template/EXERCISES.md', components: 'docs/COMPONENTS.md', workshop: 'component-workshop/README.md',
  verification: 'docs/VERIFICATION.md', pilot: 'docs/CLASSROOM-PILOT.md', development: 'docs/DEVELOPMENT.md', product: 'docs/PRODUCT.md',
};
const docs = {};
for (const [slug, source] of Object.entries(sources)) docs[slug] = { source, markdown: await readFile(resolve(root, source), 'utf8') };
const release = validateManifest(JSON.parse(await readFile(resolve(root, 'release/kit.json'), 'utf8')));
await mkdir(resolve(site, '.generated'), { recursive: true });
await mkdir(resolve(site, 'public/generated'), { recursive: true });
await writeFile(resolve(site, '.generated/content.json'), JSON.stringify({ release, docs }, null, 2) + '\n');
// Reuse supplied paths exactly; only the approved logo colour changes.
const logo = (await readFile(resolve(root, 'extension/media/zero.svg'), 'utf8')).replaceAll('currentColor', '#683BEF');
await writeFile(resolve(site, 'public/generated/zero.svg'), logo);
await copyFile(resolve(root, 'docs/design/actual-zero-editor.png'), resolve(site, 'public/generated/editor.jpg'));
await copyFile(resolve(site, 'node_modules/bootstrap-icons/icons/download.svg'), resolve(site, 'public/generated/download.svg'));
console.log(`Prepared release ${release.kitVersion} and ${Object.keys(docs).length} canonical documents.`);
