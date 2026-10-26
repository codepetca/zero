'use strict';
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const {resolveAuthoringTarget,packageNameError} = require('./file-targets');

const hidden = new Set(['.git','target','node_modules','.ds_store','.zero-sharing-recovery','.zero','.zero-build','.zero-web']);
const keywords = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null _ var yield record sealed permits').split(' '));
const locations = [
  {label:'Java source',relative:'src/main/java'},
  {label:'Resources',relative:'src/main/resources'},
  {label:'Project files',relative:''}
];
const key = value => value.normalize('NFC').toLowerCase();
const identity = stat => `${stat.dev}:${stat.ino}`;
function nameError(value, kind) {
  if (kind === 'package') return packageNameError(value);
  if (!value || value !== value.trim()) return 'Enter a name without spaces at the beginning or end.';
  if (kind === 'class') {
    const name = value.endsWith('.java') ? value.slice(0,-5) : value;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || keywords.has(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name) || name.length > 175) return 'Use a Java class name, such as Player, without spaces or folders.';
    return;
  }
  const parts = value.split('/');
  if (value.length > 500 || parts.length > 12) return 'Use a shorter name or fewer folders.';
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || part !== part.trim() || part.length > 180 || /[<>:"\\|?*\x00-\x1f\x7f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) return 'Use a simple name. Separate folders with /; do not use .. or special characters.';
    if (hidden.has(key(part))) return 'Choose a name outside generated or private project folders.';
  }
}
async function ordinaryDirectory(directory) {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Choose an ordinary folder in this project, without symbolic links.');
  return stat;
}
async function plainAncestors(filename) {
  const absolute = path.resolve(filename);
  let cursor = path.parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor,part);
    await ordinaryDirectory(cursor);
  }
}
async function collision(directory, name) {
  return (await fs.readdir(directory)).some(existing => key(existing) === key(name));
}

function createFileCommands(vscode, {project,isBusy,setBusy,setState,output,refreshFiles = () => {}}) {
  let running = false, disposed = false;
  async function create(kind, context) {
    if (disposed || running || isBusy()) return;
    running = true; setBusy(true);
    try {
      const root = await project();
      // Capture the selected tree folder, never a mutable caller-owned object.
      let targetContext = context == null ? undefined : {root:context.root,area:context.area,relative:context.relative,libraryFolder:context.libraryFolder};
      let target;
      const assertCurrent = async () => {
        if (disposed) throw Error('Creating the file or folder stopped.');
        if (vscode.workspace.isTrusted === false) throw Error('Trust your own project before adding files or folders.');
        if (await project() !== root) throw Error('The project changed. Add the file or folder in the current project.');
      };
      await assertCurrent(); await plainAncestors(root);
      const rootId = identity(await ordinaryDirectory(root));
      const validateRoot = async () => {
        await assertCurrent(); await plainAncestors(root);
        if (identity(await ordinaryDirectory(root)) !== rootId) throw Error('The project folder changed. Try again in the current project.');
        if (target && JSON.stringify(await resolveAuthoringTarget(root,targetContext,kind)) !== JSON.stringify(target)) throw Error('The selected folder changed. Choose it again before adding files.');
      };
      const title = `${kind[0].toUpperCase()}${kind.slice(1)} name`;
      if (!targetContext && !['class','package'].includes(kind)) {
        const location = await vscode.window.showQuickPick(locations,{title:'Location'});
        if (!location) return;
        await validateRoot();
        // Locations come from this native picker, never from sidebar messages.
        if (!locations.includes(location)) throw Error('Choose a project location from the list.');
        targetContext = {root,area:location.relative === 'src/main/java' ? 'code' : location.relative ? 'assets' : 'project',relative:location.relative};
      }
      target = await resolveAuthoringTarget(root,targetContext,kind);
      const base = path.join(root,target.baseRelative);
      const relativeName = value => kind === 'class' ? `${value.replace(/\.java$/,'')}.java` : kind === 'package' ? value.replaceAll('.','/') : value;
      const destinationError = destination => {
        const relative = path.relative(root,destination).split(path.sep).join('/');
        if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative) || relative.split('/').some(part=>hidden.has(key(part)))) return 'Choose a location inside this project.';
        if (/^src\/main\/java\/zero(?:\/|$)/i.test(relative)) return 'The zero package belongs to the framework. Choose your own package.';
        if (/^libraries(?:\/|$)/i.test(relative) && !target.libraryFolder) return 'Choose a local library folder before adding library files.';
        if (kind === 'package') {
          const packageName = [target.packageName,valueForPackage(destination)].filter(Boolean).join('.');
          if (packageNameError(packageName)) return packageNameError(packageName);
        }
      };
      const valueForPackage = destination => path.relative(base,destination).split(path.sep).join('.');
      const validateName = async value => {
        const invalid = nameError(value,kind);
        if (invalid) return invalid;
        await validateRoot();
        const destination = path.join(base,relativeName(value));
        const invalidDestination = destinationError(destination);
        if (invalidDestination) return invalidDestination;
        try {
          await plainAncestors(path.dirname(destination));
          if (await collision(path.dirname(destination),path.basename(destination))) return 'That name already exists. Choose another name.';
        } catch (error) {
          if (error.code !== 'ENOENT') return error.message;
        }
      };
      const value = await vscode.window.showInputBox({placeHolder:kind === 'package' && target.packageName ? `Subpackage inside ${target.packageName}` : title,ignoreFocusOut:true,validateInput:validateName});
      if (value === undefined) return;
      const invalid = await validateName(value);
      if (invalid) throw Error(invalid);
      const destination = path.join(base,relativeName(value));
      const relative = path.relative(root,destination);
      const invalidDestination = destinationError(destination);
      if (invalidDestination) throw Error(invalidDestination);
      // Create parents one at a time so existing links cannot redirect a write.
      let parent = root;
      for (const part of path.relative(root,path.dirname(destination)).split(path.sep).filter(Boolean)) {
        await validateRoot(); await plainAncestors(parent);
        const next = path.join(parent,part);
        try {await ordinaryDirectory(next);} catch(error) {
          if (error.code !== 'ENOENT') throw error;
          if (await collision(parent,part)) throw Error('A folder with a matching name already exists. Use its exact name.');
          await fs.mkdir(next);
        }
        parent = next;
      }
      await validateRoot(); await plainAncestors(parent);
      if (await collision(parent,path.basename(destination))) throw Error('That name already exists. Choose another name.');
      if (kind === 'folder' || kind === 'package') {
        await fs.mkdir(destination);
      } else {
        const handle = await fs.open(destination,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW || 0),0o644);
        try {
          if (kind === 'class') await handle.writeFile(`${target.packageName ? `package ${target.packageName};\n\n` : ''}public class ${path.basename(destination,'.java')} {\n\n}\n`);
        } catch (error) {
          error.message = `Could not finish writing ${path.basename(destination)}. Check the new file in Files before trying again. ${error.message}`;
          throw error;
        } finally {await handle.close();}
      }
      refreshFiles();
      setState(`Created ${path.basename(destination)}`);
      output?.appendLine(`Created ${relative.split(path.sep).join('/')}`);
      if (kind !== 'folder' && kind !== 'package') {
        // A changed workspace never opens a file in a different project.
        await validateRoot(); await plainAncestors(parent);
        if ((await fs.lstat(destination)).isSymbolicLink()) throw Error('The new file changed. Open it again from Files.');
        await vscode.commands.executeCommand('vscode.open',vscode.Uri.file(destination));
      }
    } catch (error) {
      if (error.code === 'EEXIST') throw Error('That name already exists. Choose another name.');
      throw error;
    } finally {running = false; setBusy(false);}
  }
  return {commands:{'zero.newClass':context=>create('class',context),'zero.newPackage':context=>create('package',context),'zero.newFile':context=>create('file',context),'zero.newFolder':context=>create('folder',context)},dispose(){disposed=true;}};
}
module.exports = {createFileCommands,nameError};
