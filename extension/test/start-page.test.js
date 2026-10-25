'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {createStartPage} = require('../src/start-page');

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {let resolve, reject;const promise = new Promise((yes, no) => {resolve = yes;reject = no;});return {promise, resolve, reject};}
function fake(initial = {phase:'ready', accountId:'42', accountLabel:'student'}) {
  let state = initial;
  const panels = [], commands = [], opens = [], reports = [], serializers = new Map(), listings = [];
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
  const dependencies = {getState:() => state, listRecent:async accountId => {listings.push(accountId);return [];}, openRecent:async (item, accountId) => opens.push({item, accountId}), report:(...args) => reports.push(args)};
  return {vscode, dependencies, panels, commands, opens, reports, serializers, listings, setState:value => {state = value;},
    message(panel, value) {return panel.receive({...value, token:panel.messages.at(-1)?.token});}};
}
async function open(f) {
  const page = createStartPage(f.vscode, f.dependencies), panel = page.show();
  await tick();await panel.receive({type:'ready'});
  return {page, panel};
}
const payload = panel => panel.messages.at(-1).state;

test('one reusable native start tab, stable document, explicit focus and lifecycle', async () => {
  const f = fake(), {page, panel} = await open(f);
  assert.equal(panel.kind, 'zero.startPage');assert.equal(panel.title, 'Zero Start Page');
  assert.deepEqual(panel.show, {viewColumn:1, preserveFocus:false});
  assert.equal(panel.options.enableCommandUris, false);assert.deepEqual(panel.options.localResourceRoots, []);
  assert.equal(panel.options.retainContextWhenHidden, true);
  const html = panel.webview.html;
  assert.equal(page.show({preserveFocus:true, viewColumn:3}), panel);
  assert.deepEqual(panel.reveals, [[3, true]]);assert.equal(f.panels.length, 1);
  for (let index = 0; index < 10; index++) await page.refresh();
  assert.equal(panel.webview.html, html);assert.equal(panel.htmlWrites, 1);assert.equal(page.isOpen(), true);
  assert.equal(page.owns({input:{viewType:'zero.startPage'}}), true);
  assert.equal(page.owns({input:{viewType:'zero.tutorials'}}), false);
  panel.dispose();assert.equal(page.isOpen(), false);
  const reopened = page.show({preserveFocus:true});assert.notEqual(reopened, panel);
  page.dispose();assert.equal(reopened.disposed, true);assert.equal(page.show(), undefined);
  assert.equal(f.serializers.size, 0);
});

test('cloud choices require verified ready access; local is available through setup states', async () => {
  for (const phase of ['signed-out','checking','install','unavailable','ready']) {
    const f = fake({phase, accountId:phase === 'signed-out' ? undefined : '42'}), {page, panel} = await open(f);
    for (const action of ['tutorial','tutorials','new','clone','local','signIn','signInCode','setup']) await f.message(panel, {type:'action', action});
    const expected = phase === 'ready' ? ['zero.startProject','zero.openFirstLesson','zero.newProject','zero.cloneRepository','zero.openLocalProject']
      : ['zero.openFirstLesson','zero.openLocalProject', ...(phase === 'signed-out' ? ['zero.signInToGitHub'] : ['install','unavailable'].includes(phase) ? ['zero.setupGitHub'] : [])];
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
  assert.equal(page.isOpen(), true);assert.equal(restored.title, 'Zero Start Page');assert.deepEqual(restored.reveals, []);
  const duplicate = f.vscode.window.createWebviewPanel('zero.startPage', 'Duplicate', {}, {});
  await serializer.deserializeWebviewPanel(duplicate);assert.equal(duplicate.disposed, true);
  assert.equal(page.show(), restored);assert.equal(restored.htmlWrites, 1);
  page.dispose();
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
  assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\/|innerHTML|onclick=|eval\(/);
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
  assert.equal(local.disabled, false);assert.equal(browser.elements.get('start-button').disabled, false);
  assert.equal(browser.elements.get('start-button').textContent, 'Sign in to GitHub');
  assert.equal(browser.elements.get('recent-section').hidden, true);page.dispose();
});

test('GitHub account stays compact while signed-out and setup states keep their actions', async () => {
  const f = fake({phase:'ready', accountId:'42', accountLabel:'armorup'});
  const {page,panel} = await open(f), b = domHarness(panel.webview.html);
  const action = name => b.buttons.find(button => button.dataset.action === name);
  b.update(panel.messages.at(-1));
  assert.match(panel.webview.html, /GitHub<span id="account-group" hidden> <span class="muted" aria-hidden="true">·<\/span> <span id="account"/);
  assert.equal(b.elements.get('account').textContent, 'armorup');
  assert.equal(b.elements.get('account-group').hidden, false);
  assert.equal(b.elements.get('github-heading').hidden, false);
  assert.equal(b.elements.get('guidance').hidden, true);
  assert.equal(b.elements.get('start-button').textContent, 'Start tutorial');
  assert.equal(action('signIn'), undefined);
  assert.equal(action('signInCode'), undefined);
  for (const phase of ['checking','install','unavailable']) {
    f.setState({phase, accountId:'42', accountLabel:'armorup'});
    await page.refresh();b.update(panel.messages.at(-1));
    assert.equal(b.elements.get('guidance').hidden, false);
    assert.ok(b.elements.get('guidance').textContent);
    assert.equal(action('setup').hidden, phase === 'checking');
  }
  f.setState({phase:'signed-out'});await page.refresh();b.update(panel.messages.at(-1));
  assert.equal(b.elements.get('account-group').hidden, true);
  assert.equal(b.elements.get('github-heading').hidden, true);
  assert.equal(b.elements.get('guidance').hidden, true);
  assert.equal(action('signIn').hidden, false);
  assert.equal(action('signIn').disabled, false);
  assert.equal(action('signInCode'), undefined);
  assert.equal(b.elements.get('github-section').hidden, true);
  assert.equal(action('signIn').textContent, 'Sign in to GitHub');
  page.dispose();
});

test('one primary action signs in without starting a project, then enables tutorial only after access is ready', async () => {
  const f = fake({phase:'signed-out'}), wait = deferred();
  f.vscode.commands.executeCommand = command => {f.commands.push(command);return command === 'zero.signInToGitHub' ? wait.promise : Promise.resolve();};
  const {page,panel} = await open(f), b = domHarness(panel.webview.html);
  const primary = b.elements.get('start-button');
  b.update(panel.messages.at(-1));
  assert.equal(primary.textContent, 'Sign in to GitHub');
  assert.equal(primary.disabled, false);
  assert.equal(b.buttons.filter(button => button.dataset.action === 'signIn').length, 1);
  assert.doesNotMatch(panel.webview.html, /signInCode|Sign in using a code/);
  primary.click();assert.equal(b.sent.at(-1).action, 'signIn');
  const signingIn = f.message(panel,b.sent.at(-1));b.update(panel.messages.at(-1));
  assert.equal(primary.disabled,true);primary.click();
  assert.deepEqual(f.commands,['zero.signInToGitHub']);
  f.setState({phase:'install',accountId:'42',accountLabel:'student'});wait.resolve();await signingIn;
  b.update(panel.messages.at(-1));
  assert.equal(primary.textContent,'Start tutorial');assert.equal(primary.disabled,true);
  assert.equal(b.elements.get('github-section').hidden,false);
  await f.message(panel,{type:'action',action:'tutorial'});
  assert.deepEqual(f.commands,['zero.signInToGitHub']);
  f.setState({phase:'ready',accountId:'42',accountLabel:'student'});await page.refresh();b.update(panel.messages.at(-1));
  assert.equal(b.elements.get('start-button'),primary);assert.equal(primary.disabled,false);
  primary.click();assert.equal(b.sent.at(-1).action,'tutorial');await f.message(panel,b.sent.at(-1));
  assert.deepEqual(f.commands,['zero.signInToGitHub','zero.startProject']);
  f.setState({phase:'signed-out'});
  await f.message(panel,{type:'action',action:'tutorial'});b.update(panel.messages.at(-1));
  assert.deepEqual(f.commands,['zero.signInToGitHub','zero.startProject']);
  assert.equal(primary.textContent,'Sign in to GitHub');assert.equal(primary.disabled,false);
  page.dispose();
});

test('Project dropdown navigates enabled actions and closes on selection, Escape, Tab and outside interaction',async()=>{
  const f=fake(),{page,panel}=await open(f),b=domHarness(panel.webview.html);b.update(panel.messages.at(-1));
  const trigger=b.elements.get('project-button'),menu=b.elements.get('project-menu');
  const action=name=>b.buttons.find(button=>button.dataset.action===name);
  assert.equal(menu.hidden,true);trigger.click();assert.equal(menu.hidden,false);assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(b.document.activeElement,action('new'));b.key('ArrowDown');assert.equal(b.document.activeElement,action('clone'));
  b.key('End');assert.equal(b.document.activeElement,action('local'));b.key('ArrowDown');assert.equal(b.document.activeElement,action('new'));
  b.key('Home');b.key('ArrowUp');assert.equal(b.document.activeElement,action('local'));
  action('local').click();assert.equal(b.sent.at(-1).action,'local');assert.equal(menu.hidden,true);assert.equal(b.document.activeElement,trigger);
  b.key('ArrowUp',trigger);assert.equal(b.document.activeElement,action('local'));
  assert.equal(b.key('Escape'),true);assert.equal(menu.hidden,true);assert.equal(b.document.activeElement,trigger);
  trigger.click();assert.equal(b.key('Tab'),false);assert.equal(menu.hidden,true);assert.equal(b.document.activeElement,trigger);
  for(const close of [()=>b.event('click',action('tutorials')),()=>b.event('focusin',action('tutorials')),()=>b.blur()]){
    trigger.click();close();assert.equal(menu.hidden,true);assert.equal(trigger.getAttribute('aria-expanded'),'false');
  }
  page.dispose();
});
test('Tutorial options keeps reading available signed out and shares menu focus behavior', async () => {
  const f=fake({phase:'signed-out'}),{page,panel}=await open(f),b=domHarness(panel.webview.html);
  b.update(panel.messages.at(-1));
  const trigger=b.elements.get('tutorial-button'),menu=b.elements.get('tutorial-menu');
  const tutorials=b.buttons.find(button=>button.dataset.action==='tutorials');
  const start=b.elements.get('start-button');
  assert.equal(start.disabled,false);assert.equal(trigger.disabled,false);
  trigger.click();assert.equal(menu.hidden,false);assert.equal(b.document.activeElement,tutorials);
  b.key('ArrowDown');assert.equal(b.document.activeElement,tutorials);
  b.key('Escape');assert.equal(menu.hidden,true);assert.equal(b.document.activeElement,trigger);
  b.key('ArrowUp',trigger);tutorials.click();
  assert.equal(menu.hidden,true);assert.equal(b.sent.at(-1).action,'tutorials');
  await f.message(panel,{type:'action',action:'tutorials'});
  assert.deepEqual(f.commands,['zero.openFirstLesson']);
  for(const close of [()=>b.key('Tab'),()=>b.event('click',start),()=>b.blur()]) {
    trigger.click();close();assert.equal(menu.hidden,true);
  }
  trigger.click();f.setState({phase:'signed-out',busy:true});await page.refresh();b.update(panel.messages.at(-1));
  assert.equal(menu.hidden,true);assert.equal(trigger.disabled,true);
  assert.equal(b.document.activeElement,b.elements.get('start-title'));
  page.dispose();
});

test('signed-out menu keeps Open and Tutorials available; auth drift and busy updates keep focus out of hidden items',async()=>{
  const f=fake({phase:'signed-out'}),{page,panel}=await open(f),b=domHarness(panel.webview.html);b.update(panel.messages.at(-1));
  const trigger=b.elements.get('project-button'),menu=b.elements.get('project-menu'),action=name=>b.buttons.find(button=>button.dataset.action===name);
  assert.equal(trigger.disabled,false);assert.equal(action('tutorials').disabled,false);assert.equal(action('new').disabled,true);assert.equal(action('clone').disabled,true);
  trigger.click();assert.equal(b.document.activeElement,action('local'));b.key('ArrowDown');assert.equal(b.document.activeElement,action('local'));
  f.setState({phase:'ready',accountId:'42'});await page.refresh();b.update(panel.messages.at(-1));b.key('Home');assert.equal(b.document.activeElement,action('new'));
  f.setState({phase:'ready',accountId:'42',status:'Updated'});await page.refresh();b.update(panel.messages.at(-1));assert.equal(b.document.activeElement,action('new'));assert.equal(menu.hidden,false);
  f.setState({phase:'signed-out'});await page.refresh();b.update(panel.messages.at(-1));assert.equal(b.document.activeElement,action('local'));
  f.setState({phase:'signed-out',busy:true});await page.refresh();b.update(panel.messages.at(-1));assert.equal(menu.hidden,true);assert.equal(trigger.disabled,true);assert.equal(b.document.activeElement,b.elements.get('start-title'));
  page.dispose();
});

function domHarness(html) {
  const elements = new Map(), sent = [], events = new Map(), documentEvents = new Map();
  function element() {return {dataset:{}, children:[], attributes:{}, textContent:'', hidden:false, listeners:{}, append(...items) {this.children.push(...items);}, replaceChildren() {this.children = [];}, addEventListener(name, fn) {this.listeners[name] = fn;}, click() {if (!this.disabled) this.listeners.click?.();}, focus() {document.activeElement = this;}, setAttribute(name,value) {this.attributes[name]=value;}, getAttribute(name) {return this.attributes[name];}, contains(target) {return target===this || this.children.some(child=>child.contains(target));}, querySelectorAll() {return this.children.flatMap(li => li.dataset.action ? [li] : li.children);}};}
  for (const id of html.matchAll(/id="([^"]+)"/g)) elements.set(id[1], element());
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)].flatMap(match => {const action = match[1].match(/data-action="([^"]+)"/);if (!action) return [];const id = match[1].match(/id="([^"]+)"/);const button = id ? elements.get(id[1]) : element();button.dataset.action = action[1];return [button];});
  elements.get('tutorial-menu').hidden=true;
  elements.get('tutorial-menu').append(...buttons.filter(button=>button.dataset.action==='tutorials'));
  elements.get('tutorial-actions').append(elements.get('tutorial-button'),elements.get('tutorial-menu'));
  elements.get('project-menu').hidden=true;
  elements.get('project-menu').append(...buttons.filter(button=>['new','clone','local'].includes(button.dataset.action)));
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
