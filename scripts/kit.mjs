import {readFileSync, readdirSync, lstatSync} from 'node:fs';
import path from 'node:path';
import {prepareStarter} from './prepare-starter.mjs';

export function starterMembers(root, prefix = 'zero-starter') {
  prepareStarter(root);
  const members = {};
  function collect(directory, relative = '') {
    for (const entry of readdirSync(directory, {withFileTypes:true})) {
      if (!relative && entry.name === 'lessons') continue;
      if (['target', '.git', '.DS_Store', 'node_modules', '__pycache__'].includes(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error(`No symlinks in starter: ${entry.name}`);
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(filename, name);
      else if (entry.isFile()) members[`${prefix}/${name}`] = [new Uint8Array(readFileSync(filename)), {
        os:3, attrs:((entry.name === 'mvnw' ? 0o100755 : 0o100644) << 16) >>> 0
      }];
    }
  }
  collect(path.join(root, 'student-template'));
  return members;
}

// Only student-facing setup files ship; maintainer tests and caches stay outside.
export const setupFiles = ['Setup.cmd', 'Setup.ps1', 'Setup.command', 'setup.sh', 'README.md', 'mac-downloads.json', 'windows-downloads.json'];
export function setupRequirements(root) {
  const extension = JSON.parse(readFileSync(path.join(root, 'extension/package.json'), 'utf8'));
  // Launchers implement a stable same-major range. Fail instead of guessing if
  // the extension later adopts a different range or prerelease policy.
  const match = /^\^([1-9]\d*\.\d+\.\d+)$/.exec(extension.engines?.vscode || '');
  if (!match) throw new Error('Setup requires a stable caret VS Code engine range; update launcher compatibility policy before packaging.');
  return {vscodeMinimum:match[1]};
}
export function setupMembers(root, release, prefix = 'zero-kit/setup') {
  const {vscodeMinimum} = setupRequirements(root);
  const members = {};
  for (const name of setupFiles) {
    const filename = path.join(root, 'setup', name);
    const stat = lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Setup must be a regular file: ${name}`);
    members[`${prefix}/${name}`] = [new Uint8Array(readFileSync(filename)), {
      os:3, attrs:((/\.(command|sh)$/.test(name) ? 0o100755 : 0o100644) << 16) >>> 0
    }];
  }
  const manifest = `kitVersion=${release.kitVersion}\nextensionId=zero.zero\nvscodeMinimum=${vscodeMinimum}\n`;
  members[`${prefix}/kit.properties`] = [new TextEncoder().encode(manifest), {os:3, attrs:(0o100644 << 16) >>> 0}];
  return members;
}
