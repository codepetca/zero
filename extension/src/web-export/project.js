'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const lock = require('./toolchain-lock.json');
const xml = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;'
      })[c]
  );
// Runs before WebFX/GWT and has no network or parent-window broadcast path.
function browserRuntimeBootstrap() {
  'use strict';
  const options = new URLSearchParams(location.hash.slice(1));
  const runId = options.get('zeroRuntimeRun'), buildId = options.get('zeroRuntimeBuild');
  const parentOrigin = options.get('zeroRuntimeParentOrigin');
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
  let managed = location.protocol === 'http:' && location.hostname === '127.0.0.1' &&
    ['zeroRuntimeRun', 'zeroRuntimeBuild', 'zeroRuntimeParentOrigin'].every(key => options.getAll(key).length === 1) && validId(runId) && validId(buildId) && typeof parentOrigin === 'string';
  try { managed = managed && ((/^vscode-webview:\/\/[A-Za-z0-9-]+$/.test(parentOrigin)) || (new URL(parentOrigin).origin === parentOrigin && new URL(parentOrigin).protocol === 'http:' && new URL(parentOrigin).hostname === '127.0.0.1')); } catch (_) { managed = false; }
  let sequence = 0, terminal = false, failing = false, port = null;
  const queue = [], stops = [], milestones = new Set();
  const text = error => {
    try { return String(error && (error.stack || error.message) || error || 'Unknown runtime failure').slice(0, 8192); }
    catch (_) { return 'Cannot inspect runtime failure.'; }
  };
  const emit = (type, stage, code, diagnostic) => {
    if (terminal || (failing && type !== 'fatal') || milestones.has(type)) return;
    if (!['startup', 'ui-ready', 'first-frame', 'fatal', 'stopped'].includes(type)) return;
    milestones.add(type);
    if (type === 'fatal' || type === 'stopped') terminal = true;
    if (!managed) return;
    const event = {version: 1, runId, buildId, seq: ++sequence, type, stage, code};
    if (diagnostic != null) event.diagnostic = text(diagnostic);
    if (port) { try { port.postMessage(event); } catch (_) { port = null; } }
    else { if (queue.length === 32) queue.shift(); queue.push(event); }
  };
  const fail = (stage, code, error) => {
    if (terminal || failing) return;
    failing = true;
    let diagnostic = text(error);
    for (const stop of stops.splice(0)) {
      try { stop(); } catch (cleanup) { diagnostic = (diagnostic + '\nSuppressed cleanup: ' + text(cleanup)).slice(0, 8192); }
    }
    failing = false;
    emit('fatal', stage, code, diagnostic);
    console.error(diagnostic);
  };
  window.__zeroRuntime = Object.freeze({emit, fail, registerStop(stop) {
    if (typeof stop !== 'function') return () => {};
    if (terminal) { stop(); return () => {}; }
    stops.push(stop);
    return () => { const index = stops.indexOf(stop); if (index >= 0) stops.splice(index, 1); };
  }});
  window.addEventListener('error', event => {
    if (event.target && event.target !== window) fail('asset-load', 'ASSET_MISSING', 'Cannot load runtime resource: ' + (event.target.src || event.target.href || event.target.tagName));
    else fail('ui-callback', 'UI_CALLBACK_FAILED', event.error || event.message);
  }, true);
  window.addEventListener('unhandledrejection', event => fail('promise', 'PROMISE_REJECTED', event.reason));
  window.addEventListener('pagehide', event => {
    if (event.persisted || terminal) return;
    let failure;
    for (const stop of stops.splice(0)) { try { stop(); } catch (error) { if (!failure) failure = error; } }
    if (failure) fail('shutdown', 'SHUTDOWN_FAILED', failure);
    else emit('stopped', 'shutdown', 'STOPPED');
  });
  window.addEventListener('message', event => {
    const data = event.data;
    if (!managed || port || event.source !== parent || event.origin !== parentOrigin || !data || data.type !== 'zero-runtime-connect' || data.version !== 1 || data.runId !== runId || data.buildId !== buildId || event.ports.length !== 1) return;
    port = event.ports[0];
    for (const record of queue.splice(0)) { try { port.postMessage(record); } catch (_) { port = null; break; } }
  });
  emit('startup', 'startup', 'STARTING');
}
const runtimeBootstrap = '(' + browserRuntimeBootstrap.toString() + ')();';
async function generateProject(root, adapted, resources, artifactRoot) {
  const put = async (relative, content) => {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };
  for (const [name, content] of Object.entries(adapted.sources)) {
    if (
      !name.endsWith('.java') ||
      path.isAbsolute(name) ||
      name.split(/[\\/]/).some((p) => p === '..' || p === '.')
    )
      throw new Error(`Invalid generated Java path: ${name}`);
    await put(`src/main/java/${name}`, content);
  }
  const template = (name) =>
    fs.readFile(path.join(__dirname, 'template', name), 'utf8');
  const packages = [
    ...new Set(
      Object.keys(adapted.sources)
        .map((name) => path.posix.dirname(name))
        .filter((name) => name !== '.')
    )
  ];
  await put(
    'src/main/module.gwt.xml',
    (await template('module.gwt.xml')).replace(
      '<!-- APP_SOURCE_PATHS -->',
      packages.map((name) => `<source path="${xml(name)}"/>`).join('\n')
    )
  );
  await put(
    'src/main/resources/super/dev/webfx/platform/boot/gwt/GwtEntryPoint.java',
    (await template('GwtEntryPoint.java')).replace(
      '__MAIN_CLASS__',
      adapted.mainClass
    )
  );
  await put(
    'src/main/resources/super/dev/webfx/platform/resource/gwt/GwtEmbedResourcesBundle.java',
    await template('GwtEmbedResourcesBundle.java')
  );
  await put(
    'src/main/resources/super/dev/webfx/kit/mapper/peers/javafxgraphics/elemental2/util/FxEvents.java',
    await template('FxEvents.java')
  );
  await put(
    'src/main/resources/dev/webfx/platform/meta/exe/exe.properties',
    'executableModuleName=zero-web\nexecutableModuleVersion=1.0.0\napplicationModuleName=zero\npwa=null\nenvironment=production\n'
  );
  await put(
    'src/main/resources/public/dev/webfx/kit/css/main.css',
    await template('main.css')
  );
  await put(
    'src/main/resources/public/index.html',
    '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zero app</title><link rel="stylesheet" href="./dev/webfx/kit/css/main.css"></head><body><script>' + runtimeBootstrap + '</script><script src="./zero_web.nocache.js"></script></body></html>\n'
  );
  for (const resource of resources)
    await put(`src/main/resources/public/${resource.path}`, resource.bytes);
  const dep = (g, a, v, extra = '') =>
    `<dependency><groupId>${g}</groupId><artifactId>${a}</artifactId><version>${v}</version>${extra}</dependency>`;
  const dependencies = lock.webfx.map((a) =>
    dep(
      a.groupId,
      a.artifactId,
      a.version,
      `<scope>system</scope><systemPath>${xml('${zero.artifactRoot}/' + a.file)}</systemPath>`
    )
  );
  for (const [g, a, v] of [
    ['org.gwtproject', 'gwt-user', lock.gwt],
    ['org.gwtproject', 'gwt-dev', lock.gwt],
    ['com.google.elemental2', 'elemental2-dom', '1.2.3'],
    ['com.google.elemental2', 'elemental2-svg', '1.2.3'],
    ['com.google.jsinterop', 'base', '1.0.1'],
    ['com.google.jsinterop', 'jsinterop-annotations', '2.0.2'],
    ['org.treblereel.gwt.nio', 'gwt-nio', '1.1'],
    ['org.jresearch.gwt.time', 'org.jresearch.gwt.time', '2.0.12']
  ])
    dependencies.push(dep(g, a, v));
  await put(
    'pom.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>school.zero</groupId><artifactId>zero-web</artifactId><version>1.0.0</version><packaging>gwt-app</packaging>
<properties><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding><maven.main.skip>true</maven.main.skip><zero.artifactRoot>${xml(artifactRoot)}</zero.artifactRoot><maven.test.skip>true</maven.test.skip></properties>
<dependencies>${dependencies.join('\n')}</dependencies><build><plugins>
<plugin><groupId>net.ltgt.gwt.maven</groupId><artifactId>gwt-maven-plugin</artifactId><version>${lock.gwtPlugin}</version><extensions>true</extensions><configuration><moduleName>zero_web</moduleName><moduleShortName>zero_web</moduleShortName><failOnError>true</failOnError><sourceLevel>17</sourceLevel><style>OBF</style><optimize>9</optimize><localWorkers>2</localWorkers>
<!-- Plugin 1.2.0 quotes absolute compiler paths containing spaces as literal
     argument data on Unix. It appends compilerArgs after those defaults and
     launches GWT in target/. Final relative overrides select the same owned
     output/work/deploy paths without changing or relocating the cache. -->
<compilerArgs><arg>-war</arg><arg>${'${project.build.finalName}'}</arg><arg>-workDir</arg><arg>gwt/work</arg><arg>-deploy</arg><arg>gwt/deploy</arg></compilerArgs><jvmArgs><arg>-Xmx2g</arg></jvmArgs></configuration></plugin>
<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId><version>3.11.0</version></plugin>
<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-resources-plugin</artifactId><version>3.3.1</version></plugin>
<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-surefire-plugin</artifactId><version>3.1.2</version></plugin>
<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-war-plugin</artifactId><version>3.4.0</version></plugin>
<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-install-plugin</artifactId><version>3.1.0</version></plugin><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-deploy-plugin</artifactId><version>3.1.1</version></plugin><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-clean-plugin</artifactId><version>3.2.0</version></plugin></plugins></build></project>`
  );
}
module.exports = { generateProject, runtimeBootstrap };
