'use strict';
const path = require('node:path');
const hub = require('./hub-components');
function createHubActions(vscode,host,options={}) {
  const hubOrigin=()=>hub.origin(vscode.workspace.getConfiguration('zero').get('hubOrigin','https://zero.codepet.ca'));
  async function browse() {
    const context=await hub.loadCatalog(hubOrigin(),options);
    if(!context.catalog.libraries.length) {await vscode.window.showInformationMessage('No automatically checked ZeroHub libraries are available yet.');return;}
    const entries=[];
    for(const release of context.catalog.libraries)for(const component of release.components)
      entries.push({label:component.className,description:`${release.title} · ${release.version}${context.catalog.mode==='local'?' · Local test':''}`,detail:`import ${release.namespace}.${component.className};`,release,component});
    const chosen=await vscode.window.showQuickPick(entries,{title:'ZeroHub',placeHolder:'Choose a component; its related classes share one library'});
    if(!chosen)return;
    const action=await vscode.window.showQuickPick([{label:'View library and checks',action:'view'},{label:`Add library ${chosen.release.version}`,action:'add'},{label:`Update to ${chosen.release.version}`,action:'update'},{label:`Revert to ${chosen.release.version}`,action:'revert'}],{title:chosen.label,placeHolder:'Exact version; no automatic upgrades'});
    if(!action)return;
    if(action.action==='view') {await vscode.env.openExternal(vscode.Uri.parse(`${context.origin}/hub?library=${chosen.release.libraryId}&version=${chosen.release.version}`));return;}
    if(vscode.workspace.isTrusted===false)throw new Error('Trust your project before changing dependencies.');
    const root=await host.project();
    const document=await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root,'pom.xml')));
    if(document.isDirty)throw new Error('Save pom.xml before reviewing a library change.');
    const plan=await hub.planChange(root,context,chosen.release,{operation:action.action});
    const capturedVersion=document.version;
    if(document.getText()!==plan.beforeText)throw new Error('The POM changed. Review a fresh plan.');
    const approved=await vscode.window.showInformationMessage(`${action.label}?`,{modal:true,detail:`${chosen.release.title}\n${plan.current||'Not installed'} → ${chosen.release.version}\nAutomatically checked · ${chosen.release.platforms?.join(', ')||'See report'}\n${context.origin}\n\nThis changes only the managed Maven dependency, repository and version history in pom.xml. Use import ${chosen.release.namespace}.${chosen.component.className}; in your code. Components run with your app’s permissions.`},'Apply');
    if(approved!=='Apply')return;
    await hub.validatePlan(plan,context);
    if(await host.project()!==root)throw new Error('The student project changed during review.');
    const editor=await vscode.window.showTextDocument(document,{preview:false});
    await hub.validatePlan(plan,context);
    if(await host.project()!==root||document.version!==capturedVersion||document.isDirty||document.getText()!==plan.beforeText)throw new Error('The project or POM changed. No dependency edit applied.');
    const edited=await editor.edit(edit=>edit.replace(new vscode.Range(document.positionAt(0),document.positionAt(plan.beforeText.length)),plan.afterText));
    if(!edited)throw new Error('The POM changed during the edit. Review again.');
    if(!await document.save())throw new Error('Save pom.xml or Undo before running your app.');
    await vscode.window.showInformationMessage(`Library ${chosen.release.libraryId} ${chosen.release.version} recorded. Use import ${chosen.release.namespace}.${chosen.component.className}; then Run App.`);
  }
  return {browse,commands:{'zero.browseHub':async()=>{
    if(host.isBusy())return;host.setBusy(true);
    try {return await browse();}finally{host.setBusy(false);}
  }}};
}
module.exports={createHubActions};
