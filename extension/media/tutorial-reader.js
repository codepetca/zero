/* global acquireVsCodeApi */
'use strict';
(() => {
  const vscode = acquireVsCodeApi();
  const articles = Array.from(document.querySelectorAll('.lesson'));
  const ids = new Set(articles.map(article => article.dataset.lessonId));
  const picker = document.getElementById('lesson-picker');
  let current = null, ready = false, timer, restoring = false;
  let state = {lessonId:'0',scroll:{},details:{}};
  const status = text => {document.getElementById('status').textContent = text;};
  const save = () => {
    if (!ready || restoring || !current) return;
    if (current) state.scroll[current] = window.scrollY;
    state.lessonId = current;
    vscode.setState(state);
    vscode.postMessage({type:'state',state});
  };
  function show(id, focus = true) {
    if (!ids.has(id)) return;
    save(); restoring = true;
    current = id; state.lessonId = id; picker.value = id;
    articles.forEach(article => {article.hidden = article.dataset.lessonId !== id;});
    const article = articles.find(item => item.dataset.lessonId === id);
    document.title = article.dataset.displayNumber ? `Tutorial Docs — Lesson ${article.dataset.displayNumber}` : 'Tutorial Docs';
    if (focus) article.querySelector('h1').focus({preventScroll:true});
    requestAnimationFrame(() => {
      window.scrollTo(0,state.scroll[id] || 0);
      restoring = false;save();
    });
  }
  function restore(saved) {
    if (ready) return;
    state = saved && ids.has(saved.lessonId) ? saved : state;
    state.scroll ||= {};state.details ||= {};
    document.querySelectorAll('details').forEach(detail => {
      const id = detail.dataset.detail || detail.id;
      if (typeof state.details[id] === 'boolean') detail.open = state.details[id];
    });
    ready = true;show(state.lessonId,false);
  }
  document.addEventListener('click',event => {
    const button = event.target.closest('button,a,pre[data-copy]');
    if (!button) return;
    if (button.dataset.lesson) {show(button.dataset.lesson);}
    else if (button.dataset.browserLesson) vscode.postMessage({type:'browser',lessonId:button.dataset.browserLesson});
    else if (button.id === 'browser') vscode.postMessage({type:'browser',lessonId:current});
    else if (button.dataset.external) vscode.postMessage({type:'external',url:button.dataset.external});
    else if (button.dataset.reference) {
      event.preventDefault();
      const reference = document.getElementById(button.dataset.reference);
      if (reference) {reference.open = true;reference.scrollIntoView({block:'start'});reference.querySelector('summary').focus();}
    } else if (button.dataset.copy && (button.tagName === 'BUTTON' || !(window.getSelection()?.toString()))) {
      vscode.postMessage({type:'copy',id:button.dataset.copy});
    }
  });
  document.addEventListener('keydown',event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('pre[data-copy]')) {
      event.preventDefault();vscode.postMessage({type:'copy',id:event.target.dataset.copy});
    }
  });
  document.addEventListener('toggle',event => {
    if (!ready || restoring || event.target.tagName !== 'DETAILS') return;
    const id = event.target.dataset.detail || event.target.id;
    state.details[id] = event.target.open;save();
  },true);
  picker.addEventListener('change',() => {show(picker.value);});
  window.addEventListener('scroll',() => {clearTimeout(timer);timer = setTimeout(save,150);},{passive:true});
  window.addEventListener('pagehide',save);
  document.addEventListener('visibilitychange',() => {if (document.hidden) save();});
  window.addEventListener('message',event => {
    const message = event.data;
    if (message?.type === 'restore') {
      const local = vscode.getState();
      restore(local?.readerKey === message.state?.readerKey ? local : message.state);
    }
    else if (message?.type === 'copied') {
      status(message.ok ? 'Code copied.' : 'Could not copy. Select the code and copy it manually.');
      const button = document.querySelector(`button[data-copy="${message.id}"]`);
      if (button) {button.textContent = message.ok ? 'Copied' : 'Copy failed';setTimeout(() => {button.textContent = 'Copy';},2000);}
    }
  });
  vscode.postMessage({type:'ready'});
})();
