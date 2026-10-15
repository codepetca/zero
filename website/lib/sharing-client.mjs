import contracts from '../../extension/src/sharing/contracts.js';

export function selectReleases(catalog, {kind = 'library', search = '', id = '', version = ''} = {}) {
  if (!['library', 'game'].includes(kind)) throw new Error('Choose games or libraries.');
  if (!!id !== !!version) throw new Error('An exact release link needs both its ID and version.');
  if (version) contracts.validateVersion(version);
  const phrase = id ? '' : search.trim().toLowerCase();
  return catalog.releases.filter(release => release.kind === kind &&
    (id ? release.id === id && release.version === version : release.status === 'available') &&
    (!phrase || [release.title, release.description, release.id, release.contributor.login,
      ...(release.components || []).map(component => `${component.className} ${component.description}`)]
      .some(value => value.toLowerCase().includes(phrase))))
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id) || compareVersions(b.version, a.version));
}
function compareVersions(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}
export function releaseLink(release) {
  return `/hub?${new URLSearchParams({kind: release.kind, id: release.id, version: release.version})}`;
}
export function sourceLink(release) {
  return `${release.repository.url}/tree/${release.source.commit}${release.source.folder === '.' ? '' : `/${release.source.folder}`}`;
}
export function dependencySnippet(release) {
  if (release.kind !== 'library' || release.status !== 'available') throw new Error('Only an available library can be added as a dependency.');
  const origin = new URL(release.artifacts.pom.url).origin;
  const {groupId, artifactId, version} = release.coordinate;
  return `<repositories>\n  <repository>\n    <id>zero-sharing</id>\n    <url>${origin}/maven</url>\n  </repository>\n</repositories>\n\n<dependencies>\n  <dependency>\n    <groupId>${groupId}</groupId>\n    <artifactId>${artifactId}</artifactId>\n    <version>${version}</version>\n  </dependency>\n</dependencies>`;
}

// The receipt records acceptance-time provenance. Pages is a mutable external app,
// so this action deliberately does not claim to play the source snapshot version.
export function playLink(release) {
  if(release.kind!=='game'||release.status!=='available'||!release.web)return undefined;
  return contracts.validateWebPublication(release.web,{commit:release.source.commit}).url;
}
