import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const source = new URL('../setup.sh', import.meta.url);
function fixture(options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'Zero setup with spaces '));
  const setup = path.join(root, 'setup'), bin = path.join(root, 'fake tools'), jdk = path.join(root, 'JDK with spaces');
  for (const dir of [setup, bin, path.join(jdk, 'bin'), path.join(root, 'starter/.mvn/wrapper'), path.join(root, 'starter/.vscode'), path.join(root, 'optional')]) mkdirSync(dir, {recursive: true});
  copyFileSync(source, path.join(setup, 'setup.sh'));
  writeFileSync(path.join(setup, 'kit.properties'), 'kitVersion=0.5.4\nextensionId=zero.zero\n');
  for (const name of ['zero-0.5.4.vsix', 'optional/Zero.code-profile', 'starter/zero.json', 'starter/pom.xml', 'starter/mvnw', 'starter/mvnw.cmd', 'starter/.mvn/wrapper/maven-wrapper.properties', 'starter/.vscode/tasks.json']) writeFileSync(path.join(root, name), '', {mode: 0o755});
  const log = path.join(root, 'probes.log');
  const executable = (dir, name, body) => writeFileSync(path.join(dir, name), '#!/bin/bash\n' + body + '\n', {mode: 0o755});
  executable(bin, 'uname', options.macApp ? 'echo Darwin' : 'echo Linux');
  executable(bin, 'git', options.git === false ? 'exit 1' : 'echo "git version 2.31.0"');
  let codeBin = bin;
  if (options.macApp) { codeBin = path.join(root, 'Applications/Visual Studio Code.app/Contents/Resources/app/bin'); mkdirSync(codeBin, {recursive: true}); }
  executable(codeBin, 'code', 'printf "%s\\n" "$*" >> "$PROBE_LOG"\ncase "$*" in\n --version) ' + (options.code === false ? 'exit 1' : 'echo 1.100.0') + ' ;;\n "--profile Zero --list-extensions --show-versions") ' + (options.profile === false ? 'echo "Profile Zero not found"; exit 1' : 'printf "zero.zero@' + (options.extension || '0.5.4') + '\\nredhat.java@1.40.0\\n' + (options.debugger === false ? '' : 'vscjava.vscode-java-debug@0.58.0\\n') + '"') + ' ;;\n *) echo UNEXPECTED_MUTATION >> "$PROBE_LOG"; exit 99 ;;\nesac');
  executable(jdk + '/bin', 'java', 'echo \'openjdk version "' + (options.java || '17.0.12') + '"\' >&2');
  if (options.compiler !== false) executable(jdk + '/bin', 'javac', 'echo "javac ' + (options.javac || options.java || '17.0.12') + '"');
  // A valid PATH JDK must not conceal an explicitly invalid JAVA_HOME.
  for (const name of ['java', 'javac']) executable(bin, name, name === 'java' ? 'echo \'openjdk version "17.0.12"\' >&2' : 'echo "javac 17.0.12"');
  for (const name of ['brew', 'xdg-open', 'open']) executable(bin, name, 'echo UNEXPECTED_MUTATION >> "$PROBE_LOG"; exit 99');
  return {root, log, run() {
    const result = spawnSync('/bin/bash', [path.join(setup, 'setup.sh'), '--check'], {env: {...process.env, PATH: bin + ':/usr/bin:/bin', HOME: root, JAVA_HOME: options.invalidHome ? path.join(root, 'missing JDK') : jdk, PROBE_LOG: log}, encoding: 'utf8', timeout: 10000});
    assert.equal(result.error, undefined);
    const commands = readFileSync(log, 'utf8');
    assert.doesNotMatch(commands, /UNEXPECTED_MUTATION|install-extension|new-window/);
    assert.match(commands, /--profile Zero --list-extensions --show-versions|^--version\n$/);
    return result;
  }, cleanup() { rmSync(root, {recursive: true, force: true}); }};
}
for (const [name, options, status, expected] of [
  ['ready kit paths with spaces, Git optional', {git: false}, 0, /JDK: Java 17.0.12 and javac 17.0.12/],
  ['same major patch difference is usable', {javac: '17.0.13'}, 0, /javac 17.0.13/],
  ['missing optional debugger is ready', {debugger: false}, 0, /debugger: missing \(optional/],
  ['newer Zero is ready', {extension: '0.6.0'}, 0, /extensions: ready/],
  ['older Zero needs install', {extension: '0.5.3'}, 1, /too old/],
  ['Java runtime without compiler is not ready', {compiler: false}, 1, /javac: missing/],
  ['mismatched Java and javac not ready', {javac: '21.0.1'}, 1, /needs matching/],
  ['old JDK not ready', {java: '11.0.20'}, 1, /needs matching/],
  ['invalid JAVA_HOME does not fall back to PATH', {invalidHome: true}, 1, /java: missing, javac: missing/],
  ['missing profile is queried but not created', {profile: false}, 1, /profile: unavailable/],
  ['broken VS Code command not ready', {code: false}, 1, /VS Code: missing/]
]) test(name, () => { const kit = fixture(options); try { const result = kit.run(); assert.equal(result.status, status, result.stdout + result.stderr); assert.match(result.stdout, expected); } finally { kit.cleanup(); } });
test('missing wrapper metadata is an actionable incomplete kit', () => {
  const kit = fixture();
  try { rmSync(path.join(kit.root, 'starter/.mvn/wrapper/maven-wrapper.properties')); const result = kit.run(); assert.equal(result.status, 1); assert.match(result.stdout, /Missing kit file:.*maven-wrapper.properties/); }
  finally { kit.cleanup(); }
});
