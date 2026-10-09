'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const components = require('./components');
const xml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

function createComponentActions(vscode, context, host, options = {}) {
  const remember = 'zero.localComponentCatalog';
  async function catalog(reselect = false) {
    let filename = context.workspaceState.get(remember);
    if (reselect) {
      const chosen = await vscode.window.showOpenDialog({title:'Choose a local component catalog',canSelectMany:false,filters:{'Component catalog':['json']}});
      if (!chosen) return;
      filename = chosen[0].fsPath;
    }
    if (!filename) return components.loadPublicCatalog(options.publicCatalog);
    const result = await components.loadCatalog(filename);
    await context.workspaceState.update(remember,filename);
    return result;
  }
  async function change(operation, selected) {
    if (vscode.workspace.isTrusted === false) throw new Error('Trust this student project before changing its Maven dependencies.');
    const root = await host.project();
    const source = selected || await catalog();
    if (!source) return;
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root,'pom.xml')));
    if (document.isDirty) throw new Error('Save pom.xml before reviewing a component change.');
    const plan = await components.prepareChange(root,source,operation === 'revert' ? null : source.catalog.latest,{operation});
    if (document.getText() !== plan.beforeText) throw new Error('The Maven file changed. Review the component change again.');
    const version = document.version;
    const action = operation === 'update' ? 'Update & Run' : operation === 'revert' ? 'Revert & Run' : 'Add library';
    const publicSource = source.catalog.origin === 'public-release';
    const release = source.catalog.releases.find(item => item.version === plan.targetVersion);
    const approved = await vscode.window.showInformationMessage(`${action}?`,{modal:true,detail:
      `${plan.summary}\n\nCatalog: ${source.catalogUrl || source.catalogPath}\n${publicSource ? `${source.catalog.components[0].status} · MIT\nJava 17 · JavaFX 21.0.12\n${release.notes}` : 'Experimental local proof; public community acceptance is not configured.'}\n\nOnly the managed dependency/repository/history in pom.xml changes. Your Java source stays editable. No Git commit, upload or automatic future upgrade.`},action);
    if (approved !== action) return;
    if (await host.project() !== root) throw new Error('The student project changed. Review the component change again.');
    await components.validatePrepared(plan,source);
    const editor = await vscode.window.showTextDocument(document,{preview:false});
    if (await host.project() !== root) throw new Error('The student project changed during review. No dependency edit applied.');
    await components.validatePrepared(plan,source);
    if (document.version !== version || document.isDirty || document.getText() !== plan.beforeText) throw new Error('The Maven file changed during review. No dependency edit applied.');
    // TextEditor.edit carries the captured document version to VS Code and is
    // undoable; a native competing editor edit rejects the transaction.
    const edited = await editor.edit(edit => edit.replace(new vscode.Range(document.positionAt(0),document.positionAt(plan.beforeText.length)),plan.afterText));
    if (!edited) throw new Error('The Maven file changed. Review the dependency edit again.');
    if (!(await document.save())) throw new Error('The dependency edit remains in the editor. Save it or Undo before running.');
    if (operation !== 'add') {
      if (await host.project() !== root) throw new Error('The project changed after the dependency edit. Run the original app explicitly.');
      await host.run(root);
    }
    void vscode.window.showInformationMessage(`Community library ${plan.targetVersion} recorded. ${operation === 'add' ? 'Run your app after using its API.' : 'Check your app behavior in the opened window.'}`);
  }
  async function browse() {
    const source = await catalog(); if (!source) return;
    const publicSource = source.catalog.origin === 'public-release';
    const chosen = await vscode.window.showQuickPick(source.catalog.components.map(item=>({label:item.name,description:publicSource ? `${item.status} · ${source.catalog.latest} · MIT` : 'Experimental local proof',detail:item.description,component:item})),{title:'Community components',placeHolder:'Inspect a component before adding its library'});
    if (!chosen) return;
    const action = await vscode.window.showQuickPick([
      {label:'View API',action:'api'}, ...(publicSource ? [{label:'View source on GitHub',action:'source'}] : []),
      {label:'Try example locally',action:'try'}, {label:'Add library to this app',action:'add'}
    ],{title:chosen.label,placeHolder:'Source, example and installation'});
    if (action?.action === 'api') {
      const doc = await vscode.workspace.openTextDocument({language:'plaintext',content:
        `${chosen.label}\n\n${chosen.component.description}\n\n${publicSource ? `${chosen.component.status} · MIT` : 'Experimental local proof'} · ${source.catalog.latest}\nJava 17 · JavaFX 21.0.12\n\n${chosen.component.api.join('\n')}\n\nInstalled as ${source.catalog.library.groupId}:${source.catalog.library.artifactId}; examples run locally.\n`});
      await vscode.window.showTextDocument(doc,{preview:true});
    } else if (action?.action === 'source') {
      const release = source.catalog.releases.find(item => item.version === source.catalog.latest);
      await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/codepetca/zero-community/blob/${release.sourceRevision}/src/main/java/zero/community/HealthBar.java`));
    } else if (action?.action === 'add') await change('add',source);
    else if (action?.action === 'try') await tryExample(source);
  }
  async function tryExample(source) {
    if (vscode.workspace.isTrusted === false) throw new Error('Trust the workspace before running a local Java example.');
    const generation = host.captureRunGeneration();
    // Re-read all catalog/artifact hashes immediately before preparing the app.
    const fresh = await components.reloadCatalog(source);
    if (fresh.fingerprint !== source.fingerprint) throw new Error('The component catalog changed. Browse the component again before trying it.');
    source = fresh;
    await components.verifyRelease(source, source.catalog.latest);
    await host.project();
    const destination = await fs.mkdtemp(path.join(os.tmpdir(),'zero-component-example-'));
    await fs.mkdir(path.join(destination,'src/main/java/zero'),{recursive:true});
    const assets = path.join(context.extensionPath,'media/component-example');
    for (const file of ['Main.java','zero/SimpleApp.java']) await fs.copyFile(path.join(assets,file),path.join(destination,'src/main/java',file));
    for (const file of ['mvnw','mvnw.cmd']) await fs.copyFile(path.join(assets,file),path.join(destination,file));
    await fs.cp(path.join(assets,'.mvn'),path.join(destination,'.mvn'),{recursive:true});
    if (process.platform !== 'win32') await fs.chmod(path.join(destination,'mvnw'),0o755);
    await fs.writeFile(path.join(destination,'settings.xml'),'<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"/>\n');
    await fs.writeFile(path.join(destination,'pom.xml'),`<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>school.zero</groupId><artifactId>component-example</artifactId><version>1.0</version><properties><maven.compiler.release>17</maven.compiler.release></properties><repositories><repository><id>zero-local-components</id><url>${xml(source.repositoryUrl)}</url><snapshots><enabled>false</enabled></snapshots></repository></repositories><dependencies><dependency><groupId>school.zero.community</groupId><artifactId>zero-community</artifactId><version>${xml(source.catalog.latest)}</version></dependency><dependency><groupId>org.openjfx</groupId><artifactId>javafx-controls</artifactId><version>21.0.12</version></dependency></dependencies><build><plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId><version>3.14.0</version></plugin><plugin><groupId>org.openjfx</groupId><artifactId>javafx-maven-plugin</artifactId><version>0.0.8</version><configuration><mainClass>Main</mainClass></configuration></plugin></plugins></build></project>\n`);
    let started, cleanupTransferred = false;
    try {
      started = await host.runExample(destination,['-B','--no-transfer-progress','-s',path.join(destination,'settings.xml'),'-gs',path.join(destination,'settings.xml'),`-Dmaven.repo.local=${path.join(destination,'cache')}`,'compile','javafx:run'],generation,()=>{cleanupTransferred=true;});
    } finally {
      if (!started && !cleanupTransferred) await fs.rm(destination,{recursive:true,force:true});
    }
    if (started) void vscode.window.showInformationMessage('Local HealthBar example build started. Stop closes it; your student app files were not changed.');
  }
  async function menu() {
    const choice = await vscode.window.showQuickPick([
      {label:'Browse components…',action:'browse'}, {label:'Update community library…',action:'update'},
      {label:'Revert previous library version…',action:'revert'}, {label:'Choose a local catalog…',action:'catalog'},
      ...(context.workspaceState.get(remember) ? [{label:'Use public community catalog',action:'public'}] : [])
    ],{title:'Zero components',placeHolder:'Browse, try and use a Maven library'});
    if (choice?.action === 'browse') await browse();
    else if (choice?.action === 'catalog') await catalog(true);
    else if (choice?.action === 'public') await context.workspaceState.update(remember,undefined);
    else if (choice) await change(choice.action);
  }
  const guarded = fn => async () => {
    if (host.isBusy()) return;
    host.setBusy(true);
    try {return await fn();} finally {host.setBusy(false);}
  };
  return {'zero.components':guarded(menu),'zero.browseComponents':guarded(browse),
    'zero.updateComponents':guarded(()=>change('update')),'zero.revertComponents':guarded(()=>change('revert'))};
}
module.exports = {createComponentActions};
