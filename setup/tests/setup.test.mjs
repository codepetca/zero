import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const source = new URL('../setup.sh', import.meta.url);
function fixture(options = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'Zero setup with spaces '));
  const setup = path.join(root, 'setup'), bin = path.join(root, 'fake tools'), jdk = path.join(root, 'JDK with spaces');
  for (const dir of [setup, bin, path.join(jdk, 'bin'), path.join(root, 'starter/.mvn/wrapper'), path.join(root, 'starter/.vscode'), path.join(root, 'optional')]) mkdirSync(dir, {recursive: true});
  // Map only the stable system-app location into the disposable fake machine.
  // Interactive tests bypass the TTY gate in this copied script, never in product source.
  writeFileSync(path.join(setup, 'setup.sh'), readFileSync(source, 'utf8')
    .replace('"/Applications/Visual Studio Code.app', '"' + root + '/System Applications/Visual Studio Code.app')
    .replace('[ -w /Applications ]', options.nonWritableApps ? 'false' : '[ -w "' + root + '" ]')
    .replaceAll('/usr/libexec/java_home', root + '/missing-java-home-helper')
    .replace('[ ! -t 0 ]', options.interactive ? 'false' : '[ ! -t 0 ]'));
  writeFileSync(path.join(setup, 'kit.properties'), options.metadata ?? 'kitVersion=0.5.4\nextensionId=zero.zero\nvscodeMinimum=1.95.0\n');
  for (const name of ['zero-0.5.4.vsix', 'optional/Zero.code-profile', 'starter/zero.json', 'starter/pom.xml', 'starter/mvnw', 'starter/mvnw.cmd', 'starter/.mvn/wrapper/maven-wrapper.properties', 'starter/.vscode/tasks.json']) writeFileSync(path.join(root, name), '', {mode: 0o755});
  const log = path.join(root, 'probes.log');
  writeFileSync(log, '');
  const executable = (dir, name, body) => writeFileSync(path.join(dir, name), '#!/bin/bash\n' + body + '\n', {mode: 0o755});
  executable(bin, 'uname', options.macApp || options.mac ? 'echo Darwin' : 'echo Linux');
  executable(bin, 'git', options.git === false ? 'exit 1' : 'echo "git version ' + (options.gitVersion || '2.31.0') + '"');
  let codeBin = bin;
  if (options.macApp) { codeBin = path.join(root, 'Applications/Visual Studio Code.app/Contents/Resources/app/bin'); mkdirSync(codeBin, {recursive: true}); }
  const codeBody = 'printf "%s\\n" "$ZERO_KIT_DIR" > "$PROBE_LOG.kit"\nprintf "%s\\n" "$*" >> "$PROBE_LOG"\ncase "$*" in\n --version) ' + (options.code === false ? 'exit 1' : 'echo ' + (options.codeVersion || '1.100.0')) + ' ;;\n "--profile Zero --list-extensions --show-versions") ' + (options.profile === false ? 'echo "Profile Zero not found"; exit 1' : 'printf "zero.zero@' + (options.extension || '0.5.4') + '\\n' + (options.javaExtension === false ? '' : 'redhat.java@1.40.0\\n') + (options.debugger === false ? '' : 'vscjava.vscode-java-debug@0.58.0\\n') + '"') + ' ;;\n "--profile Zero --install-extension"*) ' + (options.allowMutation ? 'echo fake-install; exit ' + (options.installExit || 0) : 'echo UNEXPECTED_MUTATION >> "$PROBE_LOG"; exit 99') + ' ;;\n --new-window*) ' + (options.allowMutation ? 'echo fake-open' : 'echo UNEXPECTED_MUTATION >> "$PROBE_LOG"; exit 99') + ' ;;\n *) echo UNEXPECTED_MUTATION >> "$PROBE_LOG"; exit 99 ;;\nesac';
  executable(codeBin, 'code', codeBody);
  if (options.macApp && options.pathCodeVersion) executable(bin, 'code', codeBody.replace('echo ' + (options.codeVersion || '1.100.0'), 'echo ' + options.pathCodeVersion));
  executable(jdk + '/bin', 'java', 'echo \'openjdk version "' + (options.java || '17.0.12') + '"\' >&2');
  if (options.compiler !== false) executable(jdk + '/bin', 'javac', 'echo "javac ' + (options.javac || options.java || '17.0.12') + '"');
  // A valid PATH JDK must not conceal an explicitly invalid JAVA_HOME.
  for (const name of ['java', 'javac']) executable(bin, name, options.javaPathMissing ? 'exit 1' : name === 'java' ? 'echo \'openjdk version "17.0.12"\' >&2' : 'echo "javac 17.0.12"');
  for (const name of (options.noBrew ? ['xdg-open', 'open'] : ['brew', 'xdg-open', 'open'])) executable(bin, name, 'echo UNEXPECTED_MUTATION >> "$PROBE_LOG"; exit 99');
  if (options.brew) executable(bin, 'brew', `printf "brew %s\\n" "$*" >> "$PROBE_LOG"
case "$*" in
 "list --versions --cask") ${options.brew === 'inventoryFailure' ? 'exit 2' : ['missing', 'installFailure'].includes(options.brew) ? ':' : 'echo "visual-studio-code 1.90.0"'} ;;
 "outdated --quiet --cask --greedy-auto-updates") ${options.brew === 'outdatedFailure' ? 'exit 2' : ['outdated', 'upgradeFailure'].includes(options.brew) ? 'echo visual-studio-code' : options.brew === 'unrelated' ? 'printf "other-cask\\nvisual-studio-code-insiders\\n"' : ':'} ;;
 "list --versions --formula") echo "git 2.30.0" ;;
 "outdated --quiet --formula") echo git ;;
 # Match Homebrew: a named outdated query succeeds in finding an update but exits 1.
 "outdated --quiet --cask visual-studio-code"|"outdated --quiet --cask --greedy-auto-updates visual-studio-code") echo visual-studio-code; exit 1 ;;
 "outdated --quiet --formula git") echo git; exit 1 ;;
 "upgrade --cask visual-studio-code") exit ${options.brew === 'upgradeFailure' ? 42 : 0} ;;
 "install --cask visual-studio-code") exit ${options.brew === 'installFailure' ? 43 : 0} ;;
 "upgrade --formula git") exit 0 ;;
 *) echo UNEXPECTED_MUTATION >> "$PROBE_LOG"; exit 99 ;;
esac`);
  const environment = {...process.env, PATH: bin + ':/usr/bin:/bin', HOME: root, JAVA_HOME: options.invalidHome ? path.join(root, 'missing JDK') : options.noHome ? '' : jdk, PROBE_LOG: log};
  return {root, log, runArgs(args) {
    const result = spawnSync('/bin/bash', [path.join(setup, 'setup.sh'), ...args], {env: environment, encoding: 'utf8', timeout: 10000});
    assert.equal(result.error, undefined); return result;
  }, run(input) {
    const result = spawnSync('/bin/bash', [path.join(setup, 'setup.sh'), ...(input === undefined ? ['--check'] : [])], {env: {...process.env, PATH: bin + ':/usr/bin:/bin', HOME: root, JAVA_HOME: options.invalidHome ? path.join(root, 'missing JDK') : options.noHome ? '' : jdk, PROBE_LOG: log}, input, encoding: 'utf8', timeout: 10000});
    assert.equal(result.error, undefined);
    const commands = readFileSync(log, 'utf8');
    assert.doesNotMatch(commands, /UNEXPECTED_MUTATION|install-extension|new-window/);
    assert.match(commands, /--profile Zero --list-extensions --show-versions|^--version\n/m);
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
  ['broken VS Code command not ready', {code: false}, 1, /VS Code: missing/],
  ['old VS Code is not ready', {codeVersion: '1.94.2'}, 1, /candidate:.*1.94.2.*requires 1.95.0/],
  ['minimum VS Code is ready', {codeVersion: '1.95.0'}, 0, /VS Code: 1.95.0 at/],
  ['unparseable VS Code is not ready', {codeVersion: 'unknown'}, 1, /candidate:.*unknown/],
  ['future incompatible major is not ready', {codeVersion: '2.0.0'}, 1, /candidate:.*2.0.0/],
  ['known Mac app used without PATH CLI', {macApp: true}, 0, /VS Code: 1.100.0 at.*Applications/],
  ['compatible known Mac app follows old PATH CLI', {macApp: true, pathCodeVersion: '1.90.0'}, 0, /candidate:.*fake tools.*1.90.0/],
  ['newer compatible PATH Code is preserved', {macApp: true, codeVersion: '1.95.0', pathCodeVersion: '1.110.0'}, 0, /VS Code: 1.110.0 at.*fake tools/],
]) test(name, () => { const kit = fixture(options); try { const result = kit.run(); assert.equal(result.status, status, result.stdout + result.stderr); assert.match(result.stdout, expected); } finally { kit.cleanup(); } });
test('missing wrapper metadata is an actionable incomplete kit', () => {
  const kit = fixture();
  try { rmSync(path.join(kit.root, 'starter/.mvn/wrapper/maven-wrapper.properties')); const result = kit.run(); assert.equal(result.status, 1); assert.match(result.stdout, /Missing kit file:.*maven-wrapper.properties/); }
  finally { kit.cleanup(); }
});
for (const metadata of ['kitVersion=0.5.4\nextensionId=zero.zero\n', 'kitVersion=0.5.4\nextensionId=zero.zero\nvscodeMinimum=unknown\n', 'kitVersion=0.5.4\nextensionId=zero.zero\nvscodeMinimum=1.95.0\nvscodeMinimum=1.95.0\n']) test('invalid minimum metadata fails closed: ' + JSON.stringify(metadata), () => {
  const kit = fixture({metadata});
  try { const result = kit.run(); assert.equal(result.status, 1); assert.match(result.stdout, /metadata missing or invalid/); }
  finally { kit.cleanup(); }
});
for (const [name, brew, input, expected, forbidden] of [
  ['old managed Code upgrades', 'outdated', '1\ny\n0\n', /brew upgrade --cask visual-studio-code/, /brew install/],
  ['missing managed package installs', 'missing', '1\ny\n0\n', /brew install --cask visual-studio-code/, /brew upgrade/],
  ['current managed package needs configuration', 'current', '1\n0\n', /already has visual-studio-code current/, /brew (install|upgrade)/],
  ['cancelled upgrade performs no mutation', 'outdated', '1\nn\nn\n0\n', /Proposed command: brew upgrade/, /brew (install|upgrade)/],
  ['failed manager inventory performs no mutation', 'inventoryFailure', '1\n0\n', /Could not read Homebrew inventory/, /brew (outdated|install|upgrade)/],
  ['failed update inventory performs no mutation', 'outdatedFailure', '1\n0\n', /Could not verify package update status/, /brew (install|upgrade)/],
  ['unrelated outdated casks do not upgrade selected package', 'unrelated', '1\n0\n', /already has visual-studio-code current/, /brew (install|upgrade)/],
  ['failed upgrade reports exit code and rechecks', 'upgradeFailure', '1\ny\n0\n', /Homebrew finished with exit code 42/, /brew install/],
  ['failed install reports exit code and rechecks', 'installFailure', '1\ny\n0\n', /Homebrew finished with exit code 43/, /brew upgrade/],
]) test(name, () => {
  const kit = fixture({mac: true, interactive: true, codeVersion: '1.90.0', brew});
  try {
    const result = kit.run(input), commands = readFileSync(kit.log, 'utf8');
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + '\n' + commands, expected); assert.doesNotMatch(commands, forbidden);
    if (input.includes('\ny\n')) assert.match(result.stdout, /Homebrew finished.*Zero setup check/s);
  } finally { kit.cleanup(); }
});
test('read-only checks never query or change managed old packages', () => {
  const kit = fixture({mac: true, codeVersion: '1.90.0', brew: 'outdated'});
  try { assert.equal(kit.run().status, 1); assert.doesNotMatch(readFileSync(kit.log, 'utf8'), /brew /); }
  finally { kit.cleanup(); }
});
test('old managed Git uses unnamed formula inventory and fixed optional upgrade', () => {
  const kit = fixture({mac: true, interactive: true, gitVersion: '2.30.0', brew: 'outdated'});
  try {
    const result = kit.run('3\ny\n0\n'), commands = readFileSync(kit.log, 'utf8');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(commands, /brew outdated --quiet --formula\n/);
    assert.match(commands, /brew upgrade --formula git\n/);
    assert.doesNotMatch(commands, /--greedy|brew install/);
    assert.match(result.stdout, /Homebrew finished.*Zero setup check/s);
  } finally { kit.cleanup(); }
});
test('valid tools and invalid explicit JAVA_HOME never trigger package repair', () => {
  const kit = fixture({mac: true, interactive: true, invalidHome: true, brew: 'outdated'});
  try { const result = kit.run('1\n2\n3\n0\n'); assert.match(result.stdout, /JAVA_HOME selects/); assert.doesNotMatch(readFileSync(kit.log, 'utf8'), /brew /); }
  finally { kit.cleanup(); }
});

for (const [name, options, fields] of [
  ['native check compatible tools with optional Git absent', {git: false}, /ready=1/],
  ['native check explicit invalid JAVA_HOME', {invalidHome: true}, /javaHomeBlocked=1/],
  ['native check absent profile', {profile: false}, /profile=0/],
  ['native check old Zero', {extension: '0.5.3'}, /zero=0/],
]) test(name, () => {
  const kit = fixture(options);
  try {
    const result = kit.runArgs(['--native-check']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /ZERO_SETUP_V1\n[\s\S]*\nEND_ZERO_SETUP\n$/);
    assert.match(result.stdout, fields);
    assert.doesNotMatch(readFileSync(kit.log, 'utf8'), /install|new-window|brew /);
  } finally { kit.cleanup(); }
});
for (const args of [
  ['--native-install', 'code', 'install'],
  ['--native-install', 'git', 'install', '--approved'],
  ['--native-extension', 'java'],
  ['--native-extension', 'unknown', '--approved'],
  ['--native-open', 'extra'],
  ['--native-profile', 'extra'],
]) test('native action rejects invalid/unapproved arguments: ' + args.join(' '), () => {
  const kit = fixture();
  try { assert.equal(kit.runArgs(args).status, 2); assert.doesNotMatch(readFileSync(kit.log, 'utf8'), /install|new-window/); }
  finally { kit.cleanup(); }
});
for (const [name, options, expected] of [
  ['compatible Code skips system-tool change', {mac: true, brew: 'outdated'}, 'skip'],
  ['broken JAVA_HOME is blocked without inventory', {mac: true, invalidHome: true, brew: 'outdated'}, 'blocked'],
  ['fresh Mac without Homebrew returns successful manual plan', {mac: true, code: false, noBrew: true}, 'manual'],
  ['missing package returns manual plan', {mac: true, codeVersion: '1.90.0', brew: 'missing'}, 'manual'],
  ['outdated package returns manual plan', {mac: true, codeVersion: '1.90.0', brew: 'outdated'}, 'manual'],
  ['current incompatible package returns manual plan', {mac: true, codeVersion: '1.90.0', brew: 'current'}, 'manual'],
  ['failed inventory cannot turn manual plan into retry', {mac: true, codeVersion: '1.90.0', brew: 'inventoryFailure'}, 'manual'],
  ['failed outdated query cannot turn manual plan into retry', {mac: true, codeVersion: '1.90.0', brew: 'outdatedFailure'}, 'manual'],
  ['nonwritable app directory cannot affect manual plan', {mac: true, codeVersion: '1.90.0', nonWritableApps: true}, 'manual'],
]) test(name, () => {
  const kit = fixture(options);
  try {
    const tool = options.invalidHome ? 'java' : 'code', result = kit.runArgs(['--native-plan', tool]);
    assert.equal(result.status, 0, result.stdout + result.stderr); assert.match(result.stdout, new RegExp('action=' + expected));
    assert.doesNotMatch(readFileSync(kit.log, 'utf8'), /brew |new-window|install-extension/);
  } finally { kit.cleanup(); }
});
for (const options of [{brew: 'missing'}, {brew: 'outdated'}, {brew: 'current'}, {noBrew: true}]) test('native background installation is always rejected: ' + JSON.stringify(options), () => {
  const kit = fixture({mac: true, codeVersion: '1.90.0', ...options});
  try {
    for (const operation of ['install', 'upgrade']) assert.equal(kit.runArgs(['--native-install', 'code', operation, '--approved']).status, 2);
    assert.doesNotMatch(readFileSync(kit.log, 'utf8'), /brew |install-extension|new-window/);
  } finally { kit.cleanup(); }
});
test('compatible native extensions skipped in exact Zero profile', () => {
  const kit = fixture();
  try { for (const target of ['zero', 'java']) assert.equal(kit.runArgs(['--native-extension', target, '--approved']).status, 0); assert.doesNotMatch(readFileSync(kit.log, 'utf8'), /install-extension/); }
  finally { kit.cleanup(); }
});
test('native extension installation failure remains truthful and profile scoped', () => {
  const kit = fixture({extension: '0.5.3', allowMutation: true, installExit: 44});
  try { const result = kit.runArgs(['--native-extension', 'zero', '--approved']); assert.equal(result.status, 44, result.stdout); assert.match(readFileSync(kit.log, 'utf8'), /--profile Zero --install-extension .*zero-0.5.4.vsix/); assert.doesNotMatch(readFileSync(kit.log, 'utf8'), /--force|--new-window/); }
  finally { kit.cleanup(); }
});
test('native profile handoff preserves existing profile and deliberately opens absent one', () => {
  for (const profile of [true, false]) {
    const kit = fixture({profile, allowMutation: true});
    try { const result = kit.runArgs(['--native-profile']); assert.equal(result.status, 0); const commands = readFileSync(kit.log, 'utf8'); if (profile) assert.doesNotMatch(commands, /new-window/); else assert.match(commands, /\n--new-window\n/); assert.doesNotMatch(commands, /--new-window --profile|--install-extension/); }
    finally { kit.cleanup(); }
  }
});
test('native open rechecks readiness and Git remains optional', () => {
  for (const ready of [true, false]) {
    const kit = fixture({git: false, extension: ready ? '0.5.4' : '0.5.3', allowMutation: true});
    try { const result = kit.runArgs(['--native-open']); assert.equal(result.status, ready ? 0 : 1, result.stdout); const commands = readFileSync(kit.log, 'utf8'); if (ready) { assert.match(commands, /--new-window --profile Zero\n/); assert.equal(readFileSync(kit.log + '.kit', 'utf8').trim(), kit.root); assert.doesNotMatch(commands, /--new-window[^\n]*starter/); } else assert.doesNotMatch(commands, /new-window/); }
    finally { kit.cleanup(); }
  }
});

test('fresh Mac missing Java returns successful manual vendor plan', () => {
  const kit = fixture({mac: true, noHome: true, javaPathMissing: true, noBrew: true});
  try {
    const result = kit.runArgs(['--native-plan', 'java']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /action=manual/);
    assert.doesNotMatch(readFileSync(kit.log, 'utf8'), /brew |install|new-window/);
  } finally { kit.cleanup(); }
});

test('manual setup opens Zero without a bundled project path', () => {
  const source = readFileSync(new URL('../setup.sh', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /"\$CODE" --new-window[^\n]*"\$STARTER"/);
  assert.match(source, /7 Open Zero/);
});
