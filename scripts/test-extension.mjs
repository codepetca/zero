import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'extension/test');
const files = readdirSync(directory).filter(name => name.endsWith('.test.js'))
  .sort().map(name => path.join(directory, name));
if (!files.length) throw new Error('No extension tests found.');
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
