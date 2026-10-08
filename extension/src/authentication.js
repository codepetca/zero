'use strict';

// VS Code owns the session and its storage. Zero only keeps an in-memory copy.
const scopes = Object.freeze(['repo']);
const changedMessage = 'Your GitHub account or sign-in changed. Sign in and review the upload again. A local commit may already be saved.';
function snapshot(session) {
  return session && Object.freeze({id: session.id, accountId: session.account.id, label: session.account.label, accessToken: session.accessToken});
}
function same(a, b) {
  return a?.id === b?.id && a?.accountId === b?.accountId && a?.accessToken === b?.accessToken;
}
function createAuthentication(api, onChange = () => {}) {
  let current, revision = 0, disposed = false, unavailable = false;
  let queue = Promise.resolve();
  function request(options) {
    const next = queue.then(async () => {
      if (disposed) return;
      let session;
      try { session = snapshot(await api.getSession('github', scopes, options)); unavailable = false; }
      catch { unavailable = true; }
      if (disposed) return;
      if (!same(current, session)) revision++;
      current = session; onChange();
      return current;
    });
    queue = next.catch(() => {});
    return next;
  }
  const refresh = () => request({silent: true});
  function assertCurrentNow(ticket) {
    if (disposed || ticket.revision !== revision || !current || !same(ticket.session, current)) throw new Error(changedMessage);
    return current;
  }
  const subscription = api.onDidChangeSessions(event => {
    if (event.provider.id !== 'github' || disposed) return;
    // Invalidate a pending review immediately, before asynchronous refresh.
    revision++; current = undefined; onChange();
    void refresh();
  });
  return {
    refresh,
    async signIn(changeAccount = false) {
      const session = await request({createIfNone: true, ...(changeAccount ? {clearSessionPreference: true} : {})});
      if (!session) throw new Error(unavailable ? 'GitHub sign-in was cancelled or unavailable. Use Sign in to GitHub to try again. Local running still works.' : 'Sign in to GitHub to upload. Local running still works.');
    },
    get status() { return current ? `Signed in as ${current.label}` : unavailable ? 'GitHub sign-in unavailable. Try Sign in to GitHub; local running still works.' : 'Not signed in'; },
    get signedIn() { return Boolean(current); },
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
module.exports = {createAuthentication, scopes};
