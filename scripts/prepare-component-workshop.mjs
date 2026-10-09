import {readFile, writeFile, mkdir, lstat, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {processSpecification} from './workshop-process.mjs';
import {prepareStarter} from './prepare-starter.mjs';
import {releaseDefinition} from './release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
prepareStarter();
const {coreVersion} = releaseDefinition();
const community = path.resolve(process.argv[2] || path.join(root, '../zero-community'));
const generated = path.join(root, '.verification');
const repository = path.join(generated, 'component-repository');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(generated, {recursive:true});
const settings = path.join(generated, 'component-settings.xml');
await writeFile(settings, '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"/>\n');

// This is a local developer preparation command, not a remote package installer.
// Only the known proof layout and coordinates are accepted.
const catalogFile = path.join(community, '.proof/catalog.json');
const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
if (catalog.schemaVersion !== 1 || catalog.origin !== 'local-proof' ||
    catalog.repositorySubdirectory !== 'repository' ||
    catalog.library.groupId !== 'school.zero.community' ||
    catalog.library.artifactId !== 'zero-community' || catalog.latest !== '0.1.1' ||
    catalog.library.javaRelease !== 17 || catalog.library.javafxVersion !== '21.0.12') {
  throw new Error('Run the documented compatible community release proof first.');
}
async function immutableCopy(source, destination) {
  if ((await lstat(source)).isSymbolicLink()) throw new Error('Release artifacts must be regular files.');
  const bytes = await readFile(source);
  await mkdir(path.dirname(destination), {recursive:true});
  try {
    const existing = await readFile(destination);
    if (sha(existing) !== sha(bytes)) throw new Error(`Immutable artifact replacement refused: ${destination}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(destination, bytes, {flag:'wx'});
  }
  await writeFile(destination + '.sha256', sha(bytes) + '\n');
  return sha(bytes);
}
const proofRepository = await realpath(path.join(community, '.proof/repository'));
for (const version of ['0.1.0','0.1.1']) {
  const release = catalog.releases.find(item => item.version === version);
  if (!release) throw new Error(`Missing preserved release ${version}.`);
  for (const kind of ['jar','pom','sources','javadoc']) {
    const artifact = release.artifacts[kind];
    const suffix = {jar:'.jar',pom:'.pom',sources:'-sources.jar',javadoc:'-javadoc.jar'}[kind];
    const expected = `school/zero/community/zero-community/${version}/zero-community-${version}${suffix}`;
    if (artifact.path !== expected || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('Invalid fixed artifact metadata.');
    const source = path.join(proofRepository, expected);
    const actual = await realpath(source);
    if (!actual.startsWith(proofRepository + path.sep) || (await lstat(source)).isSymbolicLink()) throw new Error('Artifact escaped the proof repository.');
    if (sha(await readFile(source)) !== artifact.sha256) throw new Error('Release digest differs from the catalog.');
    await immutableCopy(source, path.join(repository, expected));
  }
}
const wrapper = path.join(root, 'student-template', process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw');
const buildSpec = processSpecification(wrapper, ['-B','--no-transfer-progress','-q','-s',settings,'-gs',settings,
  '-f',path.join(root,'framework/pom.xml'),'clean','package']);
const build = spawnSync(buildSpec.command,buildSpec.args,{cwd:root,stdio:'inherit'});
if (build.status !== 0) throw new Error('The canonical Zero core library did not build.');
const corePath = path.join(repository, 'school/zero/zero-core', coreVersion);
for (const name of [`zero-core-${coreVersion}.jar`,`zero-core-${coreVersion}-sources.jar`]) {
  await immutableCopy(path.join(root,'framework/target',name), path.join(corePath,name));
}
await immutableCopy(path.join(root,'framework/pom.xml'),path.join(corePath,`zero-core-${coreVersion}.pom`));
await writeFile(path.join(generated,'component-catalog.json'),JSON.stringify({...catalog,repositorySubdirectory:'component-repository'},null,2)+'\n');
const runArguments = ['-B','--no-transfer-progress','-s',settings,'-gs',settings,
  '-f',path.join(root,'component-workshop/pom.xml'),
  `-Dzero.componentRepository=${pathToFileURL(repository).href}`,
  `-Dzero.communityRoot=${pathToFileURL(community).href}`,'compile','javafx:run'];
await writeFile(path.join(generated,'component-workshop-run.json'),JSON.stringify({command:wrapper,args:runArguments,cwd:root},null,2)+'\n');
console.log('Prepared verified local library versions and canonical core. No upload or publication.');
console.log('Run the workshop: node scripts/run-component-workshop.mjs');
