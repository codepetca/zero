'use strict';

// Zero’s registered GitHub App provider owns secure storage; this façade holds only a guarded snapshot.
const scopes = Object.freeze([]);
const changedMessage = 'Your GitHub account or sign-in changed. Sign in and review the upload again. A local commit may already be saved.';
function snapshot(session) {
  return session && Object.freeze({id: session.id, accountId: session.account.id, label: session.account.label, accessToken: session.accessToken, scopes: Object.freeze([...(session.scopes || [])])});
}
function same(a, b) {
  return a?.id === b?.id && a?.accountId === b?.accountId && a?.accessToken === b?.accessToken && (a?.scopes || []).join('\0') === (b?.scopes || []).join('\0');
}
// Zero owns this provider and its credentials. Calling the host's getSession
// would additionally ask the user to share Zero's own session back with Zero.
// Keep registration with VS Code for Accounts and other extensions; their
// requests still go through the host's normal consent checks.
function ownedProviderApi(provider) {
  return {
    async getSession(providerId, requestedScopes, options = {}) {
      if (providerId !== 'zero-github') throw new Error('Unsupported authentication provider');
      if (!provider) return undefined;
      const sessions = await provider.getSessions(requestedScopes, options.account ? {account:options.account} : undefined);
      if (sessions.length > 1) throw new Error('Zero requires a single GitHub account');
      if (sessions.length || options.silent || !options.createIfNone) return sessions[0];
      return provider.createSession(requestedScopes);
    },
    onDidChangeSessions(listener) {
      return provider ? provider.onDidChangeSessions(() => listener({provider:{id:'zero-github'}})) : {dispose(){}};
    }
  };
}
function createAuthentication(api, onChange = () => {}, requestedScopes = scopes, preferredAccount, providerId = 'zero-github') {
  const sessionScopes = Object.freeze([...requestedScopes]);
  // Supported native account hint; callers still enforce the captured account.
  const account = preferredAccount && Object.freeze({id:preferredAccount.id,label:preferredAccount.label});
  let current, revision = 0, disposed = false, unavailable = false, pendingRequests = 0;
  let queue = Promise.resolve();
  function request(options) {
    pendingRequests++;
    const next = queue.then(async () => {
      if (disposed) return;
      let session;
      try { session = snapshot(await api.getSession(providerId, sessionScopes, account ? {...options,account} : options)); unavailable = false; }
      catch { unavailable = true; }
      if (disposed) return;
      if (!same(current, session)) revision++;
      current = session; onChange();
      return current;
    }).finally(() => {pendingRequests--;});
    queue = next.catch(() => {});
    return next;
  }
  const refresh = () => request({silent: true});
  function assertCurrentNow(ticket) {
    if (disposed || ticket.revision !== revision || !current || !same(ticket.session, current)) throw new Error(changedMessage);
    return current;
  }
  const subscription = api.onDidChangeSessions(event => {
    if (event.provider.id !== providerId || disposed) return;
    // Invalidate a pending review immediately, before asynchronous refresh.
    revision++; current = undefined; onChange();
    void refresh();
  });
  return {
    refresh,
    get busy() {return pendingRequests > 0;},
    async signIn(changeAccount = false) {
      const session = await request({createIfNone: true, ...(changeAccount ? {clearSessionPreference: true} : {})});
      if (!session) throw new Error(unavailable ? 'GitHub sign-in was cancelled or unavailable. Use Sign in to GitHub to try again. Local running still works.' : 'Sign in to GitHub to upload. Local running still works.');
    },
    get status() { return current ? `Signed in as ${current.label}` : unavailable ? 'GitHub sign-in unavailable. Try Sign in to GitHub; local running still works.' : 'Not signed in'; },
    get signedIn() { return Boolean(current); },
    get sessionId() { return current?.id; },
    get accountId() { return current?.accountId; },
    get accountLabel() { return current?.label; },
    async capture() {
      await refresh();
      if (!current) throw new Error('Sign in to GitHub before a live upload. Local running and simulation still work.');
      return Object.freeze({session: current, revision});
    },
    async assertCurrent(ticket) {
      await refresh();
      return assertCurrentNow(ticket);
    },
    assertCurrentNow,
    dispose() { disposed = true; current = undefined; revision++; subscription.dispose(); }
  };
}
module.exports = {createAuthentication, ownedProviderApi, scopes};
