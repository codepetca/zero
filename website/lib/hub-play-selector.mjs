// Used by both the gallery and the server. Valid syntax identifies a requested
// publication. Its availability and visibility are decided by the server.
export function parseProjectPlayRef(value) {
  if (typeof value !== 'string' || value.length > 220) return null;
  const parts = value.split('.');
  const [version, lane, id, digest, runId] = parts;
  if (parts.length !== (lane === 'listing' ? 5 : 4) || version !== '1' || !['maintained','release','listing'].includes(lane) ||
      !/^[a-z0-9][a-z0-9-]{0,127}(?![\s\S])/.test(id) || digest.length !== 64 || /[^a-f0-9]/.test(digest) ||
      lane === 'listing' && (!/^[1-9][0-9]{0,19}$/.test(id) ||
        !/^[1-9][0-9]{0,18}(?![\s\S])/.test(runId) || BigInt(runId) > 9223372036854775807n)) return null;
  return {lane,id,runId};
}
