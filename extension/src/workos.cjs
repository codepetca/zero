const { createHash, randomBytes, timingSafeEqual } = require("node:crypto");

const API = "https://api.workos.com/user_management";
const ATTEMPT_MS = 5 * 60 * 1000;

class ExchangeError extends Error {
  constructor(stage, status, code, format) {
    super("WorkOS rejected the sign-in.");
    this.stage = stage;
    this.status = status;
    this.code = ERROR_CODES.has(code) ? code : "unknown";
    this.format = format;
  }
}

// Only these fixed OAuth labels may leave the exchange. Provider messages and
// unknown codes can contain arbitrary data and must never reach diagnostics.
const ERROR_CODES = new Set([
  "access_denied", "invalid_client", "invalid_grant", "invalid_request",
  "unauthorized_client", "unsupported_grant_type",
  "email_verification_required", "mfa_enrollment", "mfa_challenge",
  "organization_selection_required", "sso_required", "organization_authentication_methods_required",
  "radar_email_challenge", "radar_sms_challenge",
]);
async function safeErrorCode(response) {
  // Header presence and JSON shape are clues, not proof of response origin.
  const headers = `request-id-${response.headers.has("x-request-id") ? "present" : "absent"} cf-ray-${response.headers.has("cf-ray") ? "present" : "absent"}`;
  const reader = response.body?.getReader();
  if (!reader) return { code: "unknown", format: `body-empty ${headers}` };
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) return { code: "unknown", format: `body-oversize ${headers}` };
      chunks.push(value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return { code: "unknown", format: `body-non-json ${headers}` }; }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { code: "unknown", format: `body-json-other ${headers}` };
    }
    const code = body?.error ?? body?.code;
    const fieldType = (value) => value === undefined ? "absent" : typeof value === "string" ? "string" : "other";
    return { code: typeof code === "string" && ERROR_CODES.has(code) ? code : "unknown",
      format: `body-json-object error-${fieldType(body.error)} code-${fieldType(body.code)} message-${fieldType(body.message)} ${headers}` };
  } catch {
    return { code: "unknown", format: `body-unreadable ${headers}` };
  } finally {
    void reader.cancel().catch(() => {});
  }
}

function randomKey() {
  return randomBytes(32).toString("base64url");
}

function matchesState(value, expected) {
  return typeof value === "string" && value.length === 43 && !/[^A-Za-z0-9_-]/.test(value)
    && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

function callbackResult(query, state) {
  const states = query.getAll("state");
  if (states.length !== 1 || !matchesState(states[0], state)) return null;

  const codes = query.getAll("code");
  if (query.has("error") || codes.length !== 1 || !codes[0] || codes[0].length > 4096) {
    return { code: null };
  }
  return { code: codes[0] };
}

function accountFromUser(user) {
  if (typeof user?.id !== "string" || !/^user_[A-Za-z0-9]{1,128}$/.test(user.id)) {
    throw new Error("WorkOS did not return a valid user ID.");
  }
  return { id: user.id };
}

function createWorkOS(clientId, fetchImpl = globalThis.fetch) {
  if (typeof clientId !== "string" || !/^client_[A-Za-z0-9]{1,128}$/.test(clientId)) {
    throw new Error("Set ZERO_WORKOS_CLIENT_ID to the WorkOS staging client ID.");
  }

  return {
    clientId,
    begin(redirectUri) {
      const state = randomKey();
      const verifier = randomKey();
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const url = new URL(`${API}/authorize`);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        // Hosted AuthKit handles verification and other authentication challenges.
        // Configure the staging AuthKit methods separately for GitHub-only testing.
        provider: "authkit",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      return { url: url.href, state, verifier };
    },
    async complete(code, verifier, signal) {
      const deadline = AbortSignal.timeout(15_000);
      let response;
      try {
        response = await fetchImpl(`${API}/authenticate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            grant_type: "authorization_code",
            code,
            code_verifier: verifier,
          }),
          redirect: "error",
          signal: signal ? AbortSignal.any([deadline, signal]) : deadline,
        });
      } catch {
        if (signal?.aborted) throw signal.reason;
        throw new ExchangeError("network");
      }
      if (!response.ok) {
        const diagnostic = await safeErrorCode(response);
        throw new ExchangeError("http", response.status, diagnostic.code, diagnostic.format);
      }

      // Trust the response from the fixed HTTPS exchange endpoint. A JWT or a
      // GitHub token is unnecessary here because the demo has no cloud API.
      let result;
      try { result = await response.json(); } catch { throw new ExchangeError("invalid-response"); }
      if (result?.impersonator
          || result?.authentication_method !== "GitHubOAuth") {
        throw new Error("WorkOS did not return a GitHub sign-in.");
      }
      const account = accountFromUser(result?.user);
      const token = result?.oauth_tokens?.access_token;
      if (typeof token !== 'string' || !token || /[\r\n\0]/.test(token)) throw new Error('WorkOS did not return GitHub identity proof.');
      let github;
      try {
        const response = await fetchImpl('https://api.github.com/user', {headers:{Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'}, redirect:'error', signal:signal ? AbortSignal.any([deadline,signal]) : deadline});
        if (!response.ok) throw new Error();
        github = await response.json();
      } catch { if (signal?.aborted) throw signal.reason; throw new Error('GitHub identity could not be verified.'); }
      if (github?.type !== 'User' || !Number.isSafeInteger(github.id) || github.id < 1) throw new Error('GitHub did not return a valid personal account.');
      return {...account, githubId:String(github.id)};
    },
  };
}

module.exports = { ATTEMPT_MS, ExchangeError, accountFromUser, callbackResult, createWorkOS, randomKey };
