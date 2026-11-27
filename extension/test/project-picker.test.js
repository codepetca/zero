'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProjectPicker}=require('../src/project-picker');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({recent=[],listZero=async()=>({repositories:[],truncated:false}),readPublicStandaloneZero,showInputBox=async()=>undefined,isGameJamProject,timeout=10000}={}) {
  const handlers={accept:new Set(),hide:new Set()},reports=[],calls=[];
  const event=name=>fn=>{handlers[name].add(fn);return {dispose:()=>handlers[name].delete(fn)};};
  let account=true,shown=false;
  const picker={items:[],selectedItems:[],activeItems:[],disposed:0,onDidAccept:event('accept'),onDidHide:event('hide'),show(){shown=true;},dispose(){this.disposed++;}};
  const ticket={session:{accountId:'17'},revision:1};
  const authentication={capture:async()=>ticket,assertCurrentNow(value){if(!account||value!==ticket)throw Error('Account changed');}};
  const ui=createProjectPicker({QuickPickItemKind:{Separator:-1},window:{createQuickPick:()=>picker,showInputBox}},{authentication,repositories:{listZero,readPublicStandaloneZero},history:{list:async accountId=>{calls.push(accountId);return recent;}},isGameJamProject,discoveryTimeout:timeout,report:text=>reports.push(text)});
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
test('recent GitHub picker rows mark the signed-in account’s linked Game Jam',async()=>{
  const repositoryUrl='https://github.com/student/moon-game';
  const f=fixture({
    recent:[{path:'/projects/other'},{path:'/projects/moon-game',repositoryUrl}],
    isGameJamProject:(account,url)=>account==='17'&&url===repositoryUrl
  });
  const pending=f.ui.choose();await turn();
  const rows=f.picker.items.filter(item=>item.action==='recent');
  assert.deepEqual(rows.map(item=>item.description),['other','student/moon-game · Game Jam']);
  f.select(rows[1]);
  assert.equal((await pending).projectPath,'/projects/moon-game');
});
test('the Game Jam picker shows eligible public repositories and URL entry without recent folders',async()=>{
  const publicRepo=repo('moon-game');
  const f=fixture({recent:[{path:'/projects/local'}],listZero:async({standaloneOnly})=>{
    assert.equal(standaloneOnly,true);
    return {repositories:[publicRepo,{...repo('private-game'),private:true}],truncated:false};
  }});
  const pending=f.ui.choose({publicRepositoriesOnly:true,standaloneOnly:true});
  await turn();
  assert.deepEqual(f.calls,[]);
  assert.deepEqual(f.picker.items.filter(item=>item.action).map(item=>item.action),['repository','paste']);
  f.select(f.picker.items.find(item=>item.action==='repository'));
  const selected=await pending;
  assert.equal(selected.repositoryUrl,publicRepo.html_url);
  assert.equal(selected.repositoryId,String(publicRepo.id));
});
test('Game Jam URL entry verifies the selected repository and preserves the original ID',async()=>{
  const selected=repo('moon-game');let inputOptions;
  const f=fixture({showInputBox:async options=>{inputOptions=options;return selected.html_url+'.git';},readPublicStandaloneZero:async(url,{ticket,signal})=>{
    assert.equal(url,selected.html_url);assert.equal(ticket,f.ticket);assert.equal(signal.aborted,false);return selected;
  }});
  const pending=f.ui.choose({publicRepositoriesOnly:true,repositoryId:String(selected.id)});await turn();
  f.select(f.picker.items.find(item=>item.action==='paste'));
  assert.equal((await pending).repositoryId,String(selected.id));assert.ok(inputOptions.validateInput('https://evil.invalid/repo'));
  const mismatch=fixture({showInputBox:async()=>selected.html_url,readPublicStandaloneZero:async()=>selected});
  const other=mismatch.ui.choose({publicRepositoriesOnly:true,repositoryId:'999'});await turn();mismatch.select(mismatch.picker.items.at(-1));
  await assert.rejects(other,/original Game Jam repository/);
});
test('Game Jam URL input cancellation and account changes do not return a selection',async()=>{
  for(const drift of [false,true]) {
    let resolveInput,verified=false;
    const f=fixture({showInputBox:()=>new Promise(resolve=>{resolveInput=resolve;}),readPublicStandaloneZero:async()=>{verified=true;return repo('game');}});
    const pending=f.ui.choose({publicRepositoriesOnly:true,standaloneOnly:true});await turn();f.select(f.picker.items.at(-1));await turn();
    if(drift){f.account=false;f.ui.sessionChanged();}
    resolveInput(drift?'https://github.com/student/game':undefined);
    assert.equal(await pending,undefined);assert.equal(verified,false);
  }
});
test('account change during Game Jam URL verification aborts the lookup and ignores its result',async()=>{
  let finish,signal;
  const f=fixture({showInputBox:async()=>repo('game').html_url,readPublicStandaloneZero:async(url,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});}});
  const pending=f.ui.choose({publicRepositoriesOnly:true});await turn();f.select(f.picker.items.at(-1));await turn();
  f.account=false;f.ui.sessionChanged();assert.equal(signal.aborted,true);finish(repo('game'));
  assert.equal(await pending,undefined);
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
