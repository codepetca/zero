'use strict';

const {randomUUID} = require('node:crypto');
const {refreshTokens, requestJson, failure} = require('./device-flow');
const {browserFlow,refreshBrowserTokens}=require('./browser-flow');
const {SECRET_KEY, binding, createCredentialStore, createCredentialLock} = require('./credential-store');
function session(record) {
  return Object.freeze({id:record.sessionId, account:Object.freeze({...record.account}), accessToken:record.accessToken, scopes:Object.freeze([])});
}
function supportedScopes(scopes) {
  if (scopes && (!Array.isArray(scopes) || scopes.length)) throw failure('unsupported-scopes', 'Zero uses GitHub App permissions. OAuth scopes are not supported.');
}
function samePermissions(actual, expected, optional = {}) {
  return actual && expected && Object.entries(expected).every(([key,value]) => actual[key] === value) &&
    Object.entries(actual).every(([key,value]) => Object.hasOwn(expected,key) ? expected[key]===value : Object.hasOwn(optional,key) && optional[key]===value);
}
async function verifyApp(configuration, fetchImpl, signal, token) {
  const app = await requestJson(fetchImpl, `https://api.github.com/apps/${configuration.slug}`, {signal,token});
  if (app.id !== configuration.appId || app.client_id !== configuration.clientId || app.slug !== configuration.slug ||
      app.owner?.login?.toLowerCase() !== configuration.owner || !samePermissions(app.permissions, configuration.permissions, configuration.optionalPermissions)) {
    throw failure('app-mismatch', 'The Codepet GitHub App does not match this Zero release. Connection is unavailable until its configuration is reviewed.');
  }
}
function configurationKey(value) {
  if (Array.isArray(value)) return value.map(configurationKey);
  if (value && typeof value === 'object') return Object.keys(value).sort().map(key=>[key,configurationKey(value[key])]);
  return value;
}
async function accountFor(record, fetchImpl, signal) {
  const user = await requestJson(fetchImpl, 'https://api.github.com/user', {token:record.accessToken, signal});
  if (!Number.isSafeInteger(user.id) || user.id < 1 || typeof user.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(user.login) || user.type !== 'User') {
    throw failure('invalid-account', 'GitHub did not return a valid personal account.');
  }
  return {id:String(user.id), label:user.login};
}
function createGitHubAppProvider({vscode, context, configuration, fetchImpl = globalThis.fetch, now = Date.now, onDiagnostic = () => {}, browserOptions = {}}) {
  const emitter = new vscode.EventEmitter();
  let disposed = false, cached, signInPromise, verifiedConfiguration, pendingRemovals = 0;
  let identityRevision = 0;
  const verifiedSessions = new WeakMap();
  const controllers = new Set();
  const store = configuration ? createCredentialStore({secrets:context.secrets, configuration}) : undefined;
  // Delay local-path validation until connection use; an unconfigured build and
  // offline Run must activate normally on every supported extension host.
  let lock;
  const withLock = (callback, signal) => {
    lock ||= createCredentialLock({globalStorageUri:context.globalStorageUri, now});
    return lock(callback, signal);
  };
  function invalidate(force = false) {
    identityRevision++;
    const removed = cached ? [cached] : [];
    cached = undefined;
    if (!disposed && (force || removed.length)) emitter.fire({added:[], removed, changed:[]});
  }
  const subscription = context.secrets.onDidChange(event => { if (event.key === SECRET_KEY) invalidate(true); });
  function available() {
    if (disposed) throw failure('disposed', 'The Zero connection is closed.');
    if (!configuration) throw failure('unconfigured', 'The Codepet GitHub App is not configured in this Zero release. Local running still works.');
  }
  async function operation(callback) {
    const controller = new AbortController(); controllers.add(controller);
    try {
      const result = await callback(controller);
      assertAvailable(controller.signal);
      return result;
    }
    catch(error){identityRevision++;if(error.code==='connection-lock-repair-required'&&!disposed)onDiagnostic(error.message);throw error;}
    finally { controllers.delete(controller); }
  }
  async function clearInvalid() { await store.clear(); invalidate(); }
  async function verifyExistingApp(record,signal) {
    const key=JSON.stringify(configurationKey(configuration));
    if(verifiedConfiguration?.key===key && verifiedConfiguration.expiresAt>now())return;
    // Cache only a complete successful comparison. A mismatch or failed request
    // must not retain an earlier grant, including after configuration changes.
    verifiedConfiguration=undefined;
    await verifyApp(configuration,fetchImpl,signal,record.accessToken);
    if (key !== JSON.stringify(configurationKey(configuration))) throw failure('app-mismatch', 'The Codepet GitHub App configuration changed. Review the connection again.');
    verifiedConfiguration={key,expiresAt:now()+60000};
  }
  function assertAvailable(signal) {
    available();
    if (signal?.aborted) throw failure('cancelled', 'GitHub sign-in was cancelled.');
    if (pendingRemovals) throw failure('connection-removing', 'Zero is signing out of GitHub. Wait for sign-out to finish before signing in again.');
  }
  const recordKey = record => JSON.stringify(configurationKey(record));
  async function load(signal, expected) {
    assertAvailable(signal);
    return withLock(async () => {
      assertAvailable(signal);
      // Always reread under the cross-window lock, including after a waiter wins.
      let record;
      try { record = await store.read(); }
      catch (error) { invalidate(); throw error; }
      assertAvailable(signal);
      if (!record) { invalidate(); return []; }
      if (record.state !== 'active' || record.refreshExpiresAt <= now()) { invalidate(); return []; }
      const receipt = expected && verifiedSessions.get(expected);
      if (receipt && (receipt.revision !== identityRevision || receipt.configuration !== recordKey(configuration) || receipt.record !== recordKey(record))) {
        invalidate(); throw failure('connection-changed', 'Your Zero connection changed. Try sign-in again.');
      }
      if (receipt && record.expiresAt > now() + 60000) {
        // Every assertion rereads SecretStorage under the cross-window lock.
        // Only the exact session returned by a full identity check can reuse
        // that identity within its captured operation; there is no time cache.
        try { await verifyExistingApp(record, signal); }
        catch (error) { if(error.code==='unauthorized')await clearInvalid();else invalidate();throw error; }
        assertAvailable(signal);
        const latest = await store.read();
        assertAvailable(signal);
        if (receipt.revision !== identityRevision || receipt.configuration !== recordKey(configuration) || receipt.record !== recordKey(latest)) {
          invalidate(); throw failure('connection-changed', 'Your Zero connection changed. Try sign-in again.');
        }
        return [expected];
      }
      if (record.expiresAt <= now() + 60000) {
        const original = record;
        // This write precedes dispatch: a crash/timeout has an uncertain outcome,
        // so restart must reconnect rather than reuse a rotating refresh token.
        await store.write({...record, state:'refreshing'});
        assertAvailable(signal);
        try {
          const pair = record.flow==='browser'
            ? await refreshBrowserTokens({...browserOptions,configuration,refreshToken:record.refreshToken,fetchImpl,now,signal})
            : await refreshTokens({clientId:configuration.clientId, refreshToken:record.refreshToken, fetchImpl, now, signal});
          assertAvailable(signal);
          record = {...record, ...pair, state:'active'};
          // Verify identity before replacing the pair atomically.
          const account = await accountFor(record, fetchImpl, signal);
          assertAvailable(signal);
          if (account.id !== original.account.id) { await clearInvalid(); throw failure('account-changed', 'Your GitHub account changed. Sign in to Zero again.'); }
          record.account = account;
          const current = await store.read();
          assertAvailable(signal);
          if (current?.sessionId !== original.sessionId || current.state !== 'refreshing' || current.refreshToken !== original.refreshToken) {
            invalidate(); throw failure('connection-changed', 'Your Zero connection changed. Sign in again.');
          }
          await store.write(record);
          assertAvailable(signal);
        } catch (error) {
          // Reread before requiring reconnection. A completed new pair may have
          // landed despite an uncertain local storage acknowledgement.
          const current = await store.read();
          if (current?.state === 'active' && current.sessionId === original.sessionId && current.refreshToken !== original.refreshToken) record = current;
          else {
            if (current?.state === 'refreshing' && current.sessionId === original.sessionId) await store.write({...current, state:'reconnect'});
            invalidate();
            throw failure('reconnect-required', 'GitHub did not confirm renewal of the Zero connection. Sign in again; local running still works.');
          }
        }
      }
      // Expired credentials are renewed first: metadata uses the valid user
      // token instead of spending the anonymous shared-IP rate limit on every
      // capture/assert-current check in one repository operation.
      assertAvailable(signal);
      try { await verifyExistingApp(record,signal); }
      catch (error) { if(error.code==='unauthorized')await clearInvalid();else invalidate();throw error; }
      assertAvailable(signal);
      const identityConfiguration = recordKey(configuration);
      let account;
      try { account = await accountFor(record, fetchImpl, signal); }
      catch (error) { if (error.code === 'unauthorized' || error.code === 'invalid-account') await clearInvalid(); throw error; }
      assertAvailable(signal);
      if (account.id !== record.account.id) { await clearInvalid(); throw failure('account-changed', 'Your GitHub account changed. Sign in to Zero again.'); }
      const latest = await store.read();
      assertAvailable(signal);
      if (!latest || recordKey(latest) !== recordKey(record) || identityConfiguration !== recordKey(configuration)) {
        invalidate(); throw failure('connection-changed', 'Your Zero connection changed. Try sign-in again.');
      }
      if (account.label !== record.account.label) { record = {...record, account}; await store.write(record); }
      assertAvailable(signal);
      if (identityConfiguration !== recordKey(configuration)) {
        invalidate(); throw failure('connection-changed', 'Your Zero connection changed. Try sign-in again.');
      }
      const result = session(record);
      if (!cached) { cached = result; emitter.fire({added:[result], removed:[], changed:[]}); }
      else if (cached.accessToken !== result.accessToken || cached.account.label !== result.account.label) { cached = result; emitter.fire({added:[], removed:[], changed:[result]}); }
      verifiedSessions.set(result, {revision:identityRevision, configuration:recordKey(configuration), record:recordKey(record)});
      return [result];
    }, signal);
  }
  async function signIn(controller) {
    assertAvailable(controller.signal);
    // Reject non-local storage before issuing any authorization request.
    lock ||= createCredentialLock({globalStorageUri:context.globalStorageUri, now});
    await verifyApp(configuration, fetchImpl, controller.signal);
    assertAvailable(controller.signal);
    const baseline = await store.raw();
    assertAvailable(controller.signal);
    const run = async (progress, cancellation) => {
      const cancellationSubscription = cancellation?.onCancellationRequested(() => controller.abort());
      try {
        if (cancellation?.isCancellationRequested) controller.abort();
        assertAvailable(controller.signal);
        const pair = await browserFlow({...browserOptions,configuration,vscode,fetchImpl,now,signal:controller.signal,onProgress:message=>progress.report({message})});
        assertAvailable(controller.signal);
        const account = await accountFor(pair, fetchImpl, controller.signal);
        assertAvailable(controller.signal);
        return await withLock(async () => {
          assertAvailable(controller.signal);
          if (await store.raw() !== baseline) throw failure('connection-changed', 'Another Zero window changed the connection. Try sign-in again.');
          assertAvailable(controller.signal);
          const record = {schema:1, app:binding(configuration), sessionId:randomUUID(), account, ...pair, flow:'browser',state:'active'};
          await store.write(record);
          assertAvailable(controller.signal);
          const result = session(record); cached = result;
          emitter.fire({added:[result], changed:[], removed:[]});
          return result;
        }, controller.signal);
      } finally { cancellationSubscription?.dispose(); }
    };
    return vscode.window.withProgress({location:vscode.ProgressLocation.Notification, title:'Connecting Zero to GitHub', cancellable:true}, run);
  }
  return {
    onDidChangeSessions:emitter.event,
    get busy() {return controllers.size > 0 || pendingRemovals > 0;},
    async getSessions(scopes, options) {
      supportedScopes(scopes);
      if (!configuration || disposed) return [];
      assertAvailable();
      const sessions = await operation(controller => load(controller.signal));
      return options?.account ? sessions.filter(value => value.account.id === options.account.id) : sessions;
    },
    // Owned authentication facade only. Foreign/standard getSessions callers
    // always take the full remote identity path above.
    async getSessionsForOperation(expected, scopes, options) {
      supportedScopes(scopes);
      if (!configuration || disposed) return [];
      assertAvailable();
      const sessions = await operation(controller => load(controller.signal, expected));
      return options?.account ? sessions.filter(value => value.account.id === options.account.id) : sessions;
    },
    async createSession(scopes,options={}) {
      supportedScopes(scopes); assertAvailable();
      if(options.method!==undefined&&options.method!=='browser')throw failure('unsupported-method','Sign in to GitHub using your browser.');
      if (!signInPromise) signInPromise = operation(controller=>signIn(controller)).finally(() => { signInPromise = undefined; });
      return signInPromise;
    },
    async removeSession(id) {
      if (disposed || !configuration) return;
      pendingRemovals++;
      try {
        // Revoke this window's captured tickets as soon as its account is
        // signed out, including while waiting for another window's lock.
        if (cached?.id === id) invalidate(true);
        // Abort this window's pending login before clearing. Other windows observe
        // the immediate SecretStorage invalidation and compare their baseline.
        for (const controller of controllers) controller.abort();
        return await withLock(async () => {
          let record;
          try { record = await store.read(); } catch { await clearInvalid(); return; }
          if (!record || record.sessionId === id) await clearInvalid();
        });
      } finally {pendingRemovals--;}
    },
    dispose() {
      disposed = true; cached = undefined; identityRevision++;
      for (const controller of controllers) controller.abort();
      subscription.dispose(); emitter.dispose();
    }
  };
}
module.exports = {createGitHubAppProvider, verifyApp};
