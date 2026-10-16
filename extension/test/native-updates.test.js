'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
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
  for (const platform of ['win32', 'linux']) {
    const {commands, errors, calls} = fixture({platform});
    await commands['zero.checkForUpdates']();
    await commands['zero.updateSettings']();
    assert.deepEqual(calls, []);
    assert.equal(errors.length, 2);
    assert.ok(errors.every(text => /only on macOS/.test(text)));
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

test('native update contributions are macOS Palette-only and retain the minimal view menu', () => {
  const manifest = require('../package.json');
  for (const [command, title] of [['zero.checkForUpdates','Zero: Check for Updates'], ['zero.updateSettings','Zero: Update Settings']]) {
    assert.deepEqual(manifest.contributes.commands.find(entry => entry.command === command), {command, title, enablement:'isMac'});
    assert.deepEqual(manifest.contributes.menus.commandPalette.find(entry => entry.command === command), {command, when:'isMac'});
    for (const [location, entries] of Object.entries(manifest.contributes.menus)) {
      if (location !== 'commandPalette') assert.ok(entries.every(entry => entry.command !== command));
    }
  }
  assert.deepEqual(manifest.contributes.menus['view/title'].map(entry => entry.command), ['zero.exportWeb', 'zero.copyPublishedWebLink', 'zero.openPublishedWeb', 'zero.openFirstLesson', 'zero.showSetup', 'zero.startProject', 'zero.showOutput']);
});
