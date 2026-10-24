'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {validateRuntimeEvent, parseNativeRecord, NATIVE_PREFIX} = require('../src/runtime-events');
const {runtimeBootstrap} = require('../src/web-export/project');
const record = {version: 1, runId: 'run-1', buildId: 'build-1', seq: 1, type: 'startup', stage: 'startup', code: 'STARTING'};
test('strict bounded local schema rejects forged identity, oversized diagnostics, replay and extra authority', () => {
  assert.deepEqual(parseNativeRecord(NATIVE_PREFIX + JSON.stringify(record)), record);
  for (const change of [{seq: 0}, {version: 2}, {runId: '*'}, {diagnostic: 'a'.repeat(8193)}, {command: 'publish'}, {type: 'healthy'}, {stage: 'remote'}, {type: 'fatal'}, {stage: 'frame-draw'}, {code: 'SHUTDOWN_FAILED'}]) assert.equal(validateRuntimeEvent({...record, ...change}), null);
  assert.equal(validateRuntimeEvent(record, {runId: 'new-run'}), null);
  assert.equal(validateRuntimeEvent(record, {afterSeq: 1}), null);
  assert.equal(parseNativeRecord('ordinary student stdout'), null);
  assert.equal(parseNativeRecord(NATIVE_PREFIX + '{}'.repeat(40000)), null);
});
function boot({hostname = '127.0.0.1', origin = 'http://127.0.0.1:3210', fragment = ''} = {}) {
  const listeners = {}, errors = [];
  const parent = {};
  const window = {addEventListener(type, fn) { listeners[type] = fn; }};
  const hash = '#zeroRuntimeRun=run-1&zeroRuntimeBuild=build-1&zeroRuntimeParentOrigin=' + encodeURIComponent(origin) + fragment;
  vm.runInNewContext(runtimeBootstrap, {window, parent, location: {protocol: 'http:', hostname, hash}, URL, URLSearchParams, console: {error: value => errors.push(value)}});
  const output = [], port = {postMessage: value => output.push(value)};
  const connect = changes => listeners.message({source: parent, origin, data: {type: 'zero-runtime-connect', version: 1, runId: 'run-1', buildId: 'build-1'}, ports: [port], ...changes});
  return {window, listeners, errors, output, connect};
}
test('bootstrap queues until exact parent handshake and sends only to transferred port', () => {
  const b = boot();
  b.connect({origin: 'http://127.0.0.1:9999'});
  b.connect({source: {}});
  b.connect({data: {type: 'zero-runtime-connect', version: 1, runId: 'old', buildId: 'build-1'}});
  assert.equal(b.output.length, 0);
  b.connect();
  assert.equal(b.output[0].type, 'startup');
  b.window.__zeroRuntime.emit('ui-ready', 'startup', 'UI_READY');
  assert.equal(b.output[1].type, 'ui-ready');
  assert.equal(validateRuntimeEvent(b.output[1]).seq, 2);
});
test('fatal promise preserves cleanup causes, stops owners once and cannot be replaced by cleanup stopped', () => {
  const b = boot(); let stops = 0;
  b.connect();
  b.window.__zeroRuntime.registerStop(() => { stops++; b.window.__zeroRuntime.emit('stopped', 'shutdown', 'STOPPED'); throw new Error('cleanup cause'); });
  b.listeners.unhandledrejection({reason: new Error('promise cause')});
  b.listeners.error({error: new Error('duplicate'), target: b.window});
  assert.equal(stops, 1);
  assert.equal(b.output.length, 2);
  assert.equal(b.output[1].type, 'fatal');
  assert.match(b.output[1].diagnostic, /promise cause/);
  assert.match(b.output[1].diagnostic, /cleanup cause/);
});
test('published sites, remote parents and duplicate config cannot create a managed diagnostic path', () => {
  for (const options of [{hostname: 'student.github.io'}, {origin: 'https://remote.example'}, {fragment: '&zeroRuntimeRun=other'}, {origin: 'http://127.0.0.1:3210/path'}, {origin: '*'}]) {
    const b = boot(options); let stopped = false;
    b.window.__zeroRuntime.registerStop(() => { stopped = true; });
    b.connect(); b.listeners.unhandledrejection({reason: 'local failure'});
    assert.equal(b.output.length, 0); assert.equal(stopped, true); assert.match(b.errors[0], /local failure/);
  }
});
test('UI-ready, paused frame and hidden cached page do not depend on an activity watchdog', () => {
  const b = boot(); b.connect();
  b.window.__zeroRuntime.emit('ui-ready', 'startup', 'UI_READY');
  b.listeners.pagehide({persisted: true});
  assert.equal(b.output.length, 2);
  b.window.__zeroRuntime.emit('first-frame', 'frame-draw', 'FIRST_FRAME');
  assert.equal(b.output[2].type, 'first-frame');
  const game = fs.readFileSync(path.join(__dirname, '../../framework/src/main/java/zero/GameApp.java'), 'utf8');
  assert.ok(game.indexOf('endFrame(true);') < game.indexOf('runtimeEvent("first-frame"'));
  assert.match(game, /if \(!paused\) update\(seconds\)/);
  assert.match(game, /if \(!gameVisible \|\| isStopped\(\)\)/);
});

test('asset, startup and uncaught UI errors are fatal while repeated startup/readiness is deduplicated', () => {
  const b = boot(); b.connect();
  b.window.__zeroRuntime.emit('startup', 'startup', 'STARTING');
  b.window.__zeroRuntime.emit('ui-ready', 'startup', 'UI_READY');
  b.window.__zeroRuntime.emit('ui-ready', 'startup', 'UI_READY');
  assert.equal(b.output.length, 2);
  b.listeners.error({target: {src: '/missing.png'}});
  assert.equal(b.output[2].code, 'ASSET_MISSING');
  assert.match(b.output[2].diagnostic, /missing.png/);
  const c = boot(); c.connect();
  c.window.__zeroRuntime.fail('startup', 'STARTUP_FAILED', new Error('setup cause'));
  assert.equal(c.output[1].code, 'STARTUP_FAILED');
  const d = boot(); d.connect();
  d.listeners.error({target: d.window, error: new Error('button cause')});
  assert.equal(d.output[1].code, 'UI_CALLBACK_FAILED');
  assert.match(d.output[1].diagnostic, /button cause/);
});
test('fingerprint-checked browser copy strips all native reporting code and retains fatal/frame hooks', () => {
  const {adaptSources} = require('../src/web-export/adapters');
  const {helperHashes} = require('../src/core-contract');
  const sources = {'Main.java': 'import zero.App; public class Main extends App {}'};
  for (const file of Object.keys(helperHashes)) sources[file] = fs.readFileSync(path.join(__dirname, '../../framework/src/main/java', file), 'utf8');
  const adapted = adaptSources({sources}).sources;
  assert.doesNotMatch(adapted['zero/App.java'], /Thread\.|System\.(out|getenv|getProperty)|RuntimeReporter|java\.io\.|java\.net\.|java\.nio\./);
  assert.match(adapted['zero/App.java'], /BrowserRuntime.fatal/);
  assert.match(adapted['zero/App.java'], /BrowserLifecycle.own\(this, this::stop\)/);
  assert.match(adapted['zero/GameApp.java'], /runtimeEvent\("first-frame"/);
  assert.match(adapted['zero/GameApp.java'], /runtimeFailure\(stage, "FRAME_EXCEPTION", failure\)/);
});
