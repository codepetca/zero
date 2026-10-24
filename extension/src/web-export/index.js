'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const https = require('node:https');
const { spawn } = require('node:child_process');
const { acquireBuildLock } = require('./build-lock');
const { generateProject } = require('./project');
const { zipFiles } = require('./zip');
const { assertSelectedBuilder, captureBuildInputs, buildProfileHash, boundSourceHash } = require('./snapshot');
const { resolveLibrarySources, assertApplicationNamespaces } = require('./libraries');
const { prepareMavenDistribution, verifyMavenDistribution } = require('./compatibility/maven-distribution');
const { checkCompatibility, validateDependencies, verifyArtifactInventory, validateWrapperInputs } = require('./compatibility');
const toolchain = require('./toolchain-lock.json');
const { createReadStream } = require('node:fs');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const inside = (root, target) =>
  target === root || target.startsWith(root + path.sep);
const abort = (signal) => {
  if (signal?.aborted) {
    const e = new Error('Web export cancelled.');
    e.name = 'AbortError';
    throw e;
  }
};
async function exists(file) {
  try {
    return await fs.lstat(file);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
function processSpecification(command, args, platform = process.platform) {
  if (platform !== 'win32') return { command, args };
  const values = [command, ...args];
  if (values.some((value) => /["&|<>^%!\r\n]/.test(value)))
    throw new Error(
      'Use a Windows project and cache path without shell control characters for web export.'
    );
  return {
    command: 'cmd.exe',
    args: [
      '/d',
      '/s',
      '/c',
      `"${values.map((value) => `"${value}"`).join(' ')}"`
    ]
  };
}
async function canonicalPath(file) {
  const full = path.resolve(file);
  if (await exists(full)) return fs.realpath(full);
  return path.join(
    await canonicalPath(path.dirname(full)),
    path.basename(full)
  );
}
async function noSymlinks(file) {
  const full = path.resolve(file);
  const parsed = path.parse(full);
  let current = parsed.root;
  for (const part of full.slice(parsed.root.length).split(path.sep)) {
    current = path.join(current, part);
    const stat = await exists(current);
    if (stat?.isSymbolicLink())
      throw new Error(`Web export refuses symbolic links: ${current}`);
  }
}
async function readTree(root, optional = false) {
  await noSymlinks(root);
  const stat = await exists(root);
  if (!stat) {
    if (optional) return [];
    throw new Error(`Missing source folder: ${root}`);
  }
  const files = [];
  async function walk(dir) {
    for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name)
    )) {
      const file = path.join(dir, item.name);
      if (item.isSymbolicLink())
        throw new Error(`Web export refuses symbolic links: ${file}`);
      if (item.isDirectory()) await walk(file);
      else if (item.isFile())
        files.push({
          path: path.relative(root, file).split(path.sep).join('/'),
          bytes: await fs.readFile(file)
        });
      else throw new Error(`Unsupported source file: ${file}`);
    }
  }
  await walk(root);
  return files;
}
function sourceDigest(files) {
  const hash = crypto.createHash('sha256');
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path)))
    hash.update(file.path).update('\0').update(file.bytes).update('\0');
  return hash.digest('hex');
}
async function artifactInventory(root) {
  const inventory = [];
  async function walk(dir) {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isSymbolicLink())
        throw new Error('Maven cache contains a symbolic link: ' + file);
      if (item.isDirectory()) await walk(file);
      else if (item.isFile() && /\.(jar|pom)$/.test(item.name)) {
        const hash = crypto.createHash('sha256');
        let bytes = 0;
        for await (const chunk of createReadStream(file)) {
          hash.update(chunk);
          bytes += chunk.length;
        }
        inventory.push({
          path: path.relative(root, file).split(path.sep).join('/'),
          sha256: hash.digest('hex'),
          bytes
        });
      }
    }
  }
  if (await exists(root)) await walk(root);
  return inventory.sort((a, b) => a.path.localeCompare(b.path));
}
function validateSite(siteFiles) {
  if (
    !siteFiles.some(
      (file) => file.path === 'index.html' && file.bytes.length
    ) ||
    !siteFiles.some(
      (file) => file.path === 'zero_web.nocache.js' && file.bytes.length
    ) ||
    !siteFiles.some(
      (file) => /\.cache\.js$/.test(file.path) && file.bytes.length
    )
  )
    throw new Error(
      'The browser compiler exited without a complete fresh app.'
    );
}
function get(url, signal, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        signal,
        timeout: 60000,
        headers: {
          'User-Agent': 'Zero-Web-Export/1.0',
          Accept: 'application/java-archive, application/octet-stream'
        }
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (redirects >= 5)
            return reject(new Error('Too many toolchain download redirects.'));
          const next = new URL(res.headers.location, url);
          if (next.protocol !== 'https:')
            return reject(new Error('Toolchain download requires HTTPS.'));
          return get(next.href, signal, redirects + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(
            new Error(
              `Toolchain download failed (HTTP ${res.statusCode}): ${url}`
            )
          );
        }
        let size = 0;
        const chunks = [];
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 50 * 1024 * 1024)
            req.destroy(
              new Error('Toolchain artifact exceeds download limit.')
            );
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.on('timeout', () =>
      req.destroy(new Error('Toolchain download timed out.'))
    );
  });
}
async function prepareArtifacts(root, signal, onProgress) {
  await noSymlinks(root);
  await fs.mkdir(root, { recursive: true });
  for (let i = 0; i < toolchain.webfx.length; i++) {
    abort(signal);
    const artifact = toolchain.webfx[i];
    const file = path.join(root, artifact.file);
    const stat = await exists(file);
    if (stat?.isSymbolicLink())
      throw new Error('Toolchain cache contains a symbolic link.');
    if (stat && sha(await fs.readFile(file)) === artifact.sha256) continue;
    onProgress(`Preparing web compiler (${i + 1}/${toolchain.webfx.length})`);
    const bytes = await get(artifact.url, signal);
    if (sha(bytes) !== artifact.sha256)
      throw new Error(`Web compiler checksum mismatch: ${artifact.artifactId}`);
    const temp = file + '.' + crypto.randomUUID() + '.tmp';
    await fs.writeFile(temp, bytes, { flag: 'wx' });
    await fs.rename(temp, file);
  }
}
function mapDiagnostics(log, sourceMap = {}) {
  let active;
  return log
    .split('\n')
    .map((line) => {
      if (line.includes("Errors in '")) {
        active = undefined;
        for (const [generated, entry] of Object.entries(sourceMap))
          if (line.includes('/' + generated + "'")) {
            active = entry;
            line = line.replace(
              '/' + generated + "'",
              '/' + entry.originalPath + "'"
            );
            break;
          }
      }
      if (active)
        line = line.replace(
          /Line (\d+):/g,
          (_, number) =>
            `Line ${Math.max(1, Number(number) - (active.lineOffset || 0))}:`
        );
      return line;
    })
    .join('\n');
}
async function runMaven({
  wrapper,
  projectRoot,
  buildRoot,
  cacheRoot,
  env,
  signal,
  onProgress,
  buildLock,
  inheritedProcessGroup = false
}) {
  await buildLock?.update({ phase: 'launching' });
  return new Promise((resolve, reject) => {
    abort(signal);
    const settings = path.join(buildRoot, 'settings.xml');
    const args = [
      '-B',
      '-ntp',
      '-s',
      settings,
      '-gs',
      settings,
      `-Dmaven.repo.local=${path.join(cacheRoot, 'repository')}`,
      '-f',
      path.join(buildRoot, 'pom.xml'),
      'package'
    ];
    const specification = processSpecification(wrapper, args);
    const childEnv = {
      ...process.env,
      ...env,
      MAVEN_USER_HOME: path.join(cacheRoot, 'maven-home'),
      MAVEN_SKIP_RC: 'true',
      MAVEN_ARGS: '',
      MAVEN_OPTS: '-Xmx2g',
      JAVA_TOOL_OPTIONS: '',
      JDK_JAVA_OPTIONS: '',
      _JAVA_OPTIONS: '',
      MVNW_REPOURL: '',
      MVNW_USERNAME: '',
      MVNW_PASSWORD: ''
    };
    const child = spawn(specification.command, specification.args, {
      cwd: buildRoot,
      env: childEnv,
      windowsHide: true,
      windowsVerbatimArguments: process.platform === 'win32',
      detached: process.platform !== 'win32' && !inheritedProcessGroup
    });
    if (child.pid) buildLock?.trackCompiler(child.pid);
    const registered = child.pid ? buildLock?.update({ phase: 'compiling', compilerPid: child.pid }) : undefined;
    // Register before settling: a crashed editor must not hide its detached group.
    registered?.catch(() => {});
    let output = '';
    let finished = false;
    let forceKillTimer;
    const onAbort = () => {
      if (finished) return;
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          windowsHide: true
        }).on('error', () => child.kill());
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
          forceKillTimer = setTimeout(() => {
            if (!finished) {
              try {
                process.kill(-child.pid, 'SIGKILL');
              } catch {
                child.kill('SIGKILL');
              }
            }
          }, 5000);
          forceKillTimer.unref();
        } catch {
          child.kill();
        }
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    const receive = (chunk) => {
      output += chunk.toString();
      if (output.length > 12 * 1024 * 1024)
        output = output.slice(-12 * 1024 * 1024);
      for (const line of chunk.toString().split(/\r?\n/))
        if (
          /Compiling module|Compiling permutation|BUILD SUCCESS|Downloading from/.test(
            line
          )
        )
          onProgress(line.replace(/^\[INFO\]\s*/, ''));
    };
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.on('error', (e) => {
      finished = true;
      clearTimeout(forceKillTimer);
      signal?.removeEventListener('abort', onAbort);
      Promise.resolve(registered).then(() => reject(e), reject);
    });
    child.on('close', (code, terminationSignal) => {
      finished = true;
      clearTimeout(forceKillTimer);
      signal?.removeEventListener('abort', onAbort);
      Promise.resolve(registered).then(() => resolve({ code, terminationSignal, output }), reject);
    });
  });
}
async function addIgnore(projectRoot) {
  const file = path.join(projectRoot, '.gitignore');
  await noSymlinks(file);
  const stat = await exists(file);
  if (stat && !stat.isFile())
    throw new Error('.gitignore must be an ordinary file.');
  const original = stat ? await fs.readFile(file, 'utf8') : '';
  if (!original.split(/\r?\n/).includes('/.zero/web-export/'))
    await fs.writeFile(
      file,
      original +
        (original && !original.endsWith('\n') ? '\n' : '') +
        '\n# Generated browser export\n/.zero/web-export/\n'
    );
}
async function writeDiagnosticLog(file, text) {
  await noSymlinks(path.dirname(file));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await noSymlinks(file);
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, text, { flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}
async function exportForWeb(options = {}) {
  const { signal } = options;
  const onProgress = options.onProgress || (() => {});
  abort(signal);
  if (!options.projectRoot)
    throw new Error('Choose a Zero project before exporting for web.');
  const projectRoot = await fs.realpath(path.resolve(options.projectRoot));
  await noSymlinks(projectRoot);
  await assertSelectedBuilder(projectRoot);
  if (!(await exists(projectRoot))?.isDirectory())
    throw new Error('The Zero project folder does not exist.');
  const cacheRoot = await canonicalPath(
    options.cacheRoot || path.join(os.homedir(), '.cache', 'zero', 'web-export')
  );
  if (inside(projectRoot, cacheRoot))
    throw new Error(
      'The web compiler cache must be outside the student project.'
    );
  await noSymlinks(cacheRoot);
  await fs.mkdir(cacheRoot, { recursive: true });
  const outputRoot = path.resolve(
    options.outputRoot || path.join(projectRoot, '.zero', 'web-export')
  );
  if (outputRoot !== path.join(projectRoot, '.zero', 'web-export'))
    throw new Error(
      'Web export output must be the project’s .zero/web-export folder.'
    );
  await noSymlinks(outputRoot);
  const locks = path.join(cacheRoot, 'locks');
  await noSymlinks(locks);
  await fs.mkdir(locks, { recursive: true });
  const buildLock = await acquireBuildLock({ locks, projectRoot, signal, onProgress });
  const buildId = crypto.randomUUID();
  let buildRoot;
  let diagnosticText = `Zero web export ${buildId}\n`;
  const logPath = path.join(cacheRoot, 'logs', sha(projectRoot) + '.log');
  try {
    await noSymlinks(logPath);
    onProgress('Checking Java sources and resources');
    const profileHash = await buildProfileHash();
    const captured = await captureBuildInputs(projectRoot);
    const libraries=captured.libraries;
    const javaFiles = captured.files.filter(file => file.path.startsWith('src/main/java/')).map(file => ({ ...file, originalPath:file.path,path: file.path.slice('src/main/java/'.length) }));
    const resources = captured.files.filter(file => file.path.startsWith('src/main/resources/')).map(file => ({ ...file, originalPath:file.path,path: file.path.slice('src/main/resources/'.length) }));
    if (!javaFiles.some((file) => file.path.endsWith('.java')))
      throw new Error('No Java sources found in src/main/java.');
    for (const file of javaFiles)
      if (!file.path.endsWith('.java'))
        throw new Error(
          `Keep application assets in src/main/resources: ${file.path}`
        );
    for (const file of resources)
      if (
        file.path === 'index.html' ||
        file.path === 'zero_web.nocache.js' ||
        file.path.startsWith('licenses/') ||
        file.path.startsWith('dev/webfx/')
      )
        throw new Error(
          'Resource path is reserved by the browser runtime: ' + file.path
        );
    for (const file of resources)
      if (
        file.path.split('/').some((part) => part.startsWith('.')) ||
        /(?:^|\/)(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)|\.(?:pem|key|p12|pfx)$/i.test(
          file.path
        )
      )
        throw new Error(
          `Private or hidden resources cannot be exported: ${file.path}`
        );
    await noSymlinks(path.join(projectRoot, 'pom.xml'));
    const pom = captured.files.find(file => file.path === 'pom.xml').bytes.toString('utf8');
    validateDependencies(pom,{libraries});
    assertApplicationNamespaces(javaFiles,libraries);
    const libraryInputs=await resolveLibrarySources(projectRoot,captured,options);
    for(const file of libraryInputs.sources) {
      if(javaFiles.some(existing=>existing.path.toLowerCase()===file.path.toLowerCase()))throw new Error('Browser Java source collision: '+file.path);
      javaFiles.push(file);
    }
    for(const file of libraryInputs.resources) {
      if(resources.some(existing=>existing.path.toLowerCase()===file.path.toLowerCase()))throw new Error('Browser resource collision: '+file.path);
      resources.push(file);
    }
    const sourceOrigins=Object.fromEntries(javaFiles.map(file=>[file.path,file.originalPath]));
    const wrapper = path.join(
      projectRoot,
      process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw'
    );
    await noSymlinks(wrapper);
    if (!(await exists(wrapper))?.isFile())
      throw new Error(
        'This project needs its Maven wrapper (mvnw / mvnw.cmd). Run Zero project setup first.'
      );
    const wrapperInput = validateWrapperInputs(captured.files);
    const originals = captured.files;
    const sourceHash = boundSourceHash(captured.sourceHash,libraryInputs.publishedLibraries);
    const artifacts = path.join(cacheRoot, 'artifacts');
    await prepareArtifacts(artifacts, signal, onProgress);
    const builds = path.join(cacheRoot, 'builds');
    for (const directory of [
      builds,
      path.join(cacheRoot, 'repository'),
      path.join(cacheRoot, 'maven-home')
    ])
      await noSymlinks(directory);
    await fs.mkdir(builds, { recursive: true });
    buildRoot = await fs.mkdtemp(path.join(builds, 'export-'));
    await buildLock.update({ phase: 'launching' });
    const compatibility = await checkCompatibility({
      sources: Object.fromEntries(javaFiles.map(file => [file.path, file.bytes.toString('utf8')])),
      pom, libraries, sourceOrigins, workRoot: buildRoot, cacheRoot, env: options.env, signal, onProgress, getArtifact: get
    });
    await buildLock.update({ phase: 'preparing' });
    const adapted = require('./adapters').adaptSources({
      sources: Object.fromEntries(
        javaFiles.map((file) => [file.path, file.bytes.toString('utf8')])
      ),
      resourcePaths: resources.map((file) => file.path),
      urlReferences: compatibility.resourceUrlReferences,
      originalPaths:sourceOrigins
    });
    if (!/^(?:[a-zA-Z_$][\w$]*\.)+[a-zA-Z_$][\w$]*$/.test(adapted.mainClass))
      throw new Error('Invalid browser launcher class.');
    await generateProject(buildRoot, adapted, resources, artifacts);
    // Execute a frozen reviewed wrapper, with no project Maven hooks or mutable script race.
    const frozenWrapper = path.join(buildRoot, wrapperInput.name);
    await fs.writeFile(frozenWrapper, wrapperInput.wrapperBytes, { mode: 0o755 });
    await fs.mkdir(path.join(buildRoot, '.mvn/wrapper'), { recursive: true });
    await fs.writeFile(path.join(buildRoot, '.mvn/wrapper/maven-wrapper.properties'), wrapperInput.propertiesBytes);
    await fs.writeFile(
      path.join(buildRoot, 'settings.xml'),
      '<settings xmlns="http://maven.apache.org/SETTINGS/1.2.0"><interactiveMode>false</interactiveMode></settings>'
    );
    const mavenDistribution = await prepareMavenDistribution({ cacheRoot, signal, getArtifact: get, onProgress });
    compatibility.mavenDistribution = mavenDistribution;
    verifyArtifactInventory(await artifactInventory(path.join(cacheRoot, 'repository')));
    onProgress(
      'Compiling Java for the browser.'
    );
    const result = await runMaven({
      wrapper: frozenWrapper,
      projectRoot,
      buildRoot,
      cacheRoot,
      env: options.env,
      signal,
      onProgress,
      buildLock,
      inheritedProcessGroup: options.inheritedProcessGroup === true
    });
    await buildLock.compilerFinished();
    await verifyMavenDistribution({ cacheRoot });
    const resolvedArtifactInventory = verifyArtifactInventory(await artifactInventory(path.join(cacheRoot, 'repository')));
    diagnosticText += mapDiagnostics(result.output, adapted.sourceMap);
    await writeDiagnosticLog(logPath, diagnosticText);
    abort(signal);
    if (result.code !== 0) {
      const e = new Error(
        `Web compilation failed (Maven exit ${result.code ?? result.terminationSignal}). See ${logPath}\n${mapDiagnostics(
          result.output,
          adapted.sourceMap
        )
          .split('\n')
          .filter((line) => /\[ERROR\]|Line \d+:/.test(line))
          .slice(-12)
          .join('\n')}`
      );
      e.logPath = logPath;
      throw e;
    }
    const compiled = path.join(buildRoot, 'target/zero-web-1.0.0/zero_web');
    const siteFiles = await readTree(compiled);
    try {
      validateSite(siteFiles);
    } catch (e) {
      e.message += ' See ' + logPath;
      throw e;
    }
    for (const resource of resources) {
      const emitted = siteFiles.find((file) => file.path === resource.path);
      if (!emitted || sha(emitted.bytes) !== sha(resource.bytes))
        throw new Error(
          'The browser build did not preserve resource: ' + resource.path
        );
    }
    if ((await captureBuildInputs(projectRoot)).sourceHash !== captured.sourceHash)
      throw new Error('Java sources, resources or build settings changed during export. Run App again to build the saved version.');
    if ((await buildProfileHash()) !== profileHash)
      throw new Error('The browser compiler or compatibility contract changed during export. Run App again.');
    const notices = await readTree(path.join(__dirname, 'notices'));
    for (const file of notices)
      siteFiles.push({ path: 'licenses/' + file.path, bytes: file.bytes });
    // Retain exact upstream runtime source and license terms with the distributable.
    // Student Java remains outside the generated site and archive.
    siteFiles.push({
      path: 'licenses/source-artifacts.json',
      bytes: Buffer.from(JSON.stringify(toolchain, null, 2) + '\n')
    });
    for (const artifact of toolchain.webfx)
      siteFiles.push({
        path: 'licenses/sources/' + artifact.file,
        bytes: await fs.readFile(path.join(artifacts, artifact.file))
      });
    siteFiles.push({
      path: 'licenses/sources/overrides/FxEvents.java',
      bytes: await fs.readFile(path.join(__dirname, 'template/FxEvents.java'))
    });
    const manifest = {
      schemaVersion: 1,
      buildId,
      sourceHash,
      localSourceHash:captured.sourceHash,
      profileHash,
      publishedLibraries:libraryInputs.publishedLibraries,
      compatibility,
      createdAt: new Date().toISOString(),
      sitePath: path.join(outputRoot, 'site'),
      zipPath: path.join(outputRoot, 'web-export.zip'),
      toolchain,
      adapters: adapted.changes,
      warnings: adapted.warnings || [],
      sourceMap: adapted.sourceMap,
      inputs: originals.map((file) => ({
        path: file.path,
        sha256: sha(file.bytes),
        bytes: file.bytes.length
      })),
      files: siteFiles.map((file) => ({
        path: file.path,
        sha256: sha(file.bytes),
        bytes: file.bytes.length
      })),
      totalBytes: siteFiles.reduce((sum, file) => sum + file.bytes.length, 0),
      buildLog: logPath,
      resolvedArtifactInventory
    };
    abort(signal);
    await addIgnore(projectRoot);
    await fs.mkdir(path.dirname(outputRoot), { recursive: true });
    await noSymlinks(outputRoot);
    const current = await exists(outputRoot);
    if (current) {
      if (
        !current.isDirectory() ||
        !(await exists(path.join(outputRoot, 'manifest.json')))
      )
        throw new Error(
          'The output folder already exists and is not a Zero web export. Move it before exporting.'
        );
      const existingFiles = await readTree(outputRoot);
      const previous = JSON.parse(
        await fs.readFile(path.join(outputRoot, 'manifest.json'), 'utf8')
      );
      if (
        previous.schemaVersion !== 1 ||
        !previous.buildId ||
        !Array.isArray(previous.files)
      )
        throw new Error('The existing export manifest is invalid.');
      const allowed = new Set([
        'manifest.json',
        'web-export.zip',
        ...previous.files.map((file) => 'site/' + file.path)
      ]);
      for (const file of existingFiles)
        if (!allowed.has(file.path))
          throw new Error(
            'The previous export contains additional files. Move it before exporting: ' +
              file.path
          );
    }
    const stage = await fs.mkdtemp(
      path.join(path.dirname(outputRoot), '.web-export-')
    );
    let backup;
    try {
      for (const file of siteFiles) {
        const dest = path.join(stage, 'site', file.path);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, file.bytes);
      }
      await fs.writeFile(
        path.join(stage, 'web-export.zip'),
        zipFiles(siteFiles)
      );
      await fs.writeFile(
        path.join(stage, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n'
      );
      abort(signal);
      if (current) {
        backup = outputRoot + '.previous-' + buildId;
        await fs.rename(outputRoot, backup);
      }
      try {
        await fs.rename(stage, outputRoot);
      } catch (e) {
        if (backup) await fs.rename(backup, outputRoot);
        throw e;
      }
      if (backup) await fs.rm(backup, { recursive: true });
    } finally {
      if (await exists(stage)) await fs.rm(stage, { recursive: true });
    }
    onProgress('Web export ready');
    return {
      sitePath: manifest.sitePath,
      zipPath: manifest.zipPath,
      manifestPath: path.join(outputRoot, 'manifest.json'),
      buildId,
      sourceHash,
      profileHash,
      compatibility,
      totalBytes: manifest.totalBytes,
      files: manifest.files,
      logPath
    };
  } catch (e) {
    try {
      await writeDiagnosticLog(
        logPath,
        diagnosticText + '\n' + e.message + '\n'
      );
      e.logPath = logPath;
    } catch (logError) {
      e.diagnosticError = logError.message;
    }
    throw e;
  } finally {
    if (buildRoot && buildLock.canCleanTemporary())
      try {
        await fs.rm(buildRoot, { recursive: true, force: true });
      } catch (cleanupError) {
        onProgress(
          'Could not remove temporary web compiler folder: ' +
            buildRoot +
            ' (' +
            cleanupError.message +
            ')'
        );
      }
    await buildLock.release();
  }
}
module.exports = {
  exportForWeb,
  _test: {
    sourceDigest,
    mapDiagnostics,
    noSymlinks,
    readTree,
    runMaven,
    prepareArtifacts,
    validateSite,
    processSpecification
  }
};
