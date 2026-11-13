'use strict';
const fs = require('node:fs');
const {win32} = require('node:path');

function fullyQualified(value) {
  return typeof value === 'string' && /^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(value);
}

function gitExecutable(environment = process.env, platform = process.platform, stat = fs.statSync) {
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
