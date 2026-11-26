'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createNativeUpdateCommands} = require('../src/native-updates');
const {createUpdateReminder} = require('../src/update-reminder');

const day = 24 * 60 * 60 * 1000;
const endpoint = 'https://zero.codepet.ca/updates/desktop.json';

function fixture(t, options = {}) {
  let now = 100 * day;
  let version = '0.5.84';
  let focused = true;
  let enabled = true;
  let busy = false;
  let answer = 'Later';
  let focusListener, configListener;
  let request = () => Response.json({schema: 1, versions: {
    mac: version, windowsStore: version, windowsPortable: version, windowsInstaller: version
  }});
  const state = options.state ?? new Map();
  const timers = new Map();
  const notices = [], commands = [], opened = [], requests = [], nativeCalls = [], errors = [];
  const platform = options.platform ?? 'darwin';
  const environment = options.environment ?? {};
  const vscode = {
    ExtensionMode: {Production: 1},
    env: {remoteName: options.remoteName, async openExternal(uri) {opened.push(uri); return true;}},
    Uri: {parse: value => value},
    commands: {async executeCommand(id) {
      commands.push(id);
      if (options.nativeHandoff) await native[id]();
    }},
    window: {
      get state() {return {focused};},
      onDidChangeWindowState(listener) {focusListener = listener; return {dispose() {focusListener = undefined;}};},
      async showInformationMessage(...items) {notices.push(items); return answer === 'accept' ? items[1] : answer;},
      async showErrorMessage(message) {errors.push(message);},
    },
    workspace: {
      getConfiguration: () => ({get: () => enabled}),
      onDidChangeConfiguration(listener) {configListener = listener; return {dispose() {configListener = undefined;}};},
    },
  };
  const native = createNativeUpdateCommands(vscode, {
    platform, environment,
    async execute(...args) {nativeCalls.push(args);},
    spawnProcess(...args) {
      nativeCalls.push(args);
      const child = new EventEmitter();
      child.unref = () => {};
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
  });
  const context = {
    extensionMode: options.extensionMode ?? 1,
    extensionPath: options.extensionPath ?? '/home/fixture/Library/Application Support/Zero/editor/extensions/zero.zero-0.5.83',
    extension: {packageJSON: {version: options.installed ?? '0.5.83'}},
    globalState: {get: key => state.get(key), async update(key, value) {state.set(key, value);}},
  };
  const reminder = createUpdateReminder(vscode, {
    context, platform, environment,
    home: '/home/fixture', isBusy: () => busy, now: () => now,
    fetchImpl: async (...args) => {requests.push(args); return request();},
    setTimer(callback, delay) {const id = Symbol(); timers.set(id, {callback,delay}); return id;},
    clearTimer: id => timers.delete(id),
  });
  t.after(() => reminder.dispose());
  return {
    notices, commands, opened, requests, state, timers, nativeCalls, errors,
    async tick() {
      assert.equal(timers.size, 1);
      const [id, {callback}] = timers.entries().next().value;
      timers.delete(id);
      await callback();
    },
    version(value) {version = value;},
    busy(value) {busy = value;},
    answer(value) {answer = value;},
    request(value) {request = value;},
    advance(delta) {now += delta;},
    focus(value) {focused = value; focusListener?.({focused});},
    enabled(value) {enabled = value; configListener?.({affectsConfiguration: key => key === 'zero.showUpdateReminders'});},
    dispose: () => reminder.dispose(),
  };
}

test('a newer Mac release waits for an idle editor and opens only the native updater on click', async t => {
  const f = fixture(t, {nativeHandoff:true});
  f.busy(true);
  await f.tick();
  assert.equal(f.notices.length, 0);
  assert.equal(f.requests[0][0], endpoint);
  assert.equal(f.requests[0][1].credentials, 'omit');
  assert.equal(f.requests[0][1].redirect, 'error');
  f.busy(false);
  f.answer('accept');
  await f.tick();
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.notices, [['Zero 0.5.84 is available.', 'Update Zero', 'Later']]);
  assert.deepEqual(f.commands, ['zero.checkForUpdates']);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.nativeCalls.map(call => call.slice(0, 2)), [
    ['/usr/bin/open', ['-b', 'ca.codepet.zero', 'zero-updates://check', '--args', '--update-request']]
  ]);
  assert.deepEqual(f.errors, []);
});

test('Later and dismissal use the persisted cooldown, and a new version can prompt sooner', async t => {
  const first = fixture(t);
  await first.tick();
  assert.deepEqual(first.commands, []);
  const reopened = fixture(t, {state:first.state});
  reopened.answer(undefined);
  await reopened.tick();
  assert.deepEqual(reopened.requests, []);
  assert.deepEqual(reopened.notices, []);
  reopened.advance(day);
  reopened.version('0.5.85');
  await reopened.tick();
  assert.equal(reopened.notices[0][0], 'Zero 0.5.85 is available.');
  reopened.advance(6 * day);
  await reopened.tick();
  assert.equal(reopened.notices.length, 1);
  reopened.advance(day);
  await reopened.tick();
  assert.equal(reopened.notices.length, 2);
  assert.deepEqual(reopened.commands, []);
});

test('leaving a notification unresolved does not repeat it or block later versions', async t => {
  const f = fixture(t);
  let dismiss;
  f.answer(new Promise(resolve => {dismiss = resolve;}));
  await f.tick();
  assert.equal(f.notices.length, 1);

  f.advance(8 * day);
  await f.tick();
  assert.equal(f.notices.length, 1);
  f.advance(day);
  f.version('0.5.85');
  f.answer('Later');
  await f.tick();
  assert.deepEqual(f.notices.map(([text]) => text), [
    'Zero 0.5.84 is available.', 'Zero 0.5.85 is available.'
  ]);
  dismiss(undefined);
});

test('Store, standalone and school portable select only their published channel', async t => {
  const versions = {mac:'1.0.0', windowsStore:'0.5.86', windowsInstaller:'0.5.87', windowsPortable:'0.5.88'};
  for (const [marker, channel, action, folder] of [
    ['store', 'windowsStore', 'Open Microsoft Store', 'ZeroStudioStoreData'],
    ['store', 'windowsStore', 'Open Microsoft Store', 'Packages\\Codepet.zerostudio_g62pw1js6rhjp\\LocalCache\\Local\\ZeroStudioStoreData'],
    [undefined, 'windowsInstaller', 'Update Zero', 'ZeroData'],
    ['portable', 'windowsPortable', 'View update instructions', 'ZeroPortableData'],
  ]) {
    const options = {platform:'win32', nativeHandoff:true,
      environment:{LOCALAPPDATA:'C:\\UserData', ZERO_WINDOWS_DISTRIBUTION:marker},
      extensionPath:'C:\\UserData\\' + folder + '\\editor\\extensions\\zero.zero-0.5.83'};
    const f = fixture(t, options);
    f.answer('accept');
    f.request(() => Response.json({schema:1, versions}));
    await f.tick();
    assert.ok(f.notices[0][0].startsWith('Zero ' + versions[channel] + ' is available.'));
    assert.equal(f.notices[0][1], action);
    if (marker === 'portable') {
      assert.match(f.notices[0][0], /school IT/);
      assert.deepEqual(f.commands, []);
      assert.deepEqual(f.opened, ['https://zero.codepet.ca/teachers/pilot#portable-windows']);
      assert.deepEqual(f.nativeCalls, []);
    } else {
      assert.deepEqual(f.commands, ['zero.checkForUpdates']);
      if (marker === 'store') {
        assert.deepEqual(f.opened, ['ms-windows-store://downloadsandupdates']);
        assert.deepEqual(f.nativeCalls, []);
      } else {
        assert.deepEqual(f.opened, []);
        assert.deepEqual(f.nativeCalls.map(call => call.slice(0, 2)), [
          ['C:\\UserData\\Zero\\Zero.exe', ['--check-for-updates']]
        ]);
      }
    }
    assert.deepEqual(f.errors, []);
    for (const ownVersion of [null, '0.5.83']) {
      const quiet = fixture(t, options);
      quiet.request(() => Response.json({schema:1, versions:{...versions, [channel]:ownVersion}}));
      await quiet.tick();
      assert.deepEqual(quiet.notices, []);
    }
  }
});

test('current, older, unavailable, malformed and oversized version responses are quiet', async t => {
  for (const latest of [null,'0.5.83','0.5.81','0.5.84-prerelease',{url:'https://example.com'}]) {
    const f = fixture(t);
    f.request(() => Response.json({schema:1, versions:{mac:latest}}));
    await f.tick();
    assert.deepEqual(f.notices, []);
    assert.deepEqual(f.commands, []);
  }
  for (const response of [() => new Response('offline',{status:503}), () => new Response('x'.repeat(3000)),
    () => {throw Error('network unavailable');}]) {
    const f = fixture(t);
    f.request(response);
    await f.tick();
    assert.deepEqual(f.notices, []);
    assert.deepEqual(f.commands, []);
  }
});

test('unmanaged profiles, remote and development windows do not schedule network work', t => {
  for (const options of [{platform:'linux'},{platform:'win32'},{extensionMode:2},
    {platform:'win32',environment:{LOCALAPPDATA:'C:\\UserData',ZERO_KIT_DIR:'C:\\Zero'}},
    {platform:'win32',environment:{LOCALAPPDATA:'C:\\UserData',ZERO_WINDOWS_DISTRIBUTION:'store'}},
    {platform:'win32',environment:{LOCALAPPDATA:'C:\\UserData',ZERO_WINDOWS_DISTRIBUTION:'portable'},
      extensionPath:'C:\\UserData\\ZeroStudioStoreData\\editor\\extensions\\zero.zero-0.5.83'},
    {platform:'win32',environment:{ZERO_WINDOWS_DISTRIBUTION:'msix-feasibility'}},
    {remoteName:'ssh-remote'},{extensionPath:'/home/fixture/.vscode/extensions/zero.zero-0.5.83'}]) {
    const f = fixture(t, options);
    assert.equal(f.timers.size, 0);
  }
});

test('disabled, unfocused and disposed windows stay quiet, including after an in-flight check', async t => {
  const f = fixture(t);
  f.enabled(false);
  assert.equal(f.timers.size, 0);
  f.enabled(true);
  f.focus(false);
  assert.equal(f.timers.size, 0);
  f.focus(true);
  f.request(async () => {
    f.dispose();
    return Response.json({schema:1, versions:{mac:'0.5.84'}});
  });
  await f.tick();
  assert.deepEqual(f.notices, []);
  assert.equal(f.timers.size, 0);
  assert.ok(f.requests[0][1].signal.aborted);
});
