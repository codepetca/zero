// MIT-licensed local prototype. Public artifact hosting/release authority remain unset.
import {readFile, readdir, lstat, mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {zipSync,unzipSync} from 'fflate';
import {prepareStarter} from './prepare-starter.mjs';
import {releaseDefinition, writeReleaseMetadata, verifiedExistingAssets} from './release.mjs';
prepareStarter();
const release = releaseDefinition();
const require=createRequire(import.meta.url);
const {loadCatalog}=require('../extension/src/components.js');
const root=fileURLToPath(new URL('../',import.meta.url));
const community=path.resolve(process.argv[2] || path.join(root,'../zero-community'));
const prepared=await loadCatalog(path.join(root,'.verification/component-catalog.json'));
const sourceMetadata=JSON.parse(await readFile(path.join(community,'catalog/components.json'),'utf8'));
assert.deepEqual(prepared.catalog.components,sourceMetadata.components,'Prepared catalog is stale; rerun the community proof and Workshop preparation.');
const members={};
async function add(filename,key) {
  const stat=await lstat(filename);
  if(!stat.isFile() || stat.isSymbolicLink()) throw new Error('Package only ordinary declared files: '+filename);
  members['zero-components/'+key]=[new Uint8Array(await readFile(filename)),{os:3,attrs:((key.endsWith('/mvnw')?0o100755:0o100644)<<16)>>>0}];
}
async function tree(directory,prefix) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    if(['target','.git','.proof','.verification','.DS_Store','__pycache__'].includes(entry.name)) continue;
    if(entry.isSymbolicLink()) throw new Error('No symbolic links in local component kit.');
    const filename=path.join(directory,entry.name),key=prefix+'/'+entry.name;
    if(entry.isDirectory()) await tree(filename,key); else await add(filename,key);
  }
}
await add(path.join(root,'LICENSE'),'LICENSE');
await tree(path.join(root,'component-workshop'),'component-workshop');
for(const name of ['mvnw','mvnw.cmd']) await add(path.join(root,'student-template',name),'component-workshop/'+name);
await tree(path.join(root,'student-template/.mvn'),'component-workshop/.mvn');
for(const name of ['LICENSE','README.md','AGENTS.md','.gitignore','.gitattributes','pom.xml','mvnw','mvnw.cmd']) await add(path.join(community,name),'zero-community/'+name);
for(const name of ['.ai','.mvn','.github','src','examples','docs','catalog','scripts','releases']) await tree(path.join(community,name),'zero-community/'+name);
for(const release of prepared.catalog.releases) for(const artifact of Object.values(release.artifacts)) {
  await add(path.join(prepared.repositoryPath,artifact.path),'component-repository/'+artifact.path);
  await add(path.join(prepared.repositoryPath,artifact.path+'.sha256'),'component-repository/'+artifact.path+'.sha256');
}
for(const suffix of ['.jar','-sources.jar','.pom']) {
  const relative=`school/zero/zero-core/${release.coreVersion}/zero-core-${release.coreVersion}`+suffix;
  await add(path.join(prepared.repositoryPath,relative),'component-repository/'+relative);
  await add(path.join(prepared.repositoryPath,relative+'.sha256'),'component-repository/'+relative+'.sha256');
}
members['zero-components/catalog.json']=[new TextEncoder().encode(JSON.stringify(prepared.catalog,null,2)+'\n'),{}];
members['zero-components/README.md']=[new TextEncoder().encode(`# Zero components — local prototype

Extract this entire folder; keep its sibling folders together. JDK 17+ is required.
The first build downloads pinned Maven/JavaFX dependencies. Students need no Node
or Python to run Workshop. GitHub sign-in is separate from this local flow.

1. Run the current Zero extension source in a VS Code development host (F5).
   The published ${release.kitVersion} VSIX predates MIT catalog support; these
   MIT catalogs need the current source until the next extension release.
2. In a student starter, use the Zero view's (…) menu → Browse components.
   Choose this folder's catalog.json. View API, Try example, or Add library.
3. Add records an exact Maven dependency. Your app owns its rules/state; import
   zero.community.HealthBar and use its API. Updates require confirmation and
   Run; Revert restores the previously recorded version. No Java source is copied.
4. To develop HealthBar, open component-workshop in VS Code and use the standard
   build shortcut. Or run ./mvnw compile javafx:run there (Windows: mvnw.cmd).
5. Edit zero-community/src/main/java/zero/community/HealthBar.java in another
   window. Use Build local source & check explicitly, inspect previews/API and
   prepare a contribution ZIP. Keep source changes in your own Git repository.

The candidate build runs trusted local Java with normal computer permissions;
Workshop is not a sandbox for downloaded submissions. Preparation is local only:
there is no upload, automatic acceptance, public release or live AI provider.
Maintainer/CI Python commands and policy are documented in zero-community/docs.

Original Zero and Zero Community source uses MIT; preserve the included LICENSE
notices. Bundled dependencies retain their upstream notices. These fixtures remain
experimental, with no appointed maintainer or public artifact/acceptance service.
Keep this folder on your computer: installed POMs reference its local repository.
Moving it requires reconnecting manually; no remote dependency service is implied.
Coursework repo links are submitted separately in Pika.

macOS finite JavaFX and mocked editor tests were run. Physical editor interactions,
Windows/Linux physical setup, native editor flows and classroom trials remain
unverified. Community source CI is separate from artifact publication; live AI
and public component artifact hosting are not configured.
`),{}];
const archive=zipSync(members,{level:6}),extracted=unzipSync(archive);
for(const [key,[bytes]] of Object.entries(members)) assert.deepEqual(extracted[key],bytes);
assert.ok(!Object.keys(extracted).some(key=>/\/(?:target|\.git|\.proof|__pycache__)\//.test(key)));
await mkdir(path.join(root,'dist'),{recursive:true});
await writeFile(path.join(root,'dist',release.assets.components.filename),archive);
writeReleaseMetadata([...new Set([...verifiedExistingAssets(), 'components'])]);
console.log(`Packaged ${Object.keys(members).length} verified local component kit members; no publication.`);
