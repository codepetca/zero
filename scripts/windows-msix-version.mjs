export function msixVersion(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ||
      version.split('.').some(value => Number(value) > 65534) || Number(version.split('.')[0]) > 65533) throw new Error('Store mapping requires a major between 0 and 65533 and minor/patch between 0 and 65534');
  // The mapped version is also used by .NET AssemblyVersion (max65534).
  // Store major must be positive, even while Zero uses 0.x versions. Offset
  // every major consistently so 0.x -> 1.x and 1.x -> 2.x remain monotonic.
  // The fourth component is reserved for the Store and must be zero.
  const [major, minor, patch] = version.split('.').map(Number);
  return `${major + 1}.${minor}.${patch}.0`;
}
