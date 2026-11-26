'use strict';
const crypto = require('node:crypto');
const {version} = require('../package.json');
const {controlsStyles} = require('./ui-controls');
const {icon} = require('./sidebar-icons');
const {nativeUpdateRecovery} = require('./native-updates');
const {publishProgressDetails,updatePublishProgress} = require('./publish-progress');

const COMMANDS = Object.freeze({
  tutorials: 'zero.openDocs',
  new: 'zero.newProject',
  clone: 'zero.cloneRepository',
  joinGameJam: 'zero.joinGameJam',
  continueGameJam: 'zero.continueGameJamJoin',
  local: 'zero.openLocalProject',
  signIn: 'zero.signInToGitHub',
  connect: 'zero.signInToGitHub',
  setup: 'zero.setupGitHub'
});
const CLOUD = new Set(['new', 'clone', 'joinGameJam']);
const JAM_ACTIONS = new Set(['joinGameJam','continueGameJam','selectGameJam','continueLinkedJam']);

// This view owns navigation only. The existing commands retain setup, account,
// destination and project checks; recent entries come only from the host's list.
function createStartPage(vscode, {getState = () => ({}), listRecent = async () => [], isGameJamProject = () => false,
  listOpenJams = async () => [], openGameJam = async () => {}, readLinkedJam, continueLinkedJam, dismissGameJamReview = () => {},
  openRecent = async () => {}, executeAction = command => vscode.commands.executeCommand(command), report = () => {}, onDidChangeOpen = () => {},
  needsFirstRunChoice = () => false, saveFirstRunChoice,
  updateRecovery = nativeUpdateRecovery()} = {}) {
  let panel, disposed = false, ready = false, inFlight = false, revision = 0;
  let token, signature, choiceSignature, recentAccount, recent = [], recentState = 'empty', recentRequest = 0, loading;
  let failure, retry;
  let jams = [], jamState = 'loading', jamRequest, jamCheckedAt = 0;
  let linkedJam, linkRequest;

  let savingChoice = false, choiceError = '';
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
    const disconnected = phase === 'signed-out' || phase === 'connect';
    const accountId = !disconnected && /^[1-9]\d*$/.test(String(value.accountId || '')) ? String(value.accountId) : undefined;
    const jamReview = accountId && typeof value.jamReview?.title === 'string' ? value.jamReview : null;
    return {
      phase, accountId,
      accountLabel: accountId && typeof value.accountLabel === 'string' ? value.accountLabel : '',
      busy: Boolean(value.busy || inFlight),
      firstLaunch: savingChoice || needsFirstRunChoice(),
      savingChoice,
      choiceError,
      status: typeof value.status === 'string' ? value.status : '',
      jamReview,
      publishProgress:value.publishProgress
    };
  }

  function publish(force = false) {
    const target = panel;
    if (!current(target) || !target) return;
    const snapshot = state();
    const items = snapshot.accountId === recentAccount ? recent : [];
    const data = {...snapshot, recentState: snapshot.accountId ? recentState : 'hidden',
      jams, jamState, linkedJam,
      recent: items.map(item => ({
        label: item.path.split(/[\\/]/).filter(Boolean).at(-1) || item.path, path: item.path,
        ...(item.repositoryUrl && isGameJamProject(snapshot.accountId,item.repositoryUrl) ? {gameJam:true} : {})
      })),
      error: failure || '', canRetry: Boolean(retry && !retry.checkForUpdates),
      canCheckForUpdates: updateRecovery === 'native'};
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

  async function showLinkedJam(id) {
    const target = show();
    if (!target || !readLinkedJam) return;
    linkRequest?.abort();
    const request = new AbortController();
    linkRequest = request;
    linkedJam = {id,phase:'loading'};
    failure = undefined;
    retry = undefined;
    publish();
    try {
      const details = await readLinkedJam(id, request.signal);
      if (!request.signal.aborted) linkedJam = {id,phase:'ready',details};
    } catch (error) {
      if (!request.signal.aborted) linkedJam = {id,phase:'error',error:error.message};
    } finally {
      if (linkRequest === request) {linkRequest = undefined;publish();}
    }
  }

  function clearLinkedJam() {
    linkRequest?.abort();
    linkRequest = undefined;
    linkedJam = undefined;
  }

  function loadJams(target) {
    if (jamRequest) return;
    const account = state().accountId;
    const request = new AbortController();
    jamRequest = request;
    jamState = 'loading';
    publish();
    void Promise.resolve().then(() => listOpenJams(request.signal,account)).then(items => {
      if (!current(target) || request.signal.aborted) return;
      jams = items;
      jamState = 'ready';
    }).catch(() => {
      if (!current(target) || request.signal.aborted) return;
      jams = [];
      jamState = 'error';
    }).finally(() => {
      if (jamRequest !== request) return;
      jamRequest = undefined;
      jamCheckedAt = Date.now();
      publish();
    });
  }

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

  function refresh({recent: reload = false, jams: reloadJams = false} = {}) {
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
      reloadJams = true;
    }
    if (reloadJams) {
      jamRequest?.abort();
      jamRequest = undefined;
      jams = [];
      loadJams(panel);
    }
    if (snapshot.accountId && reload && !loading) return loadRecent(panel, snapshot.accountId);
    publish();
    return loading || Promise.resolve();
  }

  function allowed(action, snapshot) {
    if (snapshot.busy) return false;
    if (action === 'continueGameJam') return snapshot.phase==='ready' && Boolean(snapshot.jamReview);
    if (action === 'continueLinkedJam') return snapshot.phase==='ready' && Boolean(snapshot.accountId &&
      (linkedJam?.details?.registrationOpen || linkedJam?.details?.projectsOpen));
    if (CLOUD.has(action) || action === 'selectGameJam') return snapshot.phase === 'ready' && Boolean(snapshot.accountId);
    if (action === 'local' || action === 'tutorials') return Boolean(snapshot.accountId);
    if (action === 'signIn') return snapshot.phase === 'signed-out';
    if (action === 'connect') return snapshot.phase === 'connect';
    if (action === 'setup') return snapshot.phase === 'verification-unavailable' || Boolean(snapshot.accountId) && ['install', 'unavailable'].includes(snapshot.phase);
    return false;
  }

  function describeStarterMismatch(accountId) {
    const nextStep = {
      native: 'Check for updates, then try Project → New again. If Zero is up to date, ask your teacher to check the starter.',
      school: 'Ask your teacher or school IT to check for an update.',
      manual: 'Ask your teacher to check your Zero installation and the GitHub starter.'
    }[updateRecovery];
    failure = 'Zero and the GitHub starter use different project files. ' + nextStep;
    retry = {accountId, checkForUpdates:true};
  }

  async function dispatch(target, action, choice, jamId) {
    const before = state();
    const accountId = choice?.accountId ?? before.accountId;
    if (!current(target) || before.busy || (choice ? !accountId || before.accountId !== accountId : !allowed(action, before))) return;
    const link = linkedJam;
    if (action === 'joinGameJam' || action === 'selectGameJam') clearLinkedJam();
    failure = undefined;
    retry = undefined;
    inFlight = true;

    publish();
    try {
      // There is no await between the current-account check and invocation.
      if (choice) await openRecent({...choice.item}, accountId);
      else if (action === 'selectGameJam') await openGameJam(jamId, accountId);
      else if (action === 'continueLinkedJam') {
        await continueLinkedJam(link.details, accountId);
        const after = state();
        if (linkedJam === link && after.accountId === accountId && after.jamReview !== link.details) clearLinkedJam();
      }
      else await executeAction(action === 'setup' && before.phase === 'verification-unavailable'
        ? 'zero.recheckGitHubConnection' : COMMANDS[action]);
    } catch (error) {
      if (!current(target) || state().accountId !== accountId) return;
      if (action === 'continueLinkedJam' && linkedJam !== link) return;
      if (['new','continueGameJam','continueLinkedJam'].includes(action) && error?.code === 'ZERO_STARTER_INCOMPATIBLE') {
        describeStarterMismatch(accountId);
      } else {
      const joining=JAM_ACTIONS.has(action);
        const task = choice ? 'open this project' : ({tutorials:'open Zero Web', new:'create a project', clone:'clone a project',
          local:'open a local project', signIn:'sign in to Zero', connect:'connect to GitHub', setup:'check GitHub access'})[action];
        failure = joining && error?.message ? error.message : `Could not ${joining ? 'join the Game Jam' : task}. Try again.`;
        retry = {action:action==='continueGameJam'&&!state().jamReview?'joinGameJam':action, choice, jamId, accountId};
      }
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
    if (snapshot.firstLaunch || message.type === 'finishSetup') {
      if (snapshot.firstLaunch && message.type === 'finishSetup' && !savingChoice && typeof message.reporting === 'boolean') {
        savingChoice = true;
        choiceError = '';
        publish();
        try {
          await saveFirstRunChoice(message.reporting, () => current(target));
        } catch (error) {
          if (current(target)) choiceError = 'Zero couldn’t save your reporting choice. Try again.';
          report('Could not save reporting choice.', error?.message);
        } finally {
          savingChoice = false;
          if (panel) publish();
        }
      } else publish();
      return;
    }
    if (snapshot.accountId !== recentAccount) {void refresh();return;}
    if (message.type === 'action' && Object.hasOwn(COMMANDS, message.action)) {
      return dispatch(target, message.action === 'continueGameJam' && linkedJam ? 'continueLinkedJam' : message.action);
    }
    if (message.type === 'recent' && typeof message.id === 'string' && choices.has(message.id)) {
      return dispatch(target, undefined, choices.get(message.id));
    }
    if (message.type === 'jam' && jams.some(jam => jam.id === message.id)) {
      return dispatch(target, 'selectGameJam', undefined, message.id);
    }
    if (message.type === 'dismissGameJam' && !snapshot.busy && (linkedJam || snapshot.jamReview)) {
      clearLinkedJam();
      dismissGameJamReview(snapshot.accountId);
      if (JAM_ACTIONS.has(retry?.action)) {failure = undefined;retry = undefined;}
      publish();
      return;
    }
    if (message.type === 'retryLinkedJam' && !snapshot.busy && linkedJam?.phase === 'error') return showLinkedJam(linkedJam.id);
    if (message.type === 'checkForUpdates' && !snapshot.busy && updateRecovery === 'native') {
      inFlight = true;
      publish();
      try {await executeAction('zero.checkForUpdates');}
      catch (error) {report('Could not check for updates.', error?.message || String(error));}
      finally {inFlight = false;if (current(target)) publish();}
    }
    if (message.type === 'retry' && retry && !retry.checkForUpdates && retry.accountId === snapshot.accountId) {
      return dispatch(target, retry.action, retry.choice, retry.jamId);
    }
    if (message.type === 'retryRecent' && !snapshot.busy && recentState === 'error') return refresh({recent:true});
    if (message.type === 'refreshJams' && !snapshot.busy) loadJams(target);
  }

  const options = {enableScripts:true, enableCommandUris:false, localResourceRoots:[], retainContextWhenHidden:true};
  function attach(target) {
    panel = target;
    ready = false;
    signature = undefined;
    choiceSignature = undefined;
    lastSent = undefined;
    choiceError = '';
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
      jamRequest?.abort();
      jamRequest = undefined;
      jams = [];
      clearLinkedJam();
      choices.clear();
      reportOpen();
    });
    target.webview.html = documentHtml();
    void refresh({recent:true});
    loadJams(target);
    reportOpen();
    return target;
  }

  function show({preserveFocus = false, viewColumn = vscode.ViewColumn?.Active} = {}) {
    if (disposed) return undefined;
    if (panel) {
      panel.reveal(viewColumn ?? panel.viewColumn, preserveFocus);
      void refresh({recent:true});
      if (Date.now()-jamCheckedAt>=60_000) loadJams(panel);
      return panel;
    }
    return attach(vscode.window.createWebviewPanel('zero.startPage', 'Zero Start Page', {viewColumn, preserveFocus}, options));
  }

  function showStarterMismatch() {
    const {accountId} = state();
    if (!accountId || typeof vscode.window.createWebviewPanel !== 'function' || !show()) return false;
    describeStarterMismatch(accountId);
    publish();
    return true;
  }

  const serializer = vscode.window.registerWebviewPanelSerializer?.('zero.startPage', {
    async deserializeWebviewPanel(target) {
      if (disposed || (panel && panel !== target)) {target.dispose();return;}
      if (!panel) attach(target);
    }
  });

  return {
    show, refresh, showStarterMismatch, showLinkedJam,
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
main{max-width:760px;margin:0 auto;padding:48px 28px}h2{font-size:1.15em;font-weight:600;margin:0 0 12px}section{margin-top:36px}

p{margin:8px 0}.muted,.path{color:var(--vscode-descriptionForeground)}#account,#status,#error{overflow-wrap:anywhere}#error{color:var(--vscode-errorForeground)}[hidden]{display:none!important}ul{list-style:none;padding:0;margin:0}li{margin:4px 0}.recent{display:block;width:100%;text-align:left;background:transparent;color:var(--vscode-textLink-foreground);padding:8px 4px}.recent:hover{background:var(--vscode-list-hoverBackground)}.name,.path{display:block;overflow-wrap:anywhere}.path{font-size:.9em}.vscode-high-contrast button,.vscode-high-contrast-light button{border-color:var(--vscode-contrastBorder)}
.start-intro{margin-bottom:24px}.start-title-row{display:flex;align-items:center;gap:8px}
.start-intro h1{display:flex;align-items:center;gap:8px;font-size:2em;font-weight:600;margin:0}.start-intro .zero-mark{width:1em;height:1em;flex:none}
.start-version{font-size:.9em;margin:0 0 4px}
#first-launch{margin-top:0}
#first-launch a{color:var(--vscode-textLink-foreground)}
#first-launch a:hover{color:var(--vscode-textLink-activeForeground)}
#first-launch a:focus-visible,#first-launch input:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:3px}
.reporting-choice{display:grid;grid-template-columns:auto 1fr;align-items:start;column-gap:8px;margin:24px 0}
.reporting-choice input{margin:4px 0 0;accent-color:var(--vscode-button-background)}
.reporting-choice label{font-weight:600}
#reporting-details{grid-column:2;margin:4px 0 0}
#first-launch-error{color:var(--vscode-errorForeground)}
button.start-web,button.jam-close{width:32px;height:32px;padding:0;background:transparent;color:var(--vscode-textLink-foreground,var(--vscode-foreground))}
button.start-web svg{width:22px;height:22px}
button.start-web:hover:not(:disabled),button.jam-close:hover:not(:disabled){background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))}
.start-actions{display:flex;flex-direction:column;gap:12px;width:180px;max-width:100%}.project-actions{position:relative}.start-actions>button,.project-actions>button{width:100%}h1:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}
.recent-title{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px}
.recent-jam{color:var(--vscode-badge-foreground);background:var(--vscode-badge-background);outline:1px solid var(--vscode-contrastBorder,transparent);padding:0 5px;border-radius:3px;font-size:.85em;font-weight:600;white-space:nowrap}
#jam-review{
  overflow-wrap:anywhere;
  padding:14px 16px 12px;
  border:1px solid var(--vscode-contrastBorder,transparent);
  border-radius:6px;
  background:var(--vscode-editorWidget-background,color-mix(in srgb,var(--vscode-editor-background) 95%,var(--vscode-foreground)));
}
.jam-review-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
button.jam-close{flex:none;color:var(--vscode-foreground);font-size:1.5em;line-height:1}
#jams-heading:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}
#jam-full-rules p{white-space:pre-wrap}
.github-profile{display:flex;align-items:center;gap:7px;margin-top:4px;font-weight:600;line-height:1.4}.github-profile svg{flex:none}
#github-progress{width:180px;max-width:100%;height:4px;overflow:hidden;background:var(--vscode-editorWidget-background);outline:1px solid var(--vscode-contrastBorder,transparent)}
#github-progress::before{content:"";display:block;width:35%;height:100%;background:var(--vscode-progressBar-background,var(--vscode-focusBorder));animation:github-check 1.4s ease-in-out infinite alternate}
@keyframes github-check{from{transform:translateX(0)}to{transform:translateX(185%)}}
@media(prefers-reduced-motion:reduce){#github-progress::before{animation:none}}
@media(max-width:480px){main{padding:28px 20px}.start-actions{width:100%}}
</style></head><body><main>
<header class="start-intro">
  <div class="start-title-row">
    <h1 id="start-title" tabindex="-1">${icon('Zero')}<span>Zero</span></h1>
    <button class="start-web" data-action="tutorials" aria-label="Zero Web" title="Zero Web" disabled>${icon('ExternalLink')}</button>
  </div>
  <p class="muted start-version">${version}</p>
  <div id="github-profile" class="github-profile" role="group" aria-label="Signed-in GitHub profile" hidden>${icon('CircleUserRound')}<span id="account"></span></div>
</header>
<section id="first-launch" aria-label="First-time setup" hidden>
  <p>By selecting Start building, you agree to the <a href="https://zero.codepet.ca/terms" target="_blank" rel="noopener noreferrer">Zero Terms</a> and save your reporting choice below.<br>
  Read the <a href="https://zero.codepet.ca/privacy" target="_blank" rel="noopener noreferrer">Privacy Notice</a> to see how Zero handles data.</p>
  <div class="reporting-choice">
    <input id="automatic-reports" type="checkbox" checked aria-describedby="reporting-details">
    <label for="automatic-reports">Send error reports automatically</label>
    <p id="reporting-details" class="muted">Zero posts technical details to public GitHub issues. Reports exclude your code, logs and file paths.<br>
      Automatic reports are optional and follow your editor’s telemetry setting. With this box checked, choosing Report a problem from the Zero sidebar menu also sends directly.</p>
  </div>
  <button id="start-building" disabled>Start building</button>
  <p id="first-launch-error" role="alert" hidden></p>
</section>
<div id="normal-start" hidden>
<div class="start-actions">
<button class="primary" data-action="signIn" hidden>${icon('CircleUserRound')}<span>Sign in to Zero</span></button>
<button class="primary" data-action="connect" hidden>${icon('CircleUserRound')}<span>Connect to GitHub</span></button>
<div class="project-actions" id="project-actions">
  <button class="secondary zero-menu-trigger" id="project-button" aria-haspopup="menu" aria-expanded="false" aria-controls="project-menu" disabled>Project ${icon('ChevronDown')}</button>
  <div class="zero-menu" id="project-menu" role="menu" aria-labelledby="project-button" hidden>
    <button role="menuitem" tabindex="-1" data-action="new" disabled>New</button>
    <button role="menuitem" tabindex="-1" data-action="clone" disabled>Clone</button>
    <button role="menuitem" tabindex="-1" data-action="local" disabled>Open</button>
    <button role="menuitem" tabindex="-1" data-action="joinGameJam" disabled>Join a Game Jam</button>
  </div>
</div>
</div>
<section id="jam-review" aria-labelledby="jam-title" hidden>
  <div class="jam-review-heading">
    <h2 id="jam-title"></h2>
    <button type="button" class="jam-close" id="dismiss-jam" aria-label="Cancel joining" title="Cancel joining"><span aria-hidden="true">×</span></button>
  </div>
  <p id="jam-link-status" class="muted" role="status" hidden></p>
  <p id="jam-deadlines" class="muted" hidden></p>
  <p id="jam-rules" hidden><strong>Rules preview</strong><br><span id="jam-rules-text"></span></p>
  <details id="jam-full-rules" hidden><summary>Full rules and eligibility</summary><p id="jam-full-rules-text"></p><p id="jam-eligibility"></p></details>
  <p id="jam-privacy" class="muted"></p>
  <button class="primary" data-action="continueGameJam" disabled>Continue joining</button>
  <button class="secondary" id="retry-linked-jam" hidden>Try again</button>
</section>
<section id="github-section" aria-label="GitHub access" hidden><p id="guidance" role="status" hidden></p><div id="github-progress" aria-hidden="true" hidden></div><button class="primary" data-action="setup" hidden>Install Zero for GitHub</button></section>
<section aria-labelledby="jams-heading">
  <h2 id="jams-heading" tabindex="-1">Open Game Jams</h2>
  <p id="jams-status" class="muted" role="status"></p>
  <ul id="jams-list"></ul>
  <button id="refresh-jams" class="secondary" disabled>Refresh Game Jams</button>
</section>
<section id="recent-section" aria-labelledby="recent-heading" hidden><h2 id="recent-heading">Recent projects</h2><p id="recent-status" class="muted"></p><ul id="recent-list"></ul><button id="retry-recent" hidden>Try again</button></section>
<p id="status" role="status" aria-live="polite"></p><div id="publishing-progress"></div><div id="error-region" hidden><p id="error" role="alert"></p><button id="retry" hidden>Try again</button></div>
<button id="check-for-updates" class="secondary" hidden>Check for updates</button>
</div>
</main><script nonce="${nonce}">
(() => {
  const publishProgressDetails = ${publishProgressDetails.toString()};
  const updatePublishProgress = ${updatePublishProgress.toString()};
  const vscode = acquireVsCodeApi();
  let token, revision = -1, recentKey, jamsKey, linkedJamId;
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
  return {contains: button => menu.contains(button), close: closeMenu, refresh(disabled) {
    trigger.disabled = disabled;
    if (disabled && !menu.hidden) closeMenu(true);
    else if (menu.contains(document.activeElement) && document.activeElement.disabled) menuItems()[0]?.focus({preventScroll:true});
  }};
  }
  const dropdowns = [dropdown('project')];
  const send = message => vscode.postMessage({...message, token});
  for (const button of buttons) button.addEventListener('click', () => {for (const menu of dropdowns) if (menu.contains(button)) menu.close(true);send({type:'action',action:button.dataset.action});});
  byId('retry').addEventListener('click', () => send({type:'retry'}));
  byId('check-for-updates').addEventListener('click', () => send({type:'checkForUpdates'}));
  byId('retry-recent').addEventListener('click', () => send({type:'retryRecent'}));
  byId('refresh-jams').addEventListener('click', () => send({type:'refreshJams'}));
  byId('retry-linked-jam').addEventListener('click', () => send({type:'retryLinkedJam'}));
  const dismissJam = byId('dismiss-jam');
  dismissJam.addEventListener('click', () => send({type:'dismissGameJam'}));
  byId('start-building').addEventListener('click', () => send({type:'finishSetup', reporting:byId('automatic-reports').checked}));
  window.addEventListener('message', event => {
    const message = event.data;
    if (!message || message.type !== 'state' || message.revision < revision) return;
    revision = message.revision;token = message.token;
    const state = message.state;
    const setup = byId('first-launch');
    const wasInSetup = !setup.hidden;
    setup.hidden = !state.firstLaunch;
    byId('normal-start').hidden = Boolean(state.firstLaunch);
    byId('automatic-reports').disabled = state.savingChoice;
    byId('start-building').disabled = !state.firstLaunch || state.savingChoice;
    byId('first-launch-error').textContent = state.choiceError;
    byId('first-launch-error').hidden = !state.choiceError;
    const signedIn = Boolean(state.accountId), ready = signedIn && state.phase === 'ready';
    for (const button of buttons) {
      const action = button.dataset.action;
      button.disabled = state.busy || (['new','clone','joinGameJam'].includes(action) && !ready) || (['local','tutorials'].includes(action) && !signedIn);
      if (action === 'tutorials') button.hidden = state.firstLaunch;
      if (action === 'continueGameJam') {
        const link = state.linkedJam;
        const canContinue = link?.details?.registrationOpen || link?.details?.projectsOpen;
        button.hidden = Boolean(link && !canContinue);
        button.disabled = state.busy || !ready || !(link ? canContinue : state.jamReview);
        button.textContent = link?.details?.projectsOpen && !link.details.registrationOpen ? 'Continue to jam' : 'Continue joining';
      }
      if (action === 'signIn') button.hidden = state.phase !== 'signed-out';
      if (action === 'connect') button.hidden = state.phase !== 'connect';
      if (action === 'setup') {
        button.hidden = state.phase !== 'verification-unavailable' && (!signedIn || !['install','unavailable'].includes(state.phase));
        button.textContent = state.phase === 'install' ? 'Install Zero for GitHub' : 'Check again';
      }
    }
    for (const menu of dropdowns) menu.refresh(state.busy || !signedIn);
    byId('account').textContent = state.accountLabel;
    byId('github-profile').hidden = state.firstLaunch || !state.accountLabel;
    if (wasInSetup && !state.firstLaunch) byId('start-title').focus({preventScroll:true});
    const guidance = ready || ['signed-out','connect'].includes(state.phase) ? '' : state.phase === 'install' ? 'Give Zero access to your selected repositories on GitHub, then return here.' : state.phase === 'checking' ? 'Checking GitHub access…' : state.phase === 'verification-unavailable' ? 'GitHub could not be reached. Check again when your connection is available.' : 'GitHub access could not be checked. Try again, or open a local project.';
    byId('github-section').hidden = !guidance;
    byId('guidance').hidden = !guidance;
    if (byId('guidance').textContent !== guidance) byId('guidance').textContent = guidance;
    byId('github-progress').hidden = state.phase !== 'checking';
    const link = state.linkedJam;
    const jam = link ? link.details : state.jamReview;
    const deadlines = [jam?.registrationDeadline && 'Register by ' + jam.registrationDeadline,
      jam?.submissionDeadline && 'Submit by ' + jam.submissionDeadline].filter(Boolean).join(' · ');
    byId('jam-title').textContent = jam?.title || (link ? 'Game Jam' : '');
    byId('jam-deadlines').textContent = deadlines;
    byId('jam-deadlines').hidden = !deadlines;
    byId('jam-rules-text').textContent = jam?.rules || '';
    byId('jam-rules').hidden = !jam?.rules || Boolean(link);
    const fullRules = byId('jam-full-rules');
    if (link?.id !== linkedJamId) {fullRules.open = false;linkedJamId = link?.id;}
    fullRules.hidden = !link?.details;
    byId('jam-full-rules-text').textContent = link?.details?.fullRules || '';
    byId('jam-eligibility').textContent = link?.details?.eligibility || '';
    byId('jam-eligibility').hidden = !link?.details?.eligibility;
    const linkStatus = !link ? '' : link.phase === 'loading' ? 'Opening Game Jam…' : link.phase === 'error' ? link.error :
      !jam.registrationOpen ? (jam.projectsOpen ? (state.phase === 'signed-out' ? 'Sign in to manage your projects if you’ve joined this jam.' : 'Already joined? Continue to manage your projects.') : 'Registration is closed.') : state.phase === 'signed-out' ? 'Sign in to Zero to join this Game Jam.' :
        !ready ? 'Finish GitHub setup to join this Game Jam.' : '';
    byId('jam-link-status').hidden = !linkStatus;
    if (byId('jam-link-status').textContent !== linkStatus) byId('jam-link-status').textContent = linkStatus;
    byId('jam-privacy').hidden = !jam || Boolean(link && !jam.registrationOpen);
    byId('jam-privacy').textContent = (link ? '' : 'Read the full rules in the browser. ') + 'Your GitHub username and entry links will be public.';
    byId('retry-linked-jam').hidden = link?.phase !== 'error';
    byId('retry-linked-jam').disabled = state.busy;
    const jamCard = byId('jam-review');
    const wasDismissing = document.activeElement === dismissJam;
    jamCard.hidden = !link && (!ready || !jam);
    dismissJam.disabled = state.busy;
    if (jamCard.hidden && wasDismissing) byId('jams-heading').focus();
    const jamsStatus = state.jamState === 'error' ? 'Game Jams could not be loaded.' :
      state.jamState === 'loading' ? 'Checking for open Game Jams…' : !state.jams.length ? 'No Game Jams are open for registration.' :
        state.phase === 'signed-out' ? 'Sign in to Zero to join a Game Jam.' :
          !ready ? 'Finish GitHub setup to join a Game Jam.' : '';
    if (byId('jams-status').textContent !== jamsStatus) byId('jams-status').textContent = jamsStatus;
    byId('refresh-jams').disabled = state.busy || state.jamState === 'loading';
    const nextJamsKey = JSON.stringify(state.jams);
    const jamList = byId('jams-list');
    if (nextJamsKey !== jamsKey) {
      jamsKey = nextJamsKey;
      const focused = document.activeElement?.dataset?.jamId;
      jamList.replaceChildren();
      for (const item of state.jams) {
        const li = document.createElement('li'), button = document.createElement('button');
        const title = document.createElement('span'), deadline = document.createElement('span');
        button.className = 'recent';button.dataset.jamId = item.id;
        title.className = 'name';title.textContent = item.title;
        deadline.className = 'path';deadline.textContent = item.joined ? 'Manage projects' : item.deadline ? 'Register by ' + item.deadline : '';
        button.append(title,deadline);li.append(button);jamList.append(li);
        button.addEventListener('click', () => send({type:'jam',id:item.id}));
        if (focused === item.id) button.focus();
      }
    }
    for (const button of jamList.querySelectorAll('button')) button.disabled = state.busy || !ready;
    byId('status').textContent = state.status;
    updatePublishProgress(byId('publishing-progress'),state.publishProgress);
    byId('error-region').hidden = !state.error;
    byId('error').textContent = state.error;
    byId('retry').hidden = !state.canRetry;
    byId('retry').disabled = state.busy;
    byId('check-for-updates').hidden = !state.canCheckForUpdates;
    byId('check-for-updates').disabled = state.busy;
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
        const title = document.createElement('span'), name = document.createElement('span'), path = document.createElement('span');
        title.className = 'recent-title';title.append(name);
        name.className = 'name';name.textContent = item.label;path.className = 'path';path.textContent = item.path;
        if (item.gameJam) {
          const badge = document.createElement('span');
          badge.className = 'recent-jam';badge.textContent = 'Game Jam';title.append(badge);
        }
        button.append(title,path);button.addEventListener('click', () => send({type:'recent',id:button.dataset.recentId}));li.append(button);list.append(li);
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
