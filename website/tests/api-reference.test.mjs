import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildApiReference, searchApiReference } from '../lib/api-reference.mjs';

const markdown = await readFile(new URL('../../student-template/API.md', import.meta.url), 'utf8');
const categories = buildApiReference(markdown);
const entries = categories.flatMap(category => category.entries);
const entry = id => entries.find(candidate => candidate.id === id);
const category = id => categories.find(candidate => candidate.id === id);
const normalizeSignature = signature => signature.replace(/\b(public|protected|final)\s+/g, '').replace('javafx.scene.Node', 'Node').replace(/\s+/g, ' ').trim();

test('every class-level public/protected Java declaration has an exact canonical entry', async () => {
  const expected = [];
  for (const owner of ['App', 'GameApp']) {
    const source = await readFile(new URL(`../../framework/src/main/java/zero/${owner}.java`, import.meta.url), 'utf8');
    // Class-level declarations have four-space indentation; the anonymous timer callback has twelve.
    for (const match of source.matchAll(/^ {4}(?:@Override )?((?:public|protected) (?:final )?[\w.]+ \w+\([^)]*\))\s*\{/gm)) {
      expected.push(`${owner}:${normalizeSignature(match[1])}`);
    }
  }
  assert.equal(expected.length, 42);
  assert.deepEqual(entries.map(item => `${item.owner}:${normalizeSignature(item.signature)}`).sort(), expected.sort());
  assert.ok(!entries.some(item => item.name === 'handle'));
  assert.equal(JSON.parse(JSON.stringify(categories)).length, 7);
});

test('categories and entries have unique anchors, valid relationships and complete metadata', () => {
  assert.deepEqual(categories.map(item => [item.id, item.title]), [
    ['startup', 'App startup'], ['interface', 'Window and interface'], ['canvas', 'Canvas'],
    ['drawing', 'Drawing'], ['images', 'Images'], ['input', 'Keyboard and mouse'], ['advanced', 'Advanced'],
  ]);
  const ids = [...categories, ...entries].map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of entries) {
    assert.ok(item.description);
    assert.ok(['App', 'GameApp'].includes(item.owner));
    for (const parameter of item.parameters) assert.ok(parameter.name && parameter.description);
    for (const target of item.related) assert.ok(entry(target), `${item.id} relates to missing ${target}`);
  }
  assert.equal(entry('canvas-access').name, 'canvas');
});

test('classifies callbacks, window operations, overloads and advanced overrides', () => {
  assert.deepEqual(category('startup').entries.map(item => item.name), ['settings', 'setup', 'update', 'draw']);
  assert.deepEqual(category('interface').entries.map(item => item.name), ['size', 'title', 'padding', 'show']);
  assert.equal(category('drawing').entries.length, 10);
  assert.equal(category('advanced').entries.length, 12);
  assert.equal(entry('image').parameters.length, 3);
  assert.equal(entry('image-scaled').parameters.length, 5);
  assert.equal(entry('app-createContent').owner, 'App');
  assert.equal(entry('gameapp-createContent').owner, 'GameApp');
  assert.match(entry('gameapp-createContent').signature, /^protected final /);
  assert.equal(entry('circle').signature, 'void circle(double centreX, double centreY, double diameter)');
  assert.equal(entry('circle').example, 'fill(Color.BLUE);\ncircle(100, 80, 40);');
  assert.match(entry('circle').note, /diameter, not the radius/);
});

test('keeps canonical class defaults, constructors and lifecycle caveats', () => {
  assert.match(category('startup').notes, /public abstract class App/);
  assert.match(category('startup').notes, /public abstract class GameApp/);
  assert.equal((category('startup').notes.match(/implicit public\nno-argument constructor/g) ?? []).length, 2);
  assert.match(category('startup').notes, /800 × 500/);
  assert.match(category('startup').notes, /0\.1/);
  assert.match(category('interface').notes, /IllegalStateException/);
  assert.match(category('canvas').notes, /`setup\(\)` or later/);
  assert.match(category('drawing').notes, /y increases downward/);
  assert.match(category('images').notes, /existing\ncanvas/);
  assert.match(category('input').notes, /Losing canvas or window focus clears/);
  assert.match(category('advanced').notes, /failed frame stops the timer/);
  assert.match(category('advanced').notes, /launch\(args\)/);
});

test('search handles aliases, case, multiple terms, whitespace and empty results', () => {
  const search = query => searchApiReference(categories, query);
  assert.equal(search('').length, 42);
  assert.equal(search(' \n\t ').length, 42);
  assert.ok(search('KEYBOARD').some(item => item.id === 'keyDown'));
  assert.deepEqual(search('rectangle').map(item => item.id), ['rect', 'outlineRect']);
  assert.ok(search('mouse').some(item => item.id === 'mouseDown'));
  assert.ok(search('colour').some(item => item.id === 'fill'));
  assert.ok(search('color').some(item => item.id === 'stroke'));
  assert.deepEqual(search('  rectangle  stroked \n').map(item => item.id), ['outlineRect']);
  assert.equal(search('keyboard rectangle').length, 0);
  assert.equal(search('aardvark').length, 0);
  const match = search('circle')[0];
  assert.equal(match.categoryId, 'drawing');
  assert.equal(match.categoryTitle, 'Drawing');
});

test('search accepts method labels and ranks names before prose with stable ties', () => {
  const ids = query => searchApiReference(categories, query).map(item => item.id);
  assert.deepEqual(ids('shutdown'), ['app-shutdown', 'gameapp-shutdown', 'stop']);
  assert.deepEqual(ids('image()').slice(0, 3), ['image', 'image-scaled', 'loadImage']);
  assert.deepEqual(ids('circle()'), ['circle']);
  assert.deepEqual(ids('  CiRcLe ( )  '), ['circle']);
  assert.deepEqual(ids('image'), ids('image()'));
  assert.deepEqual(ids('mouse').slice(0, 3), ['mouseX', 'mouseY', 'mouseDown']);
  assert.deepEqual(ids('circle() filled'), ['circle']);
  assert.equal(ids('circle() rectangle').length, 0);
  assert.deepEqual(ids(''), entries.map(item => item.id));
});

test('documents current padding, arrow handling, bundled media and retained app guidance', async () => {
  assert.equal(entry('padding').owner, 'App');
  assert.equal(entry('padding').signature, 'void padding(double pixels)');
  assert.match(entry('padding').description, /non-negative and finite/);
  assert.match(entry('padding').description, /Default: 0/);
  assert.match(entry('padding').description, /inside `settings\(\)` only/);
  assert.match(entry('padding').parameters[0].description, /content edge/);
  assert.equal(entry('padding').example, 'padding(20);');
  assert.ok(entry('padding').related.includes('settings'));
  assert.match(category('input').notes, /arrow presses are consumed/);
  assert.match(category('input').notes, /Tab still moves focus/);
  assert.match(category('advanced').notes, /includes JavaFX controls, graphics and media/);
  assert.match(category('advanced').notes, /Public activation is pending/);
  const guide = await readFile(new URL('../../student-template/APP-GUIDE.md', import.meta.url), 'utf8');
  assert.match(guide, /^# Building apps with Zero/);
  assert.match(guide, /\[API reference\]\(API.md\)/);
  assert.match(guide, /void padding\(double pixels\)/);
  assert.match(guide, /## Ordinary JavaFX and reusable objects/);
  assert.match(guide, /### Short sound effects/);
  assert.match(guide, /source starter includes JavaFX controls, graphics and media/);
  assert.match(guide, /ZeroHub provides exact-version shared libraries/);
});

test('reads declarations and behavior from Markdown and rejects malformed or missing rows', () => {
  const changed = buildApiReference(markdown.replace('Set line width.', 'Set the outline thickness.'));
  assert.equal(searchApiReference(changed, 'strokeWidth')[0].description, 'Set the outline thickness.');
  assert.throws(() => buildApiReference(null), /Markdown text/);
  assert.throws(() => buildApiReference(''), /Incomplete API reference/);
  assert.throws(() => buildApiReference(markdown.replace('`void fill(Color color)`', '`void fill(Color)`')), /Malformed API parameter/);
  assert.throws(() => buildApiReference(markdown.replace('`void fill(Color color)`', 'void fill(Color color)')), /Malformed API table row/);
  assert.throws(() => buildApiReference(markdown.replace('`void fill(Color color)`', '`nonsense`')), /Malformed API signature/);
  assert.throws(() => buildApiReference(markdown.replace(/^\| `void fill\(Color color\)`.*\n/m, '')), /Incomplete API reference/);
  assert.throws(() => buildApiReference(markdown.replace('## Drawing', '## Painting')), /Unknown API section/);
  assert.throws(() => buildApiReference(markdown.replace('`void stroke(Color color)`', '`void fill(Color color)`')), /Duplicate API reference id/);
});
