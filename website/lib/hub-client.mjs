// Capability absence is closed: an older or unavailable backend cannot enable uploads.
export function uploadsAvailable(value) { return value?.capabilities?.uploads === true; }
export function checkLabel(id) {
  const labels={bundle:'Library files', 'fixed-build':'Java compilation', api:'Component API',
    behavior:'Behavior check', first:'First example', second:'Second example'};
  return Object.hasOwn(labels,id)?labels[id]:'Check';
}
export function contributorProfile(release) {
  const contributor=release.contributor;
  if(typeof contributor?.githubId!=='string' || !/^[1-9][0-9]{0,19}$/.test(contributor.githubId)
    || typeof contributor.login!=='string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(contributor.login))return null;
  return {login:contributor.login,url:`https://github.com/${contributor.login}`};
}
export function previewPath(release) {
  const expected = `/api/hub/previews/${release.libraryId}/${release.version}.png`;
  return /^ui[1-9a-z][0-9a-z]*$/.test(release.libraryId) && /^\d+\.\d+\.\d+(?:-[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?$/.test(release.version) && release.preview?.path === expected ? expected : null;
}
export function dependencySnippet(release, origin) {
  const {groupId,artifactId,version} = release.coordinate;
  if (groupId !== 'ca.codepet.zero.library' || artifactId !== release.libraryId || version !== release.version || !/^ui[1-9a-z][0-9a-z]*$/.test(artifactId) || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?$/.test(version)) throw new Error('Invalid library coordinates.');
  const url = new URL(origin); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid website origin.');
  return `<repositories>\n  <repository>\n    <id>zero-hub</id>\n    <url>${url.origin}/api/hub/maven</url>\n  </repository>\n</repositories>\n<dependencies>\n  <dependency>\n    <groupId>${groupId}</groupId>\n    <artifactId>${artifactId}</artifactId>\n    <version>${version}</version>\n  </dependency>\n</dependencies>`;
}
export function validateUploadBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Object.keys(bundle).sort().join(',') !== 'descriptor,files' || !bundle.descriptor || !bundle.files || Array.isArray(bundle.files)) throw new Error('Choose a submission JSON containing descriptor and files.');
  const id = bundle.descriptor.libraryId;
  if (!/^ui[1-9a-z][0-9a-z]*$/.test(id)) throw new Error('Use the descriptor downloaded from your reserved library.');
  const paths = Object.keys(bundle.files);
  if (paths.length > 64 || !paths.length) throw new Error('A library must contain 1–64 files.');
  for (const path of paths) {
    const allowed = ['checks/BehaviorCheck.java','examples/first/Main.java','examples/second/Main.java','API.md','CHANGELOG.md','LICENSE','preview.png'].includes(path) || new RegExp(`^src/zero/${id}/[A-Z][A-Za-z0-9]*\\.java$`).test(path);
    const value = bundle.files[path];
    if (!allowed || typeof value !== 'string') throw new Error(`Unsupported library file: ${path}`);
    if (new TextEncoder().encode(value).length > (path === 'preview.png' ? 350000 : 65536)) throw new Error(`File is too large: ${path}`);
  }
  if (new TextEncoder().encode(JSON.stringify(bundle)).length > 1024 * 1024) throw new Error('Submission exceeds 1 MiB.');
  return bundle;
}
export const developmentPaths = ['README.md','pom.xml','mvnw','mvnw.cmd','.mvn/wrapper/maven-wrapper.properties','src/Main.java','zero.json','.vscode/tasks.json','.vscode/settings.json'];
export async function folderBundle(files) {
  if (!files.length) throw new Error('Choose the library folder, containing at most 65 files including .zero-library.json.');
  const paths = new Map(); const root = files[0].webkitRelativePath.split('/')[0];
  for (const file of files) {
    const relative = file.webkitRelativePath;
    const path = relative.slice(relative.indexOf('/') + 1);
    if (!relative.includes('/') || relative.split('/')[0] !== root || paths.has(path)) throw new Error('Choose one complete library folder.');
    if (developmentPaths.includes(path) || path.startsWith('target/') || path.startsWith('.git/')) continue;
    if (paths.size >= 65) throw new Error('A library can contain at most 64 submitted files.');
    if (file.size > (path === 'preview.png' ? 256 * 1024 : 64 * 1024)) throw new Error(`File is too large: ${path}`);
    paths.set(path,file);
  }
  const descriptorFile = paths.get('.zero-library.json');
  if (!descriptorFile) throw new Error('This folder needs its downloaded .zero-library.json descriptor.');
  const descriptor = JSON.parse(await descriptorFile.text()); const contents = {};
  for (const [path,file] of paths) {
    if (path === '.zero-library.json') continue;
    if (path === 'preview.png') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (![137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)) throw new Error('preview.png must be a PNG image.');
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); contents[path] = btoa(binary);
    } else contents[path] = await file.text();
  }
  return validateUploadBundle({descriptor,files:contents});
}
function compareVersions(a,b) {
  const [coreA,preA]=a.split(/-(.*)/s),[coreB,preB]=b.split(/-(.*)/s);
  const av=coreA.split('.').map(Number),bv=coreB.split('.').map(Number);
  for(let i=0;i<3;i++) if(av[i]!==bv[i])return av[i]-bv[i];
  if(preA===undefined||preB===undefined)return preA===preB?0:preA===undefined?1:-1;
  const ap=preA.split('.'),bp=preB.split('.');
  for(let i=0;i<Math.max(ap.length,bp.length);i++){
    if(ap[i]===bp[i])continue;if(ap[i]===undefined)return -1;if(bp[i]===undefined)return 1;
    const an=/^\d+$/.test(ap[i]),bn=/^\d+$/.test(bp[i]);
    return an&&bn?Number(ap[i])-Number(bp[i]):an?-1:bn?1:ap[i]<bp[i]?-1:1;
  }return 0;
}
export function latestLibraries(libraries) {
  const latest=new Map();
  for(const library of libraries) {
    if(!/^ui[1-9a-z][0-9a-z]*$/.test(library.libraryId)||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*)?$/.test(library.version)) continue;
    const previous=latest.get(library.libraryId);
    if(!previous||compareVersions(library.version,previous.version)>0)latest.set(library.libraryId,library);
  }
  return [...latest.values()];
}
export function publishedSubmission(job) {
  return job?.status === 'published' && job.release?.status === 'automatically-checked' ? job.release : null;
}

/** @param {Array<any>} libraries @param {{library:string,version:string}|null} [selection] */
export function selectedLibraries(libraries, selection = null) {
  const checked=libraries.filter(library=>library.status==='automatically-checked');
  return selection ? checked.filter(library=>library.libraryId===selection.library&&library.version===selection.version) : latestLibraries(checked);
}

export function catalogPath(search='',cursor=null) {
  const query=new URLSearchParams();if(search.trim())query.set('q',search.trim());if(cursor)query.set('cursor',cursor);
  return '/api/hub/catalog'+(query.size?`?${query}`:'');
}
/** @param {{search?:string,cursor?:string|null,selection?:{library:string,version:string}|null,signal?:AbortSignal,fetcher?:typeof fetch}} [options] */
export async function discoveryPage({search='',cursor=null,selection=null,signal,fetcher=fetch}={}) {
  const read=async(path,session=false)=>{const response=await fetcher(path,{cache:session?'no-store':'default',credentials:session?'same-origin':'omit',signal});const data=await response.json();if(!response.ok)throw new Error(selection&&response.status===404?'That exact checked release is unavailable. No newer release has been substituted.':data.error||'Hub unavailable.');return data;};
  if(selection) {
    if(!/^ui[1-9a-z][0-9a-z]{0,11}$/.test(selection.library)||!/^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.test(selection.version))throw new Error('That exact checked release is unavailable. No newer release has been substituted.');
    const [release,session]=await Promise.all([read(`/api/hub/libraries/${selection.library}?version=${selection.version}`),read('/api/hub/session',true)]);
    if(release.libraryId!==selection.library||release.version!==selection.version||release.status!=='automatically-checked')throw new Error('That exact checked release is unavailable. No newer release has been substituted.');
    return {...session,libraries:[release],nextCursor:null};
  }
  const data=await read(catalogPath(search,cursor));
  if(!Array.isArray(data.libraries)||data.libraries.length>20||!(data.nextCursor===null||typeof data.nextCursor==='string'&&/^[A-Za-z0-9_-]{1,512}$/.test(data.nextCursor)))throw new Error('Hub catalog is invalid.');
  const ids=new Set();
  for(const release of data.libraries){if(release.status!=='automatically-checked'||ids.has(release.libraryId))throw new Error('Hub catalog is invalid.');ids.add(release.libraryId);}
  return data;
}
export function appendDiscoveryPage(previous,page) {
  const ids=new Set(previous.libraries.map(release=>release.libraryId));
  if(page.libraries.some(release=>ids.has(release.libraryId)))throw new Error('The hub catalog changed. Search again to refresh the results.');
  if(page.nextCursor&&page.nextCursor===previous.nextCursor)throw new Error('Hub catalog did not advance.');
  return {...page,libraries:[...previous.libraries,...page.libraries]};
}
