import {validateInstallerManifest} from './installer.mjs';

// Website download selection does not change native candidate verification.
export function validatePublishedInstaller(manifest, kit) {
  if (!manifest) return null;
  validateInstallerManifest(manifest, kit);
  if (manifest.publication.status !== 'published') throw new Error('Published installer snapshot must be published');
  return manifest;
}
export function availableInstaller(current, published, local = false) {
  if (current && (current.publication.status === 'published' || local)) return current;
  return published?.publication.status === 'published' ? published : null;
}
