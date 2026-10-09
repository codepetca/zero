'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const components = require('./components');
const xml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

function createComponentActions(vscode, context, host) {
  const remember = 'zero.localComponentCatalog';
  async function catalog(reselect = false) {
    let filename = reselect ? undefined : context.workspaceState.get(remember);
    if (!filename) {
      const chosen = await vscode.window.showOpenDialog({title:'Choose a local component catalog',canSelectMany:false,filters:{'Component catalog':['json']}});
      if (!chosen) return;
      filename = chosen[0].fsPath;
    }
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
    const approved = await vscode.window.showInformationMessage(`${action}?`,{modal:true,detail:
      `${plan.summary}\n\nCatalog: ${source.catalogPath}\nExperimental local proof; public community acceptance is not configured.\n\nOnly the managed dependency/repository/history in pom.xml changes. Your Java source stays editable. No Git commit, upload or automatic future upgrade.`},action);
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
      await host.run();
    }
    void vscode.window.showInformationMessage(`Community library ${plan.targetVersion} recorded. ${operation === 'add' ? 'Run your app after using its API.' : 'Check your app behavior in the opened window.'}`);
  }
  async function browse() {
    const source = await catalog(); if (!source) return;
    const chosen = await vscode.window.showQuickPick(source.catalog.components.map(item=>({label:item.name,description:'Experimental local proof',detail:item.description,component:item})),{title:'Community components',placeHolder:'Inspect a component before adding its library'});
    if (!chosen) return;
    const action = await vscode.window.showQuickPick([
      {label:'View API',action:'api'}, {label:'Try example locally',action:'try'}, {label:'Add library to this app',action:'add'}
    ],{title:chosen.label,placeHolder:'Source, example and installation'});
    if (action?.action === 'api') {
      const doc = await vscode.workspace.openTextDocument({language:'markdown',content:
        `# ${chosen.label}\n\n${chosen.component.description}\n\nExperimental local proof · ${source.catalog.latest}\n\n${chosen.component.api.map(value=>'    '+value).join('\n')}\n\nInstalled as ${source.catalog.library.groupId}:${source.catalog.library.artifactId}; examples run locally.\n`});
      await vscode.window.showTextDocument(doc,{preview:true});
    } else if (action?.action === 'add') await change('add',source);
    else if (action?.action === 'try') await tryExample(source);
  }
  async function tryExample(source) {
    if (vscode.workspace.isTrusted === false) throw new Error('Trust the workspace before running a local Java example.');
    const generation = host.captureRunGeneration();
    // Re-read all catalog/artifact hashes immediately before preparing the app.
    source = await components.loadCatalog(source.catalogPath);
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
    let started;
    try {
      started = await host.runExample(destination,['-B','--no-transfer-progress','-s',path.join(destination,'settings.xml'),'-gs',path.join(destination,'settings.xml'),`-Dmaven.repo.local=${path.join(destination,'cache')}`,'compile','javafx:run'],generation);
    } finally {
      if (!started) await fs.rm(destination,{recursive:true,force:true});
    }
    if (started) void vscode.window.showInformationMessage('Local HealthBar example build started. Stop closes it; your student app files were not changed.');
  }
  async function menu() {
    const choice = await vscode.window.showQuickPick([
      {label:'Browse components…',action:'browse'}, {label:'Update community library…',action:'update'},
      {label:'Revert previous library version…',action:'revert'}, {label:'Choose another local catalog…',action:'catalog'}
    ],{title:'Zero components',placeHolder:'Local proof — Maven owns dependency versions'});
    if (choice?.action === 'browse') await browse();
    else if (choice?.action === 'catalog') await catalog(true);
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
