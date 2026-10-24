import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { verifyWebProfiles } from './web-profiles.mjs';
const require = createRequire(import.meta.url);
const { exportForWeb } = require('../extension/src/web-export');
const { prepareArtifacts } = require('../extension/src/web-export/compatibility');
const { createWebPreview } = require('../extension/src/web-preview');
const root = fileURLToPath(new URL('../', import.meta.url));
const outputIndex = process.argv.indexOf('--output');
const base = outputIndex >= 0 ? path.resolve(process.argv[outputIndex + 1]) : path.join(root, '.verification/web-export-checks');
const mobileOnly = process.argv.includes('--mobile-only');
const browserOnly = mobileOnly || process.argv.includes('--browser-only');
const browser = browserOnly || process.argv.includes('--browser');
const cacheIndex = process.argv.indexOf('--cache');
const cacheRoot =
  cacheIndex >= 0
    ? path.resolve(process.argv[cacheIndex + 1])
    : path.join(base, 'cache');
verifyWebProfiles();
await fs.mkdir(base, { recursive: true });
if (!browserOnly) {
  // Run the browser's math/list assertions unchanged on the native JDK too.
  const nativeRoot = path.join(base, 'native-game-api');
  await fs.mkdir(nativeRoot, { recursive: true });
  const nativeClasspath = [nativeRoot, ...await prepareArtifacts(cacheRoot)].join(path.delimiter);
  const probe = path.join(nativeRoot, 'NativeGameApiProbe.java');
  await fs.writeFile(probe, `import javafx.scene.paint.Color;
class NativeGameApiProbe {
  public static void main(String[] args) {
    Color rgb = Color.rgb(17, 99, 203);
    if (Math.abs(rgb.getRed() - 17 / 255.0) > 1e-7 || Math.abs(rgb.getGreen() - 99 / 255.0) > 1e-7
        || Math.abs(rgb.getBlue() - 203 / 255.0) > 1e-7 || rgb.getOpacity() != 1) throw new AssertionError("Native RGB channels");
    boolean invalidRgb = false;
    try { Color.rgb(256, 0, 0); } catch (IllegalArgumentException expected) { invalidRgb = true; }
    if (!invalidRgb) throw new AssertionError("Native RGB range validation");
    System.out.println(GameApiChecks.verify(3, 4, "pha"));
  }
}
`);
  const javaBin = name => process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
  for (const [name, args] of [
    ['javac', ['--release', '17', '-cp', nativeClasspath, '-d', nativeRoot, path.join(root, 'framework/web-checks/GameApiChecks.java'), probe]],
    ['java', ['-cp', nativeClasspath, 'NativeGameApiProbe']]
  ]) {
    const result = spawnSync(javaBin(name), args, {encoding: 'utf8', timeout: 30000});
    if (result.status !== 0) throw new Error('Native game API parity failed: ' + result.stdout + result.stderr);
    if (name === 'java' && result.stdout.trim() !== 'Game API checks ready') throw new Error('Native game API parity probe did not finish.');
  }
  console.log('Native JDK game math, collection and JavaFX RGB semantics passed.');
}
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}
function png() {
  const chunk = (type, bytes) => {
    const name = Buffer.from(type),
      size = Buffer.alloc(4),
      crc = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    crc.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
    return Buffer.concat([size, name, bytes, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(24, 0);
  header.writeUInt32BE(24, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(24 * (1 + 24 * 4));
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const at = y * 97 + 1 + x * 4;
      const color = [
        [240, 90, 40],
        [40, 120, 240],
        [80, 200, 80],
        [200, 80, 220]
      ][(y >= 12 ? 2 : 0) + (x >= 12 ? 1 : 0)];
      pixels.set([...color, 255], at);
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
async function copyJavaSources(source, destination) {
  await fs.mkdir(destination, {recursive:true});
  for (const entry of await fs.readdir(source, {withFileTypes:true})) {
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyJavaSources(from, to);
    else if (entry.isFile() && entry.name.endsWith('.java')) await fs.copyFile(from, to);
  }
}
async function fixture(name, example) {
  const directory = path.join(base, 'projects', name);
  await fs.mkdir(path.join(directory, 'src/main/java/zero'), {
    recursive: true
  });
  if (name === 'helpers')
    await fs.copyFile(path.join(root, 'framework/web-checks/GameApiChecks.java'), path.join(directory, 'src/main/java/GameApiChecks.java'));
  await copyJavaSources(path.join(root, 'framework/src/main/java/zero'), path.join(directory, 'src/main/java/zero'));
  for (const filename of ['mvnw', 'mvnw.cmd', 'pom.xml', 'zero.json'])
    await fs.copyFile(
      path.join(root, 'student-template', filename),
      path.join(directory, filename)
    );
  await fs.cp(
    path.join(root, 'student-template/.mvn'),
    path.join(directory, '.mvn'),
    { recursive: true }
  );
  await fs.chmod(path.join(directory, 'mvnw'), 0o755);
  if (['counter','coin-game'].includes(name)) {
    await copyJavaSources(path.join(root, 'framework/prototypes', name), path.join(directory, 'src/main/java'));
    const sharedDirectory = path.join(root, 'framework/prototypes/shared');
    const sharedNames = ['BarScoreDisplay.java', 'ScoreDisplay.java', 'ScoreView.java'];
    const actualNames = (await fs.readdir(sharedDirectory)).filter(name => name.endsWith('.java')).sort();
    if (actualNames.join(',') !== sharedNames.join(',')) throw new Error('Review the complete shared score source inventory before exporting prototypes.');
    for (const filename of sharedNames) {
      const shared = await fs.readFile(path.join(sharedDirectory, filename));
      const destination = path.join(directory, 'src/main/java', filename);
      await fs.writeFile(destination, shared);
      if (!(await fs.readFile(destination)).equals(shared)) throw new Error('Shared score source bytes differ: ' + filename);
    }
  } else if (name === 'zero-ui') {
    await fs.copyFile(path.join(root, 'framework/web-checks/navigation/Main.java'), path.join(directory, 'src/main/java/Main.java'));
  } else if (name === 'mobile') {
    await fs.copyFile(path.join(root, 'framework/web-checks/mobile/Main.java'), path.join(directory, 'src/main/java/Main.java'));
  } else if (name === 'audio') {
    await fs.copyFile(path.join(root, 'framework/web-checks/audio/Main.java'), path.join(directory, 'src/main/java/Main.java'));
    await fs.mkdir(path.join(directory, 'src/main/resources/audio'), { recursive: true });
    const frames = 44100, wav = Buffer.alloc(44 + frames * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
    for (let i = 0; i < frames; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 330 / 44100) * 1200), 44 + i * 2);
    await fs.writeFile(path.join(directory, 'src/main/resources/audio/tone.wav'), wav);
    await fs.writeFile(path.join(directory, 'src/main/resources/audio/broken.wav'), 'Invalid audio fixture');
  } else if (example)
    await fs.copyFile(
      path.join(root, 'student-template/examples', example, 'Main.java'),
      path.join(directory, 'src/main/java/Main.java')
    );
  else {
    await fs.copyFile(
      path.join(root, 'framework/web-checks/Main.java'),
      path.join(directory, 'src/main/java/Main.java')
    );
    await fs.mkdir(path.join(directory, 'src/main/resources'), {
      recursive: true
    });
    await fs.writeFile(
      path.join(directory, 'src/main/resources/tiles.png'),
      png()
    );
    await fs.copyFile(
      path.join(directory, 'src/main/resources/tiles.png'),
      path.join(directory, 'src/main/resources/late-image.png')
    );
  }
  if (example === 'quiz')
    await fs.copyFile(
      path.join(root, 'student-template/examples/shared/ScoreDisplay.java'),
      path.join(directory, 'src/main/java/ScoreDisplay.java')
    );
  if (example === 'hello-app') {
    const mainFile=path.join(directory,'src/main/java/Main.java');
    const mainSource=await fs.readFile(mainFile,'utf8');
    // Add a separate cross-file resource URL probe to the ordinary greeting.
    // The canonical greeting itself uses only supported JavaFX controls; this
    // fixture does not substitute unsupported application APIs.
    if (!mainSource.includes('show(screen);')) throw new Error('Greeting probe source changed; review its resource probe placement.');
    await fs.writeFile(mainFile,mainSource.replace('show(screen);',
      'show(new VBox(16, screen, new Label("Resource: " + new AppResources().theme().toExternalForm())));'));
    await fs.writeFile(path.join(directory,'src/main/java/AppResources.java'),'import java.net.URL;\nclass AppResources { ResourceURL own = new ResourceURL(); URL theme() { var resource = getClass().getResource("/hello-app/theme.css"); return pass(resource); } URL pass(URL resource) { return resource; } }\n');
    await fs.writeFile(path.join(directory,'src/main/java/ResourceURL.java'),'class ResourceURL {}\n');
    await fs.mkdir(path.join(directory, 'src/main/resources/hello-app'), {recursive: true});
    await fs.copyFile(path.join(root, 'student-template/examples/hello-app/theme.css'), path.join(directory, 'src/main/resources/hello-app/theme.css'));
  }
  return directory;
}
const results = browserOnly
  ? JSON.parse(await fs.readFile(path.join(base, 'builds.json'), 'utf8'))
  : [];
if (!browserOnly)
  for (const [name, example] of [
    ['helpers', null],
    ['quiz', 'quiz'],
    ['drawing', 'drawing'],
    ['audio', null],
    ['hello', 'hello-app'],
    ['mobile', null],
    ['zero-ui', null],
    ['counter', null],
    ['coin-game', null]
  ]) {
    const project = await fixture(name, example);
    const result = await exportForWeb({
      projectRoot: project,
      cacheRoot,
      onProgress: (message) => console.log(name + ': ' + message)
    });
    results.push({ name, ...result });
  }
if (!browserOnly)
  await fs.writeFile(
    path.join(base, 'builds.json'),
    JSON.stringify(results, null, 2) + '\n'
  );
if (
  results.length !== 9 ||
  ['helpers', 'quiz', 'drawing', 'audio', 'hello', 'mobile', 'zero-ui', 'counter', 'coin-game'].some(
    (name) => !results.some((result) => result.name === name)
  )
)
  throw new Error('Build all nine fixtures before using --browser-only or --mobile-only.');
if (browser) {
  const previews = [];
  try {
    for (const result of results)
      previews.push({
        name: result.name,
        ...(await createWebPreview(result.sitePath))
      });
    const urls = Object.fromEntries(
      previews.map((item) => [item.name, item.url])
    );
    const cli = path.join(
      root,
      'node_modules/@playwright/cli/playwright-cli.js'
    );
    const session = 'zero-web-ci-' + process.pid;
    const command = (args) => {
      const p = spawnSync(
        process.execPath,
        [cli, '--session', session, ...args],
        {
          cwd: root,
          encoding: 'utf8',
          env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
          maxBuffer: 2 * 1024 * 1024
        }
      );
      if (p.status !== 0 || p.stdout.includes('### Error'))
        throw Error(p.stdout + '\n' + p.stderr);
      return p.stdout;
    };
    // The parent serves previews, so run the CLI asynchronously while its HTTP loop remains responsive.
    const { spawn } = await import('node:child_process');
    const asyncCommand = (args) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [cli, '--session', session, ...args],
          { cwd: root, env: { ...process.env, NO_UPDATE_NOTIFIER: '1' } }
        );
        let text = '';
        child.stdout.on('data', (c) => {
          text += c;
        });
        child.stderr.on('data', (c) => {
          text += c;
        });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code !== 0 || text.includes('### Error')) reject(Error(text));
          else resolve(text);
        });
      });
    try {
      await asyncCommand(['open', urls.helpers, '--browser', 'chrome']);
      for (const [sourceName, receiptName] of [
        ...(!mobileOnly ? [['web-browser-checks.js', 'browser-checks.log']] : []),
        ['web-mobile-checks.js', 'mobile-browser-checks.log']
      ]) {
        const script = path.join(base, sourceName);
        const source = await fs.readFile(path.join(root, 'scripts', sourceName), 'utf8');
        await fs.writeFile(script, source.replace('__URLS__', JSON.stringify(urls))
          .replace('__ARTIFACT_ROOT__', JSON.stringify(base)).trim().replace(/;$/, ''));
        const receipt = await asyncCommand(['run-code', '--filename', script]);
        await fs.writeFile(path.join(base, receiptName), receipt);
        console.log(receipt.split('### Ran Playwright code')[0]);
      }
    } finally {
      command(['close']);
    }
  } finally {
    previews.forEach((item) => item.dispose());
  }
}
console.log('Real WebFX/GWT exports passed for helpers, quiz, drawing, audio, greeting controls with cross-file resource URLs, portrait mobile controls, Zero UI, counter and coin-game.');
