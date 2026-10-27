import {publishingSnapshots,publishingStates} from './publishing-source.mjs';
import startPage from '../../extension/src/start-page.js';

export const componentStates = ['ready', 'signed-out', 'install', 'checking', 'unavailable', 'busy', ...publishingStates];
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
  const phase = state === 'busy' || publishing ? 'ready' : state;
  const controller = startPage.createStartPage({
    ViewColumn: {Active: 1},
    window: {createWebviewPanel: () => panel},
    commands: {executeCommand() { throw new Error('Commands are unavailable in the design fixture'); }}
  }, {
    getState: () => ({phase, accountId: phase === 'signed-out' ? undefined : '123456', accountLabel: 'armorup', busy: state === 'busy' || Boolean(publishing?.publishProgress), status: publishing?.status || (state === 'busy' ? 'Fixture: creating a project…' : ''),publishProgress:publishing?.publishProgress}),
    listRecent: async () => [{path: '/Students/armorup/Greeting App'}, {path: '/Students/armorup/Study Quiz'}]
  });
  controller.show();
  await controller.refresh();
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
window.acquireVsCodeApi = () => ({postMessage(message) {
  if (message.type === 'ready') {
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {data:${data}})));
    return;
  }
  const names = {tutorial:'Start tutorial', tutorials:'Tutorials', new:'New project', clone:'Clone project', local:'Open local project', signIn:'Sign in to GitHub', setup:'GitHub access check'};
  document.getElementById('fixture-feedback').textContent = 'Fixture only: ' + (message.type === 'recent' ? 'Open recent project' : names[message.action] || 'Try again') + ' selected. Nothing ran, signed in or changed.';
}});
</script>`;
  // Retain the renderer's nonce restrictions, with local CSS allowed only here.
  html = html.replace("style-src 'nonce-", "style-src 'self' 'nonce-");
  html = html.replace('</head>', `<link rel="stylesheet" href="/tokens-web.css?theme=${theme === 'hc' ? 'dark' : theme}"><link rel="stylesheet" href="/host-fixture.css?theme=${theme}">${bridge}</head>`);
  html = html.replace('<body>', `<body class="vscode-${theme === 'hc' ? 'high-contrast' : theme}">`);
  return html.replace('</main>', `<p id="fixture-feedback" class="muted" role="status" aria-live="polite">Local fixture · ${theme === 'hc' ? 'high contrast' : theme} · ${state} · actions simulated</p></main>`);
}
