import {readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lessons} from '../website/lib/learning.mjs';
import tutorialCatalog from '../extension/src/tutorial-catalog.js';
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_FILE_BYTES = 256 * 1024;
function read(root, relative) {
  const filename = path.join(root, relative);
  if (!statSync(filename).isFile() || statSync(filename).size > MAX_FILE_BYTES) throw new Error(`Tutorial source is missing or too large: ${relative}`);
  return readFileSync(filename, 'utf8');
}
// The bundled reader has no network or student-project source dependency. Its
// manifest is generated from the same authored curriculum as the public reader.
export function prepareTutorials({root = repository, check = false} = {}) {
  const directory = path.join(root, 'extension/media');
  const result = {schema:1, groups:tutorialCatalog.tutorialGroups, lessons:[]};
  const assets = [];
  for (const metadata of lessons) {
    const name = tutorialCatalog.lessonFiles[metadata.id];
    if (!name) throw new Error(`Missing canonical lesson ${metadata.id}.`);
    const source = `student-template/lessons/${name}`;
    const markdown = read(root, source);
    const references = {};
    for (const match of markdown.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1].split('#')[0];
      if (/^(?:[a-z]+:|\/)/i.test(href)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(source), href));
      if (target.startsWith('teaching/checkpoints/') && tutorialCatalog.referencePath(target)) references[target] = read(root, target);
      if (/^student-template\/examples\/[a-z-]+\/README\.md$/.test(target)) {
        // Later optional references remain readable offline, including their
        // complete Java files, rather than sending students to a network page.
        references[target] = read(root, target);
        for (const filename of readdirSync(path.join(root, path.posix.dirname(target)))) {
          if (/^[A-Za-z]+\.java$/.test(filename)) {
            const java = path.posix.join(path.posix.dirname(target), filename);
            references[java] = read(root, java);
          }
        }
      }
    }
    // The first lessons also offer the canonical full checkpoint after the
    // student has tried the small edits, even when no source link was authored.
    const checkpoint = `teaching/checkpoints/${metadata.id}/Main.java`;
    if (Number(metadata.id) < 10) references[checkpoint] = read(root, checkpoint);
    const asset = `${metadata.id.padStart(2,'0')}.svg`;
    const svg = read(root, `student-template/lessons/visuals/${asset}`);
    if (/<(?:script|foreignObject)\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:|data:|\/\/)/i.test(svg)) throw new Error(`Unsafe tutorial illustration: ${asset}`);
    assets.push({asset, svg});
    result.lessons.push({...metadata, title:markdown.match(/^#\s+(?:\d+\.\s*)?(.+)$/m)?.[1] || metadata.title,source,markdown,references,asset});
  }
  const text = `${JSON.stringify(result)}\n`;
  if (Buffer.byteLength(text) > 3 * 1024 * 1024) throw new Error('Tutorial bundle exceeds its size limit.');
  if (check) {
    if (readFileSync(path.join(directory,'tutorial-content.json'),'utf8') !== text) throw new Error('Tutorial bundle is stale. Run node scripts/prepare-tutorials.mjs.');
    for (const {asset,svg} of assets) if (readFileSync(path.join(directory,'tutorial-assets',asset),'utf8') !== svg) throw new Error(`Stale tutorial illustration: ${asset}`);
  } else {
    mkdirSync(path.join(directory,'tutorial-assets'), {recursive:true});
    writeFileSync(path.join(directory,'tutorial-content.json'),text);
    for (const {asset} of assets) copyFileSync(path.join(root,'student-template/lessons/visuals',asset),path.join(directory,'tutorial-assets',asset));
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepareTutorials({check:process.argv.includes('--check')});
