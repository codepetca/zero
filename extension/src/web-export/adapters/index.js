'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// A deliberately small Java lexer: comments and literals never participate in rewrites.
function tokens(source) {
  const result = [];
  const expression = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_$][\w$]*|[^\s]/g;
  for (const match of source.matchAll(expression)) {
    if (match[0].startsWith('//') || match[0].startsWith('/*')) continue;
    result.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return result;
}
function apply(source, edits) {
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
function fail(file, detail) { throw new Error(`Web export: ${file}: ${detail}`); }
const {helperHashes} = require('../../core-contract');
function overlay(file, source) {
  const expected = helperHashes[file];
  if (!expected) return source;
  source = source.replace(/\r\n/g, '\n');
  if (crypto.createHash('sha256').update(source).digest('hex') !== expected) {
    fail(file, 'this Zero helper differs from the reviewed browser adapter. Keep your source; update the adapter or use the supported helper version before exporting.');
  }
  if (file === 'zero/App.java') {
    source = source.replace('import java.net.URL;\n', 'import zero.web.ResourceURL;\n').replace('import java.nio.file.Path;\n', '\n');
    source = source.replaceAll('URL resource', 'ResourceURL resource').replace('private URL audioResource', 'private ResourceURL audioResource');
    source = source.replace('getClass().getResource(resourcePath)', 'zero.web.Resources.get(getClass(), resourcePath)');
    source = source.replace('        runtimeOpen();', '        runtimeOpen(); zero.web.BrowserLifecycle.own(this, this::stop);');
    // Report startup failure before closing a shared Stage can stop another
    // owner and otherwise consume the browser's single terminal status.
    source = source.replace('            runtimeFailing = true;', '            runtimeFailing = true; zero.web.BrowserLifecycle.fail("startup", "STARTUP_FAILED", failure);');
    source = source.replace('            stage.setScene(scene);', '            stage.setScene(scene); zero.web.BrowserUiFocus.install(scene); javafx.scene.ZeroDisabledState.install(scene);');
    source = source.replace('        Throwable failure = null;', '        zero.web.BrowserLifecycle.release(this); Throwable failure = null;');
    const nativeStart = source.indexOf('    // BEGIN NATIVE RUNTIME REPORTER');
    const nativeEnd = source.indexOf('    // END NATIVE RUNTIME REPORTER', nativeStart);
    if (nativeStart < 0 || nativeEnd < 0) fail(file, 'reviewed native runtime reporter placement changed.');
    source = source.slice(0, nativeStart) + `    private void runtimeOpen() { }
    private void runtimeClose() { }
    private void runtimeEvent(String type, String stage, String code, Throwable failure) {
        if (type.equals("fatal")) zero.web.BrowserRuntime.fatal(stage, code, failure);
        else zero.web.BrowserRuntime.emit(type, stage, code, failure);
    }
` + source.slice(nativeEnd + '    // END NATIVE RUNTIME REPORTER'.length);
    source = source.replace('    private RuntimeReporter runtimeReporter;\n', '');
    const key = source.indexOf('    private static String audioResourceKey(');
    return source.slice(0, key) + '    private static String audioResourceKey(ResourceURL resource) { return resource.toExternalForm(); }\n}\n';
  }
  if (!file.endsWith('GameApp.java') && !file.endsWith('SpriteAnimation.java')) return source;
  if (file.endsWith('SpriteAnimation.java')) return source.replace('frames.clone()', 'java.util.Arrays.copyOf(frames, frames.length)');
  source = source.replace('import java.net.URL;\n', '\n').replace('import java.nio.file.Path;\n', '\n');
  source = source.replace('    private Canvas canvas;', '    private Canvas canvas; private zero.web.BrowserGameViewport browserViewport;');
  // WebFX Font.font(double) omits the CSS-required family; preserve the requested canvas size.
  source = source.replace('graphics.setFont(Font.font(pixels));', 'graphics.setFont(Font.font("sans-serif", pixels));');
  const sceneStart = source.indexOf('    @Override protected final Scene createScene(BorderPane content) {');
  const sceneEnd = source.indexOf('    @Override protected final void ready(Stage stage) {', sceneStart);
  if (sceneStart < 0 || sceneEnd < 0) fail(file, 'reviewed game scene adapter placement changed.');
  const nativeSceneLines = source.slice(sceneStart, sceneEnd).split('\n').length - 1;
  let browserScene = `    @Override protected final Scene createScene(BorderPane content) {
        javafx.scene.Node selected = content.getCenter();
        try {
            content.setCenter(layout);
            browserViewport = new zero.web.BrowserGameViewport(content, canvas, layout, this::clearInput);
            return browserViewport.scene();
        } finally {
            content.setCenter(selected);
        }
    }
`;
  browserScene += '\n'.repeat(Math.max(0, nativeSceneLines - (browserScene.split('\n').length - 1)));
  source = source.slice(0, sceneStart) + browserScene + source.slice(sceneEnd);
  source = source.replace('        window = stage;', '        window = stage; zero.web.BrowserFocus.install(this::clearInput);');
  source = source.replace('        Scene scene = stage.getScene();', '        Scene scene = stage.getScene(); browserViewport.install();');
  source = source.replace('canvas.sceneToLocal(event.getSceneX(), event.getSceneY())', 'zero.web.BrowserGameViewport.canvasPoint(canvas, event)');
  source = source.replace('window != null && window.isFocused()', 'window != null && zero.web.BrowserFocus.focused()');
  source = source.replace('        gameVisible = false;\n        previousFrame = 0;\n        clearInput();\n        imageCache.clear();', `        try { if (browserViewport != null) browserViewport.close(); } catch (RuntimeException | Error error) { if (failure == null) failure = error; else failure.addSuppressed(error); } try { zero.web.BrowserFocus.uninstall(); } catch (RuntimeException | Error error) { if (failure == null) failure = error; else failure.addSuppressed(error); } gameVisible = false;
        previousFrame = 0;
        clearInput();
        imageCache.clear();`);
  const start = source.indexOf('        var resource = getClass().getResource(resourcePath);');
  const end = source.indexOf('    public final SpriteAnimation loadAnimation(', start);
  const originalLines = source.slice(start, end).split('\n').length - 1;
  let replacement = `        Image image = zero.web.BrowserImages.get(resourcePath, getClass());\n        ImageRegion.requireLoaded(image);\n        return image;\n    }\n`;
  replacement += '\n'.repeat(Math.max(0, originalLines - (replacement.split('\n').length - 1)));
  source = source.slice(0, start) + replacement + source.slice(end);
  return source.slice(0, source.indexOf('    private static String imageResourceKey(')) + '}\n';
}
function packageName(ts) {
  const index = ts.findIndex(t => t.text === 'package');
  if (index < 0) return '';
  let name = '';
  for (let i = index + 1; i < ts.length && ts[i].text !== ';'; i++) name += ts[i].text;
  return name;
}
function adaptJava(file, source, changes, resolvedUrls) {
  if (resolvedUrls !== undefined) {
    if (!Array.isArray(resolvedUrls)) fail(file, 'invalid resolved browser URL references.');
    let previousEnd=0;
    const replacements=[...resolvedUrls].sort((a,b)=>a.start-b.start).map(({start,end})=>{
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<previousEnd || end<=start || end>source.length) fail(file, 'invalid resolved browser URL range.');
      previousEnd=end;
      return {start,end,text:'zero.web.ResourceURL'+'\n'.repeat((source.slice(start,end).match(/\n/g)||[]).length)};
    });
    source=apply(source,replacements);
  }
  const ts = tokens(source), edits = [];
  const pkg = packageName(ts);
  if (pkg === 'zero.web' || pkg.startsWith('zero.web.') || pkg === 'zero.exported') fail(file, 'package is reserved for browser export support.');
  let resourceBridge = false;
  for (let i = 0; i < ts.length; i++) {
    // The semantic gate admits this ordinary resource pattern, while rejecting
    // other reflection. Preserve its actual runtime owner for package lookup.
    if (ts.slice(i, i + 6).map(t => t.text).join('') === 'getClass().getResource(' && ts[i - 1]?.text !== '.') {
      edits.push({ start: ts[i].start, end: ts[i + 5].end, text: 'zero.web.Resources.get(getClass(), ' });
      resourceBridge = true;
    }
    // Class literals keep their declared owner rather than resolving a class name.
    if (ts[i].text === 'class' && ts[i - 1]?.text === '.' && ts[i + 1]?.text === '.' && ts[i + 2]?.text === 'getResource' && ts[i + 3]?.text === '(') {
      let begin = i - 2;
      while (begin >= 2 && ts[begin - 1].text === '.' && /^[A-Za-z_$]/.test(ts[begin - 2].text)) begin -= 2;
      const klass = source.slice(ts[begin].start, ts[i].end);
      edits.push({ start: ts[begin].start, end: ts[i + 3].end, text: `zero.web.Resources.get(${klass}, ` });
      resourceBridge = true;
    }
    // Preserve the accessible label on the browser document's actual canvas.
    if (ts.slice(i, i + 6).map(t => t.text).join('') === 'canvas().setAccessibleText(') {
      edits.push({ start: ts[i].start, end: ts[i + 5].end, text: 'zero.web.BrowserAccess.label(canvas(), ' });
      changes.push(`${file}: mapped canvas accessible text to its browser ARIA label`);
    }
    if (ts[i].text === 'import') {
      let end = i + 1;
      while (end < ts.length && ts[end].text !== ';') end++;
      const imported = ts.slice(i + 1, end).map(t => t.text).join('');
      // Resolved type uses are fully qualified. Retaining a rewritten import
      // would shadow an ordinary student class with the same simple name.
      if (resolvedUrls !== undefined && imported === 'zero.web.ResourceURL') {
        const removed=source.slice(ts[i].start,ts[end].end);
        edits.push({start:ts[i].start,end:ts[end].end,text:'\n'.repeat((removed.match(/\n/g)||[]).length)});
      }
      if (imported.startsWith('javafx.scene.media.')) {
        const name = imported.slice('javafx.scene.media.'.length);
        if (!['AudioClip', 'Media', 'MediaPlayer', 'MediaException'].includes(name)) fail(file, `unsupported browser media import ${imported}; audio clips and background music are supported.`);
        edits.push({ start: ts[i + 1].start, end: ts[end - 1].end, text: `zero.web.media.${name}` });
        changes.push(`${file}: mapped ${name} to browser audio`);
      }
    }
  }
  if (resourceBridge && resolvedUrls === undefined) {
    const urlImportTokens = new Set();
    for (let i = 0; i < ts.length - 6; i++) {
      if (ts.slice(i, i + 7).map(t => t.text).join('') === 'importjava.net.URL;') {
        edits.push({ start: ts[i + 1].start, end: ts[i + 5].end, text: 'zero.web.ResourceURL' });
        for (let j = i; j < i + 7; j++) urlImportTokens.add(j);
      }
    }
    const qualifiedUrlTokens = new Set();
    for (let i = 0; i < ts.length; i++) {
      if (!urlImportTokens.has(i) && ts.slice(i, i + 5).map(t => t.text).join('') === 'java.net.URL') {
        edits.push({ start: ts[i].start, end: ts[i + 4].end, text: 'zero.web.ResourceURL' });
        for (let j = i; j < i + 5; j++) qualifiedUrlTokens.add(j);
      }
      if (urlImportTokens.size && ts[i].text === 'URL' && !urlImportTokens.has(i) && !qualifiedUrlTokens.has(i)) edits.push({ start: ts[i].start, end: ts[i].end, text: 'ResourceURL' });
    }
    changes.push(`${file}: mapped class resource lookup to the packaged resource manifest`);
  }
  source = apply(source, edits);
  if (!pkg) { source = `package zero.exported;\n${source}`; changes.push(`${file}: relocated default package in exported copy`); }
  return { source, pkg: pkg || 'zero.exported', lineOffset: pkg ? 0 : 1 };
}
function readRuntime(directory, result = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) readRuntime(absolute, result);
    else if (entry.name.endsWith('.java')) result[path.relative(path.join(__dirname, 'runtime'), absolute).split(path.sep).join('/')] = fs.readFileSync(absolute, 'utf8');
  }
  return result;
}
function adaptSources({ sources, resourcePaths = [], urlReferences, originalPaths = {} }) {
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) throw new TypeError('Web export needs a source path/string map.');
  const output = {}, sourceMap = {}, changes = [], warnings = [];
  const apps = [];
  for (const [file, original] of Object.entries(sources).sort()) {
    if (typeof original !== 'string' || !file.endsWith('.java') || file.includes('\\') || file.startsWith('/') || file.split('/').includes('..')) fail(file, 'invalid Java source path or content.');
    if (file.startsWith('zero/web/') || file.startsWith('zero/exported/')) fail(file, 'package is reserved for the browser export copy.');
    let source = overlay(file, original);
    if (source !== original) changes.push(`${file}: applied fingerprint-checked Zero browser helper adapter`);
    const resolvedUrls=urlReferences !== undefined && !helperHashes[file] ? (urlReferences[file] || []) : undefined;
    const adapted = adaptJava(file, source, changes, resolvedUrls);
    const destination = adapted.pkg.replaceAll('.', '/') + '/' + path.posix.basename(file);
    if (output[destination]) fail(file, `duplicate exported source ${destination}`);
    output[destination] = adapted.source;
    sourceMap[destination] = { originalPath: originalPaths[file] || file, lineOffset: adapted.lineOffset };
    const ts = tokens(source);
    for (let i = 0; i < ts.length - 3; i++) if (ts[i].text === 'class' && !ts.slice(Math.max(0, i - 3), i).some(token => token.text === 'abstract') && ts[i + 2].text === 'extends' && ['GameApp', 'App', 'Application'].includes(ts[i + 3].text)) apps.push(`${adapted.pkg}.${ts[i + 1].text}`);
  }
  if (apps.length !== 1) fail('Main.java', `expected one application extending GameApp, App or Application; found ${apps.length}.`);
  const resources = [...new Set(resourcePaths)].sort();
  for (const resource of resources) if (typeof resource !== 'string' || resource.startsWith('/') || resource.includes('\\') || resource.split('/').some(x => !x || x === '..' || x === '.')) fail(String(resource), 'invalid packaged resource path.');
  const images = resources.filter(file => /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(file));
  const runtime = readRuntime(path.join(__dirname, 'runtime'));
  for (const [file, source] of Object.entries(runtime)) {
    if (output[file]) fail(file, 'source collides with reserved browser runtime support.');
    output[file] = source;
  }
  output['zero/web/PackagedResources.java'] = `package zero.web;\nfinal class PackagedResources {\n    static final String[] ALL = {${resources.map(x => JSON.stringify('/' + x)).join(', ')}};\n    static final String[] IMAGES = {${images.map(x => JSON.stringify('/' + x)).join(', ')}};\n}\n`;
  output['zero/web/BrowserLauncher.java'] = output['zero/web/BrowserLauncher.java'].replaceAll('__APPLICATION_CLASS__', apps[0]);
  warnings.push('Browser effects overlap with up to 32 active/preparing voices per Sound. Blocked autoplay requests coalesce to one pending effect.');
  warnings.push('Browser audio requires a user gesture. Blocked playback is retried on the next click or key press; media failures are shown in the browser and console.');
  return { sources: output, mainClass: 'zero.web.BrowserLauncher', sourceMap, changes, warnings };
}
module.exports = { adaptSources, helperHashes };
