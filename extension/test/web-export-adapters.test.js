'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { adaptSources, helperHashes } = require('../src/web-export/adapters');
const root = path.resolve(__dirname, '../..');
const app = 'import zero.SketchApp;\npublic class Main extends SketchApp { public void setup() {} }\n';
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
  assert.match(result.sources['zero/SketchApp.java'], /BrowserFocus.install\(this::clearInput\)/);
  assert.match(result.sources['zero/SketchApp.java'], /BrowserImages.get\(resourcePath, getClass\(\)\)/);
  assert.match(result.sources['zero/SketchApp.java'], /ImageRegion.requireLoaded\(image\)/);
  const originalLine = sources['zero/SketchApp.java'].split('\n').findIndex(line => line.includes('public final SpriteAnimation loadAnimation'));
  const adaptedLine = result.sources['zero/SketchApp.java'].split('\n').findIndex(line => line.includes('public final SpriteAnimation loadAnimation'));
  assert.equal(adaptedLine, originalLine, 'framework source diagnostics retain original line numbers');
  assert.doesNotMatch(result.sources['zero/SketchApp.java'], /getResource\(|imageResourceKey/);
  assert.match(result.sources['zero/SpriteAnimation.java'], /Arrays.copyOf\(frames, frames.length\)/);
  const windowsSources = Object.fromEntries(Object.entries(sources).map(([file, text]) => [file, text.replaceAll('\n', '\r\n')]));
  assert.doesNotThrow(() => adaptSources({ sources: windowsSources }));
  sources['zero/SketchApp.java'] += '// student changes preserved in original\n';
  assert.throws(() => adaptSources({ sources }), /helper differs from the reviewed browser adapter/);
});

test('lexical rewrites preserve literals/comments and bridge only code resource and canvas calls', () => {
  const source = `import zero.SketchApp;\nimport java.net.URL;\nimport javafx.scene.media.MediaPlayer;\npublic class Main extends SketchApp {\n    String example = "Main.class.getResource(\\\"/foo\\\") canvas().setAccessibleText(";\n    // Main.class.getResource("comment") canvas().setAccessibleText("comment");\n    public void setup() { URL file = Main.class.getResource("/audio/loop.wav"); canvas().setAccessibleText("Space or click"); }\n}\n`;
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
  const source = 'package school.games;\nimport zero.SimpleApp;\npublic class Hello extends SimpleApp {}\n';
  const result = adaptSources({ sources: { 'school/games/Hello.java': source } });
  assert.equal(result.sources['school/games/Hello.java'], source);
  assert.deepEqual(result.sourceMap['school/games/Hello.java'], { originalPath: 'school/games/Hello.java', lineOffset: 0 });
});

test('ambiguous applications, path escapes, reserved packages and unsupported media fail usefully', () => {
  assert.throws(() => adaptSources({ sources: {} }), /expected one application/);
  assert.throws(() => adaptSources({ sources: { 'Main.java': app, 'Other.java': 'class Other extends SimpleApp {}' } }), /found 2/);
  assert.throws(() => adaptSources({ sources: { '../Main.java': app } }), /invalid Java source path/);
  assert.throws(() => adaptSources({ sources: { 'Main.java': app }, resourcePaths: ['../private.png'] }), /invalid packaged resource path/);
  assert.throws(() => adaptSources({ sources: { 'Main.java': 'package zero.web;\n' + app } }), /reserved/);
  assert.throws(() => adaptSources({ sources: { 'Main.java': 'import javafx.scene.media.MediaView;\n' + app } }), /unsupported browser media import/);
});
