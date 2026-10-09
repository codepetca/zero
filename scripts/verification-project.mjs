import {mkdirSync, writeFileSync, chmodSync, mkdtempSync} from 'node:fs';
import path from 'node:path';
import {unzipSync} from 'fflate';
import {spawnSync} from 'node:child_process';
import {processSpecification} from './workshop-process.mjs';

export function extractProject(archive, prefix, parent) {
  const directory = mkdtempSync(path.join(parent, 'zero extracted with spaces '));
  const entries = unzipSync(archive);
  for (const [name, bytes] of Object.entries(entries)) {
    if (!name.startsWith(prefix + '/')) continue;
    const relative = name.slice(prefix.length + 1);
    if (!relative || relative.includes('..') || path.isAbsolute(relative)) throw new Error('Invalid archive member');
    const filename = path.join(directory, relative);
    mkdirSync(path.dirname(filename), {recursive:true});
    writeFileSync(filename, bytes);
    if (relative === 'mvnw') chmodSync(filename, 0o755);
  }
  return directory;
}
export function maven(directory, args, timeout = 120000) {
  const spec = processSpecification(path.join(directory, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw'),
    ['-B', '--no-transfer-progress', ...args]);
  const result = spawnSync(spec.command, spec.args, {cwd:directory, encoding:'utf8', timeout});
  if (result.status !== 0) throw new Error(`Standalone Maven build failed: ${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
  return result;
}
