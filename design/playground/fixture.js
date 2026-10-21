// The only command bridge in this review: visible feedback, no external effects.
function feedback(text) {
  const region = document.getElementById('fixture-feedback');
  if (region) region.textContent = `Fixture only: ${text}. Nothing ran, downloaded, signed in or uploaded.`;
  if (window.parent !== window) window.parent.postMessage({type:'zero-fixture',text}, '*');
}
const fixtureFiles = {
  root: [{id:'1'.repeat(32),label:'Main.java',directory:false},{id:'2'.repeat(32),label:'Resources',directory:true},{id:'3'.repeat(32),label:'Toolkit',directory:true},{id:'4'.repeat(32),label:'README.md',directory:false},{id:'5'.repeat(32),label:'Project files',directory:true}],
  ['2'.repeat(32)]:[{id:'6'.repeat(32),label:'greeting.txt',directory:false}],
  ['3'.repeat(32)]:[{id:'7'.repeat(32),label:'App.java',directory:false}],
  ['5'.repeat(32)]:[{id:'8'.repeat(32),label:'zero.json',directory:false}]
};
let fixtureState;
window.acquireVsCodeApi = () => ({
  getState:()=>fixtureState,setState:value=>{fixtureState=value;},
  postMessage: message => {
    if (message.type === 'sidebar.ready') return;
    if (message.type === 'files.list') {
      if (new URLSearchParams(location.search).get('state') === 'empty') {
        setTimeout(()=>window.dispatchEvent(new MessageEvent('message',{data:{type:'files.empty',requestId:message.requestId}})),0);
        return;
      }
      setTimeout(()=>window.dispatchEvent(new MessageEvent('message',{data:{type:'files.result',requestId:message.requestId,result:{generation:'fixture',parent:message.id || null,items:fixtureFiles[message.id || 'root'] || [],truncated:false}}})),0);
      return;
    }
    if (message.type === 'files.open') {feedback('A project file would open in VS Code');return;}
    feedback(message.command === 'zero.showProblems' ? 'Show Problems would focus Main.java, line 8: missing semicolon' : `${message.command} selected`);
  }
});
document.addEventListener('click', event => {
  const themeToggle = event.target.closest('[data-theme-toggle]');
  if (themeToggle) {
    const theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    if (window.parent !== window) window.parent.postMessage({type:'zero-theme',theme}, '*');
    else {
      const url = new URL(location.href);
      url.searchParams.set('theme', theme);
      location.assign(url.href);
    }
    return;
  }
  const lesson = event.target.closest('[data-lesson]');
  if (lesson) {
    event.preventDefault();
    document.querySelectorAll('[data-lesson]').forEach(link => {
      if (link === lesson) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-lesson-content]').forEach(section => {
      section.hidden = section.dataset.lessonContent !== lesson.dataset.lesson;
    });
    document.querySelector('.tutorial-content')?.focus({preventScroll:true});
    return;
  }
  const page = event.target.closest('[data-screen]');
  if (page && window.parent !== window) { event.preventDefault(); window.parent.postMessage({type:'zero-screen',screen:page.dataset.screen}, '*'); return; }
  const button = event.target.closest('[data-fixture]');
  if (button) { event.preventDefault(); feedback(button.dataset.fixture); }
});
function enlargeText() {
  const params = new URLSearchParams(location.search);
  const label = document.querySelector('.evidence-label');
  if (label) label.textContent += ` · viewport ${window.innerWidth} × ${window.innerHeight} · text ${params.get('text') || '100'}%`;
  if (params.get('text') !== '200') return;
  document.documentElement.style.fontSize = '200%';
  // Enlarge only in the review fixture, including the px-based editor font.
  document.body.style.setProperty('--zero-font-size', document.body.className.startsWith('vscode-') ? '26px' : '32px');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',enlargeText);
else enlargeText();
