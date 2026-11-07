'use strict';
const editor = require('vscode');
const {minimalPrompts} = require('./prompts');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {publishProgressHtml} = require('./publish-progress');
const core = require('./core');
const {guardedRunner} = require('./git-filter-guard');
const {readStudentFileStatus} = require('./student-file-status');
const {nativeBuildIdentity,createNativeRuntimeExecution} = require('./native-runtime-task');
const {verifyManagedJava} = require('./managed-java');
const {createNativeCompilerDiagnostics} = require('./native-compiler-diagnostics');
const lessonProjects = require('./lesson-projects');
const github = require('./github');
const {commitAndSync} = require('./student-commit');
const commitProvenance = require('./commit-provenance');
const {createPendingSyncLedger,matchesConfirmed} = require('./pending-sync-ledger');
const {createRepositoryReminderStorage} = require('./repository-reminder-storage');
const {serializeRepositoryReminders} = require('./repository-reminder-queue');
const {recoveryMessage} = require('./local-recovery-message');
const {checkMainUpdate} = require('./main-update-status');
const {checkBranchRemote,errorState:branchCheckError,statusMessage:branchStatusMessage} = require('./branch-remote-status');
const workflow = require('./workflow');
const gitRecoveryPanel = require('./git-recovery-panel');
const retainedRecovery = require('./git-retained-recovery');
const addedRemovalInspection = require('./added-removal-inspection');
const stagedRemovalInspection = require('./added-removal-staged-inspection');
const reftableSwitchInspection = require('./reftable-switch-inspection');
const reftableSwitchResolution = require('./reftable-switch-resolution');
const reftableUpdateInspection = require('./reftable-update-inspection');
const reftableUpdateResolution = require('./reftable-update-resolution');
const {updateRemoteTracking} = require('./git-tracking');
const {createAuthentication,ownedProviderApi} = require('./authentication');
const {createNativeGitAuthentication} = require('./native-git-authentication');
const {githubAppConfiguration} = require('./github-app/config');
const {createGitHubAppProvider} = require('./github-app/provider');
const {createGitHubAppRepositories,repositoryIdentity,assertRepositoryIdentity} = require('./github-app/repositories');
const {createGitHubAppClone} = require('./github-app/clone');
const {createGitHubProjectCommands} = require('./github-app/projects-ui');
const {createProjectFolders} = require('./project-folders');
const {createProjectWindow} = require('./project-window');
const {createRecentProjects} = require('./recent-projects');
const {createProjectPicker} = require('./project-picker');
const {createGitHubReadiness} = require('./github-app/readiness');
const {createGitHubSetup} = require('./github-app/setup-ui');
const {selectUploadAuthentication} = require('./web-publish-upload-auth');
const {createTransport} = require('./transport');
// Explicit ref-only recovery review is available after safety review.
const ENABLE_REF_ONLY_REVIEW = true;
// Release helper dispatch stays closed until package and CI validation.
const ENABLE_PACKAGED_UNTRACKED_REMOVAL = false;
const ENABLE_DEV_UNTRACKED_REMOVAL = false;
const ENABLE_STAGED_ADDED_REMOVAL = false;
const {createSharingEditor} = require('./sharing/editor');
const {readKitConfiguration} = require('./sharing/configuration');
const {createSetupHelp} = require('./setup');
const {isSetupProject,findSetupProject} = require('./setup-project');
const {createNativeUpdateCommands} = require('./native-updates');
const {createNativeUpdateReload} = require('./native-update-reload');
const {createWebExportCommands} = require('./web-export-ui');
const {createProjectBuilder,readSavedBuilder} = require('./project-builder');
const {createBrowserRunCommands,sourceDiagnostics} = require('./web-run-ui');
const {createSavedSourceStatus}=require('./saved-source-status');
const {createSavedSourceHost}=require('./saved-source-host');
const {runtimeDiagnostics}=require('./runtime-session');
const {openTutorialDocs} = require('./tutorial-browser');
const {createStartPage} = require('./start-page');
const {createWebPublishCommands} = require('./web-publish-ui');
const {createAssetCommands} = require('./assets');
const {createFileCommands} = require('./file-actions');
const {createRenameCommands} = require('./file-rename');
const {createStudentExplorer} = require('./student-explorer');
const {createRecoveryCommands} = require('./recovery');
const {createChangeHistory} = require('./change-history');
const changeUndo = require('./change-undo');
const {undoLatestCommit} = require('./commit-undo-primitive');
const {createCommitUndoAuthority} = require('./commit-undo-authority');
const projectRestore = require('./project-restore-plan');
const discardPreview = require('./discard-preview');
const unbornRemoval = require('./unborn-added-removal');
const unbornDiscard = require('./unborn-discard');
const {sidebarStyles} = require('./sidebar-style');
const {sidebarScript} = require('./sidebar-script');
const {icon} = require('./sidebar-icons');
const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function dirtyProjectDocuments(vscode, root) {
  const canonical = async value => {
    let current=path.resolve(value),suffix=[];
    while(true) {
      try {return path.join(await fs.realpath(current),...suffix);}
      catch(error) {if(error.code!=='ENOENT')throw error;const parent=path.dirname(current);if(parent===current)throw error;suffix.unshift(path.basename(current));current=parent;}
    }
  };
  const projectPath=await canonical(root),normalize=value=>process.platform==='win32'?value.toLowerCase():value;
  const inside=(base,name)=>{const relative=path.relative(normalize(base),normalize(name));return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
  const lexicalRoots=[root];
  for(const folder of vscode.workspace.workspaceFolders||[]) {
    try {const real=await canonical(folder.uri.fsPath);if(!inside(real,projectPath)&&normalize(real)!==normalize(projectPath))continue;lexicalRoots.push(path.join(folder.uri.fsPath,path.relative(real,projectPath)));} catch {}
  }
  const documents=(vscode.workspace.textDocuments||[]).filter(document=>document.isDirty&&document.uri?.scheme==='file'&&document.uri.fsPath);
  const entries=await Promise.all(documents.map(async document=>{
    const name=document.uri.fsPath;
    try {return {document,targets:[await canonical(name),path.join(await canonical(path.dirname(name)),path.basename(name))]};}
    catch(error) {if(lexicalRoots.some(base=>inside(path.resolve(base),path.resolve(name))))throw error;return {document,targets:[]};}
  }));
  return entries.filter(entry=>entry.targets.some(name=>inside(projectPath,name))).map(entry=>entry.document);
}

// Compare all Git-visible changes except the exact files whose reviewed editor
// buffers are about to be saved. Index state must remain unchanged throughout.
async function switchDiskSnapshot(root, status, editorPaths) {
  const entries=status.split('\0').filter(Boolean),rows=[];
  for(let i=0;i<entries.length;i++) {
    const entry=entries[i],kind=entry.slice(0,2),names=[entry.slice(3)];
    if(/[RC]/.test(kind))names.push(entries[++i]);
    for(const name of names) {
      if(!name||path.isAbsolute(name))throw new Error('The project changes cannot be reviewed safely.');
      const file=path.resolve(root,name),relative=path.relative(root,file);
      if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('The project changes cannot be reviewed safely.');
      if(editorPaths.has(file))continue;
      try {
        const info=await fs.lstat(file);let content;
        if(info.isSymbolicLink())content=`link:${await fs.readlink(file)}`;
        else if(info.isFile())content=crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
        else throw new Error('A changed path cannot be reviewed safely.');
        rows.push([name,kind,info.mode,content]);
      } catch(error) {if(error.code==='ENOENT')rows.push([name,kind,'missing']);else throw error;}
    }
  }
  return JSON.stringify([await core.git(root,['ls-files','--stage','-z']),rows.sort((a,b)=>a[0].localeCompare(b[0]))]);
}

// Treat an absent HEAD as unborn only when its direct branch ref is absent
// in ordinary loose and packed storage. A broken ref is not an empty history.
async function verifiedUnbornBranch(root,branch) {
  const layout=await core.inspectGitLayout(root,core.git),ref=`refs/heads/${branch}`;
  if(await core.currentBranch(root,core.git)!==branch)throw Error('The branch changed.');
  try {await core.git(root,['rev-parse','--verify','--quiet',`${ref}^{commit}`]);throw Error('The branch exists.');}
  catch(error) {if(error.code!==1||String(error.stderr||'').trim())throw error;}
  const absent=async file=>{try{await fs.lstat(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}};
  if(!await absent(path.join(layout.commonDir,...ref.split('/')))||!await absent(path.join(layout.commonDir,'reftable')))throw Error('Branch storage is not an ordinary unborn branch.');
  const packed=path.join(layout.commonDir,'packed-refs');let packedIdentity;
  try {
    const info=await fs.lstat(packed);packedIdentity=info;if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>4*1024*1024)throw Error('Packed branches cannot be verified.');
    const handle=await fs.open(packed,fsSync.constants.O_RDONLY|(fsSync.constants.O_NOFOLLOW||0));
    try {
      const before=await handle.stat(),data=await handle.readFile(),after=await handle.stat(),now=await fs.lstat(packed);
      if(before.dev!==info.dev||before.ino!==info.ino||before.size!==info.size||after.dev!==before.dev||after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs||now.dev!==before.dev||now.ino!==before.ino||now.size!==before.size||now.mtimeMs!==before.mtimeMs||data.length!==before.size)throw Error('Packed branches changed.');
      const text=new TextDecoder('utf-8',{fatal:true}).decode(data);if(text&&!text.endsWith('\n'))throw Error('Packed branches cannot be verified.');
      for(const row of text.split('\n').filter(Boolean)) {
        if(row.startsWith('#')||/^\^[a-f0-9]{40,64}$/.test(row))continue;
        const entry=/^[a-f0-9]{40,64} (refs\/[^\s]+)$/.exec(row);if(!entry||entry[1]===ref)throw Error('Packed branches cannot be verified.');
      }
    } finally {await handle.close();}
  } catch(error) {if(error.code!=='ENOENT')throw error;}
  if(packedIdentity) {const now=await fs.lstat(packed);if(now.dev!==packedIdentity.dev||now.ino!==packedIdentity.ino||now.size!==packedIdentity.size||now.mtimeMs!==packedIdentity.mtimeMs||now.ctimeMs!==packedIdentity.ctimeMs)throw Error('Packed branches changed.');}
  else if(!await absent(packed))throw Error('Packed branches changed.');
  if((await core.inspectGitLayout(root,core.git)).identity!==layout.identity||await core.currentBranch(root,core.git)!==branch||!await absent(path.join(layout.commonDir,...ref.split('/')))||!await absent(path.join(layout.commonDir,'reftable')))throw Error('The branch changed.');
  return true;
}

function activate(context, services = {}) {
  const vscode = minimalPrompts(editor);
  const launchedForZero = path.isAbsolute((services.env || process.env).ZERO_KIT_DIR || '');
  for (const [id, action] of Object.entries(createNativeUpdateCommands(vscode))) {
    context.subscriptions.push(vscode.commands.registerCommand(id, action));
  }
  const output = vscode.window.createOutputChannel('Zero');
  const sidebarShortcut = vscode.window.createStatusBarItem?.('zero.backToSidebar',vscode.StatusBarAlignment?.Left,1000);
  if (sidebarShortcut) {
    sidebarShortcut.name='Back to Zero';
    sidebarShortcut.text='Zero';
    sidebarShortcut.tooltip='Return to Zero’s Run, files and project controls';
    sidebarShortcut.accessibilityInformation={label:'Back to Zero',role:'button'};
    sidebarShortcut.command='zero.showSidebar';
    context.subscriptions.push(sidebarShortcut);
  }
  let execution, ending, pendingLaunch;
  const controlViews=new Set(),renderedWebviews=new WeakSet();
  let studentExplorer;
  let runGeneration = 0;
  let nativeStarting = 0, stopPromise;
  const nativeIdleWaiters = new Set();
  function nativePrepared() {
    nativeStarting--;
    if (!nativeStarting) {for (const resolve of nativeIdleWaiters) resolve();nativeIdleWaiters.clear();}
    refresh();
  }
  const nativeIdle = () => nativeStarting ? new Promise(resolve=>nativeIdleWaiters.add(resolve)) : Promise.resolve();
  let uploading = false;
  let uploadProgress = '';
  let connecting = false;
  let startingTutorial = false;
  let signingIn = false;
  let disposed = false;
  context.subscriptions.push({dispose() { disposed = true; }});
  let changing = false;
  let menuOpen = false;
  let componentBusy = false;
  let maintenanceBusy = false;
  let exportingWeb = false;
  let browserBusy = false;
  let browserActive = false;
  let publishingWeb = false, publishProgress;
  let exportReadyRoot;
  let branch = '';
  let branchHead,mainLocalHead,branchRemoteStatus,branchAuthHint,branchAuthEpoch=0,branchCheckRunning=false,branchCheckPending=false,branchCheckNextAt=0;
  const branchCheckWaiters=new Set();
  const missingBranchObservations=new Map();
  let branchDetached = false, branchError;
  let history,recentHistory,recentGeneration=0;
  let mainUpdateStatus,mainUpdateScope,mainUpdateRunning=false,mainUpdateGeneration=0,mainUpdateNextAt=0;
  let projectDirty, projectUnsaved, projectDirtyError, projectDirtyGeneration=0, projectDirtyTimer;
  let updateRecovery, updateRecoveryError, pendingUpload;
  let pendingLocalCommit;
  const pendingLedger=createPendingSyncLedger(context.workspaceState,{onFallback:()=>{if(services.repositoryLedgerFactory)return;const message='Sync reminders are available only in this window; review them before closing it.';output.appendLine(message);void vscode.window.showWarningMessage?.(message);}});
  const legacyPush=(root,branch)=>context.workspaceState?.get?.(`zero.gitUploadRecovery:${root}:${branch}`);
  const legacyLocal=(root,branch)=>{const value=context.workspaceState?.get?.(`zero.localCommitPending:${root}:${branch}`);return value&&{...value,remote:'',type:'local'};};
  // Windows and hosts without enumerable Memento keep the existing explicit
  // compatibility path. A selected file ledger never falls back after failure.
  const reminderStorage=services.repositoryLedgerFactory
    ? services.repositoryLedgerFactory({state:context.workspaceState})
    : process.platform!=='win32'&&pendingLedger.enumerable?createRepositoryReminderStorage({state:context.workspaceState,onCompatibility:message=>output.appendLine(message)}):undefined;
  const repositoryLedger=reminderStorage&&serializeRepositoryReminders(reminderStorage);
  const compatibilityRecords=(root,branch)=>[...pendingLedger.list(root,branch,legacyPush(root,branch)).filter(record=>record.type!=='local'),...pendingLedger.list(root,branch,legacyLocal(root,branch)).filter(record=>record.type==='local')];
  const compatibilityAll=(root,branch)=>pendingLedger.listAll(root,[legacyPush(root,branch),legacyLocal(root,branch)].filter(Boolean));
  const splitReminders=(records,root,branch)=>{const rows=[...new Map(records.filter(record=>record.root===root&&record.branch===branch).map(record=>[record.id,record])).values()].sort((a,b)=>a.id.localeCompare(b.id));return {push:rows.filter(record=>record.type!=='local'),local:rows.filter(record=>record.type==='local')};};
  const pushOperation=record=>!record.operation||['branch','reftable-update'].includes(record.operation)?'branch':record.operation;
  const knownPushKinds=new Set(['ready','in-progress','network','auth','access','unconfirmed','behind','protected','changed','remote-missing','destination-changed']);
  const knownPush=record=>Boolean(record)&&(record.kind===undefined||knownPushKinds.has(record.kind))&&(record.type===undefined||record.type==='push')&&(record.operation===undefined||record.operation==='branch'||record.operation==='merge'||record.operation==='reftable-update');
  const samePushGroup=(a,b)=>knownPush(a)&&knownPush(b)&&['root','branch','remote','head','accountId'].every(key=>a[key]===b[key])&&pushOperation(a)===pushOperation(b);
  const selectPushReminder=rows=>{
    const first=rows[0];if(!first)return undefined;
    if(!knownPush(first))return first;
    // UUID ordering is not an outcome ordering. Within one exact destination,
    // prefer unresolved confirmation or observed absence over a generic error.
    const rank=record=>record.kind==='unconfirmed'?0:record.kind==='changed'?1:record.kind==='remote-missing'?2:record.kind==='behind'?3:record.pushStarted!==false&&['network','ready'].includes(record.kind)?4:5;
    return rows.filter(row=>samePushGroup(row,first)).sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id))[0];
  };
  const allReminderRecords=async(root,tx)=>{if(!repositoryLedger)return undefined;return (await(tx?tx.list():repositoryLedger.list(root))).filter(record=>record.root===root).sort((a,b)=>a.id.localeCompare(b.id));};
  const readReminders=async(root,branch,tx)=>splitReminders(repositoryLedger?await allReminderRecords(root,tx):compatibilityRecords(root,branch),root,branch);
  const pushRecords=async(root,branch,tx)=>(await readReminders(root,branch,tx)).push;
  const localRecords=async(root,branch,tx)=>(await readReminders(root,branch,tx)).local;
  const addReminder=(root,record,tx)=>repositoryLedger?(tx?tx.add(record):repositoryLedger.add(root,record)):pendingLedger.add(record);
  const resolveReminder=(record,reason,tx)=>repositoryLedger?(tx?tx.resolve(record.id,reason):repositoryLedger.resolve(record.root,record.id,reason)):pendingLedger.resolve(record,reason);
  const supportsFileReminders=async root=>Boolean(repositoryLedger)&&(!repositoryLedger.supportsFileLedger||await repositoryLedger.supportsFileLedger(root));
  const withReminderProvenance=(root,binding,execute)=>repositoryLedger?repositoryLedger.withProvenance(root,binding,execute):execute(undefined,binding);
  const updatePreviews = new Map();
  if (vscode.workspace.registerTextDocumentContentProvider) context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('zero-update-preview',{provideTextDocumentContent:uri=>updatePreviews.get(uri.toString()) || ''}));
  const retainedPreviews = new Map();
  if (vscode.workspace.registerTextDocumentContentProvider) context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('zero-retained-recovery',{provideTextDocumentContent:uri=>retainedPreviews.get(uri.toString()) || ''}));
  if (vscode.workspace.onDidCloseTextDocument) context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document=>{if(document.uri.scheme==='zero-retained-recovery')retainedPreviews.delete(document.uri.toString());}));
  if (vscode.workspace.onDidChangeWorkspaceFolders) context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(()=>retainedPreviews.clear()));
  context.subscriptions.push({dispose:()=>retainedPreviews.clear()});
  let statusGeneration = 0;
  const isBusy = () => Boolean(stopPromise) || uploading || connecting || startingTutorial || signingIn || changing || menuOpen || componentBusy || maintenanceBusy || exportingWeb || publishingWeb || browserBusy;
  let projectRoot;
  let projectUpdateRoot, projectUpdateAvailable=false, projectUpdateGeneration=0;
  let inspectProjectUpdate=()=>{};
  let startPage;
  const uploadMode = (root = projectRoot) => root ? vscode.workspace.getConfiguration('zero', vscode.Uri.file(root)).get('uploadMode', 'live') : 'live';
  let runQueue = Promise.resolve();
  let state = '';
  let authFeedback;
  let buildFailed = false;
  const stoppedTasks = new WeakSet();
  const taskExitCodes = new WeakMap();
  let repository = 'No repository connected';
  let localPractice = false;
  let originalWork = false;
  let savedBuilderInspectedRoot,savedChecks,savedChecksRoot,savedChecksState,savedPreparation;
  let savedChecksEnableGeneration=0;
  const project = async () => {
    let root;const folders=()=>(vscode.workspace.workspaceFolders||[]).map(folder=>folder.uri.fsPath);const requested=folders(),sameWorkspace=()=>JSON.stringify(folders())===JSON.stringify(requested);
    try {root = await core.resolveProject(requested);}
    catch(error) {if(sameWorkspace()){projectRoot=undefined;projectUpdateRoot=undefined;projectUpdateAvailable=false;projectUpdateGeneration++;localPractice=false;originalWork=false;}throw error;}
    const practice = await lessonProjects.isLocalPractice(root);
    const original = !practice && !await lessonProjects.tutorialMarker(root);
    if(savedBuilderInspectedRoot!==root){savedBuilderInspectedRoot=root;try{await readSavedBuilder(root,{metadataOnly:true});}catch(error){output.appendLine(error.message);}}
    if(!sameWorkspace())throw new Error('The project changed. Try again in the current workspace.');
    if(savedChecksRoot&&savedChecksRoot!==root){savedChecks.dispose();savedChecks=undefined;savedChecksRoot=undefined;savedChecksState=undefined;}
    if(projectRoot!==root){projectDirty=undefined;projectUnsaved=undefined;projectDirtyGeneration++;}
    projectRoot = root; localPractice = practice; originalWork = original;
    inspectProjectUpdate(root);
    return root;
  };
  const refreshSidebarShortcut = (pageOpen = startPage?.isOpen()) => {
    if (!sidebarShortcut) return;
    const zeroWindow = projectRoot || !(vscode.workspace.workspaceFolders || []).length || pageOpen;
    if (!disposed && zeroWindow) sidebarShortcut.show();else sidebarShortcut.hide();
  };
  const refresh = () => {
    refreshSidebarShortcut();
    for(const view of controlViews)render(view.webview,view.viewType==='zero.studentControls');startPage?.refresh();
  };
  // Commit availability belongs to the project, not the lazily loaded file tree.
  let dirtyMetadataWatch;
  function clearDirtyMetadataWatch(){dirtyMetadataWatch?.dispose();dirtyMetadataWatch=undefined;}
  function watchDirtyMetadata(root,directories) {
    const key=JSON.stringify([root,...directories]);
    if(dirtyMetadataWatch?.key===key)return false;
    clearDirtyMetadataWatch();
    const owned=[],subscriptions=[],watch={key,root,dispose(){for(const item of subscriptions)item.dispose();for(const item of owned)item.dispose();}};
    dirtyMetadataWatch=watch;
    try {for(const directory of new Set(directories)){
      const item=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(directory,'{HEAD,index,config,packed-refs,refs/heads/**}'));owned.push(item);
      const changed=()=>{if(!disposed&&dirtyMetadataWatch===watch&&projectRoot===root&&vscode.workspace.isTrusted===true)scheduleProjectDirty();};
      for(const method of ['onDidCreate','onDidChange','onDidDelete'])subscriptions.push(item[method](changed));
    }}catch(error){clearDirtyMetadataWatch();throw error;}
    return true;
  }
  function scheduleProjectDirty() {
    const generation=++projectDirtyGeneration, root=projectRoot;
    projectDirty=undefined;projectUnsaved=undefined;projectDirtyError=undefined;refresh();clearTimeout(projectDirtyTimer);
    if(!root||disposed||vscode.workspace.isTrusted===false){clearDirtyMetadataWatch();return;}
    if(dirtyMetadataWatch&&dirtyMetadataWatch.root!==root)clearDirtyMetadataWatch();
    projectDirtyTimer=setTimeout(async()=>{
      try {
        let changes=await readStudentFileStatus(root);
        if(disposed||generation!==projectDirtyGeneration||root!==projectRoot||vscode.workspace.isTrusted!==true)return;
        const directories=changes.gitWatchDirectories;
        if(directories?.length&&watchDirtyMetadata(root,directories)){
          changes=await readStudentFileStatus(root);
          if(JSON.stringify(changes.gitWatchDirectories)!==JSON.stringify(directories))throw Error('Linked worktree metadata changed during refresh.');
        }else if(!directories?.length)clearDirtyMetadataWatch();
        const unsaved=(await dirtyProjectDocuments(vscode,root)).length>0;
        const dirty=changes.size>0;
        if(!disposed&&vscode.workspace.isTrusted===true&&generation===projectDirtyGeneration&&root===projectRoot&&await project()===root&&generation===projectDirtyGeneration){projectDirty=dirty;projectUnsaved=unsaved;refresh();}
      } catch(error) {if(!disposed&&generation===projectDirtyGeneration&&root===projectRoot){clearDirtyMetadataWatch();projectDirtyError='Commit status is unavailable. Use Source Control to inspect your changes.';output.appendLine(`File status unavailable: ${error.message}`);refresh();}}
    },60);
  }
  context.subscriptions.push({dispose(){projectDirtyGeneration++;clearTimeout(projectDirtyTimer);clearDirtyMetadataWatch();}});
  const report = (text, detail = text) => {state=text;output.appendLine(detail);refresh();};
  const hasOpenEditors = () => Boolean(vscode.window.activeTextEditor) || Boolean(vscode.window.tabGroups?.all.some(group => group.tabs.some(tab => !startPage?.owns(tab))));
  async function openFirstLesson(root, onlyWhenEmpty = false) {
    if (isSetupProject(root)) return false;
    const tutorial = await lessonProjects.tutorialMarker(root);
    if (!tutorial || await project() !== root || (onlyWhenEmpty && hasOpenEditors())) return false;
    if (!hasOpenEditors()) await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root,'src/main/java/Main.java'))), {preview:false});
    await openTutorialDocs(vscode, tutorial.lessonId);
    return true;
  }

  async function introduceProject({revealSidebar = true, addedFolders} = {}) {
    const folders = vscode.workspace.workspaceFolders || [];
    if (!folders.length && hasOpenEditors() && !launchedForZero) return;
    const root = folders.length ? await project() : undefined;
    if (!root) {
      if (!hasOpenEditors() && !startPage.isOpen()) await startPage.show({preserveFocus:false});
      return;
    }
    if (vscode.workspace.getConfiguration('chat').get('disableAIFeatures', false)) await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    if (revealSidebar && (!addedFolders || await core.resolveProject(addedFolders.map(folder => folder.uri.fsPath)).catch(() => undefined) === root)) {
      await actions['zero.showSidebar']();
      await context.workspaceState.update('zero.explorerShown', true);
      await context.workspaceState.update('zero.sidebarShown', true);
    }
    if (!root || isSetupProject(root)) return;
    const key = `zero.firstLessonShown:${root}`;
    // Preserve text editors and non-text tabs, including other lesson previews.
    if (!context.workspaceState.get(key) && !hasOpenEditors() && await openFirstLesson(root, true)) await context.workspaceState.update(key, true);
  }
  let githubReadiness,projectPicker,nativeGitAuthentication;
  const appConfiguration = githubAppConfiguration();
  const appProvider = services.provider || (appConfiguration ? createGitHubAppProvider({vscode,context,configuration:appConfiguration,onDiagnostic:message=>output.appendLine(message)}) : null);
  const auth = createAuthentication(ownedProviderApi(appProvider), () => {
    // Clear only feedback owned by authentication. Native runtime updates may
    // have replaced it while browser sign-in was pending.
    if (state.startsWith('Signed in as ') || (auth.signedIn && state === authFeedback)) {state='';authFeedback=undefined;}
    githubReadiness?.sync();projectPicker?.sessionChanged();
    const hint=JSON.stringify([auth.sessionId,auth.accountId,auth.signedIn,auth.revision]);
    if(hint!==branchAuthHint){branchAuthHint=hint;branchAuthEpoch++;branchRemoteStatus=undefined;branchCheckNextAt=0;mainUpdateStatus=undefined;mainUpdateGeneration++;mainUpdateNextAt=0;void checkCurrentBranch();void checkForMainUpdates();}
    refresh();
    void nativeGitAuthentication?.refresh();
  });
  context.subscriptions.push(auth);
  if (appProvider) {
    context.subscriptions.push(appProvider);
    context.subscriptions.push(vscode.authentication.registerAuthenticationProvider('zero-github','Zero GitHub',appProvider,{supportsMultipleAccounts:false}));
  }
  nativeGitAuthentication = createNativeGitAuthentication({vscode,authentication:auth,
    getGitAPI:services.getGitAPI,
    onChange:status => {if(status.phase !== 'disabled')output.appendLine(`Native Git prototype: ${status.message}`);}});
  context.subscriptions.push(nativeGitAuthentication);
  void nativeGitAuthentication.refresh();
  const repositories = services.repositories || createGitHubAppRepositories({authentication:auth,configuration:appConfiguration});
  githubReadiness = createGitHubReadiness({authentication:auth,repositories,installationUrl:appConfiguration && `https://github.com/apps/${appConfiguration.slug}/installations/new`,active:()=>!disposed,onChange:()=>{if (/^(?:Checking GitHub|GitHub sign-in|GitHub setup paused|GitHub is ready for your projects|Install Zero for GitHub\.)/.test(state)) state='';refresh();if(githubReadiness?.phase==='ready'&&Date.now()>=mainUpdateNextAt)void checkForMainUpdates();}});
  context.subscriptions.push(githubReadiness);
  const githubReady = () => auth.signedIn && githubReadiness.phase === 'ready';
  const cloneRepository = services.cloneRepository || createGitHubAppClone({authentication:auth,repositories});
  const recentProjects=createRecentProjects({globalState:context.globalState,active:()=>!disposed,eligible:root=>!isSetupProject(root)});
  async function rememberOpened({projectPath,repositoryUrl}) {
    const accountId=auth.accountId,label=auth.accountLabel;
    if(!accountId||disposed||!projectPath||isSetupProject(projectPath))return;
    if(!repositoryUrl) {try {repositoryUrl=core.parseRepositoryUrl(await core.git(projectPath,['remote','get-url','origin'])).page;}catch{}}
    if(repositoryUrl&&core.parseRepositoryUrl(repositoryUrl).page.split('/')[3].toLowerCase()!==label?.toLowerCase())return;
    await recentProjects.remember(projectPath,{accountId,repositoryUrl,isCurrent:()=>!disposed&&auth.accountId===accountId&&auth.accountLabel===label});
    startPage?.refresh({recent:true});
    // Folder opening can be vetoed without rejecting its command. Retain the
    // creation receipt until the intended workspace is actually active.
    const recovery=context.globalState?.get('zero.repositoryCreationRecovery');
    if(!repositoryUrl||recovery?.stage!=='created'||recovery.projectRoot||recovery.accountId!==accountId)return;
    let recoveryUrl;
    try {recoveryUrl=core.parseRepositoryUrl(recovery.repositoryUrl).page;}catch{return;}
    if(recoveryUrl!==repositoryUrl)return;
    try {if(await project()!==projectPath)return;}catch{return;}
    if(disposed||auth.accountId!==accountId||auth.accountLabel!==label||JSON.stringify(context.globalState.get('zero.repositoryCreationRecovery'))!==JSON.stringify(recovery))return;
    await context.globalState.update('zero.repositoryCreationRecovery',undefined);
  }
  const projectWindow = createProjectWindow(vscode, {globalState:context.globalState, startPage:()=>startPage, active:()=>!disposed});
  const projectFolders = createProjectFolders(vscode, {globalState:context.globalState, active:() => !disposed, report:text => output.appendLine(text), cloneRepository,onOpened:rememberOpened,openFolder:projectWindow.open});
  projectPicker=createProjectPicker(vscode,{authentication:auth,repositories,history:recentProjects,active:()=>!disposed,report:text=>output.appendLine(text)});
  const githubProjects = createGitHubProjectCommands({vscode,authentication:auth,repositories,folders:projectFolders,prepare:prepareGitHub,extensionPath:context.extensionPath || path.resolve(__dirname,'..'),project,active:()=>!disposed,onProgress:text=>report(text),onRecovery:record=>context.globalState?.update('zero.repositoryCreationRecovery',record)});
  context.subscriptions.push(projectFolders,githubProjects,projectPicker);
  startPage=createStartPage(vscode,{
    onDidChangeOpen:refreshSidebarShortcut,
    getState:()=>({phase:githubReady()?'ready':auth.signedIn?githubReadiness.phase:'signed-out',accountId:auth.accountId,accountLabel:auth.accountLabel,busy:disposed||isBusy(),status:state,publishProgress:publishProgress?.root===projectRoot?publishProgress:undefined}),
    listRecent:accountId=>recentProjects.list(accountId),
    openRecent:async(item,accountId)=>{
      if(disposed||isBusy()||auth.accountId!==accountId)return;
      connecting=true;refresh();
      try {
        const ticket=await auth.capture();
        const assertCurrent=async()=>{if(disposed||auth.accountId!==accountId)throw new Error('The GitHub account changed. Open the project again.');await auth.assertCurrent(ticket);};
        await assertCurrent();
        await projectFolders.openLocal({projectPath:item.path,assertCurrent});
      } finally {connecting=false;if(!disposed)refresh();}
    },report:(message,detail)=>report(message,detail)
  });
  context.subscriptions.push(startPage);
  const githubSetup = createGitHubSetup({vscode, authentication:auth, repositories,
    installationUrl:appConfiguration && `https://github.com/apps/${appConfiguration.slug}/installations/new`,
    active:() => !disposed, report});
  context.subscriptions.push(githubSetup);
  async function prepareGitHub({openBrowser = false} = {}) {
    await actions['zero.startPage']();
    if (disposed) return false;
    await auth.refresh();
    if (disposed) return false;
    if (!auth.signedIn) await auth.signIn(false);
    if (disposed) return false;
    const ticket = await auth.capture();
    if (disposed) return false;
    const ready = await githubSetup.ensure({openBrowser});
    if (!disposed && ready) {await auth.assertCurrent(ticket);githubReadiness.confirm(ticket);}
    if (!disposed && !ready) {report('GitHub setup paused');void githubReadiness.refresh();}
    return !disposed && ready ? ticket : false;
  }
  async function signIn(changeAccount = auth.signedIn) {
    if (disposed || isBusy()) return;
    signingIn = true; refresh();
    try {
      if (disposed) return;
      if (!appProvider) throw new Error('The Codepet GitHub App is not configured in this Zero release. Local running still works.');
      if (changeAccount && auth.sessionId) {await appProvider.removeSession(auth.sessionId);await auth.refresh();}
      await actions['zero.startPage']();
      await auth.refresh();
      if (!auth.signedIn) await auth.signIn(false);
      if (!disposed) {await githubReadiness.refresh();output.appendLine(auth.status);try {await rememberOpened({projectPath:await project()});}catch{}}
    } catch (error) {
      if (!disposed) throw error;
    } finally { signingIn = false; if (!disposed) refresh(); }
  }
  async function repositoryStatus({forceBranchCheck=false,suppressRemoteChecks=false}={}) {
    const generation = ++statusGeneration;
    let nextRepository = 'No repository connected', nextBranch = '', nextHead, nextMainHead, nextDetached = false, nextBranchError, nextRecovery, nextRecoveryError, nextPending, nextLocal;
    try {
      const root = await project();
      if (localPractice) {nextRepository = 'Local practice'; throw new Error('Local practice');}
      await lessonProjects.assertShareable(root);
      if(await core.repositoryRoot(root)!==root)throw new Error('Open a standalone student project.');
      try {nextBranch = await core.currentBranch(root,core.git);}
      catch (error) {if(error.code===1){try {nextDetached = /^[a-f0-9]{40,64}$/.test(await core.git(root, ['rev-parse', '--verify', 'HEAD']));} catch {}}else nextBranchError='This branch cannot be displayed safely. Open Source Control to inspect it.';}
      if(nextBranch) {
        try {nextHead=await core.git(root,['rev-parse','--verify','HEAD^{commit}']);if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(nextHead))throw Error('Invalid HEAD.');}
        catch(error) {
          try {if(error.code!==128)throw error;await verifiedUnbornBranch(root,nextBranch);nextHead=null;}
          catch {nextBranchError='The branch commit cannot be verified. Open Source Control to inspect it.';nextHead=undefined;}
        }
      }
      if(nextBranch&&nextBranch!=='main')try{nextMainHead=await core.git(root,['rev-parse','--verify','refs/heads/main^{commit}']);}catch{/* No readable local main means the update check is unavailable. */}
      let reminderView;try{reminderView=await readReminders(root,nextBranch);}catch(error){nextRecoveryError=`Sync reminders are unavailable. Retry after inspecting reminder storage: ${error.message}`;output.appendLine(nextRecoveryError);reminderView={local:pendingLocalCommit?.root===root&&pendingLocalCommit.branch===nextBranch?[pendingLocalCommit]:[],push:pendingUpload?.root===root&&pendingUpload.branch===nextBranch?[pendingUpload]:[]};}
      const local=reminderView.local[0];
      if(local&&local.root===root&&local.branch===nextBranch&&github.validBranch(local.branch)&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(local.head||''))nextLocal=local;
      try {nextRecovery = await workflow.readRecovery?.(root);} catch(error) {nextRecoveryError=nextRecoveryError?`${nextRecoveryError} ${error.message}`:error.message;}
      const stored=reminderView.push.find(row=>!knownPush(row))||selectPushReminder(reminderView.push);
      if(stored&&!knownPush(stored))nextRecoveryError=stored.operation==='reftable-ref-only'?'A ref-only update record needs inspection. Keep the reminder and review the branch in Source Control before syncing.':'An unrecognized sync reminder needs inspection. Open Source Control and review the reminder storage before syncing.';
      else if (stored && typeof stored === 'object' && stored.root === root && stored.branch === nextBranch && /^[a-f0-9]{40,64}$/.test(stored.head)) {
        nextPending = stored;
      }
      try {nextRepository = core.parseRepositoryUrl(await core.git(root, ['remote', 'get-url', 'origin'])).page;}
      catch(error) {
        try {
          const remotes=(await core.git(root,['remote'])).split('\n').filter(Boolean);
          nextRepository=error.code===2&&!remotes.includes('origin')?'No repository connected':'Repository connection cannot be verified. Open Source Control to inspect it.';
        } catch {nextRepository='Repository connection cannot be verified. Open Source Control to inspect it.';}
      }
    } catch (error) { if (!localPractice) {nextRepository = error.message.includes('different Git repository') ? 'Standalone student copy needed to connect' : 'Repository status unavailable. Open Source Control to inspect it.';nextBranchError ||= 'Project Git status is unavailable. Open Source Control to inspect it.';} }
    if(nextPending){try{if(core.parseRepositoryUrl(nextPending.remote).page!==nextRepository)nextPending={...nextPending,kind:'destination-changed'};}catch{nextPending={...nextPending,kind:'destination-changed'};}}
    if (!disposed && generation === statusGeneration) {scheduleProjectDirty();repository = nextRepository; branch = nextBranch; branchHead=nextHead;mainLocalHead=nextMainHead;branchDetached = nextDetached;branchError=nextBranchError;updateRecovery=nextRecovery;updateRecoveryError=nextRecoveryError;pendingUpload=nextPending;pendingLocalCommit=nextLocal;if((mainUpdateStatus||mainUpdateScope)&&[mainUpdateStatus,mainUpdateScope].filter(Boolean).some(value=>!currentMainObservation(value))){mainUpdateStatus=undefined;mainUpdateGeneration++;mainUpdateNextAt=0;}if(branchRemoteStatus&&!currentBranchObservation(branchRemoteStatus)){branchRemoteStatus=undefined;branchCheckNextAt=0;}refresh();void refreshRecentHistory();if(!suppressRemoteChecks){if(Date.now()>=mainUpdateNextAt)void checkForMainUpdates();void checkCurrentBranch({force:forceBranchCheck});}}
  }
  async function refreshRecentHistory() {
    const attempt=++recentGeneration,root=projectRoot,currentBranch=branch;
    if(!history||!root||!currentBranch||vscode.workspace.isTrusted===false){recentHistory=undefined;return;}
    try {const result=await history.recent();if(!disposed&&attempt===recentGeneration&&root===projectRoot&&currentBranch===branch&&result.root===root&&result.branch===`refs/heads/${currentBranch}`){recentHistory=result;refresh();}}
    catch {if(attempt===recentGeneration){recentHistory=undefined;refresh();}}
  }
  async function stop() {
    if (!execution) return;
    const active = execution;
    stoppedTasks.add(active);
    active.terminate();
    state = 'Stopping app…'; refresh();
    let timer;
    try {await Promise.race([ending, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('The app task has not stopped. Close its terminal before restarting.')), 10000);})]);}
    finally {clearTimeout(timer);}
    if (!execution) {state = buildFailed ? 'App ended with an error. Open Problems or check the task terminal.' : 'App stopped'; refresh();}
  }
  async function stopRequested() {
    runGeneration++;
    if (pendingLaunch) await pendingLaunch.catch(() => {});
    await stop();
    state = buildFailed ? 'App ended with an error. Open Problems or check the task terminal.' : 'App stopped'; refresh();
  }
  const nativeTaskStates = new WeakMap();
  // Configured tasks are reconstructed by VS Code; their CustomExecution is
  // shared with the resolved task even when the Task object itself is different.
  const nativeTaskState = task => nativeTaskStates.get(task) || nativeTaskStates.get(task?.execution);
  const nativeProblems=vscode.languages?.createDiagnosticCollection('zero-native-runtime');
  if(nativeProblems)context.subscriptions.push(nativeProblems);
  const compilerProblems=vscode.languages?.createDiagnosticCollection('zero-native-compiler');
  if(compilerProblems)context.subscriptions.push(compilerProblems);
  function publishRuntimeProblems(metadata, event) {
    if(!nativeProblems)return;
    const grouped=new Map();
    for(const item of runtimeDiagnostics(event.diagnostic||'',metadata.root)){
      const point=new vscode.Position(Math.max(0,item.line-1),0),diagnostic=new vscode.Diagnostic(new vscode.Range(point,point),item.message,vscode.DiagnosticSeverity.Error);
      diagnostic.source='Zero native runtime';if(!grouped.has(item.file))grouped.set(item.file,[]);grouped.get(item.file).push(diagnostic);
    }
    for(const [file,items]of grouped)nativeProblems.set(vscode.Uri.file(file),items);
  }
  function nativeRuntimeState(task, event) {
    const metadata = nativeTaskState(task);
    if (!metadata) return;
    metadata.latest = event;
    if (event.type === 'fatal') {metadata.failed = true;metadata.fatal = event;}
    if (disposed || metadata.generation !== runGeneration || nativeTaskState(execution?.task) !== metadata || stoppedTasks.has(execution)) return;
    if (event.type === 'ui-ready') state = 'App UI ready';
    else if (event.type === 'first-frame') state = 'App running · first game frame ready';
    else if (event.type === 'fatal') {buildFailed = true;state = `App failed (${event.stage}/${event.code}). Check Problems or the task terminal.`;publishRuntimeProblems(metadata,event);}
    else if (event.type === 'stopped') state = 'App stopped';
    if (event.diagnostic) output.appendLine(`[Native ${event.stage}/${event.code}] ${event.diagnostic}`);
    refresh();
  }
  function publishCompilerProblems(metadata, owner = execution) {
    if(!compilerProblems || disposed || metadata.generation !== runGeneration || nativeTaskState(owner?.task) !== metadata || stoppedTasks.has(owner))return;
    const grouped=new Map();
    for(const item of metadata.compilerItems||[]){
      const point=new vscode.Position(item.line-1,item.column-1);
      const diagnostic=new vscode.Diagnostic(new vscode.Range(point,point),item.message,vscode.DiagnosticSeverity.Error);
      diagnostic.source='Zero Java compiler';
      if(!grouped.has(item.file))grouped.set(item.file,[]);
      grouped.get(item.file).push(diagnostic);
    }
    for(const [file,diagnostics]of grouped)compilerProblems.set(vscode.Uri.file(file),diagnostics);
  }
  async function makeTask(root, definition = {type:'zero',task:'run',instanceId:crypto.randomUUID()}, scope = vscode.TaskScope.Workspace) {
    if (vscode.workspace.isTrusted === false) throw new Error('Trust your own project before running its Java code.');
    await core.assertTutorialRepository(root);
    const spec = core.runSpecification(root);
    await fs.access(spec.command);
    const pomText = await fs.readFile(path.join(root, 'pom.xml'), 'utf8');
    const owned = await require('./sharing/owned-native').prepareOwnedNative({
      root, pomText, cacheRoot: context.globalStorageUri && path.join(context.globalStorageUri.fsPath, 'owned-maven')
    });
    if (owned) spec.args = [`-Dmaven.repo.local=${owned.repository}`, ...spec.args];
    const javaEnv = await verifyManagedJava({environment:services.nativeRuntime?.env || process.env,platform:services.nativeRuntime?.platform || process.platform});
    const metadata = {generation:runGeneration,root,failed:false};
    let task, transport;
    const compiler = createNativeCompilerDiagnostics({root,onChange:items=>{
      metadata.compilerItems=items;publishCompilerProblems(metadata);
    }});
    const processExecution = typeof vscode.CustomExecution === 'function'
      ? (transport = createNativeRuntimeExecution({vscode,spec,buildId:await nativeBuildIdentity(root),...services.nativeRuntime,
          ...(javaEnv ? {env:javaEnv} : {}),
          isCurrent:()=>!disposed && metadata.generation === runGeneration && vscode.workspace.isTrusted !== false,
          onEvent:event => nativeRuntimeState(task,event),onOutput:(text,stream)=>compiler.push(text,stream),
          onExit:code => {compiler.end();metadata.exitCode = code;}
        })).execution
      : spec.shell
        ? new vscode.ShellExecution({value: spec.command, quoting: vscode.ShellQuoting.Strong}, spec.args, {cwd: root,...(javaEnv ? {env:javaEnv} : {})})
        : new vscode.ProcessExecution(spec.command, spec.args, {cwd: root,...(javaEnv ? {env:javaEnv} : {})});
    // CustomExecution owns compiler diagnostics. A finite task matcher cannot
    // refresh them until the long-lived JavaFX process exits.
    task = new vscode.Task(definition, scope, 'Run App', 'Zero', processExecution, transport ? [] : '$zero-java-fallback');
    metadata.custom=Boolean(transport);metadata.transport=transport;nativeTaskStates.set(task,metadata);
    nativeTaskStates.set(processExecution,metadata);
    if (transport) context.subscriptions.push(transport);
    task.presentationOptions = {reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true, focus: false};
    task.group = vscode.TaskGroup.Build;
    return task;
  }
  const taskFinishes = new Map(), endedTasks = new WeakSet();
  function finishedTaskPty(message, exitCode) {
    const writes = new vscode.EventEmitter(), closes = new vscode.EventEmitter();
    let closed = false;
    const close = code => {if (!closed) {closed = true;closes.fire(code);}};
    return {onDidWrite:writes.event,onDidClose:closes.event,
      open() {if (closed) return;if (message) writes.fire(`Zero: ${message}\r\n`);close(exitCode);},
      close() {close(0);}
    };
  }
  function track(active) {
    if (taskFinishes.has(active)) return;
    const metadata = nativeTaskState(active.task);
    if (!metadata) return;
    if (disposed || metadata.generation !== runGeneration) {if(!endedTasks.has(active)){stoppedTasks.add(active);active.terminate();}return;}
    if (endedTasks.has(active)) {
      if (metadata.reconciled) return;
      if (execution) {metadata.reconciled = true;return;}
      metadata.reconciled = true;
      compilerProblems?.clear();nativeProblems?.clear();
      publishCompilerProblems(metadata,active);
      if (metadata.fatal) publishRuntimeProblems(metadata,metadata.fatal);
      const exitCode = metadata.exitCode ?? taskExitCodes.get(active);
      buildFailed = Boolean(metadata.failed || typeof exitCode === 'number' && exitCode !== 0 && (metadata.custom || !stoppedTasks.has(active)));
      state = buildFailed ? 'App ended with an error. Open Problems or check the task terminal.' : 'App stopped';
      refresh();return;
    }
    if (execution && execution !== active) {stoppedTasks.add(execution); execution.terminate();}
    execution = active;
    buildFailed = false;
    ending = new Promise(resolve => taskFinishes.set(active, resolve));
    compilerProblems?.clear();nativeProblems?.clear();
    if(metadata)publishCompilerProblems(metadata);
    state = 'Building / running · readiness unverified — output is in the terminal'; refresh();
    const latest = metadata?.latest;
    if (latest) nativeRuntimeState(active.task,latest);
  }
  context.subscriptions.push(vscode.tasks.onDidStartTask(event => {
    if (event.execution.task.definition.type === 'zero' && ['run','native-run'].includes(event.execution.task.definition.task)) track(event.execution);
  }), vscode.tasks.onDidEndTask(event => {
    endedTasks.add(event.execution);
    const finish = taskFinishes.get(event.execution);
    if (!finish) return;
    const metadata = nativeTaskState(event.execution.task);
    if (metadata) metadata.reconciled = true;
    taskFinishes.delete(event.execution); finish();
    if (execution === event.execution) {
      execution = undefined;
      const exitCode = metadata?.exitCode ?? taskExitCodes.get(event.execution);
      buildFailed = Boolean(metadata?.failed || typeof exitCode === 'number' && exitCode !== 0 && (metadata?.custom || !stoppedTasks.has(event.execution)));
      state = buildFailed ? 'App ended with an error. Open Problems or check the task terminal.' : 'App stopped';
      refresh();
    }
  }), vscode.tasks.onDidEndTaskProcess(event => {
    taskExitCodes.set(event.execution, event.exitCode);
  }));
  context.subscriptions.push(vscode.tasks.registerTaskProvider('zero', {
    // VS Code also resolves tasks while listing build choices. The configured
    // task starts the same owned Run task as the sidebar and then exits.
    provideTasks: async () => [],
    resolveTask: async configured => {
      if (!['run','native-run'].includes(configured.definition.task)) return undefined;
      if (typeof vscode.CustomExecution !== 'function') return undefined;
      const taskExecution = new vscode.CustomExecution(async () => {
        const generation = runGeneration;
        const fail = message => {
          output.appendLine(`Run App: ${message}`);
          void vscode.window.showErrorMessage(`Zero: ${message}`).then(undefined,()=>{});
          return finishedTaskPty(message,1);
        };
        if (disposed || stopPromise || isBusy() || nativeStarting) return fail('Finish the current action before running the app.');
        try {
          const root=await project();
          if (disposed || generation !== runGeneration) return finishedTaskPty('Run cancelled.',0);
          if (stopPromise || isBusy() || nativeStarting) return fail('Finish the current action before running the app.');
          const active=await queuedRun(root);
          if (disposed || generation !== runGeneration || !active) return finishedTaskPty('Run cancelled.',0);
          return finishedTaskPty('',0);
        } catch (error) {return fail(error.message || 'Cannot prepare Run App.');}
      });
      const task = new vscode.Task(configured.definition, configured.scope, 'Run App', 'Zero', taskExecution, []);
      task.presentationOptions = {reveal: vscode.TaskRevealKind.Never, panel: vscode.TaskPanelKind.Dedicated, clear: true, focus: false};
      task.group = configured.group || vscode.TaskGroup.Build;
      return task;
    }
  }));
  async function run(generation, expectedRoot) {
    if (disposed || generation !== runGeneration) return;
    const root = await project();
    if (expectedRoot && root !== expectedRoot) throw new Error('The student project changed before running. Open the intended project and run it explicitly.');
    if (vscode.workspace.isTrusted === false) throw new Error('Trust your own project before running its Java code.');
    await core.assertTutorialRepository(root);
    if (generation !== runGeneration) return;
    if (!(await vscode.workspace.saveAll(false))) throw new Error('Save your files before running the app.');
    if (disposed || generation !== runGeneration) return;
    const task = await makeTask(root);
    if (disposed || generation !== runGeneration) return;
    if (await project() !== root) throw new Error('The student project changed during run preparation. Run the current app explicitly.');
    if (disposed || generation !== runGeneration) return;
    if (vscode.workspace.isTrusted === false) throw new Error('Trust your own project before running its Java code.');
    if (stopPromise || isBusy()) throw new Error('Finish the current action before running the app.');
    await stop();
    if (disposed || generation !== runGeneration) return;
    if (await project() !== root) throw new Error('The student project changed during run preparation. Run the current app explicitly.');
    if (disposed || generation !== runGeneration) return;
    if (vscode.workspace.isTrusted === false) throw new Error('Trust your own project before running its Java code.');
    browserRun.stop({quiet:true});
    pendingLaunch = vscode.tasks.executeTask(task).then(active => {
      if (disposed || generation !== runGeneration) {stoppedTasks.add(active);active.terminate();}
      else track(active);
      return active;
    });
    try {return await pendingLaunch;} finally {pendingLaunch = undefined;}
  }
  function queuedRun(expectedRoot) {
    const generation = runGeneration;
    nativeStarting++;refresh();
    const next = runQueue.then(() => run(generation,expectedRoot)).finally(nativePrepared);
    runQueue = next.catch(() => {});
    return next;
  }
  async function quickPick(items, options) {
    menuOpen = true; refresh();
    try {return await vscode.window.showQuickPick(items, options);}
    finally {menuOpen = false; refresh();}
  }
  function simulation(action) {
    state = `Simulation only — ${action}: nothing changed. No files saved, Git changes, sign-in or upload.`;
    refresh(); void vscode.window.showWarningMessage(state);
  }
  async function nativeUpdateHelp(error) {
    const choice=await vscode.window.showWarningMessage(error.message,{modal:true,detail:'Use VS Code Source Control to review the branches and update your project. Your files and commits are kept. Run your app after updating, then review the merge again.'},'Open Source Control');
    if(choice!=='Open Source Control')return;
    try {if((await vscode.commands.getCommands(true)).includes('workbench.view.scm')) {await vscode.commands.executeCommand('workbench.view.scm');return;}} catch {}
    void vscode.window.showInformationMessage('Open Source Control from the VS Code Activity Bar to review the branches.');
  }
  async function conflictHelp() {
    void vscode.window.showInformationMessage('Resolve the conflicts in VS Code Source Control. Stage the resolved files, then commit the merge with standard VS Code Git controls. Run your app to check it, then choose Merge to main again. Zero leaves your files and merge in place.');
    try {
      const available = await vscode.commands.getCommands(true);
      if (available.includes('workbench.view.scm')) {await vscode.commands.executeCommand('workbench.view.scm'); return;}
    } catch {}
    void vscode.window.showInformationMessage('Open Source Control from the VS Code Activity Bar to resolve and commit the merge.');
  }
  async function assertGitProject(root) {
    if (disposed || await project() !== root) throw new Error('The student project changed. Review this step again.');
    assertGitProjectNow(root);
  }
  function assertGitProjectNow(root) {
    if (disposed || projectRoot !== root) throw new Error('The student project changed. Review this step again.');
    if (vscode.workspace.isTrusted === false) throw new Error('Trust your own project before changing its Git history.');
    if (uploadMode(root) !== 'live') throw new Error('Live Git actions were disabled. Review this step again.');
  }
  async function operationTransport(remote, {root:reviewRoot,authentication, ticket, permissions = {contents:'write'}, identity,
    assertProject, assertProjectNow,assertReminders,reminderSnapshot,syncOperation='branch',allowedReminders=[],allowIncludedOperations=false,allowIncludedPushes=false,refOnlyOutcome,onPushAttempt=()=>{}}) {
    const reviewedReminders=reminderSnapshot===undefined?(repositoryLedger?await allReminderRecords(reviewRoot):pendingLedger.enumerable?compatibilityAll(reviewRoot,branch):undefined):reminderSnapshot;
    const ownPushes=new Map(),ownIntentIds=new Set();
    let accessChecked = false,pushReminderTx,pushTarget,pushAttempt;
    const selected=record=>allowedReminders.some(allowed=>JSON.stringify(allowed)===JSON.stringify(record));
    const needsSharedReminders=()=>refOnlyOutcome||allowIncludedPushes||allowIncludedOperations||allowedReminders.some(row=>row.operation&&!['branch','merge'].includes(row.operation));
    const assertReminderReview=async()=>{
      if(!pushTarget)return;
      await commitProvenance.assertFileRestoreClear(reviewRoot);
      if(!reviewedReminders)throw new Error('Sync reminders cannot be fully enumerated in this window. Inspect Source Control before syncing.');
      const current=repositoryLedger?await allReminderRecords(reviewRoot,pushReminderTx):compatibilityAll(reviewRoot,pushTarget.branch);
      if(JSON.stringify(current)!==JSON.stringify(reviewedReminders))throw new Error('The sync reminders changed after review. Review the current project before uploading.');
      for(const record of current){
        if(record.type==='local'){
          if(record.operation&&!(selected(record)&&['restore','undo'].includes(record.operation)&&record.branch===pushTarget.branch&&(record.head===pushTarget.head||(allowIncludedOperations&&await includesSavedCommit(reviewRoot,record.head,pushTarget.head)))))throw new Error('An interrupted local operation needs review before uploading. Its reminder is kept.');
          if(!record.operation&&record.branch===pushTarget.branch&&!await includesSavedCommit(reviewRoot,record.head,pushTarget.head))throw new Error('An earlier local commit is unrelated to this upload. Review its reminder first.');
        }else {
          if(record.operation==='reftable-ref-only'){
            if(!selected(record)||syncOperation!=='branch')throw new Error('A ref-only update needs inspection before syncing.');
            require('./reftable-ref-only-intent').assertLiveRefOnlySync(refOnlyOutcome,{root:reviewRoot,branch:pushTarget.branch,head:pushTarget.head,remote,accountId:ticket.session.accountId,sessionId:ticket.session.id,records:current});continue;
          }
          if(record.operation==='reftable-update'){
            if(!selected(record)||syncOperation!=='branch')throw new Error('An interrupted update needs inspection before syncing.');
            await require('./reftable-update-intent-validation').assertRetryableReftableUpdateIntent({record,root:reviewRoot,branch:pushTarget.branch,head:pushTarget.head,remote,accountId:ticket.session.accountId,sessionId:ticket.session.id,beforeReview:()=>assertProject(pushReminderTx),beforeReviewNow:()=>{assertProjectNow();return authentication.assertCurrentNow(ticket);}});continue;
          }
          const included=allowIncludedPushes&&selected(record)&&pushOperation(record)==='branch'&&record.branch===pushTarget.branch&&record.remote===remote&&record.accountId===ticket.session.accountId&&await includesSavedCommit(reviewRoot,record.head,pushTarget.head);
          if(!knownPush(record)||!record.accountId||!selected(record)||record.remote!==remote||record.head!==pushTarget.head&&!included||record.accountId!==ticket.session.accountId||(syncOperation==='merge'?record.operation!=='merge':pushOperation(record)!=='branch'||record.branch!==pushTarget.branch))throw new Error('An earlier GitHub sync needs attention. Review its reminder or use Sync saved commits to review a newer head before uploading.');
        }
      }
      if(assertReminders)await assertReminders(pushReminderTx);
    };
    const transport = createTransport(remote, async () => {
      await assertProject(pushReminderTx);
      await authentication.assertCurrent(ticket);
      // Capture access at the first real transfer, after local preparation. One
      // push and its confirmation share this operation's identity; server refusal
      // and immediate session invalidation remain authoritative on every call.
      if (!accessChecked) {
        const access = await repositories.access(core.parseRepositoryUrl(remote).page,{ticket,permissions});
        if (identity) assertRepositoryIdentity(identity,access);
        else identity = repositoryIdentity(access);
        await assertProject(pushReminderTx);
        await authentication.assertCurrent(ticket);
        accessChecked = true;
      }
      await assertProject(pushReminderTx);await assertReminderReview();
      if(pushReminderTx&&!pushAttempt){
        const attempt=await pushReminderTx.add({root:reviewRoot,branch:pushTarget.branch,head:pushTarget.head,remote,page:core.parseRepositoryUrl(remote).page,accountId:ticket.session.accountId,committed:false,pushStarted:true,kind:'network',...(syncOperation==='merge'?{operation:'merge'}:{})});
        ownIntentIds.add(attempt.id);ownPushes.set(`refs/heads/${attempt.branch}`,attempt);pushAttempt=attempt;onPushAttempt(attempt);
        await assertReminderReview();
      }
      return authentication.assertCurrent(ticket);
    }, {assertCurrentNow:() => {assertProjectNow();pushReminderTx?.assertCurrentNow();return authentication.assertCurrentNow(ticket);}});
    return (root,args,phaseBinding) => {
      if(root!==reviewRoot)throw new Error('The reminder review belongs to another project. Review the sync again.');
      if(args[0]!=='push')return (async()=>{
        const result=await transport(root,args);
        if(repositoryLedger&&args.length===4&&args[0]==='ls-remote'&&args[1]==='--heads'&&args[2]===remote){
          const pending=ownPushes.get(args[3]),lines=typeof result==='string'?result.trim().split('\n'):[];
          if(pending&&lines.length===1&&lines[0]===`${pending.head}\t${args[3]}`){const reconcile=async binding=>{const authority=Object.freeze({...binding,assertCurrentNow(){binding.assertCurrentNow();assertProjectNow();authentication.assertCurrentNow(ticket);}});const resolveConfirmed=async tx=>{await assertProject(tx);await authentication.assertCurrent(ticket);authority.assertCurrentNow();let records=await tx.list();const seen=new Set(),selected=[];for(const reviewed of [pending,...allowedReminders]){
            const included=allowIncludedPushes&&reviewed.type!=='local'&&pushOperation(reviewed)==='branch'&&reviewed.branch===pending.branch&&reviewed.remote===remote&&reviewed.accountId===ticket.session.accountId&&await includesSavedCommit(root,reviewed.head,pending.head);
            if(seen.has(reviewed.id)||reviewed.head!==pending.head&&!included||reviewed.type!=='local'&&reviewed.remote!==remote)continue;
            seen.add(reviewed.id);const current=records.find(row=>row.id===reviewed.id);if(!current||JSON.stringify(current)!==JSON.stringify(reviewed))throw new Error('The confirmed sync reminders changed. Inspect them before continuing.');selected.push(reviewed);
          }if(refOnlyOutcome)require('./reftable-ref-only-intent').assertLiveRefOnlySync(refOnlyOutcome,{root,branch:pending.branch,head:pending.head,remote,accountId:ticket.session.accountId,sessionId:ticket.session.id,records});
          // Resolve the ref-only pending intent last so any interruption leaves
          // a durable inspection-required record.
          selected.sort((a,b)=>Number(a.kind==='ref-pending')-Number(b.kind==='ref-pending'));
          for(let i=0;i<selected.length;i++){await assertProject(tx);await authentication.assertCurrent(ticket);records=await tx.list();for(const expected of selected.slice(i))if(!records.some(row=>row.id===expected.id&&JSON.stringify(row)===JSON.stringify(expected)))throw new Error('The confirmed sync reminders changed. Inspect them before continuing.');tx.assertCurrentNow();authority.assertCurrentNow();await tx.resolve(selected[i].id,'confirmed');}
          };if(await supportsFileReminders(root))return repositoryLedger.withProvenance(root,authority,resolveConfirmed);
          // Compatibility can reconcile an exact ordinary push receipt, but it
          // cannot authorize included commits or retained history operations.
          if(needsSharedReminders())throw new Error('GitHub confirmed the push, but the shared sync reminders need inspection.');
          authority.assertCurrentNow();return repositoryLedger.withTransaction(root,resolveConfirmed);
          };if(phaseBinding)await reconcile(phaseBinding);else await commitProvenance.withDeferredRefMutation(root,reconcile);ownPushes.delete(args[3]);}
        }
        return result;
      })();
      const push=binding=>{
        const execute=async tx=>{
          if(pushReminderTx)throw new Error('Another reminder check is running. Review the sync again.');
          const match=args.length===3&&args[1]===remote&&/^([a-f0-9]{40}|[a-f0-9]{64}):refs\/heads\/(.+)$/.exec(args[2]);
          if(!match||!github.validBranch(match[2]))throw new Error('The push attempt cannot be recorded safely. Review the sync again.');
          pushTarget=match?{head:match[1],branch:match[2]}:undefined;pushAttempt=undefined;
          const visibleTx=tx&&Object.freeze({...tx,list:async()=> (await tx.list()).filter(record=>!ownIntentIds.has(record.id))});pushReminderTx=visibleTx;
          try{
            if(tx&&JSON.stringify(await allReminderRecords(root,visibleTx))!==JSON.stringify(reviewedReminders))throw new Error('The sync reminders changed after review. Review the current project before uploading.');
            await assertReminderReview();
            await assertReminderReview();await commitProvenance.assertFileRestoreClear(root);
            if(needsSharedReminders()&&!await supportsFileReminders(root))throw new Error('This sync requires shared sync reminder storage. Inspect the reminders before retrying.');
            binding.assertCurrentNow();return await transport(root,args,binding);
          }finally{pushReminderTx=undefined;pushTarget=undefined;pushAttempt=undefined;}
        };
        return repositoryLedger?repositoryLedger.withTransaction(root,execute):execute();
      };
      // A workflow-owned push reuses its live provenance binding. Otherwise
      // acquire provenance before ledger; never hold ledger while acquiring it.
      return phaseBinding?(phaseBinding.assertCurrentNow(),push(phaseBinding)):commitProvenance.withPush(root,push);
    };
  }
  // Hold the common provenance lock for the whole local workflow phase. A
  // phase-owned push reuses that exact live binding instead of reacquiring it.
  async function workflowLocalPhase(root,options,execute,{ownedSwitch=false,ownedUpdate=false,readOnly=false}={}) {
    let completed=false;
    try {
      return await (ownedSwitch?commitProvenance.withOwnedReftableSwitch:ownedUpdate?commitProvenance.withOwnedReftableUpdate:readOnly?commitProvenance.withReadOnly:commitProvenance.withLocalMutation)(root,async binding=>{
        const evidence=()=>ownedSwitch||ownedUpdate?binding.assertCurrent():commitProvenance.assertFileRestoreClear(root);
        const checked=fn=>async(...args)=>{binding.assertCurrentNow();await evidence();const result=await fn?.(...args);await evidence();binding.assertCurrentNow();return result;};
        const phase={...options,beforeMutation:checked(ownedUpdate?options.beforeOwnedUpdateMutation:options.beforeMutation),
          ...(ownedSwitch?{ownedSwitch:binding}:ownedUpdate?{ownedUpdate:binding}:{}),
          ...(options.applyWithUpdateIntent?{applyWithUpdateIntent:(details,apply)=>options.applyWithUpdateIntent(details,apply,binding)}:{}),
          ...(options.beforeMutationNow?{beforeMutationNow:()=>{binding.assertCurrentNow();const result=options.beforeMutationNow();if(result&&typeof result.then==='function')throw new Error('The Git mutation guard must be synchronous.');binding.assertCurrentNow();}}:{}),
          ...(options.beforeNetwork?{beforeNetwork:checked(options.beforeNetwork)}:{}),
          ...(options.beforeCheckout?{beforeCheckout:checked(options.beforeCheckout)}:{}),
          ...(options.networkRun?{networkRun:async(cwd,args)=>{if(cwd!==root)throw new Error('The project changed. Review this step again.');binding.assertCurrentNow();await evidence();binding.assertCurrentNow();return options.networkRun(cwd,args,binding);}}:{})};
        const result=await execute(phase);completed=true;return result;
      });
    } catch(error) {
      if(completed)error.message+=' The local operation may have completed; inspect project history and Source Control before retrying.';
      throw error;
    }
  }
  // Lock cleanup may fail after the action has already failed with its own
  // recovery location. Preserve both failures instead of hiding the journal.
  async function retainedLocalPhase(root,execute) {
    let operationFailure;
    try {return await commitProvenance.withLocalMutation(root,async binding=>{
      try {return await execute(binding);} catch(error){operationFailure=error;throw error;}
    });} catch(error) {
      if(operationFailure && operationFailure!==error) {
        if(error.recoveryPath) {
          if(!operationFailure.lockRecoveryPath)operationFailure.lockRecoveryPath=error.recoveryPath;
          else if(!operationFailure.additionalLockRecoveryPath)operationFailure.additionalLockRecoveryPath=error.recoveryPath;
          else operationFailure.message+=` Additional lock requiring inspection: ${error.recoveryPath}.`;
        }
        operationFailure.message+=` Lock cleanup also failed: ${error.message}.`;
        throw operationFailure;
      }
      if(!operationFailure&&error.recoveryPath){error.lockRecoveryPath=error.recoveryPath;delete error.recoveryPath;}
      throw error;
    }
  }
  function currentBranchObservation(value) {
    return value.root===projectRoot&&value.branch===branch&&value.head===branchHead&&value.remote===`${repository}.git`&&value.account===auth.accountId&&value.session===auth.sessionId&&value.authEpoch===branchAuthEpoch;
  }
  async function settleBranchCheck() {
    while(branchCheckRunning)await new Promise(resolve=>branchCheckWaiters.add(resolve));
  }
  function observedMissing(root) {
    const value=branchRemoteStatus;
    if(value?.state==='remote-missing'&&value.root===root&&value.account&&value.session&&currentBranchObservation(value))return {...value};
    return missingBranchObservations.get(JSON.stringify([root,branch,branchHead,`${repository}.git`]));
  }
  function assertMissingPlan(value,plan) {
    if(value&&(!currentBranchObservation(value)||['root','remote','branch','head'].some(key=>value[key]!==plan[key])))throw new Error('The GitHub account, repository or branch changed after the connection check. Review it again; your work is kept.');
  }
  const missingSyncDisclosure=plan=>`GitHub reported this branch missing. Syncing will create refs/heads/${plan.branch} if it remains absent. The check and push are not atomic: if someone creates the branch in between, Git may accept a fast-forward update. Zero will push without force.`;
  async function checkCurrentBranch({force=false}={}) {
    if(disposed||isBusy()||(!force&&pendingUpload)||vscode.workspace.isTrusted!==true||!projectRoot||!branch||!branchHead||uploadMode()!=='live'||!repository.startsWith('https://github.com/'))return;
    if(branchCheckRunning){if(force)branchCheckPending=true;return;}
    if(!force&&Date.now()<branchCheckNextAt)return;
    const scope={root:projectRoot,branch,head:branchHead,remote:`${repository}.git`,account:auth.accountId,session:auth.sessionId,authEpoch:branchAuthEpoch};
    branchCheckRunning=true;branchCheckNextAt=Date.now()+120000;
    branchRemoteStatus={...scope,state:auth.signedIn?'checking':'auth'};refresh();
    try {
      if(!auth.signedIn)return;
      const ticket=await auth.capture();
      const guard=async()=>{await assertGitProject(scope.root);await auth.assertCurrent(ticket);};
      // Read independently of ambient Git directory settings, disable lazy
      // fetching and replacements, and never invoke status/filters here.
      const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key)));
      Object.assign(env,{GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_TERMINAL_PROMPT:'0'});
      const read=args=>core.git(scope.root,args,{env});
      const readState=async()=>{
        await guard();await core.assertRepositoryRoot(scope.root,(_,args)=>read(args));await github.assertNoUrlRewrites(scope.root,(_,args)=>read(args));
        if(await read(['rev-parse','--is-shallow-repository'])!=='false')throw new Error('Branch checks need complete local history.');
        // Grafts alter ancestry despite --no-replace-objects. Check both before
        // and after observation/ancestry; never infer local-ahead from them.
        const dot=await fs.realpath(path.resolve(scope.root,await read(['rev-parse','--git-common-dir'])));
        try {await fs.lstat(path.join(dot,'info','grafts'));throw new Error('Branch checks do not support grafted history.');}catch(error){if(error.code!=='ENOENT')throw error;}
        const names=(await read(['remote','get-url','--all','origin'])).split('\n'),push=(await read(['remote','get-url','--push','--all','origin'])).split('\n');
        if(names.length!==1||push.length!==1)throw new Error('Repository destination changed.');
        const remote=core.parseRepositoryUrl(names[0]).remote;
        if(core.parseRepositoryUrl(push[0]).remote!==remote)throw new Error('Repository destination changed.');
        const selectedBranch=await core.currentBranch(scope.root,(_,args)=>read(args));
        if(!github.validBranch(selectedBranch))throw new Error('Choose an ordinary branch.');
        const result={root:scope.root,branch:selectedBranch,head:await read(['rev-parse','--verify','HEAD^{commit}']),remote,account:ticket.session.accountId,session:auth.sessionId,authEpoch:branchAuthEpoch};
        if(!currentBranchObservation(result))throw new Error('The branch changed during the connection check.');
        await guard();return result;
      };
      await readState();
      // Establish repository access explicitly so a missing repository/access
      // error remains distinct from a successful empty exact-ref response.
      await repositories.access(core.parseRepositoryUrl(scope.remote).page,{ticket,permissions:{contents:'read'}});
      await readState();
      const networkRun=createTransport(scope.remote,async()=>{await readState();return auth.assertCurrent(ticket);},{assertCurrentNow:()=>{assertGitProjectNow(scope.root);if(!currentBranchObservation(scope))throw new Error('The branch changed.');return auth.assertCurrentNow(ticket);}});
      const result=await checkBranchRemote({readState,readRemote:(value,ref)=>networkRun(value.root,['ls-remote','--heads',value.remote,ref]),isAncestor:async(older,newer)=>{try{await read(['merge-base','--is-ancestor',older,newer]);return true;}catch(error){if(error.code===1)return false;if(error.code===128)return null;throw error;}}});
      if(!disposed&&currentBranchObservation(scope)){
        branchRemoteStatus=result;
        const key=JSON.stringify([scope.root,scope.branch,scope.head,scope.remote]);
        if(result.state==='remote-missing')missingBranchObservations.set(key,{...result});
        else if(['synced','local-ahead','remote-changed'].includes(result.state)){const previous=missingBranchObservations.get(key);if(previous?.account===scope.account&&previous?.session===scope.session)missingBranchObservations.delete(key);}
      }
    } catch(error) {
      if(!disposed&&currentBranchObservation(scope))branchRemoteStatus={...scope,state:branchCheckError(error)};
    } finally {
      branchCheckRunning=false;refresh();
      // A switch during an in-flight check must not wait for the old deadline.
      const stale=!currentBranchObservation(scope),force=branchCheckPending;branchCheckPending=false;
      if(!disposed&&(stale||force)){if(stale){branchRemoteStatus=undefined;branchCheckNextAt=0;}void checkCurrentBranch({force});}
      for(const resolve of branchCheckWaiters)resolve();branchCheckWaiters.clear();
    }
  }
  function currentMainObservation(value) {
    return value.root===projectRoot&&value.branch===branch&&value.head===branchHead&&value.localMain===mainLocalHead&&value.page===repository&&value.account===auth.accountId&&value.session===auth.sessionId&&value.authEpoch===branchAuthEpoch;
  }
  async function checkForMainUpdates() {
    if(disposed||mainUpdateRunning||isBusy()||pendingUpload||vscode.workspace.isTrusted!==true||!auth.signedIn||!githubReady()||!projectRoot||!branch||branch==='main'||uploadMode()!=='live'||!repository.startsWith('https://github.com/'))return;
    const root=projectRoot,selectedBranch=branch,page=repository,account=auth.accountId,session=auth.sessionId,authEpoch=branchAuthEpoch,head=branchHead,localMain=mainLocalHead,attempt=++mainUpdateGeneration;
    const scope={root,branch:selectedBranch,page,account,session,authEpoch,head,localMain};
    mainUpdateNextAt=Date.now()+120000;
    if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head||'')||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(localMain||'')){mainUpdateStatus={...scope,state:'unknown'};refresh();return;}
    mainUpdateRunning=true;mainUpdateScope=scope;let stale=false;
    try {
      const ticket=await auth.capture();
      const guard=async()=>{await assertGitProject(root);await auth.assertCurrent(ticket);};
      const readState=async()=>{
        await guard();await core.assertRepositoryRoot(root);await github.assertNoUrlRewrites(root,core.git);
        let partial;try{partial=await core.git(root,['config','--get-regexp','^(extensions\\.partialclone|remote\\..*\\.promisor)$']);}catch(error){if(error.code!==1)throw error;}
        if(partial)throw new Error('A partial clone cannot be checked without fetching.');
        const names=(await core.git(root,['remote','get-url','--all','origin'])).split('\n'),push=(await core.git(root,['remote','get-url','--push','--all','origin'])).split('\n');
        if(names.length!==1||push.length!==1)throw new Error('Repository destination changed.');
        const destination=core.parseRepositoryUrl(names[0]);
        if(core.parseRepositoryUrl(push[0]).remote!==destination.remote)throw new Error('Repository destination changed.');
        const current=await core.currentBranch(root,core.git);
        const currentHead=await core.git(root,['rev-parse','--verify','HEAD^{commit}']);
        const currentMain=await core.git(root,['rev-parse','--verify','refs/heads/main^{commit}']);
        await guard();if(current!==selectedBranch||currentHead!==head||currentMain!==localMain){stale=true;throw new Error('The branch changed during the main update check.');}
        return {root,branch:current,head:currentHead,localMain:currentMain,remote:destination.remote,account:ticket.session.accountId};
      };
      const networkRun=await operationTransport(core.parseRepositoryUrl(page).remote,{root,authentication:auth,ticket,permissions:{contents:'read'},assertProject:guard,assertProjectNow:()=>assertGitProjectNow(root)});
      const result=await checkMainUpdate({readState,readRemote:state=>networkRun(root,['ls-remote','--heads',state.remote,'refs/heads/main']),isAncestor:async(older,newer)=>{try{await core.git(root,['--no-replace-objects','merge-base','--is-ancestor',older,newer],{env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key)))});return true;}catch(error){if(error.code===1)return false;if(error.code===128)return null;throw error;}}});
      await readState();
      if(!disposed&&attempt===mainUpdateGeneration&&currentMainObservation(scope)){mainUpdateStatus={...scope,state:result.state,localUpdate:result.localUpdate};refresh();}
    } catch {
      if(!stale&&!disposed&&attempt===mainUpdateGeneration&&currentMainObservation(scope)){mainUpdateStatus={...scope,state:'unknown'};refresh();}
    } finally {mainUpdateRunning=false;mainUpdateScope=undefined;if(!disposed&&stale){mainUpdateStatus=undefined;mainUpdateNextAt=0;void repositoryStatus();}else if(!disposed&&attempt!==mainUpdateGeneration&&Date.now()>=mainUpdateNextAt)void checkForMainUpdates();}
  }
  async function updateTracking(root, remote, branchName, head) {
    try {
      await assertGitProject(root);
      await updateRemoteTracking(root,{remote,branch:branchName,head});
      return true;
    } catch(error) {
      output.appendLine(`GitHub confirmed the update, but Source Control tracking was not refreshed: ${error.message}`);
      return false;
    }
  }
  async function rememberPush(record, accountId,tx) {
    const safe={root:record.root,remote:record.remote,page:record.page,branch:record.branch,head:record.head,committed:Boolean(record.committed),pushStarted:Boolean(record.pushStarted),kind:record.kind,accountId,...(record.operation==='merge'?{operation:'merge'}:{})};
    return addReminder(safe.root,safe,tx);
  }
  // Only an identified record can be resolved. Older call sites without an
  // exact record leave every reminder intact for explicit student review.
  async function clearPush(root,branchName,record,reason='confirmed',tx) {
    if(!record?.id||record.root!==root||record.branch!==branchName)return false;
    await resolveReminder(record,reason,tx);return true;
  }
  async function resolveConfirmedSync(root,branchName,remote,head,accountId,operation='branch',reviewed=[]) {
    const expected={root,branch:branchName,remote,head,accountId,operation};
    const selected=reviewed.filter(record=>matchesConfirmed(record,expected));if(!selected.length)return;
    const reconcile=async tx=>{const current=repositoryLedger?await tx.list():compatibilityAll(root,branchName);for(const record of selected){const latest=current.find(item=>item.id===record.id);if(latest&&JSON.stringify(latest)===JSON.stringify(record))await resolveReminder(record,'confirmed',tx);}};
    if(repositoryLedger)await repositoryLedger.withTransaction(root,reconcile);else await reconcile();
  }
  async function resolveReviewedLocal(root,branchName,head,reviewed,{only}={}) {
    const selected=[];for(const record of reviewed||[])if(record.type==='local'&&record.root===root&&record.branch===branchName&&(!only||record.id===only.id)&&await includesSavedCommit(root,record.head,head))selected.push(record);
    if(!selected.length)return;
    const reconcile=async tx=>{const current=repositoryLedger?await tx.list():compatibilityAll(root,branchName);for(const record of selected){const latest=current.find(item=>item.id===record.id);if(latest&&JSON.stringify(latest)===JSON.stringify(record))await resolveReminder(record,'confirmed',tx);}};
    if(repositoryLedger)await repositoryLedger.withTransaction(root,reconcile);else await reconcile();
  }
  async function resolveConfirmedMerge(root,reviewed,{branch,head,remote,accountId}) {
    if(!Array.isArray(reviewed)||!branch||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head||'')||!remote)return;
    const selected=reviewed.filter(record=>(record.type===undefined||record.type==='push')&&record.root===root&&record.operation==='merge'&&(record.branch===branch||record.branch==='main')&&record.head===head&&record.remote===remote&&record.accountId&&record.accountId===accountId);
    if(!selected.length)return;
    const reconcile=async tx=>{const current=repositoryLedger?await tx.list():compatibilityAll(root,branch);for(const record of selected){const latest=current.find(item=>item.id===record.id);if(latest&&JSON.stringify(latest)===JSON.stringify(record))await resolveReminder(latest,'confirmed',tx);}};
    try{if(repositoryLedger)await repositoryLedger.withTransaction(root,reconcile);else await reconcile();}
    catch(error){error.message+=' The earlier merge was confirmed on GitHub, but its reminders need inspection before continuing.';throw error;}
  }
  async function rememberLocalCommit(root,branchName,head,details={},tx) {
    return addReminder(root,{root,branch:branchName,head,remote:'',type:'local',...details},tx);
  }
  async function clearLocalCommit(root,branchName,record,tx) {
    if(!record?.id||record.root!==root||record.branch!==branchName)return false;
    await resolveReminder(record,'confirmed',tx);return true;
  }
  async function includesSavedCommit(root,older,newer) {
    if(older===newer)return true;
    const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key))),GIT_NO_LAZY_FETCH:'1'};
    try {
      const location=await core.git(root,['rev-parse','--git-common-dir'],{env});
      if(!location)return false;
      const common=await fs.realpath(path.resolve(root,location));
      if(!(await fs.stat(common)).isDirectory())return false;
      try {await fs.lstat(path.join(common,'info','grafts'));return false;}catch(error){if(error.code!=='ENOENT')throw error;}
      await core.git(root,['--no-replace-objects','merge-base','--is-ancestor',older,newer],{env});
      return true;
    }catch{return false;}
  }
  const isEarlierRemoteHead=(root,remoteHead,head)=>/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(remoteHead||'')&&remoteHead.length===head.length&&remoteHead!==head&&includesSavedCommit(root,remoteHead,head);
  async function syncCreatedBranch(root,created,remote,page,{updated=false,expectedAccount,expectedSession,expectedRevision,localRecordOnly,updateIntent,refOnlyOutcome,extraGuard,correction}={}) {
    const action=updated?'Updated':'Created';
    if(!remote){await rememberLocalCommit(root,created.branch,created.head);report(`${action} ${created.branch} locally · reconnect GitHub to sync`);return;}
    const base={root,remote,page,branch:created.branch,head:created.head,committed:false,pushStarted:false};
    const inspectRun=(cwd,args,options)=>args[0]==='status'?guardedRunner(core.git)(cwd,['-c','core.fsmonitor=false',...args],{...options,env:{...(options?.env||process.env),GIT_OPTIONAL_LOCKS:'0'}}):core.git(cwd,args,options);
    let accountId=expectedAccount===undefined?auth.accountId:expectedAccount;
    try {
      const missing=(await pushRecords(root,created.branch)).find(record=>record.kind==='remote-missing'&&record.root===root&&record.remote===remote&&record.branch===created.branch);
      if(missing){
        if(missing.head!==created.head)await rememberPush({...base,kind:'remote-missing'},missing.accountId);
        report(correction?`${correction.label} locally · review branch creation`:`${action} ${created.branch} locally · review branch creation`,`${correction?correction.detail+' ':''}GitHub reported this branch missing. Review branch creation before syncing.`);
        return false;
      }
      if(!auth.signedIn)throw Object.assign(new Error('Sign in to GitHub.'),{kind:'auth'});
      if(expectedAccount!==undefined && auth.accountId!==expectedAccount)throw Object.assign(new Error('The GitHub account changed. Review the sync before retrying.'),{kind:'auth'});
      let ownPushAttempt;
      const guard=async tx=>{await assertGitProject(root);if(expectedSession!==undefined&&(auth.sessionId||null)!==expectedSession||expectedRevision!==undefined&&auth.revision!==expectedRevision)throw Object.assign(new Error('The GitHub sign-in changed. Review the branch before syncing.'),{kind:'changed'});if(extraGuard)await extraGuard(tx,ownPushAttempt);},plan=await github.prepareUpload(root,inspectRun);
      if(plan.root!==root||plan.remote!==remote||plan.branch!==created.branch||plan.head!==created.head)throw Object.assign(new Error('The project changed before syncing.'),{kind:'changed'});
      await guard();
      const ticket=await auth.capture();
      if(expectedAccount!==undefined && ticket.session.accountId!==expectedAccount)throw Object.assign(new Error('The GitHub account changed. Review the sync before retrying.'),{kind:'auth'});
      accountId=ticket.session.accountId;
      const reviewedReminders=repositoryLedger?await allReminderRecords(root):compatibilityAll(root,created.branch);
      const networkRun=await operationTransport(remote,{root,allowedReminders:[...(localRecordOnly?[localRecordOnly]:[]),...(updateIntent?[updateIntent]:[]),...(refOnlyOutcome?[refOnlyOutcome.pending,refOnlyOutcome.acknowledged]:[])],refOnlyOutcome,reminderSnapshot:reviewedReminders,authentication:auth,ticket,assertProject:guard,assertProjectNow:()=>assertGitProjectNow(root),onPushAttempt:attempt=>{ownPushAttempt=attempt;}});
      const beforeUpload=async()=>{await guard();await auth.assertCurrent(ticket);};
      let alreadyPresent=false;
      {
        const checked=await github.checkUpload(root,base,{networkRun,beforeNetwork:beforeUpload});
        if(checked.confirmed){const current=await github.prepareUpload(root,inspectRun);if(['root','remote','branch','head','status','fingerprint'].some(key=>current[key]!==plan[key]))throw Object.assign(new Error('The project changed while checking the GitHub branch. Review it again.'),{kind:'changed'});await beforeUpload();alreadyPresent=true;}
        else if((updateIntent||refOnlyOutcome)&&created.branch==='main'&&checked.remoteHead!==(updateIntent?.reviewedRemoteHead||refOnlyOutcome?.pending.reviewedRemoteHead)){if(checked.remoteHead===null)await rememberPush({...base,kind:'remote-missing'},accountId);throw Object.assign(new Error('GitHub main changed or is missing. The local update and recovery copies are kept; review main before syncing.'),{kind:'changed'});}
        else if(updated&&checked.remoteHead===null){await beforeUpload();await rememberPush({...base,kind:'remote-missing'},accountId);report(`Updated ${created.branch} locally · review branch creation`,'GitHub reported this branch missing. The updated commit and recovery copies are kept; review branch creation before syncing.');return false;}
        else if(!updated&&checked.remoteHead!==null)throw Object.assign(new Error('A different GitHub branch already uses this name. The new local branch is kept; inspect the existing branch before syncing.'),{kind:'changed'});
      }
      const synced=alreadyPresent?{localChanged:false}:await github.syncExistingHead(plan,{run:inspectRun,beforeUpload,networkRun,onProgress:text=>{state=text;refresh();}});
      if(alreadyPresent&&refOnlyOutcome){await commitProvenance.withDeferredRefMutation(root,binding=>{const authority=Object.freeze({...binding,assertCurrentNow(){binding.assertCurrentNow();assertGitProjectNow(root);auth.assertCurrentNow(ticket);}});return repositoryLedger.withProvenance(root,authority,async tx=>{await guard(tx);await auth.assertCurrent(ticket);let rows=await tx.list();require('./reftable-ref-only-intent').assertLiveRefOnlySync(refOnlyOutcome,{root,branch:created.branch,head:created.head,remote,accountId:ticket.session.accountId,sessionId:ticket.session.id,records:rows});for(const expected of [refOnlyOutcome.acknowledged,refOnlyOutcome.pending]){await guard(tx);await auth.assertCurrent(ticket);rows=await tx.list();if(!rows.some(row=>row.id===expected.id&&JSON.stringify(row)===JSON.stringify(expected)))throw new Error('The confirmed ref-only reminder changed. Inspect it before continuing.');tx.assertCurrentNow();assertGitProjectNow(root);auth.assertCurrentNow(ticket);await tx.resolve(expected.id,'confirmed');}});});}
      if(alreadyPresent&&updateIntent){await repositoryLedger.withTransaction(root,async tx=>{const rows=await tx.list(),latest=rows.find(row=>row.id===updateIntent.id);if(!latest||JSON.stringify(latest)!==JSON.stringify(updateIntent))throw new Error('The update sync reminder changed. Inspect it before continuing.');await require('./reftable-update-intent-validation').assertRetryableReftableUpdateIntent({record:latest,root,branch:created.branch,head:created.head,remote,accountId:ticket.session.accountId,sessionId:ticket.session.id,beforeReview:beforeUpload,beforeReviewNow:()=>{tx.assertCurrentNow();assertGitProjectNow(root);return auth.assertCurrentNow(ticket);}});tx.assertCurrentNow();await tx.resolve(latest.id,'confirmed');});}
      if(!localRecordOnly)await resolveConfirmedSync(root,created.branch,remote,created.head,ticket.session.accountId,'branch',reviewedReminders);
      await updateTracking(root,remote,created.branch,created.head);
      await resolveReviewedLocal(root,created.branch,created.head,reviewedReminders,{only:localRecordOnly});
      let unsaved;try{unsaved=(await dirtyProjectDocuments(vscode,root)).length>0;}catch{unsaved=undefined;}
      const localEdits=Boolean(synced.localChanged||plan.changes.length||unsaved);
      const detail=(localEdits?'The saved branch commit was confirmed on GitHub. Any uncommitted changes or unsaved edits remain on this computer.':unsaved===undefined?'The saved branch commit was confirmed on GitHub.':updated?'Update confirmed on GitHub.':alreadyPresent?'The existing GitHub branch already matches this saved commit.':'Branch created and confirmed on GitHub.')+(unsaved===undefined?' Open files could not be checked; review them before continuing.':'');
      const suffix=unsaved===undefined?' · check open files':localEdits?' · check local edits':'';
      if(correction)report(`${correction.label} · synced to GitHub${suffix} · run your app`,`${correction.detail} ${detail} Run your app.`);
      else report(`${action} ${created.branch} · synced to GitHub${suffix}`,detail);
      return true;
    } catch(error) {
      const failure=error.uploadRecovery||{...base,kind:github.gitError(error,'sync').kind};
      await rememberPush(failure,accountId);
      const detail=error.recoveryPath?`${error.message} Lock: ${error.recoveryPath}`:error.uploadRecovery?gitRecoveryPanel.uploadMessage(failure):error.message;
      if(correction)report(`${correction.label} locally · sync needs attention · run your app`,`${correction.detail} ${detail} Run your app.`);
      else report(`${action} ${created.branch} locally · sync needs attention`,detail);
    } finally {if(refOnlyOutcome)require('./reftable-ref-only-intent').expireLiveRefOnlySync(refOnlyOutcome);}
  }
  async function checkpointBefore(root, action) {
    await assertGitProject(root);
    if(await workflow.readRecovery?.(root))throw new Error('Finish the update choices or Cancel update in the Zero sidebar before starting another Git step.');
    if (!await guardedRunner(core.git)(root,['-c','core.fsmonitor=false','status','--porcelain=v1','-z','--untracked-files=all'],{env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}})) return true;
    const label=action==='switch'?'Save checkpoint & switch':'Save checkpoint & update';
    const choice=await vscode.window.showWarningMessage(`Save a local checkpoint before ${action==='switch'?'switching branches':'updating'}? This commits your current changes on this branch. Nothing is uploaded.`,{modal:true},label);
    if (choice!==label) return false;
    await assertGitProject(root);
    const options={beforeMutation:()=>assertGitProject(root),message:action==='switch'?'Checkpoint before switching branches':'Checkpoint before updating from GitHub'};
    await workflowLocalPhase(root,options,phase=>workflow.checkpoint(root,phase));
    return true;
  }
  async function applyUpdateChoice(side, token) {
    if (isBusy()) return;
    await settleBranchCheck();if(isBusy())return;const missing=observedMissing(projectRoot);
    changing=true;refresh();let confirmed=false;
    try {
      const root=await project();
      if(uploadMode(root)!=='live')return simulation('Resolve update');
      if(side!=='continue')throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
      await assertGitProject(root);
      const guard=async()=>{await assertGitProject(root);if((await dirtyProjectDocuments(vscode,root)).length)throw new Error('You have unsaved edits. Save or undo those edits before choosing update recovery. Your work is kept.');};
      await guard();
      const current=await workflow.readRecovery(root);
      if(!current || token!==gitRecoveryPanel.selection(current).token)throw new Error('The update choice changed. Review the current conflict in the sidebar again.');
      if(side!=='cancel'&&missing){
        if(!currentBranchObservation(missing)||missing.root!==root||missing.branch!==current.branch||missing.head!==current.head||missing.remote!==current.remote)throw new Error('The GitHub account, repository or branch changed. Check the connection before continuing.');
        if(!(await pushRecords(root,missing.branch)).some(row=>row.kind==='remote-missing'&&row.head===missing.head&&row.remote===missing.remote&&row.accountId===missing.account))await rememberPush({root,remote:missing.remote,page:core.parseRepositoryUrl(missing.remote).page,branch:missing.branch,head:missing.head,committed:false,pushStarted:false,kind:'remote-missing'},missing.account);
      }
      const {file,conflict}=gitRecoveryPanel.selection(current);
      if(side==='continue' && !current.readyToCommit)throw new Error('The update is not ready to continue. Review its current state.');
      const result=await workflowLocalPhase(root,{beforeMutation:guard},phase=>side==='cancel' ? workflow.cancelRecovery(root,phase) : side==='continue' ? workflow.completeRecovery(root,current.id,current.readyFingerprint,phase) : workflow.resolveRecovery(root,{path:file.path,conflictId:conflict.id,side},phase));
      await refreshNativeGit(root);
      if(side!=='cancel'&&result.synced&&result.branch!=='main')confirmed=await syncCreatedBranch(root,{branch:result.branch,head:result.head},result.remote,result.page,{updated:true});
      else if(side!=='cancel'&&result.synced) {confirmed=true;report('Main updated · run your app');}
      else report(side==='cancel'?'Update cancelled · starting checkpoint restored':`Choose changes to keep in ${gitRecoveryPanel.selection(result.recovery).file?.path || 'the next file'}`);
    } finally {changing=false;await repositoryStatus({forceBranchCheck:confirmed});refresh();}
  }
  async function compareUpdate(token) {
    if(isBusy())return;
    const root=await project();await assertGitProject(root);
    const current=await workflow.readRecovery(root);
    if(!current||token!==gitRecoveryPanel.selection(current).token)throw new Error('The conflict changed. Open its current comparison again.');
    const {file,conflict}=gitRecoveryPanel.selection(current);
    if(file.kind!=='text')throw new Error('Use Source Control to inspect this file.');
    updatePreviews.clear();
    const local=vscode.Uri.parse(`zero-update-preview:/${token}/local/${encodeURIComponent(file.path)}`),incoming=vscode.Uri.parse(`zero-update-preview:/${token}/incoming/${encodeURIComponent(file.path)}`);
    updatePreviews.set(local.toString(),conflict.local);updatePreviews.set(incoming.toString(),conflict.incoming);
    await vscode.commands.executeCommand('vscode.diff',local,incoming,`${file.path}: local ↔ ${current.remoteBranch==='main'?'GitHub main':'GitHub branch'}`);
  }
  async function checkPush() {
    if(isBusy())return;
    changing=true;refresh();let confirmed=false;
    try {
      const root=await project();
      if(uploadMode(root)!=='live')return simulation('Check GitHub status');
      await repositoryStatus();
      const record=pendingUpload;
      if(!record||record.root!==root)throw new Error('There is no matching pending sync for this branch. Review your commits again.');
      if(!knownPush(record))throw new Error('The earlier sync reminder is not recognized. Inspect it before continuing.');
      if(record.operation==='merge')throw new Error('Use Retry Merge to main to confirm the completed main update. The feature push is separate.');
      const reviewed=(await pushRecords(root,record.branch)).filter(row=>samePushGroup(row,record));
      if(!reviewed.some(row=>JSON.stringify(row)===JSON.stringify(record)))throw new Error('The sync reminder changed. Review it again.');
      const ticket=await auth.capture();
      if(!record.accountId||record.accountId!==ticket.session.accountId)throw new Error('The earlier sync is not bound to this GitHub account. Review the account and reminder before continuing.');
      const assertProject=async()=>{
        await assertGitProject(root);
        if(await core.currentBranch(root,core.git)!==record.branch)throw new Error('The branch changed. Review the sync reminder again.');
        const urls=(await core.git(root,['remote','get-url','--all','origin'])).split('\n'),push=(await core.git(root,['remote','get-url','--push','--all','origin'])).split('\n');
        if(urls.length!==1||push.length!==1||core.parseRepositoryUrl(urls[0]).remote!==record.remote||core.parseRepositoryUrl(push[0]).remote!==record.remote)throw new Error('The repository destination changed. Review the sync reminder again.');
      };
      const validateUpdates=async()=>{for(const row of reviewed)if(row.operation==='reftable-update')await require('./reftable-update-intent-validation').assertRetryableReftableUpdateIntent({record:row,root,branch:record.branch,head:record.head,remote:record.remote,accountId:ticket.session.accountId,sessionId:ticket.session.id,beforeReview:assertProject,beforeReviewNow:()=>{assertGitProjectNow(root);return auth.assertCurrentNow(ticket);}});};
      await validateUpdates();const networkRun=await operationTransport(record.remote,{root,authentication:auth,ticket,assertProject,assertProjectNow:()=>assertGitProjectNow(root)});
      const result=await github.checkUpload(root,record,{networkRun,beforeNetwork:async()=>{await assertProject();await auth.assertCurrent(ticket);await validateUpdates();}});
      confirmed=Boolean(result.confirmed);
      await assertProject();await auth.assertCurrent(ticket);await validateUpdates();
      const ready=!confirmed&&['network','unconfirmed','changed','behind','ready'].includes(record.kind)&&reviewed.every(row=>row.operation!=='reftable-update')&&await isEarlierRemoteHead(root,result.remoteHead,record.head);
      const reconcile=async tx=>{
        const current=repositoryLedger?await tx.list():compatibilityRecords(root,record.branch);
        for(const snapshot of reviewed){const latest=current.find(row=>row.id===snapshot.id);if(!latest||JSON.stringify(latest)!==JSON.stringify(snapshot))throw new Error('The sync reminders changed during the check. Review them again.');}
        const authority=async()=>{await assertProject();await auth.assertCurrent(ticket);await validateUpdates();tx?.assertCurrentNow();assertGitProjectNow(root);auth.assertCurrentNow(ticket);};
        if(!result.confirmed){await authority();await rememberPush({...record,kind:result.remoteHead===null?'remote-missing':ready?'ready':'behind',...(ready?{pushStarted:false}:{})},record.accountId,tx);}
        for(const snapshot of reviewed){if(!result.confirmed&&snapshot.operation==='reftable-update')continue;await authority();await clearPush(root,record.branch,snapshot,result.confirmed?'confirmed':'superseded',tx);}
      };
      if(repositoryLedger)await repositoryLedger.withTransaction(root,reconcile);else await reconcile();
      if(result.confirmed){await updateTracking(root,record.remote,record.branch,record.head);await refreshNativeGit(root);report(`GitHub confirmed ${record.head.slice(0,8)} on ${record.branch}`);}
      else report(result.remoteHead===null?'GitHub branch is missing · review before syncing':ready?'GitHub is behind this saved commit · review Retry sync':'GitHub has not confirmed this commit · review the recovery action');
    } finally {changing=false;await repositoryStatus({forceBranchCheck:confirmed});refresh();}
  }
  async function reconnectPush() {
    if(isBusy())return;
    const root=await project();
    if(uploadMode(root)!=='live')return simulation('Reconnect GitHub for push');
    await assertGitProject(root);await repositoryStatus();
    const record=pendingUpload;
    if(!record||record.root!==root||record.kind!=='auth'||!knownPush(record)||!record.accountId)throw new Error('This reminder does not request sign-in, or its GitHub account cannot be verified. Inspect it before syncing.');
    await signIn(false);
    await assertGitProject(root);
    await repositoryStatus();
    if(!auth.signedIn)return;
    if(record.accountId!==auth.accountId)throw new Error('The GitHub account changed. Review the account and repository before starting a new upload.');
    if(!pendingUpload||JSON.stringify(pendingUpload)!==JSON.stringify(record))throw new Error('The sync reminder changed. Review it before continuing.');
    const checkDestination=async()=>{await assertGitProject(root);if(await core.currentBranch(root,core.git)!==record.branch)throw new Error('The branch changed. Review the sync reminder before continuing.');const urls=(await core.git(root,['remote','get-url','--all','origin'])).split('\n'),push=(await core.git(root,['remote','get-url','--push','--all','origin'])).split('\n');if(urls.length!==1||push.length!==1||core.parseRepositoryUrl(urls[0]).remote!==record.remote||core.parseRepositoryUrl(push[0]).remote!==record.remote)throw new Error('The GitHub repository changed. Review the sync reminder before continuing.');};
    await checkDestination();
    const ticket=await auth.capture();if(ticket.session.accountId!==record.accountId)throw new Error('The GitHub account changed. Review the sync reminder before continuing.');
    const replace=async tx=>{const current=(await pushRecords(root,record.branch,tx)).find(row=>row.id===record.id);if(!current||JSON.stringify(current)!==JSON.stringify(record))throw new Error('The sync reminder changed. Review it before continuing.');await checkDestination();await auth.assertCurrent(ticket);await checkDestination();tx?.assertCurrentNow();auth.assertCurrentNow(ticket);await rememberPush({...record,kind:'ready'},record.accountId,tx);await clearPush(root,record.branch,record,'superseded',tx);};
    if(repositoryLedger)await repositoryLedger.withTransaction(root,replace);else await replace();
    await repositoryStatus();
    report(record.operation==='merge'?'Signed in · retry Merge to main':'Signed in · your local commits are ready to push');
  }
  const assertUpdateClean=async (root,action='updating')=>{
    await assertGitProject(root);
    if((await dirtyProjectDocuments(vscode,root)).length)throw new Error(`Save or undo your project editor changes before ${action}. Then commit or discard any saved changes.`);
    if(await guardedRunner(core.git)(root,['-c','core.fsmonitor=false','status','--porcelain=v1','-z','--untracked-files=all'],{env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}))throw new Error(`Commit or discard your project changes before ${action}. Your work is kept.`);
    await assertGitProject(root);
    if((await dirtyProjectDocuments(vscode,root)).length)throw new Error(`Save or undo your project editor changes before ${action}. Then commit or discard any saved changes.`);
  };
  async function change(kind,{remoteReview}={}) {
    if (isBusy()) return;
    await settleBranchCheck();if(isBusy())return;
    const missing=observedMissing(projectRoot);
    changing = true; refresh();
    let reviewedAccountId;
    try {
      const root = await project();
      await lessonProjects.assertShareable(root);
      if (uploadMode(root) !== 'live') {simulation(kind === 'start' ? 'New branch' : kind === 'sync' || kind === 'updateBranch' ? 'Update from GitHub' : 'Merge to main');return;}
      let name;
      if (kind === 'start') {
        name = await vscode.window.showInputBox({title:'Branch name',validateInput:value=>/^[a-z0-9][a-z0-9-]*$/.test(value)?undefined:'Use lowercase letters, numbers and dashes, starting with a letter or number.'});
        if (!name) return;
        if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error('Use lowercase letters, numbers and dashes for your change name.');
      }
      const execute = async progress => {
        const reportProgress = message => {state=message;refresh();progress?.report({message});};
        await assertGitProject(root);
        const beforeLocalMutation = () => assertGitProject(root);
        if (kind === 'start') {
          reportProgress('Checking your local branch…');
          const canonical = async value => {
            let current = path.resolve(value), suffix = [];
            while (true) {
              try {return path.join(await fs.realpath(current), ...suffix);}
              catch (error) {if (error.code !== 'ENOENT') throw error;const parent=path.dirname(current);if(parent===current) throw error;suffix.unshift(path.basename(current));current=parent;}
            }
          };
          const projectPath = await canonical(root);
          const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
          const lexicalRoots = [root];
          for (const folder of vscode.workspace.workspaceFolders || []) {
            try {
              const realFolder=await canonical(folder.uri.fsPath);
              const relative=path.relative(normalize(realFolder),normalize(projectPath));
              if (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..'+path.sep)) lexicalRoots.push(path.join(folder.uri.fsPath,relative));
              const withinProject=path.relative(normalize(projectPath),normalize(realFolder));
              if (!path.isAbsolute(withinProject) && withinProject !== '..' && !withinProject.startsWith('..'+path.sep)) lexicalRoots.push(folder.uri.fsPath);
            } catch { /* An unrelated inaccessible workspace must not block this project. */ }
          }
          const dirtyDocuments = async () => {
            const documents = (vscode.workspace.textDocuments || []).filter(document => document.isDirty && document.uri?.scheme === 'file');
            const inside = name => {const relative=path.relative(normalize(projectPath), normalize(name));return relative && relative !== '..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);};
            const entries = await Promise.all(documents.map(async document => {
              const name=document.uri.fsPath;
              try {return {name, version:document.version, targets:[await canonical(name), path.join(await canonical(path.dirname(name)),path.basename(name))]};}
              catch (error) {
                const possibleProject = lexicalRoots.some(base => {const relative=path.relative(normalize(path.resolve(base)),normalize(path.resolve(name)));return relative && relative !== '..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);});
                if (possibleProject) throw error;
                return {name,version:document.version,targets:[]};
              }
            }));
            return entries.filter(entry => entry.targets.some(inside)).map(({name,version})=>[name,version]).sort((a,b) => a[0].localeCompare(b[0]));
          };
          const dirtyBefore = await dirtyDocuments();
          const buffersChanged = async () => JSON.stringify(await dirtyDocuments()) !== JSON.stringify(dirtyBefore);
          const checkBuffers = async () => {if (await buffersChanged()) throw new Error('Your open files changed. Review this step again. Your work is preserved.');};
          const reviewedAccount=auth.accountId||null,reviewedSession=auth.sessionId||null,reviewedRevision=auth.revision;
          let plan;
          const checkBranchAuth=()=>{if(plan?.remote&&((auth.accountId||null)!==reviewedAccount||(auth.sessionId||null)!==reviewedSession||auth.revision!==reviewedRevision))throw new Error('The GitHub sign-in changed. Review branch creation again; your work is kept.');};
          const options = {beforeMutation:async () => {await beforeLocalMutation();await checkBuffers();checkBranchAuth();},beforeCheckout:async()=>{await checkBuffers();checkBranchAuth();},onProgress:reportProgress};
          plan = await workflow.prepareStart(root,name,options);
          if(plan.remote||plan.status||dirtyBefore.length){
            const moving=Boolean(plan.status||dirtyBefore.length),button=moving?'Move changes':'Create branch';
            const detail=`Create ${name} from ${plan.branch} at ${plan.head}. Project changes come with you without being committed; unsaved open files stay open.${plan.remote?` Zero will check refs/heads/${name} in ${plan.page} and, if it is absent, try to sync this saved commit. The check and non-force push are not atomic: if someone creates or rewinds that branch in between, the push may fast-forward it.`:''}`;
            if(await vscode.window.showWarningMessage(moving?`Move your changes to ${name}?`:'Create this branch?',{modal:true,detail},button)!==button){state='Branch creation cancelled';return;}
          }
          await options.beforeMutation();
          const result = await workflowLocalPhase(root,options,phase=>workflow.startPrepared(plan,phase));
          await refreshNativeGit(root);
          if (result.activeUncertain) {
            report(`Created ${result.branch} · check Source Control`, `Created ${result.branch}, but the active branch or commit changed or could not be checked. Check Source Control before continuing.`);
            void vscode.window.showWarningMessage('The branch was created, but the active branch could not be confirmed. Check Source Control before continuing. Your unsaved work is still open.');
          } else {
            report(`Created ${result.branch}`,`Started ${result.branch} locally. Make your changes, then commit.`);
            if (result.checkoutWarning) void vscode.window.showWarningMessage('The branch was created, but Git reported an error during checkout. Check Source Control before continuing. Your unsaved work is still open.');
            else if (result.postCheckoutChanged || await buffersChanged().catch(() => true)) void vscode.window.showWarningMessage('Your files changed while the branch was being created, or could not be checked. The branch was created; check Source Control. Your unsaved work is still open.');
            else await syncCreatedBranch(root,result,plan.remote,plan.page,{expectedAccount:reviewedAccount,expectedSession:reviewedSession,expectedRevision:reviewedRevision});
          }
          return;
        }
        const updating=kind==='sync'||kind==='updateBranch';
        await assertUpdateClean(root,updating?'updating':'merging');
        reportProgress('Checking GitHub access…');
        const ticket = await auth.capture();
        reviewedAccountId=ticket.session.accountId;
        const reviewedSyncSession=auth.sessionId||null,reviewedSyncRevision=auth.revision;
        const destination = core.parseRepositoryUrl(await core.git(root,['remote','get-url','origin']));
        const assertProject = () => assertGitProject(root);
        const allowedMergeReminders=[];
        const mergeReminderSnapshot=repositoryLedger?await allReminderRecords(root):pendingLedger.enumerable?compatibilityAll(root,branch):undefined;
        const selectMergeReminders=plan=>{if(!plan?.pending)return;for(const record of mergeReminderSnapshot||[])if(record.operation==='merge'&&record.remote===destination.remote&&(record.branch===plan.branch||record.branch==='main')&&record.head===plan.pending.id)allowedMergeReminders.push(record);};
        const networkRun = await operationTransport(destination.remote,{root,allowedReminders:allowedMergeReminders,reminderSnapshot:mergeReminderSnapshot,syncOperation:kind==='finish'?'merge':'branch',authentication:auth,ticket,assertProject,assertProjectNow:()=>assertGitProjectNow(root)});
        const workspaceNow=()=>(vscode.workspace.workspaceFolders||[]).map(folder=>[folder.uri.scheme,folder.uri.fsPath]);
        const dirtyNow=()=>(vscode.workspace.textDocuments||[]).filter(document=>document.isDirty&&document.uri?.scheme==='file').map(document=>({document,name:document.uri.fsPath,version:document.version}));
        const sameDirty=(a,b)=>a.length===b.length&&a.every((entry,index)=>entry.document===b[index].document&&entry.name===b[index].name&&entry.version===b[index].version);
        let authority;
        const beforeNetwork = async () => {
          const workspace=workspaceNow(),dirty=dirtyNow();await assertProject();await assertUpdateClean(root,updating?'updating':'merging');await auth.assertCurrent(ticket);
          if(JSON.stringify(workspace)!==JSON.stringify(workspaceNow())||!sameDirty(dirty,dirtyNow()))throw new Error('The workspace or open files changed. Review this step again; your edits are kept.');
          authority={workspace,dirty};
        };
        const beforeMutation = beforeNetwork;
        const beforeOwnedUpdateMutation=async()=>{const workspace=workspaceNow(),dirty=dirtyNow();await assertProject();if((await dirtyProjectDocuments(vscode,root)).length)throw new Error('Save or undo your project editor changes before updating. Your edits are kept.');await auth.assertCurrent(ticket);if(JSON.stringify(workspace)!==JSON.stringify(workspaceNow())||!sameDirty(dirty,dirtyNow()))throw new Error('The workspace or open files changed. Review this step again; your edits are kept.');authority={workspace,dirty};};
        const beforeMutationNow=()=>{assertGitProjectNow(root);auth.assertCurrentNow(ticket);if(!authority||JSON.stringify(authority.workspace)!==JSON.stringify(workspaceNow())||!sameDirty(authority.dirty,dirtyNow()))throw new Error('The workspace or open files changed. Review this step again; your edits are kept.');};
        const options = {networkRun,beforeNetwork,beforeMutation,beforeOwnedUpdateMutation,beforeMutationNow,onProgress:reportProgress,...(kind==='updateBranch'?{target:'branch'}:{})};
        let plan;
        try { plan = updating ? await workflow.prepareSync(root,options) : await workflow.prepareFinish(root,options); }
        catch (error) {
          if (updating || !error.pendingFinishDrift) throw error;
          const recoveryPlan=await workflow.preparePendingFinishRecovery(root,options);selectMergeReminders(recoveryPlan);
          if (recoveryPlan.remote !== destination.remote) throw new Error('The connected repository changed. Review this step again.');
          let result=await workflowLocalPhase(root,options,phase=>workflow.recoverPendingFinish(recoveryPlan,phase));
          if (result.needsPush) {
            const choice=await vscode.window.showWarningMessage('Retry the earlier merge?',{modal:true,detail:`Push commit ${result.candidate} to refs/heads/main in ${result.page}. Your newer branch commits stay on this branch. The final GitHub check and non-force push are not atomic: if main is deleted or rewound in between, the push may recreate or fast-forward it.`},'Merge');
            if (choice!=='Merge') return;
            await beforeNetwork();
            result=await workflowLocalPhase(root,{...options,allowPush:true},phase=>workflow.recoverPendingFinish(recoveryPlan,phase));
          }
          if (result.recovered) {
            await resolveConfirmedMerge(root,mergeReminderSnapshot,{branch:result.branch||recoveryPlan.branch,head:result.finishedHead,remote:result.remote||recoveryPlan.remote,accountId:ticket.session.accountId});
            await refreshNativeGit(root);
            report('Earlier merge confirmed · update from main', 'Your newer commits remain on this branch. Update from main, run your app, then merge the newer work.');
          } else if (result.needsSync) {
            if(result.remoteHead===null)report('GitHub main is missing · review before merging', 'GitHub reported main missing. Your local commits are preserved; inspect the repository before recreating or merging main.');
            else report('GitHub main changed · update from main', 'Update from main, run your app, then merge your changes. Your commits are preserved.');
          }
          return;
        }
        if (plan.remote !== destination.remote) throw new Error('The connected repository changed. Review this step again.');
        if(updating&&plan.refStorage==='reftable'&&(plan.reftableUpdate||plan.reftableArchived))throw Object.assign(new Error('Updating files in this Git reference format is temporarily unavailable. Your files and commits are kept.'),{nativeUpdateHandoff:true});
        if(updating&&plan.refStorage==='files'&&plan.head!==plan.remoteMainHead&&!plan.filesAncestryReviewed)throw new Error('Review this update again before changing the project. Your files and commits are kept.');
        if(updating&&kind==='sync'&&missing&&plan.branch!=='main'){
          assertMissingPlan(missing,plan);
          await rememberPush({root,remote:plan.remote,page:plan.page,branch:plan.branch,head:plan.head,committed:false,pushStarted:false,kind:'remote-missing'},missing.account);
        }
        if(remoteReview&&(!currentBranchObservation(remoteReview)||plan.root!==remoteReview.root||plan.branch!==remoteReview.branch||plan.head!==remoteReview.head||plan.remote!==remoteReview.remote||plan.remoteMainHead!==remoteReview.remoteHead))throw new Error('The GitHub branch changed after confirmation. Check its connection and review the update again.');
        if(!updating)selectMergeReminders(plan);
        if(!updating){
          if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(plan.remoteMainHead||''))throw new Error('GitHub main could not be reviewed. Check the connection before merging.');
          const detail=`Merge ${plan.branch} into refs/heads/main in ${plan.page}. Local main at review: ${plan.mainHead}. GitHub main at review: ${plan.remoteMainHead}. Your feature branch is kept. The final GitHub check and non-force push are not atomic: if main is deleted or rewound in between, the push may recreate or fast-forward it.`;
          if(await vscode.window.showWarningMessage('Merge this change to main?',{modal:true,detail},'Merge')!=='Merge')return;
        }
        if(updating&&plan.refStorage==='reftable'&&plan.reftableArchived){const sample=Array.isArray(plan.preview.fileNames)?plan.preview.fileNames.map(name=>`• ${name}`).join('\n'):'',remaining=plan.preview.paths-(plan.preview.fileNames?.length||0);const detail=`GitHub main at review: ${plan.remoteMainHead}. Switch from ${plan.branch} to main and update ${plan.preview.paths} project file(s).${sample?`\n\n${sample}${remaining>0?`\n… and ${remaining} more`:''}\n`:''}\nThe local feature branch and recovery copies are kept. External editors and Git processes can still change files during the update; this operation is not atomic with those writers.`;if(await vscode.window.showWarningMessage('Update and switch to main?',{modal:true,detail},'Update')!=='Update')return;}
        if(updating&&plan.reftableRefOnly){const detail=`Advance ${plan.branch} from ${plan.head} to the reviewed GitHub ${plan.remoteBranch} commit ${plan.remoteMainHead}. The saved files do not change.${plan.branch==='main'?'':` Zero will check and try to sync this branch to ${plan.page}. If GitHub reports the branch missing, review branch creation first. The check and non-force push are not atomic, so a branch deleted between them could be recreated.`}`;if(await vscode.window.showWarningMessage('Update this branch?',{modal:true,detail},'Update')!=='Update')return;}
        if(updating&&plan.reftableUpdate){const sample=(plan.preview.fileNames||[]).map(name=>`• ${name}`).join('\n'),remaining=plan.preview.paths-(plan.preview.fileNames?.length||0),detail=`${plan.mergeCandidate?`Merge reviewed GitHub ${plan.remoteBranch} at ${plan.remoteMainHead} into ${plan.branch}, creating merge commit ${plan.mergeCandidate.candidate} with your current commit ${plan.head} and the reviewed GitHub commit as parents.`:`Update ${plan.branch} to reviewed GitHub ${plan.remoteBranch} at ${plan.remoteMainHead}.`} ${plan.preview.paths} project file(s) change.${sample?`\n\n${sample}${remaining>0?`\n… and ${remaining} more`:''}\n`:''}\nRecovery copies are kept.${plan.mergeCandidate&&plan.branch==='main'?' Zero will check that GitHub main still matches the reviewed commit before a non-force push. The check and push are not atomic: main deleted in between could be recreated, and main rewound in between could be fast-forwarded.':plan.branch!=='main'?' Zero will check and try to sync the updated branch to GitHub; if GitHub reports it missing, review branch creation first. That check and the non-force push are not atomic, so a branch deleted between them could be recreated.':''} External editors and Git processes can still change files during the update; this operation is not atomic with those writers.`;if(await vscode.window.showWarningMessage('Update this branch?',{modal:true,detail},'Update')!=='Update')return;}
        await beforeNetwork();
        if(updating&&plan.refStorage==='reftable'&&(plan.reftableUpdate||plan.reftableArchived))throw Object.assign(new Error('Updating files in this Git reference format is temporarily unavailable. Your files and commits are kept.'),{nativeUpdateHandoff:true});
        if(updating&&plan.refStorage==='files'&&plan.head!==plan.remoteMainHead&&!plan.filesAncestryReviewed)throw new Error('Review this update again before changing the project. Your files and commits are kept.');
        let updateIntent;
        if(updating&&plan.reftableRefOnly){if(!await supportsFileReminders(root)||!repositoryLedger||!ticket.session?.id)throw new Error('This update requires durable account-bound sync recovery. No update was started.');options.refOnlyIntent={ledger:repositoryLedger,reviewed:await allReminderRecords(root),remote:plan.remote,page:plan.page,accountId:ticket.session.accountId,sessionId:ticket.session.id};}
        if(updating&&plan.mergeCandidate){if(!await supportsFileReminders(root)||!repositoryLedger||!ticket.session?.id)throw new Error('This update requires durable account-bound sync recovery. No update was started.');const reviewed=await allReminderRecords(root);options.applyWithUpdateIntent=async(details,apply,binding)=>{const outcome=await require('./reftable-update-intent').applyWithReftableUpdateIntent({root,binding,ledger:repositoryLedger,reviewed,...details,remote:plan.remote,page:plan.page,accountId:ticket.session.accountId,sessionId:ticket.session.id,beforeMutation:beforeOwnedUpdateMutation,beforeMutationNow,apply});updateIntent=outcome.intent;return outcome.result;};}
        const result = plan.reftableRefOnly?await workflow.syncPrepared(plan,options):await workflowLocalPhase(root,options,phase=>updating ? workflow.syncPrepared(plan,phase) : workflow.finishPrepared(plan,phase),{ownedSwitch:Boolean(updating&&plan.refStorage==='reftable'&&plan.reftableArchived),ownedUpdate:Boolean(updating&&plan.reftableUpdate),readOnly:Boolean(updating&&plan.reftableNoop)});
        if (updating) {
          if(result.recovery){report('Choose changes to keep · nothing uploaded');await refreshNativeGit(root);return;}
          const confirmedMerge=result.confirmedMerge||result.confirmedFinish;
          if(confirmedMerge)await resolveConfirmedMerge(root,mergeReminderSnapshot,{branch:confirmedMerge.branch,head:confirmedMerge.head,remote:result.remote||plan.remote,accountId:ticket.session.accountId});
          const tracking = result.noTracking || !result.remoteHead || await updateTracking(root,result.remote || plan.remote,result.remoteBranch,result.remoteHead);
          await refreshNativeGit(root);
          if(result.confirmedFinish){
            report('Earlier merge confirmed · switched to main', `GitHub already received ${result.confirmedFinish.branch}. Local main now includes the reviewed GitHub changes; the local feature branch was kept. Run your app.`);
          } else if(result.updated&&(result.branch!=='main'||plan.mergeCandidate||result.refOnlyOutcome))await syncCreatedBranch(root,{branch:result.branch,head:result.head},result.remote||plan.remote,result.page||plan.page,{updated:true,expectedAccount:ticket.session.accountId,expectedSession:reviewedSyncSession,expectedRevision:reviewedSyncRevision,updateIntent,refOnlyOutcome:result.refOnlyOutcome});
          else report(result.updated?'Main updated · run your app':`Already up to date with GitHub ${result.remoteBranch||'main'}`);
          if (!tracking) void vscode.window.showWarningMessage('Updated from GitHub · Source Control tracking needs refresh; see Zero Output.');
          return;
        }
        if(result.finished)await resolveConfirmedMerge(root,mergeReminderSnapshot,{branch:result.finishedBranch||plan.branch,head:result.head,remote:result.remote||plan.remote,accountId:ticket.session.accountId});
        const tracking = await updateTracking(root,result.remote || plan.remote,'main',result.head);
        await refreshNativeGit(root);
        state = !tracking ? 'Merged to main · tracking needs refresh; branch kept' : 'Merged to main · branch kept';
        const detail=`Merged ${result.finishedBranch} to main and confirmed ${result.head} on GitHub. The local feature branch was kept.`;
        if (!tracking) {output.appendLine(detail);void vscode.window.showWarningMessage(state);}
        else report(state,detail);
      };
      const title = kind === 'start' ? `Creating branch ${name}` : kind === 'sync' ? 'Updating from main' : kind==='updateBranch'?'Updating branch from GitHub':'Merging to main';
      if (vscode.window.withProgress) return await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title,cancellable:false},execute);
      return await execute();
    } catch(error) {if(error.workflowRecovery)await rememberPush(error.workflowRecovery,reviewedAccountId);if (error.conflict) await conflictHelp();else if(error.nativeUpdateHandoff){await nativeUpdateHelp(error);return;}throw error;}
    finally {mainUpdateStatus=undefined;mainUpdateGeneration++;mainUpdateNextAt=0;changing=false;await repositoryStatus();refresh();void checkForMainUpdates();}
  }
  async function refreshNativeGit(root) {
    try {
      const extension=vscode.extensions?.getExtension('vscode.git');
      if(!extension)return;
      const api=(extension.isActive ? extension.exports : await extension.activate()).getAPI(1);
      const native=api.getRepository(vscode.Uri.file(root));
      if(native && await fs.realpath(native.rootUri.fsPath)===root)await native.status();
    } catch(error) {output.appendLine(`Source Control refresh: ${error.message}`);}
  }
  async function uploadProject(uploadAuth = auth, {forPublish=false,expectedRoot,expectedPlan,assertPublishCurrent=async()=>{},assertPublishCurrentNow=()=>{}} = {}) {
      if (isBusy()) return;
      await settleBranchCheck();if(isBusy())return;
      const missing=observedMissing(projectRoot);
      uploading = true; uploadProgress = 'Preparing commit…'; refresh();
      let selectedAuth, uploadAccount,confirmed=false;
      try {
        const root = await project();
        if(expectedRoot && root!==expectedRoot)throw new Error('The student project changed. Choose Publish app again.');
        await assertPublishCurrent();
        await lessonProjects.assertShareable(root);
        if (uploadMode(root) !== 'live') {
          const result = core.simulatedUpload();
          state = `${result.message} Nothing changed: no files saved, Git changes or sign-in.`; refresh();
          void vscode.window.showWarningMessage(state);
          return;
        }
        const requireSavedUpload=async()=>{if((await dirtyProjectDocuments(vscode,root)).length)throw new Error('Save or undo your project editor changes before uploading. Your edits are kept.');};
        if(!forPublish)await requireSavedUpload();
        const initialTicket = await uploadAuth.capture();
        if (forPublish && !(await vscode.workspace.saveAll(false))) throw new Error('Save your files before reviewing the upload.');
        const assertCurrentProject=async()=>{
          await assertPublishCurrent();
          if(await project()!==root)throw new Error('The student project changed. Review the upload again.');
          if(uploadMode(root)!=='live')throw new Error('Live uploads were disabled. Review the upload again.');
          if(!forPublish)await requireSavedUpload();
        };
        await assertCurrentProject();
        const plan = await github.prepareUpload(root);
        if(missing){
          assertMissingPlan(missing,plan);
          if(initialTicket.session.accountId!==missing.account||initialTicket.session.id!==missing.session)throw new Error('The GitHub account or session changed. Check branch creation again; your edits are kept.');
          await rememberPush({root,remote:plan.remote,page:plan.page,branch:plan.branch,head:plan.head,committed:false,pushStarted:false,kind:'remote-missing'},missing.account);
          throw new Error('GitHub reported this branch missing. Review branch creation before syncing. Your project changes are kept.');
        }
        const reminderSnapshot=repositoryLedger?await allReminderRecords(root):compatibilityAll(root,plan.branch);
        if(forPublish && plan.branch!=='main')throw new Error('Finish your change with Merge to main before publishing the app.');
        if(expectedPlan && ['root','remote','branch','head','status','fingerprint'].some(key=>plan[key]!==expectedPlan[key]))throw new Error('The project changed before upload. Choose Publish app again.');
        selectedAuth=await selectUploadAuthentication({root,authentication:uploadAuth,initialTicket,repositories,repositoryUrl:plan.page,assertCurrentProject});
        const ticket=selectedAuth.ticket, activeAuth=selectedAuth.authentication;
        uploadAccount=ticket.session.accountId;
        uploadProgress = ''; refresh();
        const message = !plan.changes.length ? (forPublish?'Publish app':'Push saved commits') : await vscode.window.showInputBox({title:'Commit Message', validateInput:value => value.trim() && !value.includes('\0') ? undefined : 'Describe your changes in a short message.'});
        if (!message) return;
        uploadProgress = 'Committing & pushing…'; refresh();
        if (await project() !== root) throw new Error('The student project changed. Review the upload again.');
        const assertProject = async () => {await assertGitProject(root);await assertCurrentProject();};
        const assertProjectNow = () => {assertGitProjectNow(root);assertPublishCurrentNow();};
        const beforeUpload = async () => {await assertProject();await commitProvenance.assertFileRestoreClear(root);return activeAuth.assertCurrent(ticket);};
        const networkRun = await operationTransport(plan.remote,{root,authentication:activeAuth,ticket,permissions:selectedAuth.permissions,identity:selectedAuth.identity,reminderSnapshot,assertProject,assertProjectNow});
        const result = await github.uploadPrepared(plan,message,{beforeUpload,networkRun,withLocalMutation:commitProvenance.withLocalMutation,onProgress:text=>{state=text;refresh();}});
        confirmed=true;
        await resolveConfirmedSync(root,result.branch,plan.remote,result.head,uploadAccount,'branch',reminderSnapshot);
        const tracking = await updateTracking(root,plan.remote,result.branch,result.head);
        await refreshNativeGit(root);
        await repositoryStatus();
        report(`Pushed to ${result.branch}${result.localChanged?' · newer local work is kept':tracking?'':' · tracking needs refresh; see Output'}`, `Pushed ${result.head} to ${result.branch}. Copy your repository link for Pika.${result.warning?' '+result.warning:''}`);
        return result;
      } catch(error) {
        if(error.uploadRecovery){await rememberPush(error.uploadRecovery,uploadAccount);if(!error.recoveryPath){state=gitRecoveryPanel.uploadMessage(error.uploadRecovery);error.message=state;}}
        throw error;
      } finally {selectedAuth?.dispose();uploadProgress = '';uploading = false;await repositoryStatus({forceBranchCheck:confirmed});refresh();}
  }
  async function commitProject(providedMessage) {
    if(isBusy())return;
    await settleBranchCheck();if(isBusy())return;
    const root=await project();
    if(uploadMode(root)!=='live')return simulation('Commit');
    await settleBranchCheck();if(isBusy())return;
    let knownMissing;
    const captureMissing=()=>{
      const observed=observedMissing(root);
      if(!knownMissing&&observed)knownMissing={...observed};
    };
    captureMissing();
    uploading=true;uploadProgress='Preparing commit…';refresh();
    let initial,selectedAuth,accountId=auth.accountId,commitReminderSnapshot,deferredLocalSync=false,refreshFilesAfterCommitAttempt=false;
    try {
      const requireSavedProject=async()=>{await assertGitProject(root);if((await dirtyProjectDocuments(vscode,root)).length)throw new Error('Save or undo your project editor changes before committing. Your edits are kept.');};
      await requireSavedProject();
      const reviewedAuth=[auth.accountId,auth.sessionId,auth.revision];
      accountId=reviewedAuth[0];
      const sameAccount=()=>reviewedAuth[0]===auth.accountId&&reviewedAuth[1]===auth.sessionId&&reviewedAuth[2]===auth.revision;
      const contextChanged=()=>new Error(`The GitHub account, repository or branch changed${knownMissing?' after the connection check':''}. Review the commit again; your edits are kept.`);
      const reviewedBranch=await core.currentBranch(root,core.git);
      const readOrigin=async()=>{
        let urls,push;
        try {urls=await core.git(root,['remote','get-url','--all','origin']);push=await core.git(root,['remote','get-url','--push','--all','origin']);}
        catch(error){if((await core.git(root,['remote'])).split('\n').includes('origin'))throw error;return null;}
        if(!urls&&!push)return null;
        const remote=core.parseRepositoryUrl(urls).remote;
        if(urls.includes('\n')||push.includes('\n')||core.parseRepositoryUrl(push).remote!==remote)throw contextChanged();
        return remote;
      };
      const reviewedOrigin=await readOrigin();
      if(!sameAccount())throw contextChanged();
      const message=typeof providedMessage==='string'?providedMessage:await vscode.window.showInputBox({title:'Commit',prompt:'What did you change?',validateInput:value=>value.trim()&&!value.includes('\0')?undefined:'Describe your changes in a short message.'});
      if(!message)return;
      if(!message.trim()||message.length>500||message.includes('\0'))throw new Error('Describe your changes in a short commit message.');
      await requireSavedProject();
      if(!sameAccount())throw contextChanged();
      const guard=()=>assertGitProject(root);
      const beforeCommit=async reminderTx=>{
        await guard();await commitProvenance.assertFileRestoreClear(root);if((await dirtyProjectDocuments(vscode,root)).length)throw new Error('Save your project files before committing. Your newer edits are kept.');
        captureMissing();
        if(knownMissing&&(!currentBranchObservation(knownMissing)||['root','remote','branch','head'].some(key=>knownMissing[key]!==initial[key])))throw new Error('The GitHub account, repository or branch changed after the connection check. Check it again before committing; your edits are kept.');
        const currentBranch=(await core.currentBranch(root,core.git)).trim();
        if(currentBranch!==reviewedBranch||await readOrigin()!==reviewedOrigin||!sameAccount())throw contextChanged();
        const pending=await pushRecords(root,currentBranch,reminderTx);
        for(const record of pending){
          if(!knownPush(record)||pushOperation(record)!=='branch'||record.root!==root||record.branch!==currentBranch||record.remote!==initial.remote||!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.head||'')||typeof record.id!=='string'||!record.id||record.accountId!==undefined&&(typeof record.accountId!=='string'||!record.accountId)||record.pushStarted!==undefined&&typeof record.pushStarted!=='boolean'||record.committed!==undefined&&typeof record.committed!=='boolean')throw new Error('An earlier sync reminder needs inspection before committing. Your work is kept.');
          if(!initial.head||!await includesSavedCommit(root,record.head,initial.head))throw new Error('An earlier sync reminder is not in this branch. Inspect it before committing; your work is kept.');
        }
        for(const local of (await localRecords(root,currentBranch,reminderTx))){
          const currentHead=(await core.git(root,['rev-parse','--verify','HEAD^{commit}'])).trim();const included=await includesSavedCommit(root,local.head,currentHead);
          if(!included)throw new Error('An earlier local commit is not in this branch. Review it in Source Control before committing; its reminder is kept.');
        }
        const currentReminders=repositoryLedger?await allReminderRecords(root,reminderTx):pendingLedger.enumerable?compatibilityAll(root,currentBranch):undefined;if(commitReminderSnapshot!==undefined&&JSON.stringify(currentReminders)!==JSON.stringify(commitReminderSnapshot))throw new Error('The sync reminders changed. Review the commit again.');commitReminderSnapshot=currentReminders;if(!sameAccount())throw contextChanged();reminderTx?.assertCurrentNow();
      };
      const result=await commitAndSync({root,message,guard,
        prepare:async projectRoot=>{const plan=await github.prepareLocalCommit(projectRoot);if(!initial){if(plan.branch!==reviewedBranch||(plan.remote||null)!==reviewedOrigin||!sameAccount())throw contextChanged();initial=plan;}return plan;},
        commit:(plan,text)=>commitProvenance.withCommit(plan.root,async()=>{
          const execute=async tx=>{const result=await github.uploadPrepared(plan,text,{localOnly:true,beforeUpload:()=>beforeCommit(tx),onProgress:()=>{refreshFilesAfterCommitAttempt=true;}});if(result?.committed===true)refreshFilesAfterCommitAttempt=true;return {parent:plan.head||null,result};};
          return repositoryLedger?repositoryLedger.withTransaction(plan.root,execute):execute();
        }),
        onState:step=>{uploadProgress=({committing:'Committing…',committed:'Committed locally',syncing:'Syncing to GitHub…',synced:'Synced to GitHub','sync-failed':'Saved locally · sync needs attention'})[step];refresh();},
        sync:async plan=>{
          // An earlier attempt may have reached GitHub. Preserve its exact
          // reminder and defer all transport until an explicit review.
          let prior;try{prior=await pushRecords(root,plan.branch);}catch{throw Object.assign(new Error('Earlier sync reminders could not be checked.'),{deferLocalSync:true});}
          if(prior.length)throw Object.assign(new Error('An earlier sync needs review.'),{deferLocalSync:true});
          captureMissing();
          if(knownMissing){
            accountId=knownMissing.account;
            if(['root','remote','branch','head'].some(key=>knownMissing[key]!==initial[key]))throw new Error('The GitHub repository or branch changed after the connection check. Review this local commit before syncing.');
            throw Object.assign(new Error('GitHub reported this branch missing. Review branch creation before syncing.'),{uploadRecovery:{root:plan.root,remote:plan.remote,page:plan.page,branch:plan.branch,head:plan.head,committed:true,pushStarted:false,kind:'remote-missing'}});
          }
          if(!plan.remote)throw Object.assign(new Error('Reconnect the GitHub repository to sync this commit.'),{kind:'missing-remote'});
          const reviewAccount=()=>Object.assign(new Error('Review the GitHub account before syncing this saved commit.'),{reviewAccount:true});
          if(!accountId||!sameAccount())throw reviewAccount();
          const uploadPlan=await github.prepareUpload(root);
          if(['root','remote','branch','head','status','fingerprint'].some(key=>uploadPlan[key]!==plan[key]))throw new Error('The project changed before sync. Review it again.');
          let initialTicket;
          try {initialTicket=await auth.capture();}catch(error){if(!sameAccount())throw reviewAccount();throw error;}
          if(!sameAccount()||initialTicket.session.accountId!==accountId)throw reviewAccount();
          selectedAuth=await selectUploadAuthentication({root,authentication:auth,initialTicket,repositories,repositoryUrl:plan.page,assertCurrentProject:guard});
          const ticket=selectedAuth.ticket,activeAuth=selectedAuth.authentication;accountId=ticket.session.accountId;
          const networkRun=await operationTransport(plan.remote,{root,authentication:activeAuth,ticket,permissions:selectedAuth.permissions,identity:selectedAuth.identity,reminderSnapshot:commitReminderSnapshot,assertProject:guard,assertProjectNow:()=>assertGitProjectNow(root)});
          return github.syncExistingHead(uploadPlan,{beforeUpload:async()=>{await guard();await activeAuth.assertCurrent(ticket);},networkRun});
        }});
      for(const view of controlViews)void view.webview.postMessage?.({type:'commit.clear',project:crypto.createHash('sha256').update(root).digest('hex')});
      if(result.synced) {
        await resolveConfirmedSync(root,result.saved.branch,initial.remote,result.saved.head,accountId,'branch',commitReminderSnapshot);
        await resolveReviewedLocal(root,result.saved.branch,result.saved.head,commitReminderSnapshot);
        await updateTracking(root,initial.remote,result.saved.branch,result.saved.head);
        const dirtyEditors=(await dirtyProjectDocuments(vscode,root)).length>0;
        report(result.newerChanges||dirtyEditors?'Committed · synced to GitHub · newer edits kept':'Committed · synced to GitHub');
      } else {
        if(result.error.deferLocalSync){deferredLocalSync=true;try{await rememberLocalCommit(root,result.saved.branch,result.saved.head);}catch(error){throw new Error(`The commit ${result.saved.head} was saved locally, but its sync reminder could not be recorded. Inspect project history before syncing.`);}report('Committed locally · earlier sync needs review','The earlier sync reminder is kept. Review it before syncing these commits.');return;}
        if(!initial.remote||result.error.reviewAccount) {await rememberLocalCommit(root,result.saved.branch,result.saved.head);report(result.error.reviewAccount?'Committed locally · review GitHub before syncing':'Committed locally · reconnect GitHub to sync');return;}
        const failure=result.error.uploadRecovery||{root,remote:initial.remote,page:initial.page,branch:result.saved.branch,head:result.saved.head,committed:true,pushStarted:false,kind:github.gitError(result.error,'sync').kind};
        await rememberPush(failure,accountId);report('Committed locally · sync needs attention',result.error.recoveryPath?`${result.error.message} Lock: ${result.error.recoveryPath}`:gitRecoveryPanel.uploadMessage(failure));
      }
      await refreshNativeGit(root);
    } catch(error) {
      if(error.localCommitUncertain)refreshFilesAfterCommitAttempt=true;
      if(error.localCommitRecovery){refreshFilesAfterCommitAttempt=true;await rememberLocalCommit(error.localCommitRecovery.root,error.localCommitRecovery.branch,error.localCommitRecovery.head);}
      if(error.uploadRecovery){await rememberPush(error.uploadRecovery,accountId);if(!error.recoveryPath)error.message=gitRecoveryPanel.uploadMessage(error.uploadRecovery);}
      throw error;
    } finally {if(refreshFilesAfterCommitAttempt)try{studentExplorer?.invalidate();}catch(error){try{output.appendLine(`Files refresh: ${error.message}`);}catch{}}selectedAuth?.dispose();uploadProgress='';uploading=false;await repositoryStatus({suppressRemoteChecks:deferredLocalSync});refresh();}
  }
  async function recoveryProject() {
    try{return await project();}catch(original){
      const folders=vscode.workspace.workspaceFolders||[];if(disposed||vscode.workspace.isTrusted===false||folders.length!==1||folders[0].uri.scheme!=='file')throw original;
      const requested=folders[0].uri.fsPath,root=await fs.realpath(requested);try{await fs.lstat(path.join(root,'zero.json'));throw original;}catch(error){if(error.code!=='ENOENT')throw error;}
      const git=await fs.lstat(path.join(root,'.git'));if(!git.isDirectory()||git.isSymbolicLink()||!(await retainedRecovery.listFileRestoreRecoveries(root)).length&&!(await reftableSwitchInspection.listReftableSwitchRecoveries(root)).length&&!(await reftableUpdateInspection.listReftableUpdateRecoveries(root)).length)throw original;
      const current=vscode.workspace.workspaceFolders||[];if(disposed||vscode.workspace.isTrusted===false||current.length!==1||current[0].uri.scheme!=='file'||current[0].uri.fsPath!==requested||await fs.realpath(requested)!==root)throw original;return root;
    }
  }
  async function assertRetainedRecoveryCurrent(root) {
    const folders=()=>vscode.workspace.workspaceFolders||[];
    const valid=()=>!disposed&&vscode.workspace.isTrusted!==false&&folders().length===1&&folders()[0].uri.scheme==='file';
    if(!valid())throw new Error('The trusted project changed. Choose the recovery copy again.');
    const folderPath=folders()[0].uri.fsPath,resolved=await fs.realpath(folderPath),active=await recoveryProject();
    if(!valid()||folders()[0].uri.fsPath!==folderPath||resolved!==root||active!==root)throw new Error('The trusted project changed. Choose the recovery copy again.');
  }
  const actions = {
    'zero.getStarted': () => actions['zero.startPage'](),
    'zero.startPage': () => startPage.show(),
    'zero.githubAccount': async () => {
      if (isBusy()) return;
      if (!auth.signedIn) return actions['zero.signInToGitHub']();
      const choice = await quickPick([
        {label:'Change GitHub account…', action:'change'},
        {label:'Sign out', description:'Disconnect Zero on this computer', action:'signOut'}
      ], {title:`GitHub: ${auth.accountLabel}`});
      if (isBusy()) return;
      if (choice?.action === 'change') await actions['zero.signInToGitHub']();
      if (choice?.action === 'signOut') {
        if (appProvider && auth.sessionId) await appProvider.removeSession(auth.sessionId);
        await auth.refresh();authFeedback='Signed out of Zero';report(authFeedback);
      }
    },
    'zero.chooseRepository': async () => {
      if (isBusy()) return;
      await repositoryStatus();
      const root = projectRoot;
      if ((!root || localPractice) && !auth.signedIn) return;
      const tutorial = root && !localPractice && await lessonProjects.tutorialMarker(root);
      if (isBusy()) return;
      const connected = repository.startsWith('https://github.com/');
    const ready = githubReady();
    const phase = auth.signedIn ? githubReadiness.phase : 'signed-out';
      const currentRepository = repository, currentBranch = branch;
      const recoverySelection=gitRecoveryPanel.selection(updateRecovery);
      const guidedRecovery=updateRecovery&&!updateRecovery.nativeRequired&&recoverySelection.file&&recoverySelection.file.kind!=='complex'&&recoverySelection.conflict;
      const localChoices = !connected && !tutorial && !localPractice && branch ? [{label:'New branch…',action:'start'},{label:'Switch branch…',action:'switch'}] : [];
      const items = connected ? [
        {label:'Open on GitHub', action:'open'},
        {label:'Copy repository link', description:'Submit the link separately in Pika', action:'copy'},
        ...(auth.signedIn ? [{label:'Publish & open app', action:'publish'}] : []),
        ...(branch ? [{label:'New branch…', action:'start'}] : []),
        ...(auth.signedIn ? [{label:'Update from main',description:branch==='main'?'Get GitHub main; no upload':'Get GitHub main, then sync this branch to GitHub',action:'sync'},...(branch&&branch!=='main'?[{label:'Update branch from GitHub',description:'Get this branch’s changes, then sync to GitHub',action:'updateBranch'}]:[])] : []),
        ...(guidedRecovery ? [{label:'Cancel update',action:'cancelUpdate'}] : []),
        {label:'Switch branch…', action:'switch'},
        ...(!tutorial && auth.signedIn ? [{label:'Connect to GitHub…', action:'connect'}] : [])
      ] : [
        ...(!root || localPractice || !auth.signedIn ? [] : [
          {label:'Connect to GitHub…', action:'connect'},
          ...(tutorial ? [] : [{label:'Create a repository…', description:'Create and connect this project', action:'create'}])
        ])
      ];
      const recovery=context.globalState?.get('zero.repositoryCreationRecovery');
      const recoveryUrl=recovery&&typeof recovery.repositoryUrl==='string'?recovery.repositoryUrl:undefined;
      const projectChoices = [...(recoveryUrl?[{label:'Resume created project…',description:recoveryUrl,action:'recover'}]:[])];
      if (connected) items.push(...projectChoices);else items.unshift(...localChoices,...projectChoices);
      if (root) items.push({label:'Review or restore changes…', action:'recovery'},{label:'Inspect recovery copies…',description:'Find files retained after an interrupted Git operation',action:'inspectRecoveryCopies'});
      items.push({label:'GitHub account…', action:'account'});
      const choice = await quickPick(items, {title:connected ? repository : root ? path.basename(root) : 'Project'});
      if (isBusy() || !choice) return;
      await repositoryStatus();
      if (isBusy() || projectRoot !== root || repository !== currentRepository || branch !== currentBranch) return;
      if (choice?.action === 'recover') {
        connecting=true;refresh();
        try{if(uploadMode()!=='live')return simulation('Resume created project');await githubProjects.resumeCreated(recovery);}
        finally{connecting=false;refresh();}
      }
      if (choice?.action === 'account') await actions['zero.githubAccount']();
      if (choice?.action === 'recovery') await actions['zero.recovery']();
      if (choice?.action === 'inspectRecoveryCopies') await actions['zero.inspectRecoveryCopies']();
      if (choice?.action === 'updateProject') await actions['zero.updateProject']();
      if (choice?.action === 'recoverProjectUpdate') await actions['zero.recoverProjectUpdate']();
      if (choice?.action === 'connect') await actions['zero.connectRepository']();
      if (choice?.action === 'copy') await actions['zero.copyRepositoryLink']();
      if (choice?.action === 'publish') await actions['zero.publishAndOpenWeb']();
      if (choice?.action === 'open' && !await vscode.env.openExternal(vscode.Uri.parse(currentRepository))) throw new Error('Could not open the repository. Try Open on GitHub again.');
      if (choice?.action === 'start') await actions['zero.startChange']();
      if (choice?.action === 'sync') await actions['zero.syncProject']();
      if (choice?.action === 'updateBranch') await actions['zero.updateBranchFromGitHub']();
      if (choice?.action === 'cancelUpdate') await actions['zero.cancelUpdate'](gitRecoveryPanel.selection(updateRecovery).token);
      if (choice?.action === 'switch') await actions[branch ? 'zero.switchStudentBranch' : 'zero.switchBranch']();
      if (choice?.action === 'create') {
        if (!auth.signedIn) await actions['zero.signInToGitHub']();
        await actions['zero.createRepository']();
      }
    },
    'zero.signInToGitHub': signIn,
    'zero.setupGitHub': async () => {
      if (disposed || isBusy()) return;
      signingIn = true;refresh();
      try {await prepareGitHub({openBrowser:true});}
      finally {signingIn=false;if(!disposed)refresh();}
    },
    'zero.createRepository': async () => {
      if (disposed || isBusy()) return;
      connecting=true;refresh();
      try {if(uploadMode()!=='live')return simulation('Create repository');return await githubProjects.createRepository();}
      finally {connecting=false;await repositoryStatus();refresh();}
    },
    'zero.newProject': async () => {
      if (disposed || isBusy()) return;
      startingTutorial=true;refresh();
      try {if(uploadMode()!=='live')return simulation('New project');return await githubProjects.newProject();}
      finally {startingTutorial=false;if(!disposed)refresh();}
    },
    'zero.chooseBranch': async () => {
      if (isBusy()) return;
      await repositoryStatus();
      if (isBusy() || !branch || !repository.startsWith('https://github.com/')) return;
      const root = projectRoot, currentBranch = branch, currentRepository = repository;
      const choice = await quickPick([{label:'New branch…',action:'start'},...(currentBranch !== 'main' ? [{label:'Merge',action:'finish'}] : []),{label:'Switch branch…',action:'switch'}], {title:`${currentRepository.replace('https://github.com/','')} · ${currentBranch}`});
      if (isBusy() || !choice) return;
      await repositoryStatus();
      if (isBusy() || projectRoot !== root || branch !== currentBranch || repository !== currentRepository) return;
      if (choice.action === 'switch') await actions['zero.switchStudentBranch']();
      else await change(choice.action);
    },
    'zero.startChange': () => change('start'),
    'zero.finishChange': () => change('finish'),
    'zero.syncProject': () => change('sync'),
    'zero.updateBranchFromGitHub': () => change('updateBranch'),
    'zero.keepLocalUpdate': token => applyUpdateChoice('local',token),
    'zero.useIncomingUpdate': token => applyUpdateChoice('incoming',token),
    'zero.cancelUpdate': token => applyUpdateChoice('cancel',token),
    'zero.continueUpdate': token => applyUpdateChoice('continue',token),
    'zero.compareUpdate': compareUpdate,
    'zero.checkPush': checkPush,
    'zero.reviewPendingSync': async () => {
      if(isBusy())return;changing=true;refresh();try {const root=await project();await assertGitProject(root);await repositoryStatus();
      const record=pendingUpload;if(!record||record.root!==root)throw new Error('There is no earlier sync to review on this branch.');
      const destination=core.parseRepositoryUrl(record.remote),head=record.head,branchName=record.branch;
      const choice=await vscode.window.showWarningMessage('Have you checked the earlier GitHub sync?',{modal:true,detail:`Repository: ${destination.page}\nBranch: ${branchName}\nCommit: ${head}\nCheck GitHub or Source Control first. Marking this reviewed only clears the reminder; it does not confirm that GitHub received the commit.`},'Mark reviewed');
      if(choice!=='Mark reviewed')return;
      await assertGitProject(root);await repositoryStatus();const current=pendingUpload;
      if(!current||current.id!==record.id||current.root!==root||current.branch!==branchName||current.head!==head||current.remote!==record.remote)throw new Error('The sync reminder changed. Review it again.');
      const latest=(await pushRecords(root,branchName)).find(item=>item.id===record.id);
      if(!latest||JSON.stringify(latest)!==JSON.stringify(record))throw new Error('The sync reminder changed. Review it again.');
      await clearPush(root,branchName,latest,'reviewed');await repositoryStatus();report('Earlier sync marked reviewed','The earlier sync reminder was reviewed; GitHub receipt was not inferred.');
      } finally {changing=false;await repositoryStatus();refresh();}
    },
    'zero.reconnectGitHub': reconnectPush,
    'zero.openGitSourceControl': () => vscode.commands.executeCommand('workbench.view.scm'),
    'zero.inspectRecoveryCopies': async () => {
      if(isBusy())return;const root=await recoveryProject();await assertRetainedRecoveryCurrent(root);
      const choices=[{label:'Conflict choices',command:'zero.inspectRetainedConflictCopies'},{label:'Project restore',command:'zero.inspectProjectRestoreCopies'},{label:'Finished-change inverse',command:'zero.inspectInverseRecovery'},{label:'Update cancellation',command:'zero.inspectCancelRecoveryCopies'},{label:'Discarded changes',command:'zero.inspectDiscardRecoveryCopies'},{label:'File restoration and initial project discard',command:'zero.inspectFileRestoreRecovery'},{label:'Untracked-file removal',command:'zero.inspectUntrackedRemovalRecovery'},{label:'Staged-file removal',command:'zero.inspectStagedRemovalRecovery'},{label:'Reftable switch',command:'zero.inspectReftableSwitchRecovery'},{label:'Reftable update',command:'zero.inspectReftableUpdateRecovery'},{label:'Commit undo',command:'zero.inspectCommitUndoRecovery'}];
      let available=choices;try{await fs.lstat(path.join(root,'zero.json'));}catch(error){if(error.code!=='ENOENT')throw error;available=choices.filter(item=>['zero.inspectFileRestoreRecovery','zero.inspectUntrackedRemovalRecovery','zero.inspectStagedRemovalRecovery','zero.inspectReftableSwitchRecovery','zero.inspectReftableUpdateRecovery'].includes(item.command));}
      const choice=await quickPick(available,{title:'Inspect recovery copies',placeHolder:'Choose the operation'});
      if(!choice||!available.includes(choice))return;await assertRetainedRecoveryCurrent(root);await actions[choice.command]();
    },
    'zero.inspectInverseRecovery': async () => {
      if(isBusy())return;const root=await project(),current=()=>assertRetainedRecoveryCurrent(root);
      await current();const names=await retainedRecovery.listInverseRecoveries(root);await current();
      if(!names.length){await vscode.window.showInformationMessage('No finished-change inverse recovery records were found.');return;}
      const choices=names.map(name=>({label:name,name})),choice=await quickPick(choices,{title:'Inspect finished-change inverse recovery',placeHolder:'Choose a retained folder'});
      if(!choice||!choices.includes(choice))return;await current();
      const info=await retainedRecovery.inspectInverseRecovery(root,choice.name);await current();
      const detail=`Folder: ${info.folder}\n${info.status}${info.branch?`\nBranch: ${info.branch}\nOriginal HEAD: ${info.head}\nFinished change: ${info.change}\nInverse target: ${info.commit}\nRetained ref: ${info.ref}\nPack matches recorded hash: ${info.packMatches?'Yes':'No'}\nObserved retained ref: ${info.observedRef?.object||'Not confirmed'}`:''}\nThis record does not prove the correction was applied. Also inspect Project restore recovery and project history.`;
      output.appendLine(detail);await vscode.window.showInformationMessage('Finished-change inverse recovery',{modal:true,detail});
    },
    'zero.inspectCommitUndoRecovery': async () => {
      if(isBusy())return;const root=await project(),current=()=>assertRetainedRecoveryCurrent(root);
      await current();const names=await retainedRecovery.listCommitUndos(root);await current();
      if(!names.length){await vscode.window.showInformationMessage('No commit undo recovery records were found.');return;}
      const choices=names.map(name=>({label:name,name})),choice=await quickPick(choices,{title:'Inspect commit undo recovery',placeHolder:'Choose a retained record'});
      if(!choice||!choices.includes(choice))return;await current();
      const info=await retainedRecovery.inspectCommitUndo(root,choice.name);await current();
      const observed=info.observations?`\nCurrent branch ref: ${info.observations.branchRef?.object||'Not found'}\nRetained ref: ${info.observations.recoveryRef?.object||'Not found'}`:'\nCurrent refs could not be verified.';
      const detail=`Folder: ${info.folder}\n${info.status}${info.branch?`\nBranch: ${info.branch}\nOriginal commit: ${info.head}\nParent: ${info.parent}\nRecovery ref: ${info.ref}`:''}${observed}\nInspect the repository before making further changes.`;
      output.appendLine(detail);await vscode.window.showInformationMessage('Commit undo recovery',{modal:true,detail});
    },
    'zero.inspectDiscardRecoveryCopies': async () => {
      if(isBusy())return;
      const root=await project(),current=()=>assertRetainedRecoveryCurrent(root);
      await current();const names=await retainedRecovery.listDiscardRecoveries(root);await current();
      if(!names.length){await vscode.window.showInformationMessage('No discarded-change copies were found.');return;}
      const folders=names.map(name=>({label:name,name})),folder=await quickPick(folders,{title:'Inspect discarded-change copies',placeHolder:'Choose a retained folder'});
      if(!folder||!folders.includes(folder))return;
      await current();const info=await retainedRecovery.inspectDiscardRecovery(root,folder.name);await current();
      output.appendLine(`Discard recovery: ${info.folder}\n${info.status}`);
      const choices=[...info.files.filter(file=>file.hasBackup).map(file=>({label:file.name,description:'Saved before discard',kind:'file',index:file.index})),...info.moved.map(file=>({label:file.name,description:'Moved during discard (may contain newer work)',kind:'moved',index:file.index})),...info.staged.map(file=>({label:file.name,description:'Previously staged version',kind:'staged',index:file.index}))];
      if(!choices.length){await vscode.window.showInformationMessage('Discard recovery',{modal:true,detail:`Folder: ${info.folder}\n${info.status}\nInspect the retained folder before changing project files.`});return;}
      const choice=await quickPick(choices,{title:'Inspect a retained file',placeHolder:`${info.status} Saved indexes are in ${info.folder}`});
      if(!choice||!choices.includes(choice))return;await current();
      let copy;try{copy=await retainedRecovery.readDiscardRecoveryCopy(root,folder.name,choice.kind,choice.index);}catch(error){if(error.code==='ENOENT')throw new Error('That copy was not created. Choose another retained copy.');throw error;}await current();
      const hashNote=copy.matchesBackup===undefined?'Compare this copy with your project before making changes.':copy.matchesBackup?'The copy matches its recorded hash.':'The copy differs from its recorded hash; preserve it for inspection.';
      const previewNote=copy.content===undefined?`\nPreview unavailable: ${copy.size>16*1024*1024?'the copy exceeds the text preview size limit':'the copy is binary or is not valid UTF-8 text'}.`:'';
      const answer=await vscode.window.showInformationMessage('Retained discarded change',{modal:true,detail:`Project file: ${choice.label}\nCopy: ${copy.filename}\nSize: ${copy.size} bytes\nSHA-256: ${copy.sha256}${previewNote}\n${hashNote}\n${info.status}\nSaved indexes, if present, are in ${info.folder}.`},...(copy.content===undefined?[]:['Open read-only copy']));
      if(answer!=='Open read-only copy')return;await current();
      const uri=vscode.Uri.parse(`zero-retained-recovery:/${crypto.randomUUID()}/${encodeURIComponent(path.basename(choice.label))}`);
      while(retainedPreviews.size>=8)retainedPreviews.delete(retainedPreviews.keys().next().value);retainedPreviews.set(uri.toString(),copy.content);
      const document=await vscode.workspace.openTextDocument(uri);await current();await vscode.window.showTextDocument(document,{preview:true});
    },
    'zero.inspectReftableSwitchRecovery': async () => {
      if(isBusy())return;const root=await recoveryProject(),current=()=>assertRetainedRecoveryCurrent(root);await current();const names=await reftableSwitchInspection.listReftableSwitchRecoveries(root);await current();if(!names.length){await vscode.window.showInformationMessage('No reftable switch recovery entries were found.');return;}
      const choices=names.map(name=>({label:name,name})),choice=await quickPick(choices,{title:'Inspect reftable switch recovery',placeHolder:'Choose retained evidence'});if(!choice||!choices.includes(choice))return;await current();const info=await reftableSwitchInspection.inspectReftableSwitchEvidence(root,choice.name);await current();
      const guidance=choice.name==='zero-reftable-switch.lock'?'Inspect the lock and project before continuing; keep the lock and all retained evidence until resolved.':'Inspect the project and retained copies. Review resolution is available only when the project matches a verified original or target state; ambiguous evidence stays blocked.';const detail=`Location: ${info.folder}\n${info.status}\n${info.feature?`Recorded feature commit: ${info.feature}\n`:''}${info.target?`Recorded target commit: ${info.target}\n`:''}Current branch: ${info.branch||'Not confirmed'}\nCurrent HEAD: ${info.head||'Not confirmed'}\nCurrent main: ${info.main||'Not confirmed'}\nInspect the project and Source Control. Keep all retained copies. ${guidance}`;output.appendLine(`Reftable switch recovery: ${detail}`);const answer=await vscode.window.showInformationMessage('Reftable switch recovery',{modal:true,detail},'Show location',...(info.feature&&info.target?['Review resolution']:[]));if(answer==='Show location'){await current();await vscode.commands.executeCommand('revealFileInOS',vscode.Uri.file(info.folder));return;}if(answer!=='Review resolution')return;
      changing=true;refresh();try{const workspaceNow=()=>(vscode.workspace.workspaceFolders||[]).map(folder=>[folder.uri.scheme,folder.uri.fsPath]),dirtyNow=()=>(vscode.workspace.textDocuments||[]).filter(document=>document.isDirty&&document.uri?.scheme==='file').map(document=>({document,name:document.uri.fsPath,version:document.version})),sameDirty=(a,b)=>a.length===b.length&&a.every((entry,index)=>entry.document===b[index].document&&entry.name===b[index].name&&entry.version===b[index].version);let authority;const guard=async()=>{const workspace=workspaceNow(),dirty=dirtyNow();await current();if((await dirtyProjectDocuments(vscode,root)).length)throw new Error('Save or undo project editor changes before reviewing recovery.');if(JSON.stringify(workspace)!==JSON.stringify(workspaceNow())||!sameDirty(dirty,dirtyNow()))throw new Error('The workspace or open files changed. Review recovery again.');authority={workspace,dirty};};const guardNow=()=>{if(disposed||vscode.workspace.isTrusted===false||!authority||JSON.stringify(authority.workspace)!==JSON.stringify(workspaceNow())||!sameDirty(authority.dirty,dirtyNow()))throw new Error('The workspace or open files changed. Review recovery again.');};
        const plan=await reftableSwitchResolution.reviewReftableSwitchResolution(root,choice.name,{beforeReview:guard});const prompt=`The current project matches the ${plan.state==='original'?'original feature':'target main'} state.\nBranch: ${plan.branch}\nHEAD: ${plan.head}\nMain: ${plan.main}\nThis acknowledges the current state and allows further Zero actions. It does not prove what happened earlier or repair files. All recovery copies remain in ${info.folder}.`;const confirmed=await vscode.window.showWarningMessage('Mark this recovery reviewed?',{modal:true,detail:prompt},'Mark reviewed');if(confirmed!=='Mark reviewed')return;await reftableSwitchResolution.resolveReftableSwitch(plan,{beforeMutation:guard,beforeMutationNow:guardNow});report('Recovery reviewed · copies kept','The current project was reviewed. Retained copies remain available for inspection.');
      }finally{changing=false;refresh();}
    },
    'zero.inspectReftableUpdateRecovery': async () => {
      if(isBusy())return;const root=await recoveryProject(),current=()=>assertRetainedRecoveryCurrent(root);await current();const names=await reftableUpdateInspection.listReftableUpdateRecoveries(root);await current();if(!names.length){await vscode.window.showInformationMessage('No reftable update recovery entries were found.');return;}
      const choices=names.map(name=>({label:name,name})),choice=await quickPick(choices,{title:'Inspect reftable update recovery',placeHolder:'Choose retained evidence'});if(!choice||!choices.includes(choice))return;await current();const info=await reftableUpdateInspection.inspectReftableUpdateEvidence(root,choice.name);await current();
      const guidance=choice.name==='zero-reftable-update.lock'?'Inspect the lock and project before continuing; keep the lock and all retained evidence until resolved.':'Inspect the project and retained copies. Review resolution is available only when the project matches a verified original or target state; ambiguous evidence stays blocked.';const detail=`Location: ${info.folder}\n${info.status}\n${info.feature?`Recorded original commit: ${info.feature}\n`:''}${info.target?`Recorded target commit: ${info.target}\n`:''}Current branch: ${info.branch||'Not confirmed'}\nCurrent HEAD: ${info.head||'Not confirmed'}\nCurrent main: ${info.main||'Not confirmed'}\nInspect the project and Source Control. Keep all retained copies. ${guidance}`;output.appendLine(`Reftable update recovery: ${detail}`);const answer=await vscode.window.showInformationMessage('Reftable update recovery',{modal:true,detail},'Show location',...(info.feature&&info.target?['Review resolution']:[]));if(answer==='Show location'){await current();await vscode.commands.executeCommand('revealFileInOS',vscode.Uri.file(info.folder));return;}if(answer!=='Review resolution')return;
      changing=true;refresh();try{const workspaceNow=()=>(vscode.workspace.workspaceFolders||[]).map(folder=>[folder.uri.scheme,folder.uri.fsPath]),dirtyNow=()=>(vscode.workspace.textDocuments||[]).filter(document=>document.isDirty&&document.uri?.scheme==='file').map(document=>({document,name:document.uri.fsPath,version:document.version})),sameDirty=(a,b)=>a.length===b.length&&a.every((entry,index)=>entry.document===b[index].document&&entry.name===b[index].name&&entry.version===b[index].version);let authority;const guard=async()=>{const workspace=workspaceNow(),dirty=dirtyNow();await current();if((await dirtyProjectDocuments(vscode,root)).length)throw new Error('Save or undo project editor changes before reviewing recovery.');if(JSON.stringify(workspace)!==JSON.stringify(workspaceNow())||!sameDirty(dirty,dirtyNow()))throw new Error('The workspace or open files changed. Review recovery again.');authority={workspace,dirty};};const guardNow=()=>{if(disposed||vscode.workspace.isTrusted===false||!authority||JSON.stringify(authority.workspace)!==JSON.stringify(workspaceNow())||!sameDirty(authority.dirty,dirtyNow()))throw new Error('The workspace or open files changed. Review recovery again.');};
        const plan=await reftableUpdateResolution.reviewReftableUpdateResolution(root,choice.name,{beforeReview:guard});const prompt=`The current project matches the ${plan.state==='original'?'original':'target'} state.\nBranch: ${plan.branch}\nHEAD: ${plan.head}\nMain: ${plan.main}\nThis acknowledges the current state and allows further Zero actions. It does not prove what happened earlier or repair files. All recovery copies remain in ${info.folder}.`;const confirmed=await vscode.window.showWarningMessage('Mark this recovery reviewed?',{modal:true,detail:prompt},'Mark reviewed');if(confirmed!=='Mark reviewed')return;await reftableUpdateResolution.resolveReftableUpdate(plan,{beforeMutation:guard,beforeMutationNow:guardNow});report('Recovery reviewed · copies kept','The current project was reviewed. Retained copies remain available for inspection.');
      }finally{changing=false;refresh();}
    },
    'zero.inspectUntrackedRemovalRecovery': async () => {
      if(isBusy())return;const root=await recoveryProject(),current=()=>assertRetainedRecoveryCurrent(root);
      await current();const names=await addedRemovalInspection.listAddedRemovalEvidence(root);await current();
      if(!names.length){await vscode.window.showInformationMessage('No untracked-file removal records were found. Incomplete folders can also be inspected under File restoration and initial project discard.');return;}
      const folders=names.map(name=>({label:name,name})),fallback={label:'Other incomplete or unclassified folders…',description:'Open File restoration and initial project discard',fallback:true},items=[...folders,fallback],folder=await quickPick(items,{title:'Inspect untracked-file removal',placeHolder:'Choose a retained folder'});if(!folder||!items.includes(folder))return;if(folder===fallback){await current();await actions['zero.inspectFileRestoreRecovery']();return;}
      await current();const info=await addedRemovalInspection.inspectAddedRemovalEvidence(root,folder.name);await current();
      const observation=info.displacement.journalState==='reported-displaced'?'The journal reports that the file was moved.':info.displacement.journalState==='reported-displacement-refused'?'The journal reports that the move was refused.':'The move outcome is not confirmed.';
      output.appendLine(`Untracked-file removal recovery: ${info.recoveryPath}\n${observation}`);
      const copies=[{label:'Independent copy',kind:'working-copy'},{label:'Displaced entry (may contain later edits)',kind:'displaced'}],choice=await quickPick(copies,{title:'Inspect a retained removal copy',placeHolder:`${info.path} · ${observation}`});if(!choice||!copies.includes(choice))return;
      await current();const copy=await addedRemovalInspection.readAddedRemovalCopy(root,folder.name,choice.kind);await current();
      const preview=copy.content===undefined?'\nPreview unavailable: the copy is binary or is not valid UTF-8 text.':'';
      const answer=await vscode.window.showInformationMessage('Retained untracked-file copy',{modal:true,detail:`Project file: ${copy.path}\nCopy: ${copy.filename}\nSize: ${copy.size} bytes\nSHA-256: ${copy.sha256}${preview}\n${observation} ${info.originalMatchesRecordedHash?'The independent copy matches its recorded hash.':'The independent copy differs from its recorded hash.'} An open editor may still change the displaced entry. Compare both copies and preserve the recovery folder; this inspection does not authorize a retry or repair.`},...(copy.content===undefined?[]:['Open read-only copy']));
      if(answer!=='Open read-only copy')return;await current();const uri=vscode.Uri.parse(`zero-retained-recovery:/${crypto.randomUUID()}/${encodeURIComponent(path.basename(copy.path))}`);while(retainedPreviews.size>=8)retainedPreviews.delete(retainedPreviews.keys().next().value);retainedPreviews.set(uri.toString(),copy.content);const document=await vscode.workspace.openTextDocument(uri);await current();await vscode.window.showTextDocument(document,{preview:true});
    },
    'zero.inspectStagedRemovalRecovery': async () => {
      if(isBusy())return;const root=await recoveryProject(),current=()=>assertRetainedRecoveryCurrent(root);
      await current();const names=await stagedRemovalInspection.listStagedRemovalRecoveries(root);await current();
      if(!names.length){await vscode.window.showInformationMessage('No staged-file removal records were found. Incomplete folders can also be inspected under File restoration and initial project discard.');return;}
      const folders=names.map(name=>({label:name,name})),fallback={label:'Other incomplete or unclassified folders…',description:'Open File restoration and initial project discard',fallback:true},items=[...folders,fallback],folder=await quickPick(items,{title:'Inspect staged-file removal',placeHolder:'Choose a retained folder'});if(!folder||!items.includes(folder))return;if(folder===fallback){await current();await actions['zero.inspectFileRestoreRecovery']();return;}
      await current();const recovery=path.join(root,'.git',folder.name),info=await stagedRemovalInspection.inspectStagedRemoval(root,recovery);await current();
      const indexNote=info.liveIndex.state==='absent'?'The Git index appeared missing when inspected. Preserve the recovery folder, avoid Git and Source Control operations, and seek help inspecting the retained original and prepared indexes.':info.liveIndex.state==='present'?'A Git index was present when inspected; this inspection does not establish whether it is the expected version.':'The current Git index could not be inspected.';
      const summary=`Project file: ${info.path}\nRecovery folder: ${info.recoveryPath}\n${indexNote}\nIndex lock: ${info.indexLock.state}.\nThe operation may have stopped at any step. Keep all copies; an open editor may still change a displaced copy. This inspection cannot repair, retry or mark the operation complete.`;
      output.appendLine(`Staged-file removal recovery: ${summary}`);const proceed=await vscode.window.showInformationMessage('Staged-file removal recovery',{modal:true,detail:summary},'Inspect copies');if(proceed!=='Inspect copies')return;
      const copies=[{label:'Saved working copy',kind:'working'},{label:'Previously staged copy',kind:'staged'},{label:'Displaced file (may contain later edits)',kind:'displaced'}],choice=await quickPick(copies,{title:'Inspect a staged-removal copy',placeHolder:info.path});if(!choice||!copies.includes(choice))return;await current();let copy;try{copy=await stagedRemovalInspection.readStagedRemovalCopy(root,recovery,choice.kind);}catch(error){if(error.code==='ENOENT')throw new Error('That retained copy was not created. Preserve the folder and choose another copy.');throw error;}await current();
      const preview=copy.content===undefined?'\nPreview unavailable: the copy is binary or is not valid UTF-8 text.':'';const answer=await vscode.window.showInformationMessage('Retained staged-file copy',{modal:true,detail:`Project file: ${copy.path}\nCopy: ${copy.filename}\nSize: ${copy.size} bytes\nSHA-256: ${copy.sha256}${preview}\nCompare the copies and preserve the recovery folder. This inspection does not authorize a retry or repair.`},...(copy.content===undefined?[]:['Open read-only copy']));if(answer!=='Open read-only copy')return;await current();const uri=vscode.Uri.parse(`zero-retained-recovery:/${crypto.randomUUID()}/${encodeURIComponent(path.basename(copy.path))}`);while(retainedPreviews.size>=8)retainedPreviews.delete(retainedPreviews.keys().next().value);retainedPreviews.set(uri.toString(),copy.content);const document=await vscode.workspace.openTextDocument(uri);await current();await vscode.window.showTextDocument(document,{preview:true});
    },
    'zero.inspectFileRestoreRecovery': async () => {
      if(isBusy())return;const root=await recoveryProject(),current=()=>assertRetainedRecoveryCurrent(root);
      await current();const names=await retainedRecovery.listFileRestoreRecoveries(root);await current();
      if(!names.length){await vscode.window.showInformationMessage('No file restoration recovery copies were found.');return;}
      const folders=names.map(name=>({label:name,name})),folder=await quickPick(folders,{title:'Inspect file restoration recovery',placeHolder:'Choose a retained folder'});
      if(!folder||!folders.includes(folder))return;await current();
      const info=await retainedRecovery.inspectFileRestoreRecovery(root,folder.name);await current();
      output.appendLine(`File restoration recovery: ${info.folder}\n${info.status}`);
      const choices=[...info.files.filter(file=>file.hasBackup).map(file=>({label:file.name,description:info.operation==='unborn-discard'?'Saved before initial project discard':'Saved before restoration',kind:'file',index:file.index})),...info.moved.map(file=>({label:file.name,description:info.operation==='unborn-discard'?'Moved during initial project discard':'Moved during restoration (may contain newer work)',kind:'moved',index:file.index})),...info.staged.map(file=>({label:file.name,description:'Previously staged version',kind:'staged',index:file.index}))];
      if(!choices.length){await vscode.window.showInformationMessage('File restoration recovery',{modal:true,detail:`Folder: ${info.folder}\n${info.status}\nSaved indexes, if present, are in this folder.`});return;}
      const choice=await quickPick(choices,{title:'Inspect a retained file',placeHolder:`${info.status} Saved indexes are in ${info.folder}`});
      if(!choice||!choices.includes(choice))return;await current();
      const copy=await retainedRecovery.readDiscardRecoveryCopy(root,folder.name,choice.kind,choice.index);await current();
      const hashNote=copy.matchesBackup===undefined?'Compare this copy with your project before making changes.':copy.matchesBackup?'The copy matches its recorded hash.':'The copy differs from its recorded hash; preserve it for inspection.';
      const previewNote=copy.content===undefined?`\nPreview unavailable: ${copy.size>16*1024*1024?'the copy exceeds the text preview size limit':'the copy is binary or is not valid UTF-8 text'}.`:'';
      const answer=await vscode.window.showInformationMessage('Retained file restoration copy',{modal:true,detail:`Project file: ${choice.label}\nCopy: ${copy.filename}\nSize: ${copy.size} bytes\nSHA-256: ${copy.sha256}${previewNote}\n${hashNote}\n${info.status}\nSaved indexes, if present, are in ${info.folder}.`},...(copy.content===undefined?[]:['Open read-only copy']));
      if(answer!=='Open read-only copy')return;await current();
      const uri=vscode.Uri.parse(`zero-retained-recovery:/${crypto.randomUUID()}/${encodeURIComponent(path.basename(choice.label))}`);
      while(retainedPreviews.size>=8)retainedPreviews.delete(retainedPreviews.keys().next().value);retainedPreviews.set(uri.toString(),copy.content);
      const document=await vscode.workspace.openTextDocument(uri);await current();await vscode.window.showTextDocument(document,{preview:true});
    },
    'zero.inspectCancelRecoveryCopies': async () => {
      if(isBusy())return;
      const root=await project();
      const current=()=>assertRetainedRecoveryCurrent(root);
      await current();const names=await retainedRecovery.listCancelRecoveries(root);await current();
      if(!names.length){await vscode.window.showInformationMessage('No update cancellation copies were found.');return;}
      const choices=names.map(name=>({label:name,name})),choice=await quickPick(choices,{title:'Inspect update cancellation copies',placeHolder:'Choose a retained folder'});
      if(!choice||!choices.includes(choice))return;
      await current();const info=await retainedRecovery.inspectCancelRecovery(root,choice.name);await current();
      output.appendLine(`Update cancellation recovery: ${info.folder}\n${info.status}`);
      if(!info.files.length){await vscode.window.showInformationMessage('Update cancellation recovery',{modal:true,detail:`Folder: ${info.folder}\n${info.status}\nInspect the retained folder before changing project files.`});return;}
      const files=info.files.map(file=>({label:file.name,index:file.index,hasBackup:file.hasBackup}));
      const selected=await quickPick(files,{title:'Inspect a saved update file',placeHolder:`${info.status} Copies and saved metadata are in ${info.folder}`});
      if(!selected||!files.includes(selected))return;await current();
      const kinds=[...(selected.hasBackup?[{label:'Saved before update',kind:'file'}]:[]),{label:'Moved during cancellation (may contain newer work)',kind:'moved'}];
      const kind=await quickPick(kinds,{title:'Choose a retained copy',placeHolder:'A copy may be unavailable if cancellation stopped before creating it'});
      if(!kind||!kinds.includes(kind))return;await current();
      let copy;try{copy=await retainedRecovery.readCancelRecoveryCopy(root,choice.name,selected.index,kind.kind);}catch(error){if(error.code==='ENOENT')throw new Error('That copy was not created. Choose another retained copy.');throw error;}await current();
      const hashNote=copy.matchesBackup===undefined?'Compare this copy with your project before making changes.':copy.matchesBackup?'The copy matches its recorded hash.':'The copy differs from its recorded hash; preserve it for inspection.';
      const answer=await vscode.window.showInformationMessage('Retained update file',{modal:true,detail:`Project file: ${selected.label}\nCopy: ${copy.filename}\n${hashNote}\n${info.status}\nSaved Git metadata, if present, is in ${info.folder}.`},...(copy.content===undefined?[]:['Open read-only copy']));
      if(answer!=='Open read-only copy')return;await current();
      const uri=vscode.Uri.parse(`zero-retained-recovery:/${crypto.randomUUID()}/${encodeURIComponent(path.basename(selected.label))}`);
      while(retainedPreviews.size>=8)retainedPreviews.delete(retainedPreviews.keys().next().value);retainedPreviews.set(uri.toString(),copy.content);
      const document=await vscode.workspace.openTextDocument(uri);await current();await vscode.window.showTextDocument(document,{preview:true});
    },
    'zero.inspectProjectRestoreCopies': async () => {
      if(isBusy())return;
      const root=await project();
      const current=()=>assertRetainedRecoveryCurrent(root);
      await current();const names=await retainedRecovery.listProjectRestores(root);await current();
      if(!names.length){await vscode.window.showInformationMessage('No project restore copies were found.');return;}
      const choices=names.map(name=>({label:name,name})),choice=await quickPick(choices,{title:'Inspect project restore copies',placeHolder:'Choose a retained folder'});
      if(!choice||!choices.includes(choice))return;
      await current();const info=await retainedRecovery.inspectProjectRestore(root,choice.name);await current();
      output.appendLine(`Project restore recovery: ${info.folder}\n${info.status}`);
      if(!info.files.length){await vscode.window.showInformationMessage('Project restore recovery',{modal:true,detail:`Folder: ${info.folder}\n${info.status}\nInspect the retained folder before changing project files.`});return;}
      const files=info.files.map(file=>({label:file.name,description:file.kind,index:file.index,hasBackup:file.hasBackup}));
      const selected=await quickPick(files,{title:'Inspect a project restore file',placeHolder:`${info.status} Copies and saved index are in ${info.folder}`});
      if(!selected||!files.includes(selected))return;
      await current();
      const kinds=[...(selected.hasBackup?[{label:'Saved before restore',kind:'file'}]:[]),{label:'Moved during restore (may contain newer work)',kind:'moved'},{label:'Prepared target version',kind:'target'}];
      const kind=await quickPick(kinds,{title:'Choose a retained copy',placeHolder:'A copy may be unavailable if the operation stopped before creating it'});
      if(!kind||!kinds.includes(kind))return;
      await current();let copy;try{copy=await retainedRecovery.readProjectRestoreCopy(root,choice.name,selected.index,kind.kind);}catch(error){if(error.code==='ENOENT')throw new Error('That copy was not created. Choose another retained copy.');throw error;}await current();
      const hashNote=copy.matchesBackup===undefined?'Compare this copy with your project before making changes.':copy.matchesBackup?'The copy matches its recorded hash.':'The copy differs from its recorded hash; preserve it for inspection.';
      const previewNote=copy.content===undefined?'\nPreview unavailable: the copy is binary or is not valid UTF-8 text.':'';
      const answer=await vscode.window.showInformationMessage('Retained project file',{modal:true,detail:`Project file: ${selected.label}\nCopy: ${copy.filename}\nSize: ${copy.size} bytes\nSHA-256: ${copy.sha256}${previewNote}\n${hashNote}\n${info.status}\nSaved index files, if present, are in ${info.folder}.`},...(copy.content===undefined?[]:['Open read-only copy']));
      if(answer!=='Open read-only copy')return;
      await current();const uri=vscode.Uri.parse(`zero-retained-recovery:/${crypto.randomUUID()}/${encodeURIComponent(path.basename(selected.label))}`);
      while(retainedPreviews.size>=8)retainedPreviews.delete(retainedPreviews.keys().next().value);retainedPreviews.set(uri.toString(),copy.content);
      const document=await vscode.workspace.openTextDocument(uri);await current();await vscode.window.showTextDocument(document,{preview:true});
    },
    'zero.inspectRetainedConflictCopies': async () => {
      if (isBusy()) return;
      const root = await project();
      const current = () => assertRetainedRecoveryCurrent(root);
      await current();
      const names = await retainedRecovery.list(root);
      await current();
      if (!names.length) {await vscode.window.showInformationMessage('No retained conflict copies were found in this project.');return;}
      const choices = names.map(name=>({label:name,name}));
      const choice = await quickPick(choices,{title:'Inspect retained conflict copies',placeHolder:'Choose a retained folder'});
      if (!choice || !choices.includes(choice)) return;
      await current();
      const copy = await retainedRecovery.inspect(root,choice.name);
      await current();
      const detail = `Folder: ${copy.folder}\nProject file: ${copy.originalPath || 'Unknown'}${copy.copyPath ? `\nCopy: ${copy.copyPath}` : ''}\n${copy.status}\nNo project files or Git locks were changed.`;
      output.appendLine(detail);
      const answer = await vscode.window.showInformationMessage('Retained conflict copy', {modal:true,detail}, ...(copy.content === undefined ? [] : ['Open read-only copy']));
      if (answer !== 'Open read-only copy') return;
      await current();
      const uri = vscode.Uri.parse(`zero-retained-recovery:/${crypto.randomUUID()}/${encodeURIComponent(path.basename(copy.originalPath))}`);
      while (retainedPreviews.size >= 8) retainedPreviews.delete(retainedPreviews.keys().next().value);
      retainedPreviews.set(uri.toString(),copy.content);
      const document = await vscode.workspace.openTextDocument(uri);
      await current();
      await vscode.window.showTextDocument(document,{preview:true});
    },
    'zero.checkBranchConnection': () => checkCurrentBranch({force:true}),
    'zero.reviewBranchUpdate': async () => {
      if(isBusy())return;
      const reviewed=branchRemoteStatus;
      if(!reviewed||reviewed.state!=='remote-changed'||!currentBranchObservation(reviewed))throw new Error('Check the current branch connection before updating.');
      await assertUpdateClean(reviewed.root);
      const ticket=await auth.capture();
      const detail=`Update ${reviewed.branch} from ${core.parseRepositoryUrl(reviewed.remote).page}. GitHub commits may be merged into your local branch. ${reviewed.branch==='main'?'This downloads changes without uploading.':'After the update, including conflict choices, Zero automatically syncs the resulting branch commit to GitHub.'} Conflicts pause for your choices. Save and commit or discard local changes first.`;
      if(await vscode.window.showWarningMessage('Update this branch from GitHub?',{modal:true,detail},'Update branch')!=='Update branch')return;
      await assertUpdateClean(reviewed.root);await auth.assertCurrent(ticket);
      if(!currentBranchObservation(reviewed)||await core.currentBranch(reviewed.root,core.git)!==reviewed.branch||await core.git(reviewed.root,['rev-parse','--verify','HEAD^{commit}'])!==reviewed.head||core.parseRepositoryUrl(await core.git(reviewed.root,['remote','get-url','origin'])).remote!==reviewed.remote)throw new Error('The branch changed after confirmation. Check its connection again.');
      return change(reviewed.branch==='main'?'sync':'updateBranch',{remoteReview:reviewed});
    },
    'zero.switchStudentBranch': async () => {
      if(isBusy())return;
      const root=await project();
      if(uploadMode(root)!=='live')return simulation('Switch branch');
      await assertGitProject(root);
      const original=await core.currentBranch(root,core.git);
      const raw=await core.git(root,['for-each-ref','--format=%(refname)%09%(objectname)','refs/heads/']);
      const choices=raw.split('\n').filter(Boolean).map(row=>{const [ref,head,...extra]=row.split('\t');let name;try{name=core.branchNameFromRef(ref);}catch{return null;}return !extra.length&&name&&github.validBranch(name)&&/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)?{label:name,description:name===original?'Current branch':undefined,name,head}:null;}).filter(Boolean);
      choices.unshift({label:'New branch…',action:'start'});
      const choice=await quickPick(choices,{title:'Switch branch'});
      if(!choice||choice.name===original)return;
      if(choice.action==='start')return change('start');
      if(isBusy())return;changing=true;refresh();
      try {
        await assertGitProject(root);
        if(await core.currentBranch(root,core.git)!==original||await core.git(root,['rev-parse','--verify',`refs/heads/${choice.name}^{commit}`])!==choice.head)throw new Error('The branch changed. Choose it again.');
        const dirtyDocs=await dirtyProjectDocuments(vscode,root);
        const reviewed=await workflow.prepareSwitch(root,choice.name);
        if(reviewed.target!==choice.head||reviewed.branch!==original)throw new Error('The branch changed. Choose it again.');
        const buffers=[];const editorPaths=new Set();
        for(const document of dirtyDocs){
          if(typeof document.getText!=='function'||!Number.isInteger(document.version))throw new Error('An open file cannot be reviewed safely. Save it and choose the branch again.');
          const file=path.join(await fs.realpath(path.dirname(document.uri.fsPath)),path.basename(document.uri.fsPath)),relative=path.relative(root,file);
          if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)||editorPaths.has(file))throw new Error('An open file cannot be reviewed safely. Save it and choose the branch again.');
          editorPaths.add(file);buffers.push({document,file,uri:document.uri.fsPath,version:document.version,text:document.getText()});
        }
        const diskBefore=await switchDiskSnapshot(root,reviewed.status,editorPaths);
        const dirty=dirtyDocs.length||Boolean(reviewed.status);
        if(dirty && await vscode.window.showWarningMessage(`Move your changes to ${choice.name}?`,{modal:true,detail:dirtyDocs.length?'Zero will save the reviewed open project files, then move your current changes if Git can switch without overwriting files.':'Your current changes will move with you if Git can switch without overwriting files.'},'Move changes')!=='Move changes')return;
        let savedEditors=0,saveAttempted=false,switchDispatched=false;
        try {
        await assertGitProject(root);
        const currentDocs=await dirtyProjectDocuments(vscode,root);
        if(currentDocs.length!==buffers.length||buffers.some(({document,uri,version,text})=>!currentDocs.includes(document)||document.uri.fsPath!==uri||document.version!==version||document.getText()!==text))throw new Error('Your open files changed after review. Review the branch move again.');
        const beforeSave=await workflow.prepareSwitch(root,choice.name);
        if(beforeSave.target!==reviewed.target||beforeSave.branch!==reviewed.branch||beforeSave.head!==reviewed.head||beforeSave.status!==reviewed.status||beforeSave.startFingerprint!==reviewed.startFingerprint||await switchDiskSnapshot(root,beforeSave.status,editorPaths)!==diskBefore)throw new Error('The project changed after review. Choose the branch again.');
        for(const {document,file,uri,version,text} of buffers){
          if(document.uri.fsPath!==uri||document.version!==version||document.getText()!==text||!document.isDirty||await fs.realpath(path.dirname(uri))!==path.dirname(file))throw new Error('Your open files changed while saving. Review the branch move again.');
          try{const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw new Error('This open file cannot be saved safely for a branch move.');}catch(error){if(error.code!=='ENOENT')throw error;}
          saveAttempted=true;if(!await document.save())throw new Error('Save your project files before switching branches.');savedEditors++;
        }
        for(const {document,file,uri,version,text} of buffers){
          if(document.uri.fsPath!==uri||document.version!==version||document.getText()!==text||document.isDirty)throw new Error('Your open files changed while saving. Review the branch move again.');
          const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||!(await fs.readFile(file)).equals(Buffer.from(text,'utf8')))throw new Error('The saved file does not match the reviewed editor. Review the branch move again.');
        }
        await assertGitProject(root);
        if(await core.currentBranch(root,core.git)!==original||await core.git(root,['rev-parse','--verify',`refs/heads/${choice.name}^{commit}`])!==choice.head)throw new Error('The branch changed. Choose it again.');
        const guard=async()=>{await assertGitProject(root);if((await dirtyProjectDocuments(vscode,root)).length)throw new Error('Save your project files before switching branches.');};
        const plan=await workflow.prepareSwitch(root,choice.name);
        if(plan.target!==choice.head||plan.branch!==reviewed.branch||plan.head!==reviewed.head||await switchDiskSnapshot(root,plan.status,editorPaths)!==diskBefore||(!dirtyDocs.length&&(plan.status!==reviewed.status||plan.startFingerprint!==reviewed.startFingerprint)))throw new Error('The branch or project changed. Choose it again.');
        const result=await workflowLocalPhase(root,{beforeMutation:guard},phase=>{switchDispatched=true;return workflow.switchPrepared(plan,phase);});
        await refreshNativeGit(root);studentExplorer?.invalidate();report(`Switched to ${result.branch}`);
        if((await dirtyProjectDocuments(vscode,root)).length)void vscode.window.showWarningMessage('An open project file changed while switching branches. Review its unsaved contents and the switched file before saving.');
        }catch(error){if(saveAttempted){const saved=savedEditors?'Some reviewed open files were saved':'A reviewed open file may have been saved';error.message+=switchDispatched?` ${saved}. Check the current branch and files in Source Control.`:` ${saved}; the branch was not switched.`;}throw error;}
      } finally {changing=false;mainUpdateStatus=undefined;mainUpdateGeneration++;mainUpdateNextAt=0;await repositoryStatus();refresh();}
    },
    'zero.switchBranch': async () => {
      if (isBusy()) return;
      changing = true; refresh();
      try {
        const root = await project();
        await lessonProjects.assertShareable(root);
        await core.assertRepositoryRoot(root);
        if (uploadMode(root) !== 'live') {simulation('Switch branch'); return;}
        const previous = await core.currentBranch(root,core.git).catch(() => '');
        const gitExtension = vscode.extensions?.getExtension('vscode.git');
        const gitApi = gitExtension && (gitExtension.isActive ? gitExtension.exports : await gitExtension.activate()).getAPI(1);
        const nativeRepository = gitApi?.getRepository(vscode.Uri.file(root));
        if (!nativeRepository || await fs.realpath(nativeRepository.rootUri.fsPath) !== root) throw new Error('Open this project in VS Code Source Control and enable the built-in Git extension, then try Switch branch again.');
        if (await project() !== root) return;
        if (!gitApi.repositories.some(candidate => candidate.rootUri.fsPath === nativeRepository.rootUri.fsPath)) throw new Error('This project was closed in Source Control. Reopen it, then try Switch branch again.');
        // Native Git owns branch selection and dirty-file/conflict recovery.
        // Pass the exact project URI instead of asking it to choose a repository.
        await assertGitProject(root);
        if (!(await vscode.workspace.saveAll(false)))throw new Error('Save your files before switching branches.');
        if (!await checkpointBefore(root,'switch'))return;
        await assertGitProject(root);
        await workflowLocalPhase(root,{beforeMutation:()=>assertGitProject(root)},async phase=>{
          await phase.beforeMutation();await vscode.commands.executeCommand('git.checkout', vscode.Uri.file(root));await phase.beforeMutation();
        });
        if (await project() !== root) return;
        await repositoryStatus();
        if (branch && branch !== previous) report(`Switched to ${branch}`);
      } finally {changing = false; mainUpdateStatus=undefined;mainUpdateGeneration++;mainUpdateNextAt=0;await repositoryStatus(); refresh();}
    },
    // Retain the former native diagnostic command as a compatibility alias.
    'zero.runNativeApp': expectedRoot => actions['zero.runApp'](expectedRoot),
    'zero.stopApp': stopRequested,
    'zero.openFirstLesson': async () => {
      let lessonId = '15';
      let root;
      if ((vscode.workspace.workspaceFolders || []).length) {
        try {
          root = await project();
          const marker = JSON.parse(await fs.readFile(path.join(root,'zero.json'),'utf8'));
          if (['greeting','study','game','pet'].includes(marker.tutorialProjectId) || ['greeting','study','game'].includes(marker.practiceProjectId)) {
            const first = {greeting:'0',study:'3',game:'8',pet:'13'};
            lessonId = first[marker.tutorialProjectId || marker.practiceProjectId];
          }
        } catch { /* Tutorial Docs is available without a valid project marker. */ }
      }
      await openTutorialDocs(vscode, lessonId);
      if (root) {
        let currentRoot;
        try { currentRoot = await project(); } catch { /* The project may have closed while the browser opened. */ }
        if (currentRoot === root) await context.workspaceState.update(`zero.firstLessonShown:${root}`, true);
      }
    },
    'zero.startProject': async () => {
      if (disposed || isBusy()) return;
      startingTutorial=true;refresh();
      try {if(uploadMode()!=='live')return simulation('Start tutorial');return await githubProjects.startTutorial();}
      finally {startingTutorial=false;if(!disposed)refresh();}
    },
    'zero.cloneRepository': async () => {
      if (disposed || isBusy()) return;
      connecting = true; refresh();
      try {
        if(uploadMode()!=='live')return simulation('Clone from GitHub');
        if(!auth.signedIn)await auth.signIn();
        try {await rememberOpened({projectPath:await project()});}catch{}
        const choice=await projectPicker.choose();
        if(!choice||disposed)return;
        const assertCurrent=()=>auth.assertCurrent(choice.ticket);
        await assertCurrent();
        if(choice.action==='recent')await projectFolders.openLocal({projectPath:choice.projectPath,assertCurrent});
        else await projectFolders.clone({repositoryUrl:choice.repositoryUrl,assertCurrent});
      } catch (error) {
        if (error?.name !== 'Canceled' && error?.name !== 'CancellationError') {output.appendLine(error.message);throw new Error(`Could not clone this repository. ${error.message} Check Zero’s GitHub access, then try Clone from GitHub again.`);}
      } finally {connecting = false; if (!disposed) refresh();}
    },
    'zero.openLocalProject': async () => {
      if (disposed || isBusy()) return;
      connecting = true; refresh();
      try {await projectFolders.openLocal();}
      finally {connecting = false; if (!disposed) refresh();}
    },
    'zero.browseZeroHub': async () => {
      if (isBusy()) return;
      await repositoryStatus();
      if (isBusy()) return;
      const root = projectRoot;
      const choice = await quickPick([
        {label:'Projects', description:'Browse shared games', action:'projects'},
        {label:'Libraries', description:'Inspect libraries and exact versions', action:'libraries'},
        ...(githubReady() && originalWork ? [{label:'Share project', action:'share'}] : [])
      ], {title:'ZeroHub'});
      if (isBusy()) return;
      if (choice?.action === 'projects' && !(await vscode.env.openExternal(vscode.Uri.parse('https://zero.codepet.ca/hub?kind=game')))) {
        throw new Error('Could not open ZeroHub. Open https://zero.codepet.ca/hub in your browser.');
      }
      if (choice?.action === 'libraries') await actions['zero.browseHub']();
      if (choice?.action === 'share') {
        await repositoryStatus();
        if (isBusy() || projectRoot !== root || !auth.signedIn || !originalWork) return;
        await actions['zero.shareGame']();
      }
    },
    'zero.showOutput': () => output.show(true),
    'zero.showProblems': () => vscode.commands.executeCommand('workbench.actions.view.problems'),
    'zero.showSidebar': async () => {
      const preview=studentExplorer?.isPreview();
      await vscode.commands.executeCommand(preview?'workbench.view.extension.zero-student-explorer':'workbench.view.explorer');
      await vscode.commands.executeCommand(preview?'zero.studentControls.focus':'zero.controls.focus');
      if(preview)await context.workspaceState.update('zero.studentExplorerShown',true);
      if (vscode.workspace.getConfiguration('chat').get('disableAIFeatures', false)) await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    },
    'zero.uploadToGitHub': () => uploadProject(),
    'zero.commitChanges': message => commitProject(message),
    'zero.syncSavedCommits': async () => {
      if(isBusy())return;
      const root=await project();if(uploadMode(root)!=='live')return simulation('Sync saved commits');
      const reviewed=branchRemoteStatus;
      const currentReview=()=>reviewed&&currentBranchObservation(reviewed)&&['local-ahead','remote-missing'].includes(reviewed.state)&&Number.isFinite(reviewed.checkedAt)&&Date.now()-reviewed.checkedAt<120000;
      if(!currentReview())throw new Error('Check this branch connection before reviewing its saved commits to sync.');
      changing=true;refresh();let ticket,ownPushAttempt,confirmed=false;
      try {
        await assertGitProject(root);await repositoryStatus();
        if(!currentReview())throw new Error('The branch changed. Check its connection before reviewing saved commits.');
        const plan=await github.prepareUpload(root);
        if(plan.root!==root||plan.branch!==reviewed.branch||plan.head!==reviewed.head||plan.remote!==reviewed.remote)throw new Error('The branch or repository changed. Check its connection again.');
        ticket=await auth.capture();
        const reminderSnapshot=repositoryLedger?await allReminderRecords(root):compatibilityAll(root,plan.branch);
        if(reminderSnapshot.length)throw new Error('An earlier sync or local operation needs attention. Review its reminder before syncing saved commits.');
        const guard=async tx=>{
          await assertGitProject(root);await auth.assertCurrent(ticket);
          if(!currentReview())throw new Error('The branch connection changed or is out of date. Check it and review saved commits again.');
          const current=await github.prepareUpload(root);
          if(['root','remote','branch','head','status','fingerprint'].some(key=>current[key]!==plan[key]))throw new Error('The project changed after confirmation. Review its saved commits again.');
          let records=repositoryLedger?await allReminderRecords(root,tx):compatibilityAll(root,plan.branch);
          if(ownPushAttempt){
            const observed=records.find(row=>row.id===ownPushAttempt.id);
            if(observed&&JSON.stringify(observed)!==JSON.stringify(ownPushAttempt)||!tx&&!observed)throw new Error('The saved-commit sync attempt changed. Inspect its reminder before continuing.');
            records=records.filter(row=>row.id!==ownPushAttempt.id);
          }
          if(JSON.stringify(records)!==JSON.stringify(reminderSnapshot))throw new Error('The sync reminders changed after confirmation. Review them before syncing.');
        };
        const detail=`Repository: ${plan.page}\nBranch: ${plan.branch}\nDestination ref: refs/heads/${plan.branch}\nSaved commit: ${plan.head}\n\n${reviewed.state==='remote-missing'?missingSyncDisclosure(plan)+' ':''}Zero will sync only this saved commit without force. Newer file changes and unsaved editor contents stay on this computer; they will not be staged or committed.`;
        if(await vscode.window.showWarningMessage('Sync saved commits to GitHub?',{modal:true,detail},'Sync commits')!=='Sync commits')return;
        await guard();
        const networkRun=await operationTransport(plan.remote,{root,authentication:auth,ticket,reminderSnapshot,assertProject:guard,assertProjectNow:()=>assertGitProjectNow(root),onPushAttempt:attempt=>{ownPushAttempt=attempt;}});
        if(reviewed.state==='remote-missing'){const checked=await github.checkUpload(root,{...plan,committed:false,pushStarted:false},{networkRun,beforeNetwork:()=>guard()});if(checked.confirmed||checked.remoteHead!==null)throw new Error('The GitHub branch now exists. Check its current state before syncing.');}
        const result=await github.syncExistingHead(plan,{networkRun,beforeUpload:()=>guard()});
        confirmed=true;
        await updateTracking(root,plan.remote,result.branch,result.head);await refreshNativeGit(root);
        const newer=result.localChanged||plan.changes.length||(await dirtyProjectDocuments(vscode,root)).length;
        report('Saved commits synced to GitHub',newer?'The reviewed saved commit was confirmed on GitHub; newer file changes and unsaved edits remain on this computer.':'The reviewed saved commit was confirmed on GitHub.');
      } catch(error) {if(error.uploadRecovery)await rememberPush(error.uploadRecovery,ticket?.session.accountId);throw error;}
      finally {changing=false;await repositoryStatus({forceBranchCheck:confirmed});refresh();}
    },
    'zero.retryBranchSync': async () => {
      if(isBusy())return;
      const root=await project();if(uploadMode(root)!=='live')return simulation('Retry sync');
      changing=true;refresh();let ticket,confirmed=false;
      try {
        await repositoryStatus();const record=pendingUpload;const retryReminderSnapshot=repositoryLedger?await allReminderRecords(root):compatibilityAll(root,record?.branch||branch);
        if(!knownPush(record)||record.root!==root||pushOperation(record)!=='branch')throw new Error('There is no matching branch sync to retry. Inspect the reminder before continuing.');
        const guard=()=>assertGitProject(root);await guard();
        const plan=await github.prepareUpload(root);
        if(plan.root!==record.root||plan.remote!==record.remote||plan.branch!==record.branch)throw new Error('The branch or repository changed. Review the current work before syncing.');
        const descendant=plan.head!==record.head||Boolean(retryReminderSnapshot?.some(row=>row.type!=='local'&&pushOperation(row)==='branch'&&row.branch===plan.branch&&row.head!==plan.head));
        const requireSharedReminders=async()=>{if(descendant&&!await supportsFileReminders(root))throw new Error('Syncing newer commits requires shared sync reminder storage. Review the earlier sync in Source Control; its reminder is kept.');};
        await requireSharedReminders();
        const missing=retryReminderSnapshot.some(row=>samePushGroup(row,record)&&row.kind==='remote-missing') || Boolean(branchRemoteStatus&&currentBranchObservation(branchRemoteStatus)&&branchRemoteStatus.state==='remote-missing');
        const mainUpdateIntents=retryReminderSnapshot.filter(row=>row.operation==='reftable-update'&&row.branch==='main'&&samePushGroup(row,record));if(mainUpdateIntents.length>1)throw new Error('Several main updates need inspection before syncing.');const mainUpdateIntent=mainUpdateIntents[0];if(mainUpdateIntent&&descendant)throw new Error('The local main or its sync reminders changed. Review the retained update before syncing.');
        const reviewExact=!mainUpdateIntent&&!missing&&!descendant&&record.kind==='ready';
        if(!(mainUpdateIntent?['ready','network','behind','unconfirmed','changed','remote-missing']:descendant?['ready','network','behind','unconfirmed','changed','remote-missing']:missing?['ready','network','unconfirmed','changed','remote-missing']:['ready','network']).includes(record.kind))throw new Error(!descendant&&record.kind==='behind'?'There are no newer saved commits to sync. Update this branch from GitHub first, then review its saved commits.':'Check GitHub status or resolve the indicated issue before retrying.');
        if(!mainUpdateIntent&&!missing&&!descendant&&record.pushStarted!==false)throw new Error('A push may have started. Check GitHub status before retrying.');
        ticket=await auth.capture();if(!record.accountId)throw new Error('The earlier sync is not bound to a GitHub account. Inspect its reminder before syncing.');
        if(record.accountId!==ticket.session.accountId)throw new Error('The GitHub account changed. Review the account and repository before syncing.');
        const validateUpdateIntents=async rows=>{for(const row of rows)if(row.operation==='reftable-update')await require('./reftable-update-intent-validation').assertRetryableReftableUpdateIntent({record:row,root,branch:plan.branch,head:plan.head,remote:plan.remote,accountId:ticket.session.accountId,sessionId:ticket.session.id,beforeReview:guard,beforeReviewNow:()=>{assertGitProjectNow(root);return auth.assertCurrentNow(ticket);}});};
        await validateUpdateIntents(retryReminderSnapshot);
        let allowedRetryReminders;const corrections=[];
        const validateCorrection=async row=>{
          if(row.type!=='local'||!['undo','restore'].includes(row.operation)||row.root!==root||row.branch!==plan.branch||typeof row.recoveryPath!=='string'||path.dirname(row.recoveryPath)!==path.join(root,'.git')||!await includesSavedCommit(root,row.head,plan.head))throw new Error('An earlier local operation needs inspection before syncing. Its reminder is kept.');
          const receipt=await projectRestore.validatedCompletedProjectRestore(root,path.basename(row.recoveryPath));
          if(!receipt||receipt.commit!==row.head||receipt.branch!==`refs/heads/${plan.branch}`)throw new Error('This correction is not confirmed applied. Inspect its recovery copies before syncing.');
        };
        if(missing)for(const row of retryReminderSnapshot)if(row.type==='local'&&row.operation){await validateCorrection(row);corrections.push(row);}
        if(corrections.length>1)throw new Error('Several local operations need inspection before syncing.');
        if(descendant){
          if(!repositoryLedger||record.accountId!==ticket.session.accountId||!await includesSavedCommit(root,record.head,plan.head))throw new Error('The earlier sync is not confirmed included in this branch and account. Inspect its reminder before syncing.');
          allowedRetryReminders=[];
          for(const row of retryReminderSnapshot){
            if(row.type==='local'){
              if(row.operation){if(!corrections.includes(row))throw new Error('An earlier local operation needs inspection before syncing. Its reminder is kept.');allowedRetryReminders.push(row);}
              else if(row.branch===plan.branch&&!await includesSavedCommit(root,row.head,plan.head))throw new Error('An earlier local operation or unrelated commit needs inspection before syncing. Its reminder is kept.');
              continue;
            }
            if(pushOperation(row)!=='branch'||row.remote!==plan.remote||row.branch!==plan.branch||row.accountId!==ticket.session.accountId||!await includesSavedCommit(root,row.head,plan.head))throw new Error('An earlier sync has a different destination, account, branch or commit. Inspect its reminder before syncing.');
            allowedRetryReminders.push(row);
          }
          const priorHeads=[...new Set(allowedRetryReminders.map(row=>row.head))].join('\n');
          if(allowedRetryReminders.length>200||priorHeads.length>24000)throw new Error('Too many earlier sync attempts to review here. Inspect them in Source Control.');
          const detail=`Repository: ${plan.page}\nBranch: ${plan.branch}\n${missing?`Destination ref: refs/heads/${plan.branch}\n`:''}Upload saved commit: ${plan.head}\n\nEarlier attempted commits included in this head:\n${priorHeads}\n\n${missing?'GitHub reported this branch missing. Syncing will create it if it remains absent. The check and push are not atomic: if someone creates the branch in between, Git may accept a fast-forward update. ':'An earlier upload may already have reached GitHub. '}Zero will push this reviewed head without force and clear only these exact reminders after GitHub confirms it. Other edits stay on your computer.`;
          if(await vscode.window.showWarningMessage('Sync newer saved commits?',{modal:true,detail},'Sync commits')!=='Sync commits')return;
        }else {
          allowedRetryReminders=retryReminderSnapshot.filter(row=>row.type!=='local'&&samePushGroup(row,record));
          allowedRetryReminders.push(...corrections);
          if(missing&&!mainUpdateIntent){const detail=`Repository: ${plan.page}\nBranch: ${plan.branch}\nDestination ref: refs/heads/${plan.branch}\nSaved commit: ${plan.head}\n\nGitHub reported this branch missing. Syncing will create it if it remains absent. The check and push are not atomic: if someone creates the branch in between, Git may accept a fast-forward update. Zero will push without force; other edits stay on your computer.`;if(await vscode.window.showWarningMessage('Sync this missing GitHub branch?',{modal:true,detail},'Sync branch')!=='Sync branch')return;}
          if(reviewExact){const detail=`Repository: ${plan.page}\nBranch: ${plan.branch}\nSaved commit: ${plan.head}\n\nZero will check that GitHub still has an earlier commit in this branch, then push without force. If the branch is deleted between the check and the push, it may be recreated. Other edits stay on your computer.`;if(await vscode.window.showWarningMessage('Retry syncing this saved commit?',{modal:true,detail},'Sync commit')!=='Sync commit')return;}
        }
        if(mainUpdateIntent){const detail=`Sync the reviewed update ${plan.head} to GitHub main only if main still equals ${mainUpdateIntent.reviewedRemoteHead}. A confirmed matching update needs no push. The final check and non-force push are not atomic: main deleted in between could be recreated, and main rewound in between could be fast-forwarded. Recovery copies and unrelated reminders are kept.`;if(await vscode.window.showWarningMessage('Review update to GitHub main?',{modal:true,detail},'Sync main')!=='Sync main')return;}
        // Compatibility mode has no repository transaction gate in the
        // transport. Never let an exact-head retry bypass another group.
        if(!repositoryLedger&&retryReminderSnapshot.some(row=>row.type==='local'||!allowedRetryReminders.some(allowed=>JSON.stringify(allowed)===JSON.stringify(row))))throw new Error('An earlier sync or local operation needs attention. Review its reminder before syncing.');
        let ownPushAttempt;
        const beforeUpload=async()=>{
          await guard();await auth.assertCurrent(ticket);await requireSharedReminders();await validateUpdateIntents(retryReminderSnapshot);
          if(descendant||missing||reviewExact||!repositoryLedger){
            const current=await github.prepareUpload(root);
            if(['root','remote','branch','head','status','fingerprint'].some(key=>current[key]!==plan[key]))throw new Error('The project changed after confirmation. Review the saved commits again.');
            let reminders=repositoryLedger?await allReminderRecords(root):compatibilityAll(root,plan.branch);
            if(ownPushAttempt){
              if(!reminders.some(row=>JSON.stringify(row)===JSON.stringify(ownPushAttempt)))throw new Error('The new sync attempt changed. Inspect its reminder before continuing.');
              reminders=reminders.filter(row=>row.id!==ownPushAttempt.id);
            }
            if(JSON.stringify(reminders)!==JSON.stringify(retryReminderSnapshot))throw new Error('The sync reminders changed after confirmation. Review them again.');
            for(const row of allowedRetryReminders)if(!await includesSavedCommit(root,row.head,plan.head))throw new Error('The earlier commit is no longer confirmed included. Review its reminder again.');
            for(const row of corrections)await validateCorrection(row);
          }
        };
        await beforeUpload();
        const networkRun=await operationTransport(plan.remote,{root,allowedReminders:allowedRetryReminders,reminderSnapshot:retryReminderSnapshot,allowIncludedPushes:descendant,allowIncludedOperations:corrections.length>0,onPushAttempt:attempt=>{ownPushAttempt=attempt;},authentication:auth,ticket,assertProject:guard,assertProjectNow:()=>assertGitProjectNow(root)});
        const mainIntent=mainUpdateIntent;
        if(mainIntent){const checked=await github.checkUpload(root,mainIntent,{networkRun,beforeNetwork:beforeUpload});if(checked.confirmed){await beforeUpload();await repositoryLedger.withTransaction(root,async tx=>{const rows=await tx.list();for(const reviewed of allowedRetryReminders){const latest=rows.find(row=>row.id===reviewed.id);if(!latest||JSON.stringify(latest)!==JSON.stringify(reviewed))throw new Error('The sync reminders changed. Review them again.');}await validateUpdateIntents(allowedRetryReminders);tx.assertCurrentNow();assertGitProjectNow(root);auth.assertCurrentNow(ticket);for(const reviewed of allowedRetryReminders)await tx.resolve(reviewed.id,'confirmed');});confirmed=true;await updateTracking(root,plan.remote,plan.branch,plan.head);await refreshNativeGit(root);report('GitHub confirmed the updated main');return;}if(checked.remoteHead!==mainIntent.reviewedRemoteHead)throw new Error('GitHub main changed or is missing. The local update and recovery copies are kept; review main before syncing.');}
        if(missing&&!mainIntent){const checked=await github.checkUpload(root,record,{networkRun,beforeNetwork:beforeUpload});if(checked.confirmed||checked.remoteHead!==null)throw new Error('The GitHub branch now exists. Check its current state before syncing.');}
        if(reviewExact){const checked=await github.checkUpload(root,record,{networkRun,beforeNetwork:beforeUpload});if(checked.confirmed||!await isEarlierRemoteHead(root,checked.remoteHead,plan.head))throw new Error('Check GitHub status again before retrying this saved commit.');}
        let observedDescendant=false;
        if(descendant&&!mainIntent){
          let checkedCount=0,allAtHead=true;
          for(const earlier of allowedRetryReminders){
            if(earlier.type==='local'||earlier.pushStarted===false)continue;
            const checked=await github.checkUpload(root,{...earlier,committed:Boolean(earlier.committed),pushStarted:true},{networkRun,beforeNetwork:beforeUpload});
            if(checked.remoteHead===null&&!missing)throw new Error('The GitHub branch is missing. Review branch creation before syncing.');
            checkedCount++;if((checked.confirmed?earlier.head:checked.remoteHead)!==plan.head)allAtHead=false;
          }
          await beforeUpload();
          observedDescendant=checkedCount>0&&allAtHead&&!corrections.length;
        }
        if(observedDescendant){
          const selected=retryReminderSnapshot.filter(row=>allowedRetryReminders.some(allowed=>allowed.id===row.id)||row.type==='local'&&!row.operation&&row.root===root&&row.branch===plan.branch);
          await commitProvenance.withDeferredRefMutation(root,binding=>{
            const authority=Object.freeze({...binding,assertCurrentNow(){binding.assertCurrentNow();assertGitProjectNow(root);auth.assertCurrentNow(ticket);}});
            return repositoryLedger.withProvenance(root,authority,async tx=>{
              await guard(tx);await auth.assertCurrent(ticket);
              const current=await github.prepareUpload(root),rows=await tx.list();
              if(['root','remote','branch','head','status','fingerprint'].some(key=>current[key]!==plan[key])||JSON.stringify(rows)!==JSON.stringify(retryReminderSnapshot))throw new Error('The project or sync reminders changed. Review them again.');
              for(const reviewed of selected){
                await guard(tx);await auth.assertCurrent(ticket);
                const live=await github.prepareUpload(root);
                if(['root','remote','branch','head','status','fingerprint'].some(key=>live[key]!==plan[key])||!await includesSavedCommit(root,reviewed.head,plan.head))throw new Error('The project changed. Review the saved commits again.');
                const latest=(await tx.list()).find(row=>row.id===reviewed.id);
                if(!latest||JSON.stringify(latest)!==JSON.stringify(reviewed))throw new Error('The sync reminder changed. Review it again.');
                tx.assertCurrentNow();assertGitProjectNow(root);auth.assertCurrentNow(ticket);await tx.resolve(reviewed.id,'confirmed');
              }
            });
          });
          confirmed=true;await updateTracking(root,plan.remote,plan.branch,plan.head);await refreshNativeGit(root);report('Branch synced to GitHub','The reviewed commit was already confirmed on GitHub.');return;
        }
        const result=await github.syncExistingHead(plan,{networkRun,beforeUpload});
        confirmed=true;
        for(const row of corrections)await resolveReviewedLocal(root,plan.branch,plan.head,[row],{only:row});
        if(descendant&&repositoryLedger){
          const reviewedLocal=retryReminderSnapshot.filter(row=>row.type==='local'&&!row.operation&&row.root===root&&row.branch===plan.branch);
          await commitProvenance.withDeferredRefMutation(root,binding=>{
            const authority=Object.freeze({...binding,assertCurrentNow(){binding.assertCurrentNow();assertGitProjectNow(root);auth.assertCurrentNow(ticket);}});
            return repositoryLedger.withProvenance(root,authority,async tx=>{
              for(const reviewed of reviewedLocal){
                await guard(tx);await auth.assertCurrent(ticket);
                if(!await includesSavedCommit(root,reviewed.head,result.head))throw new Error('An earlier local commit is no longer confirmed included. Its reminder is kept.');
                const rows=await tx.list(),latest=rows.find(row=>row.id===reviewed.id);
                if(latest&&JSON.stringify(latest)===JSON.stringify(reviewed)){tx.assertCurrentNow();assertGitProjectNow(root);auth.assertCurrentNow(ticket);await tx.resolve(reviewed.id,'confirmed');}
              }
            });
          });
        }
        // The ledger transport already resolved only the reviewed identities.
        // Compatibility without a ledger must use the same exact snapshots.
        if(!repositoryLedger)for(const reviewed of allowedRetryReminders){const current=(await pushRecords(root,result.branch)).find(row=>row.id===reviewed.id);if(current&&JSON.stringify(current)===JSON.stringify(reviewed))await clearPush(root,result.branch,current);}
        await updateTracking(root,plan.remote,result.branch,result.head);await refreshNativeGit(root);
        report('Branch synced to GitHub',result.localChanged?'The reviewed commit synced; newer local work remains unchanged.':'The reviewed commit was confirmed on GitHub.');
      } catch(error) {if(error.uploadRecovery)await rememberPush(error.uploadRecovery,ticket?.session.accountId);throw error;}
      finally {changing=false;await repositoryStatus({forceBranchCheck:confirmed});refresh();}
    },
    'zero.reviewLocalCommit': async () => {
      if(isBusy())return;
      changing=true;refresh();
      try {
        const root=await project();await assertGitProject(root);await repositoryStatus();
        const record=pendingLocalCommit;
        if(!record||record.root!==root)throw new Error('There is no local sync reminder to review on this branch.');
        const currentHead=(await core.git(root,['rev-parse','--verify','HEAD^{commit}'])).trim();
        const recovery=record.operation?`\n${record.operation==='undo'?'Undo correction':'Restore'} recovery folder: ${record.recoveryPath||'Open Inspect recovery copies'}\nUse Inspect recovery copies → Project restore${record.operation==='undo'?' and Finished-change inverse':''} to inspect the journal and copies.`:'';
        const choice=await vscode.window.showWarningMessage('Have you inspected this local sync reminder?',{modal:true,detail:`Branch: ${record.branch}\nIntended commit: ${record.head}\nCurrent HEAD: ${currentHead}${recovery}\n\n${gitRecoveryPanel.localReminderMessage(record)} Check project history and recovery copies first. Marking this reviewed removes only this reminder; it does not change files, confirm a commit was applied, or confirm GitHub received it.`},'Mark reviewed');
        if(choice!=='Mark reviewed')return;
        await assertGitProject(root);await repositoryStatus();
        const current=pendingLocalCommit;
        const latest=(await localRecords(root,record.branch)).find(item=>item.id===record.id);
        if(!current||current.id!==record.id||!latest||JSON.stringify(latest)!==JSON.stringify(record)||(await core.git(root,['rev-parse','--verify','HEAD^{commit}'])).trim()!==currentHead)throw new Error('The sync reminder or project history changed. Review it again.');
        await resolveReminder(latest,'reviewed');await repositoryStatus();
        report('Local sync reminder marked reviewed','Only the selected reminder was marked reviewed. No GitHub receipt or applied commit was inferred.');
      } finally {changing=false;refresh();}
    },
    'zero.syncLocalCommit': async () => {
      if(isBusy())return;
      await settleBranchCheck();if(isBusy())return;
      const missing=observedMissing(projectRoot);
      changing=true;refresh();let selectedAuth,confirmed=false;
      try {
        await repositoryStatus();const pending=pendingLocalCommit;
        if(!pending)throw new Error('There is no local commit awaiting reconnection.');
        const guard=()=>assertGitProject(pending.root);await guard();
        const plan=await github.prepareUpload(pending.root);
        assertMissingPlan(missing,plan);
        if(plan.root!==pending.root||plan.branch!==pending.branch||!await includesSavedCommit(pending.root,pending.head,plan.head))throw new Error('The project changed or this reminder needs inspection. Review the current branch before syncing.');
        const localRootSnapshot=repositoryLedger?await allReminderRecords(pending.root):compatibilityAll(pending.root,pending.branch);
        const localSnapshot=(await localRecords(pending.root,pending.branch)),pushSnapshot=(await pushRecords(pending.root,pending.branch));
        if(pushSnapshot.length || localSnapshot.some(item=>item.operation&&item.id!==pending.id) || !localSnapshot.some(item=>JSON.stringify(item)===JSON.stringify(pending)))throw new Error('An earlier sync needs attention. Review it before syncing.');
        const validateCorrection=async()=>{
          if(!pending.operation)return;
          if(!['undo','restore'].includes(pending.operation)||typeof pending.recoveryPath!=='string'||path.dirname(pending.recoveryPath)!==path.join(pending.root,'.git'))throw new Error('This correction reminder needs inspection before syncing.');
          const receipt=await projectRestore.validatedCompletedProjectRestore(pending.root,path.basename(pending.recoveryPath));
          if(!receipt||receipt.commit!==pending.head||receipt.branch!==`refs/heads/${pending.branch}`)throw new Error('This correction is not confirmed applied. Inspect its recovery copies and project history before syncing.');
          if(await core.currentBranch(pending.root,core.git)!==plan.branch||(await core.git(pending.root,['rev-parse','--verify','HEAD^{commit}'])).trim()!==plan.head||!await includesSavedCommit(pending.root,pending.head,plan.head))throw new Error('The project history changed. Review the correction before syncing.');
        };
        await validateCorrection();
        const included=pending.operation?[pending]:[];
        for(const record of localSnapshot)if(!pending.operation&&!record.operation&&!record.remote&&await includesSavedCommit(pending.root,record.head,plan.head))included.push(record);
        const choice=await vscode.window.showWarningMessage('Sync saved project commits?',{modal:true,detail:`Repository: ${plan.page}\nBranch: ${plan.branch}\nCommit: ${plan.head}\n${missing?missingSyncDisclosure(plan)+'\n':''}Only saved commits are uploaded. Other edits and unrelated or interrupted reminders are kept.`},'Sync commits');
        if(choice!=='Sync commits')return;
        let ownPushAttempt;
        const checkReminders=async tx=>{
          let pushes=await pushRecords(pending.root,pending.branch,tx);
          if(ownPushAttempt){const observed=pushes.find(record=>record.id===ownPushAttempt.id);if((observed&&JSON.stringify(observed)!==JSON.stringify(ownPushAttempt))||(!tx&&!observed))throw new Error('The sync attempt changed. Review it before continuing.');pushes=pushes.filter(record=>record.id!==ownPushAttempt.id);}
          if(pushes.length || JSON.stringify((await localRecords(pending.root,pending.branch,tx)))!==JSON.stringify(localSnapshot))throw new Error('The sync reminders changed. Review the current branch before syncing.');
          await validateCorrection();
        };
        await guard();assertMissingPlan(missing,plan);await checkReminders();
        const initialTicket=await auth.capture();
        selectedAuth=await selectUploadAuthentication({root:pending.root,authentication:auth,initialTicket,repositories,repositoryUrl:plan.page,assertCurrentProject:guard});
        const ticket=selectedAuth.ticket,activeAuth=selectedAuth.authentication;
        if(missing&&(ticket.session.accountId!==missing.account||ticket.session.id!==missing.session))throw new Error('The GitHub account or session changed. Review branch creation again.');
        const networkRun=await operationTransport(plan.remote,{root:pending.root,authentication:activeAuth,ticket,permissions:selectedAuth.permissions,identity:selectedAuth.identity,reminderSnapshot:localRootSnapshot,allowedReminders:pending.operation?[pending]:[],allowIncludedOperations:Boolean(pending.operation),onPushAttempt:attempt=>{ownPushAttempt=attempt;},assertProject:guard,assertProjectNow:()=>assertGitProjectNow(pending.root),assertReminders:checkReminders});
        const beforeUpload=async()=>{await guard();assertMissingPlan(missing,plan);await checkReminders();await activeAuth.assertCurrent(ticket);};
        if(missing){const checked=await github.checkUpload(pending.root,{...plan,committed:false,pushStarted:false},{networkRun,beforeNetwork:beforeUpload});if(checked.confirmed||checked.remoteHead!==null)throw new Error('The GitHub branch now exists. Check its current state before syncing.');}
        const result=await github.syncExistingHead(plan,{networkRun,beforeUpload});
        confirmed=true;
        // Resolve only exact records still present after a confirmed transfer.
        await resolveReviewedLocal(pending.root,pending.branch,plan.head,included);
        await resolveConfirmedSync(pending.root,pending.branch,plan.remote,plan.head,ticket.session.accountId,'branch',localRootSnapshot);
        await updateTracking(pending.root,plan.remote,pending.branch,plan.head);await refreshNativeGit(pending.root);
        report('Local commit synced to GitHub',result.localChanged||plan.changes.length?'The saved commit synced; newer local work remains on your computer.':'The saved commit was confirmed on GitHub.');
      } catch(error) {
        if(error.uploadRecovery)await rememberPush(error.uploadRecovery,selectedAuth?.ticket?.session?.accountId);
        throw error;
      } finally {selectedAuth?.dispose();changing=false;await repositoryStatus({forceBranchCheck:confirmed});refresh();}
    },
    'zero.connectRepository': async () => {
      if (isBusy()) return;
      connecting = true; refresh();let connected=false;
      try {
        const root = await project();
        await lessonProjects.assertShareable(root);
        const value = await vscode.window.showInputBox({title:'GitHub repository URL', validateInput:value => {try {core.parseRepositoryUrl(value);} catch(error) {return error.message;}}});
        if (!value) return;
        if (await project() !== root) throw new Error('The student project changed. Connect the repository again.');
        const marker=await lessonProjects.tutorialMarker(root);
        const remotes=marker?(await core.git(root,['remote'])).split('\n'):[];
        const result = marker&&!remotes.includes('origin')
          ? await core.reconnectTutorialRepository(root,value,async page=>{const choice=await vscode.window.showWarningMessage(`Connect this project to ${page}?`,{modal:true,detail:'Confirm this is your repository. This only reconnects the project; it does not upload files.'},'Connect');if(await project()!==root)throw new Error('The student project changed. Connect the repository again.');return choice==='Connect';})
          : await core.connectRepository(root, value, async () => (await vscode.window.showWarningMessage('Replace this student project’s existing origin remote with the repository you entered?', {modal:true}, 'Replace origin')) === 'Replace origin');
        if (result) {connected=true;report('Repository connected', 'Repository connected locally. No files uploaded.'); }
      } finally {connecting = false;await repositoryStatus({forceBranchCheck:connected});refresh();}
    },
    'zero.copyRepositoryLink': async () => {
      if (isBusy()) return;
      const root = await project();
      await core.assertRepositoryRoot(root);
      const {page} = core.parseRepositoryUrl(await core.git(root, ['remote','get-url','origin']));
      await vscode.env.clipboard.writeText(page);
      report('Repository link copied', 'Repository link copied. Paste it into Pika when submitting.');
    },
    'zero.showSetup': createSetupHelp(vscode,{project,output,run:root => actions['zero.runApp'](root),testInstallation:async()=>{const root=await findSetupProject();await vscode.commands.executeCommand('vscode.openFolder',vscode.Uri.file(root),{forceNewWindow:true});},uploadMode})
  };
  const webCacheRoot=context.globalStorageUri ? path.join(context.globalStorageUri.fsPath,'web-compiler') : undefined;
  const savedBuilder=createProjectBuilder({isTrusted:()=>vscode.workspace.isTrusted===true,extensionPath:context.extensionPath||path.resolve(__dirname,'..')});
  function projectUpdateGuard(root,signal) {
    return async()=>{
      const folders=JSON.stringify((vscode.workspace.workspaceFolders||[]).map(folder=>folder.uri.fsPath));
      if(disposed||signal?.aborted||vscode.workspace.isTrusted!==true)throw new Error('The project changed or the update was cancelled.');
      const selected=await project();
      if(disposed||signal?.aborted||vscode.workspace.isTrusted!==true||selected!==root||folders!==JSON.stringify((vscode.workspace.workspaceFolders||[]).map(folder=>folder.uri.fsPath)))throw new Error('The project changed or the update was cancelled.');
      require('./sharing/editor').assertSaved(vscode,root);
    };
  }
  // Tooling updates also write project files. Serialize Git projects with the
  // same lock as file restoration; leave genuinely non-Git projects usable.
  async function withProjectUpdateMutation(root,current,execute) {
    const gitState=async()=>{
      let dir=root;
      while(true){
        try{await fs.lstat(path.join(dir,'.git'));if(dir!==root)throw new Error('Open the repository root before updating project files.');return true;}
        catch(error){if(error.code!=='ENOENT')throw error;}
        const parent=path.dirname(dir);if(parent===dir)return false;dir=parent;
      }
    };
    await current();const git=await gitState();
    if(!git){const guard=async()=>{await current();if(await gitState())throw new Error('Git metadata changed. Review the project update again.');};await guard();return execute(guard);}
    let completed=false,result;
    try{return await retainedLocalPhase(root,async binding=>{
      const guard=async()=>{binding.assertCurrentNow();await current();await commitProvenance.assertFileRestoreClear(root);binding.assertCurrentNow();};
      await guard();result=await execute(guard);completed=true;return result;
    });}catch(error){if(completed)error.message+=` The project operation may have completed; inspect the project before retrying.${result?.recoveryPath?` Recovery copies: ${result.recoveryPath}.`:''}`;throw error;}
  }
  // One read-only, bounded inspection per opened trusted project; no project code runs.
  inspectProjectUpdate=root=>{
    if(disposed||vscode.workspace.isTrusted!==true||isSetupProject(root)||projectUpdateRoot===root)return;
    projectUpdateRoot=root;projectUpdateAvailable=false;const generation=++projectUpdateGeneration;
    void require('./project-update').planUpdate({projectRoot:root,extensionPath:context.extensionPath||path.resolve(__dirname,'..')}).then(plan=>{
      if(disposed||generation!==projectUpdateGeneration||projectRoot!==root||vscode.workspace.isTrusted!==true)return;
      projectUpdateAvailable=plan.changed;refresh();
    }).catch(()=>{}); // Explicit update reports conflicts and recovery instructions.
  };
  if(vscode.workspace.onDidGrantWorkspaceTrust)context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(()=>{if(projectRoot)inspectProjectUpdate(projectRoot);}));
  async function updateProject(root,{signal,required=false}={}) {
    const current=projectUpdateGuard(root,signal);
    await current();
    const upgrade=require('./project-update');
    const plan=await upgrade.planUpdate({projectRoot:root,extensionPath:context.extensionPath||path.resolve(__dirname,'..')});
    await current();
    if(!plan.changed)return false;
    // Browser actions can use a verified current builder without changing an
    // older core. The saved builder independently verifies itself before use.
    if(required&&plan.builderChanged===false)return false;
    throw new Error('Project update and recovery are temporarily unavailable. Your project and recovery copies are kept. To use current tooling, create a new Zero project and carefully copy your source files and assets after making a backup.');
    const version=require('../package.json').version;
    const detail='This may cause your project to stop working. The updated Zero files include their license in .zero-build/src/web-export/notices; your existing project LICENSE stays unchanged.';
    const updateChoice={title:'Update Project'};
    if(await vscode.window.showWarningMessage(`Update this project for Zero ${version}?`,{modal:true,detail},updateChoice,{title:'Not Now',isCloseAffordance:true})!==updateChoice) {
      if(required)throw new Error('Browser action cancelled. Update Project to continue.');
      return false;
    }
    await current();projectUpdateGeneration++;projectUpdateAvailable=false;const result=await withProjectUpdateMutation(root,current,guard=>upgrade.applyUpdate(plan,{assertCurrent:guard}));
    try{await current();}catch(error){if(result.backupPath)error.message+=` The original project files are saved at ${result.backupPath}.`;throw error;}
    if(result.cleanupWarning)output.appendLine(result.cleanupWarning);
    report('Project updated · test and commit',`Project updated. ${result.backupPath?`Previous files saved at ${result.backupPath}. `:''}Test the app and browser build, review local library requirements, and commit the changed project files.`);
    return true;
  }
  async function withCurrentBrowserTooling(operation,options) {
    await updateProject(options.projectRoot,{signal:options.signal,required:true});
    return operation({...options,explicitAction:true});
  }
  const savedProblems=vscode.languages?.createDiagnosticCollection('zero-browser-compatibility');
  const relevantSource=uri=>{
    if(!savedChecksRoot||!uri?.fsPath?.startsWith(savedChecksRoot+path.sep))return false;
    const relative=path.relative(savedChecksRoot,uri.fsPath).split(path.sep).join('/');
    return /^(?:src\/main\/(?:java|resources)\/|libraries\/|zero-dependencies\/|\.zero-build\/|\.mvn\/|(?:pom\.xml|mvnw|mvnw\.cmd|zero-core\.json|zero-libraries\.json|zero\.json)$)/.test(relative);
  };
  const hasDirtySource=()=>Boolean(vscode.workspace.textDocuments?.some(document=>document.isDirty&&relevantSource(document.uri)));
  const sourceChanged=(uri,documentEvent=false)=>{
    if(relevantSource(uri))savedChecks?.changed({dirty:hasDirtySource()});
    // Workspace folders can be symlinks while projectRoot is canonical. A
    // change anywhere in an open folder is a safe reason to refresh; the
    // status read itself remains bound to the resolved project root.
    if(projectRoot&&uri?.fsPath&&(documentEvent||[projectRoot,...(vscode.workspace.workspaceFolders||[]).map(folder=>folder.uri.fsPath)].some(root=>{const relative=path.relative(root,uri.fsPath);return relative&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);})))scheduleProjectDirty();
  };
  for(const [method,callback]of [['onDidChangeTextDocument',event=>sourceChanged(event.document.uri,true)],['onDidSaveTextDocument',document=>sourceChanged(document.uri,true)],['onDidCloseTextDocument',document=>sourceChanged(document.uri,true)]]){
    const subscription=vscode.workspace[method]?.(callback);if(subscription)context.subscriptions.push(subscription);
  }
  const sourceWatcher=vscode.workspace.createFileSystemWatcher('**/*');
  for(const method of ['onDidCreate','onDidChange','onDidDelete'])sourceWatcher[method]?.(sourceChanged,undefined,context.subscriptions);
  context.subscriptions.push(sourceWatcher,{dispose(){savedChecksEnableGeneration++;savedPreparation?.abort();savedChecks?.dispose();savedProblems?.dispose();}});
  actions['zero.enableBrowserChecks']=async()=>{
    if(isBusy())return;
    const attempt=++savedChecksEnableGeneration,controller=new AbortController();savedPreparation=controller;maintenanceBusy=true;refresh();
    const current=()=>!disposed&&attempt===savedChecksEnableGeneration&&!controller.signal.aborted;
    try{
      const root=await runnableProject();if(!current())return;
      if(vscode.workspace.isTrusted!==true)throw Error('Trust your own project before enabling its saved browser tooling.');
      if(!await vscode.workspace.saveAll(false))throw Error('Save your files before preparing browser checks.');
      if(!current())return;
      savedChecks?.dispose();savedChecks=undefined;savedChecksRoot=root;savedChecksState={status:'unavailable',message:'Preparing verified dependencies for browser checks.'};savedProblems?.clear();refresh();
      const work=async(progress,token)=>{const listener=token?.onCancellationRequested(()=>controller.abort());
        try{await withCurrentBrowserTooling(savedBuilder.prepareBrowserChecks,{projectRoot:root,cacheRoot:webCacheRoot,signal:controller.signal,onProgress:message=>{if(!current())return;output.appendLine(message);progress?.report({message:String(message)});}});}finally{listener?.dispose();}};
      if(vscode.window.withProgress)await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Prepare browser checks for this project',cancellable:true},work);else await work();
      if(!current())return;const selected=await project();if(!current()||selected!==root)return;
      const host=createSavedSourceHost({projectRoot:root,cacheRoot:webCacheRoot,builder:savedBuilder});
      const checks=createSavedSourceStatus({...host,isTrusted:()=>!disposed&&vscode.workspace.isTrusted===true&&projectRoot===root,onChange:next=>{
        if(disposed||savedChecksRoot!==root)return;savedChecksState=next;savedProblems?.clear();
        if(next.status==='unsupported'&&savedProblems){const grouped=new Map();
          for(const entry of sourceDiagnostics((next.diagnostics||[]).map(item=>item.message).join('\n'),root)){
            const position=new vscode.Position(Math.max(0,entry.line-1),Math.max(0,entry.column-1)),item=new vscode.Diagnostic(new vscode.Range(position,position),entry.message,vscode.DiagnosticSeverity.Error);item.source='Zero saved-source browser check';
            if(!grouped.has(entry.file))grouped.set(entry.file,[]);grouped.get(entry.file).push(item);
          }
          for(const [file,items]of grouped)savedProblems.set(vscode.Uri.file(file),items);
        }
        refresh();
      }});
      savedChecks=checks;await checks.enable({explicitAction:true});if(!current()){checks.dispose();return;}
      checks.changed({dirty:hasDirtySource(),reason:'Saved source ready for checking.'});await checks.flush();
    }catch(error){if(current()&&error.name!=='AbortError')throw error;}
    finally{if(savedPreparation===controller)savedPreparation=undefined;maintenanceBusy=false;refresh();}
  };
  actions['zero.disableBrowserChecks']=()=>{
    savedChecksEnableGeneration++;savedPreparation?.abort();savedChecks?.disable();savedProblems?.clear();
    if(!savedChecks)savedChecksState={status:'unavailable',message:'Browser checks are disabled.'};refresh();
  };

  const buildWithSavedProject=options=>withCurrentBrowserTooling(savedBuilder.ensureValidatedExport,options);
  const validateWithSavedProject=options=>savedBuilder.validateExport({...options,explicitAction:true});
  const runnableProject=async()=>{const root=await project();await core.assertTutorialRepository(root);return root;};
  const browserRun=createBrowserRunCommands(vscode,{project:runnableProject,output,ensureValidatedExport:buildWithSavedProject,validateExport:validateWithSavedProject,validateRetainedExport:savedBuilder.validateRetainedExport,isBusy,setBusy:value=>{browserBusy=value;refresh();},setActive:value=>{browserActive=value;refresh();},setFailed:value=>{buildFailed=value;refresh();},setState:text=>{state=text;refresh();},cacheRoot:webCacheRoot,beforeRun:stopRequested});
  Object.assign(actions,browserRun.commands);
  actions['zero.runApp']=expectedRoot=>{
    if (stopPromise) return stopPromise;
    if (isBusy() || nativeStarting) return Promise.resolve();
    return queuedRun(expectedRoot);
  };
  actions['zero.stopApp']=()=>{
    if (stopPromise) return stopPromise;
    stopPromise=Promise.resolve().then(async()=>{
      browserRun.stop();
      await Promise.all([stopRequested(),browserRun.whenIdle(),nativeIdle()]);
    }).finally(()=>{stopPromise=undefined;refresh();});
    refresh();return stopPromise;
  };
  actions['zero.toggleApp']=()=>{
    if (stopPromise) return stopPromise;
    if (execution || pendingLaunch || nativeStarting || browserActive || browserBusy) return actions['zero.stopApp']();
    if (!isBusy()) return actions['zero.runApp']();
  };
  context.subscriptions.push(...browserRun.disposables);
  const webPublish=createWebPublishCommands(vscode,{project,assertProjectNow:assertGitProjectNow,connectedRepository:()=>repository,authentication:auth,repositories,isSimulation:root=>uploadMode(root)!=='live',isBusy,setBusy:value=>{publishingWeb=value;refresh();},setState:text=>{state=text;refresh();},setProgress:value=>{publishProgress=value;refresh();},output,workspaceState:context.workspaceState,cacheRoot:webCacheRoot,localBuild:options=>savedBuilder.ensureValidatedExport({...options,explicitAction:true}),validateExport:validateWithSavedProject,beforeBuildReview:(root,{signal})=>updateProject(root,{signal,required:true}),assertBuildInputsAtCommit:savedBuilder.assertBuildInputsAtCommit,uploadChanges:(uploadAuth,options)=>uploadProject(uploadAuth,options)});
  Object.assign(actions,webPublish.commands);
  context.subscriptions.push(...webPublish.disposables);
  const sharingHandoff=async(root,action)=>{
    if(await project()!==root)throw new Error('The project changed. Prepare sharing again.');
    componentBusy=false;
    try {return await action();} finally {componentBusy=true;refresh();}
  };
  const assets=createAssetCommands(vscode,{project,isBusy,setBusy:value=>{maintenanceBusy=value;refresh();},setState:report,output});
  const fileCreation=createFileCommands(vscode,{project,isBusy,setBusy:value=>{maintenanceBusy=value;refresh();},setState:report,output,refreshFiles:()=>studentExplorer?.invalidate()});
  Object.assign(actions,fileCreation.commands);
  context.subscriptions.push(fileCreation);
  const fileRename=createRenameCommands(vscode,{project,isBusy,setBusy:value=>{maintenanceBusy=value;refresh();},setState:report,output,refreshFiles:()=>studentExplorer?.invalidate()});
  Object.assign(actions,fileRename.commands);context.subscriptions.push(fileRename);
  const recovery=createRecoveryCommands(vscode,{project,isBusy,setBusy:value=>{maintenanceBusy=value;refresh();},setState:report,output});
  Object.assign(actions,assets.commands,recovery.commands);
  context.subscriptions.push(assets,recovery);
  async function undoFinishedChange(id) {
    if (isBusy()) return;
    await settleBranchCheck();if(isBusy())return;
    const missing=observedMissing(projectRoot);
    maintenanceBusy=true;refresh();let inversePath,restorePath,target,applied=false;
    try {
      const root=await project();
      await lessonProjects.assertShareable(root);
      if (uploadMode(root)!=='live') return simulation('Undo change');
      throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
      if(process.platform==='win32')throw new Error('Committed undo is not supported on Windows yet. No undo was started.');
      if(!await supportsFileReminders(root))throw new Error('Committed undo requires shared durable sync reminders for this project. No undo was started. Use Source Control to review a correction.');
      let expectedBranch,undoIntent,missingIntent,reminderSnapshot,undoTx,current;
      const undoAccount=auth.accountId||null;
      const reminders=async tx=>repositoryLedger?await allReminderRecords(root,tx):[...(await pushRecords(root,expectedBranch,tx)),...(await localRecords(root,expectedBranch,tx))].sort((a,b)=>a.id.localeCompare(b.id));
      const guard=async()=>{
        await assertGitProject(root);
        if(vscode.workspace.isTrusted!==true)throw new Error('Trust your project before undoing a change.');
        const folders=vscode.workspace.workspaceFolders || [];
        if (folders.length!==1 || folders[0].uri.scheme!=='file' || await fs.realpath(folders[0].uri.fsPath)!==root) throw new Error('Open the original standalone project to undo this change.');
        if ((vscode.workspace.textDocuments || []).some(document=>document.isDirty && document.uri?.scheme==='file')) throw new Error('Save your open files before undoing a change. Your edits are kept.');
        if (await workflow.readRecovery?.(root)) throw new Error('Finish or cancel the pending update before undoing a change.');
        if(expectedBranch&&(await core.currentBranch(root,core.git)).trim()!==expectedBranch)throw new Error('The branch changed. Review the undo again.');
        if(missing&&current)assertMissingPlan(missing,current);
        if(reminderSnapshot&&JSON.stringify((await reminders(undoTx)).filter(record=>record.id!==undoIntent?.id&&record.id!==missingIntent?.id))!==JSON.stringify(reminderSnapshot))throw new Error('Sync reminders changed. Review the undo again; earlier reminders are kept.');
      };
      await guard();current=await github.prepareLocalCommit(root);expectedBranch=current.branch;reminderSnapshot=await reminders();assertMissingPlan(missing,current);
      if(current.changes?.length)throw new Error('Commit or discard project changes before undoing a finished change.');
      const ident=(await core.git(root,['var','GIT_AUTHOR_IDENT'])).trim(),author=/^(.+) <([^<>]+)> [0-9]+ [+-][0-9]{4}$/.exec(ident);
      if(!author)throw new Error('Configure your Git name and email before undoing a change.');
      const plan=await changeUndo.preview(root,id,{beforeMutation:guard});
      if(plan.head!==current.head||plan.branch!==current.branch)throw new Error('History changed. Review the undo again.');
      const reviewedFiles=[...plan.files].sort(),fileList=reviewedFiles.join('\n');
      if (reviewedFiles.length>200||fileList.length>24000) throw new Error('This change affects too many files to review here. Use Source Control to review it.');
      const syncDetail=reminderSnapshot.length?`Earlier sync reminders will be kept. Zero will not sync this correction until you review them.${current.remote?'':' Connect GitHub to sync later.'}`:missing?'GitHub reported this branch missing. The correction will be saved locally; review branch creation before syncing.':current.remote?'Zero will try to sync only the new correction commit to GitHub; a failed sync keeps local recovery and Zero attempts to keep a reminder.':'This correction will be saved locally. Connect GitHub to sync it later.';
      const detail=`Undo ${plan.name} on ${plan.branch} with a new correction commit. Later work and earlier Git history remain. ${syncDetail} Run your app after undoing.\n\nFiles affected:\n${fileList}\n\nClose other editors and Git processes first. The operation is not atomic; inverse and project recovery copies are retained if interrupted. Windows is not supported yet.`;
      if (await vscode.window.showWarningMessage('Undo this finished change?',{modal:true,detail},'Undo change')!=='Undo change') return;
      await guard();if(!(await core.git(root,['var','GIT_AUTHOR_IDENT'])).trim().startsWith(`${author[1]} <${author[2]}> `))throw new Error('Git identity changed. Review the undo again.');
      const result=await retainedLocalPhase(root,binding=>withReminderProvenance(root,binding,async(tx,composite)=>{
        undoTx=tx;try {
          if(missing)missingIntent=await rememberPush({root,remote:current.remote,page:current.page,branch:current.branch,head:current.head,committed:false,pushStarted:false,kind:'remote-missing'},missing.account,tx);
          const inverse=await changeUndo.prepareCorrection(plan,{confirmed:true,binding:composite});inversePath=inverse.recoveryPath;
          target=await projectRestore.reviewInverseCorrection(inverse,{binding:composite});
          if(target.head!==current.head||JSON.stringify(target.files.map(file=>file.name).sort())!==JSON.stringify(reviewedFiles))throw new Error('The inverse file list changed. Review the undo again.');
          const prepared=await projectRestore.prepareProjectRestore(target,{name:author[1],email:author[2],binding:composite});target=undefined;restorePath=prepared.recoveryPath;
          const retained=await projectRestore.retainPreparedProjectRestore(prepared);
          undoIntent=await rememberLocalCommit(root,current.branch,retained.commit,{operation:'undo',recoveryPath:retained.recoveryPath},tx);
          const result=await projectRestore.applyRetainedProjectRestore(retained);applied=true;return result;
        } finally {undoTx=undefined;}
      }));
      output.appendLine(`Undo inverse recovery: ${inversePath}\nUndo project recovery: ${restorePath}`);
      if(reminderSnapshot.length||(await reminders()).some(record=>record.id!==undoIntent.id&&record.id!==missingIntent?.id))report('Undo committed locally · review earlier sync',`Correction commit: ${result.commit}. Earlier reminders are kept. Inverse recovery: ${inversePath}. Project recovery: ${restorePath}. Run your app.`);
      else if(current.remote)await syncCreatedBranch(root,{branch:current.branch,head:result.commit},current.remote,current.page,{updated:true,expectedAccount:undoAccount,localRecordOnly:undoIntent,correction:{label:'Undo committed',detail:`Correction commit: ${result.commit}. Inverse recovery: ${inversePath}. Project recovery: ${restorePath}.`},extraGuard:async(tx,ownAttempt)=>{let records=await reminders(tx);if(ownAttempt){const observed=records.find(record=>record.id===ownAttempt.id);if((observed&&JSON.stringify(observed)!==JSON.stringify(ownAttempt))||(!tx&&!observed))throw new Error('The correction sync attempt changed. Inspect recovery copies before retrying.');records=records.filter(record=>record.id!==ownAttempt.id);}if(records.length!==1||JSON.stringify(records[0])!==JSON.stringify(undoIntent))throw new Error('The undo intent or earlier sync reminders changed. Inspect recovery copies before syncing.');}});
      else report('Undo committed locally · connect GitHub to sync',`Correction commit: ${result.commit}. Inverse recovery: ${inversePath}. Project recovery: ${restorePath}. Run your app after undoing.`);
      await refreshNativeGit(root);studentExplorer?.invalidate();
    } catch(error) {
      if(applied)error.message+=' The undo correction was applied locally; inspect project history before continuing and run your app.';
      if(inversePath)error.message+=` Inverse recovery: ${inversePath}.`;
      if(restorePath)error.message+=` Project recovery: ${restorePath}.`;
      if(error.lockRecoveryPath)error.message+=` Lock requiring inspection: ${error.lockRecoveryPath}.`;
      if(error.additionalLockRecoveryPath)error.message+=` Additional lock requiring inspection: ${error.additionalLockRecoveryPath}.`;
      if(error.recoveryPath)error.message+=` Recovery requiring inspection: ${error.recoveryPath}.`;
      throw error;
    } finally {if(target)projectRestore.cancelProjectRestore(target);maintenanceBusy=false;await repositoryStatus();refresh();}
  }
  async function restoreProjectVersion(id) {
    if (isBusy()) return;
    await settleBranchCheck();if(isBusy())return;
    const missing=observedMissing(projectRoot);
    maintenanceBusy=true;refresh();
    let plan, recoveryPath, applied=false;
    try {
      const root=await project();
      await lessonProjects.assertShareable(root);
      if (uploadMode(root)!=='live') return simulation('Restore project version');
      throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
      if (process.platform==='win32') throw new Error('Project restore is not supported on Windows yet. No restore was started.');
      let expectedBranch,restoreIntent,missingIntent,allowedLocal,restoreTx,current;
      const guard=async()=>{
        await assertGitProject(root);
        if (expectedBranch && (await core.currentBranch(root,core.git)).trim()!==expectedBranch) throw new Error('The branch changed. Review the version again.');
        if (expectedBranch && ((await pushRecords(root,expectedBranch,restoreTx)).some(record=>record.id!==missingIntent?.id) || JSON.stringify((await localRecords(root,expectedBranch,restoreTx)).filter(record=>record.id!==restoreIntent?.id))!==JSON.stringify(allowedLocal))) throw new Error('An earlier sync needs attention. Review it before restoring a version.');
        if(missing&&current)assertMissingPlan(missing,current);
        if (vscode.workspace.isTrusted!==true) throw new Error('Trust your project before restoring a version.');
        const folders=vscode.workspace.workspaceFolders||[];
        if (folders.length!==1 || folders[0].uri.scheme!=='file' || await fs.realpath(folders[0].uri.fsPath)!==root) throw new Error('Open the original standalone project to restore a version.');
        if ((vscode.workspace.textDocuments||[]).some(document=>document.isDirty && document.uri?.scheme==='file')) throw new Error('Save your open files before restoring a version. Your edits are kept.');
        if (await workflow.readRecovery?.(root)) throw new Error('Finish or cancel the pending update before restoring a version.');
      };
      await guard();
      current=await github.prepareLocalCommit(root);expectedBranch=current.branch;assertMissingPlan(missing,current);
      const restoreAccount=auth.accountId||null;
      allowedLocal=(await localRecords(root,current.branch));
      if ((await pushRecords(root,current.branch)).length) throw new Error('Review the earlier sync or local commit before restoring a version.');
      for(const record of allowedLocal) {
        // An interrupted restore intent may name an unapplied commit. It needs
        // journal inspection, even if its object happens to be in history.
        if(record.operation || record.remote || !await includesSavedCommit(root,record.head,current.head)) throw new Error('Review the earlier sync or local commit before restoring a version.');
      }
      await guard();
      const ident=await core.git(root,['var','GIT_AUTHOR_IDENT']);
      const match=/^(.+) <([^<>]+)> [0-9]+ [+-][0-9]{4}$/.exec(ident.trim());
      if (!match) throw new Error('Configure your Git name and email before restoring a version.');
      plan=await projectRestore.reviewProjectRestore(root,id,{beforeMutation:guard});
      if (plan.head!==current.head) throw new Error('History changed. Review the version again.');
      // The modal must show every path; refuse instead of truncating a large review.
      const files=plan.files.map(file=>`${file.kind}: ${file.name}`).join('\n');
      if (plan.files.length>200 || files.length>24000) throw new Error('This version affects too many files to review here. Use Source Control to review it.');
      const syncDetail=allowedLocal.length?`Earlier local sync reminders will be kept. Zero will not sync this version until you review them.${current.remote?'':' Connect GitHub to sync later.'}`:missing?'GitHub reported this branch missing. The new commit will be saved locally; review branch creation before syncing.':current.remote?'Zero will try to sync the new commit to GitHub. If sync fails, Zero attempts to keep a reminder; inspect recovery copies after an interruption.':'This version will be saved locally. Connect GitHub to sync it later.';
      const detail=`Restore the complete project to commit ${id}. A new local commit will be created on ${current.branch}; earlier history remains. ${syncDetail} Run your app after restoring.\n\nFiles affected:\n${files||'(no file changes)'}\n\nKeep other editors and Git processes closed during the restore. The operation is not atomic; recovery copies are retained if interrupted. Windows is not supported yet.`;
      if (await vscode.window.showWarningMessage('Restore this project version?',{modal:true,detail},'Restore version')!=='Restore version') return;
      await guard();
      if (!(await core.git(root,['var','GIT_AUTHOR_IDENT'])).trim().startsWith(`${match[1]} <${match[2]}> `)) throw new Error('Git identity changed. Review the version again.');
      const result=await retainedLocalPhase(root,binding=>withReminderProvenance(root,binding,async(tx,composite)=>{
        restoreTx=tx;try{
        if(missing)missingIntent=await rememberPush({root,remote:current.remote,page:current.page,branch:current.branch,head:current.head,committed:false,pushStarted:false,kind:'remote-missing'},missing.account,tx);
        const prepared=await projectRestore.prepareProjectRestore(plan,{name:match[1],email:match[2],binding:composite});plan=undefined;recoveryPath=prepared.recoveryPath;
        const retained=await projectRestore.retainPreparedProjectRestore(prepared);
        // Save the intended commit before applying it. If interrupted, the reminder
        // may refer to an unapplied commit and must be reviewed with the journal.
        restoreIntent=await rememberLocalCommit(root,current.branch,retained.commit,{operation:'restore',recoveryPath:retained.recoveryPath},tx);
        const result=await projectRestore.applyRetainedProjectRestore(retained);applied=true;return result;
        }finally{restoreTx=undefined;}
      })).catch(error=>{if(applied){if(error.recoveryPath){error.lockRecoveryPath=error.recoveryPath;delete error.recoveryPath;}}throw error;});
      output.appendLine(`Project restore recovery: ${result.recoveryPath}`);
      if ((await pushRecords(root,current.branch)).some(record=>record.id!==missingIntent?.id) || (await localRecords(root,current.branch)).some(record=>record.id!==restoreIntent.id)) report('Project restored locally · review earlier sync',`Recovery copies: ${result.recoveryPath}. Review the earlier sync before uploading. Run your app.`);
      else if (current.remote) await syncCreatedBranch(root,{branch:current.branch,head:result.commit},current.remote,current.page,{updated:true,expectedAccount:restoreAccount,localRecordOnly:restoreIntent,correction:{label:'Project version restored',detail:`Restore commit: ${result.commit}. Recovery copies: ${result.recoveryPath}.`},extraGuard:async(tx,ownAttempt)=>{let records=[...(await pushRecords(root,current.branch,tx)),...(await localRecords(root,current.branch,tx))];if(ownAttempt){const observed=records.find(record=>record.id===ownAttempt.id);if((observed&&JSON.stringify(observed)!==JSON.stringify(ownAttempt))||(!tx&&!observed))throw new Error('The restore sync attempt changed. Inspect recovery copies before retrying.');records=records.filter(record=>record.id!==ownAttempt.id);}if(records.length!==1||JSON.stringify(records[0])!==JSON.stringify(restoreIntent))throw new Error('The restore intent or earlier sync reminders changed. Inspect recovery copies before syncing.');}});
      else report('Project version restored locally · connect GitHub to sync',`Restored as commit ${result.commit}. Recovery copies: ${result.recoveryPath}. Run your app, then connect GitHub to sync.`);
      await refreshNativeGit(root);studentExplorer?.invalidate();
    } catch(error) {
      if(applied)error.message+=' The restore was applied locally; inspect project history before continuing and run your app.';
      const location=recoveryPath||error.recoveryPath;
      if(error.recoveryPath&&location!==error.recoveryPath)error.message+=` Additional recovery location: ${error.recoveryPath}.`;
      if(error.lockRecoveryPath)error.message+=` Lock requiring inspection: ${error.lockRecoveryPath}.`;
      if (location) {output.appendLine(`Project restore recovery: ${location}`);error.message+=` Recovery copies: ${location}. Inspect recovery copies before continuing.`;}
      throw error;
    } finally {
      if(plan)projectRestore.cancelProjectRestore(plan);
      maintenanceBusy=false;await repositoryStatus();refresh();
    }
  }
  actions['zero.discardProjectChanges']=async()=>{
    if (isBusy()) return;
    maintenanceBusy=true;refresh();
    let recoveryPath;
    try {
      const root=await project();await lessonProjects.assertShareable(root);
      if (uploadMode(root)!=='live') return simulation('Discard project changes');
      throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
      if (process.platform==='win32') throw new Error('Discard project changes is not supported on Windows yet. No discard was started.');
      let unborn=false;const guard=async()=>{
        let markerMissing=false;if(unborn)try{await fs.lstat(path.join(root,'zero.json'));}catch(error){if(error.code!=='ENOENT')throw error;markerMissing=true;}
        if(markerMissing){if(disposed||uploadMode(root)!=='live'||await recoveryProject()!==root)throw new Error('The student project changed. Review this step again.');}else await assertGitProject(root);
        if (vscode.workspace.isTrusted!==true) throw new Error('Trust your project before discarding changes.');
        const folders=vscode.workspace.workspaceFolders||[];
        if (folders.length!==1 || folders[0].uri.scheme!=='file' || await fs.realpath(folders[0].uri.fsPath)!==root) throw new Error('Open the original standalone project to discard changes.');
        if ((vscode.workspace.textDocuments||[]).some(document=>document.isDirty && document.uri?.scheme==='file')) throw new Error('Save your open files before discarding changes. Your edits are kept.');
        if (await workflow.readRecovery?.(root)) throw new Error('Finish or cancel the pending update before discarding changes.');
      };
      await guard();const status=await readStudentFileStatus(root,{safeConfig:true,standaloneOnly:true});unborn=status.hasCommittedHead===false;
      if(unborn&&status.verifiedUnbornHead!==true)throw new Error('The initial project state could not be verified. Inspect the repository in Source Control.');
      const plan=await (unborn?unbornDiscard.previewUnbornDiscard:discardPreview.previewDiscard)(root,{beforeMutation:guard});
      const files=plan.files.map(file=>`${unborn?({'??':'untracked','A ':'staged addition','AM':'staged addition with working edits','AD':'staged addition, working file already missing'}[file.status]):file.kind}: ${file.name}`).join('\n');
      if (plan.files.length>200 || files.length>24000) throw new Error('Too many changed files to review here. Use Source Control to review them.');
      const description=unborn?`This project has no first commit. Discard will remove every present file listed below, including initial project files, and remove listed staged additions. Files already missing stay missing. ${plan.indexPresent?'The original index is retained in recovery; the remaining index will be empty.':'No index exists, and none will be created.'} Ignored files and parent folders stay in place. Removing ignore rules such as .gitignore may make those files appear as untracked changes. Recovery copies of working and staged files are retained. Use the Command Palette → Zero: Inspect recovery copies → File restoration and initial project discard to inspect them.`:'Discard these project changes and return tracked files and the index to the current commit. Untracked files in this list will be removed. Ignored files are excluded. Recovery copies are retained.';
      const detail=`${description}\n\nFiles affected:\n${files}\n\nClose other editors and Git processes first. This operation is not atomic; if interrupted, inspect the project and recovery copies before continuing.`;
      if (await vscode.window.showWarningMessage('Discard all project changes?',{modal:true,detail},'Discard changes')!=='Discard changes') return;
      if(unborn)await unbornDiscard.revalidateUnbornDiscard(plan);
      let applied=false;
      const result=await retainedLocalPhase(root,async binding=>{
        const backup=await (unborn?unbornDiscard.backupUnbornDiscard:discardPreview.backupDiscard)(plan,{binding});recoveryPath=backup.recovery;
        const result=await (unborn?unbornDiscard.applyUnbornDiscard:discardPreview.applyDiscard)(backup,{confirmed:true});applied=true;return result;
      }).catch(error=>{if(applied){if(error.recoveryPath){if(!error.lockRecoveryPath)error.lockRecoveryPath=error.recoveryPath;else if(!error.additionalLockRecoveryPath)error.additionalLockRecoveryPath=error.recoveryPath;else error.lockCleanupFailures=[...(error.lockCleanupFailures||[]),{path:error.recoveryPath,error}];delete error.recoveryPath;}error.message+=' The discard was applied locally; inspect project files before continuing.';}throw error;});
      output.appendLine(`${unborn?'File restoration recovery':'Discard recovery'}: ${result.recovery}`);
      await refreshNativeGit(root);studentExplorer?.invalidate();
      report('Project changes discarded',`Recovery copies: ${result.recovery}.`);
    } catch(error) {
      const location=recoveryPath||error.recoveryPath;
      if(error.recoveryPath&&location!==error.recoveryPath)error.message+=` Additional recovery location: ${error.recoveryPath}.`;
      for(const lock of new Set([error.lockRecoveryPath,error.additionalLockRecoveryPath,...(error.lockCleanupFailures||[]).map(item=>item.path)].filter(value=>typeof value==='string'&&value)))error.message+=` Lock requiring inspection: ${lock}.`;
      if (location) {output.appendLine(`Discard recovery: ${location}`);error.message+=` Recovery copies: ${location}. Inspect recovery copies before continuing.`;}
      throw error;
    } finally {maintenanceBusy=false;studentExplorer?.invalidate();await repositoryStatus();refresh();}
  };
  actions['zero.reviewInterruptedRefOnlyUpdate']=async()=>{
    if(!ENABLE_REF_ONLY_REVIEW)throw new Error('Review of this interrupted update is not available yet. Keep the reminder and inspect Source Control.');
    if(isBusy())return;changing=true;refresh();
    try {
      const root=await project();await assertGitProject(root);if(!repositoryLedger||!await supportsFileReminders(root))throw new Error('Shared sync reminders are unavailable. Inspect Source Control.');
      const ticket=await auth.capture(),rows=await allReminderRecords(root),pending=rows.filter(row=>row.operation==='reftable-ref-only'&&row.kind==='ref-pending'&&row.accountId===ticket.session.accountId);
      if(pending.length!==1)throw new Error('The interrupted update cannot be uniquely identified. Inspect Source Control and the retained reminders.');
      const workspaceNow=()=>(vscode.workspace.workspaceFolders||[]).map(folder=>[folder.uri.scheme,folder.uri.fsPath]),dirtyNow=()=>(vscode.workspace.textDocuments||[]).filter(document=>document.isDirty&&document.uri?.scheme==='file').map(document=>({document,name:document.uri.fsPath,version:document.version})),sameDirty=(a,b)=>a.length===b.length&&a.every((item,i)=>item.document===b[i].document&&item.name===b[i].name&&item.version===b[i].version);let authority;
      const guard=async()=>{const workspace=workspaceNow(),dirty=dirtyNow();await assertGitProject(root);if(vscode.workspace.isTrusted!==true)throw new Error('Trust the project before reviewing this update.');if((await dirtyProjectDocuments(vscode,root)).length)throw new Error('Save or undo project edits before reviewing this update.');await auth.assertCurrent(ticket);if(JSON.stringify(workspace)!==JSON.stringify(workspaceNow())||!sameDirty(dirty,dirtyNow()))throw new Error('The workspace or open files changed. Review again.');authority={workspace,dirty};};
      const guardNow=()=>{assertGitProjectNow(root);if(vscode.workspace.isTrusted!==true)throw new Error('Trust the project before reviewing this update.');auth.assertCurrentNow(ticket);if(!authority||JSON.stringify(authority.workspace)!==JSON.stringify(workspaceNow())||!sameDirty(authority.dirty,dirtyNow()))throw new Error('The workspace or open files changed. Review again.');};
      const identityBinding=require('./ref-only-remote-identity').createRefOnlyIdentityBinding({identify:repositoryIdentity,assertSame:assertRepositoryIdentity});
      const remoteRead=async record=>{await guard();const access=await repositories.access(record.page,{ticket,permissions:{contents:'read'}});await guard();const identity=identityBinding.observe(access),transport=createTransport(record.remote,async()=>{await guard();await auth.assertCurrent(ticket);const current=await repositories.access(record.page,{ticket,permissions:{contents:'read'}});assertRepositoryIdentity(identity,current);await guard();return auth.assertCurrent(ticket);},{assertCurrentNow:()=>{guardNow();return auth.assertCurrentNow(ticket);}});const ref=`refs/heads/${record.branch}`,raw=await transport(root,['ls-remote','--heads',record.remote,ref]);await guard();guardNow();const lines=String(raw).trim().split('\n').filter(Boolean);if(!lines.length)return null;if(lines.length!==1)throw new Error('GitHub branch could not be reviewed.');const match=/^([a-f0-9]{40}|[a-f0-9]{64})\t(.+)$/.exec(lines[0]);if(!match||match[2]!==ref)throw new Error('GitHub branch could not be reviewed.');return match[1];};
      await guard();const review=require('./reftable-ref-only-review'),plan=await review.reviewRefOnly({root,ledger:repositoryLedger,intentId:pending[0].id,accountId:ticket.session.accountId,beforeReview:guard,beforeReviewNow:guardNow,remoteRead});const detail=`Branch: ${plan.branch}\nOriginal commit: ${plan.sourceHead}\nIntended commit: ${plan.targetHead}\nCurrent local commit: ${plan.localHead}\nObserved GitHub branch: ${plan.remoteHead||'missing'}\nCompletion acknowledgement: ${plan.acknowledged?'recorded':'not recorded'}\n\nThis record cannot prove whether this update moved the branch or whether GitHub received a push. The GitHub observation may change. Marking reviewed removes only these update reminders; other reminders stay. No project files, commits or GitHub branches are changed.`;
      if(await vscode.window.showWarningMessage('Review interrupted update?',{modal:true,detail},'Mark reviewed')!=='Mark reviewed')return;await guard();await review.resolveRefOnly(plan);await repositoryStatus();report('Interrupted update reviewed','The update reminders were reviewed. GitHub receipt was not inferred.');
    }finally{changing=false;refresh();}
  };
  actions['zero.restoreDeletedFile']=async selection=>{
    throw new Error('Restoring deleted files here is temporarily unavailable. Use Source Control or the full Explorer to manage your files.');
    if(isBusy())return;maintenanceBusy=true;refresh();let recoveryPath;
    try {
      const root=await project();await lessonProjects.assertShareable(root);
      if(!selection||selection.root!==root||typeof selection.relative!=='string')throw new Error('The project view changed. Select the deleted file again.');
      if(uploadMode(root)!=='live')return simulation('Restore deleted file');
      if(process.platform==='win32')throw new Error('Restoring a deleted file is not supported on Windows yet.');
      const guard=async()=>{
        await assertGitProject(root);
        if(vscode.workspace.isTrusted!==true)throw new Error('Trust your project before restoring a deleted file.');
        const folders=vscode.workspace.workspaceFolders||[];
        if(folders.length!==1||folders[0].uri.scheme!=='file'||await fs.realpath(folders[0].uri.fsPath)!==root)throw new Error('Open the original standalone project to restore a deleted file.');
        if((vscode.workspace.textDocuments||[]).some(document=>document.isDirty&&document.uri?.scheme==='file'))throw new Error('Save your open files before restoring a deleted file. Your edits are kept.');
        if(await workflow.readRecovery?.(root))throw new Error('Finish or cancel the pending update before restoring a deleted file.');
      };
      const plan=await discardPreview.previewDeletedFile(root,selection.relative,{beforeMutation:guard});
      if(plan.source!=='index')throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
      const source=plan.source==='index'?'Restore the staged version. The index stays unchanged.':'Restore the version from the current commit and undo this file’s staged deletion.';
      if(plan.name.length+(plan.parentFolders||[]).join(', ').length>24000)throw new Error('The folder list is too long to review here. Use Source Control.');
      const folders=plan.parentFolders?.length?` Missing folders will be created: ${plan.parentFolders.join(', ')}.`:'';
      const detail=`${plan.name}\n\n${source}${folders} Other project changes stay in place. Zero retains recovery copies and records folder creation. Close other editors and Git processes first. This operation is not atomic; if interrupted, inspect the project and recovery copies before continuing.`;
      if(await vscode.window.showWarningMessage('Restore this deleted file?',{modal:true,detail},'Restore file')!=='Restore file')return;
      let applied=false;
      const result=await retainedLocalPhase(root,async binding=>{
        const backup=await discardPreview.backupDeletedFile(plan,{binding});recoveryPath=backup.recovery;
        const restored=await discardPreview.applyDeletedFile(backup,{confirmed:true});applied=true;return restored;
      }).catch(error=>{if(applied){if(error.recoveryPath){error.lockRecoveryPath=error.recoveryPath;delete error.recoveryPath;}error.message+=' The file was restored locally; inspect the project before continuing.';}throw error;});
      output.appendLine(`File restoration recovery: ${result.recovery}`);await refreshNativeGit(root);studentExplorer?.invalidate();
      report('Deleted file restored',`Recovery copies: ${result.recovery}.`);
    } catch(error) {
      const location=recoveryPath||error.recoveryPath;
      if(error.recoveryPath&&location!==error.recoveryPath)error.message+=` Additional recovery location: ${error.recoveryPath}.`;
      if(error.lockRecoveryPath)error.message+=` Lock requiring inspection: ${error.lockRecoveryPath}.`;
      if(error.additionalLockRecoveryPath)error.message+=` Additional lock requiring inspection: ${error.additionalLockRecoveryPath}.`;
      if(location){output.appendLine(`File restoration recovery: ${location}`);error.message+=` Recovery copies: ${location}. Inspect recovery copies before continuing.`;}
      throw error;
    } finally {maintenanceBusy=false;studentExplorer?.invalidate();await repositoryStatus();refresh();}
  };
  actions['zero.restoreModifiedFile']=async selection=>{
    if(isBusy())return;maintenanceBusy=true;refresh();let recoveryPath;
    try {
      const root=await project();await lessonProjects.assertShareable(root);
      if(!selection||selection.root!==root||typeof selection.relative!=='string')throw new Error('The project view changed. Select the modified file again.');
      if(uploadMode(root)!=='live')return simulation('Restore staged version');
      throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
      if(process.platform==='win32')throw new Error('Restoring a file is not supported on Windows yet.');
      const guard=async()=>{
        await assertGitProject(root);
        if(vscode.workspace.isTrusted!==true)throw new Error('Trust your project before restoring a file.');
        const folders=vscode.workspace.workspaceFolders||[];
        if(folders.length!==1||folders[0].uri.scheme!=='file'||await fs.realpath(folders[0].uri.fsPath)!==root)throw new Error('Open the original standalone project to restore a file.');
        if((vscode.workspace.textDocuments||[]).some(document=>document.isDirty&&document.uri?.scheme==='file'))throw new Error('Save your open files before restoring a file. Your edits are kept.');
        if(await workflow.readRecovery?.(root))throw new Error('Finish or cancel the pending update before restoring a file.');
      };
      const plan=await discardPreview.previewModifiedFile(root,selection.relative,{beforeMutation:guard});
      if(plan.name.length>24000)throw new Error('The file path is too long to review here. Use Source Control.');
      const detail=`${plan.name}\n\nReplace this file’s current working copy with its staged version. Any staged changes and other project changes stay in place. Zero retains recovery copies of the current file. Close other editors and Git processes first. This operation is not atomic; if interrupted, inspect the project and recovery copies before continuing.`;
      if(await vscode.window.showWarningMessage('Restore the staged version of this file?',{modal:true,detail},'Restore file')!=='Restore file')return;
      let applied=false;
      const result=await retainedLocalPhase(root,async binding=>{
        const backup=await discardPreview.backupModifiedFile(plan,{binding});recoveryPath=backup.recovery;
        const restored=await discardPreview.applyModifiedFile(backup,{confirmed:true});applied=true;return restored;
      }).catch(error=>{if(applied){if(error.recoveryPath){error.lockRecoveryPath=error.recoveryPath;delete error.recoveryPath;}error.message+=' The file was restored locally; inspect the project before continuing.';}throw error;});
      output.appendLine(`File restoration recovery: ${result.recovery}`);await refreshNativeGit(root);studentExplorer?.invalidate();
      report('File restored to staged version',`Recovery copies: ${result.recovery}.`);
    } catch(error) {
      const location=recoveryPath||error.recoveryPath;
      if(error.recoveryPath&&location!==error.recoveryPath)error.message+=` Additional recovery location: ${error.recoveryPath}.`;
      if(error.lockRecoveryPath)error.message+=` Lock requiring inspection: ${error.lockRecoveryPath}.`;
      if(error.additionalLockRecoveryPath)error.message+=` Additional lock requiring inspection: ${error.additionalLockRecoveryPath}.`;
      if(location){output.appendLine(`File restoration recovery: ${location}`);error.message+=` Recovery copies: ${location}. Inspect recovery copies before continuing.`;}
      throw error;
    } finally {maintenanceBusy=false;studentExplorer?.invalidate();await repositoryStatus();refresh();}
  };
  actions['zero.restoreCommittedFile']=async selection=>{
    if(isBusy())return;maintenanceBusy=true;refresh();let recoveryPath;
    try {
      const root=await project();await lessonProjects.assertShareable(root);
      if(!selection||selection.root!==root||typeof selection.relative!=='string')throw new Error('The project view changed. Select the staged file again.');
      if(uploadMode(root)!=='live')return simulation('Restore committed version');
      throw new Error('This operation is temporarily unavailable while Zero improves recovery safety. Your project files and commits are kept.');
      if(process.platform==='win32')throw new Error('Restoring a file is not supported on Windows yet.');
      const guard=async()=>{
        await assertGitProject(root);
        if(vscode.workspace.isTrusted!==true)throw new Error('Trust your project before restoring a file.');
        const folders=vscode.workspace.workspaceFolders||[];
        if(folders.length!==1||folders[0].uri.scheme!=='file'||await fs.realpath(folders[0].uri.fsPath)!==root)throw new Error('Open the original standalone project to restore a file.');
        if((vscode.workspace.textDocuments||[]).some(document=>document.isDirty&&document.uri?.scheme==='file'))throw new Error('Save your open files before restoring a file. Your edits are kept.');
        if(await workflow.readRecovery?.(root))throw new Error('Finish or cancel the pending update before restoring a file.');
      };
      const plan=await discardPreview.previewCommittedFile(root,selection.relative,{beforeMutation:guard});
      if(plan.name.length>24000)throw new Error('The file path is too long to review here. Use Source Control.');
      const detail=`${plan.name}\n\nReplace this file’s working copy with its current committed version and remove this file’s staged change. Any unstaged changes to this file are also replaced. Other project and staged changes stay in place. Zero retains recovery copies of the working file, staged version and original index. Close other editors and Git processes first. This operation is not atomic; if interrupted, inspect the project and recovery copies before continuing.`;
      if(await vscode.window.showWarningMessage('Restore the committed version of this file?',{modal:true,detail},'Restore file')!=='Restore file')return;
      let applied=false;
      const result=await retainedLocalPhase(root,async binding=>{
        const backup=await discardPreview.backupCommittedFile(plan,{binding});recoveryPath=backup.recovery;
        const restored=await discardPreview.applyCommittedFile(backup,{confirmed:true});applied=true;return restored;
      }).catch(error=>{if(applied){if(error.recoveryPath){error.lockRecoveryPath=error.recoveryPath;delete error.recoveryPath;}error.message+=' The file was restored locally; inspect the project before continuing.';}throw error;});
      output.appendLine(`File restoration recovery: ${result.recovery}`);await refreshNativeGit(root);studentExplorer?.invalidate();
      report('File restored to committed version',`Recovery copies: ${result.recovery}.`);
    } catch(error) {
      const location=recoveryPath||error.recoveryPath;
      if(error.recoveryPath&&location!==error.recoveryPath)error.message+=` Additional recovery location: ${error.recoveryPath}.`;
      if(error.lockRecoveryPath)error.message+=` Lock requiring inspection: ${error.lockRecoveryPath}.`;
      if(error.additionalLockRecoveryPath)error.message+=` Additional lock requiring inspection: ${error.additionalLockRecoveryPath}.`;
      if(location){output.appendLine(`File restoration recovery: ${location}`);error.message+=` Recovery copies: ${location}. Inspect recovery copies before continuing.`;}
      throw error;
    } finally {maintenanceBusy=false;studentExplorer?.invalidate();await repositoryStatus();refresh();}
  };
  actions['zero.removeAddedFile']=async selection=>{
    throw new Error('Removing files here is temporarily unavailable. Use Source Control or the full Explorer to manage your files.');
    if(isBusy())return;maintenanceBusy=true;refresh();let recoveryPath,staged=false,failed=false;
    try{
      const root=await project();await lessonProjects.assertShareable(root);
      if(!selection||selection.root!==root||typeof selection.relative!=='string')throw new Error('The project view changed. Select the added file again.');
      if(uploadMode(root)!=='live')return simulation('Remove added file');
      const verifyHelper=()=>context.extensionMode===1?(ENABLE_PACKAGED_UNTRACKED_REMOVAL?require('./added-removal-packaged-helper').verifiedAddedRemovalPackagedHelper(context):Promise.reject(new Error('Untracked-file removal is unavailable here. Use Source Control; your files are kept.'))):(ENABLE_DEV_UNTRACKED_REMOVAL?require('./added-removal-dev-helper').verifiedAddedRemovalDevHelper(context):Promise.reject(new Error('Untracked-file removal is temporarily unavailable; your files are kept.')));
      const helper=await verifyHelper(),sessionRevision=auth.revision,selected=path.resolve(root,...selection.relative.split('/'));
      const guardNow=()=>{assertGitProjectNow(root);if(vscode.workspace.isTrusted!==true||auth.revision!==sessionRevision)throw new Error('The project or sign-in changed. Review the file again.');const folders=vscode.workspace.workspaceFolders||[];if(folders.length!==1||folders[0].uri.scheme!=='file'||folders[0].uri.fsPath!==root)throw new Error('Open the original standalone project to remove this file.');for(const document of vscode.workspace.textDocuments||[]){if(!document.isDirty||document.uri?.scheme!=='file'||!document.uri.fsPath)continue;let candidate;try{try{candidate=fsSync.realpathSync(document.uri.fsPath);}catch(error){if(error.code!=='ENOENT')throw error;candidate=path.join(fsSync.realpathSync(path.dirname(document.uri.fsPath)),path.basename(document.uri.fsPath));}}catch{throw new Error('An open file could not be checked. Save or close it before continuing.');}if(candidate===selected)throw new Error('Save or undo this file’s open edits before removing it. Your edits are kept.');}};
      const guard=async()=>{await assertGitProject(root);guardNow();const current=await verifyHelper();if(current.helperPath!==helper.helperPath||current.helperSha256!==helper.helperSha256)throw new Error('The removal helper changed. Review the file again.');guardNow();};
      await guard();if(await workflow.readRecovery?.(root))throw new Error('Finish or cancel the pending update before removing a file.');
      const status=await readStudentFileStatus(root,{safeConfig:true,standaloneOnly:true}),code=status.statusCodes?.get(selection.relative);staged=['A ','AM'].includes(code);if(staged&&status.hasCommittedHead!==true)throw new Error('Staged additions can be removed after the first commit can be verified. Your file and index are kept.');if(code!=='??'&&(!staged||!ENABLE_STAGED_ADDED_REMOVAL))throw new Error('Only untracked files can be removed here. Use Source Control for staged files.');
      const primitive=require(staged?'./added-removal-staged-prototype':'./added-removal-untracked-prototype');
      const plan=await (staged?primitive.previewStagedRemoval:primitive.previewUntrackedRemoval)(root,selection.relative,{beforeMutation:guard,beforeMutationNow:guardNow});
      const detail=staged?`${plan.path}\n\nRemove this staged addition and its working file. Zero retains separate copies of the staged content, working file, and original index. An open editor may still change the displaced file. The index is briefly absent during this non-atomic operation. Close other editors and Git processes first. If interrupted, preserve the entire recovery folder, avoid Git and Source Control operations, and seek help inspecting the retained indexes.`:`${plan.path}\n\nRemove this untracked file from the project. Zero retains an independent copy and the displaced file; an open editor may still change the displaced copy. The Git index stays unchanged. Other unsaved files are outside this review. Close other editors and Git processes first. This operation is not atomic; if interrupted, use Inspect recovery copies → Untracked-file removal and keep both copies.`;
      if(await vscode.window.showWarningMessage(staged?'Remove this staged addition?':'Remove this untracked file?',{modal:true,detail},'Remove file')!=='Remove file')return;
      await guard();if(await workflow.readRecovery?.(root))throw new Error('Finish or cancel the pending update before removing a file.');
      const result=await (staged?primitive.removeReviewedStaged:primitive.removeReviewedUntracked)(plan,{confirmed:true,...helper});recoveryPath=result.recoveryPath;output.appendLine(`${staged?'Staged':'Untracked'}-file removal recovery: ${result.recoveryPath}`);await refreshNativeGit(root);studentExplorer?.invalidate();report(staged?'Staged addition removed':'Untracked file removed',`Recovery copies: ${result.recoveryPath}. An open editor may still change the displaced copy.`);
    }catch(error){failed=true;const location=recoveryPath||error.recoveryPath;recoveryPath=location;for(const lock of new Set([error.lockRecoveryPath,error.retainedLockPath,error.indexLockRecovery,error.indexRetainedPath].filter(value=>typeof value==='string'&&value)))error.message+=` Location requiring inspection: ${lock}.`;if(location){output.appendLine(`${staged?'Staged':'Untracked'}-file removal recovery: ${location}`);error.message+=staged?` Recovery copies: ${location}. Preserve the folder, avoid Git and Source Control operations, and seek help inspecting the retained indexes.`:` Recovery copies: ${location}. Use Inspect recovery copies → Untracked-file removal before continuing.`;}throw error;
    }finally{maintenanceBusy=false;if(!(staged&&failed&&recoveryPath)){studentExplorer?.invalidate();await repositoryStatus();refresh();}}
  };
  history=createChangeHistory(vscode,{project,output,onUndo:undoFinishedChange,onRestore:restoreProjectVersion});
  actions['zero.reviewChanges']=()=>isBusy()?undefined:history.openReview();
  actions['zero.changeHistory']=()=>isBusy()?undefined:history.openHistory();
  async function undoLocalCommit(current,selected) {
    const root=current.root,fullBranch=current.branch,short=fullBranch?.startsWith('refs/heads/')?fullBranch.slice('refs/heads/'.length):'';
    let remote='';
    // Missing evidence simply leaves the existing history-preserving restore
    // available. Only the authority may decide that rewrite is permitted.
    if(process.platform==='win32'||uploadMode(root)!=='live'||!short||selected.id!==current.head||(!repositoryLedger&&!pendingLedger.enumerable))return false;
    if(repositoryLedger&&!await supportsFileReminders(root))return false;
    try {
      const dot=path.join(root,'.git'),stat=await fs.lstat(dot),file=path.join(dot,'zero-commit-provenance.json'),info=await fs.lstat(file);
      if(!stat.isDirectory()||stat.isSymbolicLink()||!info.isFile()||info.isSymbolicLink()||info.size>16384)return false;
      const receipt=JSON.parse(await fs.readFile(file,'utf8'));
      if(receipt.version!==1||receipt.root!==root||receipt.branch!==short||receipt.head!==current.head||receipt.parent!==selected.parent||receipt.pushStarted!==false)return false;
      const names=(await core.git(root,['remote'])).trim();
      if(names){if(names!=='origin')return false;remote=core.parseRepositoryUrl(await core.git(root,['remote','get-url','origin'])).remote;}
      const lineage=(await core.git(root,['--no-replace-objects','rev-list','--parents','-n','1',current.head])).trim().split(' ');
      if(lineage.length!==2||lineage[0]!==current.head||lineage[1]!==selected.parent)return false;
    } catch {return false;}
    const initialPush=(await pushRecords(root,short)),initialLocal=(await localRecords(root,short));
    if(initialPush.some(record=>!remote||record.pushStarted!==false||record.operation||record.head!==current.head||record.remote!==remote)||initialLocal.some(record=>record.operation||record.remote||record.type!=='local'))return false;
    for(const record of initialLocal)if(record.head!==current.head&&!await includesSavedCommit(root,record.head,selected.parent))return false;
    const expectedPush=JSON.stringify(initialPush),expectedLocal=JSON.stringify(initialLocal);
    let undoTicket,undoTx,undoView;
    const checkProjectNow=()=>{
      assertGitProjectNow(root);
      if(undoTicket)auth.assertCurrentNow(undoTicket);
      const folders=vscode.workspace.workspaceFolders||[];
      if(vscode.workspace.isTrusted!==true||folders.length!==1||folders[0].uri.scheme!=='file'||fsSync.realpathSync(folders[0].uri.fsPath)!==root)throw new Error('The trusted project changed. Review the commit again.');
      if((vscode.workspace.textDocuments||[]).some(document=>document.isDirty&&document.uri?.scheme==='file'))throw new Error('Save your open files before undoing this commit. Your edits are kept.');
    };
    const checkNow=()=>{checkProjectNow();const view=repositoryLedger?undoView:splitReminders(compatibilityRecords(root,short),root,short);if(repositoryLedger){if(!undoTx)throw new Error('The sync reminder transaction expired. Review this commit again.');undoTx.assertCurrentNow();}if(!view||JSON.stringify(view.push)!==expectedPush||JSON.stringify(view.local)!==expectedLocal)throw new Error('Sync reminders changed. Review this commit again.');};
    const check=async()=>{await assertGitProject(root);checkProjectNow();undoView=await readReminders(root,short,undoTx);if(JSON.stringify(undoView.push)!==expectedPush||JSON.stringify(undoView.local)!==expectedLocal)throw new Error('Sync reminders changed. Review this commit again.');if(await workflow.readRecovery?.(root))throw new Error('Finish or cancel the pending update before undoing a commit.');
      for(const record of initialLocal)if(record.head!==current.head&&!await includesSavedCommit(root,record.head,selected.parent))throw new Error('The earlier local commit changed. Review it again.');if(undoTx)checkNow();else checkProjectNow();};
    let completed;
    try {
      await check();
      const detail=`Undo the latest local commit on ${short}. The branch will move to its parent; your files and staged changes stay as they are. A recovery reference keeps the removed commit. No upload occurs.\n\n${remote?'Zero will check the configured GitHub branch before undoing.':'Zero recorded this commit locally and found no configured remote.'} Another tool or copy may have shared it; do not use this if you know it was shared. Close other Zero windows for this project and keep other Git tools and editors closed.`;
      if(await vscode.window.showWarningMessage('Undo this local commit?',{modal:true,detail},'Undo local commit')!=='Undo local commit')return true;
      await check();
      let authority;
      if(remote){
        const ticket=await auth.capture();undoTicket=ticket;
        if(initialPush.some(record=>record.accountId&&record.accountId!==ticket.session.accountId))throw new Error('The GitHub account changed. Review the sync reminder before continuing.');
        const page=core.parseRepositoryUrl(remote).page;
        const identity=repositoryIdentity(await repositories.access(page,{ticket,permissions:{contents:'read'}}));
        const guard=async()=>{await check();await auth.assertCurrent(ticket);};
        const networkRun=await operationTransport(remote,{root,authentication:auth,ticket,permissions:{contents:'read'},identity,assertProject:guard,assertProjectNow:()=>{checkProjectNow();if(undoTx)checkNow();auth.assertCurrentNow(ticket);}});
        authority=createCommitUndoAuthority({snapshot:async scope=>{
          if(scope.root!==root||scope.destination!==remote)throw new Error('The repository changed. Review the commit again.');
          await guard();assertRepositoryIdentity(identity,await repositories.access(page,{ticket,permissions:{contents:'read'}}));await guard();
          const output=await networkRun(root,['ls-remote','--heads',remote,scope.ref]);
          const lines=output.trim().split('\n'),match=lines.length===1&&/^([a-f0-9]{40}|[a-f0-9]{64})\t([^\s]+)$/.exec(lines[0]);
          if(!match||match[2]!==scope.ref)throw new Error('The GitHub branch could not be verified. Review this commit again.');
          await guard();return {remote:scope.remote,ref:scope.ref,destination:remote,oid:match[1]};
        }});
      } else authority=createCommitUndoAuthority({mode:'local-only'});
      completed=await undoLatestCommit({root,expectedHead:current.head,withAuthority:authority,...(repositoryLedger?{withLedger:(binding,execute)=>withReminderProvenance(root,binding,async(tx,composite)=>{undoTx=tx;try{await check();return await execute(composite);}finally{undoTx=undefined;}})}:{}),beforeRef:check,beforeRefNow:checkNow});
      // Resolve only exact reminders for the removed commit. Earlier reminders
      // and anything newly added remain available for explicit review.
      for(const record of initialLocal.filter(record=>record.head===current.head)) {
        const latest=(await localRecords(root,short)).find(item=>item.id===record.id);
        if(!latest||JSON.stringify(latest)!==JSON.stringify(record))throw new Error('The commit was undone locally, but its sync reminder changed. Review the reminder before syncing.');
        await resolveReminder(latest,'superseded');
      }
      for(const record of initialPush){const latest=(await pushRecords(root,short)).find(item=>item.id===record.id);if(!latest||JSON.stringify(latest)!==JSON.stringify(record))throw new Error('The commit was undone locally, but its sync reminder changed. Review the reminder before syncing.');await clearPush(root,short,latest,'superseded');}
      await refreshNativeGit(root);studentExplorer?.invalidate();await repositoryStatus();
      report('Commit undone locally · changes kept',`Removed ${completed.oldHead} from the branch; its recovery reference is ${completed.recoveryRef}. Files and index remain unchanged. No upload occurred.`);
      return true;
    } catch(error) {
      if(completed||error.undoCompleted)error.message+=' The commit was undone locally; inspect history and sync reminders before continuing.';
      if(error.recoveryPath)error.message+=` ${completed||error.undoCompleted?'':'The branch may or may not have moved. '}Recovery location: ${error.recoveryPath}. Inspect recovery copies and Source Control before continuing.`;
      if(error.additionalRecoveryPath)error.message+=` Additional recovery location: ${error.additionalRecoveryPath}.`;
      if(error.lockRecoveryPath)error.message+=` Lock requiring inspection: ${error.lockRecoveryPath}.`;
      if(error.additionalLockRecoveryPath)error.message+=` Additional lock requiring inspection: ${error.additionalLockRecoveryPath}.`;
      throw error;
    } finally {await repositoryStatus();refresh();}
  }
  actions['zero.undoRecentChange']=async()=>{
    if(isBusy())return;
    maintenanceBusy=true;refresh();let handedOff=false;
    try {
      const current=await history.recent(),selected=recentHistory?.entries?.[0];
      if(!selected||current.root!==recentHistory.root||current.branch!==recentHistory.branch||current.head!==recentHistory.head||current.entries[0]?.id!==selected.id)throw new Error('History changed. Review the latest commit again.');
      if(selected.branch){handedOff=true;maintenanceBusy=false;return await undoFinishedChange(selected.id);}
      if(!selected.parent)throw new Error('The first project commit cannot be undone here. Open Source Control to review it.');
      if(process.platform==='win32')throw new Error('Undoing this commit is not supported on Windows yet. No undo was started. Open Source Control to review it.');
      if(await undoLocalCommit(current,selected))return;
      handedOff=true;maintenanceBusy=false;return await restoreProjectVersion(selected.parent);
    } finally {if(!handedOff){maintenanceBusy=false;refresh();}}
  };
  context.subscriptions.push(history);
  actions['zero.updateProject']=async()=>{
    if(disposed||isBusy())return;
    maintenanceBusy=true;refresh();
    try {
      const root=await project();if(!await updateProject(root))report('Project is already current or update cancelled');
    } finally {maintenanceBusy=false;if(!disposed)refresh();}
  };
  actions['zero.upgradeBrowserTooling']=actions['zero.updateProject'];
  actions['zero.recoverProjectUpdate']=async()=>{
    if(disposed||isBusy())return;
    maintenanceBusy=true;refresh();
    try {
      const root=await project(),current=projectUpdateGuard(root);
      await current();
      const upgrade=require('./project-update');
      const recoveries=(await upgrade.listRecoveries({projectRoot:root})).filter(item=>item.status==='incomplete');
      await current();
      if(!recoveries.length){report('No interrupted project update to recover');return;}
      throw new Error('Project update and recovery are temporarily unavailable. Your project and recovery copies are kept.');
      const choice=await quickPick(recoveries.map(item=>({label:item.label,description:path.basename(item.recoveryPath),recoveryPath:item.recoveryPath})),{title:'Recover an interrupted project update'});
      if(!choice)return;
      await current();
      const detail=`Restore the files from ${choice.recoveryPath}. Zero checks for conflicting edits and refuses recovery if it cannot preserve them. Review your project after recovery.`;
      if(await vscode.window.showWarningMessage('Recover this project update?',{modal:true,detail},'Recover')!=='Recover')return;
      await current();
      projectUpdateGeneration++;projectUpdateAvailable=false;
      await withProjectUpdateMutation(root,current,guard=>upgrade.recoverUpdate({projectRoot:root,recoveryPath:choice.recoveryPath},{assertCurrent:guard}));
      projectUpdateRoot=undefined;inspectProjectUpdate(root);
      await current();
      report('Project update recovered','The interrupted update was restored. Review your project files before updating again.');
    } finally {maintenanceBusy=false;if(!disposed)refresh();}
  };
  const sharing=createSharingEditor(vscode,{project,auth,output,isBusy,setState:report,verifiedPublication:webPublish.verifiedPublication,uploadForSharing:root=>sharingHandoff(root,()=>uploadProject()),publishForSharing:root=>sharingHandoff(root,()=>webPublish.publish()),setBusy:value=>{componentBusy=value;refresh();}},{kitConfiguration:readKitConfiguration(context.extensionPath || path.resolve(__dirname,'..'))});
  Object.assign(actions, sharing.commands);
  context.subscriptions.push(...sharing.disposables);
  // Old test/minimal hosts can omit TreeView; supported VS Code hosts provide it.
  if(vscode.window.createTreeView) {
    studentExplorer=createStudentExplorer(vscode,{project,isBusy,output,report,experimentalStaged:async()=>{if(!ENABLE_STAGED_ADDED_REMOVAL||process.platform!=='darwin')return false;try{return (await core.git(await project(),['-c','core.fsmonitor=false','rev-parse','--show-ref-format'])).trim()==='files';}catch{return false;}},experimentalUntracked:async()=>{if(process.platform!=='darwin')return false;try{if(ENABLE_DEV_UNTRACKED_REMOVAL&&context.extensionMode===2&&process.env.ZERO_DEV_EXPERIMENTAL_NATIVE_HELPER==='1')await require('./added-removal-dev-helper').verifiedAddedRemovalDevHelper(context);else if(context.extensionMode===1&&ENABLE_PACKAGED_UNTRACKED_REMOVAL)await require('./added-removal-packaged-helper').verifiedAddedRemovalPackagedHelper(context);else return false;return true;}catch{return false;}},workspaceState:context.workspaceState,execute:async(id,arg)=>{
      const result=await actions[id](arg);refresh();return result;
    }});
    Object.assign(actions,studentExplorer.commands);context.subscriptions.push(studentExplorer);
  }
  const webExport=createWebExportCommands(vscode,{project:runnableProject,output,ensureValidatedExport:buildWithSavedProject,validateExport:savedBuilder.validateRetainedExport,setAvailable:root=>{exportReadyRoot=root;},publish:()=>webPublish.publish(),openPreview:(root,result)=>browserRun.preview(root,result,{retained:true}),isBusy,setBusy:value=>{exportingWeb=value;refresh();},setState:text=>{state=text;refresh();},cacheRoot:webCacheRoot});
  Object.assign(actions,webExport.commands);
  context.subscriptions.push(...webExport.disposables);
  for (const [id, action] of Object.entries(actions)) context.subscriptions.push(vscode.commands.registerCommand(id, async (...args) => {
    try {await action(...args);} catch(error) {
      const message = error.zeroRunMessage || error.message;
      const display = recoveryMessage(/^GitHub sign-in was cancelled or unavailable\./.test(message) ? 'GitHub sign-in cancelled or unavailable. Try again.' : message,error.recoveryPath);
      if (!(execution && ['zero.runApp','zero.runNativeApp','zero.toggleApp'].includes(id))) state = display;
      if (id === 'zero.signInToGitHub') authFeedback = display;
      refresh();output.appendLine(error.message);
      const installUrl=appConfiguration&&`https://github.com/apps/${appConfiguration.slug}/installations/new`;
      if(installUrl && error.actionUrl===installUrl){
        void githubReadiness.refresh();
        const choice=await vscode.window.showErrorMessage(`Zero: ${display}`,'Open GitHub');
        if(choice==='Open GitHub'&&!disposed)await vscode.env.openExternal(vscode.Uri.parse(installUrl));
      }else if(error.code==='creation-uncertain'&&typeof error.repositoryUrl==='string'){
        const destination=core.parseRepositoryUrl(error.repositoryUrl);
        const prior=context.globalState?.get('zero.repositoryCreationRecovery');
        await context.globalState?.update('zero.repositoryCreationRecovery',{...(prior?.repositoryUrl===destination.page?prior:{}),repositoryUrl:destination.page,at:Date.now()});
        vscode.window.showErrorMessage(`Zero: ${display} Use Zero: Repository Actions → Resume created project to continue.`);
      }else vscode.window.showErrorMessage(`Zero: ${display}`);
    }
  }));
  function render(webview, studentView = false) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const disabled = isBusy() ? 'disabled' : '';
    const connected = repository.startsWith('https://github.com/');
    const ready = githubReady();
    const phase = auth.signedIn ? githubReadiness.phase : 'signed-out';
    const repoName = connected ? repository.slice('https://github.com/'.length) : projectRoot ? path.basename(projectRoot) : 'Project';
    const repoControl = `<button class="repo-choice" data-command="zero.chooseRepository" title="${escape(connected ? repository : 'Project actions')}" aria-label="${escape(`Project: ${repoName}. Open project actions`)}" aria-haspopup="dialog" ${disabled}><span class="repo-label">${escape(repoName).replace('/', '/<wbr>')}</span>${icon('ChevronDown')}</button>`;
    const gitDisabled = isBusy() || updateRecovery || updateRecoveryError ? 'disabled' : '';
    const branchControl = branchError ? `<p class="muted status">${escape(branchError)}</p><button class="link" data-command="zero.openGitSourceControl" ${gitDisabled}>Open Source Control</button>` : (branch || branchDetached) ? `<div class="branch-row"><button class="link branch" data-command="${branch ? 'zero.switchStudentBranch' : 'zero.switchBranch'}" title="${escape(branch ? `Current branch: ${branch}` : 'Detached HEAD. Switch branch.')}" aria-label="${escape(`Current branch: ${branch || 'Detached HEAD'}. Open branch actions`)}" aria-haspopup="dialog" ${gitDisabled}>${icon('GitBranch')}<span>${escape(branch || 'Detached HEAD')}</span>${icon('ChevronDown')}</button><button class="link history-icon" data-command="zero.changeHistory" aria-label="View all commits" title="View all commits" ${gitDisabled||branchHead===null?'disabled':''}>◷</button>${ready && connected && branch && branch !== 'main' ? `<button class="link change" data-command="zero.finishChange" ${gitDisabled}>Merge</button>` : ''}</div>` : '';
    const recentCommits=recentHistory&&recentHistory.root===projectRoot&&recentHistory.branch===`refs/heads/${branch}`?`<div class="recent-commits" aria-label="Recent commits">${recentHistory.entries.map((entry,index)=>`<div class="recent-commit">${index===0&&!entry.branch&&entry.parent?`<button class="link undo-icon" data-command="zero.undoRecentChange" aria-label="Undo latest commit" title="Undo latest commit" ${gitDisabled}>⟲</button>`:''}<span>${escape(entry.branch?`Merge ${entry.branch}`:entry.label.replace(/^Commit: /,''))}</span></div>`).join('')}</div>`:'';
    const commitDisabled=gitDisabled || projectDirty!==true || projectUnsaved!==false?'disabled':'';
    const projectKey=projectRoot?crypto.createHash('sha256').update(projectRoot).digest('hex'):'';
    const githubActions = branch ? `<input id="commit-message" data-project="${projectKey}" aria-label="Commit message" placeholder="What did you change?" maxlength="500" ${commitDisabled}><button class="secondary upload" data-command="zero.commitChanges" ${uploadProgress ? 'aria-busy="true"' : ''} ${commitDisabled}>${uploadProgress ? '<span class="busy-indicator" aria-hidden="true"></span>' : ''}${uploadProgress ? escape(uploadProgress) : 'Commit'}</button>${projectDirtyError?`<p class="muted status">${escape(projectDirtyError)}</p>`:projectUnsaved?'<p class="muted status">Save your project edits before committing.</p>':''}${uploadMode() === 'live' ? '' : '<p class="badge">Simulation — nothing will be uploaded</p>'}` : '';
    const gitRecoveryActions=projectRoot&&!localPractice?gitRecoveryPanel.panel({recovery:updateRecovery,pending:pendingUpload,error:updateRecoveryError,disabled:isBusy(),refOnlyReview:ENABLE_REF_ONLY_REVIEW&&/^A ref-only update record needs inspection\./.test(updateRecoveryError||'')}):'';
    const localSyncAction=pendingLocalCommit?`<p class="muted status">${escape(gitRecoveryPanel.localReminderMessage(pendingLocalCommit))}</p>${connected?`<button class="link" data-command="zero.syncLocalCommit" ${gitDisabled}>Sync local commit to GitHub</button>`:`<button class="link" data-command="zero.connectRepository" ${gitDisabled}>Connect repository…</button>`}<button class="link" data-command="zero.reviewLocalCommit" ${gitDisabled}>Review local sync reminder…</button>`:'';
    const mainNotice=mainUpdateStatus&&currentMainObservation(mainUpdateStatus) ? `${mainUpdateStatus.state==='available'?`<p class="muted status">GitHub main has new changes</p><button class="link" data-command="zero.syncProject" ${gitDisabled}>Update branch from main</button>`:mainUpdateStatus.state==='unknown'?`<p class="muted status">GitHub main may have new changes.</p><button class="link" data-command="zero.syncProject" ${gitDisabled}>Check and update branch…</button>`:''}${mainUpdateStatus.localUpdate?`<p class="muted status">Local main has changes not in this branch.</p><button class="link" data-command="zero.openGitSourceControl" ${gitDisabled}>Open Source Control</button>`:''}` : '';
    const repositoryWarning = !connected && repository !== 'No repository connected' ? `<p class="muted status">${escape(repository)}</p>` : '';
    const exportActions = projectRoot && exportReadyRoot === projectRoot ? `<div class="row"><button class="link" data-command="zero.previewWebExport" ${disabled}>Preview export</button><button class="link" data-command="zero.saveWebExport" ${disabled}>Save ZIP</button><button class="link" data-command="zero.shareWebExport" ${disabled}>Share export…</button></div>` : '';
    const projectUpdateNotice=typeof projectUpdateRoot!=='undefined'&&projectUpdateRoot===projectRoot&&projectUpdateAvailable?`<div class="project-update"><p class="status">This project uses older Zero files. Create a new project to use current tooling; your files are kept.</p></div>`:'';
    const browserCheckStatus=savedChecksRoot===projectRoot&&savedChecksState?`<p class="muted status" title="${escape(savedChecksState.message||'')}">Browser checks: ${escape(savedChecksState.status)}</p>`:'';
    const browserAction = browserActive && !stopPromise && browserRun.canOpenInBrowser ? `<button class="secondary browser-open" data-command="zero.openRunningAppInBrowser" title="Open in browser" aria-label="Open in browser" ${disabled}>${icon('ExternalLink')}</button>` : '';
    const showRepository = projectRoot && (ready || connected || branch || branchDetached || branchError);
    const historyActions = branch && !localPractice ? `<div class="row"><button class="link" data-command="zero.reviewChanges" ${gitDisabled}>Review changes</button></div>` : '';
    const observed=branchRemoteStatus&&currentBranchObservation(branchRemoteStatus)?branchRemoteStatus:undefined;
    const connectionState=uploadMode()!=='live'?'simulation':!connected?(repository==='No repository connected'?'local':'unknown'):!auth.signedIn?'auth':observed?.checkedAt&&Date.now()-observed.checkedAt>=120000?'stale':observed?.state||'unknown';
    const branchConnection=branch?`<div class="branch-connection" role="status" aria-live="polite"><p class="muted status">${escape(branchHead===null?(connected?'GitHub repository connected · make your first commit to sync.':repository==='No repository connected'?'Local project · make your first commit.':'Repository connection cannot be verified. Make your first commit before syncing.'):branchStatusMessage(connectionState))}</p>${connected&&branchHead!==null?`<button class="link" data-command="zero.checkBranchConnection" ${isBusy()||branchCheckRunning||uploadMode()!=='live'?'disabled':''}>Check connection</button>`:''}${connectionState==='remote-changed'?`<button class="link" data-command="zero.reviewBranchUpdate" ${gitDisabled}>Update branch from GitHub…</button>`:''}${['local-ahead','remote-missing'].includes(connectionState)&&!pendingUpload&&!pendingLocalCommit&&!updateRecoveryError?`<button class="link" data-command="zero.syncSavedCommits" ${gitDisabled}>Sync saved commits…</button>`:''}</div>`:'';
    const githubPanel = !showRepository ? '' : `<div class="context-row">${repoControl}</div>${localPractice ? '<p class="muted">Local practice · no GitHub sharing</p>' : `${repositoryWarning}${branchControl}${recentCommits}${branchConnection}${mainNotice}${githubActions}${localSyncAction}${historyActions}${gitRecoveryActions}`}`;
    const fileActions=projectRoot && !studentView ? `<h2 id="files-heading"><button id="files-menu-button" class="link files-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="files-menu" ${disabled}>New${icon('ChevronDown')}</button></h2><div id="files-menu" class="files-dropdown" role="menu" aria-labelledby="files-menu-button" hidden>${[['zero.newClass','New class…'],['zero.newPackage','New package…'],['zero.newFile','New file…'],['zero.newFolder','New folder…'],['zero.importAssets','New asset…'],...(assets.canCopyPaths() ? [['zero.copyImportedAssetPaths','Copy asset paths']] : [])].map(([command,label])=>`<button role="menuitem" tabindex="-1" data-command="${command}" ${disabled}>${label}</button>`).join('')}</div>` : '';
    const activeRun = execution || pendingLaunch || nativeStarting || browserActive || browserBusy;
    const setupCheck = projectRoot && isSetupProject(projectRoot);
    const runLabel = stopPromise ? 'Stopping…' : activeRun ? 'Stop' : setupCheck ? 'Run test' : 'Run';
    const runDisabled = stopPromise ? 'aria-disabled="true"' : !activeRun && (isBusy()||updateRecovery||updateRecoveryError) ? 'disabled' : '';
    const publishMenu = !setupCheck && ready && auth.signedIn && connected ? `<button id="run-menu-button" class="run-menu-button" aria-label="Run options" title="Run options" aria-haspopup="menu" aria-expanded="false" aria-controls="run-menu" ${isBusy() || activeRun ? 'disabled' : ''}>${icon('ChevronDown')}</button><div id="run-menu" class="files-dropdown run-dropdown" role="menu" aria-labelledby="run-menu-button" hidden><button role="menuitem" tabindex="-1" data-command="zero.publishAndOpenWeb" ${isBusy() || activeRun ? 'disabled' : ''}>Publish &amp; open app</button>${webPublish.hasPublishedApp({root:projectRoot,repository,account:auth.accountId}) ? `<button role="menuitem" tabindex="-1" data-command="zero.viewPublishedWeb" ${isBusy() || activeRun ? 'disabled' : ''}>View published app</button>` : ''}</div>` : '';
    const runControl = `<div class="run-split"><button class="${ready ? 'run' : 'secondary'}" data-command="zero.toggleApp" ${runDisabled}>${icon(activeRun || stopPromise ? 'Square' : 'Play')}${runLabel}</button>${publishMenu}</div>`;
    const controls = !projectRoot ? `<button class="link" data-command="zero.startPage" ${disabled}>Open Start Page</button>` : `${setupCheck ? '<p class="muted">Installation test · Hello World</p>' : ''}${!ready ? `<button class="link" data-command="zero.startPage" ${disabled}>GitHub setup</button>` : ''}<div class="main-controls"><div class="run-controls">${runControl}${browserAction}</div>${exportActions}${browserCheckStatus}${projectUpdateNotice}</div>${showRepository ? `<section class="repository">${githubPanel}</section>` : ''}${studentView ? '' : `<section class="hub-actions"><button class="link hub" data-command="zero.browseZeroHub" aria-haspopup="dialog" ${disabled}>ZeroHub</button></section>`}`;
    const publishingProgress=publishProgressHtml(publishProgress?.root===projectRoot?publishProgress:undefined);
    // Keep the controls document alive across progress updates; VS Code owns the file tree.
    if (renderedWebviews.has(webview) && webview.postMessage) {
      void webview.postMessage({type:'sidebar.update',controls,fileActions,status:state,failed:buildFailed,publishingProgress}); return;
    }
    renderedWebviews.add(webview);
    webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">${sidebarStyles()}</style></head><body><div id="controls">${controls}</div><div class="feedback"><p id="run-status" tabindex="-1" class="muted status" role="status" aria-live="polite">${escape(state)}</p><div id="publishing-progress">${publishingProgress}</div><div id="recovery" ${buildFailed ? '' : 'hidden'}>${buildFailed ? '<button class="link" data-command="zero.showProblems">Show Problems</button><button class="link" data-command="zero.showOutput">Show Output</button>' : ''}</div></div><div id="file-actions" class="file-actions">${fileActions}</div><script nonce="${nonce}">${sidebarScript()}</script></body></html>`;
  }
  const controlsProvider={resolveWebviewView(candidate) {
    controlViews.add(candidate); candidate.webview.options = {enableScripts:true, localResourceRoots:[]};
    candidate.webview.onDidReceiveMessage(message => {
      if (!message || typeof message !== 'object' || disposed) return;
      if (message.type === 'sidebar.ready') {refresh();return;}
      if (Object.hasOwn(actions, message.command)) vscode.commands.executeCommand(message.command,message.command==='zero.commitChanges'&&typeof message.commitMessage==='string'?message.commitMessage:typeof message.recovery==='string'?message.recovery:undefined);
    }, undefined, context.subscriptions);
    candidate.onDidDispose(() => {controlViews.delete(candidate);renderedWebviews.delete(candidate.webview);}, undefined, context.subscriptions); refresh(); repositoryStatus();
  }};
  for(const id of ['zero.controls','zero.studentControls'])context.subscriptions.push(vscode.window.registerWebviewViewProvider(id,controlsProvider));
  context.subscriptions.push(output);
  const watcher = vscode.workspace.createFileSystemWatcher('**/zero.json');
  for(const method of ['onDidCreate','onDidChange','onDidDelete']) watcher[method](uri=>{if(path.basename(uri.fsPath)==='zero.json'){browserRun.stop();studentExplorer?.invalidate();}},undefined,context.subscriptions);
  let metadataRefreshTimer;
  const metadataWatcher = vscode.workspace.createFileSystemWatcher('**/.git/{HEAD,config,index,MERGE_HEAD,packed-refs,zero-update-recovery.json,zero-pending-sync/*.json,refs/heads/**}');
  for (const method of ['onDidCreate','onDidChange','onDidDelete']) metadataWatcher[method](uri => {
    if (!projectRoot) return;
    const filename = path.resolve(uri.fsPath);
    const gitRoot=path.join(projectRoot,'.git');
    const inWorkspace=(vscode.workspace.workspaceFolders||[]).some(folder=>{const relative=path.relative(folder.uri.fsPath,filename);return relative&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);});
    if (!inWorkspace&&!['HEAD','config','index','MERGE_HEAD','packed-refs','zero-update-recovery.json'].some(name=>filename===path.join(gitRoot,name)) && !filename.startsWith(path.join(gitRoot,'refs','heads')+path.sep) && !(path.dirname(filename)===path.join(gitRoot,'zero-pending-sync')&&/^(?:record|resolution)-.+\.json$/.test(path.basename(filename))))return;
    scheduleProjectDirty();clearTimeout(metadataRefreshTimer);
    metadataRefreshTimer=setTimeout(()=>{if(!disposed&&!isBusy())void repositoryStatus();},60);
  }, undefined, context.subscriptions);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {if (event.affectsConfiguration('zero.uploadMode')) refresh();}));
  if(vscode.workspace.onDidGrantWorkspaceTrust)context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(()=>scheduleProjectDirty()));
  // Linked worktrees keep HEAD and shared config outside the workspace watcher.
  // Refresh local state first so remote checks never use the previous branch.
  let backgroundStatusRunning=false,backgroundStatusPending=false;
  async function refreshBackgroundStatus(forceBranchCheck=false) {
    if(disposed||isBusy()||vscode.workspace.isTrusted!==true||!projectRoot)return;
    if(backgroundStatusRunning){if(forceBranchCheck)backgroundStatusPending=true;return;}
    backgroundStatusRunning=true;
    studentExplorer?.invalidate();
    try {await repositoryStatus({forceBranchCheck});} finally {
      backgroundStatusRunning=false;
      if(backgroundStatusPending){backgroundStatusPending=false;void refreshBackgroundStatus(true);}
    }
  }
  const mainUpdateTimer=setInterval(()=>{if(vscode.window.state?.focused!==false)void refreshBackgroundStatus();},120000);
  context.subscriptions.push({dispose(){clearInterval(mainUpdateTimer);mainUpdateGeneration++;}});
  if(vscode.window.onDidChangeWindowState)context.subscriptions.push(vscode.window.onDidChangeWindowState(event=>{if(event.focused)void refreshBackgroundStatus(true);}));
  // The Start Page owns onboarding; authentication remains explicit and local work stays available.
  const startup = auth.refresh().catch(error => {
    if (!disposed) output.appendLine(`Getting started: ${error.message}`);
  });
  if (!(vscode.workspace.workspaceFolders || []).length) void introduceProject().catch(error=>output.appendLine(`Start Page: ${error.message}`));
  const introduceAfterConnection = (options) => startup.then(async() => {if (!disposed) {try {await rememberOpened({projectPath:await project()});}catch{}await projectWindow.restore();await introduceProject(options);}}).catch(error => output.appendLine(`Getting started: ${error.message}`));
  context.subscriptions.push(watcher, metadataWatcher,{dispose:()=>clearTimeout(metadataRefreshTimer)}, vscode.workspace.onDidChangeWorkspaceFolders(event => {
    runGeneration++;
    if (execution || pendingLaunch || nativeStarting) void actions['zero.stopApp']().catch(error => output.appendLine(error.message));
    savedChecksEnableGeneration++;savedPreparation?.abort();savedChecks?.dispose();savedChecks=undefined;savedChecksRoot=undefined;savedChecksState=undefined;savedProblems?.clear();
    projectRoot = undefined;projectDirty=undefined;projectUnsaved=undefined;projectDirtyError=undefined;projectDirtyGeneration++;clearTimeout(projectDirtyTimer);clearDirtyMetadataWatch();mainUpdateStatus=undefined;mainUpdateGeneration++;mainUpdateNextAt=0; repositoryStatus(); void introduceAfterConnection({revealSidebar:Boolean(event?.added?.length), addedFolders:event?.added});
  }));
  context.subscriptions.push({dispose:() => {runGeneration++;if (execution) execution.terminate();}});
  context.subscriptions.push(createNativeUpdateReload(vscode, {context,
    isBusy:()=>disposed || isBusy() || auth.busy || Boolean(appProvider?.busy || execution || pendingLaunch || nativeStarting || browserActive),
    log:message=>output.appendLine(message)}));
  void introduceAfterConnection();
}
module.exports = {activate,dirtyProjectDocuments};
