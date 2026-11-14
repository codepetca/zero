// The pilot has its own versioned release asset and is independent of the
// regular kit, Windows installer and automatic updates.
export function windowsPortablePilotHref(pilot) {
  const { kitVersion, sourceRevision, asset, localAsset, publication } = pilot;
  if (!/^\d+\.\d+\.\d+$/.test(kitVersion) || !/^[a-f0-9]{40}$/.test(sourceRevision) ||
      localAsset?.filename !== `Zero-${kitVersion}-windows-portable-pilot-x64.zip` ||
      !Number.isSafeInteger(localAsset.size) || localAsset.size <= 0 || localAsset.size > 512 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(localAsset.sha256)) {
    throw new Error('Invalid Windows portable pilot metadata');
  }
  if (!publication) {
    if (asset !== undefined) throw new Error('A local Windows portable pilot cannot have a public URL');
    return null;
  }
  const tag = `windows-portable-pilot-v${kitVersion}`;
  if (asset?.filename !== `Zero-${kitVersion}-windows-portable-pilot-staging-x64.zip` ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 32 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(asset.sha256)) {
    throw new Error('Invalid public Windows portable pilot asset metadata');
  }
  const url = `https://github.com/codepetca/zero/releases/download/${tag}/${asset.filename}`;
  if (publication.status !== 'published' || publication.tag !== tag || asset.url !== url) {
    throw new Error('Invalid Windows portable pilot release URL');
  }
  return url;
}
