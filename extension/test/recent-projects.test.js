'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createRecentProjects}=require('../src/recent-projects');
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-recents-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const storage=new Map();let clock=0,active=true;
 const history=createRecentProjects({globalState:{get:key=>storage.get(key),update:async(key,value)=>storage.set(key,value)},now:()=>++clock,active:()=>active,eligible:value=>path.basename(value)!=='setup'});
 async function project(name){const p=path.join(root,name);await fs.mkdir(p);await fs.writeFile(path.join(p,'zero.json'),'{}');return p;}
 return {root,storage,history,project,set active(value){active=value;}};
}
test('history persists, orders recent opens, deduplicates and isolates GitHub accounts',async t=>{
 const f=await fixture(t),a=await f.project('a'),b=await f.project('b');
 await f.history.remember(a,{accountId:'17',repositoryUrl:'https://github.com/student/a.git'});await f.history.remember(b,{accountId:'17'});await f.history.remember(a,{accountId:'17',repositoryUrl:'https://github.com/student/a'});
 assert.deepEqual((await f.history.list('17')).map(x=>x.path),[a,b]);assert.equal((await f.history.list('17'))[0].repositoryUrl,'https://github.com/student/a');
 assert.deepEqual(await f.history.list('18'),[]);await f.history.remember(b,{accountId:'18'});assert.deepEqual((await f.history.list('18')).map(x=>x.path),[b]);
});
test('deleted, unmarked and bundled setup projects are never offered',async t=>{
 const f=await fixture(t),a=await f.project('a'),b=await f.project('b'),setup=await f.project('setup');
 for(const p of [a,b,setup])await f.history.remember(p,{accountId:'17'});
 await fs.rm(a,{recursive:true});await fs.rm(path.join(b,'zero.json'));
 assert.deepEqual(await f.history.list('17'),[]);
});
test('bounded history rejects malformed state and never carries arbitrary URL fields to the picker',async t=>{
 const f=await fixture(t),a=await f.project('a');
 f.storage.set('zero.recentProjects.v1:17',[null,{path:'relative',lastOpened:1},{path:a,lastOpened:2,repositoryUrl:'https://evil.invalid/private',accessToken:'DO_NOT_RETAIN'}]);
 assert.deepEqual(await f.history.list('17'),[{path:a,lastOpened:2}]);
 for(let i=0;i<25;i++)await f.history.remember(await f.project(`p${i}`),{accountId:'17'});
 const list=await f.history.list('17');assert.equal(list.length,20);assert.equal(path.basename(list[0].path),'p24');assert.equal(path.basename(list.at(-1).path),'p5');
});
test('account drift during local validation, disposal and anonymous sessions do not write history',async t=>{
 const f=await fixture(t),a=await f.project('a');
 await f.history.remember(a,{accountId:'17',isCurrent:()=>false});await f.history.remember(a,{accountId:'student'});f.active=false;await f.history.remember(a,{accountId:'17'});
 assert.equal(f.storage.size,0);
});
test('unavailable history storage yields an empty list so cloning can still offer GitHub and paste',async()=>{
 const history=createRecentProjects({globalState:{get(){throw Error('Storage unavailable');}}});assert.deepEqual(await history.list('17'),[]);
});
