import contracts from '../../extension/src/sharing/contracts.js';
import practice from '../../extension/src/sharing/tutorial-practice.js';

/**
 * @param {{releases: any[]}} catalog
 * @param {{kind?: string, search?: string, id?: string, version?: string, attributions?: {id:string, sourceCommits:string[], author:string}[]}} [options]
 */
export function selectReleases(catalog, {kind = 'library', search = '', id = '', version = '', attributions = []} = {}) {
  if (!['library', 'game', 'practice'].includes(kind)) throw new Error('Choose projects, libraries or tutorial practice.');
  const practiceOnly=kind==='practice', releaseKind=practiceOnly?'library':kind;
  if (!!id !== !!version) throw new Error('An exact release link needs both its ID and version.');
  if (version) contracts.validateVersion(version);
  const phrase = id ? '' : search.trim().toLowerCase();
  let releases = catalog.releases.filter(release => release.kind === releaseKind && practice.isTutorialPractice(release)===practiceOnly &&
    (id ? release.id === id && release.version === version : release.status === 'available'));
  if (!id) {
    const latest = new Map();
    for (const release of releases) {
      const previous = latest.get(release.id);
      if (!previous || compareVersions(release.version, previous.version) > 0) latest.set(release.id, release);
    }
    releases = [...latest.values()];
  }
  return releases.filter(release => !phrase || [release.title, release.description, release.id, release.contributor.login, releaseAuthor(release, attributions),
      ...(release.components || []).map(component => `${component.className} ${component.description}`)]
      .some(value => value.toLowerCase().includes(phrase)))
    .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id) || compareVersions(b.version, a.version));
}

export function projectSummary(description) {
  const text = description.replace(/\s+/g, ' ').trim();
  const sentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() || text;
  if (sentence.length <= 120) return sentence;
  const short = sentence.slice(0, 119).replace(/\s+\S*$/, '').trimEnd();
  return `${short || sentence.slice(0, 119)}…`;
}

// Maintained projects have verified GitHub source, independently of community
// admission. Never substitute them for an exact community release request.
export function selectMaintainedProjects(projects, {kind = 'game', search = '', id = '', version = ''} = {}) {
  if (kind !== 'game' || id || version) return [];
  const phrase = search.trim().toLowerCase();
  return projects.filter(project => !phrase || [project.title, project.description, project.author]
    .some(value => value.toLowerCase().includes(phrase)))
    .sort((a, b) => a.title.localeCompare(b.title, 'en'));
}
function compareVersions(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] - right[index];
  return 0;
}
export function releaseLink(release) {
  return `/hub?${new URLSearchParams({kind: practice.isTutorialPractice(release)?'practice':release.kind, id: release.id, version: release.version})}`;
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

export function maintainedPlayLink(project) {
  if (!project.web) return undefined;
  return contracts.validateWebPublication(project.web, {commit: project.sourceCommit}).url;
}

// Editorial screenshots supplement legacy releases without changing their
// accepted artifacts. Match the exact source so later versions cannot inherit it.
export function releaseImage(release, previews) {
  return release.artifacts.preview?.url || (release.kind === 'game'
    ? previews.find(preview => preview.id === release.id && preview.sourceCommit === release.source.commit)?.image
    : undefined);
}

export function releaseSummary(release, previews) {
  const description = release.kind === 'game'
    ? previews.find(preview => preview.id === release.id && preview.sourceCommit === release.source.commit)?.description
    : undefined;
  return projectSummary(description || release.description);
}

// Maintainer-authored credits are presentation only. Match immutable source so
// student submissions and later unreviewed sources keep their GitHub attribution.
export function releaseAuthor(release, attributions = []) {
  const credit = release.kind === 'library' && attributions.find(item =>
    item.id === release.id && item.sourceCommits.includes(release.source.commit));
  return credit ? credit.author : release.contributor.login;
}
