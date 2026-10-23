'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { adaptSources, helperHashes } = require('../src/web-export/adapters');
const root = path.resolve(__dirname, '../..');
const app = 'import zero.GameApp;\npublic class Main extends GameApp { public void setup() {} }\n';
const helpers = () => Object.fromEntries(Object.keys(helperHashes).map(file => [file, fs.readFileSync(path.join(root, 'framework/src/main/java', file), 'utf8')]));

test('browser adapter relocates ordinary game objects without changing their rules', () => {
  const game = '// ordinary state\nclass Game { String caption = "canvas().setAccessibleText(\\\"hello\\\")"; void tick() { count++; } int count; }\n';
  const original = { 'Main.java': app, 'Game.java': game };
  const before = structuredClone(original);
  const result = adaptSources({ sources: original, resourcePaths: ['audio/music.wav', 'z.png', 'nested/a.jpg', 'z.png'] });
  assert.deepEqual(original, before);
  assert.equal(result.sources['zero/exported/Game.java'], 'package zero.exported;\n' + game);
  assert.equal(result.mainClass, 'zero.web.BrowserLauncher');
  assert.deepEqual(result.sourceMap['zero/exported/Game.java'], { originalPath: 'Game.java', lineOffset: 1 });
  assert.match(result.sources['zero/web/BrowserLauncher.java'], /new zero\.exported\.Main\(\)/);
  assert.match(result.sources['zero/web/PackagedResources.java'], /ALL = \{"\/audio\/music.wav", "\/nested\/a.jpg", "\/z.png"\}/);
  assert.match(result.sources['zero/web/PackagedResources.java'], /IMAGES = \{"\/nested\/a.jpg", "\/z.png"\}/);
});

test('current canonical helper fingerprints require a reviewed adapter update after changes', () => {
  const sources = { ...helpers(), 'Main.java': app };
  const result = adaptSources({ sources });
  assert.match(result.sources['zero/GameApp.java'], /BrowserFocus.install\(this::clearInput\)/);
  assert.match(result.sources['zero/GameApp.java'], /new zero\.web\.BrowserGameViewport\(content, canvas, layout, this::clearInput\)/);
  assert.doesNotMatch(result.sources['zero/GameApp.java'], /content\.applyCss\(\)/);
  assert.match(result.sources['zero/GameApp.java'], /beginFrame\(\)/);
  assert.match(result.sources['zero/GameApp.java'], /endFrame\(true\)/);
  assert.match(result.sources['zero/GameApp.java'], /BrowserImages.get\(resourcePath, getClass\(\)\)/);
  assert.match(result.sources['zero/GameApp.java'], /ImageRegion.requireLoaded\(image\)/);
  const originalLine = sources['zero/GameApp.java'].split('\n').findIndex(line => line.includes('public final SpriteAnimation loadAnimation'));
  const adaptedLine = result.sources['zero/GameApp.java'].split('\n').findIndex(line => line.includes('public final SpriteAnimation loadAnimation'));
  assert.equal(adaptedLine, originalLine, 'framework source diagnostics retain original line numbers');
  assert.doesNotMatch(result.sources['zero/GameApp.java'], /getResource\(|imageResourceKey/);
  assert.match(result.sources['zero/SpriteAnimation.java'], /Arrays.copyOf\(frames, frames.length\)/);
  const windowsSources = Object.fromEntries(Object.entries(sources).map(([file, text]) => [file, text.replaceAll('\n', '\r\n')]));
  assert.doesNotThrow(() => adaptSources({ sources: windowsSources }));
  sources['zero/GameApp.java'] += '// student changes preserved in original\n';
  assert.throws(() => adaptSources({ sources }), /helper differs from the reviewed browser adapter/);
});

test('lexical rewrites preserve literals/comments and bridge only code resource and canvas calls', () => {
  const source = `import zero.GameApp;\nimport java.net.URL;\nimport javafx.scene.media.MediaPlayer;\npublic class Main extends GameApp {\n    String example = "Main.class.getResource(\\\"/foo\\\") canvas().setAccessibleText(";\n    // Main.class.getResource("comment") canvas().setAccessibleText("comment");\n    public void setup() { URL file = Main.class.getResource("/audio/loop.wav"); canvas().setAccessibleText("Space or click"); }\n}\n`;
  const result = adaptSources({ sources: { 'Main.java': source }, resourcePaths: ['audio/loop.wav'] });
  const adapted = result.sources['zero/exported/Main.java'];
  assert.ok(adapted.includes('String example = "Main.class.getResource(\\\"/foo\\\") canvas().setAccessibleText(";'));
  assert.ok(adapted.includes('// Main.class.getResource("comment") canvas().setAccessibleText("comment");'));
  assert.match(adapted, /import zero.web.ResourceURL;/);
  assert.match(adapted, /ResourceURL file = zero.web.Resources.get/);
  assert.match(adapted, /import zero.web.media.MediaPlayer;/);
  assert.match(adapted, /zero.web.Resources.get\(Main.class, "\/audio\/loop.wav"\)/);
  assert.match(adapted, /zero.web.BrowserAccess.label\(canvas\(\), "Space or click"\)/);
});

test('packaged student applications retain package and line mapping', () => {
  const source = 'package school.games;\nimport zero.App;\npublic class Hello extends App {}\n';
  const result = adaptSources({ sources: { 'school/games/Hello.java': source } });
  assert.equal(result.sources['school/games/Hello.java'], source);
  assert.deepEqual(result.sourceMap['school/games/Hello.java'], { originalPath: 'school/games/Hello.java', lineOffset: 0 });
});

test('ambiguous applications, path escapes, reserved packages and unsupported media fail usefully', () => {
  assert.throws(() => adaptSources({ sources: {} }), /expected one application/);
  assert.throws(() => adaptSources({ sources: { 'Main.java': app, 'Other.java': 'class Other extends App {}' } }), /found 2/);
  assert.throws(() => adaptSources({ sources: { '../Main.java': app } }), /invalid Java source path/);
  assert.throws(() => adaptSources({ sources: { 'Main.java': app }, resourcePaths: ['../private.png'] }), /invalid packaged resource path/);
  assert.throws(() => adaptSources({ sources: { 'Main.java': 'package zero.web;\n' + app } }), /reserved/);
  assert.throws(() => adaptSources({ sources: { 'Main.java': 'import javafx.scene.media.MediaView;\n' + app } }), /unsupported browser media import/);
});


test('all thirteen native helpers retain declarations and generated audio ownership/aliases', () => {
  const sources = { ...helpers(), 'Main.java': app };
  assert.equal(Object.keys(helperHashes).length, 13);
  const result = adaptSources({ sources, resourcePaths: ['audio/tone.wav'] });
  const originalAPI = text => text.split('\n').filter(line => /^    (?:@Override )?(?:public|protected) /.test(line)).map(line => line.split('{')[0].trim());
  for (const file of Object.keys(helperHashes)) assert.deepEqual(originalAPI(result.sources[file]), originalAPI(sources[file]), file + ' public/protected API');
  assert.match(result.sources['zero/App.java'], /Resources.get\(getClass\(\), resourcePath\)/);
  assert.match(result.sources['zero/App.java'], /BrowserLifecycle.own\(this, this::stop\)/);
  assert.doesNotMatch(result.sources['zero/App.java'], /java.net.URL|java.nio.file.Path|resource.toURI/);
  assert.match(result.sources['zero/Sound.java'], /clip.play\(volume\)/);
  assert.match(result.sources['zero/Music.java'], /player.setOnReady/);
  sources['zero/Music.java'] += '// changed\n';
  assert.throws(() => adaptSources({ sources }), /helper differs/);
});

test('abstract nested app owners are not mistaken for a second launch target', () => {
  const main = app.replace('public void setup() {}', 'public void setup() {} private abstract static class Owner extends App {}');
  assert.doesNotThrow(() => adaptSources({ sources: { 'Main.java': main } }));
});

test('ordinary instance resource lookup supports stylesheets without enabling reflection rewrites', () => {
  const source='import java.net.URL;\nimport zero.App;\nclass Main extends App { public void setup() { var theme=getClass().getResource("/theme.css"); java.net.URL same=Main.class.getResource("/theme.css"); String sample="getClass().getResource(ignored)"; } }';
  const adapted=adaptSources({sources:{'Main.java':source},resourcePaths:['theme.css']}).sources['zero/exported/Main.java'];
  assert.match(adapted,/var theme=zero.web.Resources.get\(getClass\(\), "\/theme.css"\)/);
  assert.match(adapted,/zero.web.ResourceURL same=zero.web.Resources.get\(Main.class, "\/theme.css"\)/);
  assert.ok(adapted.includes('"getClass().getResource(ignored)"'));
});


test('Actor is hash-guarded and keeps its ordinary movement and drawing source', () => {
  const sources = { ...helpers(), 'Main.java': app };
  assert.equal(adaptSources({ sources }).sources['zero/Actor.java'], sources['zero/Actor.java']);
  sources['zero/Actor.java'] += '// edited actor\n';
  assert.throws(() => adaptSources({ sources }), /Actor.java: this Zero helper differs/);
});


test('subpackage UI helpers retain exact source and reject changes at their reviewed paths', () => {
  const sources = { ...helpers(), 'Main.java': app };
  const adapted = adaptSources({ sources }).sources;
  for (const name of ['Element', 'Label', 'Button', 'Column']) {
    const file = 'zero/ui/' + name + '.java';
    assert.equal(adapted[file], sources[file]);
    assert.throws(() => adaptSources({ sources: {...sources, [file]: sources[file] + '// changed\n'} }), /helper differs/);
  }
});


test('reviewed GameApp canvas text size supplies a valid browser font family without rewriting student Font calls', () => {
  const sources = {...helpers(), 'Main.java': app.replace('public void setup() {}', 'public void setup() { javafx.scene.text.Font f = javafx.scene.text.Font.font(20); }')};
  const result = adaptSources({sources}).sources;
  assert.match(result['zero/GameApp.java'], /graphics.setFont\(Font.font\("sans-serif", pixels\)\)/);
  assert.match(result['zero/exported/Main.java'], /javafx.scene.text.Font.font\(20\)/);
  assert.match(sources['zero/GameApp.java'], /graphics.setFont\(Font.font\(pixels\)\)/);
});
