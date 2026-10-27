import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { webThemeCss, vscodeThemeCss } from '../adapters.mjs';
import { installerHref } from '../../website/lib/installer.mjs';
import { availableKitRelease, releaseAssetHref } from '../../website/lib/contracts.mjs';
import { reviewPage, webView, sidebarView } from './views.mjs';
import {startPageView, componentStates} from './start-page-source.mjs';
import {componentsPage} from './component-views.mjs';

const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const kit = availableKitRelease(json('../../release/kit.json'), json('../../release/published-kit.json'), false);
const downloads = { mac: installerHref(json('../../release/installer.json'), false), windows: kit ? releaseAssetHref(kit, 'kit', false) : null };
const staticFiles = new Map([
  ['/components.css', ['components.css', 'text/css']],
  ['/preview.css', ['preview.css', 'text/css']], ['/sidebar-preview.css', ['sidebar-preview.css', 'text/css']],
  ['/fixture.js', ['fixture.js', 'text/javascript']], ['/review.js', ['review.js', 'text/javascript']],
  ['/assets/download.svg', ['assets/download.svg', 'image/svg+xml']],
]);
export async function handle(request, response) {
  const url = new URL(request.url, 'http://127.0.0.1');
  const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
  const editorTheme = ['light','dark','hc'].includes(url.searchParams.get('theme')) ? url.searchParams.get('theme') : 'light';
  let body, type = 'text/html';
  const liveRevision = /^[a-f0-9]{64}$/.test(process.env.ZERO_DEV_PREVIEW || '') ? process.env.ZERO_DEV_PREVIEW : '';
  try {
    if (request.method !== 'GET') { response.writeHead(405); return response.end('Read-only review server'); }
    if (liveRevision && url.pathname === '/__zero-dev/revision') { type = 'text/plain'; body = liveRevision; }
    else if (liveRevision && url.pathname === '/__zero-dev/reload.js') {
      type = 'text/javascript';
      body = `if(window.top===window){const expected=new URL(document.currentScript.src).searchParams.get('revision');setInterval(async()=>{try{const response=await fetch('/__zero-dev/revision',{cache:'no-store'});if(response.ok&&(await response.text())!==expected)location.reload();}catch{}},1000);}`;
    }
    else if (url.pathname === '/') body = reviewPage();
    else if (url.pathname === '/components') body = componentsPage(editorTheme, url.searchParams.get('state'));
    else if (url.pathname === '/start-page') body = await startPageView(editorTheme, url.searchParams.get('state'));
    else if (url.pathname === '/web') body = webView(theme, downloads, ["home", "learn", "downloads"].includes(url.searchParams.get("screen")) ? url.searchParams.get("screen") : "learn");
    else if (url.pathname === '/sidebar') body = sidebarView(editorTheme, ['empty','error','building','running','stopping', ...componentStates].includes(url.searchParams.get('state')) ? url.searchParams.get('state') : 'ready', url.searchParams.get('host') !== 'none', url.searchParams.get('connected') === '1',url.searchParams.get('cycle') === '1');
    else if (url.pathname === '/tokens-web.css') { type = 'text/css'; body = webThemeCss(theme); }
    else if (url.pathname === '/tokens-vscode.css') { type = 'text/css'; body = vscodeThemeCss(); }
    else if (url.pathname === '/host-fixture.css') {
      type = 'text/css';
      // Host fixture palette is derived from the same tokens, not another copy.
      body = `:root{--vscode-sideBar-background:var(--zero-page);--vscode-foreground:var(--zero-text);--vscode-descriptionForeground:var(--zero-muted);--vscode-font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--vscode-font-size:13px;--vscode-button-background:${editorTheme === 'light' ? '#005fb8' : editorTheme === 'hc' ? '#000000' : '#0078d4'};--vscode-button-foreground:#ffffff;--vscode-button-secondaryBackground:${editorTheme === 'light' ? '#e4e4e4' : '#343434'};--vscode-button-secondaryForeground:${editorTheme === 'light' ? '#202020' : '#ffffff'};--vscode-focusBorder:${editorTheme === 'hc' ? '#ffff00' : '#0090f1'};--vscode-textLink-foreground:${editorTheme === 'light' ? '#005fb8' : '#4daafc'};--vscode-panel-border:${editorTheme === 'hc' ? '#ffffff' : editorTheme === 'light' ? '#ababab' : '#777777'};--vscode-button-border:${editorTheme === 'hc' ? '#ffffff' : 'transparent'};--vscode-badge-background:${editorTheme === 'light' ? '#555555' : '#555555'};--vscode-badge-foreground:#ffffff}`;
      // Avoid alias cycles: host surface/text are captured as literals from
      // the single semantic source before the VS Code adapter is applied.
      const tokens = json('../tokens.json');
      const palette = tokens.themes?.[editorTheme === 'light' ? 'light' : 'dark'];
      if (!palette) throw new Error('Token schema changed: host fixture needs theme palettes');
      body = body.replace('var(--zero-page)', palette.page).replace('var(--zero-text)', palette.text).replace('var(--zero-muted)', palette.muted);
      const hc = editorTheme === 'hc';
      body += `:root{--vscode-editor-background:${hc ? '#000000' : palette.page};--vscode-menu-background:${hc ? '#000000' : palette.page};--vscode-menu-foreground:${hc ? '#ffffff' : palette.text};--vscode-menu-border:${hc ? '#ffffff' : palette.border};--vscode-menu-selectionBackground:${hc ? '#0f4a85' : editorTheme === 'light' ? '#005fb8' : '#0078d4'};--vscode-menu-selectionForeground:#ffffff;--vscode-menu-selectionBorder:${hc ? '#ffff00' : 'transparent'};--vscode-button-hoverBackground:${editorTheme === 'light' ? '#00529e' : hc ? '#0f4a85' : '#006bbd'};--vscode-button-secondaryHoverBackground:${editorTheme === 'light' ? '#d4d4d4' : '#454545'};--vscode-button-separator:rgba(255,255,255,.4);--vscode-widget-border:${hc ? '#ffffff' : palette.border};--vscode-widget-shadow:${hc ? 'transparent' : '#00000040'};--vscode-list-hoverBackground:${editorTheme === 'light' ? '#e4e4e4' : '#343434'};--vscode-errorForeground:${palette.error};--vscode-contrastBorder:${hc ? '#ffffff' : 'transparent'}}`;
      if (hc) body += ':root{--vscode-sideBar-background:#000000;--vscode-foreground:#ffffff;--vscode-descriptionForeground:#ffffff;--vscode-button-secondaryBackground:#000000;--vscode-button-secondaryForeground:#ffffff}';
    } else if (/^\/assets\/lessons\/(?:0[0-9]|1[0-2])\.svg$/.test(url.pathname)) {
      type = 'image/svg+xml';
      body = readFileSync(new URL(`../../student-template/lessons/visuals/${url.pathname.split('/').at(-1)}`, import.meta.url));
    } else if (url.pathname === '/assets/zero.svg') {
      type = 'image/svg+xml';
      // Use the same explicit-color asset as the website header.
      body = readFileSync(new URL('../brand/zero-purple.svg', import.meta.url), 'utf8');
    } else if (url.pathname === '/assets/zero-inverse.svg') {
      type = 'image/svg+xml';
      body = readFileSync(new URL('../brand/zero-white-on-purple.svg', import.meta.url), 'utf8');
    } else if (url.pathname === '/guide') {
      body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Zero review instructions</title><link rel="stylesheet" href="/tokens-web.css"><link rel="stylesheet" href="/preview.css"></head><body class="guide"><a href="/">Back to playground</a><h1>Review the connected themes</h1><p>Compare Learn/downloads with Ready and Error. Switch website and editor themes independently, inspect 320/390 px web and 200/240 px sidebar widths, then try 200% text.</p><p>These screens are proposed. Fixtures never run Java, download releases, authenticate or upload. Windows uses the published complete-kit ZIP; the unsigned native EXE remains unavailable.</p><p>Website structure reuses actual lesson/help data and release selection. Sidebar HTML comes from the actual extension renderer. Proposed CSS lives only in this playground.</p><p>Review identity, hierarchy, spacing, readability, focus, error recovery and native theme adaptation. Approval remains with the owner.</p></body></html>`;
    } else if (staticFiles.has(url.pathname)) {
      const [path, mime] = staticFiles.get(url.pathname); type = mime; body = readFileSync(new URL(path, import.meta.url));
    } else { response.writeHead(404); return response.end('Not part of this review'); }
    // Only the gallery submits a local GET form to select fixture parameters.
    // Embedded screens retain the no-form policy and their existing sandbox/CSP.
    const formAction = url.pathname === '/components' ? "'self'" : "'none'";
    if (liveRevision && type === 'text/html') {
      const nonce = String(body).match(/<script nonce="([^"]+)"/)?.[1];
      // The real Start Page also has a meta CSP. Both policies apply, so
      // permit the same-origin reload probe there only in opted-in dev mode.
      body = body.replace("connect-src 'none'", "connect-src 'self'");
      body = body.replace('</head>', `<script ${nonce ? `nonce="${nonce}" ` : ''}src="/__zero-dev/reload.js?revision=${liveRevision}" defer></script></head>`);
    }
    response.writeHead(200, { 'Content-Type':`${type}; charset=utf-8`, 'Cache-Control':'no-store', 'Content-Security-Policy':`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src ${liveRevision ? "'self'" : "'none'"}; frame-src 'self'; base-uri 'none'; form-action ${formAction}`, 'X-Content-Type-Options':'nosniff' });
    response.end(body);
  } catch(error) { response.writeHead(500, {'Content-Type':'text/plain'}); response.end(`Review unavailable: ${error.message}`); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.ZERO_DESIGN_PORT || 3256);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3245) throw new Error('Choose an unused preview port other than 3245.');
  http.createServer(handle).listen(port, '127.0.0.1', () => {
    console.log(`Zero design review: http://127.0.0.1:${port}`);
    if (process.env.ZERO_DEV_PREVIEW) process.send?.({type:'zero-preview-ready'});
  });
}
