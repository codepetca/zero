'use strict';

const {createDesktopAccounts} = require('./desktop.cjs');
const {createWorkOS} = require('./workos.cjs');
const {isWorkOSClientId} = require('./workos-configuration');
const {createCredentialLock} = require('./github-app/credential-store');

// This local receipt is not a GitHub credential or a cloud authorization.
function createWorkOSFirstUse({vscode, context, required, clientId, accounts: injectedAccounts, connectGitHub}) {
  if (!required) return {enabled:false, ensure:async () => true, dispose() {}};
  let lock;
  const withLock = (callback, signal) => {
    lock ||= createCredentialLock({globalStorageUri:context.globalStorageUri});
    return lock(callback, signal);
  };
  const accounts = isWorkOSClientId(clientId) ? injectedAccounts || createDesktopAccounts({
    secrets:context.secrets, clientId, workos:createWorkOS(clientId), withLock,
    openBrowser:url => vscode.env.openExternal(vscode.Uri.parse(url)),
  }) : null;
  const lifetime = new AbortController();
  let pending, upgradePending;
  async function connect(upgrade = false) {
    if (lifetime.signal.aborted) return false;
    if (!accounts) {
      await vscode.window.showWarningMessage('This copy of Zero is missing its sign-in setup. Contact Zero support.');
      return false;
    }
    const receipt = await accounts.read();
    if (receipt && (!upgrade || receipt.githubId)) return !lifetime.signal.aborted;
    if (lifetime.signal.aborted) return false;
    const choice = await vscode.window.showInformationMessage(
      upgrade ? 'Use the same GitHub account to sign in to Zero again.' : 'Use your GitHub account to sign in to Zero. You can work on local projects offline after signing in.',
      {modal:true}, 'Sign in to Zero');
    if (choice !== 'Sign in to Zero' || lifetime.signal.aborted) return false;
    const result = await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,
      title:'Signing in to Zero', cancellable:true}, async (_progress, token) => {
      const cancelled = new AbortController();
      const subscription = token.onCancellationRequested(() => cancelled.abort());
      if (token.isCancellationRequested) cancelled.abort();
      const signal = AbortSignal.any([cancelled.signal, lifetime.signal]);
      let attempted = false, saved = false;
      const authenticate = async active => {
        attempted = true;
        const grant = await accounts.signIn(active);
        saved = true;
        return grant;
      };
      try {
        if (connectGitHub) {
          try { await connectGitHub(authenticate, signal); }
          catch (error) {
            if (signal.aborted) return 'cancelled';
            if (saved) return 'local-only';
            if (attempted) throw error;
            await authenticate(signal);
            return 'local-only';
          }
        } else {
          await authenticate(signal);
        }
        return signal.aborted ? 'cancelled' : 'connected';
      } catch {
        return signal.aborted ? 'cancelled' : 'failed';
      } finally {subscription.dispose();}
    });
    if (lifetime.signal.aborted) return false;
    // A notification can stay open until dismissed. Release progress and allow
    // a retry independently of whether the user dismisses the warning.
    if (result === 'failed') void vscode.window.showWarningMessage(
      'Zero sign-in did not complete. Check the connection and try again.').then(undefined, () => {});
    if (result === 'local-only') void vscode.window.showWarningMessage(
      'Zero saved your account for local work. Sign in to Zero again to connect GitHub.').then(undefined, () => {});
    return result === 'connected' || (result === 'local-only' && !upgrade);
  }
  return {
    enabled:true,
    ensure() {
      if (!pending) {
        const upgrade = upgradePending;
        pending = (async () => {
          if (upgrade) {
            const receipt = await accounts?.read();
            if (receipt) return !lifetime.signal.aborted;
            return upgrade;
          }
          return connect();
        })().catch(async () => {
        if (!lifetime.signal.aborted) await vscode.window.showWarningMessage('Zero could not read its saved connection. Try again.');
        return false;
        }).finally(() => {pending = undefined;});
      }
      return pending;
    },
    ensureBinding() {
      if (!upgradePending) upgradePending = (async () => {
        if (pending && !await pending) return false;
        return connect(true);
      })().finally(() => {upgradePending = undefined;});
      return upgradePending;
    },
    async requestGitHubGrant(signal) {
      if (!accounts) throw new Error('This copy of Zero is missing its sign-in setup.');
      const active = signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal;
      active.throwIfAborted();
      return accounts.signIn(active);
    },
    async assertBinding(accountId) {
      const receipt = await accounts?.read();
      if (!receipt?.githubId || (accountId && receipt.githubId !== String(accountId))) {
        const error = new Error(!receipt?.githubId ? 'Connect Zero with GitHub again to verify your account before using GitHub. Local work still works.' : 'The GitHub account does not match the account connected to Zero. Sign in with the same GitHub account.');
        error.code = 'workos-identity-binding'; throw error;
      }
      return receipt;
    },
    dispose() {lifetime.abort();},
  };
}
module.exports = {createWorkOSFirstUse};
