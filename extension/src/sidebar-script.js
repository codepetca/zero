'use strict';
// Kept as a function so the CSP-protected webview and isolated design fixture
// execute the same browser code without loading external resources.
function sidebarClient() {
  const api = acquireVsCodeApi();
  const remembered = api.getState?.() || {};
  let generation, expanded = new Set(remembered.expanded || []), requested = new Set();
  let treeFocus = remembered.focus, firstRoot = true;
  const tree = document.getElementById('files');
  const status = document.getElementById('file-status');
  const save = () => api.setState?.({generation, expanded:[...expanded],focus:treeFocus,scroll:window.scrollY});
  const request = id => {
    const key = id || 'root'; if (requested.has(key)) return;
    requested.add(key); api.postMessage({type:'files.list',id,generation});
  };
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
    if (open) {expanded.add(item.dataset.id); if (!group.childElementCount) request(item.dataset.id);}
    else expanded.delete(item.dataset.id);
    save();
  }
  tree.addEventListener('click', event => {
    const item = event.target.closest('[role="treeitem"]'); if (!item) return;
    select(item);
    if (item.hasAttribute('aria-expanded')) toggle(item,item.getAttribute('aria-expanded') !== 'true');
    else api.postMessage({type:'files.open',id:item.dataset.id,generation});
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
        else api.postMessage({type:'files.open',id:item.dataset.id,generation});
        break;
      default:return;
    }
    event.preventDefault(); if (destination) select(destination);
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-command]');
    if (button && !button.disabled) api.postMessage({command:button.dataset.command});
  });
  window.addEventListener('scroll',save,{passive:true});
  window.addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'sidebar.update') {
      // Status-only updates leave every interactive node and file row intact.
      const controls = document.getElementById('controls');
      if (controls.dataset.content !== message.controls) {
        const active = document.activeElement;
        const command = controls.contains(active) ? active.dataset.command : null;
        const oldScroll = window.scrollY;
        controls.innerHTML = message.controls; controls.dataset.content = message.controls;
        if (command) controls.querySelector(`[data-command="${command}"]`)?.focus({preventScroll:true});
        window.scrollTo(0,oldScroll);
      }
      document.getElementById('run-status').textContent = message.status;
      const recovery = document.getElementById('recovery');
      recovery.hidden = !message.failed;
      if (!message.failed) recovery.replaceChildren();
      if (message.failed && !recovery.childElementCount) for (const label of ['Problems','Output']) {
        const button=document.createElement('button'); button.className='link'; button.dataset.command='zero.show'+label; button.textContent='Show '+label; recovery.append(button);
      } 
    }
    if (message?.type === 'files.empty') {tree.replaceChildren();status.textContent='Open a Zero project to see its files.';}
    if (message?.type === 'files.reset') {requested.clear();request();}
    if (message?.type === 'files.error') {requested.clear();status.textContent=message.message;}
    if (message?.type !== 'files.result') return;
    const result = message.result;
    requested.delete(result.parent || 'root');
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
    container.replaceChildren();
    for (const entry of result.items) {
      const wrapper = document.createElement('div'); wrapper.setAttribute('role','none');
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
      container.append(wrapper);
    }
    const selected = tree.querySelector(`[data-id="${treeFocus || ''}"]`) || items()[0];
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
