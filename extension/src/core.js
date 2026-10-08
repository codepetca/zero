'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

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
async function git(project, args) {
  const {stdout} = await execute('git', args, {cwd: project, timeout: 15000, maxBuffer: 1024 * 1024});
  return args.includes('-z') ? stdout : stdout.trim();
}
async function repositoryRoot(project, run = git) {
  try { return await fs.realpath(await run(project, ['rev-parse', '--show-toplevel'])); }
  catch (error) {
    if (error.code === 128 && /not a git repository/i.test(error.stderr || '')) return null;
    throw error;
  }
}
async function assertRepositoryRoot(project, run = git) {
  const expected = await fs.realpath(project);
  const actual = await repositoryRoot(expected, run);
  if (actual !== expected) throw new Error(actual ? 'This project is inside a different Git repository. Open a standalone student copy before connecting.' : 'Connect a repository for this student project first.');
  return expected;
}
async function connectRepository(project, url, confirmReplacement, run = git) {
  const repository = parseRepositoryUrl(url);
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
function simulatedUpload() {
  return {simulation: true, uploaded: false, message: 'Simulation only — nothing uploaded. Your files remain local. Copy your repository link separately for Pika.'};
}
function runSpecification(project, platform = process.platform) {
  return {cwd: project, command: path.join(project, platform === 'win32' ? 'mvnw.cmd' : 'mvnw'), args: ['clean', 'compile', 'javafx:run'], shell: platform === 'win32'};
}
module.exports = {parseRepositoryUrl, resolveProject, git, repositoryRoot, assertRepositoryRoot, connectRepository, simulatedUpload, runSpecification};
