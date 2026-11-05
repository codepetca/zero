import {ID, LIMITS, SHA, validateState} from './schema.mjs';
import {projectVisibility} from './project-visibility.mjs';

export const LEGACY_AUDIT_LIMITS = Object.freeze({
  events: LIMITS.events, eventBytes: LIMITS.stateBytes,
  snapshotBytes: 16 * 1024 * 1024, nodes: 100_000, depth: 32
});

const invalid = () => ({schema:1,status:'invalid',classification:'invalid-or-incomplete-snapshot',
  action:'Inspect a complete local snapshot; keep visibility blocked.'});

// Bound plain JSON before schema validation/stringification. Accessors, custom
// prototypes, cycles and oversized structures must not become an audit result.
function jsonBytes(value, maxBytes) {
  const pending = [[value,0]], seen = new Set();
  let nodes = 0, stringBytes = 0;
  while (pending.length) {
    const [item,depth] = pending.pop();
    if (++nodes > LEGACY_AUDIT_LIMITS.nodes || depth > LEGACY_AUDIT_LIMITS.depth) throw Error();
    if (typeof item === 'string') {
      stringBytes += Buffer.byteLength(item);
      if (stringBytes > maxBytes) throw Error();
    } else if (item && typeof item === 'object') {
      if (seen.has(item)) throw Error();
      seen.add(item);
      const array = Array.isArray(item);
      if (array ? Object.getPrototypeOf(item) !== Array.prototype :
          ![Object.prototype,null].includes(Object.getPrototypeOf(item))) throw Error();
      const keys = Reflect.ownKeys(item);
      // Sparse arrays can serialize into arbitrarily large strings despite
      // having few own keys. Reject holes, extra properties and subclasses.
      if (array && (item.length > LEGACY_AUDIT_LIMITS.nodes || keys.length !== item.length + 1 ||
          keys.some(key => key !== 'length' && (typeof key !== 'string' ||
            !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length)))) throw Error();
      if (keys.length + nodes + pending.length > LEGACY_AUDIT_LIMITS.nodes) throw Error();
      for (const key of keys) {
        if (Array.isArray(item) && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(item,key);
        if (typeof key !== 'string' || !descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) throw Error();
        stringBytes += Buffer.byteLength(key);
        if (stringBytes > maxBytes) throw Error();
        pending.push([descriptor.value,depth+1]);
      }
    } else if (item !== null && typeof item !== 'boolean' &&
        !(typeof item === 'number' && Number.isFinite(item))) throw Error();
  }
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > maxBytes) throw Error();
  return bytes;
}

/** Offline inventory only. The caller supplies an already pinned atomic snapshot
 * ({revision, ids, read(id)->{state}}) and explicit epoch milliseconds. This module
 * acquires no snapshot, credentials or network transport and never writes state.
 * A supplied read function is trusted to read that snapshot without side effects.
 * Results contain only event IDs/counts and fixed operational classifications;
 * they establish neither freshness nor permission to migrate or relax a hold. */
export async function auditLegacyRegistry(snapshot, now) {
  try {
    if (!snapshot || typeof snapshot.revision !== 'string' || !SHA.test(snapshot.revision) ||
        !Array.isArray(snapshot.ids) || snapshot.ids.length > LEGACY_AUDIT_LIMITS.events ||
        typeof snapshot.read !== 'function' || !Number.isSafeInteger(now) || now < 0) return invalid();
    const revision = snapshot.revision, ids = [...snapshot.ids];
    if (ids.some(id => typeof id !== 'string' || !ID.test(id)) || new Set(ids).size !== ids.length) return invalid();
    const events = [];
    let bytes = 0, missingBindings = 0, blockedEvents = 0;
    for (const id of ids) {
      const result = await snapshot.read(id);
      bytes += jsonBytes(result?.state, LEGACY_AUDIT_LIMITS.eventBytes);
      if (bytes > LEGACY_AUDIT_LIMITS.snapshotBytes) return invalid();
      const state = validateState(result.state,id,LIMITS,{enforceReserve:false});
      const missing = Object.values(state.registrations).filter(item => !item.repository).length;
      const reveal = state.accepted?.manifest.schedule.galleryRevealAt;
      const beforeReveal = !!reveal && now < Date.parse(reveal);
      // Reuse the actual authority check to reject other schema-valid problems
      // (including coerced numeric IDs). At the known compatibility boundary,
      // checking at reveal removes only the missing pre-reveal binding rule.
      const checkTime = beforeReveal && missing ? Date.parse(reveal) : now;
      await projectVisibility({revision,ids:[id],read:async()=>({state})},checkTime);
      const blocked = beforeReveal && missing > 0;
      blockedEvents += Number(blocked); missingBindings += missing;
      events.push({eventId:id,hosting:state.hosting === 'zero' ? 'zero' : 'creator',
        missingRepositoryBindings:missing,
        classification:blocked ? 'pre-reveal-recovery-required' : missing ? 'historical-unbound' : 'no-unbound-registrations',
        action:blocked ? 'Design reviewed owner-only recovery or an authorized migration; preserve the visibility hold.' :
          missing ? 'No current missing-binding visibility block; retain for migration review.' : 'No missing-binding recovery identified.'});
    }
    return {schema:1,status:blockedEvents ? 'blocked' : 'clear',
      summary:{eventCount:ids.length,blockedEventCount:blockedEvents,missingRepositoryBindings:missingBindings},events};
  } catch { return invalid(); }
}

/** Explicit local JSON fixture: {schema:1, revision:<40-char SHA>,
 * events:{<event-id>:<state>}}. No file paths, URLs, environment or live store
 * configuration are accepted. Parse an explicitly chosen local file externally. */
export async function auditLegacyRegistryFixture(fixture, now) {
  try {
    jsonBytes(fixture, LEGACY_AUDIT_LIMITS.snapshotBytes);
    if (!fixture || Array.isArray(fixture) || fixture.schema !== 1 ||
        Object.keys(fixture).sort().join(',') !== 'events,revision,schema' ||
        !fixture.events || Array.isArray(fixture.events) || typeof fixture.events !== 'object') return invalid();
    const records = structuredClone(fixture.events);
    return auditLegacyRegistry({revision:fixture.revision,ids:Object.keys(records),
      read:async id=>({state:records[id]})},now);
  } catch { return invalid(); }
}
