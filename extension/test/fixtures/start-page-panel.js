'use strict';
// Native-panel test double: keep source HTML fixed and expose posted state.
function startPagePanels(vscode) {
 const panels=[],prior=vscode.window.createWebviewPanel;
 vscode.window.createWebviewPanel=(type,title,column,options)=>{
  if(type!=='zero.startPage'&&prior)return prior(type,title,column,options);
  let close;
  const panel={type,title,column,options,reveal(){},onDidDispose(fn){close=fn;return {dispose(){}};},dispose(){close?.();},webview:{html:'',postMessage:async message=>{panel.state=message.state;return true;},onDidReceiveMessage(fn){panel.message=fn;queueMicrotask(()=>fn({type:'ready'}));return {dispose(){}};}}};panels.push(panel);return panel;
 };
 return panels;
}
module.exports={startPagePanels};
