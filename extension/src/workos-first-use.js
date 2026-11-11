'use strict';

const {createDesktopAccounts} = require('./desktop.cjs');
const {createWorkOS} = require('./workos.cjs');
const {isWorkOSClientId} = require('./workos-configuration');
const {createCredentialLock} = require('./github-app/credential-store');

// This local receipt is not a GitHub credential or a cloud authorization.
function createWorkOSFirstUse({vscode, context, required, clientId, accounts: injectedAccounts}) {
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
      upgrade ? 'Connect the same Zero account again to verify your GitHub account for online features.' : 'Connect Zero with GitHub to get started. After connecting, you can use this editor offline.',
      {modal:true}, 'Continue with GitHub');
    if (choice !== 'Continue with GitHub' || lifetime.signal.aborted) return false;
    const result = await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,
      title:'Waiting for GitHub sign-in', cancellable:true}, async (_progress, token) => {
      const cancelled = new AbortController();
      const subscription = token.onCancellationRequested(() => cancelled.abort());
      if (token.isCancellationRequested) cancelled.abort();
      const signal = AbortSignal.any([cancelled.signal, lifetime.signal]);
      try {
        await accounts.signIn(signal);
        return signal.aborted ? 'cancelled' : 'connected';
      } catch {
        return signal.aborted ? 'cancelled' : 'failed';
      } finally {subscription.dispose();}
    });
    if (lifetime.signal.aborted) return false;
    // A notification can stay open until dismissed. Release progress and allow
    // a retry independently of whether the user dismisses the warning.
    if (result === 'failed') void vscode.window.showWarningMessage(
      'GitHub sign-in did not complete. Check the connection and try again.').then(undefined, () => {});
    return result === 'connected';
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
