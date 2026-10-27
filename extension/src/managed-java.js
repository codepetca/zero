'use strict';
const path = require('node:path');
const {execFile} = require('node:child_process');
const executeFile = require('node:util').promisify(execFile);

// Set by Zero's native launcher after it verifies its private JDK. This is
// independent of JAVA_HOME, which VS Code's shell discovery can overwrite.
function managedJavaHome(environment = process.env, platform = process.platform) {
  const entry = Object.entries(environment).find(([key]) => platform === 'win32' ? key.toUpperCase() === 'ZERO_JAVA_HOME' : key === 'ZERO_JAVA_HOME');
  if (!entry) return undefined; // Ordinary extension/developer installations keep their own toolchain.
  const home = entry[1], paths = platform === 'win32' ? path.win32 : path;
  if (typeof home !== 'string' || !paths.isAbsolute(home) || /[\0\r\n]/.test(home)) throw new Error('Zero’s bundled Java location is invalid. Reopen Zero to repair its runtime.');
  return home;
}

function managedJavaEnvironment(environment = process.env, platform = process.platform) {
  const home = managedJavaHome(environment, platform), result = {...environment};
  if (!home) return result;
  const paths = platform === 'win32' ? path.win32 : path, delimiter = platform === 'win32' ? ';' : path.delimiter;
  const currentPath = Object.entries(environment).find(([key]) => platform === 'win32' ? key.toUpperCase() === 'PATH' : key === 'PATH')?.[1] || '';
  // JVM/Maven startup flags from another installation must not redirect Java or
  // inject a different runtime into Zero's child processes. Never edit the parent.
  const owned = new Set(['JAVA_HOME','PATH','JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS','MAVEN_OPTS','MAVEN_ARGS','MAVEN_SKIP_RC']);
  for (const key of Object.keys(result)) if (owned.has(platform === 'win32' ? key.toUpperCase() : key)) delete result[key];
  result.JAVA_HOME = home;
  result.MAVEN_SKIP_RC = '1'; // Maven's user startup files can also replace JAVA_HOME.
  result.PATH = paths.join(home, 'bin') + (currentPath ? delimiter + currentPath : '');
  return result;
}

async function verifyManagedJava({environment = process.env, platform = process.platform, execute = executeFile} = {}) {
  const home = managedJavaHome(environment, platform);
  if (!home) return undefined;
  const env = managedJavaEnvironment(environment, platform), paths = platform === 'win32' ? path.win32 : path;
  try {
    const versions = await Promise.all(['java','javac'].map(async name => {
      const result = await execute(paths.join(home, 'bin', name + (platform === 'win32' ? '.exe' : '')), ['-version'], {env,timeout:10000,maxBuffer:64*1024,windowsHide:true});
      const text = [result.stdout,result.stderr].filter(Boolean).join('\n');
      return name === 'java' ? /\b(?:openjdk|java)\s+(?:version\s+)?"?21(?:\.|\s|")/i.test(text) : /\bjavac\s+21(?:\.|\s|$)/.test(text);
    }));
    if (!versions.every(Boolean)) throw new Error('Java and javac must both be version 21.');
  } catch (error) {
    throw new Error('Zero’s bundled Java 21 is unavailable. Reopen Zero to repair it. Your system Java was kept. ' + error.message);
  }
  return env;
}

module.exports = {managedJavaHome,managedJavaEnvironment,verifyManagedJava};
