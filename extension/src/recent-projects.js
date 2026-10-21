'use strict';
const path = require('node:path');
const core = require('./core');

const LIMIT = 20;
const keyFor = accountId => /^[1-9]\d*$/.test(accountId || '') ? `zero.recentProjects.v1:${accountId}` : undefined;
function createRecentProjects({globalState,active=()=>true,eligible=()=>true,resolve=core.resolveProject,now=Date.now}={}) {
  let queue=Promise.resolve();
  function saved(accountId) {
    const key=keyFor(accountId);let items;
    try {items=key&&globalState?.get(key);}catch {return [];}
    return Array.isArray(items) ? items.slice(0,LIMIT).filter(item=>item&&typeof item.path==='string'&&path.isAbsolute(item.path)&&Number.isFinite(item.lastOpened)&&item.lastOpened>=0).map(item=>{
      let repositoryUrl;try {repositoryUrl=core.parseRepositoryUrl(item.repositoryUrl).page;}catch{}
      return {path:item.path,lastOpened:item.lastOpened,...(repositoryUrl?{repositoryUrl}:{})};
    }) : [];
  }
  async function list(accountId) {
    const found=[];
    for(const item of saved(accountId)) {
      if(!active())break;
      try {if(eligible(item.path)&&await resolve([item.path])===item.path&&!found.some(previous=>previous.path===item.path))found.push({...item});}catch{}
    }
    return found.sort((a,b)=>b.lastOpened-a.lastOpened);
  }
  function remember(projectPath,{accountId,repositoryUrl,isCurrent=()=>true}={}) {
    const operation=queue.then(async()=>{
      const key=keyFor(accountId);
      if(!key||!globalState||!active()||!isCurrent()||!eligible(projectPath))return;
      const root=await resolve([projectPath]);
      if(!active()||!isCurrent()||!eligible(root))return;
      let url;
      try {if(repositoryUrl)url=core.parseRepositoryUrl(repositoryUrl).page;}catch{}
      const item={path:root,lastOpened:now(),...(url?{repositoryUrl:url}:{})};
      const items=saved(accountId).filter(previous=>previous.path!==root);
      await globalState.update(key,[item,...items].slice(0,LIMIT));
    });
    queue=operation.catch(()=>{});
    return operation;
  }
  return {list,remember};
}
module.exports={createRecentProjects};
