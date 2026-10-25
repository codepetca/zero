'use strict';
const {createWebPreview} = require('./web-preview');
const crypto = require('node:crypto');
const {validIdentity}=require('./runtime-events');
const {createRuntimeSession}=require('./runtime-session');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The panel owns the executing frame, not just its HTTP listener. Disposing it
// destroys animation, pending callbacks and audio even when student JS is busy.
async function createManagedWebPreview(vscode, sitePath, {onDidDispose = () => {}, onOpenInBrowser, onError = error => vscode.window.showErrorMessage?.(error.message), onRuntime=()=>{}, runtimeBuildId, serverFactory = createWebPreview, title = 'Zero App', siteFiles, viewColumn} = {}) {
  const server = await serverFactory(sitePath,{siteFiles});
  let panel, disposed = false, listener, messageListener, runtimeSession;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    runtimeSession?.dispose();
    listener?.dispose();
    messageListener?.dispose();
    try {panel?.dispose();} finally {server.dispose(); onDidDispose();}
  };
  const openInBrowser = async () => {
    if(disposed)throw Error('App stopped. Run App before opening it in your browser.');
    if(!server.browserUrl || !vscode.env.openExternal)throw Error('Run App again before opening it in your browser.');
    const opened=await vscode.env.openExternal(vscode.Uri.parse(server.browserUrl));
    if(!opened)throw Error('Your browser did not open. Try Open in browser again.');
    return true;
  };
  try {
    const local = vscode.Uri.parse(server.webviewUrl || server.url);
    const target = vscode.env.asExternalUri ? await vscode.env.asExternalUri(local) : local;
    const url = target.toString();
    const origin = new URL(url).origin;
    const nonce = crypto.randomBytes(16).toString('hex');
    const runId=crypto.randomUUID(),managed=new URL(url).protocol==='http:'&&new URL(url).hostname==='127.0.0.1'&&validIdentity(runtimeBuildId);
    if(managed)runtimeSession=createRuntimeSession({runId,buildId:runtimeBuildId,onEvent:onRuntime});
    const port = Number(new URL(server.url).port);
    // The coordinator knows the current project's tutorial panel. Host focus can
    // still report its Java editor while that panel is active, so use its column.
    panel = vscode.window.createWebviewPanel('zero.app', title, Number.isInteger(viewColumn) ? viewColumn : vscode.ViewColumn.Beside, {
      enableScripts: true, localResourceRoots: [], retainContextWhenHidden: true,
      portMapping: [{webviewPort:port,extensionHostPort:port}]
    });
    listener = panel.onDidDispose(dispose);
    messageListener = panel.webview.onDidReceiveMessage?.(message => {
      if(!disposed&&message?.type==='zero-runtime-event'){runtimeSession?.accept(message.event);return;}
      if(disposed || message?.type!=='openInBrowser')return;
      Promise.resolve().then(()=>onOpenInBrowser ? onOpenInBrowser() : openInBrowser()).catch(error=>{
        try {onError(error)?.catch?.(()=>{});} catch { /* Reporting must not create an unhandled rejection. */ }
      });
    });
    panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escape(origin)}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"><style nonce="${nonce}">html,body{height:100%;margin:0;overflow:hidden;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);font-size:var(--vscode-font-size)}body{display:flex;flex-direction:column}header{display:flex;justify-content:flex-end;padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border)}button{font:inherit;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);border:1px solid var(--vscode-button-border,transparent);border-radius:3px;padding:4px 8px;cursor:pointer}button:hover{background:var(--vscode-button-secondaryHoverBackground)}button:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:2px}iframe{display:block;border:0;width:100%;flex:1;min-height:0}</style></head><body><header><button type="button">Open in browser</button></header><iframe title="Running Zero app" src="${managed?'about:blank':escape(url)}" sandbox="allow-scripts allow-same-origin" allow="autoplay; fullscreen" autofocus></iframe><script nonce="${nonce}">const vscode=acquireVsCodeApi();document.querySelector('button').addEventListener('click',()=>vscode.postMessage({type:'openInBrowser'}));const frame=document.querySelector('iframe');frame.addEventListener('load',()=>frame.focus());${managed?managedRuntimeScript(url,runId,runtimeBuildId):''}</script></body></html>`;
    return {dispose, panel, url, browserUrl:server.browserUrl, openInBrowser};
  } catch (error) {dispose(); throw error;}
}
function managedRuntimeScript(url,runId,buildId){
 return `(()=>{const target=new URL(${JSON.stringify(url)}),runId=${JSON.stringify(runId)},buildId=${JSON.stringify(buildId)};let port,connected=false,closed=false,seq=0,second=-1,count=0;const close=()=>{closed=true;port?.close();};window.addEventListener('pagehide',close);frame.addEventListener('load',()=>{if(closed||connected&&seq>0||frame.src==='about:blank')return;connected=true;port?.close();const channel=new MessageChannel();port=channel.port1;port.onmessage=({data})=>{if(closed||!data||data.version!==1||data.runId!==runId||data.buildId!==buildId||!Number.isSafeInteger(data.seq)||data.seq<=seq)return;let size;try{size=new TextEncoder().encode(JSON.stringify(data)).length;}catch{return;}if(size>65536)return;const time=Math.floor(Date.now()/1000);if(time!==second){second=time;count=0;}if(++count>30)return;seq=data.seq;vscode.postMessage({type:'zero-runtime-event',event:data});if(data.type==='fatal'||data.type==='stopped')close();};port.start();frame.contentWindow.postMessage({type:'zero-runtime-connect',version:1,runId,buildId},target.origin,[channel.port2]);});const fragment=new URLSearchParams();fragment.set('zeroRuntimeRun',runId);fragment.set('zeroRuntimeBuild',buildId);fragment.set('zeroRuntimeParentOrigin',window.location.origin);target.hash=fragment.toString();frame.src=target.toString();})();`;
}
module.exports = {createManagedWebPreview,managedRuntimeScript};
