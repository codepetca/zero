'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {nameError} = require('./file-actions');
const {resolveAuthoringTarget} = require('./file-targets');
const {readProjectModel,ordinaryEntries,isToolingPath} = require('./project-explorer-model');

const inside = (relative, base) => relative.startsWith(`${base}/`);
const key = name => name.normalize('NFC').toLowerCase();
const toolingDirectories = new Set(['.git','.github','.vscode','.mvn','.zero','.zero-build','.zero-web','.zero-sharing-recovery','target','node_modules']);
const rootToolingFiles = new Set(['zero.json','zero-core.json','zero-libraries.json','zero-library.json','pom.xml','mvnw','mvnw.cmd','.gitignore']);
const identity = stat => `${stat.dev}:${stat.ino}`;
const version = stat => `${identity(stat)}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;

function fileNameError(name) {
  if (typeof name !== 'string' || name.includes('/') || name.includes('\\') || nameError(name,'file'))
    return 'Use one portable file name without folders or special characters.';
}

async function ordinaryDirectory(directory) {
  const stat = await fs.lstat(directory,{bigint:true});
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory)
    throw Error('Choose an ordinary project folder without symbolic links.');
  return stat;
}

function protectedPath(relative) {
  const parts = relative.split('/');
  return isToolingPath(relative) ||
    parts.some(part => toolingDirectories.has(key(part)) || key(part) === '.ds_store') ||
    parts.length === 1 && rootToolingFiles.has(key(relative));
}

async function selectedFile(root, context, model) {
  if (!context || typeof context !== 'object' || Array.isArray(context))
    throw Error('Select a file in the current project.');
  const {relative,area,libraryFolder} = context;
  if (context.root !== root || typeof relative !== 'string' || !relative ||
      !['code','assets','library-code','library-assets','project'].includes(area) ||
      relative.includes('\\') || relative.includes(':') || path.posix.isAbsolute(relative) ||
      relative.split('/').some(part => !part || part === '.' || part === '..'))
    throw Error('Select an ordinary file in the current project.');
  const parent = path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative);
  const basename = path.posix.basename(relative);
  if (fileNameError(basename) || protectedPath(relative))
    throw Error('This project or tooling file cannot be renamed here.');

  if (area === 'project') {
    if (libraryFolder !== undefined || inside(relative,'src/main/java') ||
        inside(relative,'src/main/resources') || inside(relative,'libraries'))
      throw Error('Select this file from its java, resources, or local library area.');
    // A nested query alone can bypass a hidden ancestor. Walk the same filtered
    // hierarchy that builds Other project files, including the root entry.
    let directory = '';
    for (const part of relative.split('/')) {
      const entry = (await ordinaryEntries(root,directory,{hideCorePaths:model.corePaths,excludePaths:model.excludePaths}))
        .find(item => item.name === part);
      if (!entry) throw Error('The selected project file is no longer available here.');
      directory = entry.relative;
      if (directory !== relative && !entry.directory || directory === relative && entry.directory)
        throw Error('Select a file, not a folder.');
    }
    if (!model.otherEntries.includes(relative.split('/')[0]))
      throw Error('Select an authored file in Other project files.');
  } else {
    const base = area === 'code' ? model.codeRoot : area === 'assets' ? model.assetsRoot : null;
    if (base && (libraryFolder !== undefined || !inside(relative,base)))
      throw Error('Select a file in the matching project area.');
    if (!base) {
      const library = model.libraries.find(item => item.folder === libraryFolder);
      if (!library || library.mode !== 'local')
        throw Error('Only a local library source file can be renamed here.');
      const namespace = library.namespace.replaceAll('.','/');
      const libraryBase = area === 'library-code'
        ? `${library.sourceRoot}/${namespace}`
        : `${library.folder}/src/main/resources/${namespace}`;
      if (!inside(relative,libraryBase))
        throw Error('Select a file inside the local library namespace.');
    }
    const entries = await ordinaryEntries(root,parent,{hideCorePaths:model.corePaths,excludePaths:model.excludePaths});
    if (!entries.some(entry => entry.relative === relative && !entry.directory))
      throw Error('The selected file changed. Select it again.');
  }
  const source = path.join(root,relative);
  const parentPath = path.dirname(source);
  const parentStat = await ordinaryDirectory(parentPath);
  const sourceStat = await fs.lstat(source,{bigint:true});
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink())
    throw Error('Select an ordinary file, without symbolic links.');
  return {source,parentPath,parentId:identity(parentStat),sourceVersion:version(sourceStat),basename};
}

async function moveFolder(root, target, basename, model) {
  if (!['code','assets','project'].includes(target.area)) throw Error('Choose a project folder in Files.');
  if (basename.endsWith('.java') && target.area !== 'code') throw Error('Move Java files to a folder under java.');
  const {baseRelative} = await resolveAuthoringTarget(root,target,'file');
  const relative = path.posix.join(baseRelative,basename);
  if (protectedPath(relative) || model.corePaths.some(file => key(file) === key(relative)) ||
      target.area === 'project' && /^(?:src\/main\/(?:java|resources)|libraries)(?:\/|$)/i.test(relative))
    throw Error('Choose an editable project folder.');
  const folder = path.join(root,baseRelative);
  try {
    return {folder,id:identity(await ordinaryDirectory(folder))};
  } catch (error) {
    if (error.code !== 'ENOENT' || baseRelative !== model.assetsRoot) throw error;
    const parent = path.dirname(folder);
    return {folder,parent,id:identity(await ordinaryDirectory(parent))};
  }
}

function dirtyEditorError(vscode, moving) {
  if ((vscode.workspace.textDocuments || []).some(document => document.isDirty || document.isUntitled))
    return `Save or close unsaved editor changes before ${moving?'moving':'renaming'} a file.`;
}

function createRenameCommands(vscode, {project,isBusy,setBusy,setState,output,refreshFiles = () => {}}) {
  let running = false,disposed = false;
  async function rename(context, drop) {
    if (disposed || running || isBusy()) return;
    running = true;
    try {
      const root = await project();
      if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root)
        throw Error('Choose the current project folder.');
      const selection = context && {
        root:context.root,relative:context.relative,area:context.area,libraryFolder:context.libraryFolder
      };
      const moving = Boolean(drop);
      const action = moving ? 'move' : 'rename';
      const assertCurrent = async () => {
        if (disposed) throw Error(`The ${action} stopped because the project view closed.`);
        if (vscode.workspace.isTrusted === false) throw Error(`Trust your project before ${moving?'moving':'renaming'} its files.`);
        if (await project() !== root) throw Error('The project changed. Select the file again.');
        await ordinaryDirectory(root);
        drop?.assertCurrent();
      };
      await assertCurrent();
      const rootId = identity(await ordinaryDirectory(root));
      const model = await readProjectModel(root);
      const initial = await selectedFile(root,selection,model);
      if (moving && !['code','assets','project'].includes(selection.area)) throw Error('Select an ordinary project file to move.');
      const target = moving ? await moveFolder(root,drop.target,initial.basename,model) : {folder:initial.parentPath};
      if (moving && target.folder === initial.parentPath) return;
      if (dirtyEditorError(vscode,moving)) throw Error(dirtyEditorError(vscode,moving));
      const validate = async name => {
        const invalid = fileNameError(name);
        if (invalid) return invalid;
        await assertCurrent();
        if (identity(await ordinaryDirectory(root)) !== rootId) throw Error('The project folder changed. Select the file again.');
        const model = await readProjectModel(root);
        const current = await selectedFile(root,selection,model);
        if (current.parentId !== initial.parentId || current.sourceVersion !== initial.sourceVersion)
          throw Error('The selected file changed. Select it again.');
        if (moving && JSON.stringify(await moveFolder(root,drop.target,name,model)) !== JSON.stringify(target))
          throw Error('The destination folder changed. Choose it again.');
        if (dirtyEditorError(vscode,moving)) return dirtyEditorError(vscode,moving);
        if (target.parent) {
          if ((await fs.readdir(target.parent)).some(entry => key(entry) === key(path.basename(target.folder))))
            return 'A folder with a matching name already exists.';
        } else if ((moving || name !== initial.basename) && (await fs.readdir(target.folder)).some(entry => key(entry) === key(name))) {
          return 'That name already exists. Choose another name.';
        }
      };
      const java = initial.basename.endsWith('.java');
      const name = moving ? initial.basename : await vscode.window.showInputBox({
        title:'File name',value:initial.basename,ignoreFocusOut:true,
        ...(java ? {prompt:'Changes the file name only; update Java class names and references separately.'} : {}),
        validateInput:validate
      });
      if (name === undefined) return;
      if (!moving) {
        const invalid = await validate(name);
        if (invalid) throw Error(invalid);
        if (name === initial.basename) return;
      }
      if (isBusy()) throw Error('Another project action is running. Select the file and try again.');
      setBusy(true);
      try {
        // Recheck after taking the host busy state, just before the native edit.
        const last = await validate(name);
        if (last) throw Error(last);
        if (target.parent) {
          if (identity(await ordinaryDirectory(target.parent)) !== target.id)
            throw Error('The destination folder changed. Choose it again.');
          await fs.mkdir(target.folder);
          await ordinaryDirectory(target.folder);
          await assertCurrent();
          if (version(await fs.lstat(initial.source,{bigint:true})) !== initial.sourceVersion)
            throw Error('The selected file changed. Select it again.');
          if (dirtyEditorError(vscode,moving)) throw Error(dirtyEditorError(vscode,moving));
        }
        drop?.assertCurrent();
        const destination = path.join(target.folder,name);
        const edit = new vscode.WorkspaceEdit();
        edit.renameFile(vscode.Uri.file(initial.source),vscode.Uri.file(destination),{overwrite:false,ignoreIfExists:false});
        if (!await vscode.workspace.applyEdit(edit)) throw Error(`VS Code could not ${action} the file. Check the Files view and try again.`);
        refreshFiles();
        setState(moving ? `Moved ${name}${java?' · check its Java package':''}` : `Renamed ${initial.basename} to ${name}`);
        output?.appendLine(`${moving?'Moved':'Renamed'} ${selection.relative} to ${path.relative(root,destination).split(path.sep).join('/')}`);
      } finally {setBusy(false);}
    } finally {running=false;}
  }
  return {commands:{'zero.renameStudentFile':context=>rename(context)},
    move:(source,target,assertCurrent)=>rename(source,{target,assertCurrent}),dispose(){disposed=true;}};
}

module.exports = {createRenameCommands};
