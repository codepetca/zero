import {POLICY} from './artifacts.mjs';

export const REQUIRED_GATES = Object.freeze(['bundle','fixed-build','api','behavior','first','second']);
const hexDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

// This validates a trusted worker's persisted report, never a client receipt.
// A failed run may include only the gates reached before its first failure.
export function validReport(result,sourceDigest,policyDigest) {
  if (!result || result.policy !== POLICY || result.sourceDigest !== sourceDigest || !hexDigest(policyDigest) || result.policyDigest !== policyDigest || typeof result.passed !== 'boolean') return false;
  if (!Array.isArray(result.checks) || !result.checks.length || result.checks.length > 100) return false;
  if (!result.checks.every(check => check && typeof check === 'object' && !Array.isArray(check) && Object.keys(check).sort().join(',') === 'detail,id,passed' && /^[a-z0-9-]{1,80}$/.test(check.id) && typeof check.passed === 'boolean' && typeof check.detail === 'string' && check.detail.length <= 4096)) return false;
  const ids = new Set(result.checks.map(check => check.id));
  if (ids.size !== result.checks.length) return false;
  if (!Array.isArray(result.platforms) || !result.platforms.length || !result.platforms.every(platform => /^linux-[a-z0-9_]+$/.test(platform))) return false;
  if (!result.passed) return true;
  return result.checks.length === REQUIRED_GATES.length && REQUIRED_GATES.every(id => ids.has(id)) && result.checks.every(check => check.passed);
}
