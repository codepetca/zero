'use strict';
const path = require('node:path');
const {readProjectModel,ordinaryEntries,isToolingPath} = require('./project-explorer-model');
const {resolveAuthoringTarget} = require('./file-targets');
const {authoringLocation} = require('./explorer-labels');

// Tree nodes are navigation data. Every action resolves its project and canonical
// library/authoring boundary again; a label or resource URI never grants writes.
function createStudentExplorer(vscode, host) {
  const events = new vscode.EventEmitter();
  const known = new WeakSet();
  let generation=0, pending, model, disposed=false, watcher, timer;
  // Keep the persisted key so an explicit Standard Explorer choice survives upgrades.
  let preview=host.workspaceState.get('zero.studentExplorerPreview',true) !== false;
  const collapsed=vscode.TreeItemCollapsibleState.Collapsed, expanded=vscode.TreeItemCollapsibleState.Expanded;
  const node = fields => {const value={generation,...fields};known.add(value);return value;};
  const action = (label,command,context) => node({kind:'action',label,command,context});
  const allFiles = () => action('Show all project files','zero.showAllProjectFiles');
  function invalidate() {
    if (disposed) return;
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
    const owned=watcher;watcher={dispose(){for(const subscription of subscriptions)subscription.dispose();owned.dispose();}};
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
        if (disposed || generation!==attempt || await host.project()!==root) return;
        if (disposed || generation!==attempt) return;
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
        if(snapshot.libraries.length)result.push(node({kind:'libraries',root:snapshot.root,label:'Libraries'}));
        if(snapshot.otherEntries.length)result.push(node({kind:'other',root:snapshot.root,label:'Other project files'}));
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
      if(disposed||attempt!==generation)return [];
      const library=parent.libraryId?snapshot.libraries.find(item=>item.id===parent.libraryId):undefined;
      if(parent.libraryId&&!library)return [];
      return entries.map(entry=>node({kind:entry.directory?'folder':'file',root:snapshot.root,label:entry.name,relative:entry.relative,
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
    if(value.relative)result.resourceUri=vscode.Uri.file(path.join(value.root,value.relative));
    if(value.kind==='file')result.command={command:'zero.explorerOpenFile',title:'Open file',arguments:[value]};
    if(value.kind==='action')result.command={command:'zero.explorerAction',title:value.label,arguments:[value]};
    if(!value.relative)result.iconPath=new vscode.ThemeIcon(value.kind==='library'||value.kind==='libraries'?'library':value.kind==='action'?'arrow-right':'files');
    result.contextValue=value.kind==='library'?'zeroLibrary':value.area&&!value.retained?(value.area==='project'?(value.kind==='file'?'zeroProjectFile':'zeroProject'):value.area.endsWith('code')?(value.kind==='file'?'zeroCodeFile':'zeroCode'):value.kind==='file'?'zeroAssetFile':'zeroAssets'):value.kind==='other'?'zeroProject':'zeroReadonly';
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
    const entries=await ordinaryEntries(snapshot.root,path.posix.dirname(value.relative)==='.'?'':path.posix.dirname(value.relative));
    if(!entries.some(entry=>entry.relative===value.relative&&!entry.directory))throw Error('The file changed. Select it again.');
    if(disposed||await host.project()!==snapshot.root)throw Error('The project changed. Open the file again.');
    return vscode.commands.executeCommand('vscode.open',vscode.Uri.file(path.join(snapshot.root,value.relative)));
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
  const tree=vscode.window.createTreeView('zero.studentProject',{treeDataProvider:provider,showCollapseAll:true,canSelectMany:false});
  const selectionEvents=tree.onDidChangeSelection?.(updateSelection);updateSelection();
  const folders=vscode.workspace.onDidChangeWorkspaceFolders(()=>{watcher?.dispose();watcher=undefined;invalidate();});
  void vscode.commands.executeCommand('setContext','zero.studentExplorerPreview',preview);
  return {provider,tree,invalidate,isPreview:()=>preview,
    commands:{'zero.previewStudentExplorer':()=>setPreview(true),'zero.standardExplorer':()=>setPreview(false),'zero.showAllProjectFiles':showAll,
      'zero.refreshStudentExplorer':invalidate,'zero.explorerOpenFile':open,'zero.explorerAction':invoke,'zero.explorerRenameFile':rename,
      'zero.explorerCopyAssetPath':copyAsset,
      ...Object.fromEntries(['newClass','newPackage','newFile','newFolder','importAssets'].flatMap(name=>[[`zero.explorer${name[0].toUpperCase()+name.slice(1)}`,value=>create(`zero.${name}`,value)],[`zero.project${name[0].toUpperCase()+name.slice(1)}`,()=>createSelected(`zero.${name}`)]]))},
    dispose(){disposed=true;generation++;clearTimeout(timer);watcher?.dispose();folders.dispose();selectionEvents?.dispose();tree.dispose();events.dispose();}
  };
}
module.exports={createStudentExplorer};
