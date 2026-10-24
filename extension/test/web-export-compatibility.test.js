'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { checkCompatibility, compatibilityProfile, validateDependencies, verifyArtifactInventory, validateWrapperInputs } = require('../src/web-export/compatibility');
const root = path.resolve(__dirname, '../..');
// Each fixture can run several separately bounded JDK attributions. Allow the
// combined test enough time on classroom hardware or a busy development Mac.
let counter = 0;
async function readSources(directory) {
  const sources = {};
  async function walk(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith('.java')) sources[path.relative(directory, file).split(path.sep).join('/')] = await fs.readFile(file, 'utf8');
    }
  }
  await walk(directory); return sources;
}
const pomPromise = fs.readFile(path.join(root, 'student-template/pom.xml'), 'utf8');
const helpersPromise = readSources(path.join(root, 'framework/src/main/java'));
let temporary;
test.before(async () => { temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'zero-semantic-'))); });
test.after(async () => { await fs.rm(temporary, { recursive: true, force: true }); });
async function check(sources, overrides = {}) {
  const workRoot = path.join(temporary, String(++counter)); await fs.mkdir(workRoot);
  return checkCompatibility({ sources: { ...await helpersPromise, ...sources }, pom: await pomPromise, workRoot, cacheRoot: path.join(temporary, 'cache'), ...overrides });
}
const app = body => `import zero.App;\npublic class Main extends App {\n public void setup() { ${body} }\n public static void main(String[] args) { launch(args); }\n}\n`;
test('contract has an immutable explicit type/member boundary and hashed attribution inputs', async () => {
  const profile = await compatibilityProfile();
  assert.equal(profile.schemaVersion, 1); assert.equal(profile.javafxVersion, '21.0.12');
  for (const item of [profile.contractHash, profile.checkerHash, ...profile.attributionArtifacts.map(a => a.sha256)]) assert.match(item, /^[a-f0-9]{64}$/);
  const contract = require('../src/web-export/compatibility/contract.json');
  assert.ok(!JSON.stringify(contract.types).includes('*'));
  assert.ok(!contract.members.includes('javafx.scene.Node#setUserData(java.lang.Object)'));
});
test('dependency gate rejects unpinned, injected, inherited and profile dependencies structurally', async () => {
  const pom = await pomPromise;
  assert.deepEqual(validateDependencies(pom).dependencies, ['org.openjfx:javafx-controls:21.0.12', 'org.openjfx:javafx-media:21.0.12']);
  for (const changed of [pom.replace('21.0.12', '21.0.11'), pom.replace('javafx-controls', 'javafx-web'), pom.replace('<dependencies>', '<profiles/><dependencies>'), pom.replace('<dependencies>', '<parent/><dependencies>'), pom.replace('<dependencies>', '<dependencyManagement/><dependencies>'), pom.replace('org.openjfx', 'org.openjfx.evil'), pom.replace('<artifactId>javafx-controls</artifactId>', '<artifactId>javafx-controls</artifactId><classifier>other</classifier>')]) assert.throws(() => validateDependencies(changed), /browser|Browser|POM/);
  assert.throws(() => validateDependencies(pom.replace('<dependencies>', '<!-- fake <dependency> ignored -->\n<dependencies>').replace('org.openjfx', 'evil')), /browser dependency/);
});
test('all sixteen reviewed helper APIs and quiz, drawing, audio and controls retain resolved compatibility', { timeout: 240000 }, async () => {
  const sharedScoreSources = await readSources(path.join(root, 'framework/prototypes/shared'));
  assert.deepEqual(Object.keys(sharedScoreSources).sort(), ['BarScoreDisplay.java', 'ScoreDisplay.java', 'ScoreView.java']);
  const fixtures = [
    { 'Main.java': await fs.readFile(path.join(root, 'framework/web-checks/Main.java'), 'utf8'), 'GameApiChecks.java': await fs.readFile(path.join(root, 'framework/web-checks/GameApiChecks.java'), 'utf8') },
    { 'Main.java': await fs.readFile(path.join(root, 'student-template/examples/quiz/Main.java'), 'utf8'), 'ScoreDisplay.java': await fs.readFile(path.join(root, 'student-template/examples/shared/ScoreDisplay.java'), 'utf8') },
    { 'Main.java': await fs.readFile(path.join(root, 'student-template/examples/drawing/Main.java'), 'utf8') },
    { 'Main.java': await fs.readFile(path.join(root, 'framework/web-checks/audio/Main.java'), 'utf8') },
    { 'Main.java': await fs.readFile(path.join(root, 'framework/web-checks/ui/Main.java'), 'utf8') },
    { 'Main.java': await fs.readFile(path.join(root, 'framework/web-checks/navigation/Main.java'), 'utf8') },
    { ...await readSources(path.join(root, 'framework/prototypes/counter')), ...sharedScoreSources },
    { ...await readSources(path.join(root, 'framework/prototypes/coin-game')), ...sharedScoreSources }
  ];
  for (const sources of fixtures) { const result = await check(sources); assert.equal(result.status, 'passed'); assert.equal(result.trustedHelpers.length, 16); }
});
test('resolved owners, overloads, references, static imports, dead code and Java APIs fail with source positions', { timeout: 240000 }, async () => {
  const sources = {
    'Main.java': app('new javafx.scene.control.Button("Ready").setText("Go");'),
    'Inherited.java': 'import javafx.scene.control.Button; class Inherited { void unused() { new Button("Go").setUserData("desktop"); } }',
    'Overload.java': 'class Overload { void unused() { new javafx.scene.control.Button("Go").setText(java.lang.String.format("%s", "x")); } }',
    'Constructor.java': 'class Constructor { Object unused() { return new java.util.ArrayList<String>(22); } }',
    'Reference.java': 'import javafx.scene.control.Button; class Reference { java.util.function.Consumer<Object> unused(Button b) { return b::setUserData; } }',
    'ConstructorReference.java': 'class ConstructorReference { java.util.function.IntFunction<java.util.ArrayList<String>> unused() { return java.util.ArrayList<String>::new; } }',
    'StaticImport.java': 'import static java.lang.System.gc; class StaticImport { void unused() { gc(); } }',
    'JavaApi.java': 'class JavaApi { void unused() { java.lang.System.exit(0); } }',
    'ThreadApi.java': 'class ThreadApi { void unused() throws Exception { Thread.sleep(1); } }',
    'Field.java': 'class Field { Object unused() { return System.in; } }',
    'OverrideApi.java': 'class OverrideApi extends javafx.scene.control.Button { @Override protected javafx.scene.control.Skin<?> createDefaultSkin() { return null; } }',
    'zero/PackageLoophole.java': 'package zero; class PackageLoophole { void unused() { Sound.requireThread(); } }',
    'Unresolved.java': 'class Unresolved { void unused() { missingSymbol(); } }'
  };
  try { await check(sources); assert.fail('Expected rejection'); }
  catch (error) {
    assert.match(error.message, /Use new ArrayList<>\(\) without an initial-capacity argument/);
    assert.match(error.message, /Build simple labels with ordinary string concatenation/);
    assert.match(error.message, /accumulate seconds in update\(double seconds\)/);
    for (const [file, expected] of [['Inherited.java', 'javafx.scene.Node#setUserData(java.lang.Object)'], ['Overload.java', 'java.lang.String#format'], ['Constructor.java', 'java.util.ArrayList#<init>(int)'], ['Reference.java', 'javafx.scene.Node#setUserData'], ['ConstructorReference.java', 'java.util.ArrayList#<init>(int)'], ['StaticImport.java', 'java.lang.System#gc()'], ['JavaApi.java', 'java.lang.System#exit(int)'], ['ThreadApi.java', 'java.lang.Thread#sleep(long)'], ['Field.java', 'java.lang.System#in'], ['OverrideApi.java', 'createDefaultSkin()'], ['zero/PackageLoophole.java', 'zero.Sound#requireThread()'], ['Unresolved.java', 'Cannot resolve browser source']]) {
      assert.match(error.message, new RegExp(file.replace('.', '\\.') + ':\\d+:\\d+:'));
      assert.ok(error.message.includes(expected), expected + '\n' + error.message);
    }
  }
});
test('student classes, same-named methods and approved method references remain ordinary Java', { timeout: 240000 }, async () => {
  const result = await check({ 'Main.java': app('Worker w = new Worker(); Runnable r = w::setUserData; r.run(); new javafx.scene.control.Button("Go").setText("Ready");'), 'Worker.java': 'class Worker { void setUserData() { } }' });
  assert.equal(result.status, 'passed');
});
test('game APIs support resolved static imports and references without admitting neighboring overloads or owners', { timeout: 240000 }, async () => {
  const result = await check({ 'Main.java': app('new GameApis().verify();'),
    'GameApis.java': 'import static java.lang.Math.hypot; import static java.lang.Math.PI; class GameApis { interface Distance { double measure(double x, double y); } void verify() { Distance d = Math::hypot; double length = hypot(3, 4) + d.measure(3, 4) + PI; java.util.ArrayList<String> list = new java.util.ArrayList<>(); list.add("first"); list.remove((Object) "first"); list.isEmpty(); javafx.scene.input.MouseButton middle = javafx.scene.input.MouseButton.MIDDLE; javafx.scene.input.MouseButton secondary = javafx.scene.input.MouseButton.SECONDARY; } }'
  });
  assert.equal(result.status, 'passed');
  const denied = {
    'MathOverload.java': 'class MathOverload { long unused() { return Math.abs(-3L); } }',
    'MathReference.java': 'class MathReference { interface Absolute { long apply(long x); } Absolute unused() { return Math::abs; } }',
    'CollectionOwner.java': 'class CollectionOwner { boolean unused(java.util.List<String> values) { return values.remove("first"); } }',
    'CollectionBulk.java': 'class CollectionBulk { boolean unused(java.util.ArrayList<String> values) { return values.removeAll(values); } }',
    'ColorOverload.java': 'class ColorOverload { Object unused() { return javafx.scene.paint.Color.rgb(1, 2, 3, .5); } }',
    'KeyNeighbor.java': 'class KeyNeighbor { Object unused() { return javafx.scene.input.KeyCode.DIGIT4; } }'
  };
  await assert.rejects(check({ 'Main.java': app(''), ...denied }), error => {
    for (const [file, api] of [['MathOverload.java', 'java.lang.Math#abs(long)'], ['MathReference.java', 'java.lang.Math#abs(long)'], ['CollectionOwner.java', 'java.util.List#remove(java.lang.Object)'], ['CollectionBulk.java', 'java.util.ArrayList#removeAll(java.util.Collection)'], ['ColorOverload.java', 'javafx.scene.paint.Color#rgb(int,int,int,double)'], ['KeyNeighbor.java', 'javafx.scene.input.KeyCode#DIGIT4']]) {
      assert.match(error.message, new RegExp(file.replace('.', '\\.') + ':\\d+:\\d+:'));
      assert.ok(error.message.includes(api), api + '\n' + error.message);
    }
    return true;
  });
});
test('helper identity and package spoofing do not exempt student source', { timeout: 240000 }, async () => {
  const helpers = await helpersPromise;
  await assert.rejects(check({ 'Main.java': app(''), 'zero/Sound.java': helpers['zero/Sound.java'] + '\n// local change\n' }), /helper differs/);
  await assert.rejects(check({ 'Main.java': app(''), 'zero/Custom.java': 'package zero; class Custom { void unused() { System.exit(0); } }', 'javafx/fake/Custom.java': 'package javafx.fake; class Custom {}' }), /reserved|System#exit/);
});
test('Unicode escapes are attributed and static initializers never execute', { timeout: 240000 }, async () => {
  await assert.rejects(check({ 'Main.java': app(''), 'Unicode.java': 'class Unicode { static { if (true) java.lang.System.\\u0065xit(0); } }' }), /System#exit\(int\)/);
});
test('unapproved constructor and method references alone cannot be optimized past the gate', { timeout: 240000 }, async () => {
  await assert.rejects(check({ 'Main.java': app(''), 'Dead.java': 'class Dead { private Runnable unused() { return System::gc; } }' }), /java.lang.System#gc\(\)/);
});

test('known compiler cache entries are hash-bound and unrelated versions never become application dependencies', () => {
  const catalogue = require('../src/web-export/compatibility/maven-artifacts.json');
  const known = catalogue.artifacts.find(file => file.path.includes('gwt-user/2.13.0/') && file.path.endsWith('.jar'));
  assert.deepEqual(verifyArtifactInventory([known]), [known]);
  assert.deepEqual(verifyArtifactInventory([]), []);
  assert.throws(() => verifyArtifactInventory([{ ...known, sha256: '0'.repeat(64) }]), /modified browser compiler dependency/);
  assert.throws(() => verifyArtifactInventory([{ ...known, path: known.path.replace('2.13.0', '99.0') }]), /Unreviewed/);
});
test('effective Maven wrapper/properties bytes are reviewed with portable line endings', async () => {
  const files = [];
  for (const name of ['mvnw', 'mvnw.cmd', '.mvn/wrapper/maven-wrapper.properties']) files.push({ path: name, bytes: await fs.readFile(path.join(root, 'student-template', name)) });
  for (const platform of ['darwin', 'win32', 'linux']) assert.ok(validateWrapperInputs(files, platform).wrapperBytes.length);
  assert.ok(validateWrapperInputs(files.map(file => ({ ...file, bytes: Buffer.from(file.bytes.toString().replace(/\r?\n/g, '\r\n')) })), 'win32'));
  assert.throws(() => validateWrapperInputs(files.map(file => file.path === 'mvnw' ? { ...file, bytes: Buffer.from('echo BUILD SUCCESS') } : file), 'linux'), /reviewed pinned/);
});
test('resource lookup is constrained and approved source initializers are attributed without execution', { timeout: 240000 }, async () => {
  await check({ 'Main.java': app('java.net.URL u = getClass().getResource("/theme.css"); if (u != null) u.toExternalForm();'), 'Static.java': 'class Static { static { if (true) throw new IllegalStateException("This must never execute"); } }' });
  await assert.rejects(check({ 'Main.java': app('Object info = getClass();') }), /Object#getClass/);
  await assert.rejects(check({ 'Main.java': app('java.lang.Class<?> type = Main.class;') }), /Class literals are supported only/);
});
test('28 maintained source examples pass; external stylesheets and packaged dependencies fail explicitly', { timeout: 240000 }, async () => {
  const base = path.join(root, 'student-template/examples'), sources = {};
  const exists = async file => fs.access(file).then(() => true, () => false);
  let count = 0;
  for (const entry of await fs.readdir(base, { withFileTypes: true })) {
    const name = entry.name;
    if (!entry.isDirectory() || name.startsWith('packaged-') || !await exists(path.join(base, name, 'Main.java'))) continue;
    const prefix = 'checks.' + name.replaceAll('-', '_');
    const files = (await fs.readdir(path.join(base, name))).filter(file => file.endsWith('.java')).map(file => path.join(base, name, file));
    if (['coin-game-controls', 'coin-game-component', 'composed-game'].includes(name)) files.push(...['Player.java', 'Coin.java'].map(file => path.join(base, 'coin-game', file)));
    if (['composed-study', 'composed-game'].includes(name)) files.push(...['StartScreen.java', 'Hud.java'].map(file => path.join(base, 'composition-shared', file)));
    if (name === 'composed-study') files.push(path.join(base, 'study/Question.java'));
    if (['quiz', 'practice', 'study', 'coin-game-component', 'composed-study', 'composed-game', 'scrolling-game', 'platform-game', 'level-game', 'full-game'].includes(name)) files.push(path.join(base, 'shared/ScoreDisplay.java'));
    for (const file of files) sources[prefix.replaceAll('.', '/') + '/' + path.basename(file)] = 'package ' + prefix + ';\n' + await fs.readFile(file, 'utf8');
    count++;
  }
  assert.equal(count, 28);
  assert.equal((await check(sources)).status, 'passed');
  await assert.rejects(check({ 'Main.java': app('var box = new javafx.scene.layout.VBox(); box.getStylesheets().add("theme.css");') }), error => {
    assert.match(error.message, /Main\.java:\d+:\d+: Unsupported browser API javafx\.scene\.Parent#getStylesheets\(\)/);
    return true;
  });
  const pom = (await pomPromise).replace('</dependencies>', '<dependency><groupId>ca.codepet.zero</groupId><artifactId>starter-ui</artifactId><version>0.1.0-prototype.1</version></dependency></dependencies>');
  assert.throws(() => validateDependencies(pom), /Unsupported browser dependency/);
});

test('native JSNI methods and source-defined external runtime or interop types cannot bypass attribution', { timeout: 240000 }, async () => {
  const forbidden = ['jsinterop.annotations', 'com.google.gwt.core.client', 'dev.webfx.fake', 'javafx.fake', 'zero.web.fake', 'zero.exported', 'javax.fake'];
  const sources = { 'Main.java': app(''), 'Native.java': 'class Native { native void unused() /*-{ $wnd.alert("must not execute"); }-*/; }' };
  for (let i = 0; i < forbidden.length; i++) sources['spoof' + i + '/Interop.java'] = 'package ' + forbidden[i] + '; @interface Interop {}';
  try { await check(sources); assert.fail('Expected rejection'); }
  catch (error) { assert.match(error.message, /Native methods are outside/); for (let i = 0; i < forbidden.length; i++) assert.match(error.message, new RegExp('spoof' + i + '/Interop\\.java:.*reserved')); }
  const helpers = await helpersPromise; const withoutSound = { ...helpers }; delete withoutSound['zero/Sound.java'];
  await assert.rejects(check({ ...withoutSound, 'Main.java': app(''), 'other/Sound.java': 'package zero; public class Sound { public void play() {} }' }, { sources: { ...withoutSound, 'Main.java': app(''), 'other/Sound.java': 'package zero; public class Sound { public void play() {} }' } }), /helper identity requires/);
});

test('resolved resource URL types remain consistent across helpers, fields and wildcard imports without renaming user identifiers', {timeout:240000}, async()=>{
 const sources={
  'Main.java':app('java.net.URL URL = new Assets().theme(); java.net.URL stored = URL; if (stored != null) stored.toExternalForm();'),
  'Assets.java':'import java.net.*; class Assets { URL theme() { var resource = getClass().getResource("/theme.css"); return pass(resource); } URL pass(URL URL) { return URL; } }',
  'Own.java':'class Own { static class URL {} URL untouched = new URL(); }',
  'Reference.java':'import java.net.URL; class Reference { URL pass(URL value) { return value; } ResourceURL local = new ResourceURL(); }',
  'ResourceURL.java':'class ResourceURL {}'
 };
 const receipt=await check(sources),{adaptSources}=require('../src/web-export/adapters');
 for (const spans of Object.values(receipt.resourceUrlReferences)) for (const span of spans) assert.ok(span.start >= 0 && span.end > span.start);
 const result=adaptSources({sources:{...await helpersPromise,...sources},resourcePaths:['theme.css'],urlReferences:receipt.resourceUrlReferences});
 assert.match(result.sources['zero/exported/Main.java'],/zero.web.ResourceURL URL = new Assets\(\).theme\(\)/);
 assert.match(result.sources['zero/exported/Assets.java'],/var resource = zero.web.Resources.get\(getClass\(\),/);
 assert.match(result.sources['zero/exported/Assets.java'],/zero.web.ResourceURL pass\(zero.web.ResourceURL URL\) \{ return URL; \}/);
 assert.match(result.sources['zero/exported/Own.java'],/static class URL \{\} URL untouched = new URL\(\)/);
 assert.doesNotMatch(result.sources['zero/exported/Main.java'],/java.net.URL/);
 assert.doesNotMatch(result.sources['zero/exported/Reference.java'],/import zero.web.ResourceURL/);
 assert.match(result.sources['zero/exported/Reference.java'],/zero.web.ResourceURL pass\(zero.web.ResourceURL value\)/);
 assert.match(result.sources['zero/exported/Reference.java'],/ResourceURL local = new ResourceURL\(\)/);
 await assert.rejects(check({'Main.java':app('var resource = getClass().getResource("/theme.css"); resource.openConnection();')}), /java.net.URL#openConnection\(\)/);
});


test('Actor subclasses inherit reviewed methods while forged Actor identities fail', { timeout: 240000 }, async () => {
  const result = await check({ 'Main.java': app(''), 'Player.java': `import zero.Actor;
import zero.GameApp;
import zero.ImageRegion;
import zero.SpriteAnimation;
import javafx.scene.image.Image;
class Player extends Actor {
 Player(Image image) { super(image, 10, 20); }
 Player(ImageRegion region) { super(region, 10, 20); }
 Player(SpriteAnimation animation) { super(animation, 10, 20); }
 @Override public void update(double seconds) { super.update(seconds); moveForward(30, seconds); }
 @Override public void draw(GameApp app) { super.draw(app); }
 void exercise(Image image, ImageRegion region, SpriteAnimation animation) {
  setPosition(x() + 1, y()); setSize(width(), height()); setRotation(rotation());
  move(1, 2); rotate(15); face(20, 30); moveToward(20, 30, 5, .5);
  setImage(image); setImage(region); setImage(animation);
 }
}` });
  assert.equal(result.status, 'passed');
  const helpers = await helpersPromise;
  await assert.rejects(check({ 'Main.java': app(''), 'zero/Actor.java': helpers['zero/Actor.java'] + '\n// edited\n' }), /helper differs/);
  const sources = { ...helpers, 'Main.java': app('') };
  delete sources['zero/Actor.java'];
  sources['other/Actor.java'] = 'package zero; public class Actor {}';
  await assert.rejects(check({}, { sources }), /helper identity requires/);
});


test('Zero UI exact APIs and advanced fxNode interop do not grant neighboring JavaFX members or forged helper identities', { timeout: 240000 }, async () => {
  const result = await check({'Main.java': app(`zero.ui.Label label = new zero.ui.Label("Ready");
    label.setText(label.getText()); zero.ui.Button button = new zero.ui.Button("Go");
    button.setText(button.getText()); button.onClick(() -> label.setText("Clicked"));
    zero.ui.Column column = new zero.ui.Column(12, label, button);
    zero.ui.TextField name = new zero.ui.TextField(); name.setText(name.getText());
    name.setPromptText("Your name"); label.setText(name.getPromptText());
    column.setEnabled(false); column.setEnabled(true); name.setEnabled(false);
    button.setEnabled(false); label.setEnabled(true);
    column.setSpacing(column.getSpacing()); javafx.scene.Node advanced = column.fxNode(); show(column);`)});
  assert.equal(result.status, 'passed');
  await assert.rejects(check({'Main.java': app('new zero.ui.Label("Ready").fxNode().setUserData("hidden");')}), /javafx.scene.Node#setUserData/);
  await assert.rejects(check({'Main.java': app('new zero.ui.TextField().clear();')}), /clear/);
  await assert.rejects(check({'Main.java': app(''), 'forged/ZeroDisabledState.java':
    'package javafx.scene; public class ZeroDisabledState { }'}), /package is reserved/);
  await assert.rejects(check({'Main.java': app(''), 'zero/Leak.java':'package zero; class Leak { Object hidden() { return Color.BLUE.fxColor(); } }'}), /zero.Color#fxColor/);
  const helpers = await helpersPromise;
  for (const file of ['zero/Color.java', 'zero/ui/Element.java', 'zero/ui/Label.java', 'zero/ui/TextField.java', 'zero/ui/Button.java', 'zero/ui/Column.java', 'zero/ui/Row.java', 'zero/Key.java']) {
    await assert.rejects(check({'Main.java': app(''), [file]: helpers[file] + '\n// changed\n'}), /helper differs/);
    const sources = {...helpers, 'Main.java': app('')}; delete sources[file];
    sources['forged/' + file.split('/').pop()] = helpers[file];
    await assert.rejects(check({}, {sources}), /helper identity requires/);
  }
});


test('package-local navigation internals stay outside the student browser contract', {timeout:240000}, async () => {
  await assert.rejects(check({'Main.java':app(''), 'zero/NavigationLeak.java':
    'package zero; class NavigationLeak { void hidden(App app) { app.beginFrame(); app.endFrame(true); } }'}), error =>
      /zero.App#beginFrame\(\)/.test(error.message) && /zero.App#endFrame\(boolean\)/.test(error.message));
});


test('Actor drawing callbacks resolve protected inherited helpers without granting public or mismatched overload access', {timeout:240000}, async () => {
  const result = await check({'Main.java':`import zero.GameApp;
class Main extends GameApp { public void setup() { draw(new Child()); } }
class Drawing extends zero.Actor { Drawing() { super(20, 30); } }
class Child extends Drawing {
 @Override public void draw() {
  fill(zero.Color.BLUE); stroke(zero.Color.BLACK); strokeWidth(2); textSize(14);
  rect(-5,-5,10,10); outlineRect(-5,-5,10,10); circle(0,0,8); line(-5,0,5,0);
  text("Actor",0,0); textCentered("Actor",0,0);
 }
}`});
  assert.equal(result.status,'passed');
  await assert.rejects(check({'Main.java':app('new zero.Actor(0,0).fill(zero.Color.BLUE);')}), /protected access/);
  await assert.rejects(check({'Main.java':app(''), 'Wrong.java':
    'class Wrong extends zero.Actor { Wrong() { super(0,0); } public void draw() { fill(javafx.scene.paint.Color.BLUE); rect(1,2,3); } }'}), /Cannot resolve browser source/);
});


test('wall clock admits only the exact reviewed currentTimeMillis signature', { timeout: 120000 }, async () => {
  const result = await check({ 'Main.java': app('long started = System.currentTimeMillis(); long elapsed = java.lang.System.currentTimeMillis() - started; new zero.ui.Label("Elapsed: " + elapsed);') });
  assert.equal(result.status, 'passed');
  await assert.rejects(check({ 'Main.java': app('long unsupported = System.nanoTime();') }), /java.lang.System#nanoTime\(\)/);
});


test('Zero arrow enum and overloads admit only the exact four constants and query signatures', {timeout:240000}, async () => {
  const contract = require('../src/web-export/compatibility/contract.json');
  assert.deepEqual(contract.members.filter(member => member.startsWith('zero.Key#')).sort(),
    ['zero.Key#LEFT', 'zero.Key#RIGHT', 'zero.Key#UP', 'zero.Key#DOWN'].sort());
  const game = body => `import zero.GameApp; public class Main extends GameApp { public void setup() { ${body} } }`;
  assert.equal((await check({'Main.java':game('boolean held = keyDown(zero.Key.LEFT) || keyDown(zero.Key.RIGHT) || keyDown(zero.Key.UP) || keyDown(zero.Key.DOWN); boolean edge = keyPressed(zero.Key.LEFT); show(new zero.ui.Row(12, new zero.ui.Label("Ready"), new zero.ui.Button("Go")));')})).status, 'passed');
  for (const expression of ['zero.Key.values()', 'zero.Key.valueOf("LEFT")', 'zero.Key.LEFT.name()']) {
    await assert.rejects(check({'Main.java':game(expression + ';')}), /Unsupported browser API/);
  }
});


test('full-image region loader exposes only its exact path signature', {timeout:240000}, async () => {
  const source = 'import zero.GameApp; import zero.ImageRegion; public class Main extends GameApp { public void setup() { ImageRegion sprite = loadImageRegion("/player.png"); image(sprite, 20, 30, 24, 24); } }';
  assert.equal((await check({'Main.java':source})).status, 'passed');
  await assert.rejects(check({'Main.java':source.replace('loadImageRegion("/player.png")', 'loadImageRegion("/player.png", true)')}), /loadImageRegion/);
});


test('simulation integer parsing admits only the decimal String signature', {timeout:120000}, async () => {
  const source = await fs.readFile(path.join(root, 'framework/prototypes/simulation/Main.java'), 'utf8');
  assert.equal((await check({'Main.java':source})).status, 'passed');
  await assert.rejects(check({'Main.java':source.replace('Integer.parseInt(speedInput.getText().trim())', 'Integer.parseInt(speedInput.getText().trim(), 10)')}), /java.lang.Integer#parseInt\(java.lang.String,int\)/);
});
