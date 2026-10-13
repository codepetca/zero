import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { webThemeCss, vscodeThemeCss } from './adapters.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function designOutputs() {
  return {
    'website/.generated/learn-theme.css': `${webThemeCss('light', '.learn-theme')}\n${webThemeCss('dark', '.learn-theme[data-theme="dark"]')}\n@media (prefers-color-scheme: dark) {\n${webThemeCss('dark', '.learn-theme[data-theme="system"]')}\n}\n`,
    'extension/media/generated-theme.css': `${vscodeThemeCss()}\n${readFileSync(new URL('../extension/media/sidebar.css', import.meta.url), 'utf8')}`,
  };
}

// Both artifacts are deterministic build outputs, never independent token copies.
// Consumers run this before dev/tests/packaging; --check detects stale outputs.
export function prepareDesign({ website = true, extension = true, check = false } = {}) {
  const outputs = designOutputs();
  for (const [relative, text] of Object.entries(outputs)) {
    if (relative.startsWith('website/') ? !website : !extension) continue;
    const destination = path.join(root, relative);
    if (check) {
      let current;
      try { current = readFileSync(destination, 'utf8'); } catch { /* report below */ }
      if (current !== text) throw new Error(`Stale shared design output: ${relative}. Run node design/prepare.mjs.`);
    } else {
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, text);
    }
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  prepareDesign({ website: !process.argv.includes('--extension'), extension: !process.argv.includes('--website'), check: process.argv.includes('--check') });
}
