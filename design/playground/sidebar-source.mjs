import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import crypto from 'node:crypto';
import sidebarStyle from '../../extension/src/sidebar-style.js';

// Reuse the trusted extension's renderer without activating VS Code or changing
// production code. Fail visibly if its function boundary changes.
const source = readFileSync(new URL('../../extension/src/extension.js', import.meta.url), 'utf8');
const start = source.indexOf('  function render(webview) {');
const end = source.indexOf('  context.subscriptions.push(vscode.window.registerWebviewViewProvider', start);
if (start < 0 || end < 0) throw new Error('Sidebar renderer changed; update the review adapter.');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function sidebarSource(state = 'ready') {
  const webview = {};
  runInNewContext(`${source.slice(start, end)}\nrender(webview);`, {
    crypto, webview, escape, sidebarStyles: sidebarStyle.sidebarStyles, isBusy: () => false,
    repository: 'No repository connected', auth: { signedIn: false, accountLabel: '' },
    branch: '', uploadMode: () => 'simulation', execution: null,
    state: state === 'error' ? 'Your app could not build. Main.java, line 8: add a semicolon after the greeting. Choose Show Problems to find the line.' : 'Ready. Run App opens your app in a separate window.',
    buildFailed: state === 'error',
  }, { timeout: 1000 });
  return webview.html;
}
