'use strict';
const path=require('node:path');
const {parseRepositoryUrl}=require('./core');

function createProjectPicker(vscode,{authentication,repositories,history,isGameJamProject=()=>false,active=()=>true,report=()=>{},discoveryTimeout=20000}={}) {
  let disposed=false,currentPicker;
  function sessionChanged() {currentPicker?.checkSession();}
  async function choose({publicRepositoriesOnly=false,repositoryId,standaloneOnly=false}={}) {
    const ticket=await authentication.capture();
    if(disposed||!active())return;
    const historyItems=publicRepositoriesOnly ? [] : await history.list(ticket.session.accountId);
    if(disposed||!active())return;
    authentication.assertCurrentNow(ticket);
    const picker=vscode.window.createQuickPick(),controller=new AbortController();
    // VS Code ranks label matches during search. Icon-only labels keep names
    // searchable in descriptions without overriding our recent-first ordering.
    // Detail also retains each section's meaning when native search hides headers.
    const recent=historyItems.map(item=>{
      const name=item.repositoryUrl?.slice('https://github.com/'.length)||path.basename(item.path);
      const gameJam=item.repositoryUrl&&isGameJamProject(ticket.session.accountId,item.repositoryUrl);
      return {label:'$(folder)',description:gameJam?`${name} · Game Jam`:name,
        detail:`On this Mac · ${item.path}`,action:'recent',projectPath:item.path,repositoryUrl:item.repositoryUrl};
    }),remote=new Map();
    let settled=false,timer;
    const paste={label:'$(link)',description:'Paste a GitHub URL…',action:'paste',alwaysShow:true};
    const subscriptions=[];
    const title=repositoryId ? 'Choose your original Game Jam repository' :
      publicRepositoriesOnly ? 'Choose a public Zero repository' : 'Clone from GitHub';
    picker.title=title;picker.placeholder='Search projects';
    picker.matchOnDescription=true;picker.matchOnDetail=true;picker.ignoreFocusOut=true;
    picker.busy=true;
    function valid() {if(disposed||!active()||settled)return false;authentication.assertCurrentNow(ticket);return true;}
    function render() {
      if(!valid())return;
      const selected=picker.activeItems?.[0];
      const items=[];
      if(recent.length)items.push({label:'Recent projects',kind:vscode.QuickPickItemKind?.Separator??-1},...recent);
      const urls=new Set(recent.map(item=>item.repositoryUrl?.toLowerCase()).filter(Boolean));
      const repos=[...remote.values()].filter(item=>!urls.has(item.repositoryUrl.toLowerCase())).sort((a,b)=>(Date.parse(b.pushedAt)||0)-(Date.parse(a.pushedAt)||0)||a.description.localeCompare(b.description));
      if(repos.length)items.push({label:'Your Zero repositories',kind:vscode.QuickPickItemKind?.Separator??-1},...repos);
      items.push(paste);
      picker.items=items;
      if(selected&&items.includes(selected))picker.activeItems=[selected];
    }
    render();
    const selected=await new Promise((resolve,reject)=>{
      function finish(value,error) {
        if(settled)return;settled=true;clearTimeout(timer);controller.abort();
        for(const subscription of subscriptions)subscription.dispose();
        if(currentPicker?.picker===picker)currentPicker=undefined;
        picker.dispose();if(error)reject(error);else resolve(value);
      }
      function checkSession() {try {if(!valid())finish();}catch {finish();}}
      currentPicker={picker,checkSession,cancel:()=>finish()};
      subscriptions.push(picker.onDidAccept(()=>{
        try {
          if(!valid())return finish();
          const item=picker.selectedItems?.[0]||picker.activeItems?.[0];
          if(!item||!['recent','repository','paste'].includes(item.action))return;
          finish({...item,ticket});
        }catch(error){finish(undefined,error);}
      }));
      subscriptions.push(picker.onDidHide(()=>finish()));
      try {picker.show();}catch(error){finish(undefined,error);return;}
      if(settled)return;
      timer=setTimeout(()=>{controller.abort();if(!settled){picker.busy=false;picker.title=`${title} · Repository search timed out`;}},discoveryTimeout);
      // Local history is usable immediately; GitHub results arrive progressively.
      void (async()=>{
        try {
          if(typeof repositories.listZero!=='function')return;
          const add=repo=>{
            if(!valid()||controller.signal.aborted||publicRepositoriesOnly&&repo.private!==false||
                repositoryId&&String(repo.id)!==repositoryId)return;
            const id=String(repo.id);
            if(publicRepositoriesOnly && !/^[1-9][0-9]{0,19}$/.test(id))return;
            const url=repo.html_url;
            if(typeof url!=='string')return;
            const key=url.toLowerCase();
            // Final results repeat progressive callbacks. Keep the same native
            // item object so replacing items never changes the focused choice.
            if(remote.has(key))return;
            remote.set(key,{label:'$(repo)',description:repo.full_name,detail:repo.private?'GitHub · Private':'GitHub',action:'repository',repositoryUrl:url,...(publicRepositoriesOnly ? {repositoryId:id} : {}),pushedAt:typeof repo.pushed_at==='string'?repo.pushed_at:''});render();
          };
          const result=await repositories.listZero({ticket,signal:controller.signal,onRepository:add,standaloneOnly});
          if(!valid()||controller.signal.aborted)return;
          for(const repo of result.repositories)add(repo);
          if(result.truncated)picker.title=publicRepositoriesOnly ? `${title} · Search results are incomplete` : 'Clone from GitHub · More repositories available by URL';
          else if(!remote.size)picker.title=repositoryId ? `${title} · Repository unavailable` :
            publicRepositoriesOnly ? `${title} · No public Zero repositories found` : 'Clone from GitHub · No Zero repositories found';
        }catch(error){
          if(settled)return;
          try {if(valid()&&!controller.signal.aborted){picker.title=`${title} · Could not load repositories`;report(`Repository search: ${error.message}`);}}catch{finish();}
        }finally{if(!settled){clearTimeout(timer);picker.busy=false;}}
      })();
    });
    if(!publicRepositoriesOnly||selected?.action!=='paste')return selected;
    // Keep the captured account across the input and verification; a changed
    // session or disposed picker must never produce a project selection.
    const verification=new AbortController();
    let cancelled=false;
    const cancel=()=>{cancelled=true;verification.abort();};
    const checkSession=()=>{try {if(disposed||!active())cancel();else authentication.assertCurrentNow(ticket);}catch {cancel();}};
    currentPicker={checkSession,cancel};
    try {
      const input=await vscode.window.showInputBox({title:'GitHub repository URL',ignoreFocusOut:true,
        prompt:'Paste the URL of your public Zero project.',
        validateInput:value=>{try {parseRepositoryUrl(value);}catch(error){return error.message;}}});
      checkSession();
      if(cancelled||input===undefined)return;
      const page=parseRepositoryUrl(input).page;
      const repo=await repositories.readPublicStandaloneZero(page,{ticket,signal:AbortSignal.any([verification.signal,AbortSignal.timeout(discoveryTimeout)])});
      checkSession();
      if(cancelled)return;
      const id=String(repo.id);
      if(!/^[1-9][0-9]{0,19}$/.test(id)||repositoryId&&id!==repositoryId)
        throw Error('Choose your original Game Jam repository.');
      return {action:'repository',repositoryUrl:repo.html_url,repositoryId:id,ticket};
    } catch(error) {
      checkSession();
      if(cancelled||disposed||!active())return;
      throw error;
    } finally {if(currentPicker?.cancel===cancel)currentPicker=undefined;verification.abort();}
  }
  return {choose,sessionChanged,dispose(){disposed=true;currentPicker?.cancel();}};
}
module.exports={createProjectPicker};
