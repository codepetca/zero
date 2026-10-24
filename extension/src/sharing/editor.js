'use strict';
const fs=require('node:fs/promises');const path=require('node:path');
const {validateGamePreview,MAX_BYTES}=require('./game-preview');
const {SLUG: PRACTICE_SLUG,isTutorialPractice,practiceCatalogUrl}=require('./tutorial-practice');
const core=require('../core');const {assertShareable,assertOriginalProject,assertContributionProject,tutorialMarker}=require('../lesson-projects');const c=require('./contracts');const authoring=require('./authoring');const checks=require('./local-check');const consumer=require('./consumer');const {createGitHubReader}=require('./github');const {parseXml,single,value}=require('../project-pom');
const fail=message=>{throw new Error(message);};
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function assertSaved(vscode,root) {if((vscode.workspace.textDocuments||[]).some(d=>d.isDirty&&d.uri?.fsPath&&(d.uri.fsPath===root||d.uri.fsPath.startsWith(root+path.sep))))fail('Save your project files before reviewing this action.');}
function trusted(vscode){if(vscode.workspace.isTrusted===false)fail('Trust your own project before editing or running its Java code.');}
async function importEdits(root,sources,namespace) {
 const chosen=new Map();for(const filename of sources){const source=await authoring.read(root,filename);chosen.set(filename,authoring.declaration(source,filename));}
 const edits=[];
 for(const filename of await authoring.javaFiles(root,'src/main/java')) {
  const before=await authoring.read(root,filename);
  if(authoring.isReviewedCoreSource(before,filename))continue; // Fixed core never imports extracted student classes.
  const decl=authoring.declaration(before,filename);let after=before;const additions=[];
  for(const [selectedFilename,item] of chosen) {
   if(selectedFilename===filename)continue;
   const target=`${namespace}.${item.simple}`;
   if(item.packageName) {
    const exactImport=new RegExp(`\\bimport\\s+${escape(item.className)}\\s*;`,'g');
    const maskedWithoutImports=decl.masked.replace(exactImport,'');
    if(new RegExp(`\\b${escape(item.className)}\\b`).test(maskedWithoutImports)||new RegExp(`\\bimport\\s+${escape(item.packageName)}\\s*\\.\\s*\\*\\s*;`).test(decl.masked))fail(`Complex references in ${filename} need manual package/import preparation. Zero only previews direct imports and ordinary same-package references.`);
    const matches=[...authoring.declaration(after,filename).masked.matchAll(exactImport)];
    for (const match of matches.reverse()) after=after.slice(0,match.index)+`import ${target};`+after.slice(match.index+match[0].length);
   }
   if(!chosen.has(filename)&&decl.packageName===item.packageName&&new RegExp(`\\b${escape(item.simple)}\\b`).test(decl.masked)&&!after.includes(`import ${target};`))additions.push(`import ${target};`);
  }
  if(additions.length) {
   const offset=decl.packageRange?decl.packageRange[1]:0;
   after=after.slice(0,offset)+'\n'+additions.join('\n')+'\n'+after.slice(offset);
  }
  if(after!==before)edits.push({path:filename,before,after});
 }
 return edits;
}
function createSharingEditor(vscode,host,options={}) {
 const report=(message,detail=message)=>{host.output.appendLine(detail);host.setState?.(message);};
 const api={authoring:options.authoring||authoring,checks:options.checks||checks,consumer:options.consumer||consumer,reader:options.reader||createGitHubReader,git:options.git||core.git};
 const diagnostics=vscode.languages?.createDiagnosticCollection('zero-library-check');
 function fileDiagnostics(text,root) {
  if(!diagnostics||!vscode.Diagnostic||!vscode.Range)return;const files=new Map();
  for(const line of text.split(/\r?\n/)) {
   const match=/^(?:\[ERROR\] )?(.+\.java):(?:\[(\d+),(\d+)\]\s*|(\d+):\s*)(?:error:\s*)?(.*)$/.exec(line);if(!match)continue;
   const filename=path.resolve(match[1]);if(!filename.startsWith(root+path.sep))continue;const lineNumber=Math.max(0,Number(match[2]||match[4])-1),column=Math.max(0,Number(match[3]||1)-1),uri=vscode.Uri.file(filename);
   const diagnostic=new vscode.Diagnostic(new vscode.Range(lineNumber,column,lineNumber,column+1),match[5],vscode.DiagnosticSeverity.Error);diagnostic.source='Zero library Check';if(!files.has(filename))files.set(filename,{uri,values:[]});files.get(filename).values.push(diagnostic);
  }
  for(const entry of files.values())diagnostics.set(entry.uri,entry.values);
 }
 const config=()=>vscode.workspace.getConfiguration('zero',vscode.workspace.workspaceFolders?.[0]?.uri);
 const bundled=options.kitConfiguration||{};
 function operatorSetting(key,bundledValue,fallback) {
  const configuration=config(),inspected=configuration.inspect?.(key);
  if(configuration.inspect) {
   for(const level of ['workspaceFolderValue','workspaceValue','globalValue'])if(inspected?.[level]!==undefined)return inspected[level];
   if(bundledValue!==undefined)return bundledValue;
   return inspected?.defaultValue??configuration.get(key,fallback);
  }
  // Small hosts/mocks can omit inspect; explicit empty values still disable
  // activation instead of silently falling back to an accepted bundled origin.
  return configuration.get(key,undefined)??bundledValue??fallback;
 }
 const settings=()=>({catalogUrl:operatorSetting('sharingCatalogUrl',bundled.catalogUrl,'https://zero.codepet.ca/api/sharing/catalog/web'),artifactOrigin:operatorSetting('sharingArtifactOrigin',bundled.artifactOrigin,'')});
 const catalogSettings=practice=>{const configured=settings();return practice?{...configured,catalogUrl:practiceCatalogUrl(configured.catalogUrl)}:configured;};
 const practiceDetail=descriptor=>isTutorialPractice(descriptor)?'Tutorial practice · copied CreditsBadge exercise. Listed separately from original contributions.\n':'';
 async function current(root){if(await host.project()!==root)fail('The project changed during review. Prepare this action again.');assertSaved(vscode,root);}
 let running=false;
 async function busy(action){if(running||host.isBusy())return;running=true;host.setBusy(true);try{return await action();}finally{running=false;host.setBusy(false);}}
 async function pickLibrary(root){const libraries=await api.authoring.discoverLibraries(root);if(!libraries.length)fail('Extract a library from this game first.');const chosen=await vscode.window.showQuickPick(libraries.map(l=>({label:l.descriptor.title,description:`${isTutorialPractice(l.descriptor)?'Tutorial practice · ':''}${l.slug} · ${l.mode} · ${l.descriptor.version}`,library:l})),{title:'Library'});return chosen?.library;}
 async function repository(root) {
  await core.assertRepositoryRoot(root,api.git);const parsed=core.parseRepositoryUrl(await api.git(root,['remote','get-url','origin']));
  const ticket=await host.auth.capture(),reader=api.reader({token:ticket.session.accessToken,fetcher:options.fetcher});
  const owner=await reader.authenticatedUser(),metadata=await reader.repository(parsed.page.slice('https://github.com/'.length));
  await host.auth.assertCurrent(ticket);
  const {visibility,ownerType,...repo}=metadata;
  if(owner.githubId!==repo.ownerId)fail('Share from the connected public repository in your signed-in personal GitHub account.');
  return {repository:c.validateRepository(repo),requester:owner,ticket,reader};
 }
 async function reviewPlan(root,plan,title,beforeApply) {
  const mappings=(plan.classes||[]).map(item=>`${item.from} → ${item.to}`).join('\n');
  const detail=practiceDetail(plan.descriptor)+mappings+'\n'+plan.changes.map(change=>`${change.before===null?'Create':change.after===null?'Move from':'Edit'} ${change.path}`).join('\n');
  const approved=await vscode.window.showInformationMessage(title,{modal:true,detail:detail+'\n\nOriginal files are saved for recovery.'},'Review changes','Apply');
  if(approved==='Review changes') {
   for(const change of plan.changes.filter(c=>c.before!==c.after&&(/\.java$/.test(c.path)||['pom.xml','.gitignore','zero-libraries.json'].includes(c.path)))) {
    const before=await vscode.workspace.openTextDocument({content:change.before||'',language:change.path.endsWith('.java')?'java':'xml'}),after=await vscode.workspace.openTextDocument({content:change.after||'',language:change.path.endsWith('.java')?'java':'xml'});
    await vscode.commands.executeCommand('vscode.diff',before.uri,after.uri,`Zero: ${change.path} before → after`);
   }
   if(await vscode.window.showInformationMessage(title,{modal:true,detail},'Apply')!=='Apply')return false;
  } else if(approved!=='Apply')return false;
  await current(root);if(beforeApply)await beforeApply();await current(root);await api.authoring.applyPlan(plan);return true;
 }
 async function extract() {
  trusted(vscode);const root=await host.project();await assertShareable(root);assertSaved(vscode,root);const resolved=await repository(root);
  const properties=single(parseXml(await authoring.read(root,'pom.xml')),'properties',true),entryPoint=properties&&single(properties,'app.mainClass',true),mainClass=entryPoint?value(entryPoint):'Main';
  const candidates=[];for(const filename of await authoring.javaFiles(root,'src/main/java')) {
   if(filename.startsWith('src/main/java/zero/'))continue;
   const source=await authoring.read(root,filename),decl=authoring.declaration(source,filename);if(decl.className===mainClass||/\bpublic\s+static\s+void\s+main\s*\(/.test(decl.masked))continue;
   candidates.push({label:decl.simple,description:filename,path:filename});
  }
  const picked=await vscode.window.showQuickPick(candidates,{title:'Library classes',placeHolder:'Include required helpers',canPickMany:true});if(!picked?.length)return;
  const tutorial=await tutorialMarker(root),practice=tutorial?.tutorialProjectId==='game'&&picked.some(item=>item.label==='CreditsBadge');
  const slug=await input('Library name',practice?PRACTICE_SLUG:'',c.validateSlug);if(!slug)return;
  const title=await input('Library title',picked[0].label);if(!title)return;
  const description=await input('Library description','');if(!description)return;
  const kind=await vscode.window.showQuickPick([{label:'UI component',kind:'widget'},{label:'Ordinary Java helper',kind:'helper'}],{title:'Library kind'});if(!kind)return;
  const version=await input('Library version','0.1.0',c.validateVersion);if(!version)return;
  const license=await input('Library license','MIT');if(!license)return;
  const core=require('../core-contract'),record=await core.readProjectCore(root);
  const coreFields=record?{coreRequirement:{minVersion:record.coordinate.version,maxExclusive:`0.${Number(record.coordinate.version.split('.')[1])+1}.0`},coreInput:{version:record.coordinate.version,sourceSha256:record.sourceSha256}}:{};
  const descriptor=c.validateDescriptor({schema:record?2:1,kind:'library',slug,version,title,description,license,libraryKind:kind.kind,...coreFields});
  const sources=picked.map(p=>p.path),edits=await importEdits(root,sources,c.identity('library',resolved.repository.id,slug).namespace);
  const plan=await api.authoring.previewExtraction(root,{repository:resolved.repository,descriptor,sources,edits});
  const ignored=await authoring.read(root,'.gitignore',true),line='.zero-sharing-recovery/';
  if(!ignored?.split(/\r?\n/).includes(line))plan.changes.push({path:'.gitignore',before:ignored,after:(ignored||'')+((ignored&&!ignored.endsWith('\n'))?'\n':'')+line+'\n'});
  await host.auth.assertCurrent(resolved.ticket);
  if(await reviewPlan(root,plan,`Extract ${isTutorialPractice(descriptor)?'practice library ':''}${title} into libraries/${slug}?`)) {
   report('Library extracted','Library extracted. Run App, then write the scaffolded behavior check and two examples before Check library. Commit & push separately before sharing.');
   await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root,`libraries/${slug}/src/test/java/LibraryCheck.java`))),{preview:false});
  }
 }
 async function input(title,initial,validate) {return vscode.window.showInputBox({title,value:initial,validateInput:text=>{try{if(!text.trim())return 'Enter a value.';validate?.(text);}catch(error){return error.message;}}});}
 async function check() {
  trusted(vscode);const root=await host.project();assertSaved(vscode,root);const lib=await pickLibrary(root);if(!lib)return;
  if(await vscode.window.showInformationMessage(`Check ${lib.descriptor.title}?`,{modal:true,detail:practiceDetail(lib.descriptor)+'Builds the library JAR and runs your checks and both examples with Run App permissions.'},'Check library')!=='Check library')return;
  await current(root);diagnostics?.clear();
  await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:`Check ${lib.descriptor.title}`,cancellable:true},async(progress,cancellation)=>{
   const controller=new AbortController(),subscription=cancellation.onCancellationRequested(()=>controller.abort());
   let plan;try{progress.report({message:'Building the independent library and its behavior checks…'});plan=await api.checks.prepareLocalCheck(root,lib.slug);const result=await api.checks.runLocalCheck(plan,{signal:controller.signal});for(const output of result.outputs)host.output.appendLine(output.output);report(`${lib.descriptor.title}: checks passed`,`${lib.descriptor.title} ${result.version}: local JAR checks and both examples passed.`);}catch(error){fileDiagnostics(error.message,root);host.output.appendLine(error.message);host.output.show?.(true);throw error;}finally{subscription.dispose();}
  });
 }
 async function mode() {
  trusted(vscode);const root=await host.project();assertSaved(vscode,root);const lib=await pickLibrary(root);if(!lib)return;
  const selected=await vscode.window.showQuickPick([{label:'Develop local library',mode:'local'},{label:'Use published version',mode:'published'}],{title:lib.descriptor.title});if(!selected)return;
  const modeSettings=selected.mode==='published'?catalogSettings(isTutorialPractice(lib.descriptor)):undefined;
  let version,published;if(selected.mode==='published') {
   const context=await api.consumer.loadCatalog(modeSettings,{fetcher:options.fetcher});const versions=context.catalog.releases.filter(r=>r.kind==='library'&&r.id===lib.identity.id&&r.status==='available');
   const picked=await vscode.window.showQuickPick(versions.map(release=>({label:release.version,description:release.title,release})),{title:'Published version'});if(!picked)return;
   await api.consumer.verifyLibrary(context,picked.release);version=picked.release.version;published={context,release:picked.release};
  }
  const plan=await api.authoring.previewMode(root,{slug:lib.slug,mode:selected.mode,version,...(published?{publishedRelease:published.release}:{})});
  if(published) {const pom=plan.changes.find(c=>c.path==='pom.xml');pom.after=api.consumer.addArtifactRepository(pom.after,published.context.artifactOrigin);}
  const revalidate=published?async()=>{const fresh=await api.consumer.loadCatalog(catalogSettings(isTutorialPractice(lib.descriptor)),{fetcher:options.fetcher});if(fresh.fingerprint!==published.context.fingerprint)fail('The catalog changed during mode review. Choose the published version again.');await api.consumer.verifyLibrary(fresh,published.release);}:undefined;
  if(await reviewPlan(root,plan,`${isTutorialPractice(lib.descriptor)?'Tutorial practice · ':''}${selected.label}: ${lib.descriptor.title}?`,revalidate))report('Library mode changed','Library mode changed. Run App to check your game. Editable library source was preserved.');
 }
 async function recovery() {
  trusted(vscode);const root=await host.project();assertSaved(vscode,root);const directory=path.join(root,'.zero-sharing-recovery');
  const stat=await fs.lstat(directory).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(!stat){report('No saved library changes','There are no saved library changes to recover.');return;}if(!stat.isDirectory()||stat.isSymbolicLink())fail('Use an ordinary saved recovery directory.');
  const entries=[];for(const name of await fs.readdir(directory))if(/^[a-f0-9-]+\.json$/.test(name)) {
   const filename=`.zero-sharing-recovery/${name}`,contents=await authoring.read(root,filename),receipt=JSON.parse(contents);if(receipt.status==='rolled-back')continue;
   if(receipt.root!==root||receipt.recovery!==filename||!Array.isArray(receipt.changes))fail('Recovery belongs to another project or has changed.');
   const modified=(await fs.stat(path.join(root,filename))).mtime.toISOString();entries.push({label:`${receipt.kind} · ${modified}`,description:filename,filename,receipt});
  }
  const picked=await vscode.window.showQuickPick(entries.reverse(),{title:'Saved library change'});if(!picked)return;
  if(await vscode.window.showInformationMessage('Restore original files?',{modal:true,detail:picked.receipt.changes.map(c=>c.path).join('\n')+'\n\nNewer edits prevent restoration and are preserved.'},'Restore originals')!=='Restore originals')return;
  await current(root);await api.authoring.recover(root,picked.filename);report('Files restored','Original files restored. Run App to check your project.');
 }
 async function saveDescriptor(root,filename,descriptor) {
  const before=await authoring.read(root,filename,true),after=JSON.stringify(c.validateDescriptor(descriptor),null,2)+'\n';if(before===after)return;
  if(await vscode.window.showInformationMessage('Save sharing details?',{modal:true,detail:`${practiceDetail(descriptor)}${descriptor.title} ${descriptor.version}\n${descriptor.description}${descriptor.controls?'\nControls: '+descriptor.controls:''}\nLicense: ${descriptor.license}\n\n${filename}\nCommit & push uploads these details with your source.`},'Save details')!=='Save details')return false;
  await current(root);
  if(before===null)await fs.writeFile(await authoring.safePath(root,filename,{missing:true}),after,{flag:'wx'});
  else {const document=await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root,filename)));if(document.isDirty||document.getText()!==before)fail('Sharing metadata changed during review.');const editor=await vscode.window.showTextDocument(document,{preview:false});if(!await editor.edit(edit=>edit.replace(new vscode.Range(document.positionAt(0),document.positionAt(before.length)),after)))fail('Sharing metadata changed during the edit.');if(!await document.save())fail('Save the sharing metadata before Commit & push.');}
  return true;
 }
 async function gameDescriptor(root,creation) {
  const stored=await authoring.read(root,'zero-game.json',true);if(stored!==null){const descriptor=c.validateDescriptor(JSON.parse(stored));if(descriptor.kind!=='game')fail('Use game metadata in zero-game.json.');return descriptor;}
  const slug=await input('Game name','',c.validateSlug);if(!slug)return;
  const title=await input('Game title','');if(!title)return;
  const description=await input('Game description','');if(!description)return;
  const controls=await input('Game controls','');if(!controls)return;
  const version=await input('Game version','0.1.0',c.validateVersion);if(!version)return;
  const license=await input('Game license','MIT');if(!license)return;
  const preview=await gameScreenshot(root);if(!preview)return;
  const descriptor=c.validateDescriptor({schema:1,kind:'game',slug,title,description,controls,version,license,preview});if(await saveDescriptor(root,'zero-game.json',descriptor)===false)return;if(creation)creation.created=true;return descriptor;
 }
 async function gameScreenshot(root,previous='preview.png') {
  const preview=await input('Square PNG path',previous,value=>{c.validateFolder(value);if(!value.endsWith('.png'))fail('Use a PNG screenshot.');});if(!preview)return;
  const filename=await authoring.safePath(root,preview);
  try{if((await fs.stat(filename)).size>MAX_BYTES)fail('Screenshot too large');validateGamePreview(await fs.readFile(filename));}catch{fail('Use an existing valid square PNG screenshot, at most 2048 × 2048 pixels and 4 MiB.');}
  return preview;
 }
 async function editDetails() {
  trusted(vscode);const root=await host.project();assertSaved(vscode,root);
  const selected=await vscode.window.showQuickPick([{label:'Game sharing details',kind:'game'},{label:'Library sharing details',kind:'library'}],{title:'Edit sharing details'});if(!selected)return;
  let descriptor,filename;if(selected.kind==='library'){const lib=await pickLibrary(root);if(!lib)return;descriptor=lib.descriptor;filename=`${lib.folder}/zero-library.json`;}else{descriptor=await gameDescriptor(root);filename='zero-game.json';if(!descriptor)return;}
  const title=await input('Sharing title',descriptor.title);if(!title)return;
  const description=await input('Sharing description',descriptor.description);if(!description)return;
  const version=await input('Sharing version',descriptor.version,c.validateVersion);if(!version)return;
  const license=await input('Sharing license',descriptor.license);if(!license)return;
  let controls=descriptor.controls;if(descriptor.kind==='game'){controls=await input('Game controls',controls);if(!controls)return;}
  const preview=descriptor.kind==='game'?await gameScreenshot(root,descriptor.preview||'preview.png'):await vscode.window.showInputBox({title:'Preview PNG path (optional)',value:descriptor.preview||''});if(preview===undefined||descriptor.kind==='game'&&!preview)return;
  const updated={...descriptor,title,description,version,license};if(descriptor.kind==='game')updated.controls=controls;if(preview)updated.preview=preview;else delete updated.preview;
  if(await saveDescriptor(root,filename,updated)!==false)report('Sharing details saved','Sharing details saved. Commit & push separately, then Share the committed version.');
 }
 async function share(kind) {
  trusted(vscode);const root=await host.project();await assertShareable(root);const tutorial=await tutorialMarker(root);if(kind==='game'||tutorial&&tutorial.tutorialProjectId!=='game')await assertOriginalProject(root);assertSaved(vscode,root);let folder='.',filename='zero-game.json',descriptor;const creation={};
  if(kind==='library'){const lib=await pickLibrary(root);if(!lib)return;folder=lib.folder;filename=`${folder}/zero-library.json`;descriptor=lib.descriptor;}else descriptor=await gameDescriptor(root,creation);
  if(!descriptor)return;
  await assertContributionProject(root,descriptor);
  if(kind==='game'&&!descriptor.preview){const preview=await gameScreenshot(root);if(!preview)return;descriptor={...descriptor,preview};if(await saveDescriptor(root,filename,descriptor)===false)return;}
  if(!creation.created) {
   const requestedVersion=await input('Sharing version',descriptor.version,c.validateVersion);if(!requestedVersion)return;
   if(requestedVersion!==descriptor.version) {descriptor={...descriptor,version:requestedVersion};if(await saveDescriptor(root,filename,descriptor)===false)return;}
  }
  const policyRevision=operatorSetting('sharingPolicyRevision',bundled.policyRevision,'');if(!/^[a-f0-9]{40}$/.test(policyRevision))fail('Sharing setup needs an active reviewed policy. This kit can prepare local libraries; public sharing is not active yet.');
  let previous;
  async function freshRepository() {
   trusted(vscode);await current(root);await assertContributionProject(root,descriptor);
   if(previous)await host.auth.assertCurrent(previous.ticket);
   const fresh=await repository(root);
   if(previous&&JSON.stringify(fresh.repository)!==JSON.stringify(previous.repository))fail('The connected repository changed. Share again from the intended repository.');
   previous=fresh;return fresh;
  }
  async function afterHandoff(ticket) {
   trusted(vscode);await current(root);
   // App session refresh may replace the base credential. Keep account
   // ownership stable while accepting a fresh token/revision after that action.
   const fresh=await host.auth.capture();
   if(!ticket.session.accountId||fresh.session.accountId!==ticket.session.accountId)fail('The GitHub account changed during sharing. Share again with the original account.');
   await host.auth.assertCurrent(fresh);
   if(previous)previous={...previous,ticket:fresh};
  }
  async function prepare() {
   trusted(vscode);await current(root);
   if((await api.git(root,['status','--porcelain','-z'])).length)fail('Commit & push your changes before sharing this version.');
   const resolved=await freshRepository(),commit=(await api.git(root,['rev-parse','HEAD'])).trim();
   if(!/^[a-f0-9]{40}$/.test(commit))fail('Commit & push your first version before sharing.');
   const saved=c.validateDescriptor(JSON.parse(await authoring.read(root,filename)));
   if(JSON.stringify(saved)!==JSON.stringify(descriptor))fail('Sharing details changed. Review them and Share again.');
   let committed;try{committed=c.validateDescriptor(JSON.parse(await api.git(root,['show',`${commit}:${filename}`])));}catch{fail('Commit & push the sharing metadata first, then choose Share again.');}
   if(JSON.stringify(committed)!==JSON.stringify(descriptor))fail('The committed sharing details differ. Commit & push before sharing.');
   const request=c.validateRequest({schema:1,kind,slug:descriptor.slug,version:descriptor.version,repository:resolved.repository,requester:resolved.requester,commit,folder,descriptor:committed,policyRevision});
   // Confirm the exact fresh commit is uploaded and accessible, after each handoff.
   await resolved.reader.source(request);
   const web=kind==='game'&&host.verifiedPublication?await host.verifiedPublication(root,commit):undefined;
   await current(root);await host.auth.assertCurrent(resolved.ticket);
   return {resolved,commit,request:web?c.validateRequest({...request,web}):request,web};
  }
  if((await api.git(root,['status','--porcelain','-z'])).length) {
   if(kind!=='game'||!host.uploadForSharing)fail('Commit & push through the reviewed GitHub action before sharing. Zero will not commit or upload from Share.');
   const before=await freshRepository();
   const choice=await vscode.window.showQuickPick([{label:'Commit & push',action:'upload',description:'Upload this game and its saved sharing details'}],{title:'Upload game before sharing'});
   if(choice?.action!=='upload'){report('Sharing details kept · Commit & push, then Share game');return;}
   trusted(vscode);await current(root);await host.auth.assertCurrent(before.ticket);
   const uploaded=await host.uploadForSharing(root);
   if(uploaded?.uploaded!==true){report('Share paused · Commit & push, then Share game');return;}
   await afterHandoff(before.ticket);
  }
  let prepared=await prepare();
  if(kind==='game'&&!prepared.web&&host.publishForSharing) {
   const choice=await vscode.window.showQuickPick([{label:'Publish app and continue',action:'publish',description:'Include a playable app with this source snapshot'},{label:'Share source only',action:'source',description:'Students can download the game project'}],{title:'Include a playable app?'});
   if(!choice){report('Share paused · choose Share game to continue');return;}
   if(choice.action==='publish') {
    trusted(vscode);await current(root);await host.auth.assertCurrent(prepared.resolved.ticket);
    const published=await host.publishForSharing(root);
    if(published?.status!=='live'){report('Share paused · Publish app, then Share game');return;}
    await afterHandoff(prepared.resolved.ticket);
    prepared=await prepare();
    if(!prepared.web)fail('The published app could not be verified for this exact source revision. Publish app, then Share game again.');
   }else if(choice.action!=='source')return;
  }
  const {resolved,commit,request,web}=prepared;
  const webDetail=kind==='game' ? web ? `\nPlay latest: ${web.url}\nThe student-hosted live app can update; the source snapshot stays at this version.` : '\nSource only.' : '';
  const approved=await vscode.window.showInformationMessage(`Open the ${isTutorialPractice(descriptor)?'practice library':kind} publication form?`,{modal:true,detail:`${practiceDetail(descriptor)}${descriptor.title} ${descriptor.version}\n${resolved.repository.url}\nRevision ${commit}\nFolder ${folder}\nGitHub: ${resolved.requester.login}${webDetail}\n\nReview and submit on GitHub. Uncommitted files are excluded.`},'Open GitHub form');if(approved!=='Open GitHub form')return;
  trusted(vscode);await current(root);await assertContributionProject(root,descriptor);await host.auth.assertCurrent(resolved.ticket);
  if((await api.git(root,['rev-parse','HEAD'])).trim()!==commit||(await api.git(root,['status','--porcelain','-z'])).length)fail('The committed revision or files changed during review. Share again.');
  if(!await vscode.env.openExternal(vscode.Uri.parse(c.publicationUrl(request))))fail('Could not open the GitHub publication form.');
  report('Form opened · submit on GitHub');
 }
 async function applyDependency(root,context,release,operation) {
  trusted(vscode);assertSaved(vscode,root);
  const document=await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root,'pom.xml')));if(document.isDirty)fail('Save pom.xml before reviewing a dependency change.');
  const plan=await api.consumer.planChange(root,context,release,{operation}),version=document.version;if(document.getText()!==plan.beforeText)fail('The POM changed during preparation.');
  if(await vscode.window.showInformationMessage(`${operation}: ${release.title} ${release.version}?`,{modal:true,detail:`${practiceDetail(release)}${plan.current||'Not installed'} → ${release.version}\nContributor: ${release.contributor.login}\nimport ${release.namespace}…\n\nUpdates pom.xml and previous-version history.`},'Apply')!=='Apply')return;
  await current(root);await api.consumer.validatePlan(plan,context);
  const editor=await vscode.window.showTextDocument(document,{preview:false});
  if(document.version!==version||document.isDirty||document.getText()!==plan.beforeText)fail('The POM changed during review.');
  if(!await editor.edit(edit=>edit.replace(new vscode.Range(document.positionAt(0),document.positionAt(plan.beforeText.length)),plan.afterText)))fail('The POM changed during the edit.');
  if(!await document.save())fail('Save pom.xml or Undo before running the app.');report(`${release.title} ${release.version} recorded`,`${release.title} ${release.version} recorded. Import its classes and choose Run App.`);
 }
 async function openGame(context,release) {
  trusted(vscode);
  const destination=await vscode.window.showSaveDialog({title:'New project folder',saveLabel:'Open project'});if(!destination)return;
  const bytes=await api.consumer.downloadGame(context,release),archive=options.archive||require('./archive');
  const approved=await vscode.window.showInformationMessage(`Open ${release.title} ${release.version} in a new folder?`,{modal:true,detail:`Contributor: ${release.contributor.login}\n${destination.fsPath}\n\nOpens the verified source as a separate editable project. Running it requires workspace trust.`},'Open project');if(approved!=='Open project')return;
  await archive.extractGamePackage({bytes,destination:destination.fsPath,expectedSha256:release.artifacts.zip.sha256});
  await vscode.commands.executeCommand('vscode.openFolder',vscode.Uri.file(destination.fsPath),{forceNewWindow:true});
 }
 async function browse(kind,practice=false) {
  const context=await api.consumer.loadCatalog(catalogSettings(practice),{fetcher:options.fetcher});
  const releases=context.catalog.releases.filter(r=>r.status==='available'&&(!kind||r.kind===kind)&&isTutorialPractice(r)===practice);
  if(!releases.length&&practice){report('No tutorial practice libraries','No tutorial practice libraries are available yet.');return;}
  if(!releases.length){report(`No shared ${kind==='game'?'games':'libraries'}`,`No shared ${kind==='game'?'games':'libraries'} are available yet.`);return;}
  const picked=await vscode.window.showQuickPick(releases.map(release=>({label:release.title,description:`${practice?'Tutorial practice · ':''}${release.version} · ${release.contributor.login} · ${release.kind}`,detail:release.description,release})),{title:practice?'Tutorial practice libraries':kind==='game'?'Shared games':'Shared libraries',matchOnDescription:true});if(!picked)return;
  if(picked.release.kind==='game') {
   if(picked.release.web) {
    const web=c.validateWebPublication(picked.release.web,{commit:picked.release.source.commit});
    const action=await vscode.window.showQuickPick([{label:'Play latest',description:'Student-hosted live app',action:'play'},{label:'Open source project',description:`Exact source snapshot ${picked.release.version}`,action:'source'}],{title:picked.release.title});
    if(!action)return;
    if(action.action==='play'){if(!await vscode.env.openExternal(vscode.Uri.parse(web.url)))fail('Could not open the student-hosted game. Try again.');return;}
   }
   return openGame(context,picked.release);
  }
  const action=await vscode.window.showQuickPick([{label:'Add library',operation:'add'},{label:'Update to this version',operation:'update'},{label:'Revert to previous version',operation:'revert'}],{title:picked.release.title});if(action)await applyDependency(await host.project(),context,picked.release,action.operation);
 }
 const actions={extract,check,mode,recovery,editDetails,shareGame:()=>share('game'),shareLibrary:()=>share('library'),browseHub:()=>browse('library'),browsePractice:()=>browse('library',true),browseGames:()=>browse('game')};
 const commands={
  'zero.editSharingDetails':()=>busy(editDetails),'zero.recoverLibraryChange':()=>busy(recovery),'zero.extractLibrary':()=>busy(extract),'zero.checkLibrary':()=>busy(check),'zero.switchLibraryMode':()=>busy(mode),'zero.shareLibrary':()=>busy(()=>share('library')),'zero.shareGame':()=>busy(()=>share('game')),
  'zero.browseHub':()=>busy(()=>browse('library')),'zero.browseTutorialPractice':()=>busy(()=>browse('library',true)),'zero.browseGames':()=>busy(()=>browse('game')),'zero.openProject':()=>busy(()=>browse('game')),
  'zero.sharingActions':()=>busy(async()=>{const picked=await vscode.window.showQuickPick([{label:'Browse libraries',command:'zero.browseHub'},{label:'Browse tutorial practice',command:'zero.browseTutorialPractice'},{label:'Browse games / Open project',command:'zero.browseGames'},{label:'Extract library',command:'zero.extractLibrary'},{label:'Check library',command:'zero.checkLibrary'},{label:'Share library',command:'zero.shareLibrary'},{label:'Share game',command:'zero.shareGame'},{label:'Develop local / Use published library',command:'zero.switchLibraryMode'},{label:'Recover a library change',command:'zero.recoverLibraryChange'},{label:'Edit sharing details',command:'zero.editSharingDetails'}],{title:'Libraries and games'});if(picked){const selected={'zero.browseHub':actions.browseHub,'zero.browseTutorialPractice':actions.browsePractice,'zero.browseGames':actions.browseGames,'zero.extractLibrary':extract,'zero.checkLibrary':check,'zero.shareLibrary':actions.shareLibrary,'zero.shareGame':actions.shareGame,'zero.switchLibraryMode':mode,'zero.recoverLibraryChange':recovery,'zero.editSharingDetails':editDetails}[picked.command];if(selected)await selected();}})
 };
 return {commands,importEdits,disposables:diagnostics?[diagnostics]:[]};
}
module.exports={createSharingEditor,importEdits,assertSaved};
