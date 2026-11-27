// Real-editor regression probe. Run only after test-windows-installation.ps1 on a disposable hosted VM.
import {createRequire} from 'node:module';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const cliRequire = createRequire(require.resolve('@playwright/cli/package.json'));
const {chromium} = cliRequire('playwright');
const reportPath = path.resolve('.verification/windows-sign-in-sidebar/report.json');
const report = {schema:1, status:'failed', stage:'preflight', beforeSignIn:false, afterCancel:false,
  whileBrowserPending:false, liveAccountTested:false};
let temp, child, browser;
const hash = async p => createHash('sha256').update(await fs.readFile(p)).digest('hex');
async function unique(items, description) {
  if (items.length !== 1) throw Error(`Expected exactly one ${description}`);
  return items[0];
}
async function port() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {const p = server.address().port; server.close(() => resolve(p));});
  });
}
async function waitFor(description, fn, seconds = 90) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {try {const value = await fn(); if (value) return value;} catch {} await new Promise(r => setTimeout(r, 500));}
  throw Error(`Timed out waiting for ${description}`);
}
async function visibleText(page, text) {
  for (const frame of page.frames()) {
    try {
      const matches = frame.getByText(text, {exact:true});
      for (let i = 0; i < await matches.count(); i++) if (await matches.nth(i).isVisible()) return true;
    } catch {}
  }
  return false;
}
async function sidebar(page) {
  return await visibleText(page, 'Project') && await visibleText(page, 'Files') &&
    (await visibleText(page, 'Run App') || await visibleText(page, 'Run'));
}
try {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw Error('Disposable GitHub-hosted Windows runner required');
  const data = path.join(process.env.LOCALAPPDATA, 'ZeroData');
  const runtime = path.join(data, 'runtime');
  const editorDir = await unique((await fs.readdir(runtime, {withFileTypes:true})).filter(x => x.isDirectory() && x.name.startsWith('vscode-')).map(x => path.join(runtime, x.name)), 'provisioned VS Code');
  const editor = path.join(editorDir, 'Code.exe');
  await fs.access(editor);
  const installed = path.join(data, 'editor', 'extensions');
  const ext = await unique((await fs.readdir(installed, {withFileTypes:true})).filter(x => x.isDirectory() && /^zero\.zero-/.test(x.name)).map(x => path.join(installed, x.name)), 'installed Zero extension');
  const manifest = JSON.parse(await fs.readFile(path.join(ext, 'package.json'), 'utf8'));
  const kit = JSON.parse(await fs.readFile('dist/release.json', 'utf8'));
  if (manifest.version !== kit.kitVersion || await hash(path.join(ext, 'src/extension.js')) !== await hash('extension/src/extension.js')) throw Error('Installed extension does not match candidate source and kit');
  report.kitVersion = kit.kitVersion;
  report.extensionSourceSha256 = await hash('extension/src/extension.js');
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-sidebar-'));
  const profile = path.join(temp, 'profile'), extensions = path.join(temp, 'extensions'), project = path.join(temp, 'starter');
  const zeroProfile = JSON.parse(await fs.readFile('profile/Zero.code-profile', 'utf8'));
  const zeroSettings = JSON.parse(JSON.parse(zeroProfile.settings).settings);
  await fs.mkdir(path.join(profile, 'User'), {recursive:true});
  await fs.writeFile(path.join(profile, 'User', 'settings.json'), JSON.stringify({
    ...zeroSettings, 'window.dialogStyle':'custom', 'security.workspace.trust.enabled':false,
    'telemetry.telemetryLevel':'off', 'update.mode':'none', 'extensions.autoUpdate':false,
    'zero.automaticPublicProblemReports':false
  }));
  await fs.mkdir(extensions); await fs.cp(ext, path.join(extensions, path.basename(ext)), {recursive:true});
  await fs.cp(path.join(process.env.USERPROFILE, 'Zero', 'starter'), project, {recursive:true});
  const debugPort = await port();
  report.stage = 'launch';
  child = spawn(editor, [`--user-data-dir=${profile}`, `--extensions-dir=${extensions}`, '--new-window', '--skip-welcome', '--disable-updates', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`, project], {stdio:'ignore'});
  child.on('error', () => {});
  const endpoint = `http://127.0.0.1:${debugPort}`;
  await waitFor('local editor debugger', async () => (await fetch(`${endpoint}/json/version`)).ok);
  browser = await chromium.connectOverCDP(endpoint);
  const page = await waitFor('editor window', async () => browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('workbench')));
  report.stage = 'pending-first-use';
  await waitFor('first-use sign-in modal', () => visibleText(page, 'Use your GitHub account to sign in to Zero. You can work on local projects offline after signing in.'));
  await waitFor('Project, Files and Run while sign-in is pending', () => sidebar(page));
  report.beforeSignIn = true;
  report.stage = 'browser-wait';
  await page.getByRole('dialog').getByRole('button', {name:'Sign in to Zero', exact:true}).click({timeout:5000});
  // The same text also appears in VS Code's live accessibility announcement.
  const waiting = page.locator('.notification-toast').filter({hasText:'Finish signing in in your browser.'});
  await waiting.waitFor({state:'visible', timeout:15000});
  if (!await sidebar(page)) throw Error('Project controls disappeared while browser sign-in was pending');
  report.whileBrowserPending = true;
  report.stage = 'cancel-browser-wait';
  await waiting.getByRole('button', {name:'Cancel', exact:true}).click({timeout:5000});
  report.stage = 'verify-browser-cancel';
  await waiting.waitFor({state:'hidden', timeout:15000});
  await waitFor('Project, Files and Run after cancel', () => sidebar(page));
  report.afterCancel = true;
  report.stage = 'complete'; report.status = 'passed';
} catch (error) {
  // Do not persist browser URLs, paths, output, or exception details.
  console.error(`Windows sidebar probe failed at ${report.stage}.`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child?.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {stdio:'ignore'});
  if (temp) await fs.rm(temp, {recursive:true, force:true, maxRetries:5, retryDelay:500}).catch(() => {});
  await fs.mkdir(path.dirname(reportPath), {recursive:true});
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Windows sidebar probe: ${report.status} (${report.stage})`);
}
