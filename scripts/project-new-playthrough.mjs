import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cp, mkdtemp, realpath, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {processSpecification} from './process-specification.mjs';

const require = createRequire(import.meta.url);
const {runSpecification} = require('../extension/src/core.js');
const {createWebPreview} = require('../extension/src/web-preview.js');
const {createRecordDecoder} = require('../extension/src/native-runtime-task.js');

const names = ['Sam', 'Ada'];
const greetings = names.map(name => `Hello, ${name}!`);
const starterReady = 'UI_READY';
const nativeProbe = new URL('./ProjectNewGreetingCheck.java', import.meta.url);

async function runNative(projectRoot, starter) {
  const run = runSpecification(projectRoot);
  const args = ['-B', '--no-transfer-progress'];
  if (!starter) args.push('-Dapp.mainClass=ProjectNewGreetingCheck');
  const spec = processSpecification(run.command, [...args, ...run.args]);
  const windows = process.platform === 'win32';
  const runId = randomUUID(), buildId = 'project-new-starter';
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd: run.cwd,
      env: {...process.env, ZERO_RUNTIME_RUN_ID: runId, ZERO_RUNTIME_BUILD_ID: buildId},
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !windows,
      windowsHide: true,
      windowsVerbatimArguments: spec.windowsVerbatimArguments
    });
    let stdout = '', stderr = '', timedOut = false, started = false;
    function stop() {
      if (!child.pid) return;
      if (windows) {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {windowsHide: true, stdio: 'ignore'})
          .once('error', () => child.kill());
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    }
    const timer = setTimeout(() => { timedOut = true; stop(); }, 180000);
    const decoder = createRecordDecoder({runId, buildId, write: () => {}, onEvent: event => {
      if (starter && event.type === 'ui-ready' && !timedOut) {
        started = true;
        stop();
      }
    }});
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-16000); decoder.push(chunk); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      const marker = stdout.split(/\r?\n/).includes('ZERO_PROJECT_NEW_NATIVE_GREETING_OK ' + greetings.join(' | '));
      if (!timedOut && (starter ? started : code === 0 && marker)) resolve();
      else {
        const detail = timedOut ? 'timed out' : code === 0 ? 'missing startup or greeting confirmation' : `exit ${code ?? signal}`;
        reject(new Error(`Project → New native Run failed (${detail}).\n${stdout}\n${stderr}`));
      }
    });
  });
}

export async function verifyNativeGreeting(projectRoot, {starter = false} = {}) {
  // Keep the JavaFX verifier out of the student project and its browser export.
  const scratch = await mkdtemp(path.join(await realpath(tmpdir()), 'zero greeting native '));
  try {
    const wrapper = path.basename(runSpecification(projectRoot).command);
    for (const entry of [wrapper, 'pom.xml', '.mvn', 'src']) {
      await cp(path.join(projectRoot, entry), path.join(scratch, entry), {recursive: true});
    }
    if (!starter) await cp(nativeProbe, path.join(scratch, 'src/main/java/ProjectNewGreetingCheck.java'));
    await runNative(scratch, starter);
    return {greetings: starter ? [starterReady] : [...greetings]};
  } finally {
    await rm(scratch, {recursive: true, force: true});
  }
}

export function isBrowserConsoleFailure(message, browserDefaultIcon) {
  if (message.type() !== 'error' || message.location().url === browserDefaultIcon) return false;
  // Chrome reports the generated WebFX runtime's legacy unload listener as a policy diagnostic.
  return message.text() !== 'Permissions policy violation: unload is not allowed in this document.';
}

export async function verifyWebGreeting(sitePath) {
  // This resolves the same pinned browser runner as scripts/ci-browser.mjs.
  const cliRequire = createRequire(require.resolve('@playwright/cli/package.json'));
  const {chromium} = cliRequire('playwright');
  const preview = await createWebPreview(sitePath);
  const failures = new Set();
  let browser;
  try {
    browser = await chromium.launch({channel: 'chrome', headless: true, timeout: 30000});
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const browserDefaultIcon = new URL('/favicon.ico', preview.url).href;
    page.on('pageerror', error => failures.add(error.message));
    page.on('crash', () => failures.add('Browser page crashed.'));
    page.on('console', message => {
      // Chrome requests an origin-level icon outside the served export.
      if (isBrowserConsoleFailure(message, browserDefaultIcon)) failures.add(message.text());
    });
    page.on('requestfailed', request => failures.add(`${request.resourceType()} request failed: ${request.failure()?.errorText}`));
    page.on('response', response => {
      if (response.status() >= 400) failures.add(`${response.request().resourceType()} request returned ${response.status()}`);
    });
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', event => console.error('Unhandled rejection', event.reason));
    });
    const response = await page.goto(preview.url);
    assert.ok(response?.ok(), 'The exported Greeting page did not load.');
    const visibleText = text => page.getByText(text, {exact: true}).filter({visible: true});
    await visibleText('Hello, Java!').waitFor();
    // The pinned WebFX peer exposes the role on both the host and the input.
    const field = page.locator('input[type="text"]');
    const button = page.getByRole('button', {name: 'Say hello', exact: true});
    assert.equal(await field.inputValue(), '', 'The exported name field should start empty.');
    for (const [index, name] of names.entries()) {
      await field.fill('');
      await field.pressSequentially(name);
      assert.equal(await field.inputValue(), name);
      await button.click();
      await visibleText(greetings[index]).waitFor();
    }
    assert.deepEqual([...failures], [], 'The Greeting export reported browser runtime or resource errors.');
    return {browser: browser.version(), greetings: [...greetings]};
  } catch (error) {
    const diagnostics = [...failures].join('\n');
    throw new Error(`Project → New Greeting browser check failed: ${error.message}${diagnostics ? '\n' + diagnostics : ''}`, {cause: error});
  } finally {
    try { await browser?.close(); } finally { preview.dispose(); }
  }
}
