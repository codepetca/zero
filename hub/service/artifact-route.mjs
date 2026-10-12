// An artifact URL names one immutable release. Reject filenames and coordinates
// that do not match before querying; no catalog scan is needed for downloads.
const id = /^ui[1-9a-z][0-9a-z]{0,11}$/;
const version = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/;
export function artifactRoute(requestPath) {
  const parts = requestPath.split('/');
  if (parts.length === 6 && parts.slice(0,4).join('/') === '/api/hub/previews') {
    const libraryId = parts[4], releaseVersion = parts[5].slice(0,-4);
    if (!id.test(libraryId) || !parts[5].endsWith('.png') || !version.test(releaseVersion)) return null;
    return {libraryId,version:releaseVersion,kind:'preview',checksum:null};
  }
  if (parts.length !== 11 || parts.slice(0,8).join('/') !== '/api/hub/maven/ca/codepet/zero/library') return null;
  const libraryId = parts[8], releaseVersion = parts[9];
  if (!id.test(libraryId) || !version.test(releaseVersion)) return null;
  const filename = parts[10];
  const checksum = filename.endsWith('.sha256') ? 'sha256' : filename.endsWith('.sha1') ? 'sha1' : null;
  const base = checksum ? filename.slice(0,-checksum.length-1) : filename;
  const prefix = `${libraryId}-${releaseVersion}`;
  const kind = base === `${prefix}.jar` ? 'jar' : base === `${prefix}-sources.jar` ? 'sources' : base === `${prefix}.pom` ? 'pom' : null;
  return kind ? {libraryId,version:releaseVersion,kind,checksum} : null;
}
