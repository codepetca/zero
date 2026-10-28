'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {execFile} = require('node:child_process');
const executeFile = require('node:util').promisify(execFile);

function environmentValue(environment, name, platform) {
  return Object.entries(environment).find(([key]) => platform === 'win32' ? key.toUpperCase() === name : key === name)?.[1];
}

function readRuntimeFile(filename, limit) {
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.size > limit) throw new Error('Runtime metadata must be a bounded ordinary file.');
    const bytes = Buffer.alloc(limit + 1); let length = 0;
    while (length < bytes.length) {const count = fs.readSync(fd, bytes, length, bytes.length - length, null); if (!count) break; length += count;}
    if (length > limit) throw new Error('Runtime metadata exceeds its size limit.');
    return bytes.subarray(0,length).toString('utf8');
  } finally {fs.closeSync(fd);}
}

function windowsNativeRoot(home, sourceDirectory, marker) {
  if (typeof home !== 'string' || !path.win32.isAbsolute(home)) return undefined;
  const roots = {direct:'ZeroData', store:'ZeroStudioStoreData', 'msix-feasibility':'ZeroMsixFeasibility'};
  const extensionParent = path.win32.dirname(path.win32.dirname(sourceDirectory));
  const detected = Object.entries(roots).find(([,folder]) => extensionParent.toLowerCase() === path.win32.join(home, folder, 'editor', 'extensions').toLowerCase());
  if (marker !== undefined && !['store','msix-feasibility'].includes(marker)) throw new Error('Zero’s Windows distribution marker is invalid. Reopen Zero.');
  if (detected && marker !== undefined && detected[0] !== marker) throw new Error('Zero’s Windows distribution does not match its editor profile. Reopen Zero.');
  if (!detected && marker !== undefined) throw new Error('Zero’s Windows editor profile is unavailable. Reopen Zero.');
  return path.win32.join(home, detected ? roots[detected[0]] : roots.direct);
}

// Read the current native kit rather than relying only on process variables:
// VS Code keeps an existing window's environment when Reload Window updates it.
function nativeJavaHome(environment, platform, sourceDirectory) {
  const kit = environmentValue(environment, 'ZERO_KIT_DIR', platform);
  if (kit === undefined) return undefined;
  const paths = platform === 'win32' ? path.win32 : path;
  const home = platform === 'win32' ? environmentValue(environment, 'LOCALAPPDATA', platform) : environmentValue(environment, 'HOME', platform) || os.homedir();
  const privateRoot = platform === 'win32' ? windowsNativeRoot(home, sourceDirectory, environmentValue(environment, 'ZERO_WINDOWS_DISTRIBUTION', platform)) : typeof home === 'string' && paths.isAbsolute(home) ? paths.join(home, 'Library','Application Support','Zero') : undefined;
  const nativeExtensions = privateRoot && paths.join(privateRoot, 'editor','extensions');
  const extensionParent = paths.dirname(paths.dirname(sourceDirectory));
  const installedNative = nativeExtensions && (platform === 'win32' ? extensionParent.toLowerCase() === nativeExtensions.toLowerCase() : extensionParent === nativeExtensions);
  // Manual setup also exports ZERO_KIT_DIR. Only a native launcher marker or
  // this module's actual isolated installation identifies a managed host.
  if (environmentValue(environment, 'ZERO_JAVA_HOME', platform) === undefined && !installedNative) return undefined;
  if (!['darwin','win32'].includes(platform) || typeof kit !== 'string' || !paths.isAbsolute(kit) || /[\0\r\n]/.test(kit)) throw new Error('Zero’s native kit location is invalid. Reopen Zero to repair its runtime.');
  try {
    const manifest = JSON.parse(readRuntimeFile(paths.join(kit, 'setup', platform === 'win32' ? 'windows-downloads.json' : 'mac-downloads.json'), 64*1024));
    const asset = manifest.architectures?.[platform === 'darwin' && process.arch === 'arm64' ? 'arm64' : 'x64']?.jdk;
    if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(asset?.sha256 || '') || !/^jdk-21\.\d+\.\d+(?:\.\d+)?\+\d+$/.test(asset?.version || '')) throw new Error('Unrecognized Java download metadata.');
    if (!privateRoot) throw new Error('Zero’s private runtime directory is unavailable.');
    const folder = paths.join(privateRoot, 'runtime', 'jdk-' + asset.sha256);
    const receipt = readRuntimeFile(paths.join(folder, platform === 'darwin' ? '.zero-asset.json' : '.zero-asset.sha256'), 128);
    if ((platform === 'win32' ? receipt.trim() : receipt) !== asset.sha256) throw new Error('Private Java receipt differs from the current kit.');
    return platform === 'darwin' ? paths.join(folder, asset.version, 'Contents','Home') : folder;
  } catch (error) {
    throw new Error('Zero’s bundled Java selection is unavailable. Reopen Zero to repair it; system Java will not be substituted. ' + error.message);
  }
}

// A native kit takes precedence even when an old editor process retains an old
// ZERO_JAVA_HOME. Standalone managed hosts can also supply the explicit marker.
function managedJavaHome(environment = process.env, platform = process.platform, sourceDirectory = __dirname) {
  const current = nativeJavaHome(environment, platform, sourceDirectory);
  if (current) return current;
  const entry = Object.entries(environment).find(([key]) => platform === 'win32' ? key.toUpperCase() === 'ZERO_JAVA_HOME' : key === 'ZERO_JAVA_HOME');
  if (!entry) return undefined; // Ordinary extension/developer installations keep their own toolchain.
  const home = entry[1], paths = platform === 'win32' ? path.win32 : path;
  if (typeof home !== 'string' || !paths.isAbsolute(home) || /[\0\r\n]/.test(home)) throw new Error('Zero’s bundled Java location is invalid. Reopen Zero to repair its runtime.');
  return home;
}

function managedJavaEnvironment(environment = process.env, platform = process.platform, sourceDirectory = __dirname) {
  const home = managedJavaHome(environment, platform, sourceDirectory), result = {...environment};
  if (!home) return result;
  const paths = platform === 'win32' ? path.win32 : path, delimiter = platform === 'win32' ? ';' : path.delimiter;
  const currentPath = Object.entries(environment).find(([key]) => platform === 'win32' ? key.toUpperCase() === 'PATH' : key === 'PATH')?.[1] || '';
  // JVM/Maven startup flags from another installation must not redirect Java or
  // inject a different runtime into Zero's child processes. Never edit the parent.
  const owned = new Set(['JAVA_HOME','ZERO_JAVA_HOME','PATH','JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','_JAVA_OPTIONS','MAVEN_OPTS','MAVEN_ARGS','MAVEN_SKIP_RC']);
  for (const key of Object.keys(result)) if (owned.has(platform === 'win32' ? key.toUpperCase() : key)) delete result[key];
  result.JAVA_HOME = home;
  result.ZERO_JAVA_HOME = home;
  result.MAVEN_SKIP_RC = '1'; // Maven's user startup files can also replace JAVA_HOME.
  result.PATH = paths.join(home, 'bin') + (currentPath ? delimiter + currentPath : '');
  return result;
}

async function verifyManagedJava({environment = process.env, platform = process.platform, execute = executeFile, sourceDirectory = __dirname} = {}) {
  const home = managedJavaHome(environment, platform, sourceDirectory);
  if (!home) return undefined;
  const env = managedJavaEnvironment(environment, platform, sourceDirectory), paths = platform === 'win32' ? path.win32 : path;
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

module.exports = {managedJavaHome,managedJavaEnvironment,verifyManagedJava,windowsNativeRoot};
