'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createNativeUpdateCommands} = require('../src/native-updates');

function fixture(options) {
  const errors = [], calls = [];
  const commands = createNativeUpdateCommands({window:{showErrorMessage:async text => errors.push(text)}}, {
    platform:'darwin', execute:async (...args) => calls.push(args), ...options
  });
  return {commands, errors, calls};
}

test('manual native commands use only fixed, directly addressed requests and bounded shell-free execution', async () => {
  const {commands, errors, calls} = fixture();
  // Commands invoked programmatically cannot replace their request URL or app.
  await commands['zero.checkForUpdates']('https://attacker.invalid/feed', {app:'/tmp/other.app'});
  await commands['zero.updateSettings']('zero-updates://settings?feed=other');
  assert.deepEqual(calls.map(([file, args]) => [file, args]), [
    ['/usr/bin/open', ['-b', 'ca.codepet.zero', 'zero-updates://check', '--args', '--update-request']],
    ['/usr/bin/open', ['-b', 'ca.codepet.zero', 'zero-updates://settings', '--args', '--update-request']]
  ]);
  for (const [, , options] of calls) {
    assert.equal(options.shell, false);
    assert.equal(options.timeout, 10000);
    assert.equal(options.killSignal, 'SIGKILL');
    assert.equal(options.maxBuffer, 64 * 1024);
    assert.deepEqual(options.env, {PATH:'/usr/bin:/bin'});
  }
  assert.deepEqual(errors, [], 'The native updater owns progress and results; a successful handoff adds no alert');
});

test('programmatic requests on unsupported platforms explain availability without spawning', async () => {
  for (const platform of ['linux', 'freebsd']) {
    const spawns = [];
    const {commands, errors, calls} = fixture({platform, spawnProcess:(...args) => spawns.push(args)});
    await commands['zero.checkForUpdates']();
    await commands['zero.updateSettings']();
    assert.deepEqual(calls, []);
    assert.deepEqual(spawns, []);
    assert.equal(errors.length, 2);
    assert.ok(errors.every(text => /only on macOS and Windows/.test(text)));
  }
});

test('missing app, denied opening and timeout errors give usable recovery without leaking process output', async () => {
  for (const failure of [Object.assign(new Error('PRIVATE stderr'), {code:1}), Object.assign(new Error('PRIVATE path'), {code:'ENOENT'}), Object.assign(new Error('PRIVATE output'), {killed:true, signal:'SIGKILL'})]) {
    const {commands, errors} = fixture({execute:async () => {throw failure;}});
    for (const action of Object.values(commands)) await action();
    assert.equal(errors.length, 2);
    assert.ok(errors.every(text => /latest Zero.app in Applications/.test(text) && /teacher or IT/.test(text)));
    assert.ok(errors.every(text => !text.includes('PRIVATE')));
  }
});

test('native update contributions are Mac/Windows Palette-only and retain the minimal view menu', () => {
  const manifest = require('../package.json');
  for (const [command, title] of [['zero.checkForUpdates','Zero: Check for Updates'], ['zero.updateSettings','Zero: Update Settings']]) {
    assert.deepEqual(manifest.contributes.commands.find(entry => entry.command === command), {command, title, enablement:'isMac || isWindows'});
    assert.deepEqual(manifest.contributes.menus.commandPalette.find(entry => entry.command === command), {command, when:'isMac || isWindows'});
    for (const [location, entries] of Object.entries(manifest.contributes.menus)) {
      if (location !== 'commandPalette') assert.ok(entries.every(entry => entry.command !== command));
    }
  }
  const controlsMenu = ['zero.githubAccount', 'zero.chooseRepository', 'zero.exportWeb', 'zero.openFirstLesson', 'zero.showSetup', 'zero.startPage', 'zero.showOutput'];
  for (const view of ['zero.controls', 'zero.studentControls']) {
    const entries = manifest.contributes.menus['view/title'].filter(entry => entry.when === `view == ${view}`);
    assert.deepEqual(entries.map(entry => entry.command), view === 'zero.controls' ? [...controlsMenu, 'zero.previewStudentExplorer'] : controlsMenu);
    assert.ok(entries.every(entry => !entry.group.startsWith('navigation')), 'Controls remain overflow-only');
  }
});

function windowsFixture(options = {}) {
  const children = [], spawns = [];
  const state = fixture({
    platform:'win32', environment:{LOCALAPPDATA:'C:\\Users\\Student Name\\AppData\\Local'},
    spawnProcess:(...args) => {
      spawns.push(args);
      const child = new EventEmitter();
      child.unrefs = 0;
      child.unref = () => {child.unrefs++;};
      children.push(child);
      return child;
    },
    ...options
  });
  return {...state, children, spawns};
}

test('Windows commands launch only the stable installed stub and fixed arguments without waiting for UI exit', async () => {
  const {commands, calls, errors, spawns, children} = windowsFixture();
  for (const [command, argument] of [['zero.checkForUpdates','--check-for-updates'], ['zero.updateSettings','--update-settings']]) {
    let completed = false;
    const pending = commands[command]('https://attacker.invalid/feed', {executable:'D:\\other.exe', args:['--feed', 'evil']})
      .then(() => {completed = true;});
    await Promise.resolve();
    assert.equal(completed, false, 'Handoff must wait for process creation');
    const child = children.at(-1);
    assert.equal(child.unrefs, 0);
    child.emit('spawn');
    await pending;
    assert.equal(completed, true, 'No exit event is required');
    assert.equal(child.unrefs, 1);
    assert.deepEqual(spawns.at(-1), [
      'C:\\Users\\Student Name\\AppData\\Local\\Zero\\Zero.exe', [argument],
      {shell:false, windowsHide:true, detached:false, stdio:'ignore'}
    ]);
    // A later child error is consumed and never leaks private process details.
    child.emit('error', new Error('PRIVATE controller details'));
  }
  assert.deepEqual(calls, [], 'Windows never uses the Mac execFile path');
  assert.deepEqual(errors, []);
});

test('Windows invalid or missing local application data cannot launch another path', async () => {
  for (const local of [undefined, '', 'relative', 'C:relative', '\\Users\\Student', '\\\\server\\share', 'C:\\Users\nPRIVATE', 123]) {
    const {commands, spawns, errors} = windowsFixture({environment:{LOCALAPPDATA:local}});
    for (const action of Object.values(commands)) await action();
    assert.deepEqual(spawns, []);
    assert.equal(errors.length, 2);
    assert.ok(errors.every(text => /Install the latest Zero for Windows/.test(text) && /teacher or IT/.test(text)));
    assert.ok(errors.every(text => !text.includes('PRIVATE')));
  }
});

test('Windows spawn failures report recovery without exposing child details', async () => {
  for (const code of ['ENOENT', 'EACCES']) {
    const {commands, children, errors} = windowsFixture();
    const pending = commands['zero.checkForUpdates']();
    children[0].emit('error', Object.assign(new Error('PRIVATE path or output'), {code}));
    await pending;
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Install the latest Zero for Windows/);
    assert.match(errors[0], /teacher or IT/);
    assert.ok(!errors[0].includes('PRIVATE'));
  }
  const {commands, errors} = windowsFixture({spawnProcess:() => {throw new Error('PRIVATE synchronous failure');}});
  await commands['zero.updateSettings']();
  assert.equal(errors.length, 1);
  assert.ok(!errors[0].includes('PRIVATE'));
});

test('Windows stalled spawn signaling is bounded without killing the native updater', async context => {
  context.mock.timers.enable({apis:['setTimeout']});
  const {commands, children, errors} = windowsFixture();
  const pending = commands['zero.updateSettings']();
  context.mock.timers.tick(5000);
  await pending;
  assert.equal(children[0].unrefs, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Install the latest Zero for Windows/);
  // Even an unusually delayed spawn/error must not kill a controller or throw.
  children[0].emit('spawn');
  children[0].emit('error', new Error('PRIVATE delayed error'));
  assert.equal(errors.length, 1);
});
