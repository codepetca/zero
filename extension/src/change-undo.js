'use strict';
// A reviewed inverse is staged as a new change; HEAD is never moved. Git cannot
// lock other editors or processes out of the worktree during its multi-file write.
// The caller must enforce workspace trust and saved editors in beforeMutation.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const plans = new WeakMap();
const templateAttributes = '* text=auto\nmvnw text eol=lf\nmvnw.cmd text eol=crlf\n';
const limit = 2000, byteLimit = 64 * 1024 * 1024;
const oid = s => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(s);
const fail = () => new Error('The project or Git state changed or is unsupported. Your files are left as they are. Review the project in native Source Control.');
const interrupted = () => new Error('Undo could not be verified or was interrupted. Do not reset or abort automatically; inspect the staged changes and files in native Source Control.');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const env = Object.assign(Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k))), {
  GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:os.devNull, GIT_ATTR_NOSYSTEM:'1', GIT_TERMINAL_PROMPT:'0', GIT_NO_LAZY_FETCH:'1', GIT_NO_REPLACE_OBJECTS:'1', GIT_OPTIONAL_LOCKS:'0'
});
async function git(root,args) {
  const {stdout} = await exec('git',['-c',`core.hooksPath=${os.devNull}`,'-c','core.fsmonitor=false','-c','core.autocrlf=false','-c',`core.attributesFile=${os.devNull}`,'-c','merge.autoStash=false','-c','rerere.enabled=false','-c','commit.gpgSign=false',...args],{cwd:root,env,encoding:'buffer',timeout:20000,maxBuffer:4*1024*1024});
  return new TextDecoder('utf-8',{fatal:true}).decode(stdout);
}
const line = s => s.trim();
const parts = s => s.split('\0').filter(Boolean);
function safePath(name) {
  if (!name || name.includes('\\') || /[\x00-\x1f\x7f]/.test(name) || path.isAbsolute(name) || name.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git')) throw fail();
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
async function context(root, {allowUndoLock=false}={}) {
  root=await fs.realpath(root); const dot=path.join(root,'.git');
  if (!(await fs.lstat(dot)).isDirectory() || (await fs.lstat(dot)).isSymbolicLink() || /[\r\n]/.test(root)) throw fail();
  for (const name of ['config','index','objects']) { const info=await fs.lstat(path.join(dot,name)); if (info.isSymbolicLink() || (name==='objects' ? !info.isDirectory() : !info.isFile())) throw fail(); }
  const packs=await fs.readdir(path.join(dot,'objects','pack')).catch(e=>{if(e.code==='ENOENT') return []; throw e;});
  if(packs.some(n=>n.endsWith('.promisor'))) throw fail();
  if (line(await git(root,['rev-parse','--show-toplevel'])) !== root || await fs.realpath(line(await git(root,['rev-parse','--absolute-git-dir']))) !== dot) throw fail();
  const localZero=(await fs.readdir(dot)).filter(n=>/^zero-.*(?:\.lock|recovery\.json)$/i.test(n) && !(allowUndoLock && n==='zero-change-undo.lock'));
  if(localZero.length || !await absent(path.join(dot,'refs','zero','pending-finish')) || line(await git(root,['for-each-ref','--format=%(refname)','refs/zero/pending-finish']))) throw fail();
  for (const name of ['shallow','info/grafts','info/attributes','objects/info/alternates','MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer','BISECT_LOG']) if (!await absent(path.join(dot,name))) throw fail();
  if (line(await git(root,['rev-parse','--is-shallow-repository'])) !== 'false' || line(await git(root,['worktree','list','--porcelain'])).split('\n').filter(x=>x.startsWith('worktree ')).length !== 1 || line(await git(root,['for-each-ref','--format=%(refname)','refs/replace/']))) throw fail();
  // Do not execute project-defined filters, drivers, includes, sparse checkout,
  // alternate indexes, or external monitoring. Ordinary identity/remotes are inert.
  const configHash=hash(await fs.readFile(path.join(dot,'config')));
  let excludeHash=null; const exclude=path.join(dot,'info','exclude');
  if(!await absent(exclude)) { const stat=await fs.lstat(exclude); if(!stat.isFile() || stat.isSymbolicLink()) throw fail(); excludeHash=hash(await fs.readFile(exclude)); }
  const keys=parts(await git(root,['config','--local','--no-includes','--name-only','--null','--list']));
  if (keys.some(k=>!(/^(?:core\.(?:repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode)|user\.(?:name|email)|branch\.[^.]+\.(?:remote|merge)|remote\.[^.]+\.(?:url|fetch|pushurl)|extensions\.objectformat)$/i.test(k)))) throw fail();
  const head=line(await git(root,['rev-parse','--verify','HEAD^{commit}']));
  const branch=line(await git(root,['symbolic-ref','--quiet','HEAD']));
  if (!oid(head) || !branch.startsWith('refs/heads/')) throw fail();
  const index=await git(root,['ls-files','--stage','-z']);
  const cached=parts(index).map(s=>{const m=/^(100644|100755) ([a-f0-9]+) 0\t([\s\S]+)$/.exec(s); if(!m || !oid(m[2])) throw fail(); return safePath(m[3]);});
  const flags=parts(await git(root,['ls-files','-v','-z']));
  if(flags.some(x=>!x.startsWith('H '))) throw fail();
  // Untracked work is allowed and fingerprinted. Ignored names are protected
  // separately against a write or a file/directory collision.
  const other=parts(await git(root,['ls-files','--others','--exclude-standard','-z'])).map(safePath);
  const ignored=parts(await git(root,['ls-files','--others','--ignored','--exclude-standard','-z'])).map(safePath).sort();
  if ([...other,...ignored].some(p=>p.split('/').some(x=>x.toLowerCase()==='.gitattributes')) || cached.some(p=>p !== '.gitattributes' && p.split('/').some(x=>x.toLowerCase()==='.gitattributes'))) throw fail();
  if(cached.includes('.gitattributes') && (await ordinary(root,'.gitattributes')).toString('utf8')!==templateAttributes) throw fail();
  const status=parts(await git(root,['status','--porcelain=v1','-z','--untracked-files=all']));
  if(status.some(s=>!s.startsWith('?? '))) throw fail();
  const manifest=await entries(root,[...cached,...other]);
  const refs=await git(root,['for-each-ref','--format=%(refname) %(objectname) %(symref)']);
  return {root,dot,head,branch,index,cached,other:other.sort(),ignored,manifest,refs,configHash,excludeHash};
}
async function validateMarker(state,id) {
  if(!oid(id)) throw fail();
  const parents=line(await git(state.root,['rev-list','--parents','-n','1',id])).split(' ');
  const message=line(await git(state.root,['show','-s','--format=%B',id]));
  const match=/^Zero: finish ([a-zA-Z0-9][a-zA-Z0-9/_-]*)\n\nZero-Finished-Change: 1\nZero-Change-Branch: \1$/.exec(message);
  if (!match || match[1]==='main' || match[1].length>80 || parents.length!==3 || parents[0]!==id || parents.some(x=>!oid(x))) throw fail();
  await git(state.root,['check-ref-format','--branch',match[1]]);
  if(line(await git(state.root,['rev-parse',`${id}^{tree}`]))!==line(await git(state.root,['rev-parse',`${parents[2]}^{tree}`]))) throw fail();
  await git(state.root,['merge-base','--is-ancestor',parents[1],parents[2]]);
  await git(state.root,['merge-base','--is-ancestor',id,state.head]);
  // Disallow attributes, symlinks, submodules and unusual trees in every input.
  for (const tree of [state.head,id,parents[1],parents[2]]) {
    const rows=parts(await git(state.root,['ls-tree','-r','-z',tree])); if(rows.length>limit) throw fail();
    for(const row of rows) { const m=/^(100644|100755) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(row); if(!m) throw fail(); safePath(m[3]); if(m[3].split('/').some(x=>x.toLowerCase()==='.gitattributes') && (m[3]!=='.gitattributes' || await git(state.root,['cat-file','blob',m[2]])!==templateAttributes)) throw fail(); }
  }
  return match[1];
}
function collision(a,b) { return a===b || a.startsWith(b+'/') || b.startsWith(a+'/'); }
async function isolated(state,id) {
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'zero-undo-preview-'));
  try {
    await git(tmp,['init','--template=',`--object-format=${state.head.length===64?'sha256':'sha1'}`]);
    await fs.writeFile(path.join(tmp,'.git','objects','info','alternates'),path.join(state.dot,'objects')+'\n');
    await git(tmp,['update-ref','refs/heads/zero-preview',state.head]);
    await git(tmp,['symbolic-ref','HEAD','refs/heads/zero-preview']);
    await git(tmp,['read-tree','--reset','-u',state.head]);
    // Reject checkouts whose EOL conversion differs from the reviewed worktree.
    const baseline=await entries(tmp,[...state.cached]);
    const actual=Object.fromEntries(state.cached.sort().map(n=>[n,state.manifest[n]]));
    if(!equal(baseline,actual)) throw fail();
    if(parts(await git(state.root,['diff','--name-only','--no-renames','-z',`${id}^1`,id])).some(n=>n.split('/').some(x=>x.toLowerCase()==='.gitattributes'))) throw fail();
    try { await git(tmp,['-c','user.name=Zero preview','-c','user.email=preview@example.invalid','revert','-m','1','--no-commit',id]); }
    catch { throw new Error('This change conflicts with later work or cannot be previewed safely. No project files were changed. Review it in native Source Control.'); }
    const index=await git(tmp,['ls-files','--stage','-z']);
    const names=parts(index).map(s=>{const m=/^(100644|100755) [a-f0-9]+ 0\t([\s\S]+)$/.exec(s); if(!m) throw fail();return safePath(m[2]);});
    const changed=parts(await git(tmp,['diff','--cached','--name-only','--no-renames','-z',state.head])).map(safePath).sort();
    if(!changed.length || changed.some(p=>p.split('/').includes('.gitignore') || [...state.other,...state.ignored].some(q=>collision(p,q)))) throw fail();
    // Include empty ignored directories and filesystem-specific name aliases,
    // which ls-files does not enumerate as ignored files.
    for(const name of changed) {
      const components=name.split('/'); let current=state.root;
      for(let i=0;i<components.length;i++) {
        current=path.join(current,components[i]); let info;
        try { info=await fs.lstat(current); } catch(e) { if(e.code==='ENOENT') break; throw e; }
        if(info.isSymbolicLink() || (i+1<components.length && !info.isDirectory()) || (i+1===components.length && (!state.cached.includes(name) || !info.isFile()))) throw fail();
      }
    }
    const manifest=await entries(tmp,names);
    return {index,changed,manifest};
  } finally { await fs.rm(tmp,{recursive:true,force:true}); }
}
function equal(a,b) { return JSON.stringify(a)===JSON.stringify(b); }
async function preview(root,id,{beforeMutation}={}) {
  if(typeof beforeMutation!=='function') throw new Error('A workspace trust and saved-editors guard is required.');
  await beforeMutation(); const state=await context(root); const name=await validateMarker(state,id); const result=await isolated(state,id);
  if(!equal(state,await context(root))) throw fail();
  const plan=Object.freeze({name,branch:state.branch.slice('refs/heads/'.length),head:state.head,change:id,files:Object.freeze([...result.changed])});
  plans.set(plan,{state,result,beforeMutation}); return plan;
}
async function apply(plan,{confirmed=false}={}) {
  const saved=plans.get(plan); if(!saved || confirmed!==true) throw new Error('Review and confirm the undo preview before applying it.');
  plans.delete(plan); const {state,result,beforeMutation}=saved;
  const lock=path.join(state.dot,'zero-change-undo.lock'); let handle;
  try { handle=await fs.open(lock,'wx',0o600); } catch { throw fail(); }
  try {
    await beforeMutation(); if(!equal(state,await context(state.root,{allowUndoLock:true}))) throw fail();
    await validateMarker(state,plan.change);
    if(!equal(result,await isolated(state,plan.change))) throw fail();
    await beforeMutation(); if(!equal(state,await context(state.root,{allowUndoLock:true}))) throw fail();
    try {
      await git(state.root,['-c','user.name=Zero undo','-c','user.email=undo@example.invalid','revert','-m','1','--no-commit',plan.change]);
      const index=await git(state.root,['ls-files','--stage','-z']);
      const names=parts(index).map(s=>{const m=/^(100644|100755) [a-f0-9]+ 0\t([\s\S]+)$/.exec(s); if(!m) throw interrupted();return safePath(m[2]);});
      const manifest=await entries(state.root,names);
      const other=parts(await git(state.root,['ls-files','--others','--exclude-standard','-z'])).map(safePath).sort();
      const otherManifest=await entries(state.root,other);
      const beforeOther=Object.fromEntries(state.other.map(n=>[n,state.manifest[n]]));
      if(index!==result.index || !equal(manifest,result.manifest) || !equal(other,state.other) || !equal(otherManifest,beforeOther) || line(await git(state.root,['rev-parse','HEAD']))!==state.head || line(await git(state.root,['symbolic-ref','HEAD']))!==state.branch || await git(state.root,['for-each-ref','--format=%(refname) %(objectname) %(symref)'])!==state.refs || !equal(parts(await git(state.root,['ls-files','--others','--ignored','--exclude-standard','-z'])).sort(),state.ignored)) throw interrupted();
      return {staged:true,head:state.head,files:result.changed};
    } catch { throw interrupted(); }
  } finally { await handle.close(); await fs.unlink(lock); }
}
module.exports={preview,apply};
