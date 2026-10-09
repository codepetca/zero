export const assetKeys = ['kit', 'starter', 'extension', 'components'];
export function validateManifest(manifest) {
  if (manifest.schema !== 1 || !/^\d+\.\d+\.\d+$/.test(manifest.kitVersion) || !/^\d+\.\d+\.\d+$/.test(manifest.coreVersion)) throw new Error('Invalid release version/schema.');
  if (!['local', 'published'].includes(manifest.publication?.status) || manifest.publication.repository !== 'codepetca/zero' || manifest.publication.tag !== `v${manifest.kitVersion}`) throw new Error('Invalid release publication metadata.');
  for (const key of assetKeys) {
    const asset = manifest.assets?.[key];
    if (!asset || !/^[a-zA-Z0-9][a-zA-Z0-9._-]+\.(zip|vsix)$/.test(asset.filename) || typeof asset.label !== 'string') throw new Error(`Invalid ${key} release asset.`);
    if (manifest.publication.status === 'published') {
      const expected = `https://github.com/codepetca/zero/releases/download/v${manifest.kitVersion}/${asset.filename}`;
      if (asset.url !== expected || !/^[a-f0-9]{64}$/.test(asset.sha256 || '') || !Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error(`Published ${key} requires an explicit versioned URL and verified digest/size.`);
    }
  }
  return manifest;
}
