'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {parseXml, single, value} = require('../project-pom');
const contracts = () => require('./contracts');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const fail = message => { throw new Error(message); };
const STATE = 'zero-libraries.json';
const PLUGIN_START = '<!-- zero-sharing source roots -->';
const PLUGIN_END = '<!-- /zero-sharing source roots -->';
const DEP_START = '<!-- zero-sharing published libraries -->';
const DEP_END = '<!-- /zero-sharing published libraries -->';
const xml = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function relative(filename) {
  if (typeof filename !== 'string' || filename.includes('\\') || filename.startsWith('/') || filename.split('/').some(s => !s || s === '.' || s === '..' || /[\x00-\x1f]/.test(s))) fail('Use a safe relative project file path.');
  return filename;
}
async function safePath(root, filename, {missing = false} = {}) {
  relative(filename);
  root = path.resolve(root);
  if (await fs.realpath(root) !== root) fail('Open a project without symbolic links.');
  let current = root;
  for (const segment of filename.split('/')) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
    if (!stat) { if (!missing) fail(`Missing project file: ${filename}`); continue; }
    if (stat.isSymbolicLink()) fail(`Symbolic links are not supported: ${filename}`);
    if (current !== path.join(root, filename) && !stat.isDirectory()) fail(`A parent path is not a directory: ${filename}`);
    if (current === path.join(root, filename) && !stat.isFile()) fail(`Use an ordinary file: ${filename}`);
  }
  return path.join(root, filename);
}
async function read(root, filename, optional = false) {
  const actual = await safePath(root, filename, {missing: optional});
  return fs.readFile(actual, 'utf8').catch(e => { if (optional && e.code === 'ENOENT') return null; throw e; });
}
async function javaFiles(root, directory) {
  relative(directory);
  const files = [];
  async function walk(dir) {
    const actual = path.join(root, dir);
    const stat = await fs.lstat(actual).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    if (!stat) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`Use an ordinary source directory: ${dir}`);
    for (const entry of await fs.readdir(actual, {withFileTypes: true})) {
      const name = `${dir}/${entry.name}`;
      if (entry.isSymbolicLink()) fail(`Symbolic links are not supported: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile() && name.endsWith('.java')) files.push(name);
    }
  }
  await walk(directory);
  return files.sort();
}
// A declaration scanner, not a Java refactoring engine. Refuse unicode escapes so
// edits never disagree with the compiler's pre-lexing Unicode translation.
function declaration(source, filename, {allowNameMismatch=false}={}) {
  if (/\\u+[0-9a-fA-F]{4}/.test(source)) fail(`Unicode-escaped Java needs manual package preparation: ${filename}`);
  // JLS 3.8 ignores these controls and Unicode format characters in identifiers.
  // Refuse raw occurrences before comment/literal masking, without rewriting bytes
  // or trusting this lightweight scanner to normalize Java identifier spellings.
  if (/[\x00-\x08\x0e-\x1b\x7f-\x9f\p{Cf}]/u.test(source)) fail(`Hidden Java identifier-ignorable characters need manual source preparation: ${filename}. Remove the hidden characters before using generated library integration.`);
  const masked = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, s => s.replace(/[^\r\n]/g, ' '));
  const packages = [...masked.matchAll(/\bpackage\s+([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*;/g)];
  if (packages.length > 1) fail(`Ambiguous package declaration: ${filename}`);
  let simple = path.basename(filename, '.java');
  if (!/^[A-Za-z_$][\w$]*$/.test(simple) || !new RegExp(`\\b(?:class|interface|record|enum)\\s+${simple}\\b`).test(masked)) {
    // Read-only navigation may inspect a file while its name/declaration is
    // being repaired. Mutation/publication callers retain the strict default.
    const types=[];let depth=0,cursor=0;
    if(allowNameMismatch)for(const match of masked.matchAll(/\b(?:class|interface|record|enum)\s+([A-Za-z_$][\w$]*)\b/g)) {
      for(;cursor<match.index;cursor++){if(masked[cursor]==='{')depth++;else if(masked[cursor]==='}')depth--;}
      if(depth===0)types.push(match[1]);
    }
    if(types.length!==1)fail(`Expected an ordinary class named ${simple}: ${filename}`);
    simple=types[0];
  }
  const packageName = packages[0]?.[1].replace(/\s/g, '') || '';
  return {simple, packageName, className: packageName ? `${packageName}.${simple}` : simple, packageRange: packages[0] && [packages[0].index, packages[0].index + packages[0][0].length], masked};
}
// Read declarations for namespace/duplicate checks without rewriting source.
// Exact reviewed core bodies have fixed identities; the extraction scanner still
// handles all student/library source and every source selected for repackaging.
function isReviewedCoreSource(source, filename) {
  const name = filename.startsWith('src/main/java/') ? filename.slice('src/main/java/'.length) : filename;
  const expected = require('../core-contract').helperHashes[name];
  if (!expected) return false;
  if (hash(source.replace(/\r\n/g, '\n')) !== expected) fail(`This Zero helper differs from the reviewed browser adapter: ${filename}`);
  return true;
}
function applicationDeclaration(source, filename, options) {
  if (!isReviewedCoreSource(source, filename)) return declaration(source, filename, options);
  const name = filename.startsWith('src/main/java/') ? filename.slice('src/main/java/'.length) : filename;
  const simple = path.posix.basename(name, '.java'), packageName = path.posix.dirname(name).replaceAll('/', '.');
  return {simple, packageName, className: packageName + '.' + simple};
}
function repackage(source, decl, namespace) {
  return decl.packageRange ? source.slice(0, decl.packageRange[0]) + `package ${namespace};` + source.slice(decl.packageRange[1]) : `package ${namespace};\n\n${source}`;
}
function libraryPom(id, descriptor, {sourceDirectory, outputDirectory, resourceDirectory, licenseDirectory, coreBuild} = {}) {
  const c = contracts();
  if (descriptor.schema === 2) {
    const properties = { 'maven.compiler.release':c.JAVA_RELEASE, 'project.build.sourceEncoding':'UTF-8',
      'zero.core.minVersion':descriptor.coreRequirement.minVersion, 'zero.core.maxExclusive':descriptor.coreRequirement.maxExclusive };
    const core = coreBuild ? c.validateCoreBuild(coreBuild,descriptor.coreRequirement) : descriptor.coreInput;
    for (const [name,value] of Object.entries(core)) properties[`zero.core.${name}`] = value;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0">\n<modelVersion>4.0.0</modelVersion>\n<groupId>${xml(id.coordinate.groupId)}</groupId><artifactId>${xml(id.coordinate.artifactId)}</artifactId><version>${xml(descriptor.version)}</version>\n<properties>${Object.entries(properties).map(([k,v])=>`<${k}>${xml(v)}</${k}>`).join('')}</properties>\n<dependencies><dependency><groupId>school.zero</groupId><artifactId>zero-core</artifactId><version>${xml(core.version)}</version><scope>provided</scope></dependency></dependencies>\n${coreBuild ? '' : fixedBuild({sourceDirectory,outputDirectory,resourceDirectory,licenseDirectory})}\n</project>\n`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>${xml(id.coordinate.groupId)}</groupId><artifactId>${xml(id.coordinate.artifactId)}</artifactId><version>${xml(descriptor.version)}</version>\n  <properties><maven.compiler.release>${c.JAVA_RELEASE}</maven.compiler.release><project.build.sourceEncoding>UTF-8</project.build.sourceEncoding></properties>\n  <dependencies><dependency><groupId>org.openjfx</groupId><artifactId>javafx-controls</artifactId><version>${c.JAVAFX_VERSION}</version></dependency><dependency><groupId>org.openjfx</groupId><artifactId>javafx-media</artifactId><version>${c.JAVAFX_VERSION}</version></dependency></dependencies>\n  <build>${resourceDirectory ? `<resources><resource><directory>${xml(resourceDirectory)}</directory></resource>${licenseDirectory ? `<resource><directory>${xml(licenseDirectory)}</directory><targetPath>META-INF</targetPath><includes><include>LICENSE</include></includes></resource>` : ''}</resources>` : ''}${sourceDirectory ? `<sourceDirectory>${xml(sourceDirectory)}</sourceDirectory>` : ''}${outputDirectory ? `<directory>${xml(outputDirectory)}</directory>` : ''}<plugins>\n    <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-clean-plugin</artifactId><version>3.2.0</version></plugin>\n    <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-resources-plugin</artifactId><version>3.3.1</version></plugin>\n    <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId><version>3.14.0</version></plugin>\n    <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-jar-plugin</artifactId><version>3.4.2</version></plugin>\n    <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-surefire-plugin</artifactId><version>3.5.2</version></plugin>\n    <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-source-plugin</artifactId><version>3.3.1</version><executions><execution><id>sources</id><goals><goal>jar-no-fork</goal></goals></execution></executions></plugin>\n  </plugins></build>\n</project>\n`;
}
// Fixed build recipes never inherit a candidate POM or run its plugins.
function fixedBuild({sourceDirectory,outputDirectory,resourceDirectory,licenseDirectory} = {}) {
  const plugins = [['maven-clean-plugin','3.2.0'],['maven-resources-plugin','3.3.1'],['maven-compiler-plugin','3.14.0'],['maven-jar-plugin','3.4.2'],['maven-surefire-plugin','3.5.2'],['maven-source-plugin','3.3.1']];
  return `<build>${sourceDirectory?`<sourceDirectory>${xml(sourceDirectory)}</sourceDirectory>`:''}${outputDirectory?`<directory>${xml(outputDirectory)}</directory>`:''}${resourceDirectory?`<resources><resource><directory>${xml(resourceDirectory)}</directory></resource>${licenseDirectory?`<resource><directory>${xml(licenseDirectory)}</directory><targetPath>META-INF</targetPath><includes><include>LICENSE</include></includes></resource>`:''}</resources>`:''}<plugins>${plugins.map(([name,version])=>`<plugin><groupId>org.apache.maven.plugins</groupId><artifactId>${name}</artifactId><version>${version}</version>${name==='maven-compiler-plugin'?'<configuration><proc>none</proc></configuration>':name==='maven-jar-plugin'?'<configuration><archive><addMavenDescriptor>false</addMavenDescriptor></archive></configuration>':name==='maven-source-plugin'?'<executions><execution><id>sources</id><goals><goal>jar-no-fork</goal></goals></execution></executions>':''}</plugin>`).join('')}</plugins></build>`;
}
async function coreState(root, descriptor, {exact=true}={}) {
  if (descriptor.schema !== 2) return null;
  const core = require('../core-contract'), record = await core.readProjectCore(root,{required:true});
  if (!core.versionSatisfies(record.coordinate.version,descriptor.coreRequirement)) fail('Project core version is outside this library requirement.');
  if (exact && (record.coordinate.version !== descriptor.coreInput.version || record.sourceSha256 !== descriptor.coreInput.sourceSha256)) fail('Project core does not match the library coreInput. Restore the authored core before local development or Check.');
  const names = ['zero-core.json',...(await javaFiles(root,'src/main/java/zero')).filter(name=>!name.startsWith('src/main/java/zero/contrib/'))].sort();
  const snapshot = [];
  for (const filename of names) snapshot.push({path:filename,hash:hash(await fs.readFile(await safePath(root,filename)))});
  // Bind the snapshot to the validated bytes as well as the declared record.
  await core.readProjectCore(root,{required:true});
  return {record,snapshot};
}
function stateValue(text) {
  const result = text === null ? {schema: 1, libraries: []} : JSON.parse(text);
  if (result.schema !== 1 || !Array.isArray(result.libraries) || Object.keys(result).some(k => !['schema','libraries'].includes(k))) fail('Invalid Zero library modes.');
  const seen = new Set();
  for (const item of result.libraries) {
    contracts().identity('library', item.repositoryId, item.slug); contracts().validateVersion(item.version);
    if (Object.keys(item).some(k => !['slug','repositoryId','mode','version'].includes(k)) || !['local','published'].includes(item.mode) || seen.has(item.slug)) fail('Invalid or duplicate Zero library mode.');
    seen.add(item.slug);
  }
  return result;
}
function marked(text, start, end, content) {
  const first = text.indexOf(start), last = text.indexOf(end);
  if ((first < 0) !== (last < 0) || (first >= 0 && (last < first || text.indexOf(start, first + 1) >= 0 || text.indexOf(end, last + 1) >= 0))) fail('Zero-generated POM markers were changed. Restore them or use manual Maven configuration.');
  return first < 0 ? null : text.slice(0, first) + start + '\n' + content + '\n    ' + end + text.slice(last + end.length);
}
function integratePom(text, state) {
  let project = parseXml(text);
  const build = single(project, 'build'), plugins = single(build, 'plugins'), dependencies = single(project, 'dependencies');
  const ordinaryPlugins = new Set(['maven-clean-plugin','maven-compiler-plugin','maven-resources-plugin','maven-jar-plugin','maven-surefire-plugin','maven-source-plugin','maven-javadoc-plugin','javafx-maven-plugin','build-helper-maven-plugin']);
  for (const plugin of plugins.children.filter(n => n.name === 'plugin')) {
    const artifact = value(single(plugin,'artifactId'));
    if (!ordinaryPlugins.has(artifact) || (artifact === 'maven-compiler-plugin' && single(plugin,'configuration',true))) fail('Custom Maven source/build configuration needs manual library integration.');
  }
  const existing = plugins.children.filter(p => p.name === 'plugin' && value(single(p,'artifactId')) === 'build-helper-maven-plugin');
  const first = text.indexOf(PLUGIN_START), last = text.indexOf(PLUGIN_END);
  if (existing.some(p => first < 0 || p.start < first || p.end > last)) fail('An existing Maven source-root plugin needs manual integration.');
  // Only source roots managed by this narrowly generated plugin are supported.
  if (single(build, 'sourceDirectory', true) || single(project, 'profiles', true) || single(project, 'modules', true)) fail('Use the ordinary Zero source layout for generated library integration.');
  for (const item of state.libraries) {
    const id = contracts().identity('library',item.repositoryId,item.slug);
    for (const dep of dependencies.children.filter(n => n.name === 'dependency')) {
      if (value(single(dep,'groupId')) === id.coordinate.groupId && value(single(dep,'artifactId')) === id.coordinate.artifactId && !(dep.start > text.indexOf(DEP_START) && dep.end < text.indexOf(DEP_END))) fail(`Remove the manual binary dependency before developing ${item.slug}.`);
    }
  }
  const locals = state.libraries.filter(l => l.mode === 'local');
  const plugin = locals.length ? `    <plugin><groupId>org.codehaus.mojo</groupId><artifactId>build-helper-maven-plugin</artifactId><version>3.6.1</version><executions><execution><id>zero-local-libraries</id><phase>generate-sources</phase><goals><goal>add-source</goal></goals><configuration><sources>${locals.map(l => `<source>\${project.basedir}/libraries/${l.slug}/src/main/java</source>`).join('')}</sources></configuration></execution><execution><id>zero-local-library-resources</id><phase>generate-resources</phase><goals><goal>add-resource</goal></goals><configuration><resources>${locals.map(l => `<resource><directory>\${project.basedir}/libraries/${l.slug}/src/main/resources</directory></resource>`).join('')}</resources></configuration></execution></executions></plugin>` : '';
  const replacement = marked(text, PLUGIN_START, PLUGIN_END, plugin);
  text = replacement === null ? text.slice(0, plugins.close) + `    ${PLUGIN_START}\n${plugin}\n    ${PLUGIN_END}\n  ` + text.slice(plugins.close) : replacement;
  project = parseXml(text);
  const deps = single(project, 'dependencies');
  const binary = state.libraries.filter(l => l.mode === 'published').map(l => {
    const id = contracts().identity('library',l.repositoryId,l.slug);
    return `    <dependency><groupId>${id.coordinate.groupId}</groupId><artifactId>${id.coordinate.artifactId}</artifactId><version>${l.version}</version></dependency>`;
  }).join('\n');
  const replaced = marked(text, DEP_START, DEP_END, binary);
  return replaced === null ? text.slice(0, deps.close) + `    ${DEP_START}\n${binary}\n    ${DEP_END}\n  ` + text.slice(deps.close) : replaced;
}
async function base(root) {
  root = path.resolve(root);
  await read(root, 'zero.json');
  const pom = await read(root, 'pom.xml');
  const stateText = await read(root, STATE, true), state = stateValue(stateText);
  if (state.libraries.length && integratePom(pom, state) !== pom) fail('Library modes and the generated POM disagree. Restore the reviewed POM before another change.');
  return {root,pom,state,stateText};
}
async function snapshot(root) {
  const names = [...await javaFiles(root,'src/main/java')];
  const state = stateValue(await read(root, STATE, true));
  for (const lib of state.libraries) names.push(...await javaFiles(root,`libraries/${lib.slug}/src/main/java`));
  const entries = [];
  for (const name of names.sort()) entries.push({path:name, hash:hash(await read(root,name))});
  return entries;
}
async function checkShadows(root, state, changes, options) {
  const files = new Map((await snapshot(root)).map(x => [x.path, null]));
  for (const change of changes) if (change.path.endsWith('.java')) { if (change.after === null) files.delete(change.path); else files.set(change.path, change.after); }
  const classes = new Map();
  for (const [filename, updated] of files) {
    const contents = updated === null ? await read(root,filename) : updated;
    const decl = applicationDeclaration(contents,filename,options);
    if (classes.has(decl.className)) fail(`Duplicate class ${decl.className}: ${classes.get(decl.className)} and ${filename}`);
    classes.set(decl.className,filename);
    for (const lib of state.libraries) {
      const ns = contracts().identity('library',lib.repositoryId,lib.slug).namespace;
      if ((decl.packageName === ns || decl.packageName.startsWith(ns+'.')) && !filename.startsWith(`libraries/${lib.slug}/src/main/java/`)) fail(`Source shadows library namespace ${ns}: ${filename}`);
    }
  }
}
async function change(root, filename, after) { const before = await read(root, filename, true); return {path:filename,before,after}; }
async function previewExtraction(root, options) {
  const c = contracts(), repository = c.validateRepository(options.repository), descriptor = c.validateDescriptor(options.descriptor);
  if (descriptor.kind !== 'library') fail('Select a library descriptor.');
  const project = await base(root), id = c.identity('library',repository.id,descriptor.slug), folder = `libraries/${descriptor.slug}`;
  const core = await coreState(project.root,descriptor);
  if (project.state.libraries.some(l => l.slug === descriptor.slug) || await fs.lstat(path.join(project.root,folder)).catch(e => { if (e.code === 'ENOENT') return null; throw e; })) fail('This library folder already exists. Keep its files and choose another name.');
  if (!Array.isArray(options.sources) || !options.sources.length || options.sources.length > c.LIMITS.libraryFiles || new Set(options.sources).size !== options.sources.length) fail('Select unique source classes and their required helpers.');
  const explicitEdits = new Map();
  for (const edit of options.edits || []) {
    relative(edit.path);
    if (!edit.path.startsWith('src/main/java/') || !edit.path.endsWith('.java') || explicitEdits.has(edit.path) || typeof edit.before !== 'string' || typeof edit.after !== 'string') fail('Provide one explicit reviewed Java edit per source file.');
    if (await read(project.root,edit.path) !== edit.before) fail(`Source changed before preview: ${edit.path}`);
    explicitEdits.set(edit.path,edit);
  }
  const properties = single(parseXml(project.pom),'properties',true);
  const entryPoint = properties && single(properties,'app.mainClass',true);
  const mainClass = entryPoint ? value(entryPoint) : null;
  const changes = [], classes = []; let bytes = 0;
  for (const filename of options.sources) {
    relative(filename);
    if (!filename.startsWith('src/main/java/') || !filename.endsWith('.java')) fail('Select ordinary classes under src/main/java.');
    const original = await read(project.root,filename); bytes += Buffer.byteLength(original);
    if (bytes > c.LIMITS.librarySourceBytes) fail('Selected library sources exceed the supported source size.');
    const source = explicitEdits.get(filename)?.after ?? original, decl = declaration(source,filename);
    if (descriptor.schema === 2 && (require('../core-contract').coreSourcePaths.includes(filename) || decl.packageName === 'zero' || (decl.packageName.startsWith('zero.') && !decl.packageName.startsWith('zero.contrib.')))) fail('Keep reviewed Zero core source in the project; extract student-owned classes.');
    if (mainClass && decl.className === mainClass) fail('Keep the root game entry point in the game. Select reusable classes and helpers instead.');
    const target = `${folder}/src/main/java/${id.namespace.replaceAll('.','/')}/${decl.simple}.java`;
    if (changes.some(x => x.path === target)) fail('Selected classes must have different names in the library namespace.');
    changes.push({path:filename,before:original,after:null}, await change(project.root,target,repackage(source,decl,id.namespace)));
    classes.push({from:decl.className,to:`${id.namespace}.${decl.simple}`,path:target}); explicitEdits.delete(filename);
  }
  for (const edit of explicitEdits.values()) changes.push(edit);
  const newState = {schema:1,libraries:[...project.state.libraries,{slug:descriptor.slug,repositoryId:repository.id,mode:'local',version:descriptor.version}].sort((a,b) => a.slug.localeCompare(b.slug))};
  changes.push(await change(project.root,`${folder}/zero-library.json`,JSON.stringify(descriptor,null,2)+'\n'), await change(project.root,`${folder}/pom.xml`,libraryPom(id,descriptor)), await change(project.root,STATE,JSON.stringify(newState,null,2)+'\n'), {path:'pom.xml',before:project.pom,after:integratePom(project.pom,newState)});
  changes.push(await change(project.root,`${folder}/README.md`,`# ${descriptor.title}\n\n${descriptor.description}\n\nImports use \`${id.namespace}\`. Select the classes and helpers explicitly.\n\nAdd ordinary assertion-based main classes under src/test/java and two runnable usage examples under examples/first and examples/second before Check library. Checks compile separately against the actual library JAR.\n`),await change(project.root,`${folder}/CHANGELOG.md`,`# Changes\n\n## ${descriptor.version}\n\nInitial version.\n`),await change(project.root,`${folder}/src/test/java/LibraryCheck.java`,`public class LibraryCheck {\n    public static void main(String[] args) {\n        throw new AssertionError("Replace this with behavior assertions for your library.");\n    }\n}\n`));
  for (const [example,name] of [['first','FirstExample'],['second','SecondExample']]) {
    changes.push(await change(project.root,`${folder}/examples/${example}/${name}.java`,`public class ${name} {\n    public static void main(String[] args) {\n        throw new AssertionError(\"Write a runnable ${example} usage example and assertions for your library.\");\n    }\n}\n`));
  }
  const license = await read(project.root,'LICENSE',true);
  if (license !== null) changes.push(await change(project.root,`${folder}/LICENSE`,license));
  await checkShadows(project.root,newState,changes);
  return {schema:1,root:project.root,kind:'extract',identity:id,descriptor,classes,changes,sourceSnapshot:await snapshot(project.root),...(core?{coreDescriptor:descriptor,coreExact:true,coreSnapshot:core.snapshot}:{})};
}
async function previewMode(root, {slug,mode,version,publishedRelease}) {
  const project = await base(root); contracts().validateSlug(slug);
  if (!['local','published'].includes(mode)) fail('Choose local or published mode.');
  const library = project.state.libraries.find(l => l.slug === slug); if (!library) fail('Unknown authored library.');
  const descriptorPath = `libraries/${slug}/zero-library.json`, descriptorText = await read(project.root,descriptorPath);
  const descriptor = contracts().validateDescriptor(JSON.parse(descriptorText));
  if (descriptor.slug !== slug) fail('The library descriptor does not match its folder.');
  const selectedVersion = mode === 'published' ? contracts().validateVersion(version) : descriptor.version;
  let coreDescriptor=descriptor;
  if (mode === 'published' && publishedRelease) {
    const release=contracts().validateRelease(publishedRelease), identity=contracts().identity('library',library.repositoryId,slug);
    if (release.kind!=='library' || release.id!==identity.id || release.version!==selectedVersion || release.status!=='available') fail('Choose the verified published release for this library and exact version.');
    coreDescriptor=release.schema===2?{schema:2,coreRequirement:release.coreRequirement}:{schema:1};
  } else if (mode === 'published' && descriptor.schema===2) fail('Choose a verified published release before switching a core-dependent library.');
  const core = await coreState(project.root,coreDescriptor,{exact:mode==='local'});
  const state = {schema:1,libraries:project.state.libraries.map(l => l.slug === slug ? {...l,mode,version:selectedVersion} : l)};
  const changes = [await change(project.root,STATE,JSON.stringify(state,null,2)+'\n'),{path:'pom.xml',before:project.pom,after:integratePom(project.pom,state)}];
  await checkShadows(project.root,state,changes);
  return {schema:1,root:project.root,kind:'mode',changes,sourceSnapshot:await snapshot(project.root),coreDescriptorPath:descriptorPath,coreDescriptorText:descriptorText,...(core?{coreDescriptor,coreExact:mode==='local',coreSnapshot:core.snapshot}:{})};
}
async function discoverLibraries(root, {allowNameMismatch=false}={}) {
  const project = await base(root), results = [];
  for (const lib of project.state.libraries) {
    const folder = `libraries/${lib.slug}`, descriptor = contracts().validateDescriptor(JSON.parse(await read(project.root,`${folder}/zero-library.json`)));
    if (descriptor.kind !== 'library' || descriptor.slug !== lib.slug) fail('Library metadata does not match its folder.');
    results.push({...lib,folder,descriptor,identity:contracts().identity('library',lib.repositoryId,lib.slug),sources:await javaFiles(project.root,`${folder}/src/main/java`)});
  }
  await checkShadows(project.root,project.state,[],{allowNameMismatch});
  return results;
}
async function verifyPlan(plan) {
  if (plan.schema !== 1 || !path.isAbsolute(plan.root) || !Array.isArray(plan.changes)) fail('Invalid authoring plan.');
  await verifyCoreSnapshot(plan);
  if (JSON.stringify(await snapshot(plan.root)) !== JSON.stringify(plan.sourceSnapshot)) fail('Java source changed after preview. Review the extraction or mode switch again.');
  for (const item of plan.changes) if (await read(plan.root,item.path,true) !== item.before) fail(`File changed after preview: ${item.path}`);
}
async function verifyCoreSnapshot(plan) {
  if (plan.coreSnapshot && JSON.stringify((await coreState(plan.root,plan.coreDescriptor,{exact:plan.coreExact})).snapshot)!==JSON.stringify(plan.coreSnapshot)) fail('Project core changed after preview. Review the library change again.');
  if (plan.coreDescriptorPath && await read(plan.root,plan.coreDescriptorPath)!==plan.coreDescriptorText) fail('Library descriptor changed after preview. Review the mode switch again.');
}
async function write(root, filename, contents) {
  const dest = await safePath(root, filename, {missing:true});
  if (contents === null) { await fs.unlink(dest); return; }
  await fs.mkdir(path.dirname(dest),{recursive:true});
  await safePath(root,filename,{missing:true});
  const tmp = `${dest}.zero-${crypto.randomUUID()}`;
  await fs.writeFile(tmp,contents,{flag:'wx'});
  try { await fs.rename(tmp,dest); } finally { await fs.unlink(tmp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}
async function applyPlan(plan, {onStep} = {}) {
  await verifyPlan(plan);
  // Protect retained recovery source even when root .gitignore is restored by
  // rollback or application fails before that reviewed change is reached.
  const privateIgnore='.zero-sharing-recovery/.gitignore';
  const previousIgnore=await read(plan.root,privateIgnore,true);
  if(previousIgnore!==null&&previousIgnore!=='*\n')fail('The recovery directory ignore file changed. Restore its * rule before applying a library change.');
  if(previousIgnore===null)await write(plan.root,privateIgnore,'*\n');
  const recovery = `.zero-sharing-recovery/${crypto.randomUUID()}.json`;
  const receipt = {schema:1,root:plan.root,recovery,kind:plan.kind,status:'applying',changes:plan.changes,applied:[]};
  await write(plan.root,recovery,JSON.stringify(receipt,null,2)+'\n');
  try {
    for (const item of plan.changes) {
      await verifyCoreSnapshot(plan);
      if (await read(plan.root,item.path,true) !== item.before) fail(`File changed during application: ${item.path}`);
      // Persist intent before each mutation, including the small crash window.
      receipt.applied.push(item.path);
      await write(plan.root,recovery,JSON.stringify(receipt,null,2)+'\n');
      await write(plan.root,item.path,item.after);
      if (onStep) await onStep(item.path);
    }
    await verifyCoreSnapshot(plan);
    receipt.status = 'applied'; await write(plan.root,recovery,JSON.stringify(receipt,null,2)+'\n');
    return receipt;
  } catch (error) {
    try { await rollback(receipt); } catch (recoveryError) { error.message += ` Recovery needs attention: ${recoveryError.message}. Saved at ${recovery}.`; }
    throw error;
  }
}
async function rollback(input) {
  const receipt = typeof input === 'object' ? input : fail('Provide an authoring receipt.');
  if (receipt.schema !== 1 || !path.isAbsolute(receipt.root) || !receipt.recovery?.startsWith('.zero-sharing-recovery/') || !Array.isArray(receipt.changes) || !Array.isArray(receipt.applied)) fail('Invalid recovery receipt.');
  const actions = receipt.applied.slice().reverse().map(name => receipt.changes.find(c => c.path === name));
  for (const item of actions) {
    if (!item) fail('Invalid recovery change.');
    const current = await read(receipt.root,item.path,true);
    if (current !== item.after && current !== item.before) fail(`Keep your newer edits in ${item.path}; recover manually from ${receipt.recovery}`);
  }
  for (const item of actions) if (await read(receipt.root,item.path,true) !== item.before) await write(receipt.root,item.path,item.before);
  // Remove only newly empty directories; never remove any student's remaining files.
  for (const item of actions) {
    let directory = path.dirname(path.join(receipt.root,item.path));
    while (directory !== receipt.root && !directory.startsWith(path.join(receipt.root,'.zero-sharing-recovery'))) {
      try { await fs.rmdir(directory); } catch (error) { if (['ENOTEMPTY','ENOENT'].includes(error.code)) break; throw error; }
      directory = path.dirname(directory);
    }
  }
  receipt.status = 'rolled-back'; await write(receipt.root,receipt.recovery,JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}
async function recover(root, recovery) {
  relative(recovery);
  if (!recovery.startsWith('.zero-sharing-recovery/')) fail('Select a saved Zero recovery receipt.');
  const receipt = JSON.parse(await read(path.resolve(root),recovery));
  if (receipt.root !== path.resolve(root) || receipt.recovery !== recovery) fail('Recovery belongs to another project.');
  return rollback(receipt);
}
module.exports = {previewExtraction,previewMode,applyPlan,rollback,recover,discoverLibraries,libraryPom,javaFiles,declaration,applicationDeclaration,isReviewedCoreSource,safePath,read,hash,coreState,fixedBuild};
