import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const lessons = new Map([
  ['00-hello-world.md', 'zero-greeting'],
  ['03-quiz.md', 'zero-study'],
  ['08-movement.md', 'zero-coin-game'],
  ['13-pet.md', 'zero-pet'],
]);

test('new-project lessons make project creation step one and put the selection on its own line', async () => {
  for (const [file, example] of lessons) {
    const text = await readFile(new URL(`../../student-template/lessons/${file}`, import.meta.url), 'utf8');
    assert.match(text, /## 1\. (?:Create your project|Start your own project)/, file);
    assert.match(text, /\n\n\*\*Project → New\*\*\n\n/, file);
    assert.ok(text.includes(example), file);
    const numbers = [...text.matchAll(/^## (\d+)\./gm)].map(match => Number(match[1]));
    assert.deepEqual(numbers, numbers.map((_, index) => index + 1), file);
  }
});

test('continuing and recovery lessons show the relevant project choices separately', async () => {
  for (const [file, choices] of [
    ['README.md', ['New', 'Open']],
    ['15-recover-zero.md', ['Open', 'New']],
    ['10-components.md', ['Open', 'Clone']],
    ['14-own-project.md', ['Clone']],
  ]) {
    const text = await readFile(new URL(`../../student-template/lessons/${file}`, import.meta.url), 'utf8');
    for (const choice of choices) assert.ok(text.includes(`\n\n**Project → ${choice}**\n\n`), `${file}: ${choice}`);
  }
});

test('branch-based refactors start with the branch action', async () => {
  for (const file of ['17-pet-class.md', '18-actors.md']) {
    const text = await readFile(new URL(`../../student-template/lessons/${file}`, import.meta.url), 'utf8');
    assert.match(text, /## 1\. Start a branch for this change/);
    assert.match(text, /\n\n\*\*New branch…\*\*\n\n/);
  }
});
