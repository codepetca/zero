'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const core = require('./core');
const {assertShareable} = require('./lesson-projects');
const {createManagedWebPreview} = require('./web-run-preview');
const {publishingGuide} = require('./web-publishing');

function createWebExportCommands(vscode,{project,output,isBusy,setBusy,setState,cacheRoot,publish,ensureValidatedExport,validateExport,openPreview,previewFactory=createManagedWebPreview,engineRoot=path.join(__dirname,'web-export')}) {
  let latest, preview, controller, disposed=false;
  const build = options => (ensureValidatedExport || require('./web-export/snapshot').ensureValidatedExport)(options);
  const validate = options => (validateExport || require('./web-export/snapshot').validateExport)(options);
  const current = async () => {
    const root = await project();
    if (!latest || latest.root !== root) throw new Error('Choose Export for web for this project first.');
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
    setState('Local web preview open. Publish it to get a link other people can play.');
  }
  async function saveZip() {
    const {root,result}=await current();
    const destination=await vscode.window.showSaveDialog({title:'Save browser game',defaultUri:vscode.Uri.file(path.join(os.homedir(),'Downloads',path.basename(root)+'-web.zip')),filters:{'Browser game ZIP':['zip']}});
    if(!destination || disposed || await project()!==root)return;
    const selected=path.resolve(destination.fsPath);
    // Keep accidental native source replacement impossible through the save dialog.
    if(path.extname(selected).toLowerCase()!=='.zip')throw new Error('Save the browser game with a .zip filename.');
    const targetStat=await fs.lstat(selected).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(targetStat?.isSymbolicLink())throw new Error('Choose a regular ZIP file destination, not a symbolic link.');
    if(selected!==path.resolve(result.zipPath))await fs.copyFile(result.zipPath,selected);
    setState('Browser game ZIP saved. Upload this ZIP as an HTML game on itch.io.');
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
      setState(`Web export ready${Number.isFinite(result.totalBytes) ? ` · ${(result.totalBytes/1_000_000).toFixed(1)} MB` : ''}. Preview before sharing.`);
    } catch(error) {
      setState(controller.signal.aborted ? 'Web export cancelled. Your previous successful export is preserved.' : 'Web export failed. Check the Zero output for the source error.');
      output.show?.(true);
      throw error;
    } finally {controller=undefined;setBusy(false);}
    if(!result || disposed || await project()!==root)return;
    const action=await vscode.window.showInformationMessage('Web export ready. Preview the game before sharing.','Preview game','Save ZIP','Share…');
    if(action==='Preview game')await previewLatest();
    else if(action==='Save ZIP')await saveZip();
    else if(action==='Share…')await share();
  }
  return {
    commands:{'zero.exportWeb':exportWeb,'zero.previewWebExport':previewLatest,'zero.saveWebExport':saveZip,'zero.shareWebExport':share},
    disposables:[{dispose(){disposed=true;controller?.abort();preview?.dispose();}}]
  };
}
module.exports={createWebExportCommands};
