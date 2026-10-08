'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const core = require('./core');
const {assertNoUrlRewrites} = require('./github');
const execute = promisify(execFile);

// Only push and its confirmation receive credentials; local Git never does.
function createTransport(remote, authenticate, {assertCurrentNow, spawn = execute, environment = process.env, localRun = core.git} = {}) {
  const destination = core.parseRepositoryUrl(remote).remote;
  if (remote !== destination) throw new Error('Review the ordinary GitHub HTTPS destination again.');
  if (typeof assertCurrentNow !== 'function' || assertCurrentNow.constructor.name === 'AsyncFunction') throw new Error('GitHub transport requires a synchronous session guard.');
  return async (root, args) => {
    const pushing = args.length === 3 && args[0] === 'push' && args[1] === destination && /^[a-f0-9]{40,64}:refs\/heads\/[^\s:]+$/.test(args[2]);
    const checking = args.length === 4 && args[0] === 'ls-remote' && args[1] === '--heads' && args[2] === destination && /^refs\/heads\/[^\s:]+$/.test(args[3]);
    if (!pushing && !checking) throw new Error('Only the reviewed GitHub upload and confirmation may use this sign-in.');
    // Git 2.31 introduced runtime config via GIT_CONFIG_COUNT. Fail closed
    // before obtaining transport credentials on versions that would ignore it.
    const version = /^git version (\d+)\.(\d+)(?:\.|\s|$)/.exec(await localRun(root, ['--version']));
    if (!version || Number(version[1]) < 2 || (Number(version[1]) === 2 && Number(version[2]) < 31)) throw new Error('Zero live upload needs Git 2.31 or newer for isolated credentials. Update Git, then review the upload again.');
    // Refresh once, then finish all asynchronous preparation and check the
    // captured session synchronously before constructing credentials/dispatch.
    const fresh = await authenticate();
    await core.assertRepositoryRoot(root, localRun);
    await assertNoUrlRewrites(root, localRun);
    const hooks = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-upload-hooks-'));
    let env;
    const settings = [];
    try {
      const session = assertCurrentNow();
      if (session && typeof session.then === 'function') {
        void Promise.resolve(session).catch(() => {});
        throw new Error('GitHub transport requires a synchronous session guard.');
      }
      if (!session || session.id !== fresh?.id || session.accountId !== fresh?.accountId || session.accessToken !== fresh?.accessToken) throw new Error('Your GitHub sign-in changed. Review the upload again.');
      if (!session?.accessToken || /[\r\n\0]/.test(session.accessToken)) throw new Error('Sign in to GitHub and review the upload again.');
      // No asynchronous preparation follows this check before child dispatch.
      env = {...environment};
      for (const key of Object.keys(env)) {
        if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$|^GIT_TRACE|^GIT_CURL_VERBOSE$|^GIT_SSL_NO_VERIFY$|^GIT_ASKPASS$|^SSH_ASKPASS$|^SSLKEYLOGFILE$/i.test(key)) delete env[key];
      }
      // Command-scope configuration overrides files without changing any file.
      // Reset credential helpers and headers, stop redirects, and suppress hooks
      // in the credential-bearing child so they cannot inherit its environment.
      // Keep config file locations consistent with the local rewrite inspection.
      // An empty, temporary directory prevents every hook without storing secrets.
      const scoped = `http.${destination}.`;
      settings.push(
        ['credential.helper', ''], [`credential.${destination}.helper`, ''], ['core.askPass', ''],
        ['core.hooksPath', hooks],
        ['http.extraHeader', ''], [scoped + 'extraHeader', ''],
        [scoped + 'extraHeader', `Authorization: Basic ${Buffer.from(`x-access-token:${session.accessToken}`).toString('base64')}`],
        [scoped + 'followRedirects', 'false'], [scoped + 'sslVerify', 'true'], [scoped + 'curloptResolve', ''],
        [scoped + 'cookieFile', ''], [scoped + 'saveCookies', 'false']
      );
      // Trace2 starts before command-scope config is applied; environment zero
      // must override persistent trace targets that could record runtime secrets.
      env.GIT_TRACE2 = '0'; env.GIT_TRACE2_EVENT = '0'; env.GIT_TRACE2_PERF = '0';
      env.GIT_TERMINAL_PROMPT = '0'; env.GIT_ASKPASS = ''; env.SSH_ASKPASS = '';
      env.GIT_CONFIG_COUNT = String(settings.length);
      settings.forEach(([key, value], index) => { env[`GIT_CONFIG_KEY_${index}`] = key; env[`GIT_CONFIG_VALUE_${index}`] = value; });
      try {
        const {stdout} = await spawn('git', args, {cwd: root, env, timeout: 120000, maxBuffer: 1024 * 1024});
        // Neither operation needs arbitrary output: push is ignored, ls-remote
        // returns only a SHA and the expected ref. Never expose raw child output.
        if (pushing) return '';
        const rows = stdout.trim().split('\n').filter(Boolean);
        if (rows.some(row => !/^[a-f0-9]{40,64}\trefs\/heads\/[^\s:]+$/.test(row))) throw new Error('Unexpected remote response');
        return rows.join('\n');
      } catch (error) {
        const detail = String(error.stderr || '');
        if (/non-fast-forward|fetch first|rejected.*behind/i.test(detail)) throw new Error('GitHub has changes missing locally. Bring them into this project with Git, resolve conflicts, then review again. Your local commit is preserved.');
        if (/authentication|credential|401|403|denied|repository not found/i.test(detail)) throw new Error('GitHub refused this upload. Check your VS Code GitHub account, repository access and sign-in, then review again. Your local commit is preserved.');
        throw new Error('GitHub transport failed. Check the repository URL and network, then review again. Your local commit is preserved; nothing was confirmed uploaded.');
      }
    } finally {
      // Drop credential-bearing config references even when spawning fails.
      for (const key of Object.keys(env || {})) if (/^GIT_CONFIG_/.test(key)) delete env[key];
      settings.length = 0;
      await fs.rm(hooks, {recursive:true, force:true}).catch(() => {});
    }
  };
}
module.exports = {createTransport};
