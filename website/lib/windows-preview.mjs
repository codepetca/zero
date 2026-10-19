import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error('Invalid Windows preview: unexpected or missing fields');
  }
}

// An unsigned download is separate from the signed installer and update feed.
export function validateWindowsPreview(manifest, kit) {
  if (manifest === null) return null;
  const keys = ['schema', 'kind', 'kitVersion', 'sourceRevision', 'publication', 'asset', 'authenticodeSigned', 'updaterEnabled', 'nativeWindowsTested'];
  if (Object.hasOwn(manifest, 'manualSetup')) keys.push('manualSetup');
  exactKeys(manifest, keys);
  exactKeys(manifest.publication, ['status', 'repository', 'tag']);
  exactKeys(manifest.asset, ['filename', 'platform', 'architectures', 'minimumOS', 'size', 'sha256', 'url']);
  const version = manifest.kitVersion;
  if (manifest.schema !== 1 || manifest.kind !== 'unsigned-preview' ||
      typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) ||
      typeof kit?.kitVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(kit.kitVersion)) {
    throw new Error('Invalid Windows preview: version/schema');
  }
  const candidate = version.split('.').map(BigInt), current = kit.kitVersion.split('.').map(BigInt);
  const differing = candidate.findIndex((part, index) => part !== current[index]);
  if (differing !== -1 && candidate[differing] > current[differing]) throw new Error('Invalid Windows preview: newer than current kit');
  const {publication, asset} = manifest;
  if (publication.status !== 'published' || publication.repository !== 'codepetca/zero' || publication.tag !== `windows-preview-v${version}` ||
      typeof manifest.sourceRevision !== 'string' || !/^[a-f0-9]{40}$/.test(manifest.sourceRevision) ||
      manifest.authenticodeSigned !== false || manifest.updaterEnabled !== false || manifest.nativeWindowsTested !== false) {
    throw new Error('Invalid Windows preview: published unsigned build with updates disabled required');
  }
  if (asset.filename !== `Zero-Setup-${version}-windows-development.exe` || asset.platform !== 'windows' ||
      JSON.stringify(asset.architectures) !== '["x64"]' || asset.minimumOS !== '10.0.19041' ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 256 * 1024 * 1024 ||
      typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      asset.url !== `https://github.com/codepetca/zero/releases/download/${publication.tag}/${asset.filename}`) {
    throw new Error('Invalid Windows preview: exact measured Windows x64 asset required');
  }
  if (manifest.manualSetup) {
    const manual = manifest.manualSetup;
    exactKeys(manual, ['filename', 'size', 'sha256', 'url']);
    if (manual.filename !== 'zero-bootstrap.zip' || !Number.isSafeInteger(manual.size) || manual.size <= 0 || manual.size > 256 * 1024 * 1024 ||
        typeof manual.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manual.sha256) ||
        manual.url !== `https://github.com/codepetca/zero/releases/download/windows-manual-v${version}/zero-bootstrap.zip`) {
      throw new Error('Invalid Windows preview: exact measured matching manual ZIP required');
    }
  } else if (Object.hasOwn(manifest, 'manualSetup')) {
    throw new Error('Invalid Windows preview: manual ZIP metadata required when present');
  }
  return manifest;
}

export async function loadWindowsPreview(root, kit) {
  let text;
  try { text = await readFile(resolve(root, 'release/windows-preview.json'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  return validateWindowsPreview(JSON.parse(text), kit);
}

export function availableWindowsDownload(signed, preview) {
  return signed ?? preview;
}

export function windowsManualHref(signed, preview) {
  // Do not attach an older preview's ZIP to a future signed installer.
  return signed ? null : preview?.manualSetup?.url ?? null;
}
