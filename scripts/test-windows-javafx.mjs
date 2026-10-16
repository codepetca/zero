// Maintainer-only Node 22 companion to test-windows-installation.ps1.
import {promises as fs, createWriteStream} from 'node:fs';
import {spawn, spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {processSpecification} from './process-specification.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async filename => JSON.parse((await fs.readFile(filename, 'utf8')).replace(/^\uFEFF/, ''));
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export function validateReceipts(installation, build) {
  const assets = build.artifacts?.filter(asset => asset.platform === 'windows' && asset.kind === 'installer');
  requireValue(build.schema === 1 && /^\d+\.\d+\.\d+$/.test(build.kitVersion) && /^[a-f0-9]{40}$/.test(build.sourceRevision) && assets?.length === 1,
    'Invalid measured Windows build receipt.');
  const asset = assets[0];
  requireValue(asset.filename === `Zero-Setup-${build.kitVersion}-windows-development.exe` && asset.velopackVersion === '1.2.161' &&
    asset.updaterEnabled === false && asset.authenticodeSigned === false && /^[a-f0-9]{64}$/.test(asset.sha256) && Number.isSafeInteger(asset.size) && asset.size > 0,
  'Use the pinned unsigned development candidate with updating disabled.');
  requireValue(installation.schema === 1 && installation.status === 'passed' && installation.stage === 'passed-development-installation-smoke' &&
    installation.version === build.kitVersion && installation.sourceRevision === build.sourceRevision && installation.setupSha256 === asset.sha256 &&
    Number.isFinite(Date.parse(installation.finishedUtc)) && ['private-java-and-installed-support', 'reopen-from-start-shortcut', 'passed-development-installation-smoke']
      .every(name => installation.events?.some(event => event.name === name)),
  'A passing installation/reopening receipt for this exact candidate is required.');
  return asset;
}

export function privateJavaPath(settings, data, jdkHash, paths = path) {
  requireValue(/^[a-f0-9]{64}$/.test(jdkHash), 'Invalid private Java asset identity.');
  const runtimes = settings['java.configuration.runtimes']?.filter(runtime => runtime.name === 'JavaSE-21' && runtime.default === true);
  const expected = paths.join(data, 'runtime', `jdk-${jdkHash}`);
  requireValue(runtimes?.length === 1 && typeof runtimes[0].path === 'string' &&
    paths.resolve(runtimes[0].path).toLowerCase() === paths.resolve(expected).toLowerCase(),
  'The isolated editor must select the exact pinned private Java root.');
  return expected;
}

export function trialEnvironment(ambient, java, output, phase, nonce, paths = path) {
  const env = {};
  // Neither wrapper overrides, ambient Java agents/options nor user Maven settings
  // participate. The same private caches are reused for the offline run.
  for (const [key, value] of Object.entries(ambient)) {
    if (/^(?:PATH|JAVA_HOME|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS|JAVA_OPTIONS|MAVEN_.*|M2_HOME|MVNW_.*|__MVNW_.*|CLASSPATH|JDK_HOME|JAVACMD|TEMP|TMP|ZERO_WINDOWS_JAVAFX_.*)$/i.test(key)) continue;
    env[key] = value;
  }
  env.JAVA_HOME = java;
  env.PATH = `${paths.join(java, 'bin')};${Object.entries(ambient).find(([key]) => key.toUpperCase() === 'PATH')?.[1] || ''}`;
  env.MAVEN_USER_HOME = paths.join(output, 'maven user home');
  env.MAVEN_OPTS = `-Duser.home="${paths.join(output, 'java user home')}"`;
  // javafx:run forks a JVM; scope its native-library cache and temp files too.
  env.JAVA_TOOL_OPTIONS = `${env.MAVEN_OPTS} -Djava.io.tmpdir="${paths.join(output, 'temp')}"`;
  env.TEMP = env.TMP = paths.join(output, 'temp');
  env.ZERO_WINDOWS_JAVAFX_MARKER = paths.join(output, `${phase}-marker.json`);
  env.ZERO_WINDOWS_JAVAFX_NONCE = nonce;
  return env;
}

export const smokeSource = `import javafx.animation.PauseTransition;
import javafx.application.Platform;
import javafx.scene.control.Label;
import javafx.scene.layout.BorderPane;
import javafx.stage.Stage;
import javafx.util.Duration;
import java.nio.file.Files;
import java.nio.file.Path;
import zero.App;

public class WindowsJavaFxSmoke extends App {
    private Label message;
    public void settings() { title("Zero Windows JavaFX trial"); size(480, 200); }
    public void setup() { message = new Label("First ordinary Java label"); show(message); }
    protected void ready(Stage stage) {
        later(() -> {
            check(stage.isShowing() && message.getScene() == stage.getScene(), "Window was not shown");
            message.setText("Edited ordinary Java label");
            show(message);
            later(() -> {
                check(stage.isShowing() && stage.getWidth() > 0 && stage.getHeight() > 0, "Window disappeared");
                check(message.getText().equals("Edited ordinary Java label"), "Label update failed");
                check(((BorderPane) stage.getScene().getRoot()).getCenter() == message, "show did not retain the label");
                stage.close();
                check(!stage.isShowing(), "Window did not close");
                try {
                    String nonce = System.getenv("ZERO_WINDOWS_JAVAFX_NONCE");
                    Files.writeString(Path.of(System.getenv("ZERO_WINDOWS_JAVAFX_MARKER")),
                        "{\\"nonce\\":\\"" + nonce + "\\",\\"windowShown\\":true,\\"labelUpdated\\":true,\\"windowClosed\\":true}");
                } catch (Exception failure) { throw new RuntimeException(failure); }
                Platform.exit();
            });
        });
    }
    private void later(Runnable action) {
        PauseTransition wait = new PauseTransition(Duration.millis(700));
        wait.setOnFinished(event -> {
            try { action.run(); }
            catch (Throwable failure) { failure.printStackTrace(); System.exit(1); }
        });
        wait.play();
    }
    private void check(boolean condition, String message) { if (!condition) throw new IllegalStateException(message); }
    public static void main(String[] args) { launch(args); }
}
`;

async function noLinks(filename) {
  // Refuse junctions and symbolic links, including ancestors, before reading or copying.
  let cursor = path.resolve(filename);
  while (true) {
    requireValue(!(await fs.lstat(cursor)).isSymbolicLink(), 'Trial paths must not contain links or junctions.');
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

async function copyStarter(source, destination) {
  await noLinks(source);
  await fs.cp(source, destination, {recursive:true, errorOnExist:true, force:false, filter:async filename => {
    requireValue(!(await fs.lstat(filename)).isSymbolicLink(), 'The installed starter contains a link or junction.');
    return !['.git', 'target'].includes(path.basename(filename));
  }});
}

async function runMaven(project, args, env, log, timeoutMs) {
  const spec = processSpecification(path.join(project, 'mvnw.cmd'), args);
  const output = createWriteStream(log, {flags:'wx'});
  await new Promise((resolve, reject) => { output.once('open', resolve); output.once('error', reject); });
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {cwd:project, env, windowsHide:false, windowsVerbatimArguments:spec.windowsVerbatimArguments, stdio:['ignore', 'pipe', 'pipe']});
      let bytes = 0, failure;
      function stop(message) {
        if (failure) return;
        failure = new Error(message);
        // Only the still-running root created by this invocation and its children.
        // Never terminate by executable name or target an unrelated editor/Java.
        if (child.pid && child.exitCode === null && child.signalCode === null) {
          const killed = spawnSync(path.join(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows', 'System32', 'taskkill.exe'),
            ['/PID', String(child.pid), '/T', '/F'], {windowsHide:true, timeout:10000, stdio:'ignore'});
          if (killed.error || killed.status !== 0) failure = new Error(`${message} Scoped process cleanup failed; discard the disposable VM/account.`);
        }
        child.stdout.destroy(); child.stderr.destroy();
        finish(failure);
      }
      const timer = setTimeout(() => stop('Maven/JavaFX exceeded the bounded trial budget.'), timeoutMs);
      function finish(error) { clearTimeout(timer); error ? reject(error) : resolve(); }
      const record = chunk => {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024) { stop('Maven/JavaFX exceeded its private log limit.'); return; }
        output.write(chunk);
      };
      child.stdout.on('data', record); child.stderr.on('data', record);
      child.once('error', error => { failure = new Error(`Could not start the trial subprocess (${error.code || 'unknown'}).`); finish(failure); });
      child.once('close', code => finish(failure || (code === 0 ? undefined : new Error(`Maven/JavaFX exited with code ${code}. Inspect the private log.`))));
      output.once('error', () => stop('Could not write the private Maven/JavaFX log.'));
    });
  } finally { await new Promise(resolve => output.end(resolve)); }
}

export async function main(args = process.argv.slice(2)) {
  requireValue(process.platform === 'win32' && process.arch === 'x64', 'This real smoke test requires disposable Intel/AMD x64 Windows.');
  requireValue(Number(process.versions.node.split('.')[0]) >= 22, 'Maintainer automation requires Node.js 22+. Students need no Node.js.');
  const options = {installationReceipt:path.join(root, '.verification/windows-installation/report.json'), buildReceipt:path.join(root, 'dist/installers/build-windows.json'), output:path.join(root, '.verification/windows-javafx')};
  const names = {'--installation-receipt':'installationReceipt', '--build-receipt':'buildReceipt', '--output':'output'};
  let disposable = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--disposable-account') { disposable = true; continue; }
    requireValue(names[args[i]] && args[i + 1] && !args[i + 1].startsWith('--'), 'Use --disposable-account [--installation-receipt path] [--build-receipt path] [--output new-path].');
    options[names[args[i]]] = path.resolve(args[++i]);
  }
  requireValue(disposable, 'Explicit --disposable-account is required; this opens real JavaFX windows.');
  requireValue(process.env.LOCALAPPDATA && process.env.USERPROFILE, 'Windows account folders are unavailable.');
  const data = path.join(process.env.LOCALAPPDATA, 'ZeroData'), kit = path.join(process.env.USERPROFILE, 'Zero');
  const output = path.resolve(options.output);
  await noLinks(path.dirname(output));
  await fs.mkdir(output); // Refuse reuse, even after a failed run.
  const started = Date.now();
  const report = {schema:1, startedUtc:new Date(started).toISOString(), status:'failed', stage:'validate-installation',
    automaticJavaFxTested:false, offlineJavaFxTested:false, interactiveRunAppTested:false, signedUpdateTested:false, nativeWindowsTested:false};
  try {
    await noLinks(options.installationReceipt); await noLinks(options.buildReceipt);
    const installation = await readJson(options.installationReceipt), build = await readJson(options.buildReceipt);
    const asset = validateReceipts(installation, build);
    const setup = path.join(path.dirname(options.buildReceipt), asset.filename);
    await noLinks(setup);
    const setupBytes = await fs.readFile(setup);
    requireValue(setupBytes.length === asset.size && sha256(setupBytes) === asset.sha256, 'Setup bytes differ from the installation candidate.');
    Object.assign(report, {version:build.kitVersion, sourceRevision:build.sourceRevision, setupSha256:asset.sha256, osVersion:installation.osVersion});
    await noLinks(kit); await noLinks(data);
    const properties = await fs.readFile(path.join(kit, 'setup/kit.properties'), 'utf8');
    requireValue(properties.split(/\r?\n/).includes(`kitVersion=${build.kitVersion}`), 'The placed kit version differs from the candidate.');
    const settingsFile = path.join(data, 'editor/user-data/User/settings.json');
    await noLinks(settingsFile);
    const pins = await readJson(path.join(root, 'setup/windows-downloads.json'));
    const java = privateJavaPath(await readJson(settingsFile), data, pins.architectures.x64.jdk.sha256);
    for (const filename of [java, path.join(java, 'bin/java.exe'), path.join(java, 'bin/javac.exe'), path.join(java, '.zero-asset.sha256')]) await noLinks(filename);
    requireValue((await fs.readFile(path.join(java, '.zero-asset.sha256'), 'utf8')).trim() === pins.architectures.x64.jdk.sha256, 'The private Java marker differs from its pin.');
    report.privateJavaAssetSha256 = pins.architectures.x64.jdk.sha256;
    report.stage = 'copy-installed-starter';
    const project = path.join(output, 'installed starter with spaces');
    requireValue(!project.includes("'"), 'Use a trial output path without apostrophes for the pinned Maven batch wrapper.');
    await copyStarter(path.join(kit, 'starter'), project);
    for (const relative of ['pom.xml', 'mvnw.cmd', '.mvn/wrapper/maven-wrapper.properties']) {
      requireValue((await fs.readFile(path.join(project, relative))).equals(await fs.readFile(path.join(root, 'student-template', relative))), 'The installed starter build pins differ from the reviewed checkout.');
    }
    for (const relative of ['.mvn/maven.config', '.mvn/jvm.config', '.mvn/extensions.xml']) {
      await fs.access(path.join(project, relative)).then(() => { throw new Error('Unexpected Maven override in the installed starter.'); }, error => { if (error.code !== 'ENOENT') throw error; });
    }
    await fs.writeFile(path.join(project, 'src/main/java/WindowsJavaFxSmoke.java'), smokeSource, {flag:'wx'});
    const settings = path.join(output, 'maven-settings.xml');
    await fs.writeFile(settings, '<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"/>\n', {flag:'wx'});
    const nonce = randomUUID();
    for (const phase of ['online', 'offline']) {
      report.stage = `${phase}-clean-compile-javafx`;
      console.log(`Windows JavaFX trial: ${report.stage}`);
      const env = trialEnvironment(process.env, java, output, phase, nonce);
      for (const directory of [env.MAVEN_USER_HOME, env.TEMP, path.join(output, 'java user home')]) await fs.mkdir(directory, {recursive:true});
      const mavenArgs = ['-B', '-ntp', '-s', settings, '-gs', settings, `-Dmaven.repo.local=${path.join(output, 'maven repository')}`,
        `-Djavafx.executable=${path.join(java, 'bin/java.exe')}`, '-Dapp.mainClass=WindowsJavaFxSmoke', ...(phase === 'offline' ? ['-o'] : []), 'clean', 'compile', 'javafx:run'];
      await runMaven(project, mavenArgs, env, path.join(output, `${phase}-maven.log`), phase === 'online' ? 480000 : 120000);
      const marker = await readJson(env.ZERO_WINDOWS_JAVAFX_MARKER);
      requireValue(marker.nonce === nonce && marker.windowShown === true && marker.labelUpdated === true && marker.windowClosed === true,
        'JavaFX did not confirm its shown window, ordinary label update and automatic close.');
      if (phase === 'online') report.automaticJavaFxTested = true;
      else report.offlineJavaFxTested = true;
    }
    report.status = 'passed'; report.stage = 'passed-development-javafx-smoke';
  } catch (error) {
    // Raw compiler/Java output stays in private bounded logs, never this receipt.
    let message = String(error.message);
    for (const privatePath of [process.env.USERPROFILE, process.env.LOCALAPPDATA, root.replace(/[\\/]$/, ''), output].filter(Boolean).sort((a,b) => b.length - a.length)) {
      message = message.split(privatePath).join('<trial-path>');
    }
    report.error = message.slice(0, 1000);
  } finally {
    report.finishedUtc = new Date().toISOString(); report.elapsedSeconds = Math.round((Date.now() - started) / 100) / 10;
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag:'wx'});
  }
  requireValue(report.status === 'passed', `Windows JavaFX smoke failed during ${report.stage}. See report.json and the private Maven logs.`);
  console.log('Windows JavaFX trial passed: automatic online/offline windows; interactive Run App and signing remain separate.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
