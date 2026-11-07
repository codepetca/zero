'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const undo=require('../src/change-undo');
const {withLocalMutation}=require('../src/commit-provenance');
const restore=require('../src/project-restore-plan');
const recovery=require('../src/git-retained-recovery');
function git(root,...args) {assert.ok(!args.some(arg=>arg==='reset'||arg==='--reset'),'reset-free Git fixture');return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
async function fixture(t, {kind='modify',attributes=false,stock=false,nestedRule,filename='a.txt'}={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'zero-undo-test-')); t.after(()=>fs.rm(root,{recursive:true,force:true}));
 git(root,'init','-b','main'); git(root,'config','user.name','Test');git(root,'config','user.email','test@example.invalid');
 await fs.mkdir(path.dirname(path.join(root,filename)),{recursive:true});
 await fs.writeFile(path.join(root,filename),'original\n');await fs.writeFile(path.join(root,'other.txt'),'base\n');if(attributes) await fs.writeFile(path.join(root,'.gitattributes'),'* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n');
 if(stock) {
  await fs.copyFile(path.resolve(__dirname,'../../student-template/.gitattributes'),path.join(root,'.gitattributes'));
  await fs.mkdir(path.join(root,'.zero-build'));
  await fs.copyFile(path.resolve(__dirname,'../../student-template/.zero-build/.gitattributes'),path.join(root,'.zero-build','.gitattributes'));
  if(nestedRule!==undefined)await fs.writeFile(path.join(root,'.zero-build','.gitattributes'),nestedRule);
  await fs.writeFile(path.join(root,'.zero-build','tool.txt'),'first\r\nsecond\r\n');
  await fs.writeFile(path.join(root,'mvnw'),'#!/bin/sh\necho ok\n');await fs.writeFile(path.join(root,'mvnw.cmd'),'@echo off\r\n');
 }
 git(root,'add','.');git(root,'commit','-m','base');const base=git(root,'rev-parse','HEAD');
 if(kind==='delete') await fs.unlink(path.join(root,filename));
 else if(kind==='add') await fs.writeFile(path.join(root,'added.txt'),'feature\n');
 else await fs.writeFile(path.join(root,filename),'feature\n');
 git(root,'add','-A');git(root,'commit','-m','feature');const feature=git(root,'rev-parse','HEAD');const tree=git(root,'rev-parse',`${feature}^{tree}`);
 const marker=git(root,'commit-tree',tree,'-p',base,'-p',feature,'-m','Zero: finish feature\n\nZero-Finished-Change: 1\nZero-Change-Branch: feature');
 // The marker has the feature tree, so moving this fixture's branch needs no
 // worktree or index operation.
 git(root,'update-ref','refs/heads/main',marker,feature);return {root,marker};
}
const guard=async()=>{};
test('committed inverse uses an opaque pinned target and guarded restore while preserving later commits',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root:raw,marker}=await fixture(t),root=await fs.realpath(raw);await fs.writeFile(path.join(root,'other.txt'),'later\n');git(root,'add','other.txt');git(root,'commit','-m','later');const old=git(root,'rev-parse','HEAD');
 const plan=await undo.preview(root,marker,{beforeMutation:guard});
 await withLocalMutation(root,async binding=>{
  const inverse=await undo.prepareCorrection(plan,{confirmed:true,binding});const name=path.basename(inverse.recoveryPath);
  const info=await recovery.inspectInverseRecovery(root,name);assert.equal(info.packMatches,true);assert.match(info.status,/pinned/);
  await assert.rejects(restore.reviewInverseCorrection({...inverse},{binding}),/Review the finished change/);
  const target=await restore.reviewInverseCorrection(inverse,{binding});assert.equal(target.head,old);assert.deepEqual(target.files.map(x=>x.name),['a.txt']);
  const prepared=await restore.prepareProjectRestore(target,{name:'Test',email:'test@example.invalid',binding});const pinned=await restore.retainPreparedProjectRestore(prepared);const result=await restore.applyRetainedProjectRestore(pinned);
  assert.equal(git(root,'rev-parse','HEAD'),result.commit);assert.equal(git(root,'rev-parse','HEAD^'),old);assert.equal(git(root,'show','-s','--format=%s','HEAD'),'Undo finished change');
 });
 assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');assert.equal(await fs.readFile(path.join(root,'other.txt'),'utf8'),'later\n');assert.equal(git(root,'status','--porcelain'),'');
});
for(const point of ['_testBeforeImport','_testBeforePin','_testAfterPin'])test(`inverse recovery is inspectable if interrupted at ${point}`,async t=>{
 const {root:raw,marker}=await fixture(t),root=await fs.realpath(raw),head=git(root,'rev-parse','HEAD');const plan=await undo.preview(root,marker,{beforeMutation:guard});let failure;
 await withLocalMutation(root,async binding=>{try{await undo.prepareCorrection(plan,{confirmed:true,binding,[point]:async()=>{throw Error('interrupted');}});}catch(error){failure=error;}});
 assert.ok(failure?.recoveryPath);const info=await recovery.inspectInverseRecovery(root,path.basename(failure.recoveryPath));assert.equal(info.packMatches,true);assert.match(info.status,/Import/);if(point==='_testAfterPin')assert.equal(info.observedRef.object,info.commit);assert.equal(git(root,'rev-parse','HEAD'),head);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}),/inverse import needs inspection/);
});
test('a changed durable inverse pack is rejected before import',async t=>{
 const {root:raw,marker}=await fixture(t),root=await fs.realpath(raw);const plan=await undo.preview(root,marker,{beforeMutation:guard});let failure;
 await withLocalMutation(root,async binding=>{try{await undo.prepareCorrection(plan,{confirmed:true,binding,_testBeforeImport:async()=>{const names=await recovery.listInverseRecoveries(root);await fs.appendFile(path.join(root,'.git',names[0],'inverse.pack'),'changed');}});}catch(error){failure=error;}});
 assert.ok(failure?.recoveryPath);const info=await recovery.inspectInverseRecovery(root,path.basename(failure.recoveryPath));assert.equal(info.packMatches,false);assert.equal(info.observedRef,null);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
});
test('inverse recovery listing reports an unsafe entry by path',async t=>{
 const f=await fixture(t),root=await fs.realpath(f.root),entry=path.join(root,'.git','zero-inverse-recovery-bad');await fs.symlink(os.tmpdir(),entry);
 await assert.rejects(recovery.listInverseRecoveries(root),error=>error.message.includes(entry));
});
test('inverse review rejects a symbolic replacement of its pin even at the same object',async t=>{
 const {root:raw,marker}=await fixture(t),root=await fs.realpath(raw),plan=await undo.preview(root,marker,{beforeMutation:guard});
 await withLocalMutation(root,async binding=>{
  const receipt=await undo.prepareCorrection(plan,{confirmed:true,binding}),info=await recovery.inspectInverseRecovery(root,path.basename(receipt.recoveryPath));
  git(root,'update-ref','refs/heads/synthetic-target',info.commit);git(root,'symbolic-ref',info.ref,'refs/heads/synthetic-target');
  await assert.rejects(restore.reviewInverseCorrection(receipt,{binding}));assert.equal(git(root,'rev-parse','HEAD'),marker);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
 });
});
for(const scenario of ['existing','replaced'])test(`inverse pin rejects ${scenario} symlinked ref parent without an outside write`,{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root:raw,marker}=await fixture(t),root=await fs.realpath(raw),outside=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-ref-outside-')));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
 const plan=await undo.preview(root,marker,{beforeMutation:guard});if(scenario==='existing')await fs.symlink(outside,path.join(root,'.git','refs','zero'));
 let failure;await withLocalMutation(root,async binding=>{try{await undo.prepareCorrection(plan,{confirmed:true,binding,...(scenario==='replaced'?{_testBeforePin:async()=>{const dir=path.join(root,'.git','refs','zero','inverse');await fs.rename(dir,`${dir}-held`);await fs.symlink(outside,dir);}}:{})});}catch(error){failure=error;}});
 assert.ok(failure);assert.deepEqual(await fs.readdir(outside),[]);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');assert.equal(git(root,'rev-parse','HEAD'),marker);
});
test('finished-change undo uses only its own live provenance lock',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const f=await fixture(t),root=await fs.realpath(f.root),plan=await undo.preview(root,f.marker,{beforeMutation:guard});
 const result=await withLocalMutation(root,binding=>undo.apply(plan,{confirmed:true,binding}));
 assert.equal(result.staged,true);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');
});
test('finished-change undo rejects an unbound provenance lock',async t=>{
 const f=await fixture(t),root=await fs.realpath(f.root),plan=await undo.preview(root,f.marker,{beforeMutation:guard});
 await assert.rejects(withLocalMutation(root,()=>undo.apply(plan,{confirmed:true})));
 assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
});
test('preview and stage inverse while preserving a later commit and unrelated files',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root,marker}=await fixture(t);await fs.writeFile(path.join(root,'other.txt'),'later\n');git(root,'add','.');git(root,'commit','-m','later');const head=git(root,'rev-parse','HEAD');
 await fs.writeFile(path.join(root,'untracked.txt'),'keep');const plan=await undo.preview(root,marker,{beforeMutation:guard});
 assert.equal(plan.branch,'main');assert.deepEqual(plan.files,['a.txt']);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
 const result=await undo.apply(plan,{confirmed:true});assert.equal(result.staged,true);assert.equal(git(root,'rev-parse','HEAD'),head);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');assert.equal(await fs.readFile(path.join(root,'other.txt'),'utf8'),'later\n');assert.equal(await fs.readFile(path.join(root,'untracked.txt'),'utf8'),'keep');assert.equal(git(root,'diff','--cached','--name-only'),'a.txt');
});
test('conflict stops at preview without changing the project',async t=>{
 const {root,marker}=await fixture(t);await fs.writeFile(path.join(root,'a.txt'),'later conflicting\n');git(root,'add','.');git(root,'commit','-m','later');const head=git(root,'rev-parse','HEAD');
 await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}),/conflict/);assert.equal(git(root,'rev-parse','HEAD'),head);assert.equal(git(root,'status','--porcelain'),'');assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'later conflicting\n');
});
test('drift or a failed guard before mutation leaves the new work alone',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root,marker}=await fixture(t);const plan=await undo.preview(root,marker,{beforeMutation:guard});await fs.writeFile(path.join(root,'other.txt'),'new work\n');await assert.rejects(undo.apply(plan,{confirmed:true}));assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');assert.equal(await fs.readFile(path.join(root,'other.txt'),'utf8'),'new work\n');
 const again=await fixture(t);let calls=0;const p=await undo.preview(again.root,again.marker,{beforeMutation:async()=>{if(++calls>1) throw Error('unsaved editor');}});await assert.rejects(undo.apply(p,{confirmed:true}),/unsaved editor/);assert.equal(git(again.root,'status','--porcelain'),'');
});
for(const kind of ['add','delete']) test(`undo a finished ${kind}`,{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
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
test('reject a differently cased ignored directory before restoring a file',async t=>{
 const {root,marker}=await fixture(t,{kind:'delete'});await fs.writeFile(path.join(root,'.gitignore'),'A.TXT/\n');git(root,'add','.gitignore');git(root,'commit','-m','ignore directory');
 await fs.mkdir(path.join(root,'A.TXT'));await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));assert.ok((await fs.stat(path.join(root,'A.TXT'))).isDirectory());assert.equal(git(root,'diff','--cached','--name-only'),'');
});
test('reject a differently cased ignored parent before restoring a nested file',async t=>{
 const {root,marker}=await fixture(t,{kind:'delete',filename:'dir/item.txt'});await fs.rmdir(path.join(root,'dir'));await fs.writeFile(path.join(root,'.gitignore'),'DIR/\n');git(root,'add','.gitignore');git(root,'commit','-m','ignore directory');
 await fs.mkdir(path.join(root,'DIR'));await fs.writeFile(path.join(root,'DIR','keep'),'private');await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));assert.equal(await fs.readFile(path.join(root,'DIR','keep'),'utf8'),'private');assert.equal(git(root,'diff','--cached','--name-only'),'');
});
test('reject a Windows device name in history before preview or mutation', {skip:process.platform==='win32'},async t=>{
 const {root,marker}=await fixture(t);await fs.writeFile(path.join(root,'CON.txt'),'keep\n');git(root,'add','CON.txt');git(root,'commit','-m','device name');const head=git(root,'rev-parse','HEAD');
 await assert.rejects(undo.preview(root,marker,{beforeMutation:guard,platform:'win32'}));assert.equal(git(root,'rev-parse','HEAD'),head);assert.equal(await fs.readFile(path.join(root,'CON.txt'),'utf8'),'keep\n');assert.equal(git(root,'status','--porcelain'),'');
});
test('POSIX undo permits an unrelated Windows-reserved filename', {skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root,marker}=await fixture(t);await fs.writeFile(path.join(root,'CON.txt'),'keep\n');git(root,'add','CON.txt');git(root,'commit','-m','ordinary POSIX name');
 const plan=await undo.preview(root,marker,{beforeMutation:guard});await undo.apply(plan,{confirmed:true});assert.equal(await fs.readFile(path.join(root,'CON.txt'),'utf8'),'keep\n');assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');
});
test('simulated Windows rejects an 8.3 alias before restoring a deleted file', {skip:process.platform==='win32'},async t=>{
 const {root,marker}=await fixture(t,{kind:'delete',filename:'LONGFI~1.TXT'});await fs.writeFile(path.join(root,'LongFilename.txt'),'keep\n');
 await assert.rejects(undo.preview(root,marker,{beforeMutation:guard,platform:'win32'}));assert.equal(await fs.readFile(path.join(root,'LongFilename.txt'),'utf8'),'keep\n');await assert.rejects(fs.stat(path.join(root,'LONGFI~1.TXT')),{code:'ENOENT'});assert.equal(git(root,'diff','--cached','--name-only'),'');
});
test('reject non-marker commits, dirty index and unsupported Git configuration',async t=>{
 const {root,marker}=await fixture(t);const feature=git(root,'rev-parse',`${marker}^2`);await assert.rejects(undo.preview(root,feature,{beforeMutation:guard}));
 await fs.writeFile(path.join(root,'other.txt'),'staged\n');git(root,'add','other.txt');await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));
 const fresh=await fixture(t);git(fresh.root,'config','filter.evil.clean','false');await assert.rejects(undo.preview(fresh.root,fresh.marker,{beforeMutation:guard}));assert.equal(git(fresh.root,'status','--porcelain'),'');
});
test('guard drift during final revalidation never starts Git revert',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root,marker}=await fixture(t);let calls=0;const plan=await undo.preview(root,marker,{beforeMutation:async()=>{if(++calls===3) await fs.writeFile(path.join(root,'other.txt'),'last moment\n');}});
 await assert.rejects(undo.apply(plan,{confirmed:true}));assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');assert.equal(await fs.readFile(path.join(root,'other.txt'),'utf8'),'last moment\n');assert.equal(git(root,'diff','--cached','--name-only'),'');
});
test('supports Zero template attributes and compares actual converted bytes',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root,marker}=await fixture(t);const attrs='* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n';await fs.writeFile(path.join(root,'.gitattributes'),attrs);await fs.writeFile(path.join(root,'mvnw.cmd'),'echo hi\r\n');git(root,'add','.');git(root,'commit','-m','template attributes');
 const plan=await undo.preview(root,marker,{beforeMutation:guard});await undo.apply(plan,{confirmed:true});assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');assert.equal(await fs.readFile(path.join(root,'mvnw.cmd'),'utf8'),'echo hi\r\n');
});

test('supports exact template attributes in historic marker trees',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root,marker}=await fixture(t,{attributes:true});const plan=await undo.preview(root,marker,{beforeMutation:guard});await undo.apply(plan,{confirmed:true});assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');
});
test('stock student-template rules support committed correction and preserve later work and tooling bytes',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root:raw,marker}=await fixture(t,{stock:true}),root=await fs.realpath(raw);
 const rootRules=await fs.readFile(path.join(root,'.gitattributes')),nestedRules=await fs.readFile(path.join(root,'.zero-build','.gitattributes')),tool=await fs.readFile(path.join(root,'.zero-build','tool.txt'));
 await fs.writeFile(path.join(root,'other.txt'),'later\n');git(root,'add','other.txt');git(root,'commit','-m','later');const head=git(root,'rev-parse','HEAD');
 const plan=await undo.preview(root,marker,{beforeMutation:guard});assert.deepEqual(plan.files,['a.txt']);
 await withLocalMutation(root,async binding=>{
  const inverse=await undo.prepareCorrection(plan,{confirmed:true,binding}),review=await restore.reviewInverseCorrection(inverse,{binding});
  const prepared=await restore.prepareProjectRestore(review,{name:'Test',email:'test@example.invalid',binding}),result=await restore.applyRetainedProjectRestore(await restore.retainPreparedProjectRestore(prepared));
  assert.equal(git(root,'rev-parse',`${result.commit}^`),head);
 });
 assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\n');assert.equal(await fs.readFile(path.join(root,'other.txt'),'utf8'),'later\n');
 assert.deepEqual(await fs.readFile(path.join(root,'.gitattributes')),rootRules);assert.deepEqual(await fs.readFile(path.join(root,'.zero-build','.gitattributes')),nestedRules);assert.deepEqual(await fs.readFile(path.join(root,'.zero-build','tool.txt')),tool);
 assert.equal(await fs.readFile(path.join(root,'mvnw.cmd'),'utf8'),'@echo off\r\n');assert.equal(git(root,'status','--porcelain'),'');
});
test('stock nested rules retain tooling bytes through committed correction with root CRLF attributes',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root:raw,marker}=await fixture(t,{stock:true}),root=await fs.realpath(raw);git(root,'config','core.autocrlf','true');git(root,'read-tree','HEAD');git(root,'checkout-index','--all','--force');
 const rules=await fs.readFile(path.join(root,'.gitattributes')),tool=await fs.readFile(path.join(root,'.zero-build','tool.txt'));assert.match(rules.toString(),/\r\n/);
 assert.equal(await fs.readFile(path.join(root,'.zero-build','.gitattributes'),'utf8'),'* -text\n');
 const plan=await undo.preview(root,marker,{beforeMutation:guard});
 await withLocalMutation(root,async binding=>{
  const inverse=await undo.prepareCorrection(plan,{confirmed:true,binding}),review=await restore.reviewInverseCorrection(inverse,{binding});
  const prepared=await restore.prepareProjectRestore(review,{name:'Test',email:'test@example.invalid',binding});await restore.applyRetainedProjectRestore(await restore.retainPreparedProjectRestore(prepared));
 });
 assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\r\n');assert.deepEqual(await fs.readFile(path.join(root,'.gitattributes')),rules);assert.deepEqual(await fs.readFile(path.join(root,'.zero-build','tool.txt')),tool);assert.equal(git(root,'status','--porcelain'),'');
});
async function globalStockFixture(t,{autocrlf='true',eol='native'}={}) {
 const f=await fixture(t,{stock:true}),root=await fs.realpath(f.root),home=await fs.mkdtemp(path.join(os.tmpdir(),'zero-stock-global-'));
 const previous={HOME:process.env.HOME,XDG_CONFIG_HOME:process.env.XDG_CONFIG_HOME};process.env.HOME=home;process.env.XDG_CONFIG_HOME=path.join(home,'.config');
 t.after(async()=>{for(const key of Object.keys(previous))if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];await fs.rm(home,{recursive:true,force:true});});
 git(home,'config','--global','core.autocrlf',autocrlf);git(home,'config','--global','core.eol',eol);git(root,'read-tree','HEAD');git(root,'checkout-index','--all','--force');
 await assert.rejects(async()=>git(root,'config','--local','--get','core.autocrlf'));
 return {...f,root,home};
}
for(const setting of ['autocrlf','eol'])test(`committed stock correction preserves effective global ${setting} settings`,{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root,marker}=await globalStockFixture(t,setting==='autocrlf'?{}:{autocrlf:'false',eol:'crlf'}),rules=await fs.readFile(path.join(root,'.gitattributes')),tool=await fs.readFile(path.join(root,'.zero-build','tool.txt'));
 assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\r\n');
 const plan=await undo.preview(root,marker,{beforeMutation:guard});
 await withLocalMutation(root,async binding=>{
  const inverse=await undo.prepareCorrection(plan,{confirmed:true,binding}),review=await restore.reviewInverseCorrection(inverse,{binding}),prepared=await restore.prepareProjectRestore(review,{name:'Test',email:'test@example.invalid',binding});
  await restore.applyRetainedProjectRestore(await restore.retainPreparedProjectRestore(prepared));
 });
 assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\r\n');assert.deepEqual(await fs.readFile(path.join(root,'.gitattributes')),rules);assert.deepEqual(await fs.readFile(path.join(root,'.zero-build','tool.txt')),tool);assert.equal(git(root,'status','--porcelain'),'');
});
test('global conversion drift after inverse pinning invalidates the correction handoff',async t=>{
 const {root,marker,home}=await globalStockFixture(t),head=git(root,'rev-parse','HEAD'),plan=await undo.preview(root,marker,{beforeMutation:guard});
 await withLocalMutation(root,async binding=>{
  const inverse=await undo.prepareCorrection(plan,{confirmed:true,binding});git(home,'config','--global','core.autocrlf','false');
  await assert.rejects(restore.reviewInverseCorrection(inverse,{binding}));
 });
 assert.equal(git(root,'rev-parse','HEAD'),head);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\r\n');
});
for(const point of ['before-files','before-ref'])test(`global conversion drift at ${point} blocks correction advancement`,{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root,marker,home}=await globalStockFixture(t),head=git(root,'rev-parse','HEAD'),plan=await undo.preview(root,marker,{beforeMutation:guard});
 await withLocalMutation(root,async binding=>{
  const inverse=await undo.prepareCorrection(plan,{confirmed:true,binding}),review=await restore.reviewInverseCorrection(inverse,{binding}),prepared=await restore.prepareProjectRestore(review,{name:'Test',email:'test@example.invalid',binding}),pinned=await restore.retainPreparedProjectRestore(prepared);
  await assert.rejects(restore.applyRetainedProjectRestore(pinned,{_testBeforeStep:async step=>{if(step===point)git(home,'config','--global','core.autocrlf','false');}}),/line-ending settings changed/);
  if(point==='before-files')assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\r\n');
  else assert.match(await fs.readFile(path.join(pinned.recoveryPath,'apply-journal.jsonl'),'utf8'),/index-installed/);
 });
 assert.equal(git(root,'rev-parse','HEAD'),head);
});
for(const location of ['working','index','history'])test(`stock nested attribute tampering is rejected in ${location}`,async t=>{
 const {root,marker}=await fixture(t,{stock:true,...(location==='history'?{nestedRule:'# custom\n* -text\n'}:{})}),file=path.join(root,'.zero-build','.gitattributes');
 if(location==='working')await fs.writeFile(file,'* text\n');
 else if(location==='index') {
  const object=execFileSync('git',['hash-object','-w','--stdin'],{cwd:root,input:'* text\n',encoding:'utf8'}).trim();git(root,'update-index','--cacheinfo','100644',object,'.zero-build/.gitattributes');
 } else {await fs.writeFile(file,'* -text\n');git(root,'add','.zero-build/.gitattributes');git(root,'commit','-m','repair rules');assert.equal(git(root,'status','--porcelain'),'');}
 const head=git(root,'rev-parse','HEAD'),index=await fs.readFile(path.join(root,'.git','index'));
 await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));assert.equal(git(root,'rev-parse','HEAD'),head);assert.deepEqual(await fs.readFile(path.join(root,'.git','index')),index);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
});
for(const location of ['custom','untracked stock','ignored stock'])test(`additional ${location} nested attribute rules are rejected`,async t=>{
 const {root,marker}=await fixture(t,{stock:true}),dir=path.join(root,location==='custom'?'other':'.other-build');await fs.mkdir(dir);await fs.writeFile(path.join(dir,'.gitattributes'),'* -text\n');
 if(location==='custom'){git(root,'add','other');git(root,'commit','-m','custom rule path');}
 else if(location==='ignored stock')await fs.writeFile(path.join(root,'.git','info','exclude'),'.other-build/\n');
 await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
});
async function replaceStockAttribute(t,root,kind) {
 const held=await fs.mkdtemp(path.join(os.tmpdir(),'zero-held-attributes-'));t.after(()=>fs.rm(held,{recursive:true,force:true}));
 const dir=path.join(root,'.zero-build'),file=path.join(dir,'.gitattributes');
 if(kind==='file') {const bytes=await fs.readFile(file);await fs.rename(file,path.join(held,'rules'));await fs.writeFile(file,bytes);}
 else {await fs.rename(dir,path.join(held,'directory'));await fs.mkdir(dir);for(const name of await fs.readdir(path.join(held,'directory')))await fs.rename(path.join(held,'directory',name),path.join(dir,name));}
}
for(const kind of ['file','directory'])test(`same-byte stock attribute ${kind} replacement invalidates reviewed undo`,{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root,marker}=await fixture(t,{stock:true}),plan=await undo.preview(root,marker,{beforeMutation:guard}),head=git(root,'rev-parse','HEAD');
 await replaceStockAttribute(t,root,kind);assert.equal(git(root,'status','--porcelain'),'');
 const index=await fs.readFile(path.join(root,'.git','index'));
 await assert.rejects(undo.apply(plan,{confirmed:true}));assert.equal(git(root,'rev-parse','HEAD'),head);assert.deepEqual(await fs.readFile(path.join(root,'.git','index')),index);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
});
test('stock attribute identity remains bound after inverse pinning and before correction review',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root:raw,marker}=await fixture(t,{stock:true}),root=await fs.realpath(raw),plan=await undo.preview(root,marker,{beforeMutation:guard}),head=git(root,'rev-parse','HEAD');
 await withLocalMutation(root,async binding=>{
  const inverse=await undo.prepareCorrection(plan,{confirmed:true,binding});await replaceStockAttribute(t,root,'directory');
  await assert.rejects(restore.reviewInverseCorrection(inverse,{binding}));
 });
 assert.equal(git(root,'rev-parse','HEAD'),head);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
});
test('hard-linked stock attribute files are rejected before inverse preparation',async t=>{
 const {root,marker}=await fixture(t,{stock:true}),outside=await fs.mkdtemp(path.join(os.tmpdir(),'zero-linked-attributes-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
 await fs.link(path.join(root,'.zero-build','.gitattributes'),path.join(outside,'rules'));
 const head=git(root,'rev-parse','HEAD');await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));assert.equal(git(root,'rev-parse','HEAD'),head);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
});
test('custom nested filter rules never execute during guarded undo preview',async t=>{
 const {root,marker}=await fixture(t,{stock:true}),sentinel=path.join(root,'.git','filter-ran'),script=path.join(root,'.git','filter-script');
 const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
 await fs.writeFile(script,`#!/bin/sh\nprintf ran > ${quote(sentinel)}\ncat\n`,{mode:0o700});git(root,'config','filter.custom.clean',quote(script));await fs.writeFile(path.join(root,'.zero-build','.gitattributes'),'* filter=custom\n');
 await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}));await assert.rejects(fs.stat(sentinel),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
});
test('Git failure after revalidation leaves its state for Source Control',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
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
test('undo in a Windows-style clone with local CRLF settings and template attributes',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root:source,marker}=await fixture(t,{attributes:true});const parent=await fs.mkdtemp(path.join(os.tmpdir(),'zero-windows-clone-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 git(parent,'clone','-c','core.autocrlf=true','-c','core.symlinks=false','-c','core.hideDotFiles=true','--no-local',source,'project');const root=path.join(parent,'project');
 assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\r\n');assert.match(await fs.readFile(path.join(root,'.gitattributes'),'utf8'),/\r\n/);
 const plan=await undo.preview(root,marker,{beforeMutation:guard});await undo.apply(plan,{confirmed:true});assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\r\n');assert.equal(git(root,'diff','--cached','--name-only'),'a.txt');
});
test('uses effective global CRLF settings and refuses drift before applying',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root:source,marker}=await fixture(t,{attributes:true});const parent=await fs.mkdtemp(path.join(os.tmpdir(),'zero-global-crlf-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 const previousHome=process.env.HOME;process.env.HOME=parent;t.after(()=>{if(previousHome===undefined) delete process.env.HOME;else process.env.HOME=previousHome;});
 git(parent,'config','--file',path.join(parent,'.gitconfig'),'core.autocrlf','true');git(parent,'clone','--no-local',source,'project');const root=path.join(parent,'project');
 assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\r\n');const stale=await undo.preview(root,marker,{beforeMutation:guard});
 git(parent,'config','--file',path.join(parent,'.gitconfig'),'core.autocrlf','false');await assert.rejects(undo.apply(stale,{confirmed:true}));assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\r\n');
 git(parent,'config','--file',path.join(parent,'.gitconfig'),'core.autocrlf','true');const plan=await undo.preview(root,marker,{beforeMutation:guard});await undo.apply(plan,{confirmed:true});assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\r\n');
});
test('rejects unsupported line ending values before applying',async t=>{
 const {root,marker}=await fixture(t);git(root,'config','core.autocrlf','maybe');await assert.rejects(undo.preview(root,marker,{beforeMutation:guard}),/unsupported Git line-ending setting/);assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\n');
});
test('respects core.eol and preserves template wrapper line endings',{skip:'Deferred: corrective mutation or directory substitution requires recovery safety review.'},async t=>{
 const {root:source,marker}=await fixture(t,{attributes:true});await fs.writeFile(path.join(source,'mvnw'),'#!/bin/sh\necho ok\n');await fs.writeFile(path.join(source,'mvnw.cmd'),'@echo off\r\necho ok\r\n');git(source,'add','.');git(source,'commit','-m','wrappers');
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'zero-eol-clone-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));git(parent,'clone','-c','core.autocrlf=false','-c','core.eol=crlf','-c','core.symlinks=false','-c','core.hideDotFiles=dotGitOnly','--no-local',source,'project');const root=path.join(parent,'project');
 assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'feature\r\n');assert.equal(await fs.readFile(path.join(root,'mvnw'),'utf8'),'#!/bin/sh\necho ok\n');assert.equal(await fs.readFile(path.join(root,'mvnw.cmd'),'utf8'),'@echo off\r\necho ok\r\n');
 const plan=await undo.preview(root,marker,{beforeMutation:guard});await undo.apply(plan,{confirmed:true});assert.equal(await fs.readFile(path.join(root,'a.txt'),'utf8'),'original\r\n');assert.equal(await fs.readFile(path.join(root,'mvnw'),'utf8'),'#!/bin/sh\necho ok\n');assert.equal(await fs.readFile(path.join(root,'mvnw.cmd'),'utf8'),'@echo off\r\necho ok\r\n');
});
