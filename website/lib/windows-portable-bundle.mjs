// Only link a separately published, versioned bundle with verified metadata.
export function windowsPortableBundleHref(manifest, publishedKit) {
  const { kitVersion, sourceRevision, kitSourceRevision, kitSha256, publication, asset } = manifest ?? {};
  if (typeof kitVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(kitVersion) ||
      !/^[a-f0-9]{40}$/.test(sourceRevision ?? '') || !/^[a-f0-9]{40}$/.test(kitSourceRevision ?? '') ||
      !/^[a-f0-9]{64}$/.test(kitSha256 ?? '')) {
    throw new Error('Invalid Windows portable bundle metadata');
  }
  if (publishedKit) {
    if (!/^\d+\.\d+\.\d+$/.test(publishedKit.kitVersion ?? '')) throw new Error('Invalid published kit version');
    const current = publishedKit.kitVersion.split('.').map(BigInt);
    const candidate = kitVersion.split('.').map(BigInt);
    const differing = current?.findIndex((part, index) => part !== candidate[index]);
    if (publishedKit.publication?.status !== 'published' ||
        !current || current.length !== 3 ||
        (differing !== -1 && candidate[differing] > current[differing]) ||
        (publishedKit.kitVersion === kitVersion && publishedKit.assets?.kit?.sha256 !== kitSha256)) {
      throw new Error('Windows portable bundle does not match the published kit');
    }
  }
  const tag = `windows-portable-bundled-v${kitVersion}`;
  const filename = `Zero-${kitVersion}-windows-portable-bundled-x64.zip`;
  const url = `https://github.com/codepetca/zero/releases/download/${tag}/${filename}`;
  if (publication?.status !== 'published' || publication.tag !== tag || asset?.filename !== filename ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 2 * 1024 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(asset.sha256 ?? '') || asset.url !== url) {
    throw new Error('Invalid Windows portable bundle release metadata');
  }
  return url;
}
