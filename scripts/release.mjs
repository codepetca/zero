import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function releaseDefinition() {
  const release = JSON.parse(readFileSync(path.join(root, 'release/kit.json'), 'utf8'));
  const extension = JSON.parse(readFileSync(path.join(root, 'extension/package.json'), 'utf8'));
  const pom = readFileSync(path.join(root, 'framework/pom.xml'), 'utf8');
  const workshop = readFileSync(path.join(root, 'component-workshop/pom.xml'), 'utf8');
  if (release.schema !== 1 || release.kitVersion !== extension.version ||
      !pom.includes(`<artifactId>zero-core</artifactId>\n  <version>${release.coreVersion}</version>`) ||
      !workshop.includes(`<artifactId>zero-core</artifactId><version>${release.coreVersion}</version>`) ||
      release.assets.extension.filename !== `zero-${release.kitVersion}.vsix`) {
    throw new Error('Release definition, extension version and canonical core POM must agree.');
  }
  for (const asset of Object.values(release.assets)) {
    if (!asset.label || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(asset.filename)) throw new Error('Invalid release asset filename or label.');
  }
  return release;
}
// Only caller-confirmed current builds appear here, never stale dist files.
export function writeReleaseMetadata(builtKeys) {
  const release = releaseDefinition();
  const assets = {};
  for (const key of builtKeys) {
    const definition = release.assets[key];
    if (!definition) throw new Error(`Unknown release asset: ${key}`);
    const bytes = readFileSync(path.join(root, 'dist', definition.filename));
    assets[key] = {...definition, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
  }
  mkdirSync(path.join(root, 'dist'), {recursive:true});
  writeFileSync(path.join(root, 'dist/release.json'), JSON.stringify({...release, assets}, null, 2) + '\n');
}
export function verifiedExistingAssets() {
  const filename = path.join(root, 'dist/release.json');
  if (!existsSync(filename)) return [];
  const previous = JSON.parse(readFileSync(filename, 'utf8')), current = releaseDefinition();
  if (previous.kitVersion !== current.kitVersion || previous.coreVersion !== current.coreVersion) return [];
  return Object.entries(previous.assets).filter(([key, asset]) => {
    if (current.assets[key]?.filename !== asset.filename) return false;
    const file = path.join(root, 'dist', asset.filename);
    if (!existsSync(file)) return false;
    const bytes = readFileSync(file);
    return bytes.length === asset.size && createHash('sha256').update(bytes).digest('hex') === asset.sha256;
  }).map(([key]) => key);
}
