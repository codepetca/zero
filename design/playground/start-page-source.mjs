import {publishingSnapshots,publishingStates} from './publishing-source.mjs';
import startPage from '../../extension/src/start-page.js';

export const componentStates = ['ready', 'first-launch', 'signed-out', 'connect', 'install', 'checking', 'unavailable', 'busy', 'jam-review', ...publishingStates];
export const componentThemes = ['light', 'dark', 'hc'];

// Render the real panel with an in-memory host. No extension activation, command,
// repository, authentication or filesystem callbacks are available to the page.
export async function startPageSource(state = 'ready') {
  if (!componentStates.includes(state)) state = 'ready';
  let receive, snapshot;
  const panel = {
    reveal() {}, dispose() {}, onDidDispose() {},
    webview: {
      onDidReceiveMessage(callback) { receive = callback; return {dispose() {}}; },
      postMessage(message) { snapshot = message; return Promise.resolve(true); }
    }
  };
  const publishing=publishingSnapshots[state];
  const phase = state === 'first-launch' ? 'signed-out' : state === 'busy' || state === 'jam-review' || publishing ? 'ready' : state;
  const accountId = ['signed-out','connect'].includes(phase) ? undefined : '123456';
  const jamReview = state==='jam-review' ? {
    id:'jam-42',title:'Toast to the Moon',fullRules:'Build your own game in Zero. Use assets you made or have permission to share. Include instructions for other students to play.',
    registrationDeadline:'Nov 28, 2026, 5:00 PM EST',submissionDeadline:'Dec 2, 2026, 5:00 PM EST'
  } : undefined;
  const controller = startPage.createStartPage({
    ViewColumn: {Active: 1},
    window: {createWebviewPanel: () => panel},
    commands: {executeCommand() { throw new Error('Commands are unavailable in the design fixture'); }}
  }, {
    updateRecovery: 'native',
    getState: () => ({phase, accountId, accountLabel: 'armorup', busy: state === 'busy' || Boolean(publishing?.publishProgress||publishing?.busy), status: publishing?.status || (state === 'busy' ? 'Fixture: creating a project…' : ''),jamReview,publishProgress:publishing?.publishProgress}),
    needsFirstRunChoice: () => state === 'first-launch',
    listOpenJams: async () => [{id:'jam-42',title:'Toast to the Moon',deadline:'Nov 28, 2026, 5:00 PM EST'}],
    listRecent: async () => [
      {path:'/Students/armorup/Greeting App'},
      state==='jam-review' ? {path:'/Students/armorup/Moon Game',repositoryUrl:'https://github.com/armorup/moon-game'} :
        {path:'/Students/armorup/Study Quiz'}
    ],
    isGameJamProject:(account,repository)=>account===accountId&&repository==='https://github.com/armorup/moon-game'
  });
  controller.show();
  await controller.refresh();
  await new Promise(resolve=>setImmediate(resolve));
  await receive({type: 'ready'});
  const html = panel.webview.html;
  controller.dispose();
  if (!snapshot || !html.includes('acquireVsCodeApi()')) throw new Error('Start Page renderer changed; update the fixture adapter.');
  return {html, snapshot};
}

export async function startPageView(theme = 'light', state = 'ready') {
  if (!componentThemes.includes(theme)) theme = 'light';
  if (!componentStates.includes(state)) state = 'ready';
  let {html, snapshot} = await startPageSource(state);
  const nonce = html.match(/<script nonce="([^"]+)"/)[1];
  // JSON is escaped for an HTML script context even though fixture data is fixed.
  const data = JSON.stringify(snapshot).replaceAll('<', '\\u003c');
  const bridge = `<script nonce="${nonce}">
let fixtureState = ${data};
window.acquireVsCodeApi = () => ({postMessage(message) {
  if (message.type === 'ready') {
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {data:fixtureState})));
    return;
  }
  const names = {tutorials:'Zero Web', new:'New project', clone:'Clone project', local:'Open local project', joinGameJam:'Join a Game Jam',continueGameJam:'Continue joining',signIn:'Sign in to Zero', connect:'Connect to GitHub', setup:'GitHub access check'};
  if (message.type === 'dismissGameJam') {
    fixtureState = {...fixtureState, revision:fixtureState.revision+1, state:{...fixtureState.state, jamReview:null}};
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {data:fixtureState})));
  }
  const actions = {finishSetup:'Start building',checkForUpdates:'Check for updates',recent:'Open recent project',jam:'Open Game Jam',refreshJams:'Refresh Game Jams',dismissGameJam:'Close Game Jam details'};
  const label = actions[message.type] || names[message.action] || 'Try again';
  document.getElementById('fixture-feedback').textContent = 'Fixture only: ' + label + ' selected. Nothing ran, signed in or changed.';
}});
</script>`;
  // Retain the renderer's nonce restrictions, with local CSS allowed only here.
  html = html.replace("style-src 'nonce-", "style-src 'self' 'nonce-");
  html = html.replace('</head>', `<link rel="stylesheet" href="/tokens-web.css?theme=${theme === 'hc' ? 'dark' : theme}"><link rel="stylesheet" href="/host-fixture.css?theme=${theme}">${bridge}</head>`);
  html = html.replace('<body>', `<body class="vscode-${theme === 'hc' ? 'high-contrast' : theme}">`);
  return html.replace('</main>', `<p id="fixture-feedback" class="muted" role="status" aria-live="polite">Local fixture · ${theme === 'hc' ? 'high contrast' : theme} · ${state} · actions simulated</p></main>`);
}
