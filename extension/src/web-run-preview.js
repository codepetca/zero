'use strict';
const {createWebPreview} = require('./web-preview');
const crypto = require('node:crypto');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The panel owns the executing frame, not just its HTTP listener. Disposing it
// destroys animation, pending callbacks and audio even when student JS is busy.
async function createManagedWebPreview(vscode, sitePath, {onDidDispose = () => {}, serverFactory = createWebPreview, title = 'Zero App', siteFiles} = {}) {
  const server = await serverFactory(sitePath,{siteFiles});
  let panel, disposed = false, listener;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    listener?.dispose();
    try {panel?.dispose();} finally {server.dispose(); onDidDispose();}
  };
  try {
    const local = vscode.Uri.parse(server.url);
    const target = vscode.env.asExternalUri ? await vscode.env.asExternalUri(local) : local;
    const url = target.toString();
    const origin = new URL(url).origin;
    const nonce = crypto.randomBytes(16).toString('hex');
    const port = Number(new URL(server.url).port);
    panel = vscode.window.createWebviewPanel('zero.app', title, vscode.ViewColumn.Beside, {
      enableScripts: true, localResourceRoots: [], retainContextWhenHidden: true,
      portMapping: [{webviewPort:port,extensionHostPort:port}]
    });
    listener = panel.onDidDispose(dispose);
    panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escape(origin)}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">html,body{height:100%;margin:0;overflow:hidden;background:var(--vscode-editor-background)}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe title="Running Zero app" src="${escape(url)}" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen" autofocus></iframe><script nonce="${nonce}">const frame=document.querySelector('iframe');frame.addEventListener('load',()=>frame.focus());</script></body></html>`;
    return {dispose, panel, url};
  } catch (error) {dispose(); throw error;}
}
module.exports = {createManagedWebPreview};
