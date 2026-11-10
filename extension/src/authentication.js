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
function ownedProviderApi(provider, binding) {
  return {
    // This path is private to Zero's captured operation. Normal host/provider
    // lookups retain full remote identity validation.
    async getSessionForOperation(providerId, requestedScopes, expected, options = {}) {
      if (providerId !== 'zero-github') throw new Error('Unsupported authentication provider');
      if (!provider?.getSessionsForOperation) return this.getSession(providerId, requestedScopes, options);
      await binding?.assertBinding(expected?.account?.id);
      const sessions = await provider.getSessionsForOperation(expected, requestedScopes, options.account ? {account:options.account} : undefined);
      for (const session of sessions) await binding?.assertBinding(session.account.id);
      if (sessions.length > 1) throw new Error('Zero requires a single GitHub account');
      return sessions[0];
    },
    async getSession(providerId, requestedScopes, options = {}) {
      if (providerId !== 'zero-github') throw new Error('Unsupported authentication provider');
      if (!provider) return undefined;
      await binding?.assertBinding();
      let sessions;
      try {
        sessions = await provider.getSessions(requestedScopes, options.account ? {account:options.account} : undefined);
        for (const session of sessions) await binding?.assertBinding(session.account.id);
      } catch (error) {
        if (error.code !== 'workos-identity-binding' || options.silent || !options.createIfNone) throw error;
        sessions = [];
      }
      if (sessions.length > 1) throw new Error('Zero requires a single GitHub account');
      if (sessions.length || options.silent || !options.createIfNone) return sessions[0];
      const created = await provider.createSession(requestedScopes);
      await binding?.assertBinding(created.account.id);
      return created;
    },
    onDidChangeSessions(listener) {
      return provider ? provider.onDidChangeSessions(() => listener({provider:{id:'zero-github'}})) : {dispose(){}};
    }
  };
}
function createAuthentication(api, onChange = () => {}, requestedScopes = scopes, preferredAccount, providerId = 'zero-github', binding) {
  const sessionScopes = Object.freeze([...requestedScopes]);
  // Supported native account hint; callers still enforce the captured account.
  const account = preferredAccount && Object.freeze({id:preferredAccount.id,label:preferredAccount.label});
  let current, revision = 0, disposed = false, unavailable = false, pendingRequests = 0, lastError;
  const verifiedSessions = new WeakMap();
  let queue = Promise.resolve();
  function request(options, expected) {
    pendingRequests++;
    const next = queue.then(async () => {
      if (disposed) return;
      let session;
      try {
        const lookupOptions = account ? {...options,account} : options;
        const source = expected && api.getSessionForOperation
          ? await api.getSessionForOperation(providerId, sessionScopes, expected, lookupOptions)
          : await api.getSession(providerId, sessionScopes, lookupOptions);
        session = snapshot(source);
        if (session) verifiedSessions.set(session, source);
        unavailable = false; lastError = undefined;
      }
      catch (error) { unavailable = true; lastError = error; }
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
      if (binding && !await binding.ensureBinding()) throw new Error('Connect Zero with GitHub to verify your account before using GitHub.');
      const session = await request({createIfNone: true, ...(changeAccount ? {clearSessionPreference: true} : {})});
      if (!session && lastError?.code === 'workos-identity-binding') throw lastError;
      if (!session) throw new Error(unavailable ? 'GitHub sign-in was cancelled or unavailable. Use Sign in to GitHub to try again. Local running still works.' : 'Sign in to GitHub to upload. Local running still works.');
    },
    get status() { return current ? `Signed in as ${current.label}` : unavailable ? 'GitHub sign-in unavailable. Try Sign in to GitHub; local running still works.' : 'Not signed in'; },
    get signedIn() { return Boolean(current); },
    get sessionId() { return current?.id; },
    get revision() { return revision; },
    get accountId() { return current?.accountId; },
    get accountLabel() { return current?.label; },
    async capture() {
      await refresh();
      if (!current) throw (lastError?.code === 'workos-identity-binding' ? lastError : new Error('Sign in to GitHub before a live upload. Local running and simulation still work.'));
      return Object.freeze({session: current, revision});
    },
    async assertCurrent(ticket) {
      assertCurrentNow(ticket);
      await request({silent:true}, verifiedSessions.get(ticket.session));
      return assertCurrentNow(ticket);
    },
    assertCurrentNow,
    invalidate() { revision++; current = undefined; onChange(); },
    dispose() { disposed = true; current = undefined; revision++; subscription.dispose(); }
  };
}
module.exports = {createAuthentication, ownedProviderApi, scopes};
