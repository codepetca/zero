import { readFile, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { assetKeys, validateManifest } from './contracts.mjs';
export async function verifiedLocalAsset(root, key, manifest) {
  validateManifest(manifest);
  if (!assetKeys.includes(key)) throw new Error('Unknown download.');
  const dist = await realpath(resolve(root, 'dist'));
  const receipt = JSON.parse(await readFile(resolve(dist, 'release.json'), 'utf8'));
  if (receipt.schema !== manifest.schema || receipt.kitVersion !== manifest.kitVersion || receipt.coreVersion !== manifest.coreVersion || JSON.stringify(receipt.publication) !== JSON.stringify(manifest.publication)) throw new Error('Release receipt does not match the current kit.');
  const authored = manifest.assets[key];
  const asset = receipt.assets?.[key];
  if (!asset || asset.filename !== authored.filename || asset.label !== authored.label || !Number.isSafeInteger(asset.size) || asset.size <= 0 || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) throw new Error('Release asset has no verified receipt.');
  const file = await realpath(resolve(dist, asset.filename));
  if (dirname(file) !== dist) throw new Error('Release file is outside dist.');
  const bytes = await readFile(file);
  if (bytes.length !== asset.size || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('Release file failed integrity verification.');
  return { bytes, asset };
}
