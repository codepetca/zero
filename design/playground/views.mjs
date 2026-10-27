import {publishingSnapshots,publishingProgressHtml,publishedLinkPlayback,publishedLinkProof} from './publishing-source.mjs';
import { readFileSync } from 'node:fs';
import { lessons } from '../../website/lib/learning.mjs';
import { sidebarSource } from './sidebar-source.mjs';
const icons = Object.fromEntries(['download', 'sun', 'moon'].map(name =>
  [name, readFileSync(new URL(`./assets/${name}.svg`, import.meta.url), 'utf8').trim()]));
export const baseRevision = '639da3173d6eed71869bdb1365f6ef67a6fafdbd';
export const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const head = (title, theme) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/tokens-web.css?theme=${theme}">
<link rel="stylesheet" href="/preview.css">`;
const label = text => `<div class="evidence-label">PROPOSED · ${text} · base ${baseRevision.slice(0, 12)} + local review · fixture actions</div>`;
export function webView(theme, downloads, screen = "learn") {
  const learnContent = `<div class="tutorial-reader">
<aside class="tutorial-sidebar" aria-labelledby="lessons-title">
<h2 id="lessons-title">Lessons 0–12</h2>
<nav aria-label="Lesson navigation">${lessons.map(lesson => `<a href="#lesson-${lesson.id}" data-lesson="${lesson.id}" ${lesson.id === '0' ? 'aria-current="page"' : ''}>${lesson.id}. ${escape(lesson.title)}</a>`).join('')}</nav>
</aside>
<article class="tutorial-content" tabindex="-1">${lessons.map(lesson => `<section id="lesson-${lesson.id}" data-lesson-content="${lesson.id}" ${lesson.id === '0' ? '' : 'hidden'}>
<h1>Tutorials</h1>
<h2 class="page-subtitle">Lesson ${lesson.id}: ${escape(lesson.title)}</h2>
<p>${escape(lesson.description)}</p>
<img class="lesson-visual" src="/assets/lessons/${String(lesson.id).padStart(2,'0')}.svg" alt="Lesson ${lesson.id} target illustration">
<p>${escape(lesson.topic)}</p>
<details><summary>Code and explanation</summary><p>This fixture previews the lesson layout. Read the complete lesson in the applied website.</p></details>
</section>`).join('')}</article>
</div>`;
  const downloadContent = `<section id="downloads" class="downloads" aria-label="Downloads">${downloads.mac ? `<button class="primary" data-fixture="Mac setup download" data-source-url="${escape(downloads.mac)}">
${icons.download}Download for Mac Silicon</button>` : ''}${downloads.windows ? `<button class="primary" data-fixture="Windows complete-kit ZIP download" aria-label="Download for Windows (ZIP), manual setup" data-source-url="${escape(downloads.windows)}">
${icons.download}Download for Windows (ZIP)</button>` : ''}</section>`;
  const homeContent = `<div class="intro"><h1>Learn Java</h1><p class="lead">Starting from zero.</p></div>${downloadContent}`;
  return `<!doctype html>
<html lang="en">
<head>${head(screen === 'home' ? 'Zero · Home review' : screen === 'downloads' ? 'Zero · Downloads review' : 'Zero · Learn review', theme)}</head>
<body class="web-preview" data-theme="${theme}">${label(`${screen === 'home' ? 'Home' : screen === 'downloads' ? 'Downloads' : 'Learn'} · ${theme}`)}<header class="site-header">
<a class="brand" href="/web?screen=home&theme=${theme}" data-screen="home" aria-label="Zero home">
<img src="/assets/${theme === 'dark' ? 'zero-inverse.svg' : 'zero.svg'}" width="30" height="30" alt="">
<span>zero</span>
</a>
<nav aria-label="Main navigation">
<a href="/web?screen=learn&theme=${theme}" data-screen="learn" ${screen === 'learn' ? 'aria-current="page"' : ''}>Tutorials</a>
<button data-fixture="Docs navigation">Docs</button>
<button data-fixture="ZeroHub navigation (outside this review)">ZeroHub</button>
<a href="/web?screen=downloads&theme=${theme}" data-screen="downloads" ${screen === 'downloads' ? 'aria-current="page"' : ''}>Download</a>
</nav>
<button type="button" class="theme-toggle" data-theme-toggle aria-label="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode" title="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode">
${icons[theme === 'dark' ? 'sun' : 'moon']}
</button>
</header>
<main id="page-content" class="${screen === 'home' ? 'home-page' : screen === 'downloads' ? 'downloads-page' : ''}">
${screen === 'home' ? homeContent : screen === 'downloads' ? '<div class="intro"><h1>Download Zero</h1></div>' + downloadContent : learnContent}
</main>
<p id="fixture-feedback" role="status" aria-live="polite">
</p>
<script src="/fixture.js">
</script>
</body>
</html>`;
}
export function sidebarView(theme, state, host = true, connected = false, cycle = false) {
  let html = sidebarSource(state, {connected});
  // Only the preview swaps CSP and the command bridge. The production renderer
  // and its nonce-based policy remain byte-for-byte unchanged.
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, '');
  html = html.replace('<body>', `<body class="vscode-${theme === 'hc' ? 'high-contrast' : theme}">`);
  html = html.replace('</head>', `<title>Zero sidebar review</title>
<link rel="stylesheet" href="/tokens-web.css?theme=${theme === 'hc' ? 'dark' : theme}">${host ? `<link rel="stylesheet" href="/host-fixture.css?theme=${theme}">` : ''}<link rel="stylesheet" href="/tokens-vscode.css">
<link rel="stylesheet" href="/sidebar-preview.css">
<script src="/fixture.js">
</script>
</head>`);
  html = html.replace(/(<body[^>]*>)/, `$1${label(`Zero sidebar · ${state[0].toUpperCase() + state.slice(1)} · ${theme} · ${host ? 'simulated host colors' : 'adapter fallback'}`)}`);
  if(state.startsWith('published'))html=html.replace('</head>',`<script>window.zeroPublishedLinkFixture=${JSON.stringify({frames:publishedLinkPlayback,proof:publishedLinkProof}).replaceAll('<','\\u003c')};</script></head>`);
  if(cycle){
    const steps=['building','uploading','deploying','verifying','opening','stopped'].map(stage=>{const value=publishingSnapshots['publish-'+stage];return {type:'sidebar.update',status:'Simulation: '+value.status,publishingProgress:publishingProgressHtml(value.publishProgress)};});
    html=html.replace('</body>',`<script>window.addEventListener('DOMContentLoaded',()=>{const steps=${JSON.stringify(steps).replaceAll('<','\\u003c')};let index=0;const timer=setInterval(()=>{window.dispatchEvent(new MessageEvent('message',{data:steps[index++]}));if(index===steps.length)clearInterval(timer);},2200);});</script></body>`);
  }
  return html.replace('</body>', '<p id="fixture-feedback" role="status" aria-live="polite"></p></body>');
}
export function reviewPage() {
  return `<!doctype html>
<html lang="en">
<head>${head('Zero · Shared design review', 'light')}</head>
<body class="review">
<header class="review-header">
<div>
<h1>Zero design review</h1>
<p>Proposed themes · Learn/downloads + sidebar · base ${baseRevision.slice(0,12)} + local review</p>
</div>
<nav><a href="/components">Components</a> · <a href="/guide">Review instructions</a></nav>
</header>
<form class="controls" aria-label="Preview controls">
<label>Website page<select id="web-screen"><option value="home">Home</option><option value="learn">Tutorials</option><option value="downloads">Download</option></select></label>
<label>Website theme<select id="web-theme">
<option value="light">Light</option>
<option value="dark">Dark</option>
</select>
</label>
<label>Editor theme<select id="editor-theme">
<option value="light">Light</option>
<option value="dark">Dark</option>
<option value="hc">High contrast</option>
<option value="fallback">Fallback (no host variables)</option>
</select>
</label>
<label>Sidebar state<select id="state">
<option value="ready">Ready</option>
<option value="error">Error</option>
</select>
</label>
<label>Web viewport<select id="web-width">
<option value="768">Desktop · 768 px</option>
<option value="1024">Wide desktop · 1024 px</option>
<option value="390">Mobile · 390 px</option>
<option value="320">Reflow · 320 px</option>
</select>
</label>
<label>Sidebar width<select id="sidebar-width">
<option value="320">320 px</option>
<option value="240">Narrow · 240 px</option>
<option value="200">Minimum · 200 px</option>
</select>
</label>
<label>Text size<select id="text-size">
<option value="100">100%</option>
<option value="200">200%</option>
</select>
</label>
<button type="button" id="reset">Reset</button>
</form>
<p class="review-note">All actions use safe fixtures. Nothing downloads, runs, signs in or uploads. Editor colors here simulate a host; real VS Code verification is separate.</p>
<div class="comparison">
<section class="panel">
<div class="panel-heading">
<h2>Website · Learn / downloads</h2>
<a id="web-open" target="_blank" rel="noopener" href="/web?theme=light">Open screen</a>
</div>
<div class="canvas">
<iframe id="web" title="Learn and downloads proposed preview" sandbox="allow-scripts" src="/web?theme=light">
</iframe>
</div>
</section>
<section class="panel sidebar-panel">
<div class="panel-heading">
<h2>Zero sidebar</h2>
<a id="sidebar-open" target="_blank" rel="noopener" href="/sidebar?theme=light&state=ready">Open screen</a>
</div>
<div class="canvas">
<iframe id="sidebar" title="Zero sidebar proposed preview" sandbox="allow-scripts" src="/sidebar?theme=light&state=ready">
</iframe>
</div>
</section>
</div>
<p id="review-feedback" role="status" aria-live="polite">
</p>
<script src="/review.js">
</script>
</body>
</html>`;
}
