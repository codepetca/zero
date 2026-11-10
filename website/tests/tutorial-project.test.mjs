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

test('tutorial steps remain sequential and name the visible Run control', async () => {
  for (const file of [
    '00-hello-world.md', '01-hello-button.md', '02-hello-name.md', '03-quiz.md',
    '04-counter.md', '05-methods.md', '06-objects.md', '07-study-app.md',
    '08-movement.md', '09-coin-game.md', '10-components.md', '11-zerohub.md',
    '12-media.md', '13-pet.md', '14-own-project.md', '15-recover-zero.md',
    '16-pet-motion.md', '17-pet-class.md', '18-actors.md',
  ]) {
    const text = await readFile(new URL(`../../student-template/lessons/${file}`, import.meta.url), 'utf8');
    const numbers = [...text.matchAll(/^## (\d+)\./gm)].map(match => Number(match[1]));
    assert.deepEqual(numbers, numbers.map((_, index) => index + 1), file);
    assert.doesNotMatch(text, /\bRun App\b/, file);
    assert.doesNotMatch(text, /Project → Open local project…/, file);
  }
});

test('practice library instructions name the actual command before each menu choice', async () => {
  const text = await readFile(new URL('../../student-template/lessons/11-zerohub.md', import.meta.url), 'utf8');
  assert.match(text, /\]\(https:\/\/zero\.codepet\.ca\/hub\?kind=practice\)/);
  for (const action of ['Extract library', 'Browse tutorial practice']) {
    assert.match(text, new RegExp(`\\*\\*Zero: Libraries and Games\\*\\*[\\s\\S]*?\\n\\n\\*\\*${action}\\*\\*\\n\\n`));
  }
});
