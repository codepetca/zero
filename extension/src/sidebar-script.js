'use strict';
// Kept as a function so the CSP-protected webview and isolated design fixture
// execute the same browser code without loading external resources.
function sidebarClient() {
  const api = acquireVsCodeApi();
  const remembered = api.getState?.() || {};
  const save = () => api.setState?.({scroll:window.scrollY});
  window.scrollTo(0,remembered.scroll || 0);
  const menus = [
    {button:'files-menu-button',menu:'files-menu',container:'file-actions'},
    {button:'run-menu-button',menu:'run-menu',container:'controls',fallback:'zero.toggleApp'}
  ];
  const menuButton = config => document.getElementById(config.button);
  const menuElement = config => document.getElementById(config.menu);
  const menuItems = config => [...(menuElement(config)?.querySelectorAll('[role="menuitem"]') || [])].filter(item=>!item.disabled);
  function restoreMenuFocus(config) {
    const button = menuButton(config);
    if (button && !button.disabled) button.focus({preventScroll:true});
    else if (config.fallback) document.getElementById(config.container)?.querySelector(`[data-command="${config.fallback}"]`)?.focus({preventScroll:true});
  }
  function closeMenu(config, restoreFocus = false) {
    const button = menuButton(config), menu = menuElement(config);
    const menuHadFocus = menu?.contains(document.activeElement);
    if (menu) menu.hidden = true;
    button?.setAttribute('aria-expanded','false');
    if (restoreFocus || menuHadFocus) restoreMenuFocus(config);
  }
  const closeMenus = () => menus.forEach(config=>closeMenu(config));
  function openMenu(config, last = false) {
    const button = menuButton(config), menu = menuElement(config);
    if (!button || button.disabled || !menu) return;
    for (const other of menus) if (other !== config) closeMenu(other);
    menu.hidden = false; button.setAttribute('aria-expanded','true');
    const choices = menuItems(config); (last ? choices.at(-1) : choices[0])?.focus({preventScroll:true});
  }
  document.addEventListener('click', event => {
    const trigger = menus.find(config=>menuButton(config)?.contains(event.target));
    if (trigger) {
      event.preventDefault();
      if (menuElement(trigger)?.hidden) openMenu(trigger); else closeMenu(trigger,true);
      return;
    }
    for (const config of menus) {
      const menu = menuElement(config);
      if (menu && !menu.hidden && !menu.contains(event.target)) closeMenu(config);
    }
    const button = event.target.closest('button[data-command]');
    if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
      for (const config of menus) if (menuElement(config)?.contains(button)) closeMenu(config,true);
      api.postMessage({command:button.dataset.command,...(button.dataset.recovery?{recovery:button.dataset.recovery}:{})});
    }
  });
  document.addEventListener('keydown', event => {
    const trigger = menus.find(config=>menuButton(config)?.contains(event.target));
    if (trigger && ['ArrowDown','ArrowUp'].includes(event.key)) {
      event.preventDefault(); openMenu(trigger,event.key === 'ArrowUp'); return;
    }
    const config = menus.find(config=>!menuElement(config)?.hidden && menuElement(config)?.contains(event.target));
    if (!config) return;
    const choices = menuItems(config), index = choices.indexOf(document.activeElement);
    let next;
    switch (event.key) {
      case 'ArrowDown': next = choices[(index+1)%choices.length]; break;
      case 'ArrowUp': next = choices[(index-1+choices.length)%choices.length]; break;
      case 'Home': next = choices[0]; break;
      case 'End': next = choices.at(-1); break;
      case 'Escape': event.preventDefault(); closeMenu(config,true); return;
      case 'Tab': closeMenu(config,true); return;
      default:return;
    }
    event.preventDefault(); next?.focus({preventScroll:true});
  });
  document.addEventListener('focusin', event => {
    for (const config of menus) if (!menuElement(config)?.contains(event.target) && !menuButton(config)?.contains(event.target)) closeMenu(config);
  });
  window.addEventListener('blur',closeMenus);
  window.addEventListener('scroll',save,{passive:true});
  window.addEventListener('message', event => {
    const message = event.data;
    if (message?.type === 'sidebar.update') {
      // Status-only updates leave interactive controls intact.
      for (const [id,content] of [['controls',message.controls],['file-actions',message.fileActions]]) {
        const controls = document.getElementById(id);
        if (controls && typeof content === 'string' && controls.dataset.content !== content) {
          const active = document.activeElement;
          const command = controls.contains(active) ? active.dataset.command : null;
          const focusedMenu = menus.find(config=>config.container === id && (menuButton(config)?.contains(active) || menuElement(config)?.contains(active)));
          for (const config of menus) if (config.container === id) closeMenu(config);
          const oldScroll = window.scrollY;
          controls.innerHTML = content; controls.dataset.content = content;
          if (focusedMenu) restoreMenuFocus(focusedMenu);
          else if (command) controls.querySelector(`[data-command="${command}"]`)?.focus({preventScroll:true});
          window.scrollTo(0,oldScroll);
        }
      }
      document.getElementById('run-status').textContent = message.status;
      const publishingProgress=document.getElementById('publishing-progress'),progressMarkup=message.publishingProgress || '';
      if(publishingProgress.dataset.content!==progressMarkup){publishingProgress.innerHTML=progressMarkup;publishingProgress.dataset.content=progressMarkup;}
      const recovery = document.getElementById('recovery');
      recovery.hidden = !message.failed;
      if (!message.failed) recovery.replaceChildren();
      if (message.failed && !recovery.childElementCount) for (const label of ['Problems','Output']) {
        const button=document.createElement('button'); button.className='link'; button.dataset.command='zero.show'+label; button.textContent='Show '+label; recovery.append(button);
      }
    }
  });
  document.getElementById('controls').dataset.content = document.getElementById('controls').innerHTML;
  api.postMessage({type:'sidebar.ready'});
}
module.exports = {sidebarScript:() => `(${sidebarClient.toString()})();`};
