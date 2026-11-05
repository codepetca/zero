// TEST ONLY: archived prior manual-approval reader from f8b1a7e3a5b64fa0b8165893bea556b298dba9ec.
// Original jams/project-visibility.mjs SHA-256: 18a14c572e4c70277016fa0c55accb19e40ca8b6787971c54b21115611cacef4
// Only relative import paths are adjusted; never use this reader in production.
import {ACCOUNT, ID, LIMITS, SHA, fail, validateState} from './prior-manual-schema.mjs';

/** Build a decision from one complete, trusted atomic store snapshot. The caller
 * must obtain a fresh snapshot and a trusted clock for each public response;
 * this function does not establish freshness or enforce any route/cache policy.
 * Any failure rejects the whole decision, so callers must deny discovery. */
export async function projectVisibility(snapshot, now) {
  try {
    if (!snapshot || !SHA.test(snapshot.revision || '') || !Array.isArray(snapshot.ids) ||
        snapshot.ids.length > LIMITS.events || typeof snapshot.read !== 'function' ||
        !Number.isSafeInteger(now) || now < 0) throw Error();
    const ids = [...snapshot.ids];
    if (ids.some(id => typeof id !== 'string' || !ID.test(id)) || new Set(ids).size !== ids.length) throw Error();
    const held = new Set();
    for (const id of ids) {
      const result = await snapshot.read(id);
      const state = validateState(result?.state, id, LIMITS, {enforceReserve:false});
      // The shared schema's regex checks coerce numbers to strings. Require
      // canonical string IDs before building a Set used with string lookups.
      const validRepositoryId = repository => {
        if (typeof repository?.id !== 'string' || !ACCOUNT.test(repository.id)) throw Error();
      };
      for (const proposal of state.proposals) if (state.hosting !== 'zero') validRepositoryId(proposal.repository);
      if (state.accepted) {if (state.hosting !== 'zero') validRepositoryId(state.accepted.repository);}
      else if (state.proposals.some(proposal => proposal.status === 'approved') ||
        Object.keys(state.registrations).length || Object.keys(state.entries).length) throw Error();
      for (const registration of Object.values(state.registrations)) {
        if (registration.repository) validRepositoryId(registration.repository);
      }
      for (const history of Object.values(state.entries)) {
        for (const entry of history) if (entry.repository) validRepositoryId(entry.repository);
      }
      const reveal = state.accepted?.manifest.schedule.galleryRevealAt;
      if (!reveal || now >= Date.parse(reveal)) continue;
      for (const registration of Object.values(state.registrations)) {
        // A showcase Join must bind a repository. Missing authority cannot be
        // interpreted as evidence that its project is safe to reveal.
        if (!registration.repository) throw Error();
        held.add(registration.repository.id);
      }
      for (const history of Object.values(state.entries)) {
        for (const entry of history) if (entry.repository) held.add(entry.repository.id);
      }
    }
    return Object.freeze({revision:snapshot.revision, observedAt:now, isHeld(repositoryId) {
      if (typeof repositoryId !== 'string' || !ACCOUNT.test(repositoryId)) fail(503,'Project visibility is unavailable.');
      return held.has(repositoryId);
    }});
  } catch {
    fail(503,'Project visibility is unavailable.');
  }
}
