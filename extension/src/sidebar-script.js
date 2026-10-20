'use strict';
// Kept as a function so the CSP-protected webview and isolated design fixture
// execute the same browser code without loading external resources.
function sidebarClient() {
  const api = acquireVsCodeApi();
  const remembered = api.getState?.() || {};
  let generation, expanded = new Set(remembered.expanded || []), requested = new Map();
  const pending = new Map();
  let nextRequest = 0;
  let treeFocus = remembered.focus, firstRoot = true;
  const tree = document.getElementById('files');
  const status = document.getElementById('file-status');
  const save = () => api.setState?.({generation, expanded:[...expanded],focus:treeFocus,scroll:window.scrollY});
  const send = (type,id) => {
    const requestId=++nextRequest;
    pending.set(requestId,{type,id});
    if(type==='files.list') requested.set(id || 'root',requestId);
    api.postMessage({type,id,generation,requestId});
  };
  const request = id => {if(!requested.has(id || 'root')) send('files.list',id);};
  const items = () => [...tree.querySelectorAll('[role="treeitem"]')].filter(item => !item.closest('[hidden]'));
  function select(item, focus = true) {
    for (const other of tree.querySelectorAll('[role="treeitem"]')) other.tabIndex = other === item ? 0 : -1;
    if (focus || !treeFocus) treeFocus = item?.dataset.id; if (focus) item?.focus(); save();
  }
  function toggle(item, open) {
    if (!item.hasAttribute('aria-expanded')) return;
    item.setAttribute('aria-expanded',String(open));
    const group = item.nextElementSibling;
    group.hidden = !open;
    if (open) {expanded.add(item.dataset.id); request(item.dataset.id);}
    else expanded.delete(item.dataset.id);
    save();
  }
  tree.addEventListener('click', event => {
    const item = event.target.closest('[role="treeitem"]'); if (!item) return;
    select(item);
    if (item.hasAttribute('aria-expanded')) toggle(item,item.getAttribute('aria-expanded') !== 'true');
    else send('files.open',item.dataset.id);
  });
  tree.addEventListener('keydown', event => {
    const item = event.target.closest('[role="treeitem"]'); if (!item) return;
    const visible = items(), index = visible.indexOf(item);
    let destination;
    switch (event.key) {
      case 'ArrowDown': destination = visible[Math.min(index+1,visible.length-1)]; break;
      case 'ArrowUp': destination = visible[Math.max(index-1,0)]; break;
      case 'Home': destination = visible[0]; break;
      case 'End': destination = visible.at(-1); break;
      case 'ArrowRight':
        if (item.getAttribute('aria-expanded') === 'false') toggle(item,true);
        else if (item.getAttribute('aria-expanded') === 'true') destination = item.nextElementSibling.querySelector('[role="treeitem"]');
        break;
      case 'ArrowLeft':
        if (item.getAttribute('aria-expanded') === 'true') toggle(item,false);
        else destination = item.parentElement.closest('[role="group"]')?.previousElementSibling;
        break;
      case 'Enter': case ' ':
        if (item.hasAttribute('aria-expanded')) toggle(item,item.getAttribute('aria-expanded') !== 'true');
        else send('files.open',item.dataset.id);
        break;
      default:return;
    }
    event.preventDefault(); if (destination) select(destination);
  });
  const menuButton = () => document.getElementById('files-menu-button');
  const fileMenu = () => document.getElementById('files-menu');
  const menuItems = () => [...(fileMenu()?.querySelectorAll('[role="menuitem"]') || [])].filter(item=>!item.disabled);
  function closeFileMenu(restoreFocus = false) {
    const button = menuButton(), menu = fileMenu();
    const menuHadFocus = menu?.contains(document.activeElement);
    if (menu) menu.hidden = true;
    button?.setAttribute('aria-expanded','false');
    if ((restoreFocus || menuHadFocus) && !button?.disabled) button?.focus({preventScroll:true});
  }
  function openFileMenu(last = false) {
    const button = menuButton(), menu = fileMenu();
    if (!button || button.disabled || !menu) return;
    menu.hidden = false; button.setAttribute('aria-expanded','true');
    const choices = menuItems(); (last ? choices.at(-1) : choices[0])?.focus({preventScroll:true});
  }
  document.addEventListener('click', event => {
    const trigger = menuButton(), menu = fileMenu();
    if (trigger?.contains(event.target)) {
      event.preventDefault();
      if (menu?.hidden) openFileMenu(); else closeFileMenu(true);
      return;
    }
    if (menu && !menu.hidden && !menu.contains(event.target)) closeFileMenu();
    const button = event.target.closest('button[data-command]');
    if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
      if (menu?.contains(button)) closeFileMenu(true);
      api.postMessage({command:button.dataset.command});
    }
  });
  document.addEventListener('keydown', event => {
    const trigger = menuButton(), menu = fileMenu();
    if (trigger?.contains(event.target) && ['ArrowDown','ArrowUp'].includes(event.key)) {
      event.preventDefault(); openFileMenu(event.key === 'ArrowUp'); return;
    }
    if (!menu || menu.hidden || !menu.contains(event.target)) return;
    const choices = menuItems(), index = choices.indexOf(document.activeElement);
    let next;
    switch (event.key) {
      case 'ArrowDown': next = choices[(index+1)%choices.length]; break;
      case 'ArrowUp': next = choices[(index-1+choices.length)%choices.length]; break;
      case 'Home': next = choices[0]; break;
      case 'End': next = choices.at(-1); break;
      case 'Escape': event.preventDefault(); closeFileMenu(true); return;
      case 'Tab': closeFileMenu(true); return;
      default:return;
    }
    event.preventDefault(); next?.focus({preventScroll:true});
  });
  document.addEventListener('focusin', event => {
    if (!fileMenu()?.contains(event.target) && !menuButton()?.contains(event.target)) closeFileMenu();
  });
  window.addEventListener('blur',()=>closeFileMenu());
  window.addEventListener('scroll',save,{passive:true});
  window.addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'sidebar.update') {
      // Status-only updates leave every interactive node and file row intact.
      for (const [id,content] of [['controls',message.controls],['file-actions',message.fileActions]]) {
        const controls = document.getElementById(id);
        if (controls && typeof content === 'string' && controls.dataset.content !== content) {
          const active = document.activeElement;
          const command = controls.contains(active) ? active.dataset.command : null;
          const wasFileMenu = id === 'file-actions' && controls.contains(active);
          if (id === 'file-actions') closeFileMenu();
          const oldScroll = window.scrollY;
          controls.innerHTML = content; controls.dataset.content = content;
          if (wasFileMenu && !menuButton()?.disabled) menuButton()?.focus({preventScroll:true});
          else if (command) controls.querySelector(`[data-command="${command}"]`)?.focus({preventScroll:true});
          window.scrollTo(0,oldScroll);
        }
      }
      document.getElementById('run-status').textContent = message.status;
      const recovery = document.getElementById('recovery');
      recovery.hidden = !message.failed;
      if (!message.failed) recovery.replaceChildren();
      if (message.failed && !recovery.childElementCount) for (const label of ['Problems','Output']) {
        const button=document.createElement('button'); button.className='link'; button.dataset.command='zero.show'+label; button.textContent='Show '+label; recovery.append(button);
      }
    }
    if (message?.type === 'files.reset') {
      closeFileMenu();
      for(const [id,request] of pending) if(request.type==='files.list') pending.delete(id);
      requested.clear();request();return;
    }
    if (!message?.type?.startsWith('files.')) return;
    const completed=pending.get(message.requestId);
    if(!completed) return;
    pending.delete(message.requestId);
    if(completed.type==='files.list') requested.delete(completed.id || 'root');
    if (message.type === 'files.empty') {pending.clear();requested.clear();generation=undefined;expanded.clear();tree.replaceChildren();treeFocus=undefined;status.textContent='Open a Zero project to see its files.';save();return;}
    if (message.type === 'files.error') {status.textContent=message.message;return;}
    if (message.type === 'files.stale') {request();return;}
    if (message.type !== 'files.result') return;
    const result = message.result;
    if (result.parent && generation !== result.generation) return;
    if (!result.parent && generation !== result.generation) {
      if (remembered.generation !== result.generation) expanded.clear();
      generation = result.generation;
    }
    let container = tree;
    if (result.parent) {
      const parent = tree.querySelector(`[data-id="${result.parent}"]`);
      if (!parent) return; container = parent.nextElementSibling;
    }
    const oldScroll = firstRoot && !result.parent ? remembered.scroll || 0 : window.scrollY;
    if (!result.parent) firstRoot=false;
    const hadFocus = tree.contains(document.activeElement);
    const focused = document.activeElement?.dataset.id;
    const previous=new Map([...container.children].map(wrapper=>[wrapper.firstElementChild?.dataset.id,wrapper]));
    let position=0;
    for (const entry of result.items) {
      let wrapper=previous.get(entry.id);
      previous.delete(entry.id);
      if(wrapper) {
        const item=wrapper.firstElementChild;
        if(entry.directory && expanded.has(entry.id)) request(entry.id);
        if(container.children[position]!==wrapper) container.insertBefore(wrapper,container.children[position] || null);
        position++;continue;
      }
      wrapper = document.createElement('div'); wrapper.setAttribute('role','none');
      const item = document.createElement('div'); item.setAttribute('role','treeitem'); item.dataset.id=entry.id;
      item.tabIndex=-1; item.className='file-row';
      item.style.setProperty('--depth',String(result.parent ? Number(container.dataset.depth || 1) : 0));
      const glyph = document.createElement('span'); glyph.className='file-glyph'; glyph.setAttribute('aria-hidden','true');
      // These SVG strings are fixed, pinned Lucide assets supplied by the host.
      glyph.innerHTML = entry.directory ? tree.dataset.folderIcon : tree.dataset.fileIcon;
      const label = document.createElement('span'); label.textContent=entry.label;
      const disclosure=document.createElement('span'); disclosure.className='file-disclosure'; disclosure.setAttribute('aria-hidden','true');
      if(entry.directory) disclosure.innerHTML=tree.dataset.chevronIcon;
      item.append(disclosure,glyph,label); wrapper.append(item);
      if (entry.directory) {
        item.setAttribute('aria-expanded',String(expanded.has(entry.id)));
        const group=document.createElement('div'); group.setAttribute('role','group'); group.hidden=!expanded.has(entry.id);
        group.id = `group-${entry.id}`; item.setAttribute('aria-owns',group.id);
        group.dataset.depth=String(Number(item.style.getPropertyValue('--depth'))+1);
        wrapper.append(group); if (expanded.has(entry.id)) request(entry.id);
      }
      container.insertBefore(wrapper,container.children[position] || null);position++;
    }
    for(const wrapper of previous.values()) wrapper.remove();
    const retained = tree.querySelector(`[data-id="${treeFocus || ''}"]`);
    const selected = retained || (result.parent ? container.previousElementSibling : items()[0]);
    if(!retained) treeFocus=selected?.dataset.id;
    if (selected) select(selected,false);
    if (hadFocus) (tree.querySelector(`[data-id="${focused || ''}"]`) || selected)?.focus({preventScroll:true});
    status.textContent = result.truncated ? 'Some files are hidden. Open Explorer to see all files.' : '';
    window.scrollTo(0,oldScroll);
  });
  document.getElementById('controls').dataset.content = document.getElementById('controls').innerHTML;
  api.postMessage({type:'sidebar.ready'});
  request();
}
module.exports = {sidebarScript:() => `(${sidebarClient.toString()})();`};
