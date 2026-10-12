import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
export const imageFiles = [
  'Dockerfile', 'Boundary.java', 'JarTracker.java', 'TrustedRun.java',
  'FixedSmoke.java', 'module-info.java', 'work.py'
];

/** Bind compiler, image pins and host acceptance logic to one trusted revision. */
export function expectedPolicyDigest() {
  const hash = createHash('sha256');
  const paths = [
    ...imageFiles.map(name => `image/${name}`),
    'dependencies.json', 'policy.mjs', 'runner.mjs',
    'image-policy.mjs', 'build-image.mjs'
  ];
  for (const path of paths) {
    const contentHash = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
    hash.update(`${path}\0${contentHash}\n`);
  }
  return hash.digest('hex');
}
export const policyDigest = expectedPolicyDigest;
