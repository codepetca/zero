'use strict';

// Experimental opt-in bridge to the built-in Git extension, never the host's
// GitHub/OAuth provider. The Git API supplies a host, not a repository or action:
// this intentionally grants broader authority than Zero's guarded transport.
// VS Code Askpass caches a returned password for up to 60 seconds. Unregistering
// stops new requests but cannot erase that cache or revoke an in-flight command.
// terminalAuthentication=false prevents new terminal injection; existing
// terminals may retain their environment. Test only in a fresh isolated profile.
// Ambient Git helpers and other extensions can take precedence; this API cannot
// enumerate them or guarantee the identity used by every native Git command.

function githubHTTPSHost(host) {
  return Boolean(host && host.scheme === 'https' && typeof host.authority === 'string'
    && /^github\.com$/i.test(host.authority) && !host.query && !host.fragment
    && (host.path === undefined || typeof host.path === 'string' && !/[\x00-\x20\x7f]/.test(host.path)));
}

function createNativeGitAuthentication({vscode, authentication, getGitAPI, onChange = () => {}}) {
  const workspace = vscode.workspace;
  const loadGitAPI = getGitAPI || (async () => {
    const extension = vscode.extensions?.getExtension('vscode.git');
    if (!extension) return;
    const exports = extension.isActive ? extension.exports : await extension.activate();
    return exports?.getAPI?.(1);
  });
  let disposed = false, generation = 0, registration, pending, identity;
  let status = Object.freeze({phase:'disabled', message:'Native Git with Zero sign-in is off.'});
  function publish(phase, message) {
    if (status.phase === phase && status.message === message) return;
    status = Object.freeze({phase, message});
    onChange(status);
  }
  function policy() {
    // A repository setting must never grant access to the owner's credentials.
    const zero = workspace.getConfiguration('zero', null);
    if (zero.inspect?.('nativeGitAuthentication')?.globalValue !== true)
      return ['disabled', 'Native Git with Zero sign-in is off. Enable Zero: Native Git Authentication in User Settings to try the prototype.'];
    if (workspace.isTrusted !== true)
      return ['blocked', 'Native Git with Zero sign-in requires a trusted workspace.'];
    const git = workspace.getConfiguration('git', null);
    if (git.get('enabled', true) !== true)
      return ['blocked', 'Enable Git in this profile to use native Git with Zero sign-in.'];
    if (git.get('useIntegratedAskPass', true) !== true)
      return ['blocked', 'Enable Git: Use Integrated Ask Pass in this profile to use native Git with Zero sign-in.'];
    if (git.get('terminalAuthentication', true) !== false)
      return ['blocked', 'Turn off Git: Terminal Authentication, then start a fresh isolated VS Code window before trying native Git with Zero sign-in.'];
    if (workspace.getConfiguration('github', null).get('gitAuthentication', true) !== false)
      return ['blocked', 'Turn off GitHub: Git Authentication in this profile so the built-in GitHub provider does not compete with Zero sign-in.'];
    if (!authentication.signedIn)
      return ['signed-out', 'Sign in to GitHub in Zero before using native Git with Zero sign-in.'];
    return undefined;
  }
  const accountIdentity = () => JSON.stringify([authentication.sessionId, authentication.accountId]);
  function invalidate() {
    generation++;
    registration?.dispose();
    registration = undefined;
    pending = undefined;
    identity = undefined;
  }
  function current(epoch, account) {
    return !disposed && epoch === generation && !policy() && account === accountIdentity();
  }
  function createProvider(epoch, account) {
    return {
      async getCredentials(host) {
        if (!githubHTTPSHost(host) || !current(epoch, account)) return;
        try {
          // capture performs one silent existing-session read, including renewal;
          // the synchronous guard then closes sign-out/account-change races.
          const ticket = await authentication.capture();
          if (!current(epoch, account)) return;
          const session = authentication.assertCurrentNow(ticket);
          const username = session.accountId, password = session.accessToken;
          if (typeof username !== 'string' || !username || /[\x00-\x20\x7f]/.test(username)
            || typeof password !== 'string' || !password || /[\x00-\x20\x7f]/.test(password)) return;
          return {username, password};
        } catch {
          // Provider errors may contain secrets. Never forward or log them.
          if (current(epoch, account)) publish('unavailable', 'Zero sign-in is unavailable for native Git. Check your Zero GitHub account and try again.');
        }
      }
    };
  }
  function refresh() {
    if (disposed) return Promise.resolve();
    const blocked = policy();
    if (blocked) {
      invalidate();
      publish(...blocked);
      return Promise.resolve();
    }
    const account = accountIdentity();
    if (identity === account && (registration || pending)) return pending || Promise.resolve();
    invalidate();
    identity = account;
    const epoch = generation;
    publish('starting', 'Starting native Git with Zero sign-in.');
    const operation = Promise.resolve().then(loadGitAPI).then(api => {
      if (!current(epoch, account)) return;
      if (typeof api?.registerCredentialsProvider !== 'function') {
        publish('unavailable', 'The built-in Git extension does not provide the credentials API required by this prototype.');
        return;
      }
      const disposable = api.registerCredentialsProvider(createProvider(epoch, account));
      // A test or future implementation may report a lifecycle change during
      // registration. Never retain a provider registered under stale authority.
      if (!current(epoch, account)) {disposable.dispose();return;}
      registration = disposable;
      publish('ready', 'Native Git can use Zero sign-in for HTTPS github.com in this trusted window. Other Git credential helpers may take precedence. Sign-out stops new requests; Git may retain a returned credential for up to 60 seconds.');
    }).catch(() => {
      if (current(epoch, account)) publish('unavailable', 'Native Git with Zero sign-in could not start. Check that the built-in Git extension is enabled.');
    }).finally(() => {if (pending === operation) pending = undefined;});
    pending = operation;
    return operation;
  }
  const subscriptions = [];
  if (workspace.onDidChangeConfiguration) subscriptions.push(workspace.onDidChangeConfiguration(event => {
    if (['zero.nativeGitAuthentication', 'git', 'github.gitAuthentication'].some(key => event.affectsConfiguration(key))) void refresh();
  }));
  if (workspace.onDidGrantWorkspaceTrust) subscriptions.push(workspace.onDidGrantWorkspaceTrust(() => {void refresh();}));
  // The owner calls refresh from authentication's change callback. Trust
  // revocation normally reloads VS Code; every credential request also rechecks.
  return {
    refresh,
    get status() {return status;},
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      for (const subscription of subscriptions) subscription.dispose();
      publish('disabled', 'Native Git with Zero sign-in is off. Git may retain a previously returned credential for up to 60 seconds.');
    }
  };
}

module.exports = {createNativeGitAuthentication, githubHTTPSHost};
