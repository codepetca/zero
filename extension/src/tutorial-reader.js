'use strict';
const path = require('node:path');
const {randomBytes,createHash} = require('node:crypto');
const {LESSON_IDS,escapeHtml,loadContent,browserUrl,renderLessons} = require('./tutorial-content');
const EXTERNAL_LINKS = new Set(['https://zero.codepet.ca/hub','https://zero.codepet.ca/hub?kind=practice','https://zero.codepet.ca/generated/learning-assets/game-assets.zip']);
function rootKey(root) {return `zero.tutorialReader.${createHash('sha256').update(root ? path.resolve(root) : 'no-project').digest('hex')}`;}
function cleanState(value, fallback = '0') {
  const state = {lessonId:LESSON_IDS.includes(value?.lessonId) ? value.lessonId : LESSON_IDS.includes(fallback) ? fallback : '0',scroll:{},details:{}};
  for (const id of LESSON_IDS) {
    const scroll = value?.scroll?.[id];
    if (Number.isFinite(scroll) && scroll >= 0 && scroll <= 1000000) state.scroll[id] = scroll;
  }
  if (value?.details && typeof value.details === 'object') {
    for (const [id,open] of Object.entries(value.details).slice(0,300)) if (/^(?:explanation-(?:[0-9]|1[0-2])|reference-(?:[0-9]|1[0-2])-\d{1,3})$/.test(id) && typeof open === 'boolean') state.details[id] = open;
  }
  return state;
}
function createTutorialReader(vscode,{context,output,project,load = loadContent}) {
  const extensionPath = context.extensionPath || path.resolve(__dirname,'..');
  const panels = new Map();
  let disposed = false, bundlePromise;
  const report = async error => {
    output?.appendLine(`Tutorials: ${error.message}`);
    await vscode.window.showErrorMessage(`Could not open Tutorials: ${error.message}`);
  };
  async function currentRoot(root) {
    if (root === undefined && project) {try {root = await project();} catch {root = undefined;}}
    if (root !== undefined && (typeof root !== 'string' || !path.isAbsolute(root))) throw new Error('Tutorials need an absolute project folder.');
    return root;
  }
  function attach(panel,key,initialLessonId,serialized) {
    const saved = serialized?.readerKey === key ? serialized : context.workspaceState.get(key);
    const state = {...cleanState(saved,initialLessonId),readerKey:key};
    const item = {panel,state,ready:false,closed:false,queue:Promise.resolve()};
    panels.set(key,item);
    panel.onDidDispose(() => {item.closed = true;if (panels.get(key) === item) panels.delete(key);});
    item.initializing = (async () => {
      const bundle = await (bundlePromise ||= load(extensionPath));
      if (disposed || item.closed || panels.get(key) !== item) return undefined;
      const media = vscode.Uri.file(path.join(extensionPath,'media'));
      panel.webview.options = {enableScripts:true,enableCommandUris:false,localResourceRoots:[media]};
      const nonce = randomBytes(24).toString('base64');
      const resource = filename => panel.webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath,'media',filename))).toString();
      const rendered = renderLessons(bundle,{assetUri:name => resource(path.join('tutorial-assets',name))});
      const remember = next => {
        item.state = {...cleanState(next,item.state.lessonId),readerKey:key};
        // One ordered write chain per panel prevents slower writes restoring an
        // older navigation event over the student's most recent selection.
        const snapshot = item.state;
        item.queue = item.queue.then(() => context.workspaceState.update(key,snapshot)).catch(error => output?.appendLine(`Tutorial state could not be saved: ${error.message}`));
      };
      panel.webview.onDidReceiveMessage(async message => {
        if (panels.get(key) !== item || !message || typeof message !== 'object') return;
        try {
          if (message.type === 'ready') {item.ready = true;await panel.webview.postMessage({type:'restore',state:item.state});}
          else if (message.type === 'state' && item.ready && message.state?.readerKey === key) remember(message.state);
          else if (message.type === 'browser' && LESSON_IDS.includes(message.lessonId)) {
            if (!await vscode.env.openExternal(vscode.Uri.parse(browserUrl(message.lessonId)))) throw new Error('Your browser could not open the lesson. Try Open in browser again.');
          } else if (message.type === 'external' && EXTERNAL_LINKS.has(message.url)) {
            if (!await vscode.env.openExternal(vscode.Uri.parse(message.url))) throw new Error('Your browser could not open this tutorial link.');
          } else if (message.type === 'copy' && rendered.copies.has(message.id)) {
            try {await vscode.env.clipboard.writeText(rendered.copies.get(message.id));await panel.webview.postMessage({type:'copied',id:message.id,ok:true});}
            catch {await panel.webview.postMessage({type:'copied',id:message.id,ok:false});}
          }
        } catch (error) {await report(error);}
      });
      panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${escapeHtml(panel.webview.cspSource)}; style-src ${escapeHtml(panel.webview.cspSource)}; script-src 'nonce-${nonce}'; connect-src 'none'; base-uri 'none'; form-action 'none';"><link rel="stylesheet" href="${escapeHtml(resource('tutorial-reader.css'))}"><title>Tutorials</title></head><body><header><button type="button" class="text-button" data-index="true">← All tutorials</button><button type="button" class="text-button" id="browser">Open in browser ↗</button></header><div id="lesson-index" hidden><label for="lesson-picker">Choose a tutorial</label><select id="lesson-picker">${rendered.navigation}</select></div><main id="tutorial-content">${rendered.articles}</main><p class="sr-only" role="status" aria-live="polite" id="status"></p><script nonce="${nonce}" src="${escapeHtml(resource('tutorial-reader.js'))}"></script></body></html>`;
      return panel;
    })();
    return item;
  }
  async function open(root, initialLessonId = '0') {
    if (disposed) return undefined;
    root = await currentRoot(root);
    if (disposed) return undefined;
    if (!LESSON_IDS.includes(initialLessonId)) throw new Error('Unknown tutorial.');
    const key = rootKey(root);
    const existing = panels.get(key);
    if (existing) {
      await existing.initializing;
      if (disposed || existing.closed) return undefined;
      existing.panel.reveal(existing.panel.viewColumn || vscode.ViewColumn.Beside,true);
      return existing.panel;
    }
    const media = vscode.Uri.file(path.join(extensionPath,'media'));
    const panel = vscode.window.createWebviewPanel('zero.tutorials','Tutorials',{viewColumn:vscode.ViewColumn.Beside,preserveFocus:true},{enableScripts:true,enableCommandUris:false,retainContextWhenHidden:true,localResourceRoots:[media]});
    try {return await attach(panel,key,initialLessonId).initializing;}
    catch (error) {panel.dispose();throw error;}
  }
  const pendingRestores = new Set();
  const serializer = vscode.window.registerWebviewPanelSerializer?.('zero.tutorials',{
    async deserializeWebviewPanel(panel,serialized) {
      let closed = false;
      const listener = panel.onDidDispose(() => {closed = true;pendingRestores.delete(panel);});
      pendingRestores.add(panel);
      try {
        const root = await currentRoot();
        if (disposed || closed) {if (!closed) panel.dispose();return;}
        const key = rootKey(root);
        // Startup opening and host restoration can race. Keep the panel already
        // owned for this root, and retire only the redundant restored panel.
        const existing = panels.get(key);
        if (existing) {if (existing.panel !== panel) panel.dispose();await existing.initializing;return;}
        await attach(panel,key,'0',serialized).initializing;
      } catch (error) {
        const shouldReport = !disposed && !closed;
        panel.dispose();
        if (shouldReport) await report(new Error(`${error.message} Reinstall Zero to restore the bundled tutorials.`));
      }
      finally {pendingRestores.delete(panel);listener?.dispose();}
    }
  });
  return {open,columnFor(root){const item = panels.get(rootKey(root));return !disposed && item && !item.closed ? item.panel.viewColumn : undefined;},dispose(){disposed = true;serializer?.dispose();for (const panel of pendingRestores) panel.dispose();pendingRestores.clear();for (const item of panels.values()) item.panel.dispose();panels.clear();}};
}
module.exports = {createTutorialReader,rootKey,cleanState};
