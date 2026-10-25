'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

// macOS VS Code loses Select All inside an iframe in a webview. This runs only
// in the embedded preview's derived index response, never in exported files.
function selectAllInEmbeddedPreview() {
  document.addEventListener('keydown', event => {
    if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing || String(event.key).toLowerCase() !== 'a') return;
    const target = event.target;
    if (target !== document.activeElement || target.disabled) return;
    if (!(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLInputElement && /^(text|search|tel|url|email|password)$/.test(target.type))) return;
    target.select();
    event.preventDefault();
  }, true);
}

const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.woff':'font/woff','.woff2':'font/woff2','.wasm':'application/wasm','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
// This host page is local preview infrastructure, never part of an exported site.
// The persistent connection owns the child frame: closing the runtime ends the
// stream, and its error handler removes the app (including animation and audio).
// A browser that is suspended or cannot process events can delay that teardown.
function browserShell(appPath, livePath, nonce) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zero App</title><style nonce="${nonce}">html,body{height:100%;margin:0;overflow:hidden;background:white}iframe{display:block;border:0;width:100%;height:100%}p{margin:24px;font:16px system-ui,sans-serif}</style></head><body><p role="status">Opening app…</p><script nonce="${nonce}">
const live=new EventSource(${JSON.stringify(livePath)});let frame,stopped=false,lastSeen=Date.now();
const watchdog=setInterval(()=>{if(Date.now()-lastSeen>=4000)stop();},500);
function stop(){if(stopped)return;stopped=true;clearInterval(watchdog);live.close();if(frame){frame.remove();frame=undefined;}document.querySelector('p').textContent='App stopped. Run App in Zero to open it again.';document.querySelector('p').hidden=false;}
live.onmessage=event=>{if(stopped||event.data!=='running')return;lastSeen=Date.now();if(frame)return;frame=document.createElement('iframe');frame.title='Running Zero app';frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.allow='autoplay; fullscreen';frame.src=${JSON.stringify(appPath)};frame.addEventListener('load',()=>frame?.focus());document.querySelector('p').hidden=true;document.body.append(frame);};
live.onerror=stop;window.addEventListener('pagehide',stop);window.addEventListener('pageshow',event=>{if(event.persisted)stop();});document.addEventListener('visibilitychange',()=>{if(Date.now()-lastSeen>=4000)stop();});
</script></body></html>`;
}

// A preview serves only the built site, behind an unguessable local path.
// Never expose the project, build logs, compiler cache, or source tree.
async function createWebPreview(sitePath, {siteFiles} = {}) {
  const root = await fs.realpath(sitePath);
  if (!(await fs.lstat(sitePath)).isDirectory() || (await fs.lstat(sitePath)).isSymbolicLink()) throw new Error('Re-export the game before opening its preview.');
  const safeName = name => typeof name==='string' && name && !name.includes('\\') && !name.includes('\0') && !name.split('/').some(segment=>!segment || segment==='.' || segment==='..' || segment.startsWith('.'));
  const files = new Map();
  if(siteFiles) {
    for(const file of siteFiles) {
      if(!safeName(file.path) || files.has(file.path) || !(file.bytes instanceof Uint8Array))throw new Error('Invalid validated preview file. Run App again.');
      files.set(file.path,Buffer.from(file.bytes));
    }
  } else {
    async function read(directory,relative='') {
      for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
        const name=relative ? relative+'/'+entry.name : entry.name;
        if(!safeName(name) || entry.isSymbolicLink())continue;
        if(entry.isDirectory())await read(path.join(directory,entry.name),name);
        else if(entry.isFile())files.set(name,await fs.readFile(path.join(directory,entry.name)));
      }
    }
    await read(root);
  }
  // Copy once: rebuilding .zero/web-export cannot change a running app's assets.
  const prefix = '/' + crypto.randomBytes(18).toString('hex') + '/';
  // Dot-prefixed names cannot occur in the validated site manifest, so these
  // exact, random control paths never shadow a student's generated assets.
  const browserPath = prefix + '.zero-preview-' + crypto.randomBytes(18).toString('hex') + '/';
  const livePath = browserPath + 'live';
  const webviewQuery = '?zero-embedded-' + crypto.randomBytes(18).toString('hex');
  const originalIndex = files.get('index.html');
  // Keep the validated snapshot untouched. Only the exact webview URL serves
  // this derived HTML; the browser shell and every export asset use the original.
  const selectScript = Buffer.from(`<script>(${selectAllInEmbeddedPreview.toString()})()</script>`);
  const headClose = originalIndex?.toString('latin1').search(/<\/head\s*>/i) ?? -1;
  const webviewIndex = originalIndex && Buffer.concat([
    originalIndex.subarray(0,headClose < 0 ? originalIndex.length : headClose),
    selectScript,
    originalIndex.subarray(headClose < 0 ? originalIndex.length : headClose)
  ]);
  const nonce = crypto.randomBytes(16).toString('hex');
  const shell = Buffer.from(browserShell(prefix, livePath, nonce));
  const clients = new Set();
  let disposed = false;
  const server = http.createServer(async (request,response) => {
    const fail = status => {response.writeHead(status, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});response.end(http.STATUS_CODES[status]);};
    try {
      if (!['GET','HEAD'].includes(request.method)) return fail(405);
      const raw = (request.url || '').split('?')[0];
      if (!raw.startsWith(prefix)) return fail(404);
      if (raw === browserPath) {
        response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Content-Length':shell.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; frame-src 'self'; connect-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`});
        return response.end(request.method === 'HEAD' ? undefined : shell);
      }
      if (raw === livePath) {
        if (request.method !== 'GET') return fail(405);
        if (disposed) return fail(410);
        response.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
        clients.add(response);
        response.on('close',()=>clients.delete(response));
        response.write('data: running\n\n');
        return;
      }
      let relative;
      try {relative = decodeURIComponent(raw.slice(prefix.length));} catch {return fail(400);}
      if (!relative) relative = 'index.html';
      if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) return fail(404);
      const data = request.url === prefix + webviewQuery && relative === 'index.html' ? webviewIndex : files.get(relative);
      if (!data) return fail(404);
      response.writeHead(200, {'Content-Type':mime[path.extname(relative).toLowerCase()] || 'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!response.headersSent) fail(['ENOENT','ENOTDIR'].includes(error.code) ? 404 : 500);
      else response.end();
    }
  });
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const heartbeat = setInterval(()=>{for(const client of clients)client.write('data: running\n\n');},1000);
  heartbeat.unref();
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {url:origin+prefix,webviewUrl:origin+prefix+webviewQuery,browserUrl:origin+browserPath,dispose:() => {
    if(disposed)return;
    disposed=true;
    clearInterval(heartbeat);
    for(const client of clients)client.end();
    clients.clear();server.close();server.closeAllConnections?.();
  }};
}

module.exports = {createWebPreview};
