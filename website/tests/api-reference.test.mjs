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
  for (const owner of ['App', 'GameApp', 'ImageRegion', 'AnimationSource', 'AnimationPlayback', 'SpriteAnimation', 'Actor', 'Collisions', 'Sound', 'Music', 'Color', 'Key', 'zero.ui.Element', 'zero.ui.Label', 'zero.ui.TextField', 'zero.ui.Button', 'zero.ui.Column', 'zero.ui.Row']) {
    const source = await readFile(new URL(`../../framework/src/main/java/zero/${owner.replace(/^zero\./, '').replaceAll('.', '/')}.java`, import.meta.url), 'utf8');
    if (owner === 'Key') {
      const constants = [...source.matchAll(/^    ([A-Z]+)\(KeyCode\.[A-Z]+\)[,;]/gm)].map(match => match[1]);
      assert.deepEqual(constants, ['LEFT', 'RIGHT', 'UP', 'DOWN']);
      for (const name of constants) expected.push(`Key:Key ${name}`);
    }
    for (const match of source.matchAll(/^ {4}public (static final \w+ \w+)\s*=/gm)) {
      expected.push(`${owner}:${normalizeSignature(match[1])}`);
    }
    // Class-level declarations have four-space indentation; the anonymous timer callback has twelve.
    for (const match of source.matchAll(/^ {4}(?:@Override )?((?:public|protected) (?:(?:final|static) )?(?:[\w.]+ )?\w+\([^)]*\))\s*(?:\{|;)/gm)) {
      expected.push(`${owner}:${normalizeSignature(match[1])}`);
    }
  }
  assert.equal(expected.length, 183);
  assert.deepEqual(entries.map(item => `${item.owner}:${normalizeSignature(item.signature)}`).sort(), expected.sort());
  assert.ok(!entries.some(item => item.name === 'handle'));
  assert.equal(JSON.parse(JSON.stringify(categories)).length, 15);
});

test('categories and entries have unique anchors, valid relationships and complete metadata', () => {
  assert.deepEqual(categories.map(item => [item.id, item.title]), [
    ['startup', 'App startup'], ['interface', 'Window and interface'], ['game-flow', 'Game flow'], ['components', 'Zero UI'], ['colors', 'Zero colours'], ['canvas', 'Canvas'],
    ['drawing', 'Drawing'], ['images', 'Images'], ['regions', 'Image regions'],
    ['animation', 'Sprite animation'], ['actors', 'Actors'], ['audio', 'Audio'], ['collisions', 'Collisions'], ['input', 'Keyboard and mouse'], ['advanced', 'Advanced'],
  ]);
  const ids = [...categories, ...entries].map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const item of entries) {
    assert.ok(item.description);
    assert.ok(['App', 'GameApp', 'ImageRegion', 'AnimationSource', 'AnimationPlayback', 'SpriteAnimation', 'Actor', 'Collisions', 'Sound', 'Music', 'Color', 'Key', 'zero.ui.Element', 'zero.ui.Label', 'zero.ui.TextField', 'zero.ui.Button', 'zero.ui.Column', 'zero.ui.Row'].includes(item.owner));
    for (const parameter of item.parameters) assert.ok(parameter.name && parameter.description);
    for (const target of item.related) assert.ok(entry(target), `${item.id} relates to missing ${target}`);
  }
  assert.equal(entry('canvas-access').name, 'canvas');
});

test('classifies callbacks, window operations, overloads and advanced overrides', () => {
  assert.deepEqual(category('startup').entries.map(item => item.name), ['settings', 'setup', 'update', 'draw']);
  assert.deepEqual(category('interface').entries.map(item => item.name), ['size', 'title', 'padding', 'show', 'show']);
  assert.equal(category('drawing').entries.length, 14);
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
  assert.equal(search('').length, 183);
  assert.equal(search(' \n\t ').length, 183);
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
  assert.deepEqual(ids('shutdown').slice(0, 2), ['app-shutdown', 'gameapp-shutdown']);
  assert.ok(ids('shutdown').includes('stop'));
  assert.deepEqual(ids('image()').slice(0, 6), ['image', 'image-scaled', 'image-region', 'image-region-scaled', 'image-animation', 'image-animation-scaled']);
  assert.equal(ids('circle()')[0], 'circle');
  assert.equal(ids('  CiRcLe ( )  ')[0], 'circle');
  assert.deepEqual(ids('image'), ids('image()'));
  assert.deepEqual(ids('mouse').slice(0, 3), ['mouseX', 'mouseY', 'mouseDown']);
  assert.deepEqual(ids('circle() filled'), ['circle', 'actor-circle']);
  assert.ok(ids('circle() rectangle').every(id => id.startsWith('collisions-')));
  assert.deepEqual(ids(''), entries.map(item => item.id));
});

test('documents current padding, arrow handling, bundled media and retained app guidance', async () => {
  assert.equal(entry('padding').owner, 'App');
  assert.equal(entry('padding').signature, 'void padding(double pixels)');
  assert.match(entry('padding').description, /non-negative and finite/);
  assert.match(entry('padding').description, /Default: 0/);
  assert.match(entry('padding').description, /`settings\(\)`, `setup\(\)` or later JavaFX handlers/);
  assert.match(entry('padding').note, /Inherited by GameApp from App/);
  assert.match(entry('padding').note, /settings\(\), setup\(\) or a JavaFX event handler/);
  assert.match(entry('padding').note, /padding\(0\) removes it/);
  assert.match(entry('padding').note, /repeated calls replace the amount/);
  assert.match(entry('padding').note, /GameApp keeps its canvas dimensions/);
  assert.match(entry('padding').note, /without resizing the window/);
  assert.match(entry('padding').parameters[0].description, /content edge/);
  assert.equal(entry('padding').example, 'padding(20);');
  assert.ok(entry('padding').related.includes('settings'));
  assert.match(category('input').notes, /arrow presses are consumed/);
  assert.match(category('input').notes, /Tab still moves focus/);
  assert.match(category('advanced').notes, /includes JavaFX controls, graphics and media/);
  assert.match(category('advanced').notes, /Public managed library admission remains gated/);
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
  assert.equal(category('animation').entries.length, 15);
  assert.equal(category('collisions').entries.length, 3);
  assert.match(category('images').notes, /same backing Image without bitmap copies/);
  assert.match(entry('loadImage').description, /cached per app by canonical/);
  assert.equal(entry('loadImageRegion').signature, 'ImageRegion loadImageRegion(String resourcePath)');
  assert.equal(entry('loadImageRegion').example, 'ImageRegion player = loadImageRegion("/player.png");');
  assert.match(entry('loadImageRegion').description, /full pixel bounds/);
  assert.match(entry('loadImageRegion').description, /Image resource path must not be null/);
  assert.match(entry('loadImageRegion').note, /wrapper identity is not promised/);
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
  for (const item of entries.filter(item => ['ImageRegion', 'AnimationSource', 'AnimationPlayback', 'SpriteAnimation', 'Actor', 'Collisions', 'Sound', 'Music', 'Color', 'Key', 'zero.ui.Element', 'zero.ui.Label', 'zero.ui.TextField', 'zero.ui.Button', 'zero.ui.Column', 'zero.ui.Row'].includes(item.owner) || /ImageRegion|SpriteAnimation|Pressed|Focused|Centered|Flipped|loadSound|loadMusic/.test(item.signature))) {
    const line = markdown.split('\n').find(candidate => candidate.startsWith(`| \`${item.signature}\``));
    assert.ok(line, item.signature);
    assert.throws(() => buildApiReference(markdown.replace(line + '\n', '')), /Incomplete API reference/, item.signature);
  }
});


test('audio declarations use owner-qualified anchors and preserve app lifecycle anchors', () => {
  assert.equal(entry('loadSound').owner, 'App');
  assert.equal(entry('loadMusic').owner, 'App');
  assert.equal(entry('stop').owner, 'App');
  assert.equal(category('audio').entries.length, 20);
  assert.equal(entry('sound-stop').owner, 'Sound');
  assert.equal(entry('music-stop').owner, 'Music');
  assert.ok(!entries.some(item => ['Sound', 'Music'].includes(item.name)));
  assert.match(entry('loadSound').description, /same live Sound/);
  assert.match(entry('loadMusic').description, /independent/);
  assert.match(category('audio').notes, /frame failure/);
  assert.match(entry('music-setVolume').parameters[0].description, /finite/);
  assert.match(entry('sound-setMuted').parameters[0].description, /chosen volume/);
  assert.ok(searchApiReference(categories, 'music pause').some(item => item.id === 'music-pause'));
  assert.ok(searchApiReference(categories, 'audio effect').some(item => item.id === 'loadSound'));
});


test('Actor has exact overload anchors, explicit lifecycle examples and movement guidance', async () => {
  assert.equal(category('actors').entries.length, 36);
  for (const suffix of ['', '-region', '-animation', '-source']) {
    assert.equal(entry(`actor-constructor${suffix}`).owner, 'Actor');
    assert.equal(entry(`actor-constructor${suffix}`).parameters.length, 3);
    assert.equal(entry(`actor-setImage${suffix}`).parameters.length, 1);
    assert.match(entry(`actor-constructor${suffix}`).example, /new Actor/);
    assert.match(entry(`actor-setImage${suffix}`).example, /actor.setImage/);
  }
  for (const item of category('actors').entries) {
    assert.ok(item.example, item.id);
    assert.ok(item.note, item.id);
    assert.ok(item.related.length, item.id);
  }
  assert.equal(entry('actor-update').example, 'actor.update(seconds);');
  assert.equal(entry('actor-draw').example, 'actor.draw(this);');
  assert.equal(entry('update').owner, 'GameApp');
  assert.equal(entry('draw').owner, 'GameApp');
  assert.equal(entry('width').owner, 'GameApp');
  assert.match(entry('actor-constructor').parameters[1].description, /centre/);
  assert.match(entry('actor-setSize').parameters[0].description, /strictly positive/);
  assert.match(entry('actor-moveToward').parameters[2].description, /non-negative/);
  assert.match(entry('actor-moveForward').parameters[0].description, /Signed/);
  assert.match(category('actors').notes, /onUpdate\(seconds\)/);
  assert.match(category('actors').notes, /without changing actor state/);
  assert.match(category('actors').notes, /Sharing one AnimationSource creates independent clocks/);
  assert.match(entry('actor-moveToward').description, /without overshooting/);
  assert.ok(searchApiReference(categories, 'enemy chase').some(item => item.id === 'actor-moveToward'));
  assert.ok(searchApiReference(categories, 'actor center').some(item => item.id === 'actor-constructor'));
  const guide = await readFile(new URL('../../student-template/APP-GUIDE.md', import.meta.url), 'utf8');
  assert.match(guide, /public class Player extends Actor/);
  assert.match(guide, /public class Enemy extends Actor/);
  assert.match(guide, /enemy.update\(seconds\)/);
  assert.match(guide, /draw\(enemy\)/);
  assert.match(guide, /onUpdate\(seconds\)/);
  assert.match(guide, /actor.x\(\) - actor.width\(\) \/ 2/);
});


test('Zero UI and colour slice covers qualified owners, fields, overloads and inherited bridge', async () => {
  assert.equal(category('components').entries.length, 23);
  assert.equal(category('colors').entries.length, 5);
  for (const name of ['WHITE', 'BLACK', 'BLUE', 'GOLD']) {
    assert.equal(entry(`color-${name}`).kind, 'field');
    assert.equal(entry(`color-${name}`).signature, `static final Color ${name}`);
  }
  assert.equal(entry('show').parameters[0].type, 'Node');
  assert.equal(entry('show-element').parameters[0].type, 'zero.ui.Element');
  assert.equal(entry('controls').owner, 'GameApp');
  for (const method of ['background', 'fill', 'stroke']) {
    assert.equal(entry(method).parameters[0].type, 'Color');
    assert.equal(entry(`${method}-zero-color`).parameters[0].type, 'zero.Color');
    assert.match(entry(`${method}-zero-color`).example, /zero.Color/);
  }
  assert.equal(entry('ui-column-constructor').parameters[0].type, 'Element...');
  assert.equal(entry('ui-column-constructor-spacing').parameters[0].name, 'spacing');
  assert.equal(entry('ui-element-constructor').signature, 'protected Element(Node node)');
  assert.equal(entry('ui-element-fxNode').owner, 'zero.ui.Element');
  assert.match(category('components').notes, /8 pixels/);
  assert.match(category('components').notes, /before any child is attached/);
  assert.match(category('components').notes, /inherits `fxNode\(\)`/);
  assert.match(entry('show-element').note, /suspends gameplay update, draw and canvas input/);
  assert.match(entry('controls').note, /Retains canvas and gameplay state/);
  assert.match(entry('ui-button-onClick').description, /Replace/);
  assert.match(entry('ui-button-onClick').parameters[0].description, /Runnable/);
  assert.ok(searchApiReference(categories, 'game hud').some(item => item.id === 'controls'));
  assert.ok(searchApiReference(categories, 'vertical layout').some(item => item.id === 'ui-column-constructor'));
  assert.ok(searchApiReference(categories, 'advanced bridge').some(item => item.id === 'ui-element-fxNode'));
  for (const item of entries.filter(item => item.owner.startsWith('zero.ui.') || item.owner === 'Color' || ['show-element', 'controls', 'background-zero-color', 'fill-zero-color', 'stroke-zero-color'].includes(item.id))) {
    assert.ok(item.example, item.id);
    const line = markdown.split('\n').find(candidate => candidate.startsWith(`| \`${item.signature}\``));
    assert.ok(line, item.id);
    assert.throws(() => buildApiReference(markdown.replace(line + '\n', '')), /Incomplete API reference/, item.id);
  }
  const guide = await readFile(new URL('../../student-template/APP-GUIDE.md', import.meta.url), 'utf8');
  assert.match(guide, /## Zero UI: one view in an app or game/);
  assert.match(guide, /score.view\(\)/);
  assert.match(guide, /controls\(new Column/);
  assert.match(guide, /show navigates away/);
});


test('game flow preserves the gameplay view and documents explicit pause independently of navigation', () => {
  assert.deepEqual(category('game-flow').entries.map(item => item.name), ['showGame', 'pause', 'resume', 'isPaused']);
  for (const name of ['showGame', 'pause', 'resume', 'isPaused']) {
    const item = entry(`gameapp-${name}`);
    assert.equal(item.owner, 'GameApp');
    assert.ok(item.example);
    assert.match(item.note, /no zero.Screen class/);
    const line = markdown.split('\n').find(candidate => candidate.startsWith(`| \`${item.signature}\``));
    assert.throws(() => buildApiReference(markdown.replace(line + '\n', '')), /Incomplete API reference/);
  }
  assert.equal(entry('music-pause').owner, 'Music');
  assert.match(category('game-flow').notes, /after the current draw/);
  assert.match(category('game-flow').notes, /commits immediately/);
  assert.match(category('game-flow').notes, /next update gets 0/);
  assert.match(category('game-flow').notes, /preserves an explicit pause/);
  assert.match(entry('gameapp-pause').description, /still draws/);
  assert.match(entry('gameapp-resume').description, /only when gameplay is visible/);
  assert.ok(searchApiReference(categories, 'navigation replay').some(item => item.id === 'gameapp-showGame'));
  assert.ok(searchApiReference(categories, 'game unpause').some(item => item.id === 'gameapp-resume'));
});


test('scoped Actor drawing covers callback, compatibility overload and protected local helpers', async () => {
  assert.equal(entry('actor-constructor-position').signature, 'Actor(double x, double y)');
  assert.match(entry('actor-constructor-position').description, /1 × 1/);
  assert.equal(entry('actor-draw-callback').signature, 'void draw()');
  assert.equal(entry('actor-draw').signature, 'void draw(GameApp app)');
  assert.equal(entry('gameapp-draw-actor').signature, 'void draw(Actor actor)');
  assert.equal(entry('gameapp-draw-actor').example, 'draw(player);');
  assert.match(entry('gameapp-draw-actor').note, /preserve legacy overrides/);
  for (const name of ['fill', 'stroke', 'strokeWidth', 'textSize', 'rect', 'outlineRect', 'circle', 'line', 'text', 'textCentered']) {
    const item = entry(`actor-${name}`);
    assert.equal(item.owner, 'Actor');
    assert.match(item.signature, /^protected final /);
    assert.ok(item.example, name);
    assert.match(item.note, /IllegalStateException/);
    assert.match(item.note, /actor-local/);
  }
  assert.match(entry('actor-fill').parameters[0].description, /zero.Color/);
  assert.match(entry('actor-circle').parameters[0].description, /Actor-local/);
  assert.match(category('actors').notes, /does not scale/);
  assert.match(category('actors').notes, /restor.*context, styles and transform/);
  assert.ok(searchApiReference(categories, 'draw actor callback').some(item => item.id === 'gameapp-draw-actor'));
  const guide = await readFile(new URL('../../student-template/APP-GUIDE.md', import.meta.url), 'utf8');
  assert.match(guide, /public class Coin extends Actor/);
  assert.match(guide, /super\(x, y\)/);
  assert.match(guide, /circle\(0, 0, width\(\)\)/);
  assert.match(guide, /draw\(coin\)/);
  assert.match(guide, /does not automatically scale custom/);
});

test('TextField exposes exactly the greeting API with prompt and current text examples', () => {
  const fields = entries.filter(item => item.owner === 'zero.ui.TextField');
  assert.deepEqual(fields.map(item => item.name), ['TextField', 'getText', 'setText', 'getPromptText', 'setPromptText']);
  assert.equal(entry('ui-textfield-constructor').signature, 'TextField()');
  assert.match(entry('ui-textfield-getText').description, /typed by the user/);
  assert.match(entry('ui-textfield-setPromptText').description, /does not change entered text/);
  assert.equal(entry('ui-textfield-setPromptText').example, 'textfield.setPromptText("Your name");');
  assert.ok(searchApiReference(categories, 'typing greeting').some(item => item.id === 'ui-textfield-constructor'));
  assert.match(category('components').notes, /Both setters reject null/);
});


test('all Zero elements inherit the one availability operation without extra query APIs', async () => {
  const availability = entry('ui-element-setEnabled');
  assert.equal(availability.owner, 'zero.ui.Element');
  assert.equal(availability.signature, 'final void setEnabled(boolean enabled)');
  assert.match(availability.description, /preserving values and callbacks/);
  assert.equal(availability.parameters[0].name, 'enabled');
  assert.match(availability.parameters[0].description, /True to allow interaction/);
  assert.match(availability.example, /button.setEnabled\(false\)/);
  assert.ok(searchApiReference(categories, 'disabled availability').some(item => item.id === availability.id));
  assert.match(category('components').notes, /child disabled separately remains disabled/);
  assert.equal(entries.filter(item => item.name === 'setEnabled').length, 1);
  assert.ok(!entries.some(item => item.name === 'isEnabled'));
  const guide = await readFile(new URL('../../student-template/APP-GUIDE.md', import.meta.url), 'utf8');
  assert.match(guide, /prevent double scoring/);
});


test('Zero arrows and Row have exact owners, overload anchors and explicit constant coverage', () => {
  assert.deepEqual(entries.filter(item => item.owner === 'Key').map(item => item.name), ['LEFT', 'RIGHT', 'UP', 'DOWN']);
  for (const key of ['LEFT', 'RIGHT', 'UP', 'DOWN']) {
    assert.equal(entry(`key-${key}`).signature, `static final Key ${key}`);
    assert.equal(entry(`key-${key}`).kind, 'field');
  }
  for (const method of ['keyDown', 'keyPressed']) {
    assert.equal(entry(method).parameters[0].type, 'KeyCode');
    assert.equal(entry(`${method}-zero-key`).parameters[0].type, 'Key');
    assert.match(entry(`${method}-zero-key`).example, /Key.LEFT/);
  }
  assert.equal(entry('ui-row-constructor').parameters[0].type, 'Element...');
  assert.equal(entry('ui-row-constructor-spacing').parameters[0].name, 'spacing');
  assert.equal(entry('ui-row-setSpacing').example, 'row.setSpacing(12);');
  assert.ok(searchApiReference(categories, 'horizontal layout').some(item => item.id === 'ui-row-constructor'));
});


test('animation interfaces and actor sequencing have exact documented owners and examples',()=>{
  assert.equal(entry('animationsource-createPlayback').owner,'AnimationSource');
  assert.equal(entry('animationplayback-update').owner,'AnimationPlayback');
  assert.equal(entry('animationplayback-frame').signature,'ImageRegion frame()');
  assert.equal(entry('spriteanimation-createPlayback').owner,'SpriteAnimation');
  assert.equal(entry('actor-update').signature,'final void update(double seconds)');
  assert.equal(entry('actor-onUpdate').signature,'protected void onUpdate(double seconds)');
  assert.match(entry('actor-onUpdate').example,/protected void onUpdate/);
  assert.match(entry('actor-onUpdate').note,/without a super call/);
  assert.match(entry('actor-constructor-source').description,/independent playback/);
  assert.match(entry('actor-setImage-source').description,/before replacing/);
});
