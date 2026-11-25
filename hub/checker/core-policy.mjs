import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import core from '../../extension/src/core-contract.js';
import authoring from '../../extension/src/sharing/authoring.js';

const hash = value => createHash('sha256').update(value).digest('hex');

export function trustedCoreSources() {
  const sources = Object.fromEntries(core.coreSourcePaths.map(path => [
    path, core.normalizeSource(readFileSync(new URL('../../framework/' + path, import.meta.url)))
  ]));
  return {sources, record: core.makeCoreRecord(sources)};
}

export function requireTrustedCoreInput(descriptor) {
  const input = core.validateCoreInput(descriptor.coreInput, descriptor.coreRequirement);
  const {record} = trustedCoreSources();
  if (input.version !== record.coordinate.version || input.sourceSha256 !== record.sourceSha256) {
    throw new Error('Library needs the reviewed Zero core version and exact source.');
  }
  return record;
}

export function trustedCoreBuild(descriptor, policyDigest, jarSha256) {
  if (!/^[a-f0-9]{64}$/.test(policyDigest)) throw new Error('Invalid hosted checker policy digest.');
  const record = requireTrustedCoreInput(descriptor);
  return core.validateCoreBuild({
    version: record.coordinate.version,
    sourceSha256: record.sourceSha256,
    jarSha256,
    buildRecipeSha256: hash('zero-hosted-core-jar\n' + policyDigest),
    javaRelease: record.javaRelease,
    javafxVersion: record.javafxVersion
  }, descriptor.coreRequirement);
}

export function validateTrustedCoreBuild(build, descriptor, policyDigest) {
  const checked = core.validateCoreBuild(build, descriptor.coreRequirement);
  const expected = trustedCoreBuild(descriptor, policyDigest, checked.jarSha256);
  if (Object.keys(expected).some(key => checked[key] !== expected[key])) {
    throw new Error('Checker core build differs from the reviewed Zero core or recipe.');
  }
  return expected;
}

export function coreLibraryPom(descriptor, coordinate, coreBuild) {
  if (descriptor.license !== 'MIT' || coordinate.version !== undefined && coordinate.version !== descriptor.version) {
    throw new Error('Hosted library POM requires the exact version and MIT license.');
  }
  const pom = authoring.libraryPom({coordinate}, descriptor, {coreBuild});
  const license = '<licenses><license><name>MIT License</name><url>https://opensource.org/licenses/MIT</url><distribution>repo</distribution></license></licenses>';
  return Buffer.from(pom.replace('<dependencies>', license + '\n<dependencies>'));
}
