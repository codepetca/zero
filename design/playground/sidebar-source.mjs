import path from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import crypto from 'node:crypto';
import sidebarStyle from '../../extension/src/sidebar-style.js';
import sidebarClient from '../../extension/src/sidebar-script.js';
import sidebarIcons from '../../extension/src/sidebar-icons.js';
import {publishingSnapshots,publishedLinkController} from './publishing-source.mjs';
import publishProgressComponent from '../../extension/src/publish-progress.js';
import setupProject from '../../extension/src/setup-project.js';
import gitRecoveryPanel from '../../extension/src/git-recovery-panel.js';

// Reuse the trusted extension's renderer without activating VS Code or changing
// production code. Fail visibly if its function boundary changes.
const source = readFileSync(new URL('../../extension/src/extension.js', import.meta.url), 'utf8');
const start = source.indexOf('  function render(');
const end = source.indexOf('  const controlsProvider=', start);
if (start < 0 || end < 0) throw new Error('Sidebar renderer changed; update the review adapter.');
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function sidebarSource(state = 'ready', {connected = false, studentExplorer = false, projectRoot:activeRoot='/fixture/project'} = {}) {
  const webview = {};
  const publishing=publishingSnapshots[state];
  const phase = state === 'busy' ? 'ready' : ['signed-out','install','checking','unavailable'].includes(state) ? state : connected ? 'ready' : 'signed-out';
  const signedIn = phase !== 'signed-out';
  runInNewContext(`${source.slice(start, end)}\nrender(webview,studentExplorer);`, {
    webPublish:{hasPublishedApp:scope=>state.startsWith('published') && publishedLinkController.hasPublishedApp(scope)},
    publishProgressHtml:publishProgressComponent.publishProgressHtml,publishProgress:publishing?.publishProgress,
    path,isSetupProject:setupProject.isSetupProject,assets:{canCopyPaths:()=>false},context:{workspaceState:{get:()=>undefined}},exportReadyRoot:undefined,savedChecksRoot:undefined,savedChecksState:undefined,browserRun:{canOpenInBrowser:state==='running'},
    projectRoot: state === 'empty' ? undefined : activeRoot, renderedWebviews: new WeakSet(), sidebarScript: sidebarClient.sidebarScript, crypto, webview, studentExplorer, escape, icon:sidebarIcons.icon, sidebarStyles: sidebarStyle.sidebarStyles, isBusy: () => Boolean(publishing?.publishProgress||publishing?.busy)||['building','stopping','busy'].includes(state),
    githubReady:()=>connected && phase === 'ready', githubReadiness:{phase},
    repository: connected ? 'https://github.com/student/greeting' : 'No repository connected', auth: { signedIn: signedIn, accountId:'1', accountLabel: signedIn ? 'armorup' : '' },
    branch: '', branchDetached: false, updateRecovery:undefined,updateRecoveryError:undefined,pendingUpload:undefined,pendingDirty:false,pendingMatchesHead:false,gitRecoveryPanel,uploadProgress: '', uploadMode: () => 'simulation', execution: null, pendingLaunch:undefined, nativeStarting:0, stopPromise:state==='stopping'?Promise.resolve():undefined, browserBusy:state==='building', browserActive:['building','running'].includes(state), localPractice: state === 'practice', originalWork: state !== 'practice',
    state: publishing?.status || (state === 'error' ? 'Your app could not build. Main.java, line 8: add a semicolon after the greeting. Choose Show Problems to find the line.' : ''),
    buildFailed: state === 'error',
  }, { timeout: 1000 });
  return webview.html;
}
