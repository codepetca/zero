// Bind each immutable release generation to its filename and app identity.
// Releases through 0.5.12 retain their original setup artifact contract.
export function macArtifactIdentity(version, signed = true) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid Mac artifact version');
  const [major, minor, patch] = version.split('.').map(BigInt);
  const legacy = major === 0n && (minor < 5n || (minor === 5n && patch <= 12n));
  return {
    legacy,
    filename:`Zero${legacy ? '-Setup' : ''}-${version}-macos${signed ? '' : '-development'}.dmg`,
    appName:legacy ? 'Zero Setup.app' : 'Zero.app',
    displayName:legacy ? 'Zero Setup' : 'Zero',
    bundleIdentifier:`ca.codepet.zero${legacy ? '.setup' : ''}${signed ? '' : '.development'}`,
  };
}
