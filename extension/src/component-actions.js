'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const components = require('./components');
const {discoveryGroups, recommendationFor, componentVersion, componentVersions} = require('./component-discovery');
const EXAMPLES = new Map([['zero.community.HealthBar','Main.java'], ['zero.community.SegmentedHealthBar','segmented-health-bar/Main.java']]);
function trustedExample(component, version) {
  // Legacy HealthBar catalogs predate per-class availability. New alternatives
  // must state their version history before a packaged example can be offered.
  if (component.className !== 'zero.community.HealthBar' && !component.versions?.includes(version)) return undefined;
  return EXAMPLES.get(component.className);
}
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
  async function change(operation, selected, selectedComponent, selectedVersion) {
    if (vscode.workspace.isTrusted === false) throw new Error('Trust this student project before changing its Maven dependencies.');
    const root = await host.project();
    const source = selected || await catalog();
    if (!source) return;
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root,'pom.xml')));
    if (document.isDirty) throw new Error('Save pom.xml before reviewing a component change.');
    if (operation === 'add' && selectedComponent) {
      const availableVersions = componentVersions(source.catalog, selectedComponent);
      if (!availableVersions.includes(selectedVersion)) throw new Error('Choose a listed version containing this component.');
      const project = await components.readProject(root,source);
      if (document.getText() !== project.beforeText) throw new Error('The Maven file changed. Review the component change again.');
      if (project.currentVersion) {
        const available = availableVersions.includes(project.currentVersion);
        const detail = available
          ? `${selectedComponent.name} is already available in community library ${project.currentVersion}. Use import ${selectedComponent.className}; in your Java source.`
          : `${selectedComponent.name} requires a listed version containing its class, such as ${selectedVersion}. This app currently uses community library ${project.currentVersion}.`;
        await vscode.window.showInformationMessage(`${detail}${project.currentVersion === selectedVersion ? '' : ` The existing ${project.currentVersion} pin is unchanged. Choose Update community library or Revert explicitly to change the library version.`}`);
        return;
      }
    }
    const targetVersion = operation === 'revert' ? null : operation === 'add' && selectedVersion ? selectedVersion : source.catalog.latest;
    const plan = await components.prepareChange(root,source,targetVersion,{operation});
    if (document.getText() !== plan.beforeText) throw new Error('The Maven file changed. Review the component change again.');
    const version = document.version;
    const action = operation === 'update' ? 'Update & Run' : operation === 'revert' ? 'Revert & Run' : 'Add library';
    const publicSource = source.catalog.origin === 'public-release';
    const release = source.catalog.releases.find(item => item.version === plan.targetVersion);
    const approved = await vscode.window.showInformationMessage(`${action}?`,{modal:true,detail:
      `${plan.summary}\n\nCatalog: ${source.catalogUrl || source.catalogPath}\n${publicSource ? `${selectedComponent ? `${selectedComponent.name} · ${selectedComponent.status}` : 'Zero community library'} · MIT\nJava 17 · JavaFX 21.0.12\n${release.notes}` : 'Experimental local proof; public community acceptance is not configured.'}\n\nOnly the managed dependency/repository/history in pom.xml changes. Your Java source stays editable. No Git commit, upload or automatic future upgrade.`},action);
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
    const choices = [];
    const groups = discoveryGroups(source.catalog);
    for (const group of groups) {
      if (source.catalog.discovery || groups.length > 1 || group.id !== 'components') choices.push({label:group.name,kind:vscode.QuickPickItemKind?.Separator ?? -1});
      for (const component of group.components) {
        const recommendation = recommendationFor(source.catalog, component), selectedVersion = componentVersion(source.catalog, component);
        choices.push({label:component.name,description:`${recommendation ? 'Recommended · ' : ''}${selectedVersion} · ${publicSource ? `${component.status} · MIT` : 'Experimental local proof'}`,detail:recommendation ? `${component.description} — ${recommendation.reason}` : component.description,component,selectedVersion});
      }
    }
    const chosen = await vscode.window.showQuickPick(choices,{title:'Community components',placeHolder:'Inspect a component before adding its library'});
    if (!chosen?.component) return;
    let selectedVersion = chosen.selectedVersion;
    while (true) {
      const example = trustedExample(chosen.component, selectedVersion);
      const action = await vscode.window.showQuickPick([
        {label:'View API',action:'api'}, ...(publicSource ? [{label:'View source on GitHub',action:'source'}] : []),
        ...(example ? [{label:'Try example locally',action:'try'}] : []), {label:`Add library ${selectedVersion} to this app`,action:'add'},
        ...(componentVersions(source.catalog, chosen.component).length > 1 ? [{label:'Choose version…',action:'version'}] : [])
      ],{title:`${chosen.label} · ${selectedVersion}`,placeHolder:'Source, example and installation'});
      if (action?.action === 'version') {
        const recommendation = recommendationFor(source.catalog, chosen.component);
        const version = await vscode.window.showQuickPick(componentVersions(source.catalog, chosen.component).reverse().map(version => ({label:version,description:recommendation?.version === version ? 'Recommended starting version' : '',version})),{title:`${chosen.label} versions`,placeHolder:'Choose an exact version containing this component'});
        if (!version) return;
        selectedVersion = version.version; continue;
      }
      if (action?.action === 'api') {
        const doc = await vscode.workspace.openTextDocument({language:'plaintext',content:
          `${chosen.label}\n\n${chosen.component.description}\n\n${publicSource ? `${chosen.component.status} · MIT` : 'Experimental local proof'} · ${selectedVersion}\nJava 17 · JavaFX 21.0.12\n\n${selectedVersion !== source.catalog.latest ? 'Catalog API (latest metadata); inspect source for selected version.\n' : ''}${chosen.component.api.join('\n')}\n\nInstalled as ${source.catalog.library.groupId}:${source.catalog.library.artifactId}:${selectedVersion}; examples run locally.\n`});
        await vscode.window.showTextDocument(doc,{preview:true});
      } else if (action?.action === 'source') {
        const release = source.catalog.releases.find(item => item.version === selectedVersion);
        const className = /^zero\.community\.([A-Z][A-Za-z0-9]*)$/.exec(chosen.component.className)?.[1];
        if (!className) throw new Error('The component source class is not supported.');
        await vscode.env.openExternal(vscode.Uri.parse(`https://github.com/codepetca/zero-community/blob/${release.sourceRevision}/src/main/java/zero/community/${className}.java`));
      } else if (action?.action === 'add') await change('add',source,chosen.component,selectedVersion);
      else if (action?.action === 'try') await tryExample(source,chosen.component,selectedVersion);
      return;
    }
  }
  async function tryExample(source, selectedComponent, selectedVersion) {
    if (vscode.workspace.isTrusted === false) throw new Error('Trust the workspace before running a local Java example.');
    const generation = host.captureRunGeneration();
    // Re-read all catalog/artifact hashes immediately before preparing the app.
    const fresh = await components.reloadCatalog(source);
    if (fresh.fingerprint !== source.fingerprint) throw new Error('The component catalog changed. Browse the component again before trying it.');
    source = fresh;
    const component = source.catalog.components.find(item => item.id === selectedComponent.id && item.className === selectedComponent.className);
    const example = component && trustedExample(component, selectedVersion);
    if (!example || !componentVersions(source.catalog, component).includes(selectedVersion)) throw new Error('No trusted packaged example is available for this component version.');
    await components.verifyRelease(source, selectedVersion);
    await host.project();
    const destination = await fs.mkdtemp(path.join(os.tmpdir(),'zero-component-example-'));
    await fs.mkdir(path.join(destination,'src/main/java/zero'),{recursive:true});
    const assets = path.join(context.extensionPath,'media/component-example');
    await fs.copyFile(path.join(assets,example),path.join(destination,'src/main/java/Main.java'));
    await fs.copyFile(path.join(assets,'zero/SimpleApp.java'),path.join(destination,'src/main/java/zero/SimpleApp.java'));
    for (const file of ['mvnw','mvnw.cmd']) await fs.copyFile(path.join(assets,file),path.join(destination,file));
    await fs.cp(path.join(assets,'.mvn'),path.join(destination,'.mvn'),{recursive:true});
    if (process.platform !== 'win32') await fs.chmod(path.join(destination,'mvnw'),0o755);
    await fs.writeFile(path.join(destination,'settings.xml'),'<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"/>\n');
    await fs.writeFile(path.join(destination,'pom.xml'),`<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion><groupId>school.zero</groupId><artifactId>component-example</artifactId><version>1.0</version><properties><maven.compiler.release>17</maven.compiler.release></properties><repositories><repository><id>zero-local-components</id><url>${xml(source.repositoryUrl)}</url><snapshots><enabled>false</enabled></snapshots></repository></repositories><dependencies><dependency><groupId>school.zero.community</groupId><artifactId>zero-community</artifactId><version>${xml(selectedVersion)}</version></dependency><dependency><groupId>org.openjfx</groupId><artifactId>javafx-controls</artifactId><version>21.0.12</version></dependency></dependencies><build><plugins><plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId><version>3.14.0</version></plugin><plugin><groupId>org.openjfx</groupId><artifactId>javafx-maven-plugin</artifactId><version>0.0.8</version><configuration><mainClass>Main</mainClass></configuration></plugin></plugins></build></project>\n`);
    let started, cleanupTransferred = false;
    try {
      started = await host.runExample(destination,['-B','--no-transfer-progress','-s',path.join(destination,'settings.xml'),'-gs',path.join(destination,'settings.xml'),`-Dmaven.repo.local=${path.join(destination,'cache')}`,'compile','javafx:run'],generation,()=>{cleanupTransferred=true;});
    } finally {
      if (!started && !cleanupTransferred) await fs.rm(destination,{recursive:true,force:true});
    }
    if (started) void vscode.window.showInformationMessage(`Local ${component.name} ${selectedVersion} example build started. Stop closes it; your student app files were not changed.`);
  }
  async function menu() {
    const choice = await vscode.window.showQuickPick([
      {label:'Browse components…',action:'browse'}, {label:'Browse hub libraries…',action:'hub'}, {label:'Update community library…',action:'update'},
      {label:'Revert previous library version…',action:'revert'}, {label:'Choose a local catalog…',action:'catalog'},
      ...(context.workspaceState.get(remember) ? [{label:'Use public community catalog',action:'public'}] : [])
    ],{title:'Zero components',placeHolder:'Browse, try and use a Maven library'});
    if (choice?.action === 'browse') await browse();
    else if (choice?.action === 'hub') await host.browseHub();
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
