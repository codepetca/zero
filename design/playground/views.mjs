import { lessons } from '../../website/lib/learning.mjs';
import { sidebarSource } from './sidebar-source.mjs';
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
<p class="topic">Tutorials / Lesson ${lesson.id}</p>
<h1>${escape(lesson.title)}</h1>
<p>${escape(lesson.description)}</p>
<img class="lesson-visual" src="/assets/lessons/${String(lesson.id).padStart(2,'0')}.svg" alt="Lesson ${lesson.id} target illustration">
<p>${escape(lesson.topic)}</p>
<details><summary>Code and explanation</summary><p>This fixture previews the lesson layout. Read the complete lesson in the applied website.</p></details>
</section>`).join('')}</article>
</div>`;
  const homeContent = `<div class="intro"><h1>Learn Java</h1><p class="lead">Starting from zero.</p></div>
<div class="home-actions"><a class="primary" href="/web?screen=downloads&theme=${theme}" data-screen="downloads">Download Zero</a><a class="primary" href="/web?screen=learn&theme=${theme}" data-screen="learn">Start Learning</a></div>`;
  const downloadContent = `<section id="downloads" class="downloads" aria-label="Downloads">${downloads.mac ? `<button class="primary" data-fixture="Mac setup download" data-source-url="${escape(downloads.mac)}">
<img src="/assets/download.svg" width="18" height="18" alt="">Download for Mac Silicon</button>` : ''}${downloads.windows ? `<button class="primary" data-fixture="Windows complete-kit ZIP download" aria-label="Download for Windows (ZIP), manual setup" data-source-url="${escape(downloads.windows)}">
<img src="/assets/download.svg" width="18" height="18" alt="">Download for Windows (ZIP)</button>` : ''}</section>`;
  return `<!doctype html>
<html lang="en">
<head>${head(screen === 'home' ? 'Zero · Home review' : screen === 'downloads' ? 'Zero · Downloads review' : 'Zero · Learn review', theme)}</head>
<body class="web-preview" data-theme="${theme}">${label(`${screen === 'home' ? 'Home' : screen === 'downloads' ? 'Downloads' : 'Learn'} · ${theme}`)}<header class="site-header">
<a class="brand" href="/web?screen=home&theme=${theme}" data-screen="home" aria-label="Zero home">
<img src="/assets/zero.svg" width="30" height="30" alt="">
<span>zero</span>
</a>
<nav aria-label="Main navigation">
<a href="/web?screen=learn&theme=${theme}" data-screen="learn" ${screen === 'learn' ? 'aria-current="page"' : ''}>Tutorials</a>
<button data-fixture="Docs navigation">Docs</button>
<button data-fixture="Examples navigation">Examples</button>
<button data-fixture="ZeroHub navigation (outside this review)">ZeroHub</button>
<a href="/web?screen=downloads&theme=${theme}" data-screen="downloads" ${screen === 'downloads' ? 'aria-current="page"' : ''}>Download</a>
</nav>
<button type="button" class="theme-toggle" data-theme-toggle aria-label="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode" title="Switch to ${theme === 'dark' ? 'light' : 'dark'} mode">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${theme === 'dark' ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10l2 2M5 19l2-2M17 7l2-2"/>' : '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5Z"/>'}</svg>
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
export function sidebarView(theme, state, host = true) {
  let html = sidebarSource(state);
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
  html = html.replace('<div class="row">', `${label(`Zero sidebar · ${state === 'error' ? 'Error' : 'Ready'} · ${theme} · ${host ? 'simulated host colors' : 'adapter fallback'}`)}<div class="row">`);
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
<a href="/guide">Review instructions</a>
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
