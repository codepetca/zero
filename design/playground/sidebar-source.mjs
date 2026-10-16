import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import crypto from 'node:crypto';
import sidebarStyle from '../../extension/src/sidebar-style.js';
import sidebarClient from '../../extension/src/sidebar-script.js';
import sidebarIcons from '../../extension/src/sidebar-icons.js';

// Reuse the trusted extension's renderer without activating VS Code or changing
// production code. Fail visibly if its function boundary changes.
const source = readFileSync(new URL('../../extension/src/extension.js', import.meta.url), 'utf8');
const start = source.indexOf('  function render(webview) {');
const end = source.indexOf('  const files = createSidebarFiles', start);
if (start < 0 || end < 0) throw new Error('Sidebar renderer changed; update the review adapter.');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function sidebarSource(state = 'ready') {
  const webview = {};
  runInNewContext(`${source.slice(start, end)}\nrender(webview);`, {
    context:{workspaceState:{get:()=>undefined}},exportReadyRoot:undefined,browserRun:{canOpenInBrowser:false},
    projectRoot: state === 'empty' ? undefined : '/fixture/project', renderedWebview: undefined, sidebarScript: sidebarClient.sidebarScript, crypto, webview, escape, icon:sidebarIcons.icon, sidebarStyles: sidebarStyle.sidebarStyles, isBusy: () => false,
    repository: 'No repository connected', auth: { signedIn: false, accountLabel: '' },
    branch: '', branchDetached: false, uploadMode: () => 'simulation', execution: null, browserActive: false, localPractice: state === 'practice', originalWork: state !== 'practice',
    state: state === 'error' ? 'Your app could not build. Main.java, line 8: add a semicolon after the greeting. Choose Show Problems to find the line.' : '',
    buildFailed: state === 'error',
  }, { timeout: 1000 });
  return webview.html;
}
