'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const child=require('node:child_process'),original=child.execFile;
let onQuery,onConfigOpen,onLockMkdir;
const originalOpen=fs.open,originalMkdir=fs.mkdir;
fs.open=async function(file,...args){if(onConfigOpen&&file.endsWith('/.git/config'))await onConfigOpen();return originalOpen.call(this,file,...args);};
fs.mkdir=async function(file,...args){if(onLockMkdir&&file.endsWith('/.git/zero-pending-sync.lock'))await onLockMkdir();return originalMkdir.call(this,file,...args);};
// Change the real test repository between the snapshot and its Git validation.
child.execFile=function(file,args,options,callback){
 return original(file,args,options,async(error,stdout,stderr)=>{
  if(onQuery&&args.includes('--list')) {const hook=onQuery;try{await hook();}catch(e){return callback(e);}}
  callback(error,stdout,stderr);
 });
};
child.execFile[require('node:util').promisify.custom]=async(file,args,options)=>{
 const result=await require('node:util').promisify(original)(file,args,options);
 if(onQuery&&args.includes('--list'))await onQuery();
 return result;
};
const {createFileLedger}=require('../src/pending-sync-file-ledger');
child.execFile=original;
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-config-race-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));child.execFileSync('git',['init','-q'],{cwd:root});return root;}
test('a one-time branch metadata write retries the read-only validation',async t=>{
 const root=await fixture(t),config=path.join(root,'.git','config');let changes=0;
 onQuery=async()=>{if(changes++===0)await fs.appendFile(config,'\n[branch "feature"]\n\tvscode-merge-base = origin/main\n');};
 try {assert.deepEqual(await createFileLedger().list(root),[]);assert.equal(changes,2);}finally{onQuery=undefined;}
});
test('a changed configuration is fully revalidated before acquiring the ledger',async t=>{
 const root=await fixture(t),config=path.join(root,'.git','config');let changes=0;
 onQuery=async()=>{if(changes++===0)await fs.appendFile(config,`\n[include]\n\tpath = ${path.join(root,'included-config')}\n`);};
 try {await assert.rejects(createFileLedger().list(root),/ordinary metadata/);assert.equal(changes,2);await assert.rejects(fs.lstat(path.join(root,'.git','zero-pending-sync.lock')),{code:'ENOENT'});}finally{onQuery=undefined;}
});
test('repeated configuration changes stop before acquiring the ledger',async t=>{
 const root=await fixture(t),config=path.join(root,'.git','config');let changes=0;
 onQuery=async()=>{changes++;await fs.appendFile(config,`\n# change ${changes}\n`);};
 try {await assert.rejects(createFileLedger().list(root),/Git configuration changed/);assert.equal(changes,3);await assert.rejects(fs.lstat(path.join(root,'.git','zero-pending-sync.lock')),{code:'ENOENT'});}finally{onQuery=undefined;}
});

test('atomic Git config replacement while opening the snapshot is retried',async t=>{
 const root=await fixture(t);let writes=0;
 onConfigOpen=async()=>{if(writes++===0)child.execFileSync('git',['config','--local','branch.feature.vscode-merge-base','origin/main'],{cwd:root});};
 try {assert.deepEqual(await createFileLedger().list(root),[]);assert.ok(writes>1);}finally{onConfigOpen=undefined;}
});
test('metadata written immediately before locking is freshly checked',async t=>{
 const root=await fixture(t);let writes=0;
 onLockMkdir=async()=>{writes++;child.execFileSync('git',['config','--local','branch.feature.vscode-merge-base','origin/main'],{cwd:root});};
 try {assert.deepEqual(await createFileLedger().list(root),[]);assert.equal(writes,1);await assert.rejects(fs.lstat(path.join(root,'.git','zero-pending-sync.lock')),{code:'ENOENT'});}finally{onLockMkdir=undefined;}
});
test('unsafe configuration discovered after locking leaves no empty lock',async t=>{
 const root=await fixture(t);
 onLockMkdir=async()=>child.execFileSync('git',['config','--local','include.path',path.join(root,'included-config')],{cwd:root});
 try {await assert.rejects(createFileLedger().list(root),/ordinary metadata/);await assert.rejects(fs.lstat(path.join(root,'.git','zero-pending-sync.lock')),{code:'ENOENT'});}finally{onLockMkdir=undefined;}
});
