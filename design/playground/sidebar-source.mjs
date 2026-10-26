import path from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import crypto from 'node:crypto';
import sidebarStyle from '../../extension/src/sidebar-style.js';
import sidebarClient from '../../extension/src/sidebar-script.js';
import sidebarIcons from '../../extension/src/sidebar-icons.js';
import setupProject from '../../extension/src/setup-project.js';
import gitRecoveryPanel from '../../extension/src/git-recovery-panel.js';

// Reuse the trusted extension's renderer without activating VS Code or changing
// production code. Fail visibly if its function boundary changes.
const source = readFileSync(new URL('../../extension/src/extension.js', import.meta.url), 'utf8');
const start = source.indexOf('  function render(webview) {');
const end = source.indexOf('  context.subscriptions.push(vscode.window.registerWebviewViewProvider', start);
if (start < 0 || end < 0) throw new Error('Sidebar renderer changed; update the review adapter.');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function sidebarSource(state = 'ready', {connected = false} = {}) {
  const webview = {};
  const phase = state === 'busy' ? 'ready' : ['signed-out','install','checking','unavailable'].includes(state) ? state : connected ? 'ready' : 'signed-out';
  const signedIn = phase !== 'signed-out';
  runInNewContext(`${source.slice(start, end)}\nrender(webview);`, {
    path,isSetupProject:setupProject.isSetupProject,assets:{canCopyPaths:()=>false},context:{workspaceState:{get:()=>undefined}},exportReadyRoot:undefined,savedChecksRoot:undefined,savedChecksState:undefined,browserRun:{canOpenInBrowser:state==='running'},
    projectRoot: state === 'empty' ? undefined : '/fixture/project', renderedWebview: undefined, sidebarScript: sidebarClient.sidebarScript, crypto, webview, escape, icon:sidebarIcons.icon, sidebarStyles: sidebarStyle.sidebarStyles, isBusy: () => ['building','stopping','busy'].includes(state),
    githubReady:()=>connected && phase === 'ready', githubReadiness:{phase},
    repository: connected ? 'https://github.com/student/greeting' : 'No repository connected', auth: { signedIn: signedIn, accountLabel: signedIn ? 'armorup' : '' },
    branch: '', branchDetached: false, updateRecovery:undefined,updateRecoveryError:undefined,pendingUpload:undefined,pendingDirty:false,gitRecoveryPanel,uploadProgress: '', uploadMode: () => 'simulation', execution: null, pendingLaunch:undefined, nativeStarting:0, stopPromise:state==='stopping'?Promise.resolve():undefined, browserBusy:state==='building', browserActive:['building','running'].includes(state), localPractice: state === 'practice', originalWork: state !== 'practice',
    state: state === 'error' ? 'Your app could not build. Main.java, line 8: add a semicolon after the greeting. Choose Show Problems to find the line.' : '',
    buildFailed: state === 'error',
  }, { timeout: 1000 });
  return webview.html;
}
