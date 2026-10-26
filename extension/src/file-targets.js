'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {discoverLibraries} = require('./sharing/authoring');

const hidden = new Set(['.git','target','node_modules','.ds_store','.zero-sharing-recovery','.zero','.zero-build','.zero-web']);
const keywords = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null _ var yield record sealed permits').split(' '));
const inside = (relative, base) => relative === base || relative.startsWith(base + '/');
const reserved = name => /^zero(?:\.|$)/i.test(name);
function packageNameError(value) {
  if (typeof value !== 'string' || !value || value.length > 500 || value.split('.').length > 12 || value.split('.').some(part => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part) || part.length > 175 || keywords.has(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(part))) return 'Use a Java package name, such as game.characters, without spaces or folders.';
}
function relativeError(value) {
  if (typeof value !== 'string' || value.length > 1000 || (value && value.split('/').some(part => !part || part === '.' || part === '..' || part !== part.trim() || part.length > 180 || /[<>:"\\|?*\x00-\x1f\x7f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || hidden.has(part.normalize('NFC').toLowerCase())))) return 'Choose an ordinary folder inside this project.';
}
// Check existing ancestors, including those above the project. Missing ordinary
// source/resource roots may be created later by the guarded authoring command.
async function validateDirectory(root, relative) {
  const absolute = path.join(root,relative);
  let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor,part);
    let stat;
    try {stat = await fs.lstat(cursor);} catch (error) {if (error.code === 'ENOENT') continue; throw error;}
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Choose an ordinary folder in this project, without symbolic links.');
  }
}
async function resolveAuthoringTarget(root, context, kind) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root) throw Error('Choose the current project folder.');
  await validateDirectory(root,'');
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw Error('Choose an ordinary project folder.');
  const source = kind === 'class' || kind === 'package', asset = kind === 'asset' || kind === 'assets';
  if (!['class','package','asset','assets','file','folder'].includes(kind)) throw Error('Choose a supported file action.');
  let area = asset ? 'assets' : 'code', relative = asset ? 'src/main/resources' : 'src/main/java', libraryFolder;
  if (context !== undefined && context !== null) {
    if (typeof context !== 'object' || Array.isArray(context) || context.root !== root) throw Error('The project changed. Choose a folder in the current project.');
    if (!['code','assets','library-code','library-assets','project'].includes(context.area) || relativeError(context.relative)) throw Error('Choose a valid project folder.');
    area = context.area; relative = context.relative; libraryFolder = context.libraryFolder;
    if (area === 'project') {
      if (libraryFolder !== undefined || relative !== '') throw Error('Choose Code, Assets, or a local library folder.');
      if (source || asset) {area = asset ? 'assets' : 'code'; relative = asset ? 'src/main/resources' : 'src/main/java';}
    } else if (!area.startsWith('library-') && libraryFolder !== undefined) throw Error('Choose a valid project folder.');
  }
  let codeBase = 'src/main/java', resourceBaseRelative = 'src/main/resources', namespace;
  if (area.startsWith('library-')) {
    if (relativeError(libraryFolder) || !/^libraries\/[^/]+$/.test(libraryFolder)) throw Error('Choose a local library from this project.');
    await validateDirectory(root,libraryFolder);
    const library = (await discoverLibraries(root)).find(item => item.folder === libraryFolder);
    if (!library || library.mode !== 'local') throw Error('Only a library in local mode can receive new files.');
    // The descriptor is validated by discoverLibraries. Its repository identity
    // supplies the namespace; descriptors cannot invent a different namespace.
    namespace = library.identity.namespace;
    if (packageNameError(namespace)) throw Error('The library namespace is invalid.');
    codeBase = `${libraryFolder}/src/main/java/${namespace.replaceAll('.','/')}`;
    resourceBaseRelative = `${libraryFolder}/src/main/resources`;
  }
  const assetBase = namespace ? `${resourceBaseRelative}/${namespace.replaceAll('.','/')}` : resourceBaseRelative;
  const selectedBase = area.endsWith('code') ? codeBase : area.endsWith('assets') ? assetBase : '';
  if (area !== 'project' && !inside(relative,selectedBase)) throw Error('Choose a folder inside the selected Code or Assets area.');
  await validateDirectory(root,relative);
  if (context != null && relative !== selectedBase) {
    try {await fs.lstat(path.join(root,relative));} catch (error) {
      if (error.code === 'ENOENT') throw Error('The selected folder no longer exists. Choose a folder again.');
      throw error;
    }
  }
  if (asset && area.endsWith('code')) {relative = assetBase; area = libraryFolder ? 'library-assets' : 'assets';}
  if (source && !area.endsWith('code')) throw Error('Choose Code or a Java package before adding a class or package.');
  await validateDirectory(root,relative);
  let packageName;
  if (area.endsWith('code')) {
    const javaRoot = libraryFolder ? `${libraryFolder}/src/main/java` : 'src/main/java';
    packageName = relative.slice(javaRoot.length).replace(/^\//,'').replaceAll('/','.');
    if (packageName && packageNameError(packageName)) throw Error('Choose a folder with a valid Java package name.');
    if (!libraryFolder && reserved(packageName)) throw Error('The zero package belongs to the framework. Choose your own package.');
  }
  return {baseRelative:relative, ...(packageName !== undefined ? {packageName} : {}), area, ...(libraryFolder ? {libraryFolder} : {}), resourceBaseRelative};
}
module.exports = {resolveAuthoringTarget,packageNameError};
