'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const {assertShareable,tutorialMarker} = require('./lesson-projects');

function parseRepositoryUrl(input) {
  if (typeof input !== 'string' || input !== input.trim()) throw new Error('Use an ordinary GitHub HTTPS repository URL.');
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(input);
  if (!match || ['.', '..'].includes(match[2])) throw new Error('Use https://github.com/owner/repository (optionally ending in .git).');
  const page = `https://github.com/${match[1]}/${match[2]}`;
  return {page, remote: `${page}.git`};
}
async function marked(directory) {
  try {
    const stat = await fs.stat(path.join(directory, 'zero.json'));
    return stat.isFile();
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
async function resolveProject(workspacePaths) {
  const roots = [];
  for (const root of workspacePaths) {
    if (await marked(root)) roots.push(await fs.realpath(root));
    else if (await marked(path.join(root, 'student-template'))) roots.push(await fs.realpath(path.join(root, 'student-template')));
  }
  const unique = [...new Set(roots)];
  if (unique.length !== 1) throw new Error(unique.length ? 'Multiple Zero projects are open. Open one student project in its own window.' : 'Open a folder containing zero.json, or the Zero kit with student-template/zero.json.');
  return unique[0];
}
async function git(project, args, options = {}) {
  const {stdout} = await execute('git', args, {cwd: project, timeout: 15000, maxBuffer: 1024 * 1024, ...(options.env ? {env:options.env} : {}),...(options.encoding==='buffer'?{encoding:'buffer'}:{})});
  return Buffer.isBuffer(stdout)||args.includes('-z') ? stdout : stdout.trim();
}
function validBranchName(branch) {
  return typeof branch === 'string' && branch.length > 0 && branch !== '@' && !branch.startsWith('-') && !/[\s\x00-\x1f\x7f:~^?*\[\\]/.test(branch) && !branch.includes('..') && !branch.includes('@{') && !branch.endsWith('.') && !branch.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'));
}
function branchNameFromRef(ref) {
  const prefix='refs/heads/';
  if(typeof ref!=='string'||!ref.startsWith(prefix)||!validBranchName(ref.slice(prefix.length)))throw new Error('Choose a valid local Git branch.');
  return ref.slice(prefix.length);
}
async function currentBranch(project,run=module.exports.git) {
  // Git's --short can prepend a namespace when another ref has the same name.
  // Only remove the fixed local-branch prefix from the exact symbolic HEAD.
  const ref=await run(project,['symbolic-ref','--quiet','--no-recurse','HEAD']);
  const branch=branchNameFromRef(ref);
  try {await run(project,['symbolic-ref','--quiet','--no-recurse',ref]);}
  catch(error){if(error.code===1)return branch;throw error;}
  throw new Error('This local branch is a symbolic reference. Use Source Control to inspect it before continuing.');
}
async function repositoryRoot(project, run = git) {
  try { return await fs.realpath(await run(project, ['rev-parse', '--show-toplevel'])); }
  catch (error) {
    if (error.code === 128 && /not a git repository/i.test(error.stderr || '')) return null;
    throw error;
  }
}
// Accept ordinary repositories and Git's reciprocal linked-worktree layout.
// The identity excludes mutable index/HEAD data, which callers review separately.
// Reinspect it immediately before mutation; a .git file alone grants no access.
async function inspectGitLayout(project, run = git) {
  const fail=()=>new Error('The project Git metadata changed or cannot be verified. Open one ordinary student Git project.');
  if(typeof project!=='string'||!path.isAbsolute(project)||await fs.realpath(project)!==project)throw fail();
  const entries=[];
  const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode;
  const directory=async file=>{
    const info=await fs.lstat(file);
    if(!info.isDirectory()||info.isSymbolicLink()||await fs.realpath(file)!==file)throw fail();
    entries.push({file,info});return info;
  };
  const text=async file=>{
    const info=await fs.lstat(file);
    if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>16384)throw fail();
    const handle=await fs.open(file,require('node:fs').constants.O_RDONLY|(require('node:fs').constants.O_NOFOLLOW||0));
    try {
      const opened=await handle.stat();if(!same(info,opened)||opened.size!==info.size)throw fail();
      const bytes=Buffer.alloc(info.size+1);let length=0;
      while(length<bytes.length){const result=await handle.read(bytes,length,bytes.length-length,length);if(!result.bytesRead)break;length+=result.bytesRead;}
      const after=await handle.stat();
      if(length!==info.size||!same(opened,after)||after.size!==info.size||after.mtimeMs!==info.mtimeMs)throw fail();
      const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,length));
      entries.push({file,info,value});return value;
    } finally {await handle.close();}
  };
  await directory(project);
  if(await repositoryRoot(project,run)!==project)throw fail();
  const marker=path.join(project,'.git'),markerInfo=await fs.lstat(marker);
  if(markerInfo.isSymbolicLink()||(!markerInfo.isDirectory()&&!markerInfo.isFile()))throw fail();
  const gitDir=path.resolve(project,await run(project,['rev-parse','--absolute-git-dir']));
  const commonDir=path.resolve(project,await run(project,['rev-parse','--git-common-dir']));
  await directory(gitDir);if(commonDir!==gitDir)await directory(commonDir);
  const linked=markerInfo.isFile();
  if(linked) {
    const match=/^gitdir: ([^\r\n]+)\r?\n?$/.exec(await text(marker));
    if(!match||path.resolve(project,match[1])!==gitDir)throw fail();
    const worktrees=path.join(commonDir,'worktrees');await directory(worktrees);
    if(path.dirname(gitDir)!==worktrees)throw fail();
    const common=(await text(path.join(gitDir,'commondir'))).replace(/\r?\n$/,'');
    const backlink=(await text(path.join(gitDir,'gitdir'))).replace(/\r?\n$/,'');
    if(!common||/[\r\n]/.test(common)||path.resolve(gitDir,common)!==commonDir||!path.isAbsolute(backlink)||/[\r\n]/.test(backlink)||path.resolve(backlink)!==marker)throw fail();
  } else if(gitDir!==marker||commonDir!==marker)throw fail();
  for(const entry of entries) {
    const now=await fs.lstat(entry.file);
    if(!same(entry.info,now)||(entry.value!==undefined&&(now.size!==entry.info.size||now.mtimeMs!==entry.info.mtimeMs)))throw fail();
  }
  const identity=JSON.stringify(entries.map(({file,info,value})=>[file,info.dev,info.ino,info.mode,value]));
  return Object.freeze({root:project,gitDir,commonDir,linked,identity});
}
// Read-only teaching workflow check. This intentionally proves local repository
// readiness, not ancestry or remote ownership; Run never contacts GitHub.
async function assertTutorialRepository(project, run = git) {
  const marker = await tutorialMarker(project);
  if (!marker) return null;
  const help = 'Create YOUR repository from the tutorial template, then use VS Code Git: Clone and open that cloned folder.';
  const expected = await fs.realpath(project);
  const actual = await repositoryRoot(expected, run);
  if (actual !== expected) throw new Error(`This tutorial needs its own standalone Git repository. ${help}`);
  try {await run(expected, ['rev-parse', '--verify', 'HEAD^{commit}']);}
  catch {throw new Error(`This tutorial repository has no starting commit. ${help}`);}
  let repository;
  try {repository = parseRepositoryUrl(await run(expected, ['remote', 'get-url', 'origin']));}
  catch {throw new Error(`This tutorial needs your ordinary GitHub HTTPS origin. ${help}`);}
  if (/^https:\/\/github\.com\/codepetca\/zero-tutorial-(?:greeting|study|game|pet)$/i.test(repository.page)) throw new Error(`This is a shared tutorial template origin. ${help}`);
  return repository;
}
async function assertRepositoryRoot(project, run = git) {
  await assertShareable(project);
  await assertTutorialRepository(project, run);
  const expected = await fs.realpath(project);
  const actual = await repositoryRoot(expected, run);
  if (actual !== expected) throw new Error(actual ? 'This project is inside a different Git repository. Open a standalone student copy before connecting.' : 'Connect a repository for this student project first.');
  return expected;
}
async function connectRepository(project, url, confirmReplacement, run = git) {
  await assertShareable(project);
  const repository = parseRepositoryUrl(url);
  const tutorial = await assertTutorialRepository(project, run);
  if (tutorial) {
    if (tutorial.page.toLowerCase() !== repository.page.toLowerCase()) throw new Error('This tutorial is already connected to its cloned repository. Clone your own repository to use a different destination.');
    return tutorial;
  }
  const expected = await fs.realpath(project);
  const existingRoot = await repositoryRoot(expected, run);
  if (existingRoot && existingRoot !== expected) throw new Error('This project is inside a different Git repository. Copy the student-template folder outside the kit repository first.');
  if (!existingRoot) await run(expected, ['init', '-b', 'main']);
  await assertRepositoryRoot(expected, run);
  let previous;
  try { previous = await run(expected, ['remote', 'get-url', 'origin']); }
  catch (error) { if (error.code !== 2 || !/No such remote/i.test(error.stderr || '')) throw error; }
  if (previous === repository.remote || previous === repository.page) return repository;
  if (previous && !(await confirmReplacement(previous))) return null;
  // Recheck immediately before every remote mutation.
  await assertRepositoryRoot(expected, run);
  await run(expected, ['remote', previous ? 'set-url' : 'add', 'origin', repository.remote]);
  return repository;
}
// A tutorial's missing origin has no trustworthy destination to infer. The
// student must explicitly confirm the exact repository; no files are uploaded.
async function reconnectTutorialRepository(project,url,confirm,run=git) {
  await assertShareable(project);
  if(!await tutorialMarker(project))throw new Error('This is not a tutorial project.');
  const repository=parseRepositoryUrl(url),root=await fs.realpath(project);
  if(/^https:\/\/github\.com\/codepetca\/zero-tutorial-(?:greeting|study|game|pet)$/i.test(repository.page))throw new Error('Choose your own repository, not the shared tutorial template.');
  async function inspect() {
    const dot=await fs.lstat(path.join(root,'.git'));
    if(root!==project||!dot.isDirectory()||dot.isSymbolicLink()||await repositoryRoot(root,run)!==root)throw new Error('Open the standalone tutorial repository.');
    const head=await run(root,['rev-parse','--verify','HEAD^{commit}']);
    const branch=await run(root,['symbolic-ref','--quiet','HEAD']);
    if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)||!branch.startsWith('refs/heads/'))throw new Error('Open a committed tutorial branch.');
    if((await run(root,['remote'])).split('\n').includes('origin'))throw new Error('Origin is already connected. Review the current repository.');
    return {head,branch};
  }
  const before=await inspect();
  if(typeof confirm!=='function'||!await confirm(repository.page))return null;
  const after=await inspect();
  if(before.head!==after.head||before.branch!==after.branch)throw new Error('The project changed. Review the repository again.');
  await run(root,['remote','add','origin',repository.remote]);
  return repository;
}
function simulatedUpload() {
  return {simulation: true, uploaded: false, message: 'Simulation only — nothing uploaded. Your files remain local. Copy your repository link separately for Pika.'};
}
function runSpecification(project, platform = process.platform) {
  return {cwd: project, command: path.join(project, platform === 'win32' ? 'mvnw.cmd' : 'mvnw'), args: ['clean', 'compile', 'javafx:run'], shell: platform === 'win32'};
}
module.exports = {assertTutorialRepository,parseRepositoryUrl, resolveProject, git, validBranchName, branchNameFromRef, currentBranch, repositoryRoot, inspectGitLayout, assertRepositoryRoot, connectRepository, reconnectTutorialRepository, simulatedUpload, runSpecification};
