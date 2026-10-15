import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildApiReference, searchApiReference } from '../lib/api-reference.mjs';

const markdown = await readFile(new URL('../../student-template/API.md', import.meta.url), 'utf8');
const categories = buildApiReference(markdown);
const entries = categories.flatMap(category => category.entries);
const entry = id => entries.find(candidate => candidate.id === id);
const category = id => categories.find(candidate => candidate.id === id);
const normalizeSignature = signature => signature.replace(/\b(public|protected|final|static)\s+/g, '').replace('javafx.scene.Node', 'Node').replace(/\s+/g, ' ').trim();

test('every class-level public/protected Java declaration has an exact canonical entry', async () => {
  const expected = [];
  for (const owner of ['SimpleApp', 'SketchApp', 'ImageRegion', 'SpriteAnimation', 'Collisions']) {
    const source = await readFile(new URL(`../../framework/src/main/java/zero/${owner}.java`, import.meta.url), 'utf8');
    // Class-level declarations have four-space indentation; the anonymous timer callback has twelve.
    for (const match of source.matchAll(/^ {4}(?:@Override )?((?:public|protected) (?:(?:final|static) )?(?:[\w.]+ )?\w+\([^)]*\))\s*\{/gm)) {
      expected.push(`${owner}:${normalizeSignature(match[1])}`);
    }
  }
  assert.equal(expected.length, 78);
  assert.deepEqual(entries.map(item => `${item.owner}:${normalizeSignature(item.signature)}`).sort(), expected.sort());
  assert.ok(!entries.some(item => item.name === 'handle'));
  assert.equal(JSON.parse(JSON.stringify(categories)).length, 10);
});

test('categories and entries have unique anchors, valid relationships and complete metadata', () => {
  assert.deepEqual(categories.map(item => [item.id, item.title]), [
    ['startup', 'App startup'], ['interface', 'Window and interface'], ['canvas', 'Canvas'],
    ['drawing', 'Drawing'], ['images', 'Images'], ['regions', 'Image regions'],
    ['animation', 'Sprite animation'], ['collisions', 'Collisions'], ['input', 'Keyboard and mouse'], ['advanced', 'Advanced'],
  ]);
  const ids = [...categories, ...entries].map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of entries) {
    assert.ok(item.description);
    assert.ok(['SimpleApp', 'SketchApp', 'ImageRegion', 'SpriteAnimation', 'Collisions'].includes(item.owner));
    for (const parameter of item.parameters) assert.ok(parameter.name && parameter.description);
    for (const target of item.related) assert.ok(entry(target), `${item.id} relates to missing ${target}`);
  }
  assert.equal(entry('canvas-access').name, 'canvas');
});

test('classifies callbacks, window operations, overloads and advanced overrides', () => {
  assert.deepEqual(category('startup').entries.map(item => item.name), ['settings', 'setup', 'update', 'draw']);
  assert.deepEqual(category('interface').entries.map(item => item.name), ['size', 'title', 'padding', 'show']);
  assert.equal(category('drawing').entries.length, 11);
  assert.equal(category('advanced').entries.length, 12);
  assert.equal(entry('image').parameters.length, 3);
  assert.equal(entry('image-scaled').parameters.length, 5);
  assert.equal(entry('simpleapp-createContent').owner, 'SimpleApp');
  assert.equal(entry('sketchapp-createContent').owner, 'SketchApp');
  assert.match(entry('sketchapp-createContent').signature, /^protected final /);
  assert.equal(entry('circle').signature, 'void circle(double centreX, double centreY, double diameter)');
  assert.equal(entry('circle').example, 'fill(Color.BLUE);\ncircle(100, 80, 40);');
  assert.match(entry('circle').note, /diameter, not the radius/);
});

test('keeps canonical class defaults, constructors and lifecycle caveats', () => {
  assert.match(category('startup').notes, /public abstract class SimpleApp/);
  assert.match(category('startup').notes, /public abstract class SketchApp/);
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
  assert.equal(search('').length, 78);
  assert.equal(search(' \n\t ').length, 78);
  assert.ok(search('KEYBOARD').some(item => item.id === 'keyDown'));
  assert.deepEqual(search('rectangle').slice(0, 2).map(item => item.id), ['rect', 'outlineRect']);
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
  assert.deepEqual(ids('shutdown').slice(0, 2), ['simpleapp-shutdown', 'sketchapp-shutdown']);
  assert.ok(ids('shutdown').includes('stop'));
  assert.deepEqual(ids('image()').slice(0, 6), ['image', 'image-scaled', 'image-region', 'image-region-scaled', 'image-animation', 'image-animation-scaled']);
  assert.equal(ids('circle()')[0], 'circle');
  assert.equal(ids('  CiRcLe ( )  ')[0], 'circle');
  assert.deepEqual(ids('image'), ids('image()'));
  assert.deepEqual(ids('mouse').slice(0, 3), ['mouseX', 'mouseY', 'mouseDown']);
  assert.deepEqual(ids('circle() filled'), ['circle']);
  assert.ok(ids('circle() rectangle').every(id => id.startsWith('collisions-')));
  assert.deepEqual(ids(''), entries.map(item => item.id));
});

test('documents current padding, arrow handling, bundled media and retained app guidance', async () => {
  assert.equal(entry('padding').owner, 'SimpleApp');
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


test('documents all source-type overloads with unique stable anchors and helper constructors', () => {
  for (const suffix of ['', '-region', '-animation']) {
    assert.equal(entry(`image${suffix}`).parameters.length, 3);
    assert.equal(entry(`image${suffix}-scaled`).parameters.length, 5);
    assert.match(entry(`image${suffix}-scaled`).example, /20, 30, 80, 80/);
    assert.equal(entry(`imageCentered${suffix}`).parameters.length, 6);
    assert.equal(entry(`imageFlippedY${suffix}`).parameters.length, 5);
  }
  assert.equal(entry('imageregion-constructor').owner, 'ImageRegion');
  assert.equal(entry('spriteanimation-constructor').parameters.length, 4);
  assert.equal(entry('spriteanimation-constructor-frames').parameters[1].type, 'ImageRegion...');
  for (const name of ['circleHitsRect', 'rectHitsRect', 'circleHitsCircle']) {
    assert.match(entry(`collisions-${name}`).signature, /^static boolean /);
    assert.match(entry(`collisions-${name}`).example, /Collisions\./);
  }
  assert.equal(category('regions').entries.length, 6);
  assert.equal(category('animation').entries.length, 11);
  assert.equal(category('collisions').entries.length, 3);
  assert.match(category('images').notes, /same backing Image without bitmap copies/);
  assert.match(entry('loadImage').description, /cached per app by canonical/);
  assert.match(category('input').notes, /press and release between frames/);
  assert.match(category('input').notes, /update\nand draw, then cleared/);
  assert.match(category('animation').notes, /equal aligned cells/);
  assert.match(category('collisions').notes, /Touching counts/);
  assert.match(entry('textCentered').description, /baseline/);
  assert.ok(!entry('spriteanimation-update').note?.includes('field named x'));
  assert.ok(searchApiReference(categories, 'sprite sheet').some(item => item.owner === 'SpriteAnimation'));
  assert.ok(searchApiReference(categories, 'keyboard edge').some(item => item.id === 'keyPressed'));
});


test('fails closed when any new overload or constructor table row is omitted', () => {
  for (const item of entries.filter(item => ['ImageRegion', 'SpriteAnimation', 'Collisions'].includes(item.owner) || /ImageRegion|SpriteAnimation|Pressed|Focused|Centered|Flipped/.test(item.signature))) {
    const line = markdown.split('\n').find(candidate => candidate.startsWith(`| \`${item.signature}\``));
    assert.ok(line, item.signature);
    assert.throws(() => buildApiReference(markdown.replace(line + '\n', '')), /Incomplete API reference/, item.signature);
  }
});
