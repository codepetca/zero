'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const core = require('./core');
const {assertShareable} = require('./lesson-projects');
const {createManagedWebPreview} = require('./web-run-preview');
const {publishingGuide} = require('./web-publishing');

function createWebExportCommands(vscode,{project,output,isBusy,setBusy,setState,setAvailable=()=>{},cacheRoot,publish,ensureValidatedExport,validateExport,openPreview,previewFactory=createManagedWebPreview,engineRoot=path.join(__dirname,'web-export')}) {
  let latest, preview, controller, disposed=false;
  const report=(message,detail=message)=>{setState(message);output.appendLine(detail);};
  const build = options => (ensureValidatedExport || require('./web-export/snapshot').ensureValidatedExport)(options);
  const validate = options => (validateExport || require('./web-export/snapshot').validateExport)(options);
  const current = async () => {
    const root = await project();
    if (!latest || latest.root !== root) latest={root,result:await validate({projectRoot:root})};
    const result=await validate({projectRoot:root,result:latest.result}) || latest.result;
    return {root,result};
  };
  async function showGuide(root) {
    let page;
    try {page=core.parseRepositoryUrl(await core.git(root,['remote','get-url','origin'])).page;} catch {}
    const doc=await vscode.workspace.openTextDocument({language:'markdown',content:publishingGuide(page)});
    await vscode.commands.executeCommand('markdown.showPreview',doc.uri);
  }
  async function open(url) {
    if (!await vscode.env.openExternal(vscode.Uri.parse(url))) throw new Error('Could not open the browser. Try the link in the publishing steps.');
  }
  async function previewLatest() {
    const {root,result}=await current();
    if(openPreview){await openPreview(root,result);return;}
    if(preview)preview.dispose();
    preview=await previewFactory(vscode,result.sitePath,{siteFiles:result.siteFiles});
    if(disposed || await project()!==root){preview.dispose();preview=undefined;return;}
    report('Preview opened','Local web preview open. Publish it to get a link other people can play.');
  }
  async function saveZip() {
    const {root,result}=await current();
    const destination=await vscode.window.showSaveDialog({title:'Save browser game',defaultUri:vscode.Uri.file(path.join(os.homedir(),'Downloads',path.basename(root)+'-web.zip')),filters:{'Browser game ZIP':['zip']}});
    if(!destination || disposed || await project()!==root)return;
    const selected=path.resolve(destination.fsPath);
    // Keep accidental native source replacement impossible through the save dialog.
    if(path.extname(selected).toLowerCase()!=='.zip')throw new Error('Save the browser game with a .zip filename.');
    // A native save dialog can remain open while Run/Export rebuilds this project.
    // Bind the approved destination to the same snapshot and use its captured bytes.
    const verified=await validate({projectRoot:root,result});
    if(disposed || await project()!==root)return;
    if(!verified || !result.buildId || verified.buildId!==result.buildId || !(verified.zipBytes instanceof Uint8Array))throw new Error('The browser build changed while choosing a ZIP destination. Export again before saving.');
    const bytes=Buffer.from(verified.zipBytes);
    const inspect=()=>fs.lstat(selected).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    const targetStat=await inspect();
    if(targetStat?.isSymbolicLink())throw new Error('Choose a regular ZIP file destination, not a symbolic link.');
    if(targetStat && !targetStat.isFile())throw new Error('Choose a regular ZIP file destination.');
    const archivePath=await fs.realpath(verified.zipPath);
    const archiveStat=await fs.stat(archivePath);
    const destinationPath=targetStat ? await fs.realpath(selected) : path.join(await fs.realpath(path.dirname(selected)),path.basename(selected));
    if(destinationPath===archivePath || targetStat && targetStat.dev===archiveStat.dev && targetStat.ino===archiveStat.ino)throw new Error('Choose a ZIP destination outside the generated browser export.');
    {
      const temporary=path.join(path.dirname(selected),'.zero-save-'+crypto.randomUUID()+'.tmp');
      try {
        await fs.writeFile(temporary,bytes,{flag:'wx',mode:0o600});
        if(disposed || await project()!==root)return;
        const targetNow=await inspect();
        if(targetNow?.isSymbolicLink())throw new Error('Choose a regular ZIP file destination, not a symbolic link.');
        if(Boolean(targetNow)!==Boolean(targetStat) || targetStat && (targetNow.dev!==targetStat.dev || targetNow.ino!==targetStat.ino || targetNow.size!==targetStat.size || targetNow.mtimeMs!==targetStat.mtimeMs))throw new Error('The ZIP destination changed while saving. Choose Save ZIP again.');
        // Rename replaces a selected regular file without following a late symlink.
        // A new destination uses link so concurrent creation cannot be overwritten.
        if(targetStat)await fs.rename(temporary,selected);
        else await fs.link(temporary,selected);
      } finally {await fs.rm(temporary,{force:true});}
    }
    report('ZIP saved','Browser game ZIP saved. Upload this ZIP as an HTML game on itch.io.');
  }
  async function repository(root) {
    await core.assertRepositoryRoot(root);
    return core.parseRepositoryUrl(await core.git(root,['remote','get-url','origin'])).page;
  }
  async function share() {
    if(isBusy())return;
    const {root}=await current();
    await assertShareable(root);
    const choice=await vscode.window.showQuickPick([
      {label:'GitHub Pages',description:'Publish from your repository; generated games stay out of Git history',action:'pages'},
      {label:'itch.io',description:'Upload game.zip and share its game-page link',action:'itch'},
      {label:'Read publishing steps',action:'guide'}
    ],{title:'Share a playable game',placeHolder:'Export is local. Choose where you want to publish.'});
    if(!choice || disposed || await project()!==root || isBusy())return;
    if(choice.action==='itch') {await showGuide(root);await saveZip();await open('https://itch.io/game/new');return;}
    if(choice.action==='guide'){await showGuide(root);return;}
    if(choice.action!=='pages')return;
    if(!publish)throw new Error('Use Publish app in the Zero sidebar to set up your playable link.');
    await publish();
  }
  async function exportWeb() {
    if(isBusy())return;
    if(vscode.workspace.isTrusted===false)throw new Error('Trust your own project before compiling its Java code for the web.');
    setBusy(true);
    let result,root;
    controller=new AbortController();
    try {
      root=await project();
      if(!await vscode.workspace.saveAll(false))throw new Error('Save your files before exporting for the web.');
      if(disposed || await project()!==root)throw new Error('The project changed. Choose Export for web again.');
      output.appendLine('Export for web — compiling a browser copy. Your Java source stays unchanged.');
      const operation=async(progress,token)=>{
        const cancellation=token?.onCancellationRequested(()=>controller?.abort());
        try {return await build({projectRoot:root,cacheRoot:cacheRoot || path.join(os.tmpdir(),'zero-web-cache'),env:process.env,signal:controller.signal,onProgress:message=>{const text=String(message);progress?.report({message:text});setState(text);output.appendLine(text);}});}
        finally{cancellation?.dispose();}
      };
      result=vscode.window.withProgress
        ? await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Export for web',cancellable:true},operation)
        : await operation();
      if(disposed || controller.signal.aborted || await project()!==root)return;
      latest={root,result};
      setAvailable(root);
      report('Export ready',`Web export ready${Number.isFinite(result.totalBytes) ? ` · ${(result.totalBytes/1_000_000).toFixed(1)} MB` : ''}. Preview before sharing.`);
    } catch(error) {
      setState(controller.signal.aborted ? 'Web export cancelled. Your previous successful export is preserved.' : 'Web export failed. Check the Zero output for the source error.');
      output.show?.(true);
      throw error;
    } finally {controller=undefined;setBusy(false);}
  }
  return {
    commands:{'zero.exportWeb':exportWeb,'zero.previewWebExport':previewLatest,'zero.saveWebExport':saveZip,'zero.shareWebExport':share},
    disposables:[{dispose(){disposed=true;controller?.abort();preview?.dispose();}}]
  };
}
module.exports={createWebExportCommands};
