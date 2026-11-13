'use strict';
const fs = require('node:fs');
const {win32, posix} = require('node:path');
const os = require('node:os');

function fullyQualified(value) {
  return typeof value === 'string' && /^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(value);
}

function currentMacGit(sourceDirectory, home) {
  const editor = posix.join(home, 'Library', 'Application Support', 'Zero', 'editor');
  // An already-running isolated VS Code host can retain pre-update variables.
  // Read the selection the current launcher published for this installed profile.
  if (posix.dirname(posix.dirname(sourceDirectory)) !== posix.join(editor, 'extensions')) return undefined;
  if (fs.realpathSync(editor) !== editor) throw Error('Unrecognized Git selection directory.');
  const fd = fs.openSync(posix.join(editor, 'git-selection.json'), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const file = fs.fstatSync(fd);
    if (!file.isFile() || file.size > 8192 || (file.mode & 0o022) !== 0 || file.uid !== process.getuid()) throw Error('Unrecognized Git selection.');
    const bytes = Buffer.alloc(8193);
    const length = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (length > 8192) throw Error('Invalid Git selection.');
    const selection = JSON.parse(bytes.subarray(0, length).toString('utf8'));
    if (!selection || Object.keys(selection).sort().join(',') !== 'executable,schema' || selection.schema !== 1) throw Error('Unrecognized Git selection.');
    return selection.executable;
  } finally { fs.closeSync(fd); }
}

function gitExecutable(environment = process.env, platform = process.platform, stat = fs.statSync, sourceDirectory = __dirname, home = os.homedir()) {
  if (platform === 'darwin') {
    let selected;
    try { selected = currentMacGit(sourceDirectory, home); }
    catch { selected = null; }
    if (selected === undefined) selected = environment.ZERO_GIT_SETUP_FAILED === '1' ? null : environment.ZERO_GIT_EXECUTABLE;
    if (selected === undefined) return 'git';
    if (typeof selected === 'string' && posix.isAbsolute(selected) && posix.basename(selected) === 'git') {
      try {
        if (stat(selected).isFile()) {
          fs.accessSync(selected, fs.constants.X_OK);
          if (fs.realpathSync(selected) !== '/usr/bin/git') return selected;
        }
      } catch (error) {
        if (!['ENOENT','ENOTDIR','EACCES','EPERM'].includes(error.code)) throw error;
      }
    }
    throw Object.assign(new Error('Zero could not prepare Git on this computer.'), {code:'ZERO_GIT_SETUP_FAILED'});
  }
  if (platform !== 'win32') return 'git';
  const value = key => Object.entries(environment).find(([name]) => name.toUpperCase() === key)?.[1];
  const selected = value('ZERO_GIT_EXECUTABLE');
  const setupFailed = value('ZERO_GIT_SETUP_FAILED') === '1';
  if (!setupFailed && fullyQualified(selected) && win32.basename(selected).toLowerCase() === 'git.exe') return selected;
  if (!setupFailed && selected === undefined) {
    for (const entry of (value('PATH') || '').split(';')) {
      const directory = entry.trim().replace(/^"([^"]*)"$/, '$1');
      if (!fullyQualified(directory)) continue;
      const candidate = win32.join(directory,'git.exe');
      try {if (stat(candidate).isFile()) return candidate;}
      catch (error) {
        if (!['ENOENT','ENOTDIR','EACCES','EPERM'].includes(error.code)) throw error;
      }
    }
  }
  throw Object.assign(new Error('Zero could not find Git on this computer.'), {code:'ENOENT'});
}

module.exports = {gitExecutable};
