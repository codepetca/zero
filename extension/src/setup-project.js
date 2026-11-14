'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

function setupProjectPath({env = process.env, home = os.homedir()} = {}) {
  if (env.ZERO_WINDOWS_DISTRIBUTION === 'portable') {
    const starter = env.ZERO_PORTABLE_STARTER;
    if (typeof starter !== 'string' || !/^[a-z]:[\\/]/i.test(starter) || /[\0\r\n]/.test(starter)) {
      throw new Error('The school’s Zero starter location is unavailable. Reopen Zero.exe from the approved folder.');
    }
    return starter;
  }
  const kit = env.ZERO_KIT_DIR || path.join(home, 'Zero');
  if (!path.isAbsolute(kit)) throw new Error('Zero setup needs an absolute kit location. Open Zero from its installed app.');
  return path.join(kit, 'starter');
}
function isSetupProject(root, options) {
  return typeof root === 'string' && path.resolve(root) === path.resolve(setupProjectPath(options));
}
async function findSetupProject(options) {
  const root = setupProjectPath(options);
  for (const name of ['zero.json', 'pom.xml', 'mvnw', 'mvnw.cmd', '.mvn/wrapper/maven-wrapper.properties']) {
    try {if (!(await fs.stat(path.join(root, name))).isFile()) throw new Error('Missing setup file');}
    catch {throw new Error('The installation test is unavailable. Open the Zero app and run setup again to restore the complete kit.');}
  }
  return root;
}
module.exports = {setupProjectPath, isSetupProject, findSetupProject};
