'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const {constants} = require('node:fs');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const crypto = require('node:crypto');
const exec = promisify(execFile);
const {readProjectModel,ordinaryEntries,isToolingPath} = require('./project-explorer-model');
const {resolveAuthoringTarget} = require('./file-targets');
const {authoringLocation} = require('./explorer-labels');
const {readStudentFileStatus} = require('./student-file-status');
const {refuseFilters} = require('./git-filter-guard');

// Tree nodes are navigation data. Every action resolves its project and canonical
// library/authoring boundary again; a label or resource URI never grants writes.
function createStudentExplorer(vscode, host) {
  const events = new vscode.EventEmitter();
  const known = new WeakSet();
  let generation=0, pending, model, disposed=false, watcher, timer;
  const diffSnapshots=new Map();
  const diffProvider=vscode.workspace.registerTextDocumentContentProvider?.('zero-files-snapshot',{provideTextDocumentContent:uri=>diffSnapshots.get(uri.toString())??''});
  // Keep the persisted key so an explicit Standard Explorer choice survives upgrades.
  let preview=host.workspaceState.get('zero.studentExplorerPreview',true) !== false;
  const collapsed=vscode.TreeItemCollapsibleState.Collapsed, expanded=vscode.TreeItemCollapsibleState.Expanded;
  const node = fields => {const value={generation,...fields};known.add(value);return value;};
  const action = (label,command,context) => node({kind:'action',label,command,context});
  const allFiles = () => action('Show all project files','zero.showAllProjectFiles');
  const setDiscardAvailable = value => {void vscode.commands.executeCommand('setContext','zero.projectHasDiscardableChanges',value);};
  function invalidate() {
    if (disposed) return;
    setDiscardAvailable(false);
    generation++; pending=undefined; model=undefined;
    events.fire(undefined);
  }
  function watch(root) {
    watcher?.dispose();
    watcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root,'**/*'));
    const changed=uri=>{
      const relative=path.relative(root,uri.fsPath).split(path.sep).join('/');
      if (!relative || relative.startsWith('../')) return;
      // Metadata changes matter, build output does not. No filesystem work is
      // performed by a watcher callback; visible requests read bounded snapshots.
      try {if (isToolingPath(relative) && !/^(?:zero(?:-core|-libraries)?\.json|pom\.xml|libraries\/[^/]+\/zero-library\.json)$/.test(relative)) return;}catch {/* Oversized paths produce the bounded view error on refresh. */}
      clearTimeout(timer);timer=setTimeout(invalidate,120);
    };
    const subscriptions=['onDidCreate','onDidChange','onDidDelete'].map(method=>watcher[method](changed));
    const owned=watcher;
    const gitWatcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root,'.git/{HEAD,index,refs/heads/**}'));
    const gitChanged=()=>{clearTimeout(timer);timer=setTimeout(invalidate,120);};
    const gitSubscriptions=['onDidCreate','onDidChange','onDidDelete'].map(method=>gitWatcher[method](gitChanged));
    const linkedWatchers=[],linkedSubscriptions=[];
    watcher={watchLinked(directories){
      for(const directory of new Set(directories||[])) {
        const linked=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(directory,'{HEAD,index,config,packed-refs,refs/heads/**}'));
        linkedWatchers.push(linked);
        for(const method of ['onDidCreate','onDidChange','onDidDelete'])linkedSubscriptions.push(linked[method](gitChanged));
      }
    },dispose(){for(const subscription of [...subscriptions,...gitSubscriptions,...linkedSubscriptions])subscription.dispose();owned.dispose();gitWatcher.dispose();for(const linked of linkedWatchers)linked.dispose();}};
  }
  async function load() {
    if (disposed) return;
    if (!pending) {
      const attempt=generation;
      const work=(async()=>{
        const root=await host.project();
        if(disposed||generation!==attempt)return;
        // Watch before parsing metadata so an external repair refreshes a
        // first-load error, including a missing POM or library descriptor.
        watch(root);
        const next=await readProjectModel(root);
        try {
          const readStatus=host.readFileStatus||readStudentFileStatus;
          next.changes=vscode.workspace.isTrusted===false?new Map():await readStatus(root);
          if(!disposed&&generation===attempt&&next.changes.gitWatchDirectories) {
            const directories=next.changes.gitWatchDirectories;
            watcher?.watchLinked(directories);
            // A Git change may have happened between the first snapshot and
            // watcher installation. Read again with the watches already active.
            const fresh=await readStatus(root);
            if(JSON.stringify(fresh.gitWatchDirectories)!==JSON.stringify(directories))throw new Error('Linked worktree metadata changed during refresh.');
            next.changes=fresh;
          }
        }
        catch (error) {next.changes=new Map();next.statusUnavailable=true;host.output.appendLine(`File status unavailable: ${error.message}`);}
        const hasGitChanges=next.changes.size>0;
        next.unsaved=(vscode.workspace.textDocuments||[]).some(document=>document.isDirty&&document.uri?.scheme==='file');
        for(const document of vscode.workspace.textDocuments||[]) {
          if(!document.isDirty||document.uri?.scheme!=='file')continue;
          const name=document.uri.fsPath;if(!name)continue;
          // Include both the resolved target and resolved parent/name, as the
          // commit guard does for a project file that is itself a symlink.
          const candidates=[name];
          try {candidates.push(await fs.realpath(name));}catch {}
          try {candidates.push(path.join(await fs.realpath(path.dirname(name)),path.basename(name)));}catch {}
          for(const candidate of candidates) {
            const relative=path.relative(root,candidate).split(path.sep).join('/');
            if(relative&&!relative.startsWith('../')&&!path.isAbsolute(relative)&&!next.changes.has(relative))next.changes.set(relative,'modified');
          }
        }
        if (disposed || generation!==attempt || await host.project()!==root) return;
        if (disposed || generation!==attempt) return;
        setDiscardAvailable(false);
        host.onFileChanges?.(root,next.statusUnavailable?undefined:hasGitChanges);
        model=next;updateSelection();return next;
      })();
      pending=work;
      void work.catch(()=>{if(pending===work)pending=undefined;});
    }
    return pending;
  }
  function folder(snapshot,label,relative,area,library,retained=false) {
    return node({kind:'folder',root:snapshot.root,label,relative,area,libraryId:library?.id,libraryFolder:library?.folder,libraryTitle:library?.title,retained});
  }
  async function children(parent) {
    if(disposed)return [];
    try {
      const snapshot=await load();
      if(!snapshot)return [];
      if(!parent) {
        const result=[folder(snapshot,'java',snapshot.codeRoot,'code'),folder(snapshot,'resources',snapshot.assetsRoot,'assets')];
        if(snapshot.statusUnavailable)result.push(node({kind:'message',label:'File change status unavailable',detail:'Open Source Control to check the project changes.'}));
        if(snapshot.unsaved)result.push(node({kind:'message',label:'Save open files before discarding changes',detail:'Save or undo all open file edits before discarding project changes.'}));
        if(snapshot.changes.hasCommittedHead===false&&snapshot.changes.verifiedUnbornHead!==true)result.push(node({kind:'message',label:'Commit the initial project or use Source Control to discard changes',detail:'The project history could not be verified. Inspect the repository in Source Control.'}));
        if(snapshot.libraries.length)result.push(node({kind:'libraries',root:snapshot.root,label:'Libraries'}));
        if(snapshot.otherEntries.length || [...snapshot.changes].some(([name,kind])=>kind==='deleted'&&!name.startsWith(snapshot.codeRoot+'/')&&!name.startsWith(snapshot.assetsRoot+'/')&&!isToolingPath(name)))result.push(node({kind:'other',root:snapshot.root,label:'Other project files'}));
        result.push(allFiles());return result;
      }
      // VS Code can ask for children of an expanded old node during a full
      // refresh. Reads may reuse its identity; actions still require freshness.
      if(!known.has(parent)||parent.root!==snapshot.root)return [];
      const attempt=generation;
      if(parent.kind==='libraries')return snapshot.libraries.map(library=>node({kind:'library',root:snapshot.root,label:library.title,libraryId:library.id,
        description:`${library.version} · ${library.mode==='local'?'Local source':library.folder?'Published active':'Added'}${library.sourceIssues?.length?' · Fix Java names':''}`}));
      if(parent.kind==='library') {
        const library=snapshot.libraries.find(item=>item.id===parent.libraryId);
        if(!library)return [];
        const context={root:snapshot.root,libraryId:library.id};
        const result=[...(library.sourceIssues?.length?[node({kind:'message',label:'Match Java class and file names',detail:library.sourceIssues.join('\n')})]:[]),action('Imports and examples…','zero.libraryReference',context),action('Copy imports','zero.copyLibraryImports',context)];
        if(library.folder) {
          const retained=library.mode!=='local',namespace=library.namespace.replaceAll('.','/');
          result.push(folder(snapshot,retained?'java (retained, inactive)':'java',`${library.sourceRoot}/${namespace}`,'library-code',library,retained));
          result.push(folder(snapshot,retained?'resources (retained, inactive)':'resources',`${library.folder}/src/main/resources/${namespace}`,'library-assets',library,retained));
          for(const [label,relative]of [['README',library.readme],['Examples',library.examplesRoot],['Checks',library.checksRoot]])if(relative) {
            if(label==='README')result.push(node({kind:'file',root:snapshot.root,label,relative,retained:true}));
            else result.push(folder(snapshot,retained?`${label} (retained)`:label,relative,undefined,library,true));
          }
          for(const [label,command]of [['Develop local / Use published…','zero.switchLibraryMode'],['Check library…','zero.checkLibrary'],['Share library…','zero.shareLibrary']])result.push(action(label,command,context));
        }
        return result;
      }
      const relative=parent.kind==='other'?'':parent.relative;
      const entries=await ordinaryEntries(snapshot.root,relative,{hideCorePaths:snapshot.corePaths,excludePaths:snapshot.excludePaths});
      // Deleted files and their missing parent folders remain navigable. These
      // nodes only display status; they never grant authority to mutate a path.
      for(const [name,kind] of snapshot.changes) {
        if(kind!=='deleted'||isToolingPath(name)||snapshot.corePaths.includes(name)||snapshot.excludePaths.some(p=>name===p||name.startsWith(p+'/')) && parent.kind==='other')continue;
        const prefix=relative?relative+'/':'';
        if(!name.startsWith(prefix))continue;
        const rest=name.slice(prefix.length), first=rest.split('/')[0];
        if(!first||entries.some(entry=>entry.name===first))continue;
        entries.push({name:first,relative:prefix+first,directory:rest.includes('/'),deleted:!rest.includes('/')});
      }
      entries.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name,'en'));
      if(disposed||attempt!==generation)return [];
      if(disposed||attempt!==generation)return [];
      const library=parent.libraryId?snapshot.libraries.find(item=>item.id===parent.libraryId):undefined;
      if(parent.libraryId&&!library)return [];
      return entries.map(entry=>node({kind:entry.directory?'folder':entry.deleted?'deleted':'file',root:snapshot.root,label:entry.name,relative:entry.relative,status:snapshot.changes.get(entry.relative),
        canRestoreDeleted:false,
        canRestoreModified:false,
        canRestoreCommitted:false,
        canRemoveAdded:false,
        area:parent.kind==='other'?'project':parent.area,libraryId:parent.libraryId,libraryFolder:parent.libraryFolder,libraryTitle:library?.title,
        retained:library&&parent.area?.startsWith('library-')?library.mode!=='local':parent.retained}));
    } catch(error) {
      if(disposed)return [];
      host.output.appendLine(`Student Explorer: ${error.message}`);
      return [node({kind:'message',label:'Project view unavailable',detail:error.message}),allFiles()];
    }
  }
  function item(value) {
    const branch=['folder','libraries','library','other'].includes(value.kind);
    const result=new vscode.TreeItem(value.label,branch ? (['java','resources'].includes(value.label)&&!value.libraryId?expanded:collapsed) : vscode.TreeItemCollapsibleState.None);
    result.id=`${value.root||''}:${value.kind}:${value.relative||value.libraryId||value.command||value.label}`;
    result.description=value.description;
    result.tooltip=value.detail||(value.relative?authoringLocation({area:value.area,baseRelative:value.relative,libraryFolder:value.libraryFolder,libraryTitle:value.libraryTitle}):value.description||value.label);
    result.accessibilityInformation={label:[value.label,value.description,value.retained?'retained source; inactive when published':''].filter(Boolean).join(', ')};
    if(value.status) {
      const details={added:['+','Added','gitDecoration.addedResourceForeground'],modified:['M','Modified','gitDecoration.modifiedResourceForeground'],deleted:['−','Deleted','gitDecoration.deletedResourceForeground'],conflict:['!','Conflict','gitDecoration.conflictingResourceForeground']}[value.status];
      if(details){result.description=details[0];result.accessibilityInformation={label:`${value.label}, ${details[1]}`};if(vscode.ThemeColor)result.iconPath=new vscode.ThemeIcon(value.status==='deleted'?'remove':value.status==='added'?'add':value.status==='conflict'?'warning':'edit',new vscode.ThemeColor(details[2]));}
    }
    if(value.relative)result.resourceUri=vscode.Uri.file(path.join(value.root,value.relative));
    if(value.kind==='file'||value.kind==='deleted')result.command={command:'zero.explorerOpenFile',title:value.kind==='deleted'?'Review in Source Control':'Open file',arguments:[value]};
    if(value.kind==='deleted')result.tooltip=`${result.tooltip} · Open Source Control to review this deletion`;
    if(value.kind==='action')result.command={command:'zero.explorerAction',title:value.label,arguments:[value]};
    if(!value.relative)result.iconPath=new vscode.ThemeIcon(value.kind==='library'||value.kind==='libraries'?'library':value.kind==='action'?'arrow-right':'files');
    result.contextValue=value.kind==='deleted'&&!value.retained&&value.canRestoreDeleted?'zeroDeletedFile':value.kind==='deleted'?'zeroReadonly':value.kind==='library'?'zeroLibrary':value.area&&!value.retained?(value.area==='project'?(value.kind==='file'?'zeroProjectFile':'zeroProject'):value.area.endsWith('code')?(value.kind==='file'?'zeroCodeFile':'zeroCode'):value.kind==='file'?'zeroAssetFile':'zeroAssets'):value.kind==='other'?'zeroProject':'zeroReadonly';
    if(value.kind==='file'&&!value.retained&&result.contextValue!=='zeroReadonly')result.contextValue+=value.canRestoreModified&&value.canRestoreCommitted?'ModifiedAndCommitted':value.canRestoreModified?'Modified':value.canRestoreCommitted?'Committed':'';
    if(value.kind==='file'&&value.canRemoveAdded&&!value.retained&&result.contextValue!=='zeroReadonly')result.contextValue+='Added';
    return result;
  }
  async function fresh(value) {
    if(disposed||!value||!known.has(value)||value.generation!==generation)throw Error('The project view changed. Select the item again.');
    const root=await host.project();
    if(root!==value.root)throw Error('The project changed. Select a folder in the current project.');
    const snapshot=await readProjectModel(root);
    if(disposed||value.generation!==generation||await host.project()!==root)throw Error('The project view changed. Select the item again.');
    return snapshot;
  }
  async function create(command,value) {
    if(host.isBusy())return;
    const snapshot=await fresh(value);
    if(value.kind==='file') {
      const entries=await ordinaryEntries(snapshot.root,path.posix.dirname(value.relative)==='.'?'':path.posix.dirname(value.relative),{hideCorePaths:snapshot.corePaths,excludePaths:snapshot.excludePaths});
      if(!entries.some(entry=>entry.relative===value.relative&&!entry.directory))throw Error('The selected file changed. Select its folder again.');
    }
    const relative=value.kind==='file'?(path.posix.dirname(value.relative)==='.'?'':path.posix.dirname(value.relative)):value.relative;
    const context=value.kind==='other'?{root:snapshot.root,area:'project',relative:''}:{root:snapshot.root,area:value.area,relative,libraryFolder:value.libraryFolder};
    if(value.retained)throw Error('Use Develop local library before adding files to its source.');
    const kind={'zero.newClass':'class','zero.newPackage':'package','zero.newFile':'file','zero.newFolder':'folder','zero.importAssets':'assets'}[command];
    if(!kind)throw Error('Choose a supported file action.');
    await resolveAuthoringTarget(snapshot.root,context,kind);
    try {await host.execute(command,context);}finally{invalidate();}
  }
  function selection() {
    const selected=tree.selection?.[0];
    return selected&&(selected.area||selected.kind==='other'||selected.kind==='library')?selected:undefined;
  }
  function updateSelection() {
    if(disposed)return;
    const selected=selection(),library=selected?.kind==='library'?model?.libraries.find(lib=>lib.id===selected.libraryId):undefined;
    const writable=!selected||!selected.retained&&(selected.kind!=='library'||library?.mode==='local');
    const area=selected?.kind==='other'?'project':selected?.area;
    const relative=selected?.kind==='file'?path.posix.dirname(selected.relative):selected?.relative;
    tree.description=library?`Libraries › ${library.title} › java`:authoringLocation({area:area||'code',baseRelative:relative??(area==='project'?'':'src/main/java'),libraryFolder:selected?.libraryFolder,libraryTitle:selected?.libraryTitle});
    for(const [key,value]of [['zero.explorerWritable',writable],['zero.explorerCodeTarget',writable&&(!selected||area?.endsWith('code')||selected.kind==='library')],['zero.explorerAssetTarget',writable&&area!=='project']])void vscode.commands.executeCommand('setContext',key,Boolean(value));
  }
  async function createSelected(command) {
    if(disposed||host.isBusy())return;
    let target=selection();
    if(target?.kind==='library') {
      const snapshot=await fresh(target),library=snapshot.libraries.find(lib=>lib.id===target.libraryId);
      if(!library||library.mode!=='local')throw Error('Use Develop local library before adding files to its source.');
      target=folder(snapshot,'java',`${library.sourceRoot}/${library.namespace.replaceAll('.','/')}`,'library-code',library);
    }
    if(!target) {
      const snapshot=await load();if(!snapshot||disposed)throw Error('The project view changed. Select a folder again.');
      target=folder(snapshot,'java',snapshot.codeRoot,'code');
    }
    return create(command,target);
  }
  async function rename(value) {
    if(disposed||host.isBusy())return;
    const snapshot=await fresh(value);
    if(value.kind!=='file'||value.retained)throw Error('Select an editable project file to rename.');
    const entries=await ordinaryEntries(snapshot.root,path.posix.dirname(value.relative)==='.'?'':path.posix.dirname(value.relative),{hideCorePaths:snapshot.corePaths,excludePaths:snapshot.excludePaths});
    if(!entries.some(entry=>entry.relative===value.relative&&!entry.directory))throw Error('The file changed. Select it again.');
    try {return await host.execute('zero.renameStudentFile',{root:snapshot.root,relative:value.relative,area:value.area||'project',libraryFolder:value.libraryFolder});}finally{invalidate();}
  }
  async function open(value) {
    const snapshot=await fresh(value);
    const requireCurrent=async()=>{let root;try{root=await host.project();}catch{throw Object.assign(Error('The project view changed. Select the file again.'),{code:'ZERO_STALE_FILES'});}if(disposed||value.generation!==generation||root!==snapshot.root)throw Object.assign(Error('The project view changed. Select the file again.'),{code:'ZERO_STALE_FILES'});};
    if(value.kind==='deleted') {
      if(vscode.workspace.isTrusted!==true){await requireCurrent();return vscode.commands.executeCommand('workbench.view.scm');}
      const changes=await (host.readFileStatus||readStudentFileStatus)(snapshot.root);
      await requireCurrent();if(changes.get(value.relative)!=='deleted')throw Error('The project view changed. Select the deleted file again.');
      return vscode.commands.executeCommand('workbench.view.scm');
    }
    const entries=await ordinaryEntries(snapshot.root,path.posix.dirname(value.relative)==='.'?'':path.posix.dirname(value.relative));
    if(!entries.some(entry=>entry.relative===value.relative&&!entry.directory))throw Error('The file changed. Select it again.');
    await requireCurrent();
    const filename=path.join(snapshot.root,value.relative),target=vscode.Uri.file(filename);
    const sourceControl=async()=>{await requireCurrent();return vscode.commands.executeCommand('workbench.view.scm');};
    const findDirty=async()=>{let found;const docs=(vscode.workspace.textDocuments||[]).filter(doc=>doc.isDirty&&doc.uri?.scheme==='file'&&doc.uri.fsPath);if(docs.length){const selected=await fs.realpath(filename);for(const doc of docs){if(await fs.realpath(doc.uri.fsPath)===selected){if(found)throw Error('Multiple open editors match this file.');found=doc;}}}return found;};
    let dirty;try {dirty=await findDirty();}catch{return sourceControl();}
    if(!value.status&&!dirty)return vscode.commands.executeCommand('vscode.open',target);
    if(vscode.workspace.isTrusted!==true||!diffProvider||!vscode.Uri.parse)return sourceControl();
    try {
      const changes=await (host.readFileStatus||readStudentFileStatus)(snapshot.root),code=changes.statusCodes?.get(value.relative);
      if(host.readFileStatus)await readStudentFileStatus(snapshot.root);
      await requireCurrent();
      if(code&&code!==' M')return sourceControl();
      if(!code&&!dirty)return vscode.commands.executeCommand('vscode.open',target);
      const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0',GIT_LITERAL_PATHSPECS:'1'};
      const parents=[];let parent=snapshot.root;for(const part of value.relative.split('/').slice(0,-1)){parent=path.join(parent,part);const stat=await fs.lstat(parent);if(!stat.isDirectory()||stat.isSymbolicLink()||await fs.realpath(parent)!==parent)return sourceControl();parents.push({parent,stat});}
      const git=async args=>(await exec('git',['--no-pager','--no-lazy-fetch','-c','core.fsmonitor=false','-c',`core.hooksPath=${require('node:os').devNull}`,...args],{cwd:snapshot.root,env,encoding:'buffer',timeout:10000,maxBuffer:1024*1024})).stdout;
      const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      if(await fs.realpath(decode(await git(['rev-parse','--show-toplevel'])).trim())!==snapshot.root)return sourceControl();
      const inspect=async(_root,args)=>decode(await git(args));await refuseFilters(snapshot.root,inspect,{extra:[value.relative]});
      const attrs=decode(await git(['check-attr','-z','--all','--',value.relative]));const fields=attrs?attrs.split('\0'):[];if(fields.length&&fields.pop()!=='')return sourceControl();if(fields.length%3)return sourceControl();for(let i=0;i<fields.length;i+=3){if(fields[i]!==value.relative)return sourceControl();const attr=fields[i+1],attrValue=fields[i+2];if(['filter','working-tree-encoding','ident','eol','diff'].includes(attr)||attr==='text'&&!['set','auto'].includes(attrValue))return sourceControl();}
      const head=decode(await git(['rev-parse','--verify','HEAD^{commit}'])).trim();
      if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head))return sourceControl();
      const tree=decode(await git(['ls-tree','-z',head,'--',value.relative])),match=/^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)\0$/.exec(tree);
      if(!match||match[3]!==value.relative)return sourceControl();
      const size=decode(await git(['cat-file','-s',match[2]])).trim();if(!/^\d+$/.test(size)||Number(size)>512*1024)return sourceControl();
      const bytes=await git(['cat-file','blob',match[2]]);if(bytes.length!==Number(size)||bytes.includes(0))return sourceControl();const before=decode(bytes);
      let current,version,fileIdentity;
      if(dirty){version=dirty.version;current=dirty.getText();if(typeof current!=='string'||Buffer.byteLength(current)>512*1024||current.includes('\0'))return sourceControl();}
      else {const stat=await fs.lstat(filename);fileIdentity=stat;if(!stat.isFile()||stat.isSymbolicLink()||stat.size>512*1024)return sourceControl();const h=await fs.open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));try{const opened=await h.stat();if(opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)return sourceControl();const data=Buffer.alloc(stat.size+1);let length=0;while(length<data.length){const part=await h.read(data,length,data.length-length,length);if(!part.bytesRead)break;length+=part.bytesRead;}const after=await h.stat();if(length!==stat.size||after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||after.ctimeMs!==stat.ctimeMs||data.subarray(0,length).includes(0))return sourceControl();current=decode(data.subarray(0,length));}finally{await h.close();}}
      for(const saved of parents){const stat=await fs.lstat(saved.parent);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.dev!==saved.stat.dev||stat.ino!==saved.stat.ino||await fs.realpath(saved.parent)!==saved.parent)return sourceControl();}const finalStat=await fs.lstat(filename);if(!finalStat.isFile()||finalStat.isSymbolicLink()||fileIdentity&&(finalStat.dev!==fileIdentity.dev||finalStat.ino!==fileIdentity.ino||finalStat.size!==fileIdentity.size||finalStat.mtimeMs!==fileIdentity.mtimeMs||finalStat.ctimeMs!==fileIdentity.ctimeMs))return sourceControl();
      if(disposed||value.generation!==generation||vscode.workspace.isTrusted!==true||await host.project()!==snapshot.root||decode(await git(['rev-parse','--verify','HEAD^{commit}'])).trim()!==head||dirty&&(dirty.isClosed||!dirty.isDirty||dirty.version!==version||!(vscode.workspace.textDocuments||[]).includes(dirty)))return sourceControl();
      if(before.includes('\r')||current.includes('\r'))return sourceControl();await refuseFilters(snapshot.root,inspect,{extra:[value.relative]});if(decode(await git(['check-attr','-z','--all','--',value.relative]))!==attrs||decode(await git(['rev-parse','--verify','HEAD^{commit}'])).trim()!==head||await findDirty()!==dirty)return sourceControl();const latest=await (host.readFileStatus||readStudentFileStatus)(snapshot.root);await requireCurrent();if(latest.statusCodes?.get(value.relative)!==code)return sourceControl();if(disposed||value.generation!==generation||vscode.workspace.isTrusted!==true||dirty&&(dirty.isClosed||!dirty.isDirty||dirty.version!==version||!(vscode.workspace.textDocuments||[]).includes(dirty)))return sourceControl();
      if(diffSnapshots.size>=40)return sourceControl();const uri=vscode.Uri.parse(`zero-files-snapshot:/${crypto.randomUUID()}`);diffSnapshots.set(uri.toString(),before);
      try{return await vscode.commands.executeCommand('vscode.diff',uri,dirty?dirty.uri:target,`${path.basename(value.relative)} · last commit ↔ working file`,{preview:true});}catch(error){diffSnapshots.delete(uri.toString());throw error;}
    }catch(error){if(error.code==='ZERO_STALE_FILES')throw error;await requireCurrent();host.output.appendLine(`Could not open file comparison: ${error.message}`);return sourceControl();}
  }
  async function restoreDeleted(value) {
    if(disposed||host.isBusy())return;
    const snapshot=await fresh(value);
    if(value.kind!=='deleted'||value.retained||!value.canRestoreDeleted||!value.relative)throw Error('Select a deleted project file to restore.');
    const changes=await (host.readFileStatus||readStudentFileStatus)(snapshot.root);
    if(disposed||value.generation!==generation||await host.project()!==snapshot.root||changes.get(value.relative)!=='deleted')throw Error('The project view changed. Select the deleted file again.');
    try {return await host.execute('zero.restoreDeletedFile',{root:snapshot.root,relative:value.relative});}finally{invalidate();}
  }
  async function restoreModified(value) {
    if(disposed||host.isBusy())return;
    const snapshot=await fresh(value);
    if(value.kind!=='file'||value.retained||!value.canRestoreModified||!value.relative)throw Error('Select a modified tracked file to restore.');
    const changes=await (host.readFileStatus||readStudentFileStatus)(snapshot.root);
    if(disposed||value.generation!==generation||await host.project()!==snapshot.root||![' M','MM','AM'].includes(changes.statusCodes?.get(value.relative)))throw Error('The project view changed. Select the modified file again.');
    try{return await host.execute('zero.restoreModifiedFile',{root:snapshot.root,relative:value.relative});}finally{invalidate();}
  }
  async function restoreCommitted(value) {
    if(disposed||host.isBusy())return;
    const snapshot=await fresh(value);
    if(value.kind!=='file'||value.retained||!value.canRestoreCommitted||!value.relative)throw Error('Select a staged modified file to restore.');
    const changes=await (host.readFileStatus||readStudentFileStatus)(snapshot.root);
    if(disposed||value.generation!==generation||await host.project()!==snapshot.root||!['M ','MM'].includes(changes.statusCodes?.get(value.relative)))throw Error('The project view changed. Select the staged file again.');
    try{return await host.execute('zero.restoreCommittedFile',{root:snapshot.root,relative:value.relative});}finally{invalidate();}
  }
  async function removeAdded(value) {
    if(disposed||host.isBusy())return;
    const snapshot=await fresh(value);
    if(value.kind!=='file'||value.retained||!value.canRemoveAdded||!value.relative)throw Error('Select an added project file to remove.');
    const changes=await (host.readFileStatus||readStudentFileStatus)(snapshot.root);
    if(disposed||value.generation!==generation||await host.project()!==snapshot.root||!['??','A ','AM'].includes(changes.statusCodes?.get(value.relative)))throw Error('The project view changed. Select the added file again.');
    try{return await host.execute('zero.removeAddedFile',{root:snapshot.root,relative:value.relative});}finally{invalidate();}
  }
  async function invoke(value) {
    if(value?.command==='zero.showAllProjectFiles'&&known.has(value))return showAll();
    if(host.isBusy())return;
    if(!known.has(value)||value.kind!=='action'||value.generation!==generation||!['zero.libraryReference','zero.copyLibraryImports','zero.switchLibraryMode','zero.checkLibrary','zero.shareLibrary'].includes(value.command))throw Error('The project view changed. Select the action again.');
    const root=await host.project();
    if(disposed||root!==value.context?.root)throw Error('The project changed. Select the library again.');
    try {return await host.execute(value.command,value.context);}finally{invalidate();}
  }
  async function copyAsset(value) {
    const snapshot=await fresh(value);
    if(value.kind!=='file'||!value.area?.endsWith('assets')||value.retained)throw Error('Select an asset file in the active project.');
    const context={root:snapshot.root,area:value.area,relative:path.posix.dirname(value.relative),libraryFolder:value.libraryFolder};
    const target=await resolveAuthoringTarget(snapshot.root,context,'asset');
    const entries=await ordinaryEntries(snapshot.root,context.relative);
    if(!entries.some(entry=>entry.relative===value.relative&&!entry.directory))throw Error('The asset changed. Select it again.');
    if(disposed||value.generation!==generation||await host.project()!==snapshot.root)throw Error('The project changed. Copy the asset path again.');
    const literal=JSON.stringify('/'+value.relative.slice(target.resourceBaseRelative.length+1));
    await vscode.env.clipboard.writeText(literal);host.report?.('Asset path copied',literal);
  }
  async function showAll(){return vscode.commands.executeCommand('workbench.view.explorer');}
  async function collapseAll(){
    if(disposed)return;
    await vscode.commands.executeCommand('zero.studentProject.focus');
    if(!disposed)return vscode.commands.executeCommand('list.collapseAll');
  }
  async function setPreview(enabled) {
    if(disposed)return;
    preview=enabled;
    await host.workspaceState.update('zero.studentExplorerPreview',enabled);
    await vscode.commands.executeCommand('setContext','zero.studentExplorerPreview',enabled);
    invalidate();
    if(enabled) {await vscode.commands.executeCommand('workbench.view.extension.zero-student-explorer');await vscode.commands.executeCommand('zero.studentProject.focus');}
    else {await showAll();await vscode.commands.executeCommand('zero.controls.focus');}
  }
  const provider={onDidChangeTreeData:events.event,getChildren:children,getTreeItem:item};
  const tree=vscode.window.createTreeView('zero.studentProject',{treeDataProvider:provider,showCollapseAll:false,canSelectMany:false});
  const selectionEvents=tree.onDidChangeSelection?.(updateSelection);updateSelection();
  const folders=vscode.workspace.onDidChangeWorkspaceFolders(()=>{watcher?.dispose();watcher=undefined;invalidate();});
  const trust=vscode.workspace.onDidGrantWorkspaceTrust?.(()=>invalidate());
  const documents=['onDidChangeTextDocument','onDidSaveTextDocument','onDidCloseTextDocument'].map(name=>vscode.workspace[name]?.(doc=>{if(name==='onDidCloseTextDocument'&&doc?.uri?.scheme==='zero-files-snapshot')diffSnapshots.delete(doc.uri.toString());invalidate();})).filter(Boolean);
  void vscode.commands.executeCommand('setContext','zero.studentExplorerPreview',preview);
  setDiscardAvailable(false);
  return {provider,tree,invalidate,isPreview:()=>preview,
    commands:{'zero.previewStudentExplorer':()=>setPreview(true),'zero.standardExplorer':()=>setPreview(false),'zero.showAllProjectFiles':showAll,
      'zero.refreshStudentExplorer':invalidate,'zero.collapseStudentExplorer':collapseAll,'zero.explorerOpenFile':open,'zero.explorerAction':invoke,'zero.explorerRenameFile':rename,'zero.explorerRestoreDeletedFile':restoreDeleted,'zero.explorerRestoreModifiedFile':restoreModified,'zero.explorerRestoreCommittedFile':restoreCommitted,'zero.explorerRemoveAddedFile':removeAdded,
      'zero.explorerCopyAssetPath':copyAsset,
      ...Object.fromEntries(['newClass','newPackage','newFile','newFolder','importAssets'].flatMap(name=>[[`zero.explorer${name[0].toUpperCase()+name.slice(1)}`,value=>create(`zero.${name}`,value)],[`zero.project${name[0].toUpperCase()+name.slice(1)}`,()=>createSelected(`zero.${name}`)]]))},
    dispose(){disposed=true;generation++;setDiscardAvailable(false);clearTimeout(timer);watcher?.dispose();folders.dispose();trust?.dispose();for(const document of documents)document.dispose();selectionEvents?.dispose();diffProvider?.dispose();diffSnapshots.clear();tree.dispose();events.dispose();}
  };
}
module.exports={createStudentExplorer};
