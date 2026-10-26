'use strict';
const crypto = require('node:crypto');
const {controlsStyles} = require('./ui-controls');
const {icon} = require('./sidebar-icons');

const COMMANDS = Object.freeze({
  tutorial: 'zero.startProject',
  tutorials: 'zero.openFirstLesson',
  new: 'zero.newProject',
  clone: 'zero.cloneRepository',
  local: 'zero.openLocalProject',
  signIn: 'zero.signInToGitHub',
  setup: 'zero.setupGitHub'
});
const CLOUD = new Set(['tutorial', 'new', 'clone']);

// This view owns navigation only. The existing commands retain setup, account,
// destination and project checks; recent entries come only from the host's list.
function createStartPage(vscode, {getState = () => ({}), listRecent = async () => [], openRecent = async () => {}, report = () => {}, onDidChangeOpen = () => {}} = {}) {
  let panel, disposed = false, ready = false, inFlight = false, revision = 0;
  let token, signature, choiceSignature, recentAccount, recent = [], recentState = 'empty', recentRequest = 0, loading;
  let failure, retry;
  const choices = new Map();
  const current = target => !disposed && panel === target;
  let reportedOpen = false;
  function reportOpen() {
    const open = Boolean(panel) && !disposed;
    if (open === reportedOpen) return;
    reportedOpen = open;onDidChangeOpen(open);
  }

  function state() {
    let value;
    try {value = getState() || {};} catch {value = {phase:'unavailable', status:'GitHub access could not be checked. Try again.'};}
    const phase = typeof value.phase === 'string' ? value.phase : 'signed-out';
    const accountId = phase !== 'signed-out' && /^[1-9]\d*$/.test(String(value.accountId || '')) ? String(value.accountId) : undefined;
    return {
      phase, accountId,
      accountLabel: accountId && typeof value.accountLabel === 'string' ? value.accountLabel : '',
      busy: Boolean(value.busy || inFlight),
      status: typeof value.status === 'string' ? value.status : ''
    };
  }

  function publish(force = false) {
    const target = panel;
    if (!current(target) || !target) return;
    const snapshot = state();
    const items = snapshot.accountId === recentAccount ? recent : [];
    const data = {...snapshot, recentState: snapshot.accountId ? recentState : 'hidden',
      recent: items.map(item => ({label: item.path.split(/[\\/]/).filter(Boolean).at(-1) || item.path, path: item.path})),
      error: failure || '', canRetry: Boolean(retry)};
    const next = JSON.stringify(data);
    if (next !== signature) {
      signature = next;
      token = crypto.randomBytes(18).toString('hex');
      revision++;
    }
    const nextChoices = JSON.stringify([snapshot.accountId, items]);
    if (nextChoices !== choiceSignature) {
      choiceSignature = nextChoices;
      choices.clear();
      for (const item of items) choices.set(crypto.randomBytes(18).toString('hex'), {item, accountId: snapshot.accountId});
    }
    data.recent = data.recent.map((item, index) => ({...item, id: [...choices.keys()][index]}));
    if (ready && (force || next !== lastSent)) {
      lastSent = next;
      try {Promise.resolve(target.webview.postMessage({type:'state', token, revision, state:data})).catch(() => {});} catch {}
    }
  }
  let lastSent;

  function loadRecent(target, accountId) {
    const request = ++recentRequest;
    recentState = 'loading';
    publish();
    const operation = Promise.resolve().then(() => listRecent(accountId)).then(items => {
      if (!current(target) || request !== recentRequest || state().accountId !== accountId) return;
      recent = Array.isArray(items) ? items.filter(item => item && typeof item.path === 'string')
        .slice(0, 20).map(item => ({path:item.path, lastOpened:item.lastOpened, ...(typeof item.repositoryUrl === 'string' ? {repositoryUrl:item.repositoryUrl} : {})})) : [];
      recentState = recent.length ? 'ready' : 'empty';
    }).catch(error => {
      if (!current(target) || request !== recentRequest || state().accountId !== accountId) return;
      recent = [];
      recentState = 'error';
      // Keep the retry inline; a local listing failure must not block navigation.
      try {report('Recent projects could not be loaded. Try again.', error?.message || String(error));} catch {}
    }).finally(() => {
      if (request === recentRequest) loading = undefined;
      if (current(target)) refresh();
    });
    loading = operation;
    return operation;
  }

  function refresh({recent: reload = false} = {}) {
    if (!panel || disposed) return Promise.resolve();
    const snapshot = state();
    if (snapshot.accountId !== recentAccount) {
      recentRequest++;
      loading = undefined;
      recentAccount = snapshot.accountId;
      recent = [];
      recentState = 'empty';
      failure = undefined;
      retry = undefined;
      reload = true;
    }
    if (snapshot.accountId && reload && !loading) return loadRecent(panel, snapshot.accountId);
    publish();
    return loading || Promise.resolve();
  }

  function allowed(action, snapshot) {
    if (snapshot.busy) return false;
    if (CLOUD.has(action)) return snapshot.phase === 'ready' && Boolean(snapshot.accountId);
    if (action === 'local' || action === 'tutorials') return true;
    if (action === 'signIn') return snapshot.phase === 'signed-out';
    if (action === 'setup') return Boolean(snapshot.accountId) && ['install', 'unavailable'].includes(snapshot.phase);
    return false;
  }

  async function dispatch(target, action, choice) {
    const before = state();
    const accountId = choice?.accountId ?? before.accountId;
    if (!current(target) || before.busy || (choice ? !accountId || before.accountId !== accountId : !allowed(action, before))) return;
    failure = undefined;
    retry = undefined;
    inFlight = true;
    publish();
    try {
      // There is no await between the current-account check and invocation.
      if (choice) await openRecent({...choice.item}, accountId);
      else await vscode.commands.executeCommand(COMMANDS[action]);
    } catch (error) {
      if (!current(target) || state().accountId !== accountId) return;
      failure = `Could not ${choice ? 'open this project' : ({tutorial:'start the tutorial', tutorials:'open Tutorials', new:'create a project', clone:'clone a project', local:'open a local project', signIn:'sign in to GitHub', setup:'check GitHub access'})[action]}. Try again.`;
      retry = {action, choice, accountId};
      try {report(failure, error?.message || String(error));} catch {}
    } finally {
      inFlight = false;
      if (current(target)) await refresh({recent:true});
    }
  }

  async function receive(target, message) {
    if (!current(target) || !message || typeof message !== 'object') return;
    if (message.type === 'ready') {ready = true;publish(true);return;}
    if (message.token !== token || typeof token !== 'string') return;
    // Detect drift even when the caller has not refreshed the view yet.
    const snapshot = state();
    if (snapshot.accountId !== recentAccount) {void refresh();return;}
    if (message.type === 'action' && Object.hasOwn(COMMANDS, message.action)) {
      return dispatch(target, message.action);
    }
    if (message.type === 'recent' && typeof message.id === 'string' && choices.has(message.id)) {
      return dispatch(target, undefined, choices.get(message.id));
    }
    if (message.type === 'retry' && retry && retry.accountId === snapshot.accountId) {
      return dispatch(target, retry.action, retry.choice);
    }
    if (message.type === 'retryRecent' && !snapshot.busy && recentState === 'error') return refresh({recent:true});
  }

  const options = {enableScripts:true, enableCommandUris:false, localResourceRoots:[], retainContextWhenHidden:true};
  function attach(target) {
    panel = target;
    ready = false;
    signature = undefined;
    choiceSignature = undefined;
    lastSent = undefined;
    target.title = 'Zero Start Page';
    target.webview.options = options;
    const messages = target.webview.onDidReceiveMessage(message => receive(target, message));
    target.onDidDispose(() => {
      messages?.dispose();
      if (panel !== target) return;
      panel = undefined;
      ready = false;
      recentRequest++;
      loading = undefined;
      choices.clear();
      reportOpen();
    });
    target.webview.html = documentHtml();
    void refresh({recent:true});
    reportOpen();
    return target;
  }

  function show({preserveFocus = false, viewColumn = vscode.ViewColumn?.Active} = {}) {
    if (disposed) return undefined;
    if (panel) {panel.reveal(viewColumn ?? panel.viewColumn, preserveFocus);void refresh({recent:true});return panel;}
    return attach(vscode.window.createWebviewPanel('zero.startPage', 'Zero Start Page', {viewColumn, preserveFocus}, options));
  }

  const serializer = vscode.window.registerWebviewPanelSerializer?.('zero.startPage', {
    async deserializeWebviewPanel(target) {
      if (disposed || (panel && panel !== target)) {target.dispose();return;}
      if (!panel) attach(target);
    }
  });

  return {
    show, refresh,
    isOpen: () => Boolean(panel) && !disposed,
    owns: tab => Boolean(panel) && (tab === panel || tab?.input?.viewType === 'zero.startPage'),
    dispose() {if (disposed) return;disposed = true;recentRequest++;choices.clear();serializer?.dispose();panel?.dispose();panel = undefined;reportOpen();}
  };
}

function documentHtml() {
  const nonce = crypto.randomBytes(24).toString('base64');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'none'; font-src 'none'; connect-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<title>Zero Start Page</title>
<style nonce="${nonce}">
${controlsStyles()}
button{width:auto}
body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);line-height:1.5}
main{max-width:760px;margin:0 auto;padding:48px 28px}h1{font-size:2em;font-weight:600;margin:0 0 28px}h2{font-size:1.15em;font-weight:600;margin:0 0 12px}section{margin-top:36px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}

p{margin:8px 0}.muted,.path{color:var(--vscode-descriptionForeground)}#account,#status,#error{overflow-wrap:anywhere}#github-heading{margin-bottom:0}#account{font-weight:400}#error{color:var(--vscode-errorForeground)}[hidden]{display:none!important}ul{list-style:none;padding:0;margin:0}li{margin:4px 0}.recent{display:block;width:100%;text-align:left;background:transparent;color:var(--vscode-textLink-foreground);padding:8px 4px}.recent:hover{background:var(--vscode-list-hoverBackground)}.name,.path{display:block;overflow-wrap:anywhere}.path{font-size:.9em}.vscode-high-contrast button,.vscode-high-contrast-light button{border-color:var(--vscode-contrastBorder)}
.actions{align-items:center}.project-actions,.tutorial-actions{position:relative;width:180px;max-width:100%}.project-actions>button{width:100%}h1:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}
@media(max-width:480px){main{padding:28px 20px}.actions{flex-direction:column;align-items:stretch}.actions button{width:100%}.project-actions,.tutorial-actions{width:100%}.zero-menu{box-sizing:border-box;width:100%}}
</style></head><body><main>
<h1 id="start-title" tabindex="-1">Start with Zero</h1>
<div class="tutorial-actions" id="tutorial-actions"><div class="zero-split"><button class="primary" id="start-button" data-action="tutorial" disabled>Start tutorial</button><button class="primary zero-menu-button" id="tutorial-button" aria-label="Tutorial options" aria-haspopup="menu" aria-expanded="false" aria-controls="tutorial-menu" disabled>${icon('ChevronDown')}</button></div><div class="zero-menu" id="tutorial-menu" role="menu" aria-labelledby="tutorial-button" hidden><button role="menuitem" tabindex="-1" data-action="tutorials" disabled>Tutorials</button></div></div>
<div class="actions"><div class="project-actions" id="project-actions"><button class="secondary zero-menu-trigger" id="project-button" aria-haspopup="menu" aria-expanded="false" aria-controls="project-menu" disabled>Project ${icon('ChevronDown')}</button><div class="zero-menu" id="project-menu" role="menu" aria-labelledby="project-button" hidden><button role="menuitem" tabindex="-1" data-action="new" disabled>New</button><button role="menuitem" tabindex="-1" data-action="clone" disabled>Clone</button><button role="menuitem" tabindex="-1" data-action="local" disabled>Open</button></div></div></div>
<section id="github-section" aria-label="GitHub"><h2 id="github-heading">GitHub<span id="account-group" hidden> <span class="muted" aria-hidden="true">·</span> <span id="account" class="muted"></span></span></h2><p id="guidance">Checking GitHub access…</p><button class="primary" data-action="setup" hidden>Install Zero for GitHub</button></section>
<section id="recent-section" aria-labelledby="recent-heading" hidden><h2 id="recent-heading">Recent projects</h2><p id="recent-status" class="muted"></p><ul id="recent-list"></ul><button id="retry-recent" hidden>Try again</button></section>
<p id="status" role="status" aria-live="polite"></p><div id="error-region" hidden><p id="error" role="alert"></p><button id="retry" hidden>Try again</button></div>
</main><script nonce="${nonce}">
(() => {
  const vscode = acquireVsCodeApi();
  let token, revision = -1, recentKey;
  const byId = id => document.getElementById(id);
  const buttons = Array.from(document.querySelectorAll('[data-action]'));
  function dropdown(prefix) {
  const trigger = byId(prefix + '-button'), menu = byId(prefix + '-menu');
  const menuItems = () => Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(button => !button.disabled);
  function closeMenu(restoreFocus = false) {
    const hadFocus = menu.contains(document.activeElement);
    menu.hidden = true;trigger.setAttribute('aria-expanded','false');
    if (restoreFocus || hadFocus) (trigger.disabled ? byId('start-title') : trigger).focus({preventScroll:true});
  }
  function openMenu(last = false) {
    if (trigger.disabled) return;
    menu.hidden = false;trigger.setAttribute('aria-expanded','true');
    const items = menuItems();(last ? items.at(-1) : items[0])?.focus({preventScroll:true});
  }
  trigger.addEventListener('click', () => menu.hidden ? openMenu() : closeMenu(true));
  document.addEventListener('click', event => {if (!byId(prefix + '-actions').contains(event.target)) closeMenu();});
  document.addEventListener('focusin', event => {if (!byId(prefix + '-actions').contains(event.target)) closeMenu();});
  window.addEventListener('blur', () => closeMenu());
  document.addEventListener('keydown', event => {
    if (event.target === trigger && ['ArrowDown','ArrowUp'].includes(event.key)) {
      event.preventDefault();openMenu(event.key === 'ArrowUp');return;
    }
    if (menu.hidden || (!menu.contains(event.target) && event.target !== trigger)) return;
    const items = menuItems(), index = items.indexOf(document.activeElement);
    let next;
    switch (event.key) {
      case 'ArrowDown': next = items[(index+1)%items.length];break;
      case 'ArrowUp': next = items[(index-1+items.length)%items.length];break;
      case 'Home': next = items[0];break;
      case 'End': next = items.at(-1);break;
      case 'Escape': event.preventDefault();closeMenu(true);return;
      case 'Tab': closeMenu(true);return;
      default:return;
    }
    event.preventDefault();next?.focus({preventScroll:true});
  });
  return {contains: button => menu.contains(button), close: closeMenu, refresh(busy) {
    trigger.disabled = busy;
    if (busy && !menu.hidden) closeMenu(true);
    else if (menu.contains(document.activeElement) && document.activeElement.disabled) menuItems()[0]?.focus({preventScroll:true});
  }};
  }
  const dropdowns = [dropdown('project'), dropdown('tutorial')];
  const send = message => vscode.postMessage({...message, token});
  for (const button of buttons) button.addEventListener('click', () => {for (const menu of dropdowns) if (menu.contains(button)) menu.close(true);send({type:'action',action:button.dataset.action});});
  byId('retry').addEventListener('click', () => send({type:'retry'}));
  byId('retry-recent').addEventListener('click', () => send({type:'retryRecent'}));
  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || message.type !== 'state' || message.revision < revision) return;
    revision = message.revision;token = message.token;
    const state = message.state;
    const signedIn = Boolean(state.accountId), ready = signedIn && state.phase === 'ready';
    for (const button of buttons) {
      if (button === byId('start-button')) {
        button.dataset.action = state.phase === 'signed-out' ? 'signIn' : 'tutorial';
        button.textContent = state.phase === 'signed-out' ? 'Sign in to GitHub' : 'Start tutorial';
      }
      const action = button.dataset.action;
      button.disabled = state.busy || (['tutorial','new','clone'].includes(action) && !ready);
      if (action === 'setup') {button.hidden = !signedIn || !['install','unavailable'].includes(state.phase);button.textContent = state.phase === 'install' ? 'Install Zero for GitHub' : 'Check again';}
    }
    for (const menu of dropdowns) menu.refresh(state.busy);
    byId('account').textContent = state.accountLabel;
    byId('account-group').hidden = !state.accountLabel;
    byId('github-section').hidden = state.phase === 'signed-out';
    byId('github-heading').hidden = state.phase === 'signed-out';
    byId('guidance').hidden = ready || state.phase === 'signed-out';
    byId('guidance').textContent = state.phase === 'install' ? 'Give Zero access to your selected repositories on GitHub, then return here.' : state.phase === 'checking' ? 'Checking GitHub access…' : 'GitHub access could not be checked. Try again, or open a local project.';
    byId('status').textContent = state.status;
    byId('error-region').hidden = !state.error;
    byId('error').textContent = state.error;
    byId('retry').hidden = !state.canRetry;
    byId('retry').disabled = state.busy;
    byId('recent-section').hidden = !signedIn;
    byId('recent-status').textContent = state.recentState === 'loading' ? 'Loading recent projects…' : state.recentState === 'error' ? 'Recent projects could not be loaded.' : state.recent.length ? '' : 'No recent projects yet.';
    byId('retry-recent').hidden = state.recentState !== 'error';
    byId('retry-recent').disabled = state.busy;
    // Preserve buttons and keyboard focus through frequent busy/status updates.
    const key = JSON.stringify(state.recent);
    if (key !== recentKey) {
      recentKey = key;
      const list = byId('recent-list');
      const focused = document.activeElement?.dataset?.recentPath;
      list.replaceChildren();
      for (const item of state.recent) {
        const li = document.createElement('li'), button = document.createElement('button');
        button.className = 'recent';button.dataset.recentPath = item.path;button.dataset.recentId = item.id;
        const name = document.createElement('span'), path = document.createElement('span');
        name.className = 'name';name.textContent = item.label;path.className = 'path';path.textContent = item.path;
        button.append(name,path);button.addEventListener('click', () => send({type:'recent',id:button.dataset.recentId}));li.append(button);list.append(li);
        if (focused === item.path) button.focus();
      }
    }
    for (const button of byId('recent-list').querySelectorAll('button')) button.disabled = state.busy;
  });
  vscode.postMessage({type:'ready'});
})();
</script></body></html>`;
}

module.exports = {createStartPage};
