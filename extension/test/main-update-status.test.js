'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {checkMainUpdate,mainHead}=require('../src/main-update-status');
const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40);
function fixture(){const state={root:'/student',branch:'feature',head:a,localMain:b,remote:'https://github.com/student/project.git',account:'1'};return {state,readState:async()=>({...state}),readRemote:async()=>`${c}\trefs/heads/main\n`,isAncestor:async()=>true};}
test('detects newer local or remote main, or reports missing remote objects as unknown',async()=>{
 let f=fixture();f.isAncestor=async sha=>sha===b;assert.equal((await checkMainUpdate(f)).state,'available');
 f=fixture();f.isAncestor=async sha=>sha===b?true:null;assert.equal((await checkMainUpdate(f)).state,'unknown');
 f=fixture();assert.equal((await checkMainUpdate(f)).state,'current');
 f=fixture();f.isAncestor=async sha=>sha!==b;const result=await checkMainUpdate(f);assert.equal(result.state,'current');assert.equal(result.localUpdate,true);
});
test('rejects malformed remote output and branch drift',async()=>{
 for(const s of ['',`${a}\trefs/heads/other`,`${a}\trefs/heads/main\n${b}\trefs/heads/main`])assert.throws(()=>mainHead(s));
 const f=fixture();f.readRemote=async()=>{f.state.branch='other';return `${c}\trefs/heads/main`;};await assert.rejects(checkMainUpdate(f),/changed/);
});
test('compares real branch ancestry without changing refs or worktree',async t=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-main-status-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull}}).trim();
 git('init','-qb','main');git('config','user.name','Student');git('config','user.email','student@example.invalid');await fs.writeFile(path.join(root,'a'),'a');git('add','.');git('commit','-qm','base');git('checkout','-qb','feature');const head=git('rev-parse','HEAD');git('checkout','-q','main');await fs.writeFile(path.join(root,'b'),'b');git('add','.');git('commit','-qm','new main');const main=git('rev-parse','HEAD');git('checkout','-q','feature');
 const state={root,branch:'feature',head,localMain:main,remote:'https://github.com/student/project.git',account:'1'};
 const result=await checkMainUpdate({readState:async()=>({...state}),readRemote:async()=>`${main}\trefs/heads/main`,isAncestor:async(x,y)=>{try{git('merge-base','--is-ancestor',x,y);return true;}catch(e){if(e.status===1)return false;throw e;}}});
 assert.equal(result.state,'available');assert.equal(git('rev-parse','HEAD'),head);assert.equal(git('status','--porcelain'),'');
});
