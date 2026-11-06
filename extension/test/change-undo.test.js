'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const undo=require('../src/change-undo');
function git(root,...args) {return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
async function fixture(t, {kind='modify',attributes=false}={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-undo-test-')); t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-b','main'); git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await fs.writeFile(path.join(root,'a.txt'),'original\n');await fs.writeFile(path.join(root,'other.txt'),'base\n');if(attributes) await fs.writeFile(path.join(root,'.gitattributes'),'* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n');
 git(root,'add','.');git(root,'commit','-m','base');const base=git(root,'rev-parse','HEAD');
 if(kind==='delete') await fs.unlink(path.join(root,'a.txt'));
 else if(kind==='add') await fs.writeFile(path.join(root,'added.txt'),'feature\n');
 else await fs.writeFile(path.join(root,'a.txt'),'feature\n');
 git(root,'add','-A');git(root,'commit','-m','feature');const feature=git(root,'rev-parse','HEAD');const tree=git(root,'rev-parse',`${feature}^{tree}`);
 const marker=git(root,'commit-tree',tree,'-p',base,'-p',feature,'-m','Zero: finish feature\n\nZero-Finished-Change: 1\nZero-Change-Branch: feature');
 git(root,'reset','--hard',marker);return {root,marker};
}
const guard=async()=>{};
test('preview and stage inverse while preserving a later commit and unrelated files',async t=>{
 const {root,marker}=await fixture(t);await fs.writeFile(path.join(root,'other.txt'),'later\n');git(root,'add','.');git(root,'commit','-m','later');const head=git(root,'rev-parse','HEAD');
 await fs.writeFile(path.join(root,'untracked.txt'),'keep');const plan=await undo.preview(root,marker,{beforeMutation:guard});
 assert.equal(plan.branch,'main');assert.deepEqual(plan.files,['a.txt']);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
 const result=await undo.apply(plan,{confirmed:true});assert.equal(result.staged,true);assert.equal(git(root,'rev-parse','HEAD'),head);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');assert.equal(await fs.readFile(path.join(root,'other.txt'),'utf8'),'later\n');assert.equal(await fs.readFile(path.join(root,'untracked.txt'),'utf8'),'keep');assert.equal(git(root,'diff','--cached','--name-only'),'a.txt');
});
test('conflict stops at preview without changing the project',async t=>{
 const {root,marker}=await fixture(t);await fs.writeFile(path.join(root,'a.txt'),'later conflicting\n');git(root,'add','.');git(root,'commit','-m','later');const head=git(root,'rev-parse','HEAD');
 await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}),/conflict/);assert.equal(git(root,'rev-parse','HEAD'),head);assert.equal(git(root,'status','--porcelain'),'');assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'later conflicting\n');
});
test('drift or a failed guard before mutation leaves the new work alone',async t=>{
 const {root,marker}=await fixture(t);const plan=await undo.preview(root,marker,{beforeMutation:guard});await fs.writeFile(path.join(root,'other.txt'),'new work\n');await assert.rejects(undo.apply(plan,{confirmed:true}));assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');assert.equal(await fs.readFile(path.join(root,'other.txt'),'utf8'),'new work\n');
 const again=await fixture(t);let calls=0;const p=await undo.preview(again.root,again.marker,{beforeMutation:async()=>{if(++calls>1) throw Error('unsaved editor');}});await assert.rejects(undo.apply(p,{confirmed:true}),/unsaved editor/);assert.equal(git(again.root,'status','--porcelain'),'');
});
for(const kind of ['add','delete']) test(`undo a finished ${kind}`,async t=>{
 const {root,marker}=await fixture(t,{kind});const plan=await undo.preview(root,marker,{beforeMutation:guard});await undo.apply(plan,{confirmed:true});
 if(kind==='add') await assert.rejects(fs.stat(path.join(root,'added.txt')),{code:'ENOENT'});else assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');
});
test('reject unsupported attributes and unconfirmed or forged plans',async t=>{
 const {root,marker}=await fixture(t);await fs.writeFile(path.join(root,'.gitattributes'),'* text\n');await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));await fs.unlink(path.join(root,'.gitattributes'));
 const plan=await undo.preview(root,marker,{beforeMutation:guard});await assert.rejects(undo.apply(plan),/confirm/);await assert.rejects(undo.apply({...plan},{confirmed:true}),/confirm/);assert.equal(git(root,'status','--porcelain'),'');
});
test('ignored collision is protected',async t=>{
 const {root,marker}=await fixture(t,{kind:'delete'});await fs.writeFile(path.join(root,'.gitignore'),'a.txt\n');git(root,'add','.gitignore');git(root,'commit','-m','ignore');await fs.writeFile(path.join(root,'a.txt'),'precious\n');
 await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'precious\n');
});
test('reject an ignored empty directory in a restored file path',async t=>{
 const {root,marker}=await fixture(t,{kind:'delete'});await fs.mkdir(path.join(root,'a.txt'));await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));assert.ok((await fs.stat(path.join(root,'a.txt'))).isDirectory());
});
test('reject non-marker commits, dirty index and unsupported Git configuration',async t=>{
 const {root,marker}=await fixture(t);const feature=git(root,'rev-parse',`${marker}^2`);await assert.rejects(undo.preview(root,feature,{beforeMutation:guard}));
 await fs.writeFile(path.join(root,'other.txt'),'staged\n');git(root,'add','other.txt');await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));git(root,'reset','--hard',marker);
 git(root,'config','filter.evil.clean','false');await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));assert.equal(git(root,'status','--porcelain'),'');
});
test('guard drift during final revalidation never starts Git revert',async t=>{
 const {root,marker}=await fixture(t);let calls=0;const plan=await undo.preview(root,marker,{beforeMutation:async()=>{if(++calls===3) await fs.writeFile(path.join(root,'other.txt'),'last moment\n');}});
 await assert.rejects(undo.apply(plan,{confirmed:true}));assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');assert.equal(await fs.readFile(path.join(root,'other.txt'),'utf8'),'last moment\n');assert.equal(git(root,'diff','--cached','--name-only'),'');
});
test('supports Zero template attributes and compares actual converted bytes',async t=>{
 const {root,marker}=await fixture(t);const attrs='* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n';await fs.writeFile(path.join(root,'.gitattributes'),attrs);await fs.writeFile(path.join(root,'mvnw.cmd'),'echo hi\r\n');git(root,'add','.');git(root,'commit','-m','template attributes');
 const plan=await undo.preview(root,marker,{beforeMutation:guard});await undo.apply(plan,{confirmed:true});assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');assert.equal(await fs.readFile(path.join(root,'mvnw.cmd'),'utf8'),'echo hi\r\n');
});

test('supports exact template attributes in historic marker trees',async t=>{
 const {root,marker}=await fixture(t,{attributes:true});const plan=await undo.preview(root,marker,{beforeMutation:guard});await undo.apply(plan,{confirmed:true});assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');
});
test('Git failure after revalidation leaves its state for Source Control',async t=>{
 const {root,marker}=await fixture(t);let calls=0;const lock=path.join(root,'.git','index.lock');const plan=await undo.preview(root,marker,{beforeMutation:async()=>{if(++calls===3) await fs.writeFile(lock,'external lock');}});
 await assert.rejects(undo.apply(plan,{confirmed:true}),/inspect the staged changes and files in native Source Control/);assert.equal(await fs.readFile(lock,'utf8'),'external lock');assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
});
test('reject a tracked symlink without touching it',async t=>{
 const {root,marker}=await fixture(t);await fs.symlink('a.txt',path.join(root,'link'));git(root,'add','link');git(root,'commit','-m','link');await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));assert.equal(await fs.readlink(path.join(root,'link')),'a.txt');
});
test('pending Zero finish, recovery and locks block undo',async t=>{
 const {root,marker}=await fixture(t);git(root,'update-ref','refs/zero/pending-finish',marker);await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));git(root,'update-ref','-d','refs/zero/pending-finish');
 for(const name of ['zero-update-recovery.json','zero-update-recovery.lock','zero-change-undo.lock']) {const file=path.join(root,'.git',name);await fs.writeFile(file,'pending');await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));await fs.unlink(file);}
 assert.equal(git(root,'status','--porcelain'),'');
});
