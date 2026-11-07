'use strict';
// Read-only comparison of two committed project trees. This is not an apply
// plan: working files, unsaved editors, ignored files and the index are not
// examined or authorized for replacement.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);
const MAX_OUTPUT = 4 * 1024 * 1024, MAX_FILES = 2000;
const oid = value => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const env = Object.assign(Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))), {
  GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:os.devNull, GIT_OPTIONAL_LOCKS:'0',
  GIT_NO_LAZY_FETCH:'1', GIT_NO_REPLACE_OBJECTS:'1', GIT_TERMINAL_PROMPT:'0'
});
async function git(root,args) {
  const {stdout} = await exec('git',['--no-pager','-c','core.fsmonitor=false',...args], {
    cwd:root, env, encoding:'buffer', timeout:10000, maxBuffer:MAX_OUTPUT
  });
  return stdout;
}
function decode(bytes) { return new TextDecoder('utf-8',{fatal:true}).decode(bytes); }
function safePath(name) {
  return !!name && !name.startsWith('/') && !/[\\\x00-\x1f\x7f]/.test(name) &&
    !name.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git');
}
function tree(bytes) {
  const raw=decode(bytes);
  if(raw && !raw.endsWith('\0')) throw new Error('Incomplete project tree.');
  const rows=raw.split('\0').filter(Boolean);
  if(rows.length>MAX_FILES) throw new Error('Project tree is too large to preview.');
  const files=new Map();
  for(const row of rows) {
    const match=/^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t([^\0]+)$/.exec(row);
    if(!match || !safePath(match[3]) || files.has(match[3])) throw new Error('Project tree contains an unsupported path or non-regular entry.');
    files.set(match[3],{mode:match[1],object:match[2]});
  }
  return files;
}
async function previewProjectVersion(root,commit,{assertTrusted}={}) {
  if(typeof assertTrusted!=='function') throw new Error('A trusted workspace guard is required.');
  if(!oid(commit)) throw new Error('Choose a full commit ID from project history.');
  await assertTrusted();
  if(await fs.realpath(root)!==root) throw new Error('Open a standalone project folder.');
  const dot=path.join(root,'.git'), info=await fs.lstat(dot);
  if(!info.isDirectory() || info.isSymbolicLink()) throw new Error('Open a standalone project repository.');
  const packs=await fs.readdir(path.join(dot,'objects','pack')).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  if(packs.some(name=>name.endsWith('.promisor'))) throw new Error('Preview requires complete local Git objects.');
  const line=async args=>decode(await git(root,args)).trim();
  if(await fs.realpath(await line(['rev-parse','--show-toplevel']))!==root ||
     await fs.realpath(path.resolve(root,await line(['rev-parse','--git-dir'])))!==dot) throw new Error('Open this project’s own repository.');
  // Older Git versions may not support GIT_NO_LAZY_FETCH.
  const partial=await line(['config','--get-regexp','^(extensions\\.partialclone|remote\\..*\\.promisor)$']).catch(error=>{if(error.code===1)return '';throw error;});
  if(partial) throw new Error('Preview requires complete local Git objects.');
  if(await line(['cat-file','-t',commit])!=='commit') throw new Error('Choose a commit from project history.');
  const head=await line(['rev-parse','--verify','HEAD^{commit}']);
  if(!oid(head) || head.length!==commit.length) throw new Error('Unsupported project history.');
  const current=tree(await git(root,['ls-tree','-r','-z','--full-tree',head]));
  const target=tree(await git(root,['ls-tree','-r','-z','--full-tree',commit]));
  const names=[...new Set([...current.keys(),...target.keys()])].sort();
  if(names.length>MAX_FILES) throw new Error('Project comparison is too large to preview.');
  const files=[];
  for(const name of names) {
    const before=current.get(name),after=target.get(name);
    if(before?.object===after?.object && before?.mode===after?.mode)continue;
    files.push(Object.freeze({name,kind:!before?'added':!after?'deleted':'modified',
      current:before?Object.freeze(before):null,target:after?Object.freeze(after):null}));
  }
  await assertTrusted();
  if(await line(['rev-parse','--verify','HEAD^{commit}'])!==head) throw new Error('Project history changed; preview it again.');
  return Object.freeze({head,commit,files:Object.freeze(files)});
}
module.exports={previewProjectVersion};
