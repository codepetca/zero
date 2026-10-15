'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.woff':'font/woff','.woff2':'font/woff2','.wasm':'application/wasm','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};

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
  const server = http.createServer(async (request,response) => {
    const fail = status => {response.writeHead(status, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});response.end(http.STATUS_CODES[status]);};
    try {
      if (!['GET','HEAD'].includes(request.method)) return fail(405);
      const raw = (request.url || '').split('?')[0];
      if (!raw.startsWith(prefix)) return fail(404);
      let relative;
      try {relative = decodeURIComponent(raw.slice(prefix.length));} catch {return fail(400);}
      if (!relative) relative = 'index.html';
      if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(segment => !segment || segment === '.' || segment === '..' || segment.startsWith('.'))) return fail(404);
      const data = files.get(relative);
      if (!data) return fail(404);
      response.writeHead(200, {'Content-Type':mime[path.extname(relative).toLowerCase()] || 'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!response.headersSent) fail(['ENOENT','ENOTDIR'].includes(error.code) ? 404 : 500);
      else response.end();
    }
  });
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}${prefix}`,dispose:() => {server.close();server.closeAllConnections?.();}};
}

module.exports = {createWebPreview};
