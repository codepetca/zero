'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const core = require('./core');
const {assertNoUrlRewrites, gitError, validBranch} = require('./github');
const execute = promisify(execFile);

// Only reviewed remote operations receive credentials; local Git never does.
function createTransport(remote, authenticate, {assertCurrentNow, spawn = execute, environment = process.env, localRun = core.git} = {}) {
  const destination = core.parseRepositoryUrl(remote).remote;
  if (remote !== destination) throw new Error('Review the ordinary GitHub HTTPS destination again.');
  if (typeof assertCurrentNow !== 'function' || assertCurrentNow.constructor.name === 'AsyncFunction') throw new Error('GitHub transport requires a synchronous session guard.');
  return async (root, args) => {
    const pushing = args.length === 3 && args[0] === 'push' && args[1] === destination && /^(?:[a-f0-9]{40}|[a-f0-9]{64}):refs\/heads\//.test(args[2]) && validBranch(args[2].slice(args[2].indexOf(':') + ':refs/heads/'.length));
    const checking = args.length === 4 && args[0] === 'ls-remote' && args[1] === '--heads' && args[2] === destination && typeof args[3] === 'string' && args[3].startsWith('refs/heads/') && validBranch(args[3].slice('refs/heads/'.length));
    const fetching = args.length === 6 && args[0] === 'fetch' && args[1] === '--no-tags' && args[2] === '--no-recurse-submodules' && args[3] === '--no-write-fetch-head' && args[4] === destination && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(args[5]);
    if (!pushing && !checking && !fetching) throw Object.assign(new Error('Only the reviewed GitHub upload, main fetch and branch confirmation may use this sign-in.'), {kind: 'changed'});
    // Git 2.31 introduced runtime config via GIT_CONFIG_COUNT. Fail closed
    // before obtaining transport credentials on versions that would ignore it.
    let version;
    try { version = /^git version (\d+)\.(\d+)(?:\.|\s|$)/.exec(await localRun(root, ['--version'])); }
    catch (error) { throw gitError(error, 'check the local Git version'); }
    if (!version || Number(version[1]) < 2 || (Number(version[1]) === 2 && Number(version[2]) < 31)) throw Object.assign(new Error('Zero live upload needs Git 2.31 or newer for isolated credentials. Update Git, then review the upload again.'), {kind: 'changed'});
    // Refresh once, then finish all asynchronous preparation and check the
    // captured session synchronously before constructing credentials/dispatch.
    let fresh;
    try {
      const authenticated = await authenticate();
      fresh = {id: authenticated?.id, accountId: authenticated?.accountId, accessToken: authenticated?.accessToken};
    }
    catch (error) { throw gitError(error, 'verify GitHub access'); }
    let hooks;
    try { hooks = await fs.mkdtemp(path.join(os.tmpdir(), 'zero-upload-hooks-')); }
    catch (error) { throw gitError(error, 'prepare isolated GitHub transport'); }
    let env;
    const settings = [];
    try {
      // Prepare resources first; destination checks are the final asynchronous
      // work, followed by the synchronous session check and immediate dispatch.
      try { await core.assertRepositoryRoot(root, localRun); }
      catch (error) { throw gitError(error, 'verify the student project'); }
      try { await assertNoUrlRewrites(root, localRun); }
      catch (error) {
        if (error.kind === 'changed') throw error;
        throw gitError(error, 'verify the GitHub destination');
      }
      const checkSession = () => {
        let session;
        try { session = assertCurrentNow(); }
        catch (error) { throw gitError(error, 'verify the current GitHub sign-in'); }
        if (session && typeof session.then === 'function') {
          void Promise.resolve(session).catch(() => {});
          throw Object.assign(new Error('GitHub transport requires a synchronous session guard.'), {kind: 'changed'});
        }
        if (!session || session.id !== fresh?.id || session.accountId !== fresh?.accountId || session.accessToken !== fresh?.accessToken) throw Object.assign(new Error('Your GitHub sign-in changed. Review the upload again.'), {kind: 'changed'});
        if (!session?.accessToken || /[\r\n\0]/.test(session.accessToken)) throw Object.assign(new Error('Sign in to GitHub and review the upload again.'), {kind: 'auth'});
        return session;
      };
      const session = checkSession();
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
        checkSession();
        // Push/fetch need no arbitrary output; ls-remote
        // returns only a SHA and the expected ref. Never expose raw child output.
        if (pushing || fetching) return '';
        const rows = stdout.trim().split('\n').filter(Boolean);
        if (rows.length > 1 || rows.some(row => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})\trefs\/heads\/[^\s:]+$/.test(row) || row.split('\t')[1] !== args[3])) throw new Error('Unexpected remote response');
        return rows.join('\n');
      } catch (error) {
        throw gitError(error, 'upload or confirm the GitHub branch');
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
