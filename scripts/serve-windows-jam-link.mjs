import assert from 'node:assert/strict';
import {once} from 'node:events';
import {writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const website=fileURLToPath(new URL('../website/',import.meta.url));
const require=createRequire(new URL('../website/package.json',import.meta.url));
const next=require('next');
const port=3295;
const hostname='127.0.0.1';
const id='jam-zero-50cc218f35e96640eba5685118e3c2dd';
const url='/api/jams/'+id;
const queries=['/api/jams?view=summaries',url+'?view=gallery',url+'?view=overview'];
const data=new Map(await Promise.all(queries.map(async query=>{
  const response=await fetch('https://zero.codepet.ca'+query,{redirect:'error',signal:AbortSignal.timeout(20000)});
  assert.ok(response.ok,'Public fixture unavailable: '+response.status);
  const payload=await response.json();
  assert.equal(payload.configured,true);
  return [query,payload];
})));
const event=data.get(url+'?view=overview').event;
assert.equal(event.id,id);
assert.equal(event.type,'game');
assert.equal(event.registrationOpen,true,'The fixture jam must accept new participants.');
assert.ok(event.rules?.trim());
for(const view of ['overview','gallery']) data.get(url+'?view='+view).editorGameJamJoinRequired=true;

process.chdir(website);
const app=next({dir:website,dev:true,hostname,port});
await app.prepare();
const handle=app.getRequestHandler();
const server=createServer((request,response)=>{
  if(request.method==='GET'&&data.has(request.url)){
    response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    response.end(JSON.stringify(data.get(request.url)));
    return;
  }
  void handle(request,response).catch(()=>{
    if(!response.headersSent) response.writeHead(500);
    response.end();
  });
});
server.listen(port,hostname);
await once(server,'listening');
await writeFile(process.argv[2],JSON.stringify({id,title:event.title,rules:event.rules,pageUrl:`http://${hostname}:${port}/hub/jams/${id}`}),{flag:'wx'});
console.log('Ready to serve the local Game Jam QA page.');
