const { HOST, listenLoopback, reply, requestUrl } = require("./loopback.cjs");
const { ATTEMPT_MS, accountFromUser, callbackResult } = require("./workos.cjs");

const CALLBACK = "/vscode/callback";
const STORAGE_KEY = "zero.workos.local-account.v1";

async function receiveCode(workos, openBrowser, signal, timeoutMs) {
  const deadline = AbortSignal.timeout(timeoutMs);
  const active = signal ? AbortSignal.any([deadline, signal]) : deadline;
  active.throwIfAborted();

  let origin;
  let attempt;
  let handled = false;
  let accept;
  const received = new Promise((resolve) => { accept = resolve; });
  let onAbort;
  const stopped = new Promise((resolve) => { onAbort = () => resolve(null); });
  active.addEventListener("abort", onAbort, { once: true });

  try {
    const server = await listenLoopback(0, (request, response) => {
      const url = requestUrl(request, origin);
      if (!url || request.method !== "GET" || url.pathname !== CALLBACK) {
        return reply(response, 404, "Page unavailable.");
      }
      const result = !active.aborted && !handled && callbackResult(url.searchParams, attempt.state);
      if (!result) return reply(response, 400, "This sign-in attempt is invalid or expired.");

      handled = true;
      reply(response, result.code ? 200 : 400, result.code
        ? "Return to VS Code to see whether sign-in completed."
        : "GitHub sign-in did not complete. Return to VS Code to try again.");
      accept(result.code);
    });

    try {
      origin = `http://${HOST}:${server.address().port}`;
      attempt = workos.begin(`${origin}${CALLBACK}`);
      active.throwIfAborted();
      const opened = await Promise.race([openBrowser(attempt.url), stopped]);
      active.throwIfAborted();
      if (!opened) throw new Error("The sign-in browser could not be opened.");
      const code = await Promise.race([received, stopped]);
      active.throwIfAborted();
      if (!code) throw new Error("GitHub sign-in was declined or failed.");
      return { code, verifier: attempt.verifier };
    } finally {
      server.close();
    }
  } finally {
    active.removeEventListener("abort", onAbort);
  }
}

function createDesktopAccounts({ secrets, clientId, workos, openBrowser, withLock, timeoutMs = ATTEMPT_MS }) {
  let changingAccount = false;

  return {
    async read() {
      const stored = await secrets.get(STORAGE_KEY);
      if (!stored) return null;
      try {
        const record = JSON.parse(stored);
        if (record.version !== 1 || (clientId && clientId !== record.clientId)) return null;
        const account = accountFromUser(record);
        if (record.githubId !== undefined && (typeof record.githubId !== 'string' || !/^[1-9]\d*$/.test(record.githubId))) return null;
        return record.githubId ? {...account, githubId:record.githubId} : account;
      } catch {
        return null;
      }
    },

    async signIn(signal) {
      if (!workos) throw new Error("Set ZERO_WORKOS_CLIENT_ID to the WorkOS staging client ID.");
      if (changingAccount) throw new Error("An account change is already in progress.");
      changingAccount = true;
      try {
        if (!withLock) throw new Error('Zero connection storage is unavailable.');
        const baseline = await secrets.get(STORAGE_KEY);
        signal?.throwIfAborted();
        const { code, verifier } = await receiveCode(workos, openBrowser, signal, timeoutMs);
        signal?.throwIfAborted();
        const account = await workos.complete(code, verifier, signal);
        signal?.throwIfAborted();
        if (!/^[1-9]\d*$/.test(account.githubId || '')) throw new Error('GitHub identity proof is missing.');
        await withLock(async () => {
          signal?.throwIfAborted();
          if (await secrets.get(STORAGE_KEY) !== baseline) throw new Error('The Zero connection changed. Try sign-in again.');
          const previous = await this.read();
          if (previous && previous.id !== account.id) throw new Error('Connect the same Zero account to upgrade this sign-in.');
          signal?.throwIfAborted();
          await secrets.store(STORAGE_KEY, JSON.stringify({
            version: 1,
            clientId: workos.clientId,
            id: account.id,
            githubId: account.githubId,
          }));
        }, signal);
        return account;
      } finally {
        changingAccount = false;
      }
    },

    async signOut() {
      if (changingAccount) throw new Error("Finish or cancel sign-in first.");
      changingAccount = true;
      try {
        if (!withLock) throw new Error('Zero connection storage is unavailable.');
        const baseline = await secrets.get(STORAGE_KEY);
        await withLock(async () => {
          if (await secrets.get(STORAGE_KEY) !== baseline) throw new Error('The Zero connection changed. Try sign-out again.');
          await secrets.delete(STORAGE_KEY);
        });
      } finally {
        changingAccount = false;
      }
    },
  };
}

module.exports = { createDesktopAccounts, STORAGE_KEY };
