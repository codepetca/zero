'use strict';
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const {refuseFilters} = require('./git-filter-guard');
const exec = promisify(execFile);

// A linked worktree's marker is a file pointing to its private Git directory.
// Verify both the common-directory location and Git's backlink so an arbitrary
// gitdir file or a symlinked worktree entry cannot impersonate this project.
async function assertLinkedWorktree(root, env) {
  const options={cwd:root,env,encoding:'utf8',timeout:10000,maxBuffer:16384};
  const read=async file=>{
    const info=await fs.lstat(file);
    if(!info.isFile()||info.isSymbolicLink()||info.size>16384)throw new Error('Linked worktree metadata cannot be verified.');
    return fs.readFile(file,'utf8');
  };
  const marker=path.join(root,'.git'),text=await read(marker);
  const match=/^gitdir: ([^\r\n]+)\r?\n?$/.exec(text);
  if(!match)throw new Error('Linked worktree metadata cannot be verified.');
  const actualRoot=await fs.realpath((await exec('git',['rev-parse','--show-toplevel'],options)).stdout.trim());
  if(actualRoot!==await fs.realpath(root))throw new Error('File status requires the project repository root.');
  const namedGitdir=path.resolve(root,match[1]),namedInfo=await fs.lstat(namedGitdir);
  if(!namedInfo.isDirectory()||namedInfo.isSymbolicLink())throw new Error('Linked worktree metadata cannot be verified.');
  const gitdir=await fs.realpath(namedGitdir);
  const common=await fs.realpath(path.resolve(root,(await exec('git',['rev-parse','--git-common-dir'],options)).stdout.trim()));
  const worktrees=path.join(common,'worktrees');
  for(const directory of [common,worktrees,gitdir]) {
    const info=await fs.lstat(directory);
    if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Linked worktree metadata cannot be verified.');
  }
  if(path.dirname(gitdir)!==worktrees)throw new Error('Linked worktree metadata cannot be verified.');
  const backlink=(await read(path.join(gitdir,'gitdir'))).replace(/\r?\n$/,'');
  if(!path.isAbsolute(backlink)||await fs.realpath(backlink)!==await fs.realpath(marker))throw new Error('Linked worktree metadata cannot be verified.');
  return {gitdir,common};
}

// Parse `git status --porcelain=v1 -z --no-renames --untracked-files=all`.
// This is presentation data only: it must never authorize a file operation.
function parseStudentFileStatus(text) {
  if (typeof text !== 'string' || (text && !text.endsWith('\0'))) throw new Error('Incomplete Git status.');
  const changes = new Map();
  const codes = new Map();
  for (const record of text.split('\0').filter(Boolean)) {
    if (record.length < 4 || record[2] !== ' ') throw new Error('Unexpected Git status.');
    const code = record.slice(0, 2), name = record.slice(3);
    if (!name || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f\x7f\\]/.test(name)) throw new Error('Unsupported Git status path.');
    if (!/^(?:\?\?|[ MADUT?!]{2})$/.test(code)) throw new Error('Unsupported Git status.');
    const conflict = ['DD','AU','UD','UA','DU','AA','UU'].includes(code);
    // Git emits a staged deletion and a separate untracked record when the
    // same path is recreated. The file is present and differs from the index;
    // treat that one known pair as a modification, not an ambiguous duplicate.
    if (changes.has(name)) {
      const previous = codes.get(name);
      if (!((previous === 'D ' && code === '??') || (previous === '??' && code === 'D '))) throw new Error('Duplicate Git status path.');
      changes.set(name, 'modified');
      codes.set(name, 'recreated');
      continue;
    }
    // The worktree column determines whether a staged addition still exists.
    const kind = conflict ? 'conflict' : code[1] === 'D' ? 'deleted' : code === '??' || code.includes('A') ? 'added' : code.includes('D') ? 'deleted' : 'modified';
    changes.set(name, kind);
    codes.set(name, code);
  }
  // Presentation hint only. File operations must independently re-read and
  // validate the exact status, index and workspace before mutating anything.
  Object.defineProperty(changes,'statusCodes',{value:codes});
  return changes;
}
// Limit execution and output. Never contact a remote or let hooks run.
async function readStudentFileStatus(root,{safeConfig=false,standaloneOnly=false}={}) {
  // Do not accidentally report the status of a containing repository.
  let metadata;
  try { metadata = await fs.lstat(path.join(root, '.git')); }
  catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
  if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) throw new Error('File status requires a project repository.');
  if (standaloneOnly && metadata.isFile()) throw new Error('Student Commit requires a standalone project repository.');
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key)));
  Object.assign(env,{GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1',GIT_ALLOW_PROTOCOL:'',GIT_TERMINAL_PROMPT:'0'});
  if(safeConfig)Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:require('node:os').devNull,GIT_ATTR_NOSYSTEM:'1',GIT_NO_REPLACE_OBJECTS:'1'});
  const linked=metadata.isFile()?await assertLinkedWorktree(root,env):undefined;
  // Status can invoke a configured clean filter, even though this is a
  // background read. Do not execute project or global filter commands while
  // refreshing the tree; report status unavailable instead.
  const inspect = async (directory,args) => {
    const {stdout} = await exec('git',['--no-pager','-c','core.fsmonitor=false',...args],{cwd:directory,env,encoding:'buffer',timeout:10000,maxBuffer:1024*1024});
    const text = new TextDecoder('utf-8',{fatal:true}).decode(stdout);
    if (args.includes('-z') && text && !text.endsWith('\0')) throw new Error('Git filter attributes could not be verified. Use Source Control.');
    return text;
  };
  await assertNoPromisor(root,inspect);
  try { await refuseFilters(root,inspect); }
  catch(error) {
    if (/Git filters require native Source Control/.test(error.message)) throw new Error('File status is unavailable with active Git filters. Use Source Control.');
    throw error;
  }
  await assertNoPromisor(root,inspect);
  const {stdout} = await exec('git', ['--no-pager', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all'], {
    cwd: root, encoding: 'buffer', timeout: 10000, maxBuffer: 1024 * 1024,
    env
  });
  await assertNoPromisor(root,inspect);
  const changes=parseStudentFileStatus(new TextDecoder('utf-8', {fatal:true}).decode(stdout));
  // Discard and per-file removal require a committed HEAD and index. Do not
  // offer them when HEAD is unborn or cannot be verified; mutations recheck.
  if(changes.size) {
    let hasCommittedHead=false;
    try {await assertNoPromisor(root,inspect);const result=await exec('git',['--no-pager','rev-parse','--verify','HEAD^{commit}'],{cwd:root,encoding:'utf8',timeout:10000,maxBuffer:1024,env});hasCommittedHead=/^(?:[a-f0-9]{40}|[a-f0-9]{64})\n?$/.test(result.stdout);}
    catch {/* An absent or unreadable HEAD cannot authorize this action. */}
    Object.defineProperty(changes,'hasCommittedHead',{value:hasCommittedHead});
    if(!hasCommittedHead&&metadata.isDirectory()) {
      let verifiedUnborn=false;
      try {await require('./unborn-head').inspectUnbornHead(root);verifiedUnborn=true;}catch {/* Presentation only; ambiguous HEAD stays disabled. */}
      Object.defineProperty(changes,'verifiedUnbornHead',{value:verifiedUnborn});
    }
  }
  // The discard implementation currently requires a .git directory in the
  // project. This is a presentation hint only; mutation still revalidates.
  Object.defineProperty(changes,'supportsDiscard',{value:metadata.isDirectory()});
  if(linked)Object.defineProperty(changes,'gitWatchDirectories',{value:Object.freeze([linked.gitdir,linked.common])});
  await assertNoPromisor(root,inspect);
  return changes;
}
async function assertNoPromisor(root,run) {
  try {await run(root,['config','--get-regexp','^(extensions\\.partialclone|remote\\..*\\.promisor)$']);}
  catch(error) {if(error.code===1)return;throw error;}
  throw new Error('File status is unavailable for partial clones. Use Source Control.');
}
module.exports = {parseStudentFileStatus, readStudentFileStatus, assertNoPromisor};
