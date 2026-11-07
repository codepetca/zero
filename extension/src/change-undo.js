'use strict';
// A reviewed inverse is staged as a new change; HEAD is never moved. Git cannot
// lock other editors or processes out of the worktree during its multi-file write.
// The caller must enforce workspace trust and saved editors in beforeMutation.
const fs = require('node:fs/promises');
const {constants}=require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const core=require('./core');
const {readFinishedBranch}=require('./finished-change-marker');
const {inertGitConfigKey}=require('./git-config-keys');
const {conversionSettings}=require('./git-conversion-settings');
const {assertNoUnresolvedFileRestore}=require('./git-retained-recovery');
const {execFile,spawn} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const plans = new WeakMap();
const corrections = new WeakMap();
const templateAttributes = '* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n';
// Match retained restore's two stock paths; never permit arbitrary nested rules.
const stockAttributes=new Map([['.gitattributes',templateAttributes],['.zero-build/.gitattributes','* -text\n']]);
const isAttributePath=name=>name.split('/').some(part=>part.toLowerCase()==='.gitattributes');
const limit = 2000, byteLimit = 64 * 1024 * 1024;
const oid = s => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s);
const fail = () => new Error('The project or Git state changed or is unsupported. Your files are left as they are. Review the project in native Source Control.');
const interrupted = () => new Error('Undo could not be verified or was interrupted. Do not reset or abort automatically; inspect the staged changes and files in native Source Control.');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const env = Object.assign(Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k))), {
  GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:os.devNull, GIT_ATTR_NOSYSTEM:'1', GIT_TERMINAL_PROMPT:'0', GIT_NO_LAZY_FETCH:'1', GIT_NO_REPLACE_OBJECTS:'1', GIT_OPTIONAL_LOCKS:'0'
});
async function git(root,args,conversion={autocrlf:'false',eol:'native'}) {
  const {stdout} = await exec('git',['-c',`core.hooksPath=${os.devNull}`,'-c','core.fsmonitor=false','-c',`core.autocrlf=${conversion.autocrlf}`,'-c',`core.eol=${conversion.eol}`,'-c','core.safecrlf=false','-c',`core.attributesFile=${os.devNull}`,'-c','merge.autoStash=false','-c','rerere.enabled=false','-c','commit.gpgSign=false',...args],{cwd:root,env,encoding:'buffer',timeout:20000,maxBuffer:4*1024*1024});
  return new TextDecoder('utf-8',{fatal:true}).decode(stdout);
}
// Bounded binary Git plumbing; callers supply only internally constructed input.
async function gitBinary(root,args,input,max=byteLimit+8*1024*1024) {
  return new Promise((resolve,reject)=>{
    const child=spawn('git',['-c',`core.hooksPath=${os.devNull}`,'-c','core.fsmonitor=false',...args],{cwd:root,env,stdio:['pipe','pipe','pipe']});
    let chunks=[],length=0,failed=false;const timer=setTimeout(()=>{failed=true;child.kill();},20000);
    child.stdout.on('data',chunk=>{length+=chunk.length;if(length>max){failed=true;child.kill();}else chunks.push(chunk);});
    child.stderr.resume();child.on('error',()=>{failed=true;});child.stdin.on('error',()=>{failed=true;});
    child.on('close',code=>{clearTimeout(timer);if(failed||code!==0)reject(fail());else resolve(Buffer.concat(chunks,length));});
    child.stdin.end(input);
  });
}
const line = s => s.trim();
const parts = s => s.split('\0').filter(Boolean);
// Windows can resolve a short 8.3 spelling to a different directory entry.
// Conservatively reject potential short spellings because readdir returns the
// long name, and cannot prove that such an alias is absent on the volume.
function safePath(name, windows=false) {
  if (!name || name.includes('\\') || /[\x00-\x1f\x7f]/.test(name) || path.isAbsolute(name) || name.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git' || windows && (/[<>:"|?*]/.test(p) || /[ .]$/.test(p) || /~[0-9]+(?:\.|$)/i.test(p) || /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(p.split('.')[0].replace(/ +$/, ''))))) throw fail();
  return name;
}
async function absent(file) { try { await fs.lstat(file); return false; } catch(e) { if(e.code === 'ENOENT') return true; throw e; } }
async function ordinary(root,name) {
  safePath(name); let current=root; const components=name.split('/');
  for (let i=0;i<components.length;i++) {
    current=path.join(current,components[i]); const stat=await fs.lstat(current);
    if (stat.isSymbolicLink() || (i+1<components.length ? !stat.isDirectory() : !stat.isFile())) throw fail();
  }
  return fs.readFile(current);
}
async function entries(root, names) {
  if (names.length > limit) throw fail(); let total=0; const result=Object.create(null);
  for (const name of names.sort()) { const data=await ordinary(root,name); total+=data.length; if(total>byteLimit) throw fail(); result[name]=hash(data); }
  return result;
}
const attributeIdentity=info=>({dev:info.dev,ino:info.ino,nlink:info.nlink,mode:info.mode,size:info.size,mtimeMs:info.mtimeMs,ctimeMs:info.ctimeMs});
async function workingAttribute(root,name) {
  const filename=path.join(root,...name.split('/')),parent=path.dirname(filename),parentInfo=await fs.lstat(parent),before=await fs.lstat(filename);
  if(!parentInfo.isDirectory()||parentInfo.isSymbolicLink()||await fs.realpath(parent)!==parent||!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>4096)throw fail();
  const identity=attributeIdentity(before),handle=await fs.open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
  let data;
  try {
    if(!equal(identity,attributeIdentity(await handle.stat())))throw fail();
    const buffer=Buffer.alloc(4097),{bytesRead}=await handle.read(buffer,0,buffer.length,0);data=buffer.subarray(0,bytesRead);
    if(bytesRead!==identity.size||!equal(identity,attributeIdentity(await handle.stat())))throw fail();
  } finally {await handle.close();}
  const after=await fs.lstat(filename),parentAfter=await fs.lstat(parent);
  if(!after.isFile()||after.isSymbolicLink()||!equal(identity,attributeIdentity(after))||!parentAfter.isDirectory()||parentAfter.isSymbolicLink()||parentAfter.dev!==parentInfo.dev||parentAfter.ino!==parentInfo.ino||await fs.realpath(parent)!==parent)throw fail();
  const text=new TextDecoder('utf-8',{fatal:true}).decode(data);
  if((name==='.gitattributes'?text.replace(/\r\n/g,'\n'):text)!==stockAttributes.get(name))throw fail();
  return {name,identity,parentIdentity:{dev:parentInfo.dev,ino:parentInfo.ino}};
}
async function verifyAttributes(state) {
  const attributes=[];
  for(const saved of state.attributes)attributes.push(await workingAttribute(state.root,saved.name));
  if(!equal(attributes,state.attributes))throw fail();
}
async function verifyConversion(state) {if(!equal(state.conversion,await conversionSettings(state.root)))throw fail();}
async function context(root, {allowUndoLock=false,binding,windows=false,inverseFolder}={}) {
  root=await fs.realpath(root); const dot=path.join(root,'.git');
  if(binding) {if(binding.root!==root||typeof binding.assertCurrentNow!=='function'||typeof binding.ownsLock!=='function')throw fail();binding.assertCurrentNow();}
  if (!(await fs.lstat(dot)).isDirectory() || (await fs.lstat(dot)).isSymbolicLink() || /[\r\n]/.test(root)) throw fail();
  await assertNoUnresolvedFileRestore(root);
  for(const name of await fs.readdir(dot))if(name.startsWith('zero-inverse-recovery-')&&name!==inverseFolder) {
    const info=await require('./git-retained-recovery').inspectInverseRecovery(root,name);
    if(!info.packMatches||!info.status.startsWith('Inverse target is pinned;'))throw new Error(`An inverse import needs inspection before another undo. Recovery folder: ${info.folder}`);
  }
  for (const name of ['config','index','objects']) { const info=await fs.lstat(path.join(dot,name)); if (info.isSymbolicLink() || (name==='objects' ? !info.isDirectory() : !info.isFile())) throw fail(); }
  const packs=await fs.readdir(path.join(dot,'objects','pack')).catch(e=>{if(e.code==='ENOENT') return []; throw e;});
  if(packs.some(n=>n.endsWith('.promisor'))) throw fail();
  const conversion=await conversionSettings(root);
  if (await fs.realpath(line(await git(root,['rev-parse','--show-toplevel']))) !== root || await fs.realpath(line(await git(root,['rev-parse','--absolute-git-dir']))) !== dot) throw fail();
  for(const name of await fs.readdir(dot))if(/^zero-.*(?:\.lock|recovery\.json)$/i.test(name) && !(allowUndoLock&&name==='zero-change-undo.lock')) {
    const file=path.join(dot,name),info=await fs.lstat(file);if(!binding||!binding.ownsLock(file,info))throw fail();
  }
  if(!await absent(path.join(dot,'refs','zero','pending-finish')) || line(await git(root,['for-each-ref','--format=%(refname)','refs/zero/pending-finish']))) throw fail();
  for (const name of ['shallow','info/grafts','info/attributes','objects/info/alternates','MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer','BISECT_LOG']) if (!await absent(path.join(dot,name))) throw fail();
  if (line(await git(root,['rev-parse','--is-shallow-repository'])) !== 'false' || line(await git(root,['worktree','list','--porcelain'])).split('\n').filter(x=>x.startsWith('worktree ')).length !== 1 || line(await git(root,['for-each-ref','--format=%(refname)','refs/replace/']))) throw fail();
  // Do not execute project-defined filters, drivers, includes, sparse checkout,
  // alternate indexes, or external monitoring. Ordinary identity/remotes are inert.
  const configHash=hash(await fs.readFile(path.join(dot,'config')));
  let excludeHash=null; const exclude=path.join(dot,'info','exclude');
  if(!await absent(exclude)) { const stat=await fs.lstat(exclude); if(!stat.isFile() || stat.isSymbolicLink()) throw fail(); excludeHash=hash(await fs.readFile(exclude)); }
  const keys=parts(await git(root,['config','--local','--no-includes','--name-only','--null','--list']));
  if (keys.some(k=>!inertGitConfigKey(k))) throw fail();
  const head=line(await git(root,['rev-parse','--verify','HEAD^{commit}']));
  const branch=`refs/heads/${await core.currentBranch(root,async(project,args)=>line(await git(project,args)))}`;
  if (!oid(head) || !branch.startsWith('refs/heads/')) throw fail();
  const index=await git(root,['ls-files','--stage','-z']);
  const cachedEntries=parts(index).map(s=>{const m=/^(100644|100755) ([a-f0-9]+) 0\t([\s\S]+)$/.exec(s); if(!m || !oid(m[2])) throw fail(); return {name:safePath(m[3],windows),object:m[2]};});
  const cached=cachedEntries.map(entry=>entry.name);
  const flags=parts(await git(root,['ls-files','-v','-z']));
  if(flags.some(x=>!x.startsWith('H '))) throw fail();
  // Untracked work is allowed and fingerprinted. Ignored names are protected
  // separately against a write or a file/directory collision.
  const other=parts(await git(root,['ls-files','--others','--exclude-standard','-z'])).map(name=>safePath(name,windows));
  const ignored=parts(await git(root,['ls-files','--others','--ignored','--exclude-standard','-z'])).map(name=>safePath(name,windows)).sort();
  if ([...other,...ignored].some(isAttributePath) || cached.some(name=>isAttributePath(name)&&!stockAttributes.has(name))) throw fail();
  const attributes=[];
  for(const {name,object} of cachedEntries.filter(entry=>isAttributePath(entry.name))) {
    if(await git(root,['cat-file','blob',object])!==stockAttributes.get(name))throw fail();
    attributes.push(await workingAttribute(root,name));
  }
  const status=parts(await git(root,['status','--porcelain=v1','-z','--untracked-files=all'],conversion));
  if(status.some(s=>!s.startsWith('?? '))) throw fail();
  const manifest=await entries(root,[...cached,...other]);
  const refs=await git(root,['for-each-ref','--format=%(refname) %(objectname) %(symref)']);
  return {root,dot,head,branch,index,cached,other:other.sort(),ignored,manifest,refs,configHash,excludeHash,conversion,windows,attributes};
}
async function validateMarker(state,id) {
  if(!oid(id)) throw fail();
  const parents=line(await git(state.root,['rev-list','--parents','-n','1',id])).split(' ');
  const branch=await readFinishedBranch(state.root,id,(root,args)=>git(root,args));
  if (!branch || parents.length!==3 || parents[0]!==id || parents.some(x=>!oid(x))) throw fail();
  await git(state.root,['check-ref-format','--branch',branch]);
  if(line(await git(state.root,['rev-parse',`${id}^{tree}`]))!==line(await git(state.root,['rev-parse',`${parents[2]}^{tree}`]))) throw fail();
  await git(state.root,['merge-base','--is-ancestor',parents[1],parents[2]]);
  await git(state.root,['merge-base','--is-ancestor',id,state.head]);
  // Disallow attributes, symlinks, submodules and unusual trees in every input.
  for (const tree of [state.head,id,parents[1],parents[2]]) {
    const rows=parts(await git(state.root,['ls-tree','-r','-z',tree])); if(rows.length>limit) throw fail();
    for(const row of rows) { const m=/^(100644|100755) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(row); if(!m) throw fail(); safePath(m[3],state.windows); if(isAttributePath(m[3]) && (!stockAttributes.has(m[3]) || await git(state.root,['cat-file','blob',m[2]])!==stockAttributes.get(m[3]))) throw fail(); }
  }
  return branch;
}
function collision(a,b) { a=a.normalize('NFC').toLowerCase(); b=b.normalize('NFC').toLowerCase(); return a===b || a.startsWith(b+'/') || b.startsWith(a+'/'); }
async function isolated(state,id,{exportInverse=false}={}) {
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'zero-undo-preview-'));
  try {
    await git(tmp,['init','--template=',`--object-format=${state.head.length===64?'sha256':'sha1'}`]);
    await fs.writeFile(path.join(tmp,'.git','objects','info','alternates'),path.join(state.dot,'objects')+'\n');
    await git(tmp,['update-ref','refs/heads/zero-preview',state.head]);
    await git(tmp,['symbolic-ref','HEAD','refs/heads/zero-preview']);
    // The new repository has an empty index and worktree; populate both without
    // using a reset operation, preserving Git's checkout conversions.
    await git(tmp,['read-tree',state.head],state.conversion);
    await git(tmp,['checkout-index','--all'],state.conversion);
    // Reject checkouts whose EOL conversion differs from the reviewed worktree.
    const baseline=await entries(tmp,[...state.cached]);
    const actual=Object.fromEntries(state.cached.sort().map(n=>[n,state.manifest[n]]));
    if(!equal(baseline,actual)) throw fail();
    if(parts(await git(state.root,['diff','--name-only','--no-renames','-z',`${id}^1`,id])).some(n=>n.split('/').some(x=>x.toLowerCase()==='.gitattributes'))) throw fail();
    try { await git(tmp,['-c','user.name=Zero preview','-c','user.email=preview@example.invalid','revert','-m','1','--no-commit',id],state.conversion); }
    catch { throw new Error('This change conflicts with later work or cannot be previewed safely. No project files were changed. Review it in native Source Control.'); }
    const index=await git(tmp,['ls-files','--stage','-z']);
    const names=parts(index).map(s=>{const m=/^(100644|100755) [a-f0-9]+ 0\t([\s\S]+)$/.exec(s); if(!m) throw fail();return safePath(m[2],state.windows);});
    const changed=parts(await git(tmp,['diff','--cached','--name-only','--no-renames','-z',state.head])).map(name=>safePath(name,state.windows)).sort();
    if(!changed.length || changed.some(p=>p.split('/').includes('.gitignore') || [...state.other,...state.ignored].some(q=>collision(p,q)))) throw fail();
    // Include empty ignored directories and filesystem-specific name aliases,
    // which ls-files does not enumerate as ignored files.
    for(const name of changed) {
      const components=name.split('/'); let current=state.root;
      for(let i=0;i<components.length;i++) {
        // Git's ignored-file list omits empty directories. Detect aliases in
        // each existing parent before resolving the requested spelling.
        const names=await fs.readdir(current),fold=s=>s.normalize('NFC').toLowerCase();
        if(names.some(entry=>entry!==components[i] && fold(entry)===fold(components[i]))) throw fail();
        current=path.join(current,components[i]); let info;
        try { info=await fs.lstat(current); } catch(e) { if(e.code==='ENOENT') break; throw e; }
        if(info.isSymbolicLink() || (i+1<components.length && !info.isDirectory()) || (i+1===components.length && (!state.cached.includes(name) || !info.isFile()))) throw fail();
      }
    }
    const manifest=await entries(tmp,names);
    const result={index,changed,manifest};
    if(exportInverse) {
      const tree=line(await git(tmp,['write-tree']));
      if(!oid(tree))throw fail();
      const commit=line(await git(tmp,['-c','user.name=Zero inverse','-c','user.email=inverse@example.invalid','commit-tree',tree,'-p',state.head,'-m','Zero inverse preview']));
      if(!oid(commit)||line(await git(tmp,['show','-s','--format=%T%n%P',commit]))!==`${tree}\n${state.head}`)throw fail();
      const pack=await gitBinary(tmp,['pack-objects','--stdout','--revs'],Buffer.from(`${commit}\n^${state.head}\n`));
      if(pack.length<32)throw fail();
      return {...result,tree,commit,pack};
    }
    return result;
  } finally { await fs.rm(tmp,{recursive:true,force:true}); }
}
function equal(a,b) { return JSON.stringify(a)===JSON.stringify(b); }
async function preview(root,id,{beforeMutation,platform}={}) {
  // A caller may request stricter Windows checks for tests, never relax them.
  const windows=process.platform==='win32'||platform==='win32';
  if(typeof beforeMutation!=='function') throw new Error('A workspace trust and saved-editors guard is required.');
  await beforeMutation(); const state=await context(root,{windows}); const name=await validateMarker(state,id); const result=await isolated(state,id);
  if(!equal(state,await context(root,{windows}))) throw fail();
  const plan=Object.freeze({name,branch:state.branch.slice('refs/heads/'.length),head:state.head,change:id,files:Object.freeze([...result.changed])});
  plans.set(plan,{state,result,beforeMutation}); return plan;
}
async function durableFile(file,data) {
  const h=await fs.open(file,'wx',0o600);
  try {await h.writeFile(data);await h.sync();} finally {await h.close();}
}
async function syncDirectory(dir) {const h=await fs.open(dir,'r');try{await h.sync();}finally{await h.close();}}
async function inverseRefParents(dot) {
  const refs=path.join(dot,'refs'),zero=path.join(refs,'zero'),inverse=path.join(zero,'inverse'),identities=[];
  for(const [index,dir] of [refs,zero,inverse].entries()) {
    if(index)try{await fs.mkdir(dir,{mode:0o700});await syncDirectory(path.dirname(dir));}catch(error){if(error.code!=='EEXIST')throw error;}
    const info=await fs.lstat(dir);
    if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(dir)!==dir)throw fail();
    identities.push({dir,dev:info.dev,ino:info.ino});
  }
  return async()=>{for(const saved of identities){const info=await fs.lstat(saved.dir);if(!info.isDirectory()||info.isSymbolicLink()||info.dev!==saved.dev||info.ino!==saved.ino||await fs.realpath(saved.dir)!==saved.dir)throw fail();}};
}
// Import only a freshly recomputed inverse from an opaque review token. The
// recovery intent and pack are durable before Git sees any of their objects.
async function prepareCorrection(plan,{confirmed=false,binding,_testBeforeImport,_testBeforePin,_testAfterPin}={}) {
  const saved=plans.get(plan);if(!saved||confirmed!==true)throw new Error('Review and confirm the undo preview before applying it.');
  plans.delete(plan);
  if(process.platform==='win32')throw new Error('Committed undo is not supported on Windows yet.');
  const {state,result,beforeMutation}=saved;
  if(!binding||binding.root!==state.root||typeof binding.assertCurrentNow!=='function'||typeof binding.ownsLock!=='function')throw fail();
  let folder;
  try {
    await beforeMutation();if(!equal(state,await context(state.root,{binding,windows:state.windows})))throw fail();
    await validateMarker(state,plan.change);
    const inverse=await isolated(state,plan.change,{exportInverse:true});
    const {tree,commit,pack,...recomputed}=inverse;if(!equal(result,recomputed))throw fail();
    await beforeMutation();if(!equal(state,await context(state.root,{binding,windows:state.windows})))throw fail();
    const nonce=crypto.randomBytes(16).toString('hex'),ref=`refs/zero/inverse/${nonce}`;
    folder=await fs.mkdtemp(path.join(state.dot,'zero-inverse-recovery-'));await fs.chmod(folder,0o700);await syncDirectory(state.dot);const folderIdentity=await fs.lstat(folder);
    const intent={schema:1,status:'import-intended',head:state.head,branch:state.branch,change:plan.change,tree,commit,ref,packSize:pack.length,packSha256:hash(pack)};
    await durableFile(path.join(folder,'inverse.pack'),pack);await durableFile(path.join(folder,'intent.json'),Buffer.from(JSON.stringify(intent)+'\n'));await syncDirectory(folder);
    if(_testBeforeImport)await _testBeforeImport();binding.assertCurrentNow();
    const folderNow=await fs.lstat(folder);if(!folderNow.isDirectory()||folderNow.isSymbolicLink()||folderNow.dev!==folderIdentity.dev||folderNow.ino!==folderIdentity.ino)throw fail();
    const packFile=path.join(folder,'inverse.pack'),packInfo=await fs.lstat(packFile);if(!packInfo.isFile()||packInfo.isSymbolicLink()||packInfo.nlink!==1||packInfo.size!==pack.length)throw fail();
    const h=await fs.open(packFile,require('node:fs').constants.O_RDONLY|(require('node:fs').constants.O_NOFOLLOW||0));let verified;
    try {const stat=await h.stat();if(stat.dev!==packInfo.dev||stat.ino!==packInfo.ino||stat.size!==pack.length)throw fail();verified=await h.readFile();const after=await h.stat(),named=await fs.lstat(packFile);if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||named.dev!==stat.dev||named.ino!==stat.ino||hash(verified)!==intent.packSha256)throw fail();}finally{await h.close();}
    const objectsDir=path.join(state.dot,'objects'),packDir=path.join(objectsDir,'pack');
    const objectsBefore=await fs.lstat(objectsDir),packBefore=await fs.lstat(packDir);
    if(!objectsBefore.isDirectory()||objectsBefore.isSymbolicLink()||!packBefore.isDirectory()||packBefore.isSymbolicLink()||await fs.realpath(packDir)!==packDir)throw fail();
    const output=(await gitBinary(state.root,['index-pack','--stdin','--keep=zero-inverse-recovery'],verified,1024)).toString('utf8').trim();
    const match=/^keep\s+([a-f0-9]{40}|[a-f0-9]{64})$/.exec(output);if(!match)throw fail();
    // The ref must never outlive an unsynced pack after a crash. The keep file
    // protects imported objects from concurrent collection until the ref exists.
    const dirInfo=await fs.lstat(packDir),objectsAfter=await fs.lstat(objectsDir);
    if(!dirInfo.isDirectory()||dirInfo.isSymbolicLink()||dirInfo.dev!==packBefore.dev||dirInfo.ino!==packBefore.ino||objectsAfter.dev!==objectsBefore.dev||objectsAfter.ino!==objectsBefore.ino||await fs.realpath(packDir)!==packDir)throw fail();
    for(const suffix of ['pack','idx','keep']) {
      const file=path.join(packDir,`pack-${match[1]}.${suffix}`),info=await fs.lstat(file);
      if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1)throw fail();
      const handle=await fs.open(file,require('node:fs').constants.O_RDONLY|(require('node:fs').constants.O_NOFOLLOW||0));
      try {const actual=await handle.stat();if(actual.dev!==info.dev||actual.ino!==info.ino||actual.size!==info.size)throw fail();await handle.sync();}finally{await handle.close();}
    }
    await syncDirectory(packDir);
    await durableFile(path.join(folder,'imported.json'),Buffer.from(JSON.stringify({...intent,status:'imported',packObject:match[1]})+'\n'));await syncDirectory(folder);
    if(line(await git(state.root,['show','-s','--format=%T%n%P',commit]))!==`${tree}\n${state.head}`)throw fail();
    await beforeMutation();if(!equal(state,await context(state.root,{binding,windows:state.windows,inverseFolder:path.basename(folder)})))throw fail();
    const checkRefParents=await inverseRefParents(state.dot);
    if(_testBeforePin)await _testBeforePin();binding.assertCurrentNow();await checkRefParents();await verifyAttributes(state);await verifyConversion(state);
    await git(state.root,['update-ref','--no-deref',ref,commit,'0'.repeat(commit.length)]);
    await checkRefParents();
    if(line(await git(state.root,['rev-parse','--verify',ref]))!==commit)throw fail();
    const refFile=path.join(state.dot,...ref.split('/')),refInfo=await fs.lstat(refFile);
    if(!refInfo.isFile()||refInfo.isSymbolicLink()||refInfo.nlink!==1)throw fail();
    const refHandle=await fs.open(refFile,require('node:fs').constants.O_RDONLY|(require('node:fs').constants.O_NOFOLLOW||0));
    try {const actual=await refHandle.stat();if(actual.dev!==refInfo.dev||actual.ino!==refInfo.ino||(await refHandle.readFile('utf8'))!==`${commit}\n`)throw fail();await refHandle.sync();}finally{await refHandle.close();}
    for(const directory of [path.join(state.dot,'refs','zero','inverse'),path.join(state.dot,'refs','zero'),path.join(state.dot,'refs'),state.dot]) {
      const info=await fs.lstat(directory);if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(directory)!==directory)throw fail();await syncDirectory(directory);
    }
    if(line(await git(state.root,['rev-parse','--verify',ref]))!==commit)throw fail();
    if(_testAfterPin)await _testAfterPin();
    await verifyAttributes(state);await verifyConversion(state);
    await durableFile(path.join(folder,'pinned.json'),Buffer.from(JSON.stringify({...intent,status:'pinned',packObject:match[1]})+'\n'));await syncDirectory(folder);
    const receipt=Object.freeze({recoveryPath:folder,head:state.head,files:plan.files});
    corrections.set(receipt,{root:state.root,head:state.head,branch:state.branch,commit,ref,binding,beforeMutation,files:plan.files,attributes:state.attributes,conversion:state.conversion});return receipt;
  } catch(error) {if(folder)error.recoveryPath=folder;throw error;}
}
async function consumeCorrection(receipt,binding) {
  const saved=corrections.get(receipt);if(!saved||binding!==saved.binding)throw new Error('Review the finished change again.');
  corrections.delete(receipt);binding.assertCurrentNow();await saved.beforeMutation();
  await verifyAttributes(saved);await verifyConversion(saved);
  try {await git(saved.root,['symbolic-ref','--quiet','--no-recurse',saved.ref]);throw fail();}catch(error){if(error.code!==1)throw error;}
  if(line(await git(saved.root,['rev-parse','--verify',saved.ref]))!==saved.commit||line(await git(saved.root,['rev-parse','--verify','HEAD^{commit}']))!==saved.head||line(await git(saved.root,['symbolic-ref','--quiet','HEAD']))!==saved.branch)throw fail();
  return saved;
}
async function apply(plan,{confirmed=false,binding}={}) {
  const saved=plans.get(plan); if(!saved || confirmed!==true) throw new Error('Review and confirm the undo preview before applying it.');
  plans.delete(plan); const {state,result,beforeMutation}=saved;
  const lock=path.join(state.dot,'zero-change-undo.lock'); let handle;
  try { handle=await fs.open(lock,'wx',0o600); } catch { throw fail(); }
  try {
    await beforeMutation(); if(!equal(state,await context(state.root,{allowUndoLock:true,binding,windows:state.windows}))) throw fail();
    await validateMarker(state,plan.change);
    if(!equal(result,await isolated(state,plan.change))) throw fail();
    await beforeMutation(); if(!equal(state,await context(state.root,{allowUndoLock:true,binding,windows:state.windows}))) throw fail();
    try {
      binding?.assertCurrentNow();
      await git(state.root,['-c','user.name=Zero undo','-c','user.email=undo@example.invalid','revert','-m','1','--no-commit',plan.change],state.conversion);
      const index=await git(state.root,['ls-files','--stage','-z']);
      const names=parts(index).map(s=>{const m=/^(100644|100755) [a-f0-9]+ 0\t([\s\S]+)$/.exec(s); if(!m) throw interrupted();return safePath(m[2],state.windows);});
      const manifest=await entries(state.root,names);
      const other=parts(await git(state.root,['ls-files','--others','--exclude-standard','-z'])).map(name=>safePath(name,state.windows)).sort();
      const otherManifest=await entries(state.root,other);
      const beforeOther=Object.fromEntries(state.other.map(n=>[n,state.manifest[n]]));
      await verifyAttributes(state);await verifyConversion(state);
      if(index!==result.index || !equal(manifest,result.manifest) || !equal(other,state.other) || !equal(otherManifest,beforeOther) || line(await git(state.root,['rev-parse','HEAD']))!==state.head || line(await git(state.root,['symbolic-ref','HEAD']))!==state.branch || await git(state.root,['for-each-ref','--format=%(refname) %(objectname) %(symref)'])!==state.refs || !equal(parts(await git(state.root,['ls-files','--others','--ignored','--exclude-standard','-z'])).sort(),state.ignored)) throw interrupted();
      return {staged:true,head:state.head,files:result.changed};
    } catch { throw interrupted(); }
  } finally { await handle.close(); await fs.unlink(lock); }
}
module.exports={preview,apply,prepareCorrection,consumeCorrection};
