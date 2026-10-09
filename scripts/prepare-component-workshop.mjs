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
const publicPreparation = process.argv.includes('--public');
const arguments_ = process.argv.slice(2).filter(value => value !== '--public');
if (arguments_.length > 1) throw new Error('Usage: node scripts/prepare-component-workshop.mjs [community-root] [--public]');
const community = path.resolve(arguments_[0] || path.join(root, '../zero-community'));
const generated = path.join(root, '.verification');
const repository = path.join(generated, 'component-repository');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(generated, {recursive:true});
const settings = path.join(generated, 'component-settings.xml');
await writeFile(settings, '<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"/>\n');

// This is a local developer preparation command, not a remote package installer.
// Only the known proof layout and coordinates are accepted.
const catalogFile = path.join(community, publicPreparation ? '.proof/public/0.1.2/catalog.json' : '.proof/catalog.json');
const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
const versions = publicPreparation ? ['0.1.2'] : ['0.1.0', '0.1.1'];
if (catalog.schemaVersion !== 1 || catalog.library?.groupId !== 'school.zero.community' ||
    catalog.library.artifactId !== 'zero-community' || catalog.latest !== versions.at(-1) ||
    catalog.library.javaRelease !== 17 || catalog.library.javafxVersion !== '21.0.12' ||
    (publicPreparation ? catalog.origin !== 'public-release' ||
      catalog.publication?.repository !== 'codepetca/zero-community' ||
      !['local', 'published'].includes(catalog.publication?.status) ||
      catalog.repositoryUrl !== 'https://zero.codepet.ca/community/maven' || catalog.releases?.length !== 1
      : catalog.origin !== 'local-proof' || catalog.repositorySubdirectory !== 'repository')) {
  throw new Error('Prepare the documented community release proof (or public 0.1.2 candidate) first.');
}
// Public artifacts are flat release files; only fixed Maven coordinates are copied.
const proofRepository = await realpath(path.join(community, publicPreparation ? '.proof/public/0.1.2' : '.proof/repository'));
let sourceReceipt;
if (publicPreparation) {
  sourceReceipt = JSON.parse(await readFile(path.join(proofRepository, 'SOURCE.json'), 'utf8'));
  const release = catalog.releases[0];
  if (sourceReceipt.repository !== 'codepetca/zero-community' ||
      !/^[a-f0-9]{40}$/.test(release.sourceRevision || '') ||
      !/^[a-f0-9]{64}$/.test(release.sourceDigest || '') ||
      sourceReceipt.sourceRevision !== release.sourceRevision || sourceReceipt.sourceDigest !== release.sourceDigest)
    throw new Error('Public release source provenance is missing or differs from its catalog.');
  const declared = ['LICENSE', 'catalog/components.json', 'docs/HealthBar.md',
    'examples/adventure/Main.java', 'examples/study/Main.java', 'pom.xml',
    'src/main/java/zero/community/HealthBar.java', 'src/test/java/zero/community/HealthBarTest.java'];
  if (JSON.stringify(sourceReceipt.files?.map(item => item.path)) !== JSON.stringify(declared))
    throw new Error('Unexpected public contribution source scope.');
  for (const file of sourceReceipt.files) {
    const filename = path.join(community, file.path);
    if (await realpath(filename) !== filename || !(await lstat(filename)).isFile() ||
        sha(await readFile(filename)) !== file.sha256) throw new Error('Editable source differs from release provenance: ' + file.path);
  }
  if (sha(Buffer.from(JSON.stringify(sourceReceipt.files))) !== release.sourceDigest)
    throw new Error('Invalid public source digest.');
  const metadata = JSON.parse(await readFile(path.join(community, 'catalog/components.json'), 'utf8'));
  if (JSON.stringify(metadata.library) !== JSON.stringify(catalog.library) ||
      JSON.stringify(metadata.components) !== JSON.stringify(catalog.components)) throw new Error('Public catalog differs from editable source metadata.');
}
async function immutableCopy(source, destination) {
  if (!(await lstat(source)).isFile() || (await lstat(source)).isSymbolicLink()) throw new Error('Release artifacts must be regular files.');
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
  await writeFile(destination + '.sha1', createHash('sha1').update(bytes).digest('hex') + '\n');
  return sha(bytes);
}
for (const version of versions) {
  const release = catalog.releases.find(item => item.version === version);
  if (!release) throw new Error(`Missing preserved release ${version}.`);
  for (const kind of ['jar','pom','sources','javadoc']) {
    const artifact = release.artifacts[kind];
    const suffix = {jar:'.jar',pom:'.pom',sources:'-sources.jar',javadoc:'-javadoc.jar'}[kind];
    const expected = `school/zero/community/zero-community/${version}/zero-community-${version}${suffix}`;
    if (artifact.path !== expected || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error('Invalid fixed artifact metadata.');
    const source = path.join(proofRepository, publicPreparation ? path.basename(expected) : expected);
    const actual = await realpath(source);
    if (!actual.startsWith(proofRepository + path.sep) || (await lstat(source)).isSymbolicLink()) throw new Error('Artifact escaped the proof repository.');
    if ((publicPreparation && (await lstat(source)).size !== artifact.size) || sha(await readFile(source)) !== artifact.sha256) throw new Error('Release digest differs from the catalog.');
    await immutableCopy(source, path.join(repository, expected));
  }
}
const wrapper = path.join(root, 'student-template', process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw');
const buildSpec = processSpecification(wrapper, ['-B','--no-transfer-progress','-q','-s',settings,'-gs',settings,
  '-f',path.join(root,'framework/pom.xml'),'clean','package']);
let coreHashes;
for (let iteration = 0; iteration < 2; iteration++) {
  const build = spawnSync(buildSpec.command,buildSpec.args,{cwd:root,stdio:'inherit'});
  if (build.status !== 0) throw new Error('The canonical Zero core library did not build.');
  const hashes = await Promise.all([`.jar`, `-sources.jar`].map(async suffix =>
    sha(await readFile(path.join(root, 'framework/target', `zero-core-${coreVersion}${suffix}`)))));
  if (coreHashes && JSON.stringify(hashes) !== JSON.stringify(coreHashes))
    throw new Error('Canonical core build is not reproducible.');
  coreHashes = hashes;
}
const corePath = path.join(repository, 'school/zero/zero-core', coreVersion);
for (const name of [`zero-core-${coreVersion}.jar`,`zero-core-${coreVersion}-sources.jar`]) {
  await immutableCopy(path.join(root,'framework/target',name), path.join(corePath,name));
}
await immutableCopy(path.join(root,'framework/pom.xml'),path.join(corePath,`zero-core-${coreVersion}.pom`));
const localCatalog = {...catalog, origin:'local-proof', repositorySubdirectory:'component-repository'};
await writeFile(path.join(generated, publicPreparation ? 'component-catalog.json' : 'component-legacy-catalog.json'),JSON.stringify(localCatalog,null,2)+'\n');
if (!publicPreparation) {
  console.log('Prepared historical 0.1.0 / 0.1.1 consumer proof; use --public for the current Workshop.');
  process.exit(0);
}
await writeFile(path.join(generated,'component-workshop-source.json'),JSON.stringify(sourceReceipt,null,2)+'\n');
const runArguments = ['-B','--no-transfer-progress','-s',settings,'-gs',settings,
  '-f',path.join(root,'component-workshop/pom.xml'),
  `-Dzero.componentRepository=${pathToFileURL(repository).href}`,
  `-Dzero.communityRoot=${pathToFileURL(community).href}`,'compile','javafx:run'];
await writeFile(path.join(generated,'component-workshop-run.json'),JSON.stringify({command:wrapper,args:runArguments,cwd:root},null,2)+'\n');
console.log('Prepared verified local library versions and canonical core. No upload or publication.');
console.log('Run the workshop: node scripts/run-component-workshop.mjs');
