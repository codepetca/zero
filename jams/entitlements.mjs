// Server-only manual license configuration. Never import this into client code
// or accept this environment/configuration from a request. This is an operator
// grant, not billing/subscription verification. Provider env changes need a new
// deployment; existing instances retain their previous process environment.
const ACCOUNT = /^[1-9][0-9]{0,19}(?![\s\S])/;
function includesGrant(accountId, configured) {
  try {
    if (typeof configured !== 'string' || !configured.trim() || configured.length > 8192) return false;
    const ids = configured.split(',').map(value => value.trim());
    if (ids.length > 256 || ids.some(id => !ACCOUNT.test(id)) || new Set(ids).size !== ids.length) return false;
    return ids.includes(accountId);
  } catch { return false; }
}

export function hasManualJamPro(accountId, env = process.env) {
  try {
    if (typeof accountId !== 'string' || !ACCOUNT.test(accountId)) return false;
    return includesGrant(accountId, env?.ZERO_JAMS_PRO_GITHUB_IDS) ||
      includesGrant(accountId, env?.ZERO_JAMS_ADDITIONAL_PRO_GITHUB_IDS);
  } catch { return false; }
}
