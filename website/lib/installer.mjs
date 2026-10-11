// Native publication is independent of the three-asset kit release.
export function validateInstallerManifest(manifest, kit) {
  if (!manifest) return null;
  const fail = message => { throw new Error(`Invalid Mac installer: ${message}`); };
  const keys = (value, allowed) => {
    if (!value || Object.keys(value).some(key => !allowed.includes(key))) fail('unexpected manifest fields');
  };
  keys(manifest, ['schema', 'kitVersion', 'publication', 'sourceRevision', 'kit', 'asset', 'signing', 'notarizationSubmissionId']);
  keys(manifest.publication, ['status', 'repository', 'tag']);
  keys(manifest.asset, ['filename', 'platform', 'architectures', 'minimumOS', 'size', 'sha256', 'url']);
  keys(manifest.kit, ['filename', 'size', 'sha256']);
  keys(manifest.signing, ['identitySha1', 'teamIdentifier']);
  if (manifest.schema !== 1 || manifest.kitVersion !== kit.kitVersion) fail('version/schema differs from kit');
  if (!['local', 'published'].includes(manifest.publication?.status) || manifest.publication.repository !== 'codepetca/zero' || manifest.publication.tag !== `setup-v${kit.kitVersion}`) fail('publication metadata');
  const asset = manifest.asset;
  if (asset?.filename !== `Zero-Setup-${kit.kitVersion}-macos.dmg` || asset.platform !== 'macos' || asset.minimumOS !== '12.0' || JSON.stringify(asset.architectures) !== JSON.stringify(['arm64', 'x86_64'])) fail('only the universal Mac DMG is supported');
  for (const item of [asset, manifest.kit]) {
    if (!Number.isSafeInteger(item?.size) || item.size <= 0 || item.size > 128 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(item.sha256 || '')) fail('measured bounded size/digest required');
  }
  if (manifest.kit.filename !== kit.assets.kit.filename || !/^[a-f0-9]{40}$/.test(manifest.sourceRevision || '')) fail('source/kit provenance');
  if (!/^[A-F0-9]{40}$/.test(manifest.signing?.identitySha1 || '') || !/^[A-Z0-9]{10}$/.test(manifest.signing?.teamIdentifier || '') || !/^[a-f0-9-]{36}$/.test(manifest.notarizationSubmissionId || '')) fail('signer/notarization provenance');
  if (manifest.publication.status === 'local' && asset.url !== undefined) fail('local asset must not have a public URL');
  if (manifest.publication.status === 'published' && asset.url !== `https://github.com/codepetca/zero/releases/download/setup-v${kit.kitVersion}/${asset.filename}`) fail('explicit exact versioned GitHub URL required');
  return manifest;
}
export function installerHref(manifest, local = false) {
  if (!manifest) return null;
  if (manifest.publication.status === 'published') return manifest.asset.url;
  return local ? '/download/installer' : null;
}
export function landingDownloadHref(kitHref, manifest, local = false) {
  return installerHref(manifest, local) ? '/learn#downloads' : kitHref;
}
export function localDownloadsAllowed(env) {
  return env.ZERO_LOCAL_DOWNLOADS === '1' && !env.VERCEL;
}
