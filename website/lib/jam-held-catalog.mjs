import contracts from '../../extension/src/sharing/contracts.js';

/** Project a validated catalog using a decision from a trusted, fresh Jam snapshot.
 * This does not obtain that snapshot or establish freshness; callers must fail
 * closed on errors and apply the projection to every public discovery surface. */
export function projectHeldCatalog(catalog, visibility) {
  try {
    if (!visibility || typeof visibility.revision !== 'string' ||
        !/^[a-f0-9]{40}$/.test(visibility.revision) || typeof visibility.isHeld !== 'function') throw Error();
    const checked = contracts.validateCatalog(catalog);
    const releases = checked.releases.filter(release => {
      const held = visibility.isHeld(release.repository.id);
      if (typeof held !== 'boolean') throw Error();
      return !held;
    });
    return {...checked, releases};
  } catch {
    throw new Error('Project visibility is unavailable.');
  }
}
