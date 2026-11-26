'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {createStartPage} = require('../src/start-page');

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {let resolve, reject;const promise = new Promise((yes, no) => {resolve = yes;reject = no;});return {promise, resolve, reject};}
function fake(initial = {phase:'ready', accountId:'42', accountLabel:'student'}) {
  let state = initial;
  const panels = [], commands = [], opens = [], reports = [], serializers = new Map(), listings = [], openChanges = [];
  const vscode = {ViewColumn:{Active:1}, commands:{executeCommand:async command => {commands.push(command);}}, window:{
    registerWebviewPanelSerializer(type, serializer) {serializers.set(type, serializer);return {dispose:() => serializers.delete(type)};},
    createWebviewPanel(kind, title, show, options) {
      let receive;const close = new Set();let writes = 0, html;
      const panel = {kind, title, show, options, viewColumn:2, reveals:[], messages:[],
        webview:{options, postMessage:async message => {panel.messages.push(message);return true;}, onDidReceiveMessage(callback) {receive = callback;return {dispose:() => {receive = undefined;}};},
          get html() {return html;}, set html(value) {writes++;html = value;}},
        get htmlWrites() {return writes;},
        onDidDispose(callback) {close.add(callback);return {dispose:() => close.delete(callback)};},
        dispose() {panel.disposed = true;for (const callback of close) callback();},
        receive:message => receive?.(message), reveal:(...args) => panel.reveals.push(args)};
      panels.push(panel);return panel;
    }
  }};
  const dependencies = {onDidChangeOpen:open=>openChanges.push(open), getState:() => state, listRecent:async accountId => {listings.push(accountId);return [];}, openRecent:async (item, accountId) => opens.push({item, accountId}), report:(...args) => reports.push(args)};
  return {vscode, dependencies, panels, commands, opens, reports, serializers, listings, openChanges, setState:value => {state = value;},
    message(panel, value) {return panel.receive({...value, token:panel.messages.at(-1)?.token});}};
}
async function open(f) {
  const page = createStartPage(f.vscode, f.dependencies), panel = page.show();
  await tick();await panel.receive({type:'ready'});
  return {page, panel};
}
const payload = panel => panel.messages.at(-1).state;

test('first launch starts checked and saves only the current Start building choice', async t => {
  for (const reporting of [true, false]) await t.test(String(reporting), async () => {
    const f = fake({phase:'signed-out'});
    const saved = [];
    f.dependencies.needsFirstRunChoice = () => saved.length === 0;
    f.dependencies.saveFirstRunChoice = async value => {saved.push(value);};
    const {page, panel} = await open(f);
    const html = panel.webview.html;
    assert.match(html, /id="automatic-reports" type="checkbox" checked/);
    assert.match(html, /technical details to public GitHub issues/);
    const browser = domHarness(html);
    browser.update(panel.messages.at(-1));
    assert.equal(browser.elements.get('first-launch').hidden, false);
    assert.equal(browser.elements.get('normal-start').hidden, true);
    await f.message(panel, {type:'action', action:'signIn'});
    await f.message(panel, {type:'finishSetup', reporting:'true'});
    await panel.receive({type:'finishSetup', reporting:true, token:'stale'});
    assert.deepEqual(saved, []);
    assert.deepEqual(f.commands, []);
    browser.elements.get('automatic-reports').checked = reporting;
    browser.elements.get('start-building').click();
    await panel.receive(browser.sent.at(-1));
    assert.deepEqual(saved, [reporting]);
    browser.update(panel.messages.at(-1));
    assert.equal(browser.elements.get('first-launch').hidden, true);
    assert.equal(browser.elements.get('normal-start').hidden, false);
    await f.message(panel, {type:'finishSetup', reporting:!reporting});
    assert.deepEqual(saved, [reporting]);
    await f.message(panel, {type:'action', action:'signIn'});
    assert.deepEqual(f.commands, ['zero.signInToGitHub']);
    page.dispose();
  });
});

test('Start building refreshes a stale notice after another window finishes', async () => {
  const f = fake({phase:'signed-out'});
  let firstLaunch = true;
  f.dependencies.needsFirstRunChoice = () => firstLaunch;
  f.dependencies.saveFirstRunChoice = () => assert.fail('The other window already saved the choice');
  const {page, panel} = await open(f);
  assert.equal(payload(panel).firstLaunch, true);
  firstLaunch = false;
  await f.message(panel, {type:'finishSetup', reporting:true});
  assert.equal(payload(panel).firstLaunch, false);
  page.dispose();
});

test('one reusable native start tab, stable document, explicit focus and lifecycle', async () => {
  const f = fake(), {page, panel} = await open(f);
  assert.deepEqual(f.openChanges,[true]);
  assert.equal(panel.kind, 'zero.startPage');assert.equal(panel.title, 'Zero Start Page');
  assert.deepEqual(panel.show, {viewColumn:1, preserveFocus:false});
  assert.equal(panel.options.enableCommandUris, false);assert.deepEqual(panel.options.localResourceRoots, []);
  assert.equal(panel.options.retainContextWhenHidden, true);
  const html = panel.webview.html;
  const versionLabel = `<p class="muted start-version">${require('../package.json').version}</p>`;
  assert.match(html, /<div class="start-title-row">[\s\S]+?<\/div>\s+<p class="muted start-version">/);
  assert.ok(html.includes(versionLabel));
  assert.equal(html.split(versionLabel).length, 2);
  assert.equal(page.show({preserveFocus:true, viewColumn:3}), panel);
  assert.deepEqual(panel.reveals, [[3, true]]);assert.equal(f.panels.length, 1);
  for (let index = 0; index < 10; index++) await page.refresh();
  assert.equal(panel.webview.html, html);assert.equal(panel.htmlWrites, 1);assert.equal(page.isOpen(), true);
  assert.equal(page.owns({input:{viewType:'zero.startPage'}}), true);
  assert.equal(page.owns({input:{viewType:'zero.tutorials'}}), false);
  panel.dispose();assert.equal(page.isOpen(), false);assert.deepEqual(f.openChanges,[true,false]);
  const reopened = page.show({preserveFocus:true});assert.notEqual(reopened, panel);
  page.dispose();assert.equal(reopened.disposed, true);assert.equal(page.show(), undefined);
  assert.equal(f.serializers.size, 0);assert.deepEqual(f.openChanges,[true,false,true,false]);
});

test('Start Page docs and project choices require a GitHub connection; cloud choices require ready access', async () => {
  for (const phase of ['signed-out','connect','checking','install','unavailable','ready']) {
    const disconnected = ['signed-out','connect'].includes(phase);
    const f = fake({phase, accountId:disconnected ? undefined : '42'}), {page, panel} = await open(f);
    for (const action of ['tutorial','tutorials','new','clone','joinGameJam','local','signIn','connect','signInCode','setup']) await f.message(panel, {type:'action', action});
    const expected = phase === 'ready' ? ['zero.openDocs','zero.newProject','zero.cloneRepository','zero.joinGameJam','zero.openLocalProject']
      : disconnected ? ['zero.signInToGitHub'] : ['zero.openDocs','zero.openLocalProject', ...(['install','unavailable'].includes(phase) ? ['zero.setupGitHub'] : [])];
    assert.deepEqual(f.commands, expected, phase);page.dispose();
  }
});

test('message allowlist rejects arbitrary commands, paths, URLs, inherited names and stale generations', async () => {
  const f = fake(), {page, panel} = await open(f), stale = panel.messages.at(-1).token;
  for (const message of [{type:'execute', command:'workbench.action.closeWindow'}, {type:'action', action:'toString'}, {type:'action', action:'constructor'}, {type:'action', action:'zero.startProject'}, {type:'recent', path:'/private'}, {type:'external', url:'https://evil.test'}, {type:'action', action:'local', token:'fake'}]) {
    await panel.receive({token:stale, ...message});
  }
  f.setState({phase:'ready', accountId:'42', status:'Changed'});await page.refresh();
  await panel.receive({type:'action', action:'local', token:stale});
  assert.deepEqual(f.commands, []);assert.deepEqual(f.opens, []);
  await f.message(panel, {type:'action', action:'local'});assert.deepEqual(f.commands, ['zero.openLocalProject']);page.dispose();
});

test('Start Page retries unavailable verification without opening sign-in or project actions', async () => {
  const f = fake({phase:'verification-unavailable'}), {page, panel} = await open(f);
  for (const action of ['new','clone','signIn','connect','setup']) await f.message(panel, {type:'action', action});
  assert.deepEqual(f.commands, ['zero.recheckGitHubConnection']);
  f.setState({phase:'signed-out'});await page.refresh();
  await f.message(panel, {type:'action', action:'setup'});
  await f.message(panel, {type:'action', action:'signIn'});
  assert.deepEqual(f.commands, ['zero.recheckGitHubConnection','zero.signInToGitHub']);
  page.dispose();
});


test('Continue joining is scoped to a ready Start Page with a selected Jam', async () => {
  const f = fake(), {page,panel}=await open(f), b=domHarness(panel.webview.html);
  await f.message(panel,{type:'action',action:'continueGameJam'});
  assert.deepEqual(f.commands,[]);
  const jamReview={title:'Toast to the Moon',rules:'Build your own game.',registrationDeadline:'Nov 25',submissionDeadline:'Nov 30'};
  f.setState({phase:'ready',accountId:'42',jamReview});
  await page.refresh();
  b.update(panel.messages.at(-1));
  assert.deepEqual(payload(panel).jamReview,jamReview);
  assert.equal(b.elements.get('jam-rules-text').textContent,jamReview.rules);
  assert.equal(b.elements.get('jam-deadlines').textContent,'Register by Nov 25 · Submit by Nov 30');
  await f.message(panel,{type:'action',action:'continueGameJam'});
  assert.deepEqual(f.commands,['zero.continueGameJamJoin']);
  f.setState({phase:'signed-out',jamReview});
  await page.refresh();
  b.update(panel.messages.at(-1));
  assert.equal(payload(panel).jamReview,null);
  assert.equal(b.elements.get('jam-review').hidden,true);
  await f.message(panel,{type:'action',action:'continueGameJam'});
  assert.deepEqual(f.commands,['zero.continueGameJamJoin']);
  page.dispose();
});

test('opaque recent IDs capture vetted entries and never accept webview destination fields', async () => {
  const f = fake();const item = {path:'/Projects/Greeting', lastOpened:123, repositoryUrl:'https://github.com/student/greeting'};
  f.dependencies.listRecent = async () => [item];
  const {page, panel} = await open(f), entry = payload(panel).recent[0];
  assert.match(entry.id, /^[a-f0-9]{36}$/);assert.equal(entry.label, 'Greeting');
  assert.equal(JSON.stringify(payload(panel)).includes('github.com'), false);
  item.path = '/mutated';
  await f.message(panel, {type:'recent', id:entry.id, path:'/private', repositoryUrl:'file:///private'});
  assert.deepEqual(f.opens, [{item:{path:'/Projects/Greeting', lastOpened:123, repositoryUrl:'https://github.com/student/greeting'}, accountId:'42'}]);
  page.dispose();
});

test('open Game Jams are visible before sign-in and only listed IDs can start an authenticated review',async()=>{
  const f=fake({phase:'signed-out'}),opened=[];
  f.dependencies.listOpenJams=async()=>[{id:'jam-42',title:'Toast to the Moon',deadline:'Nov 30'}];
  f.dependencies.openGameJam=async (...args)=>opened.push(args);
  const {page,panel}=await open(f),browser=domHarness(panel.webview.html);
  const button=()=>browser.elements.get('jams-list').children[0].children[0];
  browser.update(panel.messages.at(-1));
  assert.equal(button().children[0].textContent,'Toast to the Moon');
  assert.equal(button().children[1].textContent,'Register by Nov 30');
  assert.equal(button().disabled,true);
  await f.message(panel,{type:'jam',id:'jam-42'});
  assert.deepEqual(opened,[]);
  f.setState({phase:'ready',accountId:'42'});await page.refresh();
  browser.update(panel.messages.at(-1));
  assert.equal(button().disabled,false);
  await f.message(panel,{type:'jam',id:'jam-99'});
  await f.message(panel,{type:'action',action:'selectGameJam',id:'jam-42'});
  assert.deepEqual(opened,[]);
  button().click();await f.message(panel,browser.sent.at(-1));
  assert.deepEqual(opened,[['jam-42','42']]);
  f.setState({phase:'ready',accountId:'99'});
  await f.message(panel,{type:'jam',id:'jam-42'});
  assert.deepEqual(opened,[['jam-42','42']]);
  page.dispose();
});

test('the linked jam survives GitHub setup and passes only its current reviewed details on Continue joining',async()=>{
  const f=fake({phase:'signed-out'}),opened=[];
  const stale=deferred(), first='jam-42', latest='jam-43';
  const linked={id:latest,revision:'b'.repeat(64),title:'Jam 43',fullRules:'Build a game.',eligibility:'Everyone',registrationOpen:true};
  let firstSignal;
  f.dependencies.readLinkedJam=async(id,signal)=>{
    if (id===first) {firstSignal=signal; return stale.promise;}
    assert.equal(id,latest);
    return linked;
  };
  f.dependencies.continueLinkedJam=async (...args)=>opened.push(args);
  const {page,panel}=await open(f),browser=domHarness(panel.webview.html);
  const superseded=page.showLinkedJam(first);
  await page.showLinkedJam(latest);
  assert.equal(firstSignal.aborted,true);
  stale.resolve({...linked,id:first,title:'Old Jam'});
  await superseded;
  browser.update(panel.messages.at(-1));
  assert.equal(browser.elements.get('jam-title').textContent,linked.title);
  assert.equal(browser.elements.get('jam-full-rules-text').textContent,linked.fullRules);
  assert.equal(browser.elements.get('jam-review').hidden,false);
  assert.ok(browser.buttons.find(button=>button.dataset.action==='continueGameJam').disabled);
  await f.message(panel,{type:'action',action:'continueGameJam'});
  assert.deepEqual(opened,[]);
  f.setState({phase:'ready',accountId:'42'});await page.refresh();
  await f.message(panel,{type:'action',action:'continueGameJam',id:first,revision:'untrusted'});
  assert.deepEqual(opened,[[linked,'42']]);
  assert.equal(payload(panel).linkedJam,undefined);
  page.dispose();
});

test('a browser jam waits behind the first-launch screen before showing its public rules',async()=>{
  const f=fake({phase:'signed-out'}),choices=[];
  const linked={id:'jam-42',title:'Toast to the Moon',fullRules:'Build your own game.',registrationOpen:true};
  f.dependencies.needsFirstRunChoice=()=>choices.length===0;
  f.dependencies.saveFirstRunChoice=async value=>{choices.push(value);};
  f.dependencies.readLinkedJam=async id=>{assert.equal(id,linked.id);return linked;};
  const {page,panel}=await open(f),browser=domHarness(panel.webview.html);
  await page.showLinkedJam(linked.id);
  browser.update(panel.messages.at(-1));
  assert.equal(browser.elements.get('normal-start').hidden,true);
  assert.deepEqual(choices,[]);
  await f.message(panel,{type:'action',action:'signIn'});
  assert.deepEqual(f.commands,[]);
  await f.message(panel,{type:'finishSetup',reporting:false});
  browser.update(panel.messages.at(-1));
  assert.deepEqual(choices,[false]);
  assert.equal(browser.elements.get('normal-start').hidden,false);
  assert.equal(browser.elements.get('jam-title').textContent,linked.title);
  assert.equal(browser.elements.get('jam-full-rules-text').textContent,linked.fullRules);
  assert.deepEqual(f.commands,[]);
  page.dispose();
});

test('Cancel joining dismisses the card and moves keyboard focus back to Open Game Jams',async()=>{
  const jamReview={title:'Toast to the Moon',rules:'Build your own game.'};
  const f=fake({phase:'ready',accountId:'42',jamReview}),dismissed=[];
  f.dependencies.dismissGameJamReview=accountId=>{
    dismissed.push(accountId);
    f.setState({phase:'ready',accountId});
  };
  const {page,panel}=await open(f),browser=domHarness(panel.webview.html);
  browser.update(panel.messages.at(-1));
  const cancel=browser.elements.get('dismiss-jam');
  assert.match(panel.webview.html,/id="dismiss-jam" aria-label="Cancel joining"/);
  cancel.focus();cancel.click();
  await f.message(panel,browser.sent.at(-1));
  browser.update(panel.messages.at(-1));
  assert.deepEqual(dismissed,['42']);
  assert.equal(browser.elements.get('jam-review').hidden,true);
  assert.equal(browser.document.activeElement,browser.elements.get('jams-heading'));
  await f.message(panel,{type:'action',action:'continueGameJam'});
  assert.deepEqual(f.commands,[]);
  page.dispose();
});

test('Cancel joining aborts an incoming link lookup without restoring its delayed result',async()=>{
  const f=fake({phase:'signed-out'}),pending=deferred();
  let signal;
  f.dependencies.readLinkedJam=async(_id,requestSignal)=>{signal=requestSignal;return pending.promise;};
  const {page,panel}=await open(f);
  const loading=page.showLinkedJam('jam-42');
  assert.equal(payload(panel).linkedJam.phase,'loading');
  await f.message(panel,{type:'dismissGameJam'});
  assert.equal(signal.aborted,true);
  pending.resolve({id:'jam-42',title:'Toast to the Moon',registrationOpen:true});
  await loading;
  assert.equal(payload(panel).linkedJam,undefined);
  assert.deepEqual(f.commands,[]);
  page.dispose();
});

test('students can refresh an empty Game Jam list or retry a failed lookup in place',async()=>{
  const f=fake(),jam={id:'jam-42',title:'Toast to the Moon',deadline:'Nov 30'};
  let catalog=[];
  f.dependencies.listOpenJams=async()=>{
    if (catalog instanceof Error) throw catalog;
    return catalog;
  };
  const {page,panel}=await open(f);
  assert.deepEqual(payload(panel).jams,[]);
  catalog=Error('Offline');
  await f.message(panel,{type:'refreshJams'});await tick();
  assert.equal(payload(panel).jamState,'error');
  catalog=[jam];
  await f.message(panel,{type:'refreshJams'});await tick();
  assert.equal(payload(panel).jamState,'ready');
  assert.deepEqual(payload(panel).jams,[jam]);
  page.dispose();
});

test('Recent projects marks a known Game Jam without changing order, selection or focus',async()=>{
  const f=fake(),repositoryUrl='https://github.com/student/moon-game';
  let linked=false;
  f.dependencies.listRecent=async()=>[
    {path:'/Projects/Other',lastOpened:2},
    {path:'/Projects/Moon Game',lastOpened:1,repositoryUrl}
  ];
  f.dependencies.isGameJamProject=(account,url)=>linked&&account==='42'&&url===repositoryUrl;
  const {page,panel}=await open(f),browser=domHarness(panel.webview.html),list=browser.elements.get('recent-list');
  browser.update(panel.messages.at(-1));
  const originalId=payload(panel).recent[1].id;
  list.children[1].children[0].focus();
  linked=true;
  await page.refresh();
  browser.update(panel.messages.at(-1));
  const [other,moon]=list.children.map(item=>item.children[0]);
  assert.equal(other.children[0].children.length,1);
  assert.equal(moon.children[0].children[1].textContent,'Game Jam');
  assert.equal(browser.document.activeElement,moon);
  assert.equal(payload(panel).recent[1].id,originalId);
  assert.equal(JSON.stringify(payload(panel)).includes(repositoryUrl),false);
  f.setState({phase:'ready',accountId:'99'});
  await page.refresh();
  assert.equal(payload(panel).recent[1].gameJam,undefined);
  page.dispose();
});

test('account drift and sign-out invalidate rendered recent choices even without refresh', async () => {
  for (const next of [{phase:'ready', accountId:'99'}, {phase:'signed-out'}]) {
    const f = fake();f.dependencies.listRecent = async () => [{path:'/Projects/Private', lastOpened:1}];
    const {page, panel} = await open(f), entry = payload(panel).recent[0];
    f.setState(next);
    await f.message(panel, {type:'recent', id:entry.id});await tick();
    assert.deepEqual(f.opens, []);
    if (next.phase === 'signed-out') {assert.deepEqual(payload(panel).recent, []);assert.equal(payload(panel).recentState, 'hidden');}
    page.dispose();
  }
});

test('recent loading coalesces frequent refreshes and discards old account and closed-panel results', async () => {
  const f = fake(), first = deferred(), second = deferred();
  f.dependencies.listRecent = accountId => {f.listings.push(accountId);return accountId === '42' ? first.promise : second.promise;};
  const page = createStartPage(f.vscode, f.dependencies), panel = page.show();await panel.receive({type:'ready'});await tick();
  for (let index = 0; index < 20; index++) void page.refresh();
  assert.deepEqual(f.listings, ['42']);
  f.setState({phase:'ready', accountId:'99'});void page.refresh();await tick();
  first.resolve([{path:'/old-account', lastOpened:1}]);await tick();assert.deepEqual(payload(panel).recent, []);
  second.resolve([{path:'/new-account', lastOpened:2}]);await tick();assert.equal(payload(panel).recent[0].path, '/new-account');
  await page.refresh();assert.deepEqual(f.listings, ['42','99']);
  const pending = deferred();f.dependencies.listRecent = () => pending.promise;void page.refresh({recent:true});await tick();
  panel.dispose();const count = panel.messages.length;pending.resolve([{path:'/late', lastOpened:3}]);await tick();
  assert.equal(panel.messages.length, count);assert.equal(panel.htmlWrites, 1);page.dispose();
});

test('busy guards serialize actions, recover cancellation and keep useful errors with a retry', async () => {
  const f = fake(), wait = deferred();f.vscode.commands.executeCommand = command => {f.commands.push(command);return wait.promise;};
  const {page, panel} = await open(f);
  const running = f.message(panel, {type:'action', action:'local'});
  assert.equal(payload(panel).busy, true);
  await f.message(panel, {type:'action', action:'local'});assert.equal(f.commands.length, 1);
  wait.resolve(undefined);await running;assert.equal(payload(panel).busy, false);assert.equal(payload(panel).error, '');
  f.vscode.commands.executeCommand = async () => {throw new Error('picker unavailable');};
  await f.message(panel, {type:'action', action:'local'});
  assert.match(payload(panel).error, /Could not open a local project/);assert.equal(payload(panel).canRetry, true);
  assert.equal(f.reports.at(-1)[1], 'picker unavailable');
  f.vscode.commands.executeCommand = async command => f.commands.push(command);
  await f.message(panel, {type:'retry'});assert.equal(f.commands.length, 2);assert.equal(payload(panel).error, '');
  f.setState({phase:'ready', accountId:'42', busy:true});await page.refresh();
  await f.message(panel, {type:'action', action:'local'});assert.equal(f.commands.length, 2);page.dispose();
});

test('a verified starter mismatch offers the current channel’s update recovery without repeating Project New', async () => {
  for (const channel of ['native', 'school', 'manual']) {
    const f = fake(), check = deferred();
    f.dependencies.updateRecovery = channel;
    f.dependencies.executeAction = async command => {
      f.commands.push(command);
      if (command === 'zero.newProject') throw Object.assign(Error('source detail'), {code:'ZERO_STARTER_INCOMPATIBLE'});
      await check.promise;
    };
    const {page,panel} = await open(f), browser = domHarness(panel.webview.html);
    const update = browser.elements.get('check-for-updates');
    const initial = panel.messages.at(-1).token;
    await f.message(panel, {type:'action', action:'new'});
    browser.update(panel.messages.at(-1));
    assert.match(payload(panel).error, /GitHub starter use different project files/);
    assert.equal(payload(panel).canRetry, false);
    assert.equal(update.hidden, channel !== 'native');
    await panel.receive({type:'checkForUpdates', token:initial});
    await f.message(panel, {type:'retry'});
    if (channel === 'native') {
      update.click();
      assert.equal(browser.sent.at(-1).type, 'checkForUpdates');
      const checking = panel.receive({...browser.sent.at(-1), command:'workbench.action.closeWindow'});
      await f.message(panel, {type:'checkForUpdates'});
      check.resolve();
      await checking;
      assert.deepEqual(f.commands, ['zero.newProject', 'zero.checkForUpdates']);
      assert.match(payload(panel).error, /then try Project/);
      assert.match(payload(panel).error, /ask your teacher to check the starter/);
    } else {
      await f.message(panel, {type:'checkForUpdates'});
      assert.deepEqual(f.commands, ['zero.newProject']);
      assert.match(payload(panel).error, channel === 'school' ? /school IT/ : /Zero installation/);
    }
    f.setState({phase:'ready', accountId:'99'});
    await page.refresh();
    assert.equal(payload(panel).error, '');
    page.dispose();
  }
});

test('a starter mismatch from outside the Start Page opens the same inline recovery', async () => {
  const f = fake();
  const page = createStartPage(f.vscode, {...f.dependencies, updateRecovery:'native'});
  assert.equal(page.showStarterMismatch(), true);
  const [panel] = f.panels;
  await panel.receive({type:'ready'});
  assert.equal(payload(panel).canCheckForUpdates, true);
  await f.message(panel, {type:'checkForUpdates'});
  assert.deepEqual(f.commands, ['zero.checkForUpdates']);
  f.setState({phase:'signed-out'});
  await page.refresh();
  assert.equal(page.showStarterMismatch(), false);
  assert.equal(payload(panel).error, '');
  assert.equal(payload(panel).canCheckForUpdates, true);
  await f.message(panel, {type:'checkForUpdates'});
  assert.deepEqual(f.commands, ['zero.checkForUpdates', 'zero.checkForUpdates']);
  page.dispose();
});

test('recent failure remains visible across refreshes with an explicit retry', async () => {
  const f = fake();let count = 0;
  f.dependencies.listRecent = async () => {count++;if (count === 1) throw new Error('disk offline');return [{path:'/retried', lastOpened:1}];};
  const {page, panel} = await open(f);
  assert.equal(payload(panel).recentState, 'error');await page.refresh();assert.equal(count, 1);
  await f.message(panel, {type:'retryRecent'});assert.equal(count, 2);assert.equal(payload(panel).recent[0].path, '/retried');page.dispose();
});

test('restoration reuses the supplied panel without focus changes or duplicate tabs', async () => {
  const f = fake(), page = createStartPage(f.vscode, f.dependencies), serializer = f.serializers.get('zero.startPage');
  const restored = f.vscode.window.createWebviewPanel('zero.startPage', 'Old', {}, {});
  await serializer.deserializeWebviewPanel(restored, {path:'/untrusted'});await tick();await restored.receive({type:'ready'});
  assert.deepEqual(f.openChanges,[true],'Restored panels notify their host');
  assert.equal(page.isOpen(), true);assert.equal(restored.title, 'Zero Start Page');assert.deepEqual(restored.reveals, []);
  const duplicate = f.vscode.window.createWebviewPanel('zero.startPage', 'Duplicate', {}, {});
  await serializer.deserializeWebviewPanel(duplicate);assert.equal(duplicate.disposed, true);
  assert.equal(page.show(), restored);assert.equal(restored.htmlWrites, 1);
  page.dispose();assert.deepEqual(f.openChanges,[true,false]);
  const late = f.vscode.window.createWebviewPanel('zero.startPage', 'Late', {}, {});
  await serializer.deserializeWebviewPanel(late);assert.equal(late.disposed, true);
  const legacy = fake();delete legacy.vscode.window.registerWebviewPanelSerializer;
  const lazy = createStartPage(legacy.vscode);lazy.dispose();
});

test('strict nonce CSP and text-only rendering keep account, status and path markup inert', async () => {
  const attack = '</script><img src=x onerror=alert(1)>', f = fake({phase:'ready', accountId:'42', accountLabel:attack, status:attack});
  f.dependencies.listRecent = async () => [{path:`/Projects/${attack}`, lastOpened:1}];
  const {page, panel} = await open(f), html = panel.webview.html;
  assert.match(html, /default-src 'none'/);assert.match(html, /connect-src 'none'/);assert.match(html, /style-src 'nonce-[A-Za-z0-9+/]+=*'/);
  assert.match(html, /script-src 'nonce-[A-Za-z0-9+/]+=*'/);assert.equal(html.includes(attack), false);
  assert.deepEqual([...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map(([,url]) => url),
    ['https://zero.codepet.ca/terms','https://zero.codepet.ca/privacy']);
  assert.doesNotMatch(html, /innerHTML|onclick=|eval\(/);
  assert.equal(payload(panel).accountLabel, attack);
  const browser = domHarness(html);browser.update(panel.messages.at(-1));
  assert.equal(browser.elements.get('account').textContent, attack);
  assert.equal(browser.elements.get('status').textContent, attack);
  const recentButton = browser.elements.get('recent-list').children[0].children[0];
  assert.equal(recentButton.children[1].textContent, `/Projects/${attack}`);
  const local = browser.buttons.find(button => button.dataset.action === 'local');local.click();
  assert.equal(browser.sent.at(-1).action, 'local');assert.equal(browser.sent.at(-1).token, panel.messages.at(-1).token);
  const oldButton = recentButton;
  f.setState({phase:'ready', accountId:'42', accountLabel:attack, status:'Working', busy:true});await page.refresh();browser.update(panel.messages.at(-1));
  assert.equal(browser.elements.get('recent-list').children[0].children[0], oldButton);
  assert.equal(oldButton.disabled, true);assert.equal(local.disabled, true);
  f.setState({phase:'signed-out'});await page.refresh();browser.update(panel.messages.at(-1));
  assert.equal(local.disabled, true);assert.equal(browser.buttons.find(button=>button.dataset.action==='signIn').disabled, false);
  assert.equal(browser.elements.get('recent-section').hidden, true);page.dispose();
});

test('GitHub account stays compact while signed-out and setup states keep their actions', async () => {
  const f = fake({phase:'ready', accountId:'42', accountLabel:'armorup'});
  const {page,panel} = await open(f), b = domHarness(panel.webview.html);
  const action = name => b.buttons.find(button => button.dataset.action === name);
  b.update(panel.messages.at(-1));
  assert.match(panel.webview.html, /id="github-profile"[^>]*hidden><svg[^>]*aria-hidden="true"[^>]*>/);
  assert.equal(b.elements.get('account').textContent, 'armorup');
  assert.equal(b.elements.get('github-profile').hidden, false);
  assert.equal(b.elements.get('github-section').hidden, true);
  assert.equal(b.elements.get('guidance').hidden, true);
  assert.equal(b.elements.get('github-progress').hidden, true);
  assert.equal(action('tutorials').disabled, false);
  assert.equal(action('signIn').hidden, true);
  assert.equal(action('signInCode'), undefined);
  for (const phase of ['checking','install','unavailable']) {
    f.setState({phase, accountId:'42', accountLabel:'armorup'});
    await page.refresh();b.update(panel.messages.at(-1));
    assert.equal(b.elements.get('github-profile').hidden, false);
    assert.equal(b.elements.get('github-section').hidden, false);
    assert.equal(b.elements.get('guidance').hidden, false);
    assert.ok(b.elements.get('guidance').textContent);
    assert.equal(b.elements.get('github-progress').hidden, phase !== 'checking');
    assert.equal(action('setup').hidden, phase === 'checking');
  }
  f.setState({phase:'verification-unavailable'});
  await page.refresh();b.update(panel.messages.at(-1));
  assert.equal(action('setup').hidden, false);
  assert.equal(action('setup').textContent, 'Check again');
  assert.equal(action('signIn').hidden, true);
  assert.equal(action('connect').hidden, true);
  assert.match(b.elements.get('guidance').textContent, /GitHub could not be reached/);
  f.setState({phase:'signed-out'});await page.refresh();b.update(panel.messages.at(-1));
  assert.equal(b.elements.get('github-profile').hidden, true);
  assert.equal(b.elements.get('account').textContent, '');
  assert.equal(b.elements.get('guidance').hidden, true);
  assert.equal(b.elements.get('github-progress').hidden, true);
  assert.equal(b.elements.get('guidance').textContent, '');
  assert.equal(action('signIn').hidden, false);
  assert.equal(action('signIn').disabled, false);
  assert.equal(action('signInCode'), undefined);
  assert.equal(b.elements.get('github-section').hidden, true);
  assert.match(panel.webview.html, /data-action="signIn" hidden><svg[^>]*lucide-circle-user-round[^>]*aria-hidden="true"[^>]*>.*<\/svg><span>Sign in to Zero<\/span><\/button>/);
  assert.match(panel.webview.html, /data-action="connect" hidden><svg[^>]*lucide-circle-user-round[^>]*aria-hidden="true"[^>]*>.*<\/svg><span>Connect to GitHub<\/span><\/button>/);
  assert.doesNotMatch(panel.webview.html, />Account<|Use your GitHub account|Build Java apps and games/);
  page.dispose();
});

test('a single account action is shown before GitHub connects, then Zero Web becomes available', async () => {
  const f=fake({phase:'signed-out'}), {page,panel}=await open(f), b=domHarness(panel.webview.html);
  b.update(panel.messages.at(-1));
  const tutorials=b.buttons.find(button=>button.dataset.action==='tutorials');
  const signIn=b.buttons.find(button=>button.dataset.action==='signIn');
  const connect=b.buttons.find(button=>button.dataset.action==='connect');
  assert.equal(tutorials.disabled,true);assert.equal(signIn.hidden,false);assert.equal(connect.hidden,true);
  assert.match(panel.webview.html, /data-action="tutorials" aria-label="Zero Web" title="Zero Web" disabled><svg[^>]*lucide-external-link[^>]*aria-hidden="true"[^>]*>.*<\/svg><\/button>/);
  assert.doesNotMatch(panel.webview.html,/Start tutorial|tutorial-menu/);
  signIn.click();await f.message(panel,b.sent.at(-1));
  f.setState({phase:'connect'});await page.refresh();b.update(panel.messages.at(-1));
  assert.equal(tutorials.disabled,true);assert.equal(signIn.hidden,true);assert.equal(connect.hidden,false);
  assert.equal(b.elements.get('project-button').disabled,true);
  assert.equal(b.elements.get('github-profile').hidden,true);
  assert.equal(b.elements.get('github-section').hidden,true);
  connect.click();await f.message(panel,b.sent.at(-1));
  f.setState({phase:'ready',accountId:'42'});await page.refresh();b.update(panel.messages.at(-1));
  assert.equal(signIn.hidden,true);assert.equal(connect.hidden,true);assert.equal(tutorials.disabled,false);
  tutorials.click();await f.message(panel,b.sent.at(-1));
  assert.deepEqual(f.commands,['zero.signInToGitHub','zero.signInToGitHub','zero.openDocs']);
  page.dispose();
});

test('Project dropdown navigates enabled actions and closes on selection, Escape, Tab and outside interaction',async()=>{
  const f=fake(),{page,panel}=await open(f),b=domHarness(panel.webview.html);b.update(panel.messages.at(-1));
  const trigger=b.elements.get('project-button'),menu=b.elements.get('project-menu');
  const action=name=>b.buttons.find(button=>button.dataset.action===name);
  assert.equal(menu.hidden,true);trigger.click();assert.equal(menu.hidden,false);assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(b.document.activeElement,action('new'));b.key('ArrowDown');assert.equal(b.document.activeElement,action('clone'));
  b.key('End');assert.equal(b.document.activeElement,action('joinGameJam'));b.key('ArrowDown');assert.equal(b.document.activeElement,action('new'));
  b.key('Home');b.key('ArrowUp');assert.equal(b.document.activeElement,action('joinGameJam'));
  action('joinGameJam').click();assert.equal(menu.hidden,true);assert.equal(b.document.activeElement,trigger);
  await f.message(panel,b.sent.at(-1));assert.deepEqual(f.commands,['zero.joinGameJam']);
  b.key('ArrowUp',trigger);assert.equal(b.document.activeElement,action('joinGameJam'));
  assert.equal(b.key('Escape'),true);assert.equal(menu.hidden,true);assert.equal(b.document.activeElement,trigger);
  trigger.click();assert.equal(b.key('Tab'),false);assert.equal(menu.hidden,true);assert.equal(b.document.activeElement,trigger);
  for(const close of [()=>b.event('click',action('tutorials')),()=>b.event('focusin',action('tutorials')),()=>b.blur()]){
    trigger.click();close();assert.equal(menu.hidden,true);assert.equal(trigger.getAttribute('aria-expanded'),'false');
  }
  page.dispose();
});
test('auth drift and busy updates close or constrain the Project menu without stranding focus',async()=>{
  const f=fake({phase:'signed-out'}),{page,panel}=await open(f),b=domHarness(panel.webview.html);b.update(panel.messages.at(-1));
  const trigger=b.elements.get('project-button'),menu=b.elements.get('project-menu'),action=name=>b.buttons.find(button=>button.dataset.action===name);
  assert.equal(trigger.disabled,true);assert.equal(action('tutorials').disabled,true);assert.equal(action('new').disabled,true);assert.equal(action('clone').disabled,true);
  trigger.click();assert.equal(menu.hidden,true);
  f.setState({phase:'checking',accountId:'42'});await page.refresh();b.update(panel.messages.at(-1));
  trigger.click();assert.equal(b.document.activeElement,action('local'));b.key('ArrowDown');assert.equal(b.document.activeElement,action('local'));
  assert.equal(action('joinGameJam').disabled,true);
  f.setState({phase:'ready',accountId:'42'});await page.refresh();b.update(panel.messages.at(-1));b.key('Home');assert.equal(b.document.activeElement,action('new'));
  f.setState({phase:'ready',accountId:'42',status:'Updated'});await page.refresh();b.update(panel.messages.at(-1));assert.equal(b.document.activeElement,action('new'));assert.equal(menu.hidden,false);
  f.setState({phase:'checking',accountId:'42'});await page.refresh();b.update(panel.messages.at(-1));assert.equal(b.document.activeElement,action('local'));
  f.setState({phase:'connect'});await page.refresh();b.update(panel.messages.at(-1));assert.equal(menu.hidden,true);assert.equal(trigger.disabled,true);assert.equal(b.document.activeElement,b.elements.get('start-title'));
  page.dispose();
});

function domHarness(html) {
  const elements = new Map(), sent = [], events = new Map(), documentEvents = new Map();
  function element() {return {dataset:{}, children:[], attributes:{}, textContent:'', hidden:false, listeners:{}, append(...items) {this.children.push(...items);}, replaceChildren() {this.children = [];}, addEventListener(name, fn) {this.listeners[name] = fn;}, click() {if (!this.disabled) this.listeners.click?.();}, focus() {document.activeElement = this;}, setAttribute(name,value) {this.attributes[name]=value;}, getAttribute(name) {return this.attributes[name];}, contains(target) {return target===this || this.children.some(child=>child.contains(target));}, querySelectorAll() {return this.children.flatMap(li => li.dataset.action ? [li] : li.children);}};}
  for (const id of html.matchAll(/id="([^"]+)"/g)) elements.set(id[1], element());
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)].flatMap(match => {const action = match[1].match(/data-action="([^"]+)"/);if (!action) return [];const id = match[1].match(/id="([^"]+)"/);const button = id ? elements.get(id[1]) : element();button.dataset.action = action[1];return [button];});
  elements.get('project-menu').hidden=true;
  const projectMenuHtml = html.match(/<div[^>]*id="project-menu"[^>]*>([\s\S]*?)<\/div>/)[1];
  const projectActions = new Set(Array.from(projectMenuHtml.matchAll(/data-action="([^"]+)"/g), match=>match[1]));
  elements.get('project-menu').append(...buttons.filter(button=>projectActions.has(button.dataset.action)));
  elements.get('project-actions').append(elements.get('project-button'),elements.get('project-menu'));
  const listen = (map,name,fn) => map.set(name,[...(map.get(name)||[]),fn]);
  const emit = (map,name,event) => {for(const fn of map.get(name)||[])fn(event);};
  const document = {getElementById:id => elements.get(id), querySelectorAll:() => buttons, createElement:element, activeElement:undefined,addEventListener:(name,fn)=>listen(documentEvents,name,fn)};
  const sandbox = {document, window:{addEventListener:(name, fn) => listen(events,name,fn)}, acquireVsCodeApi:() => ({postMessage:message => sent.push(message)})};
  vm.runInNewContext(html.match(/<script nonce="[^"]+">([\s\S]+)<\/script>/)[1], sandbox);
  return {elements, buttons, sent, document, update:message => emit(events,'message',{data:message}),
    event:(type,target)=>emit(documentEvents,type,{target}), blur:()=>emit(events,'blur'),
    key:(key,target=document.activeElement)=>{let prevented=false;emit(documentEvents,'keydown',{key,target,preventDefault(){prevented=true;}});return prevented;}};
}

test('open Start Page mirrors stage progress, preserves animation through status updates and clears on completion',async()=>{
  const f=fake({phase:'ready',accountId:'42',publishProgress:{stages:['preparing','building','verifying','opening'],index:1},status:'Building…'});
  const {page,panel}=await open(f),browser=domHarness(panel.webview.html);browser.update(panel.messages.at(-1));
  const container=browser.elements.get('publishing-progress'),bar=container.children[0];
  assert.equal(bar.attributes.role,'progressbar');assert.equal(bar.attributes['aria-valuenow'],'1');assert.match(bar.attributes['aria-valuetext'],/Stage 2 of 4: Building app/);
  assert.equal(bar.children.filter(child=>child.className.includes('active')).length,1);
  f.setState({phase:'ready',accountId:'42',publishProgress:{stages:['preparing','building','verifying','opening'],index:1},status:'Still building…'});await page.refresh();browser.update(panel.messages.at(-1));
  assert.equal(container.children[0],bar,'Status chatter must not restart the active segment');
  f.setState({phase:'ready',accountId:'42',status:'App opened'});await page.refresh();browser.update(panel.messages.at(-1));
  assert.equal(container.children.length,0);page.dispose();
});
