// Run from any directory: node teaching/new-curriculum/pet/verify.mjs [--native] [--web]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {zipSync} from 'fflate';
import {starterMembers} from '../../../scripts/kit.mjs';
import {extractProject, maven} from '../../../scripts/verification-project.mjs';
import {assertZeroOnly} from '../../../scripts/verify-basic-games.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const args = process.argv.slice(2);
assert.ok(args.every(arg => ['--native', '--web'].includes(arg)), 'Use --native and/or --web');
const lessonPaths = ['13-pet.md', '16-pet-motion.md', '17-pet-class.md'];
const checkpoints = ['1/Main.java', '3/Pet.java', '3/Main.java'];
const blocks = lessonPaths.flatMap(file => [...read(`student-template/lessons/${file}`).matchAll(/^```java\s*\n([\s\S]*?)^```\s*$/gm)].map(match => match[1]));
assert.equal(blocks.length, checkpoints.length, 'Split lessons must have three complete Java blocks');
for (const [index, name] of checkpoints.entries()) {
  const canonical = read(`teaching/checkpoints/13/${name}`);
  assert.equal(blocks[index], canonical, `Lesson block ${index + 1} differs from ${name}`);
  assert.equal(read(`teaching/new-curriculum/pet/checkpoints/${name}`), canonical, `Draft differs from canonical checkpoint ${name}`);
  assertZeroOnly(canonical, name);
}
for (const [asset, original] of [
  ['bird-flap-sheet.png', 'student-template/examples/sprite-playground/src/main/resources/bird-flap-sheet.png'],
  ['chime.wav', 'student-template/examples/media-demo/resources/media-demo/chime.wav'],
]) assert.deepEqual(fs.readFileSync(path.join(here, 'resources/pet', asset)), fs.readFileSync(path.join(root, original)), `${asset} differs from its attributed original`);

const screens = read('student-template/lessons/14-own-project.md');
const edits = [...screens.matchAll(/^```java-after-([\d-]+)\s*\n([\s\S]*?)^```\s*$/gm)];
assert.equal(edits.length, 6, 'Expected six screen lesson edits');
let main = read('teaching/checkpoints/13/3/Main.java');
for (const [index, edit] of edits.entries()) {
  const lines = edit[2].replace(/\n$/, '').split('\n');
  const additions = edit[1].split('-').map(Number);
  assert.equal(new Set(additions).size, additions.length, `Edit ${index + 1} repeats a highlighted line`);
  assert.ok(additions.every(n => n >= 1 && n <= lines.length), `Edit ${index + 1} has an invalid highlighted line`);
  const context = lines.filter((_, i) => !additions.includes(i + 1)).join('\n');
  assert.ok(context, `Edit ${index + 1} has no matching context`);
  const first = main.indexOf(context);
  assert.ok(first !== -1, `Edit ${index + 1} context does not match the previous step`);
  assert.equal(main.indexOf(context, first + 1), -1, `Edit ${index + 1} context is ambiguous`);
  main = main.slice(0, first) + lines.join('\n') + main.slice(first + context.length);
}
assertZeroOnly(main, 'Completed screen Main.java');
assert.match(main, /private boolean playing = false;/);
assert.match(main, /new Button\("Start"\)/);
assert.match(main, /navigation\.onClick\(this::switchScreen\)/);
assert.match(main, /playing = !playing;\s*navigation\.setText\(playing \? "Back" : "Start"\)/);
assert.match(main, /update\(double seconds\)\s*\{\s*if \(!playing\) return;[\s\S]*?pet\.update\(direction, seconds, width\(\)\);[\s\S]*?chime\.play\(\)/);
assert.match(main, /draw\(\)\s*\{\s*if \(!playing\)\s*\{[\s\S]*?text\("MY PET GAME"[\s\S]*?return;\s*\}[\s\S]*?pet\.draw\(this\)/);
assert.equal((main.match(/pet = new Pet\(/g) || []).length, 1, 'Pet must be created once in setup');
for (const file of ['bird-flap-sheet.png', 'chime.wav']) assert.ok(main.includes(`/pet/${file}`), `Missing ${file}`);

const motion = read('student-template/lessons/16-pet-motion.md');
assert.match(motion, /working game on \*\*main\*\*[\s\S]*Commit & push[\s\S]*GitHub/i);
const petClassLesson = read('student-template/lessons/17-pet-class.md');
assert.match(petClassLesson, /## 1\. Start a branch[\s\S]*committed and pushed on \*\*main\*\*[\s\S]*New branch[\s\S]*pet-refactor[\s\S]*## 2\. Give the pet its own class/i);
const motionEdits = [...motion.matchAll(/^```java-after-([\d-]+)(?:-r([\d-]+))?\s*\n([\s\S]*?)^```\s*$/gm)];
assert.equal(motionEdits.length, 14, 'Expected the movement, animation and sound edits');
let motionMain = read('teaching/checkpoints/13/1/Main.java');
for (const [index, edit] of motionEdits.entries()) {
  const lines = edit[3].replace(/\n$/, '').split('\n');
  const added = edit[1].split('-').map(Number);
  const removed = edit[2] ? edit[2].split('-').map(Number) : [];
  assert.ok([...added, ...removed].every(n => n >= 1 && n <= lines.length), `Motion edit ${index + 1} has invalid line numbers`);
  assert.ok(added.every(n => !removed.includes(n)), `Motion edit ${index + 1} cannot add and remove the same line`);
  const before = lines.filter((_, i) => !added.includes(i + 1)).join('\n');
  const after = lines.filter((_, i) => !removed.includes(i + 1)).join('\n');
  const first = motionMain.indexOf(before);
  assert.ok(before && first !== -1, `Motion edit ${index + 1} does not match the preceding code`);
  assert.equal(motionMain.indexOf(before, first + 1), -1, `Motion edit ${index + 1} matches more than once`);
  motionMain = motionMain.slice(0, first) + after + motionMain.slice(first + before.length);
}
assert.equal(motionMain, read('teaching/checkpoints/13/2/Main.java'), 'Motion edits must reproduce the working checkpoint');
assert.equal(read('teaching/new-curriculum/pet/checkpoints/2/Main.java'), motionMain, 'Draft motion checkpoint must match');
const sections = screens.split(/^## /m);
const section = name => { const result = sections.find(text => text.startsWith(name)); assert.ok(result, `Missing section: ${name}`); return result; };
assert.match(section('4. Save and share'), /Commit & push[\s\S]*Merge to main[\s\S]*Publish/i);
const recovery = section('5. Practise recovering');
for (const pattern of [/verify on GitHub/i, /published app actually opens and works/i, /uncommitted/i, /untracked/i, /unpushed/i, /ignored/i, /backup/i, /do not empty the Trash/i, /clone your own repository into a different empty location/i, /restore the original folder/i]) assert.match(recovery, pattern, `Missing recovery safeguard: ${pattern}`);
assert.ok(recovery.indexOf('verify on GitHub') < recovery.indexOf('Move the original'), 'Verification must precede moving the project');
console.log('Split pet lessons, sequential screen edits, assets, and workflow checks passed.');

if (args.length) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-pet-verification-'));
  try {
    const members = starterMembers(root);
    for (const name of Object.keys(members)) if (name.startsWith('zero-starter/examples/') || name.startsWith('zero-starter/lessons/') || /^zero-starter\/src\/main\/java\/[^/]+\.java$/.test(name)) delete members[name];
    const project = extractProject(zipSync(members), 'zero-starter', temp);
    fs.writeFileSync(path.join(project, 'src/main/java/Main.java'), main);
    fs.writeFileSync(path.join(project, 'src/main/java/Pet.java'), read('teaching/checkpoints/13/3/Pet.java'));
    fs.cpSync(path.join(here, 'resources/pet'), path.join(project, 'src/main/resources/pet'), {recursive: true});
    if (args.includes('--native')) { maven(project, ['compile']); console.log('Completed pet source native Maven compile passed.'); }
    if (args.includes('--web')) {
      const require = createRequire(import.meta.url);
      const {exportForWeb} = require(path.join(project, '.zero-build/src/web-export'));
      await exportForWeb({projectRoot: project, cacheRoot: path.join(root, '.verification/web-export-checks/cache'), onProgress: message => console.log(message)});
      console.log('Completed pet source WebFX export passed.');
    }
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
}
