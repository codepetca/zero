'use strict';
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const path = require('node:path');
const {resolveAuthoringTarget} = require('./file-targets');
const {authoringLocation} = require('./explorer-labels');

const EXTENSIONS = ['png','jpg','jpeg','gif','bmp','webp','wav','mp3','aiff','aif','m4a','ogg'];
const LIMITS = Object.freeze({files:100, fileBytes:25*1024*1024, totalBytes:100*1024*1024});
const MAX_NAME_ATTEMPTS = 128;
const collisionKey = name => name.normalize('NFC').toLowerCase();
const identity = stat => `${stat.dev}:${stat.ino}`;
const missing = error => error.code === 'ENOENT';
function javaResourcePath(name) {
  // JSON's escaping matches Java strings here, except Java does not accept raw
  // Unicode line separators in every toolchain/editor configuration.
  return JSON.stringify('/'+name).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}
async function regularDirectory(directory) {
  const stat = await fs.lstat(directory);
  if(stat.isSymbolicLink() || !stat.isDirectory()) throw Error('The asset destination must use ordinary folders, without symbolic links.');
  return stat;
}
async function plainAncestors(filename) {
  const absolute=path.resolve(filename), parsed=path.parse(absolute);
  let cursor=parsed.root;
  for(const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor=path.join(cursor,part);await regularDirectory(cursor);
  }
}
async function captureRoot(root) {
  if(typeof root!=='string' || !path.isAbsolute(root))throw Error('Open a Zero project before adding assets.');
  await plainAncestors(root);
  return {root:path.resolve(root), id:identity(await regularDirectory(root))};
}
async function validateRoot(snapshot, assertCurrent) {
  await assertCurrent();await plainAncestors(snapshot.root);
  if(identity(await regularDirectory(snapshot.root))!==snapshot.id)throw Error('The project folder changed. Add assets again in the current project.');
}
async function assetDestination(snapshot, assertCurrent, destination) {
  await validateRoot(snapshot,assertCurrent);
  if(destination===undefined)return {area:'assets',baseRelative:'src/main/resources',resourceBaseRelative:'src/main/resources'};
  const target=await resolveAuthoringTarget(snapshot.root,destination,'asset');
  if(!['assets','library-assets'].includes(target.area) || !target.resourceBaseRelative)throw Error('Choose an asset folder in the current project.');
  return target;
}
const destinationKey = target => JSON.stringify([target.area,target.baseRelative,target.resourceBaseRelative,target.libraryFolder]);
async function resourcesFolder(snapshot, assertCurrent, create=false, destination) {
  const target=await assetDestination(snapshot,assertCurrent,destination);
  let cursor=snapshot.root;
  for(const part of target.baseRelative.split('/')) {
    cursor=path.join(cursor,part);
    try {await regularDirectory(cursor);} catch(error) {
      if(!missing(error) || !create)throw error;
      await validateRoot(snapshot,assertCurrent);
      try {await fs.mkdir(cursor);} catch(error) {if(error.code!=='EEXIST')throw error;}
      await regularDirectory(cursor);
    }
  }
  return cursor;
}
function validName(name) {
  // Reject Windows reserved names too, so imported projects remain portable.
  return name && name!=='.' && name!=='..' && !/[\x00-\x1f\x7f<>:"/\\|?*]/.test(name) && !/[. ]$/.test(name) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}
async function inspectSources(filenames, limits=LIMITS) {
  if(!Array.isArray(filenames) || filenames.length>limits.files)throw Error(`Choose at most ${limits.files} assets at a time.`);
  let total=0;const sources=[];
  for(const filename of [...new Set(filenames)]) {
    if(typeof filename!=='string' || !path.isAbsolute(filename))throw Error('Choose local image or audio files.');
    const name=path.basename(filename);
    if(!validName(name) || !EXTENSIONS.includes(path.extname(name).slice(1).toLowerCase()))throw Error('Choose image or audio files with simple, portable filenames.');
    await plainAncestors(path.dirname(filename));
    const stat=await fs.lstat(filename);
    if(stat.isSymbolicLink() || !stat.isFile())throw Error('Choose ordinary image or audio files, without symbolic links.');
    total+=stat.size;
    if(stat.size>limits.fileBytes || total>limits.totalBytes)throw Error('Assets are too large. Choose files under 25 MB and at most 100 MB in total.');
    sources.push({filename,name,size:stat.size,id:identity(stat)});
  }
  return sources;
}
async function hasCollisions(snapshot,sources,assertCurrent,destination) {
  let folder;
  try {folder=await resourcesFolder(snapshot,assertCurrent,false,destination);} catch(error) {if(missing(error))return false;throw error;}
  const names=new Set((await fs.readdir(folder)).map(collisionKey));
  for(const source of sources) {const key=collisionKey(source.name);if(names.has(key))return true;names.add(key);}
  return false;
}
async function importFiles({snapshot,sources,assertCurrent,destination,policy='keep',cancelled=()=>false,onImported=()=>{},limits=LIMITS}) {
  const result={imported:[],skipped:[],cancelled:false,incomplete:[]};
  try {
    if(!['keep','skip'].includes(policy))throw Error('Choose Keep both or Skip existing assets.');
    const target=await assetDestination(snapshot,assertCurrent,destination);
    const checkCurrent=async()=>{
      await assertCurrent();
      if(destination!==undefined && destinationKey(await resolveAuthoringTarget(snapshot.root,destination,'asset'))!==destinationKey(target))throw Error('The asset destination changed. Add assets again.');
    };
    for(const source of sources) {
      if(cancelled()){result.cancelled=true;break;}
      await validateRoot(snapshot,checkCurrent);
      await plainAncestors(path.dirname(source.filename));
      const input=await fs.open(source.filename,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      let data;
      try {
        const stat=await input.stat();
        if(!stat.isFile() || identity(stat)!==source.id || stat.size!==source.size || stat.size>limits.fileBytes)throw Error('A selected asset changed. Select the files again.');
        // Read a bounded buffer rather than readFile, even if the source grows.
        const buffer=Buffer.alloc(stat.size+1);let used=0;
        while(used<buffer.length){const {bytesRead}=await input.read(buffer,used,buffer.length-used,null);if(!bytesRead)break;used+=bytesRead;}
        if(used!==source.size)throw Error('A selected asset changed. Select the files again.');
        data=buffer.subarray(0,used);
      } finally {await input.close();}
      if(cancelled()){result.cancelled=true;break;}
      const folder=await resourcesFolder(snapshot,checkCurrent,true,destination);
      const folderId=identity(await regularDirectory(folder));
      let destinationPath,handle,name=source.name,number=1;
      const ext=path.extname(source.name);
      const nextName=()=>`${path.basename(source.name,ext)} (${++number})${ext}`;
      for(let attempt=0;;attempt++) {
        if(attempt>=MAX_NAME_ATTEMPTS)throw Error('Too many matching asset names or concurrent changes. Rename the selected asset and add it again.');
        await validateRoot(snapshot,checkCurrent);await plainAncestors(folder);
        if(identity(await regularDirectory(folder))!==folderId)throw Error('The resources folder changed. Add assets again.');
        if(cancelled()){result.cancelled=true;break;}
        const names=new Set((await fs.readdir(folder)).map(collisionKey));
        destinationPath=path.join(folder,name);
        if(path.dirname(destinationPath)!==folder)throw Error('Invalid asset filename.');
        if(names.has(collisionKey(name))) {
          if(policy==='skip'){result.skipped.push(source.name);break;}
          name=nextName();continue;
        }
        try {handle=await fs.open(destinationPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW || 0),0o644);break;}
        catch(error){
          if(error.code!=='EEXIST')throw error;
          // Directory enumeration can miss filesystem aliases or racing writes.
          // Every refused exclusive create must advance (or skip), never spin.
          if(policy==='skip'){result.skipped.push(source.name);break;}
          name=nextName();
        }
      }
      if(result.cancelled)break;
      if(!handle)continue;
      const createdId=identity(await handle.stat());
      try {
        await validateRoot(snapshot,checkCurrent);await plainAncestors(folder);
        if(identity(await regularDirectory(folder))!==folderId)throw Error('The resources folder changed. Add assets again.');
        await handle.writeFile(data);await handle.close();handle=undefined;
      }catch(error){
        await handle?.close().catch(()=>{});
        // Remove only the new file we created, never an existing/replaced file.
        const stat=await fs.lstat(destinationPath).catch(()=>undefined);
        if(stat && identity(stat)===createdId) {
          try {await fs.unlink(destinationPath);} catch {
            result.incomplete.push(destinationPath);
            error.message+=' An incomplete asset remains at '+destinationPath+'. Remove it before retrying.';
          }
        }
        throw error;
      }
      result.imported.push({name,path:destinationPath,javaPath:javaResourcePath(path.posix.join(path.posix.relative(target.resourceBaseRelative,target.baseRelative),name))});
      onImported(result.imported.at(-1));
    }
    return result;
  }catch(error){error.assetResult=result;throw error;}
}
function createAssetCommands(vscode,{project,isBusy=()=>false,setBusy=()=>{},setState=()=>{},output}={}) {
  let disposed=false,running=false,last;
  async function copyPaths() {
    if(disposed || !last)return;
    if(vscode.workspace.isTrusted===false || await project()!==last.root)throw Error('Add assets in the current trusted project before copying paths.');
    await vscode.env.clipboard.writeText(last.paths.join('\n'));setState('Asset paths copied');
  }
  async function addAssets(destination) {
    if(disposed || running || isBusy())return;
    running=true;setBusy(true);let root,result;
    try {
      root=await project();
      const assertCurrent=async()=>{
        if(disposed)throw Error('Adding assets stopped.');
        if(vscode.workspace.isTrusted===false)throw Error('Trust your own project before adding assets.');
        if(await project()!==root)throw Error('The student project changed. Add assets in the current project.');
      };
      await assertCurrent();const snapshot=await captureRoot(root);
      // A native tree supplies its selected folder; the plain New menu keeps the app default.
      const target=await assetDestination(snapshot,assertCurrent,destination);
      const selected=await vscode.window.showOpenDialog({title:`Import assets into ${authoringLocation(target)}`,openLabel:'Import',canSelectFiles:true,canSelectFolders:false,canSelectMany:true,filters:{'Images and audio':EXTENSIONS}});
      if(!selected?.length)return;
      await assertCurrent();
      if(selected.some(uri=>uri.scheme && uri.scheme!=='file'))throw Error('Choose local image or audio files.');
      const sources=await inspectSources(selected.map(uri=>uri.fsPath));
      let policy='keep';
      if(await hasCollisions(snapshot,sources,assertCurrent,destination)) {
        const choice=await vscode.window.showQuickPick([{label:'Keep both',policy:'keep',description:'Numbered copy'},{label:'Skip existing',policy:'skip',description:'Keep existing'}],{placeHolder:'Matching asset names'});
        if(!choice)return;policy=choice.policy;
      }
      await assertCurrent();setState('Adding assets…');
      const work=async(progress,token)=>importFiles({snapshot,sources,assertCurrent,destination,policy,cancelled:()=>disposed || Boolean(token?.isCancellationRequested),onImported:item=>progress?.report({message:item.name})});
      result=vscode.window.withProgress ? await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Import assets',cancellable:true},work):await work();
      report(result,root);
      return result;
    }catch(error){
      result=error.assetResult;
      if(result)report(result,root,true);
      const count=result?.imported.length || 0;
      error.message=`${count ? `Added ${count} asset${count===1?'':'s'} before stopping. ` : ''}${error.message}`;
      setState(error.message);output?.appendLine(error.message);throw error;
    }finally{running=false;setBusy(false);}
  }
  function report(result,root,failed=false) {
    if(result.imported.length) {
      last={root,paths:result.imported.map(item=>item.javaPath)};
      output?.appendLine('Assets added to '+path.relative(root,path.dirname(result.imported[0].path)).split(path.sep).join('/')+'. Use these Java paths:');
      for(const item of result.imported)output?.appendLine(item.javaPath);
      output?.appendLine('Use Zero: Copy Asset Paths to copy them.');
    }
    const count=result.imported.length,skipped=result.skipped.length;
    setState(`${failed?'Stopped · ':result.cancelled?'Cancelled · ':''}Added ${count} asset${count===1?'':'s'}${skipped?` · skipped ${skipped}`:''}${count?' · paths in Output':''}`);
  }
  return {commands:{'zero.importAssets':addAssets,'zero.copyImportedAssetPaths':copyPaths},canCopyPaths(){return Boolean(last) && !disposed;},dispose(){disposed=true;last=undefined;}};
}
module.exports={createAssetCommands,javaResourcePath,captureRoot,inspectSources,resourcesFolder,hasCollisions,importFiles,LIMITS,MAX_NAME_ATTEMPTS};
