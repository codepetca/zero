'use strict';
const vm=require('node:vm');
const {sidebarScript}=require('../../src/sidebar-script');
function sidebarDOM() {
  let document;const documentListeners={};
  class Element {
    constructor(){this.children=[];this.parentElement=null;this.attributes={};this.dataset={};this.listeners={};this.hidden=false;this.innerHTML='';this.style={values:{},setProperty(k,v){this.values[k]=v;},getPropertyValue(k){return this.values[k]||'';}};}
    setAttribute(k,v){this.attributes[k]=v;} getAttribute(k){return this.attributes[k]??null;} hasAttribute(k){return k in this.attributes;}
    get firstElementChild(){return this.children[0];} get childElementCount(){return this.children.length;}
    get nextElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1];}
    get previousElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)-1];}
    append(...nodes){for(const node of nodes)this.insertBefore(node,null);}
    insertBefore(node,before){if(node===before)return;if(node.parentElement)node.remove();node.parentElement=this;const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,node);}
    remove(){if(this.contains(document.activeElement))document.activeElement=document.body;if(this.parentElement){const siblings=this.parentElement.children;siblings.splice(siblings.indexOf(this),1);this.parentElement=null;}}
    replaceChildren(...nodes){for(const child of [...this.children])child.remove();this.append(...nodes);}
    contains(node){return this===node||this.children.some(child=>child.contains(node));}
    matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);if(selector==='button[data-command]')return Boolean(this.dataset.command);if(selector==='[hidden]')return this.hidden;const match=selector.match(/^\[(role|data-id|data-command)="(.*)"\]$/);return !!match&&(match[1]==='role'?this.attributes.role:match[1]==='data-id'?this.dataset.id:this.dataset.command)===match[2];}
    closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    addEventListener(type,listener){this.listeners[type]=listener;} focus(){document.activeElement=this;}
  }
  const nodes=Object.fromEntries(['controls','file-actions','run-status','recovery','files-menu-button','files-menu','run-menu-button','run-menu'].map(id=>[id,new Element()]));
  document={body:new Element(),getElementById:id=>nodes[id],createElement:()=>new Element(),addEventListener(type,listener){documentListeners[type]=listener;}};
  document.activeElement=document.body;document.body.append(...Object.values(nodes));
  for(const [id,node]of Object.entries(nodes))node.id=id;
  nodes['file-actions'].append(nodes['files-menu-button'],nodes['files-menu']);
  nodes['files-menu-button'].setAttribute('aria-expanded','false');nodes['files-menu'].hidden=true;
  for(const command of ['zero.newClass','zero.newFile','zero.newFolder','zero.importAssets']) {
    const button=new Element();button.dataset.command=command;button.setAttribute('role','menuitem');nodes['files-menu'].append(button);
  }
  nodes.controls.append(nodes['run-menu-button'],nodes['run-menu']);
  nodes['run-menu-button'].setAttribute('aria-expanded','false');nodes['run-menu'].hidden=true;
  const publish=new Element();publish.dataset.command='zero.publishAndOpenWeb';publish.setAttribute('role','menuitem');nodes['run-menu'].append(publish);
  const listeners={},sent=[];let saved,handler;
  const window={scrollY:0,scrollTo(){},addEventListener:(type,listener)=>listeners[type]=listener};
  vm.runInNewContext(sidebarScript(),{window,document,acquireVsCodeApi:()=>({getState:()=>null,setState:value=>{saved=value;},postMessage:message=>{sent.push(message);handler?.(message);}})});
  const emit=message=>listeners.message({data:message});
  return {nodes,document,sent,emit,clickCommand:button=>documentListeners.click({target:button,preventDefault(){}}),key(target,key){let prevented=false;documentListeners.keydown({target,key,preventDefault(){prevented=true;}});return prevented;},focus(target){target.focus();documentListeners.focusin({target});},blur(){listeners.blur();},get saved(){return saved;}};
}
module.exports={sidebarDOM};
