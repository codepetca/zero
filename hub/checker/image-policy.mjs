import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import core from '../../extension/src/core-contract.js';

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
    'dependencies.json', 'policy.mjs', 'runner.mjs', 'core-policy.mjs',
    'image-policy.mjs', 'build-image.mjs',
    '../../sharing/library-checker.mjs',
    '../../sharing/managed-library.mjs',
    '../../sharing/platform.mjs',
    '../../sharing/publication.mjs',
    '../../extension/src/sharing/contracts.js',
    '../../extension/src/sharing/authoring.js',
    '../../extension/src/sharing/jar.js',
    '../../extension/src/sharing/library-license.js',
    '../../extension/src/core-contract.js',
    ...core.coreSourcePaths.map(path => '../../framework/' + path),
    '../../sharing/registry.mjs'
  ];
  for (const path of paths) {
    const contentHash = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
    hash.update(`${path}\0${contentHash}\n`);
  }
  return hash.digest('hex');
}
export const policyDigest = expectedPolicyDigest;
