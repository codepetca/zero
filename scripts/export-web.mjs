#!/usr/bin/env node
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { exportForWeb } = require('../extension/src/web-export');
const args = process.argv.slice(2);
const projectRoot =
  args[0] && !args[0].startsWith('--')
    ? path.resolve(args.shift())
    : process.cwd();
let cacheRoot;
while (args.length) {
  const flag = args.shift();
  if (flag === '--cache' && args.length) cacheRoot = path.resolve(args.shift());
  else {
    console.error(
      'Usage: node scripts/export-web.mjs [project-folder] [--cache cache-folder]'
    );
    process.exit(2);
  }
}
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
try {
  const result = await exportForWeb({
    projectRoot,
    cacheRoot,
    signal: controller.signal,
    onProgress: (message) => console.error(message)
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  if (error.logPath) console.error('Build log: ' + error.logPath);
  process.exitCode = error.name === 'AbortError' ? 130 : 1;
}
