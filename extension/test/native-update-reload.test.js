'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createNativeUpdateReload,updateRequest,isNewer}=require('../src/native-update-reload');
const request={schema:1,version:'0.5.35',requestId:'11b160b2-7329-4cd2-b9b2-74db0c3a026a'};
function fixture(options={}) {
  const home='/private/fixture-home';
  const extensionPath=path.join(home,'Library/Application Support/Zero/editor/extensions/zero.zero-0.5.34');
  const commands=[],logs=[],timers=[],cleared=[];
  const controller=createNativeUpdateReload({commands:{executeCommand:async command=>{commands.push(command);await options.onReload?.();}}},{
    context:{extensionPath,extension:{packageJSON:{version:'0.5.34'}}},platform:'darwin',home,
    realpath:async value=>value,read:async()=>request,
    log:message=>logs.push(message),setTimer:callback=>{timers.push(callback);return 1;},clearTimer:id=>cleared.push(id),...options
  });
  return {controller,commands,logs,timers,cleared,home,extensionPath};
}
test('marker accepts only bounded version-only reload requests, with no supplied command or path',()=>{
  assert.deepEqual(updateRequest(Buffer.from(JSON.stringify(request))),request);
  for(const value of [null,[],{}, {...request,schema:true},{...request,schema:2},{...request,version:'latest'}, {...request,version:'0.5.35;command'}, {...request,requestId:'invalid'}, {...request,command:'evil'}, {...request,path:'/other'}]) assert.equal(updateRequest(Buffer.from(JSON.stringify(value))),null);
  assert.equal(updateRequest(Buffer.from('{')),null);
  assert.equal(updateRequest(Buffer.alloc(2049)),null);
  for(const [next,current,expected] of [['0.5.35','0.5.34',true],['0.6.0','0.5.99',true],['1.0.0','0.99.99',true],['0.5.34','0.5.34',false],['0.5.33','0.5.34',false],['bad','0.5.34',false]])assert.equal(isNewer(next,current),expected);
});
test('an idle managed Zero window reloads once per request using only the native reload command',async()=>{
  let value=request;
  const f=fixture({read:async()=>value});
  assert.equal(await f.controller.ready,true);
  await f.controller.check();
  assert.deepEqual(f.commands,['workbench.action.reloadWindow']);
  value={...request,requestId:'22b160b2-7329-4cd2-b9b2-74db0c3a026a'};
  assert.equal(await f.controller.check(),true,'A later explicit Zero reopen can retry a cancelled native reload');
  assert.equal(f.commands.length,2);
  f.controller.dispose();assert.deepEqual(f.cleared,[1]);
});
test('busy Zero work defers reloading until idle without saving files or stopping tasks',async()=>{
  let busy=true;
  const f=fixture({isBusy:()=>busy});
  assert.equal(await f.controller.ready,false);assert.deepEqual(f.commands,[]);
  busy=false;assert.equal(await f.controller.check(),true);
  assert.deepEqual(f.commands,['workbench.action.reloadWindow']);f.controller.dispose();
});
test('current or older installed requests do not cause reload loops',async()=>{
  for(const version of ['0.5.34','0.5.33']) {
    const f=fixture({read:async()=>({...request,version})});await f.controller.ready;await f.controller.check();assert.deepEqual(f.commands,[]);f.controller.dispose();
  }
});
test('ordinary Code, development hosts and other platforms never watch the native marker',async()=>{
  for(const options of [{platform:'win32'},{platform:'linux'},{context:{extensionPath:'/some/worktree/extension',extension:{packageJSON:{version:'0.5.34'}}}},{context:{extensionPath:'/private/fixture-home/.vscode/extensions/zero.zero-0.5.34',extension:{packageJSON:{version:'0.5.34'}}}}]) {
    const f=fixture({...options,read:()=>{throw new Error('must not read');}});await f.controller.ready;assert.equal(await f.controller.check(),false);assert.deepEqual(f.timers,[]);assert.deepEqual(f.logs,[]);assert.deepEqual(f.commands,[]);
  }
});
test('linked profile/extension paths cannot trigger a reload',async()=>{
  const f=fixture({realpath:async value=>value+'/linked'});await f.controller.ready;assert.deepEqual(f.commands,[]);f.controller.dispose();
});
test('disposal or work starting during an asynchronous read cancels the reload; checks serialize',async()=>{
  let finish,busy=false;
  const f=fixture({isBusy:()=>busy,read:()=>new Promise(resolve=>{finish=resolve;})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(await f.controller.check(),false);
  busy=true;finish(request);await f.controller.ready;assert.deepEqual(f.commands,[]);f.controller.dispose();
  let complete;
  const g=fixture({read:()=>new Promise(resolve=>{complete=resolve;})});await new Promise(resolve=>setImmediate(resolve));g.controller.dispose();complete(request);await g.controller.ready;assert.deepEqual(g.commands,[]);
});
test('missing, linked, malformed, oversized and non-file markers are ignored using actual filesystem reads',async t=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'zero-reload-'));
  t.after(()=>fs.rm(temporary,{recursive:true,force:true}));
  const home=await fs.realpath(temporary),editor=path.join(home,'Library/Application Support/Zero/editor'),extensionPath=path.join(editor,'extensions/zero.zero-0.5.34');
  await fs.mkdir(extensionPath,{recursive:true});const file=path.join(editor,'update-ready.json');
  async function check(expected) {const f=fixture({home,context:{extensionPath,extension:{packageJSON:{version:'0.5.34'}}},realpath:fs.realpath,read:undefined});assert.equal(await f.controller.ready,expected);f.controller.dispose();return f;}
  await check(false);
  await fs.writeFile(file,'broken');await check(false);
  await fs.writeFile(file,'x'.repeat(2049));await check(false);await fs.unlink(file);
  const other=path.join(home,'foreign.json');await fs.writeFile(other,JSON.stringify(request));await fs.symlink(other,file);await check(false);assert.equal(await fs.readFile(other,'utf8'),JSON.stringify(request));await fs.unlink(file);
  await fs.mkdir(file);await check(false);await fs.rmdir(file);
  await fs.writeFile(file,JSON.stringify(request));const f=await check(true);assert.deepEqual(f.commands,['workbench.action.reloadWindow']);
});
test('reload/read failures provide bounded recovery without leaking paths or endlessly retrying the request',async()=>{
  const f=fixture({read:async()=>{throw Object.assign(new Error('PRIVATE'),{code:'EACCES'});}});
  await f.controller.ready;await f.controller.check();assert.equal(f.logs.length,1);assert.ok(!f.logs[0].includes('PRIVATE'));f.controller.dispose();
  const g=fixture({onReload:async()=>{throw new Error('PRIVATE reload failure');}});
  await g.controller.ready;await g.controller.check();
  assert.equal(g.commands.length,1);assert.equal(g.logs.length,2);
  assert.ok(g.logs.every(value=>!value.includes('PRIVATE')));g.controller.dispose();
});
