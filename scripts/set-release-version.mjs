import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {msixVersion} from './windows-msix.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const guides = ['release/START-HERE.md', 'docs/GETTING-STARTED.md', 'student-template/README.md'];

// Validate every input and prepare all output before touching any file.
export function setReleaseVersion(directory, version) {
  msixVersion(version);
  const kitPath = join(directory, 'release/kit.json');
  const extensionPath = join(directory, 'extension/package.json');
  const kit = JSON.parse(readFileSync(kitPath, 'utf8'));
  const extensionText = readFileSync(extensionPath, 'utf8');
  const extension = JSON.parse(extensionText);
  const previous = kit.kitVersion;
  msixVersion(previous);
  if (kit.schema !== 1 || kit.publication?.status !== 'local') throw new Error('Only a local source release manifest can be advanced.');
  if (extension.version !== previous || kit.publication.tag !== `v${previous}` || kit.assets?.extension?.filename !== `zero-${previous}.vsix`) throw new Error('Release manifest and extension version must agree before advancing.');
  const oldParts = previous.split('.').map(Number), newParts = version.split('.').map(Number);
  const firstDifference = newParts.findIndex((part, i) => part !== oldParts[i]);
  if (firstDifference < 0 || newParts[firstDifference] < oldParts[firstDifference]) throw new Error('The new version must be greater than the current version.');
  const documents = guides.map(file => [join(directory, file), readFileSync(join(directory, file), 'utf8')]);
  const escaped = previous.replaceAll('.', '\\.');
  const pattern = new RegExp(`(?<![0-9.])${escaped}(?![0-9]|\\.[0-9])`, 'g');
  kit.kitVersion = version;
  kit.publication.tag = `v${version}`;
  kit.assets.extension.filename = `zero-${version}.vsix`;
  // Match the top-level field in the existing manifest without reserializing its
  // other values (which may intentionally use JSON Unicode escapes).
  const versionField = /^  "version": "([^"\\]*)"(?=,?\s*$)/gm;
  const fields = [...extensionText.matchAll(versionField)];
  if (fields.length !== 1 || fields[0][1] !== previous) throw new Error('Cannot safely locate the extension version field.');
  const updatedExtension = extensionText.replace(versionField, `  "version": "${version}"`);
  if (JSON.parse(updatedExtension).version !== version) throw new Error('Cannot safely update the extension version field.');
  const output = [[kitPath, JSON.stringify(kit, null, 2) + '\n'], [extensionPath, updatedExtension], ...documents.map(([file, text]) => [file, text.replace(pattern, version)])];
  for (const [file, text] of output) writeFileSync(file, text);
  return {previous, version};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/set-release-version.mjs <major.minor.patch>');
    const result = setReleaseVersion(root, process.argv[2]);
    console.log(`Prepared local release ${result.previous} → ${result.version}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
