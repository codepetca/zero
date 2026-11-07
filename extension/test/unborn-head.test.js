'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {execFileSync}=require('node:child_process');
const {inspectUnbornHead}=require('../src/unborn-head');
async function fixture(t){
 assert.equal(process.env.ZERO_TEST_NETWORK_DENIED,'1');const error=await new Promise(resolve=>{const server=net.createServer();server.once('error',resolve);server.listen(0,'127.0.0.1',()=>{server.close();resolve(null);});});assert.ok(error&&['EPERM','EACCES'].includes(error.code));
 const home=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'zero-unborn-head-'))),root=path.join(home,'project'),template=path.join(home,'template');await fs.mkdir(root);await fs.mkdir(template);
 const old=process.env.HOME;process.env.HOME=home;t.after(async()=>{process.env.HOME=old;await fs.rm(home,{recursive:true,force:true});});
 execFileSync('git',['-c','core.hooksPath=/dev/null','init','-q','-b','main'],{cwd:root,env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TEMPLATE_DIR:template,GIT_TERMINAL_PROMPT:'0'}});return root;
}
test('verifies a genuinely unborn direct HEAD without creating an index or ref',{skip:process.env.ZERO_TEST_NETWORK_DENIED!=='1'},async t=>{
 const root=await fixture(t),first=await inspectUnbornHead(root),second=await inspectUnbornHead(root);assert.deepEqual(first,second);assert.equal(first.ref,'refs/heads/main');
 await assert.rejects(fs.stat(path.join(root,'.git','index')),{code:'ENOENT'});await assert.rejects(fs.stat(path.join(root,'.git','refs','heads','main')),{code:'ENOENT'});
});
for(const scenario of ['broken-loose','packed-target','malformed-packed','detached','malformed-head','reftable'])test(`refuses ${scenario} rather than inferring unborn HEAD`,{skip:process.env.ZERO_TEST_NETWORK_DENIED!=='1'},async t=>{
 const root=await fixture(t),dot=path.join(root,'.git');
 if(scenario==='broken-loose')await fs.writeFile(path.join(dot,'refs','heads','main'),'not-an-object\n');
 if(scenario==='packed-target')await fs.writeFile(path.join(dot,'packed-refs'),`${'a'.repeat(40)} refs/heads/main\n`);
 if(scenario==='malformed-packed')await fs.writeFile(path.join(dot,'packed-refs'),'not-a-valid-ref\n');
 if(scenario==='detached')await fs.writeFile(path.join(dot,'HEAD'),`${'a'.repeat(40)}\n`);
 if(scenario==='malformed-head')await fs.writeFile(path.join(dot,'HEAD'),'ref: refs/heads/../outside\n');
 if(scenario==='reftable')await fs.mkdir(path.join(dot,'reftable'));
 await assert.rejects(inspectUnbornHead(root));
});

test('bounded reader rejects a file that grows during reading',async t=>{
 const {readOrdinaryBounded}=require('../src/unborn-head');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zero-bounded-read-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'evidence');await fs.writeFile(file,'abc');const originalOpen=fs.open;let injected=false;
 fs.open=async (...args)=>{const handle=await originalOpen(...args);if(args[0]===file){const read=handle.read.bind(handle);handle.read=async (...readArgs)=>{const result=await read(...readArgs);if(!injected){injected=true;await fs.appendFile(file,'extra');}return result;};}return handle;};
 try{await assert.rejects(readOrdinaryBounded(file,3));assert.equal(injected,true);}finally{fs.open=originalOpen;}
});

test('bounded reader opens nonblocking and rejects a substituted FIFO', {skip:process.platform==='win32'},async t=>{
 const {readOrdinaryBounded}=require('../src/unborn-head'),{constants}=require('node:fs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zero-fifo-read-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'evidence');await fs.writeFile(file,'abc');const originalOpen=fs.open;let injected=false;
 fs.open=async (...args)=>{if(args[0]===file){assert.ok(args[1]&constants.O_NONBLOCK);await fs.unlink(file);execFileSync('mkfifo',[file]);injected=true;}return originalOpen(...args);};
 try{await assert.rejects(readOrdinaryBounded(file,3));assert.equal(injected,true);assert.equal((await fs.lstat(file)).isFIFO(),true);}finally{fs.open=originalOpen;}
});
