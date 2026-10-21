'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProjectPicker}=require('../src/project-picker');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({recent=[],listZero=async()=>({repositories:[],truncated:false}),timeout=10000}={}) {
  const handlers={accept:new Set(),hide:new Set()},reports=[],calls=[];
  const event=name=>fn=>{handlers[name].add(fn);return {dispose:()=>handlers[name].delete(fn)};};
  let account=true,shown=false;
  const picker={items:[],selectedItems:[],activeItems:[],disposed:0,onDidAccept:event('accept'),onDidHide:event('hide'),show(){shown=true;},dispose(){this.disposed++;}};
  const ticket={session:{accountId:'17'},revision:1};
  const authentication={capture:async()=>ticket,assertCurrentNow(value){if(!account||value!==ticket)throw Error('Account changed');}};
  const ui=createProjectPicker({QuickPickItemKind:{Separator:-1},window:{createQuickPick:()=>picker}},{authentication,repositories:{listZero},history:{list:async accountId=>{calls.push(accountId);return recent;}},discoveryTimeout:timeout,report:text=>reports.push(text)});
  return {ui,picker,ticket,reports,calls,get shown(){return shown;},set account(value){account=value;},emit(name){for(const fn of [...handlers[name]])fn();},select(item){picker.selectedItems=[item];for(const fn of [...handlers.accept])fn();}};
}
const repo=(name,date='2026-10-20T12:00:00Z')=>({id:name.length,full_name:`student/${name}`,html_url:`https://github.com/student/${name}`,pushed_at:date,private:false});
test('recent projects lead sorted GitHub results; duplicates disappear and paste stays searchable',async()=>{
  const local={path:'/projects/greeting',repositoryUrl:'https://github.com/student/greeting'};
  const f=fixture({recent:[local],listZero:async({onRepository})=>{
    for(const r of [repo('older','2026-10-19T12:00:00Z'),repo('greeting'),{...repo('newer'),private:true}])onRepository(r);
    return {repositories:[],truncated:false};
  }});
  const pending=f.ui.choose();await turn();
  assert.deepEqual(f.calls,['17']);assert.equal(f.shown,true);
  assert.deepEqual(f.picker.items.map(i=>i.action||i.label),['Recent projects','recent','Your Zero repositories','repository','repository','paste']);
  assert.deepEqual(f.picker.items.filter(i=>i.action==='repository').map(i=>i.description),['student/newer','student/older']);
  assert.ok(f.picker.items.filter(i=>i.action).every(i=>/^\$\([a-z]+\)$/.test(i.label)),'Searchable names must not enter the native label-ranking field');
  assert.match(f.picker.items.find(i=>i.action==='recent').detail,/^On this Mac · /);
  assert.equal(f.picker.items.find(i=>i.action==='repository').detail,'GitHub · Private');
  assert.equal(f.picker.items.at(-1).alwaysShow,true);assert.equal(f.picker.matchOnDescription,true);assert.equal(f.picker.matchOnDetail,true);
  f.select(f.picker.items.find(i=>i.action==='recent'));const result=await pending;
  assert.equal(result.projectPath,local.path);assert.equal(result.ticket,f.ticket);assert.equal(f.picker.disposed,1);
});
test('paste is available during discovery; selection aborts requests and ignores late results',async()=>{
  let finish,options;
  const f=fixture({listZero:input=>{options=input;return new Promise(resolve=>{finish=resolve;});}});
  const pending=f.ui.choose();await turn();assert.equal(f.picker.busy,true);
  f.select(f.picker.items.at(-1));assert.equal((await pending).action,'paste');assert.equal(options.signal.aborted,true);
  const previous=f.picker.items;options.onRepository(repo('late'));finish({repositories:[repo('late')],truncated:false});await turn();assert.equal(f.picker.items,previous);assert.equal(f.picker.disposed,1);
});
test('account changes dismiss private results and abort discovery without a selection',async()=>{
  let options,finish;
  const f=fixture({listZero:input=>{options=input;input.onRepository({...repo('private'),private:true});return new Promise(resolve=>{finish=resolve;});}});
  const pending=f.ui.choose();await turn();assert.ok(f.picker.items.some(i=>i.description==='student/private'));
  f.account=false;f.ui.sessionChanged();assert.equal(await pending,undefined);assert.equal(options.signal.aborted,true);
  options.onRepository(repo('late'));finish({repositories:[],truncated:false});await turn();assert.equal(f.picker.disposed,1);
});
test('discovery timeout leaves local projects and paste usable',async()=>{
  let options,finish;
  const f=fixture({recent:[{path:'/projects/local'}],timeout:10,listZero:input=>{options=input;return new Promise(resolve=>{finish=resolve;});}});
  const pending=f.ui.choose();await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(options.signal.aborted,true);assert.equal(f.picker.busy,false);assert.match(f.picker.title,/timed out/);assert.ok(f.picker.items.some(i=>i.action==='recent'));
  f.select(f.picker.items.at(-1));assert.equal((await pending).action,'paste');finish({repositories:[],truncated:false});
});
test('failed, empty and truncated discovery have useful states and retain the URL option',async()=>{
  for(const mode of ['failed','empty','truncated']) {
    const f=fixture({listZero:async()=>{if(mode==='failed')throw Error('Offline');return {repositories:[],truncated:mode==='truncated'};}});
    const pending=f.ui.choose();await turn();assert.equal(f.picker.busy,false);
    assert.match(f.picker.title,mode==='failed'?/Could not load/:mode==='empty'?/No Zero repositories/:/available by URL/);
    assert.equal(f.reports.length,mode==='failed'?1:0);f.select(f.picker.items.at(-1));assert.equal((await pending).action,'paste');
  }
});
test('Escape and extension disposal cancel without a clone or stale UI updates',async()=>{
  for(const action of ['hide','dispose']) {
    const f=fixture();const pending=f.ui.choose();await turn();
    if(action==='hide')f.emit('hide');else f.ui.dispose();
    assert.equal(await pending,undefined);assert.equal(f.picker.disposed,1);
  }
});
test('final repository results preserve the progressive item being searched and focused',async()=>{
 let options,finish;const chosen=repo('quiz');
 const f=fixture({listZero:input=>{options=input;return new Promise(resolve=>{finish=resolve;});}});
 const pending=f.ui.choose();await turn();options.onRepository(chosen);
 const item=f.picker.items.find(i=>i.repositoryUrl===chosen.html_url);f.picker.value='quiz';f.picker.activeItems=[item];
 finish({repositories:[repo('newer'),chosen],truncated:false});await turn();
 assert.equal(f.picker.value,'quiz');assert.equal(f.picker.activeItems[0],item);assert.equal(f.picker.items.find(i=>i.repositoryUrl===chosen.html_url),item);
 f.select(item);assert.equal((await pending).repositoryUrl,chosen.html_url);
});
