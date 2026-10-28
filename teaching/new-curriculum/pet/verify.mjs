// Run from any directory: node teaching/new-curriculum/pet/verify.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const lesson = read('student-template/lessons/13-pet.md');
const blocks = [...lesson.matchAll(/^```java\s*\n([\s\S]*?)^```\s*$/gm)].map(match => match[1]);
const checkpoints = ['1/Main.java', '2/Main.java', '3/Pet.java', '3/Main.java'];
assert.equal(blocks.length, checkpoints.length, 'Lesson must have four Java blocks');
for (const [index, name] of checkpoints.entries()) {
  const canonical = read(`teaching/checkpoints/13/${name}`);
  const draft = read(`teaching/new-curriculum/pet/checkpoints/${name}`);
  assert.equal(blocks[index].replace(/\r\n/g, '\n'), canonical.replace(/\r\n/g, '\n'), `Lesson block ${index + 1} differs from ${name}`);
  assert.equal(draft, canonical, `Draft differs from canonical checkpoint ${name}`);
  // Ignore comments and strings, so a teaching explanation cannot trigger a false positive.
  const code = canonical.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
  assert.doesNotMatch(code, /\bjavafx\b/, `${name} uses JavaFX directly`);
}
for (const [asset, original] of [
  ['bird-flap-sheet.png', 'student-template/examples/sprite-playground/src/main/resources/bird-flap-sheet.png'],
  ['chime.wav', 'student-template/examples/media-demo/resources/media-demo/chime.wav'],
]) {
  assert.deepEqual(readFileSync(path.join(here, 'resources/pet', asset)), readFileSync(path.join(root, original)), `${asset} differs from its attributed original`);
}
const sections = lesson.split(/^## /m);
const section = name => {
  const result = sections.find(text => text.startsWith(name));
  assert.ok(result, `Missing section: ${name}`);
  return result;
};
const initial = section('4. Save the first working version');
assert.match(initial, /working game on \*\*main\*\*[\s\S]*Commit & push[\s\S]*GitHub[\s\S]*New branch/i);
const share = section('6. Save and share');
assert.match(share, /Commit & push[\s\S]*Merge to main[\s\S]*Publish/i);
const recovery = section('7. Practise recovering');
for (const pattern of [/verify on GitHub/i, /published app actually opens and works/i, /uncommitted/i, /untracked/i, /unpushed/i, /ignored/i, /backup/i, /do not empty the Trash/i, /clone your own repository into a different empty location/i, /restore the original folder/i]) {
  assert.match(recovery, pattern, `Missing recovery safeguard: ${pattern}`);
}
assert.ok(recovery.indexOf('verify on GitHub') < recovery.indexOf('Move the original'), 'Verification must precede moving the project');
console.log('Pet lesson code, assets, and workflow checks passed.');
