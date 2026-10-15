// Explicitly opt-in, isolated real Sparkle acceptance test. Never uses production Ed keys.
// npm run test:updates:live -- --developer-id-live [--manual-live]
import assert from 'node:assert/strict';
import {generateKeyPairSync, createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync, existsSync, chmodSync, readdirSync, lstatSync, readlinkSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {acquireSparkle, copySparkleFramework, signSparkleFramework, sparklePin, updaterFeedURL} from './mac-updater.mjs';
import {verifyFeedSignature, verifyUpdateSignature} from './mac-update-feed.mjs';

assert.equal(process.platform, 'darwin', 'This live test requires macOS');
const arguments_ = process.argv.slice(2), manualMode=arguments_.includes('--manual-live');
assert.deepEqual(arguments_, manualMode ? ['--developer-id-live','--manual-live'] : ['--developer-id-live'], 'Usage: node scripts/test-mac-updater-live.mjs --developer-id-live [--manual-live]');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identity = 'ACE8EE40F3615C5062CBBD5F085E299E049BAE08', team = '88FT6QZJP8';
const domain = 'ca.codepet.zero.update-test';
mkdirSync(path.join(root, '.verification'), {recursive:true});
const output = mkdtempSync(path.join(root, '.verification/updater-live-'));
const privateDirectory = mkdtempSync(path.join(os.tmpdir(), 'zero-updater-fixture-key-'));
chmodSync(privateDirectory, 0o700);
const log = message => { console.log(message); writeFileSync(path.join(output,'harness.log'), `${new Date().toISOString()} ${message}\n`, {flag:'a'}); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let commandIndex = 0;
function run(command, args, timeout = 180000) {
  const result = spawnSync(command, args, {cwd:root, encoding:'utf8', timeout, maxBuffer:8*1024*1024});
  const record = {command, args:args.map(arg => arg === path.join(privateDirectory,'key') ? '[ephemeral-key-file]' : arg), status:result.status, stdout:result.stdout || '', stderr:result.stderr || ''};
  writeFileSync(path.join(output, `command-${String(++commandIndex).padStart(3,'0')}.json`), JSON.stringify(record,null,2));
  assert.equal(result.status, 0, `${command} failed: ${result.stderr || result.error || result.stdout}`);
  return result;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, milliseconds, label) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { if (predicate()) return; await sleep(250); }
  throw new Error(`Timed out: ${label}`);
}
function treeManifest(folder) {
  const entries = [];
  function visit(directory, prefix = '') {
    for (const name of readdirSync(directory).sort()) {
      const relative = prefix ? `${prefix}/${name}` : name, file = path.join(directory,name), stat = lstatSync(file);
      if (stat.isSymbolicLink()) entries.push([relative,'link',readlinkSync(file)]);
      else if (stat.isDirectory()) visit(file,relative);
      else entries.push([relative,'file',stat.mode & 0o777,digest(readFileSync(file))]);
    }
  }
  visit(folder); return entries;
}
let server, child, editorDummy, distribution;
const hadPreferences = spawnSync('/usr/bin/defaults',['read',domain],{encoding:'utf8'}).status === 0;
const preferenceBackup = hadPreferences ? spawnSync('/usr/bin/defaults',['export',domain,'-'],{encoding:'utf8'}) : null;
if (hadPreferences) assert.equal(preferenceBackup.status,0,'Fixture preference backup succeeds');
if (hadPreferences) writeFileSync(path.join(output,'fixture-preferences-before.plist'), preferenceBackup.stdout, {mode:0o600});
const receipt = {schema:1,startedAt:new Date().toISOString(),output,identity,team,bundleIdentifier:domain,fixturePreferencesExisted:hadPreferences,sourceRevision:run('/usr/bin/git',['rev-parse','HEAD']).stdout.trim(),sourceRevisionIsBase:true,harnessSha256:digest(readFileSync(fileURLToPath(import.meta.url))),results:{},limits:['Fixture handoff bypasses real setup and editor launch.','Dummy editor process proves process survival only; no real unsaved editor buffers or Java process tested.','No global URL registration, owner Zero launch, production feed/key, or /Applications modification.','Native source file hashes describe the compiled working tree; sourceRevision is the base commit.','Manual standard UI, authorization, read-only DMG launch, managed Mac, Intel, macOS 12 and repeated real editor handoff remain untested.']};
try {
  log(`Evidence: ${output}`);
  if (hadPreferences) run('/usr/bin/defaults',['delete',domain]);
  const {privateKey,publicKey} = generateKeyPairSync('ed25519');
  const seed = privateKey.export({format:'der',type:'pkcs8'}).subarray(-32);
  const publicRaw = publicKey.export({format:'der',type:'spki'}).subarray(-32), keyFile = path.join(privateDirectory,'key');
  writeFileSync(keyFile,seed.toString('base64'),{mode:0o600,flag:'wx'});
  seed.fill(0);
  const publicED = publicRaw.toString('base64');
  const config = {schema:1,buildNumber:2,feedURL:updaterFeedURL,publicKey:publicED,sparkle:sparklePin};
  // Keep all extraction/cache mutations inside this unique fixture evidence folder.
  const pinArchive = path.join(root,`.verification/sparkle-${sparklePin.version}/Sparkle-${sparklePin.version}.tar.xz`);
  const fixtureArchive = path.join(output,`.verification/sparkle-${sparklePin.version}/Sparkle-${sparklePin.version}.tar.xz`);
  if (existsSync(pinArchive)) { mkdirSync(path.dirname(fixtureArchive),{recursive:true}); cpSync(pinArchive,fixtureArchive); }
  distribution = acquireSparkle(run,output,config);
  receipt.sparkle = distribution.source;
  receipt.publicKeySha256 = digest(publicRaw);
  const signTool = path.join(distribution.directory,'bin/sign_update');
  let feed, archive;
  const requests = [];
  server = createServer((request,response) => {
    requests.push({time:new Date().toISOString(),path:request.url});
    if (request.url?.split('?')[0] === '/appcast.xml' && feed) { response.writeHead(200, {'Content-Type':'application/rss+xml','Content-Length':feed.length}); response.end(feed); }
    else if (request.url === '/fixture.dmg' && archive) { response.writeHead(200, {'Content-Type':'application/octet-stream','Content-Length':archive.length}); response.end(archive); }
    else { response.writeHead(503); response.end('fixture unavailable'); }
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fixtureApps = path.join(output,'fixture-apps'); mkdirSync(fixtureApps);
  const compiled = path.join(output,'ZeroSetup');
  log('Compiling fixture binary from native source');
  const sources = ['SetupCore.swift','MacRuntime.swift','SetupWindow.swift','UpdateCoordinator.swift','main.swift'].map(name => path.join(root,'native-installer/macos',name));
  receipt.nativeSource = Object.fromEntries(sources.map(file => [path.basename(file),digest(readFileSync(file))]));
  run('/usr/bin/xcrun',['swiftc','-O','-D','ZERO_UPDATER_FIXTURE','-target',`${process.arch === 'arm64' ? 'arm64' : 'x86_64'}-apple-macosx12.0`,'-framework','AppKit','-framework','Foundation','-F',distribution.directory,'-framework','Sparkle','-Xlinker','-rpath','-Xlinker','@executable_path/../Frameworks',...sources,'-o',compiled],240000);
  const apps = [];
  for (const [build,version,name] of [[2,'0.5.15','A'],[3,'0.5.16','B']]) {
    const app = path.join(fixtureApps,`${name}/Zero Update Fixture.app`), contents = path.join(app,'Contents');
    mkdirSync(path.join(contents,'MacOS'),{recursive:true}); mkdirSync(path.join(contents,'Resources'),{recursive:true});
    cpSync(compiled,path.join(contents,'MacOS/ZeroSetup'));
    const framework = copySparkleFramework(distribution,contents);
    // No URL types: launching this fixture cannot become the production scheme handler.
    const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>Zero Update Fixture</string><key>CFBundleIdentifier</key><string>${domain}</string><key>CFBundleExecutable</key><string>ZeroSetup</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>${build}</string><key>CFBundleShortVersionString</key><string>${version}</string><key>LSMinimumSystemVersion</key><string>12.0</string><key>NSPrincipalClass</key><string>NSApplication</string><key>ZeroDevelopmentBuild</key><false/><key>SUFeedURL</key><string>${origin}/appcast.xml</string><key>SUPublicEDKey</key><string>${publicED}</string><key>SUEnableAutomaticChecks</key><true/><key>SUAutomaticallyUpdate</key><true/><key>SUVerifyUpdateBeforeExtraction</key><true/><key>SURequireSignedFeed</key><true/><key>SUSignedFeedFailureExpirationInterval</key><integer>0</integer><key>SUScheduledCheckInterval</key><integer>86400</integer><key>SUEnableSystemProfiling</key><false/><key>SUEnableJavaScript</key><false/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoads</key><true/></dict></dict></plist>`;
    writeFileSync(path.join(contents,'Info.plist'),plist);
    signSparkleFramework(run,framework,identity);
    run('/usr/bin/codesign',['--force','--options','runtime','--timestamp','--sign',identity,app]);
    run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
    const signature = run('/usr/bin/codesign',['-d','--verbose=4',app]).stderr;
    assert.ok(signature.includes(`TeamIdentifier=${team}`) && signature.includes('Authority=Developer ID Application:'));
    apps.push(app);
  }
  log('Submitting both fixture apps to Apple notarization');
  const zip = path.join(output,'fixture-apps.zip');
  run('/usr/bin/ditto',['-c','-k','--keepParent',fixtureApps,zip]);
  const appNotary = JSON.parse(run('/usr/bin/xcrun',['notarytool','submit',zip,'--keychain-profile','Zero Notarization','--wait','--timeout','5m','--output-format','json'],330000).stdout);
  assert.equal(appNotary.status,'Accepted'); receipt.appNotarization=appNotary;
  for (const app of apps) { run('/usr/bin/xcrun',['stapler','staple',app]); run('/usr/bin/xcrun',['stapler','validate',app]); run('/usr/sbin/spctl',['--assess','--type','execute','--verbose=4',app]); }
  const dmg = path.join(output,'fixture.dmg');
  run('/usr/bin/hdiutil',['create','-ov','-format','UDZO','-srcfolder',path.dirname(apps[1]),'-volname','Zero Updater Fixture',dmg]);
  run('/usr/bin/codesign',['--timestamp','--sign',identity,dmg]);
  log('Submitting B DMG to Apple notarization');
  const dmgNotary = JSON.parse(run('/usr/bin/xcrun',['notarytool','submit',dmg,'--keychain-profile','Zero Notarization','--wait','--timeout','5m','--output-format','json'],330000).stdout);
  assert.equal(dmgNotary.status,'Accepted'); receipt.dmgNotarization=dmgNotary;
  run('/usr/bin/xcrun',['stapler','staple',dmg]); run('/usr/bin/xcrun',['stapler','validate',dmg]);
  archive = readFileSync(dmg);
  const edSignature = run(signTool,['--ed-key-file',keyFile,'-p',dmg]).stdout.trim();
  verifyUpdateSignature(archive,edSignature,publicED);
  const feedFile = path.join(output,'appcast.xml');
  const makeFeed = (build = 3, signature = edSignature) => {
    writeFileSync(feedFile,`<?xml version="1.0" encoding="utf-8"?><rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0"><channel><title>Isolated Zero Fixture</title><item><title>Fixture B</title><sparkle:version>${build}</sparkle:version><sparkle:shortVersionString>0.5.16</sparkle:shortVersionString><sparkle:minimumSystemVersion>12.0</sparkle:minimumSystemVersion><enclosure url="${origin}/fixture.dmg" length="${archive.length}" type="application/octet-stream" sparkle:edSignature="${signature}"/></item></channel></rss>\n`);
    run(signTool,['--ed-key-file',keyFile,'--disable-signing-warning',feedFile]);
    feed = readFileSync(feedFile); verifyFeedSignature(feed,publicED);
  };
  makeFeed();
  receipt.archive={size:archive.length,sha256:digest(archive),edSignature}; receipt.feedSha256=digest(feed);
  const installed = path.join(output,'installed/Zero Update Fixture.app'); mkdirSync(path.dirname(installed)); cpSync(apps[0],installed,{recursive:true,dereference:false,verbatimSymlinks:true});
  const expectedB = treeManifest(apps[1]);
  const student = path.join(output,'student'); mkdirSync(student);
  writeFileSync(path.join(student,'Main.java'),'// preserved student source\nclass Main {}\n');
  writeFileSync(path.join(student,'unsaved-buffer-sentinel.txt'),'simulated sentinel only; no real editor buffer\n');
  const studentBefore=treeManifest(student);
  editorDummy=spawn('/bin/sleep',['1200'],{stdio:'ignore'});
  const launch = label => {
    const destination=path.join(output,`${label}.log`), stream=[];
    child=spawn(path.join(installed,'Contents/MacOS/ZeroSetup'),['--updater-fixture-handoff'],{cwd:output,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data', bytes => { stream.push(bytes.toString()); writeFileSync(destination,bytes,{flag:'a'}); }); child.stderr.on('data', bytes => { stream.push(bytes.toString()); writeFileSync(destination,bytes,{flag:'a'}); });
    return {pid:child.pid, exited:()=>child.exitCode !== null || child.signalCode !== null, text:()=>stream.join('')};
  };
  if (manualMode) {
    // Explicit target plus --update-request protects both existing and new-app delivery.
    // The fixture declares no URL types and never becomes a scheme default.
    run('/usr/bin/open',['-n','--stdout',path.join(output,'manual.log'),'--stderr',path.join(output,'manual-errors.log'),'-a',installed,'zero-updates://check','--args','--update-request']);
    const stopFile=path.join(output,'stop-manual'), expiresAt=new Date(Date.now()+300000).toISOString();
    writeFileSync(path.join(output,'manual-ready.json'),JSON.stringify({installed,origin,stopFile,expiresAt,bundleIdentifier:domain,expectedBuild:3},null,2));
    log(`Manual UI ready; interact with Zero Update Fixture, bounded until ${expiresAt}; create ${stopFile} to stop.`);
    await waitFor(()=>existsSync(stopFile) || (existsSync(path.join(installed,'Contents/Info.plist')) && spawnSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleVersion',path.join(installed,'Contents/Info.plist')],{encoding:'utf8'}).stdout.trim()==='3'),300000,'manual fixture upgrade or stop file');
    if (existsSync(stopFile)) { receipt.results.manualUpgrade={passed:false,stopped:true}; receipt.passed=false; }
    else {
      assert.deepEqual(treeManifest(installed),expectedB); assert.deepEqual(treeManifest(student),studentBefore); process.kill(editorDummy.pid,0);
      await sleep(2500);
      const remaining=spawnSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});
      assert.equal(remaining.status,0); assert.ok(!remaining.stdout.includes(`${installed}/Contents/MacOS/ZeroSetup`),'Manual replacement must not relaunch app');
      receipt.results.manualUpgrade={passed:true,finalBuild:3,studentFilesUnchanged:true,dummyEditorSurvived:true,automaticRelaunch:false,requests:[...requests]}; receipt.passed=true;
      receipt.limits=receipt.limits.filter(limit=>!limit.startsWith('Manual standard UI,'));
      receipt.limits.push('Authorization, read-only DMG launch, managed Mac, Intel, macOS 12 and repeated real editor handoff remain untested.');
      log('PASS: manual standard UI installed exact signed/notarized B');
    }
  } else {
  log('Running real automatic A → B Sparkle replacement');
  const first=launch('upgrade');
  await waitFor(()=>first.exited(),150000,'A exits for install');
  assert.ok(first.text().includes('ZERO_UPDATER install-on-quit'),first.text());
  assert.ok(first.text().includes('ZERO_UPDATER quit-to-install'),first.text());
  await waitFor(()=>existsSync(path.join(installed,'Contents/Info.plist')) && run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleVersion',path.join(installed,'Contents/Info.plist')]).stdout.trim()==='3',45000,'installed B build');
  assert.deepEqual(treeManifest(installed),expectedB,'Installed bundle bytes, paths and modes match notarized B');
  assert.deepEqual(treeManifest(student),studentBefore); process.kill(editorDummy.pid,0);
  await sleep(2500);
  const processList=spawnSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});
  assert.equal(processList.status,0);
  const processes=processList.stdout.split('\n').filter(line=>line.includes(`${installed}/Contents/MacOS/ZeroSetup`));
  assert.deepEqual(processes,[],'Automatic replacement must not relaunch the fixture');
  receipt.results.automaticUpgrade={passed:true,initialPID:first.pid,finalBuild:3,finalManifestSha256:digest(Buffer.from(JSON.stringify(expectedB))),studentFilesUnchanged:true,dummyEditorPID:editorDummy.pid,dummyEditorSurvived:true,automaticRelaunch:false,requests:[...requests]};
  // Sparkle owns persisted scheduling; reset ONLY the disposable domain between scenarios.
  run('/usr/bin/defaults',['delete',domain]);
  const second=launch('no-update'); await waitFor(()=>second.exited(),30000,'B no-update exits');
  assert.match(second.text(),/ZERO_UPDATER cycle-error-detail domain=SUSparkleErrorDomain code=1001/);
  assert.ok(second.text().includes('ZERO_UPDATER finished'),second.text());
  receipt.results.noUpdate={passed:true};
  run('/usr/bin/defaults',['delete',domain]);
  feed=Buffer.from(feed.toString().replace('Isolated Zero Fixture','Corrupted Zero Fixture'));
  const badFeed=launch('bad-feed'); await waitFor(()=>badFeed.exited(),30000,'bad signed feed exits');
  assert.ok(badFeed.text().includes('ZERO_UPDATER cycle-error'),badFeed.text()); receipt.results.badFeed={passed:true};
  assert.deepEqual(treeManifest(installed),expectedB);
  run('/usr/bin/defaults',['delete',domain]);
  const requestsBeforeBadArchive=requests.length;
  makeFeed(4,Buffer.alloc(64).toString('base64'));
  const badArchive=launch('bad-archive'); await waitFor(()=>badArchive.exited(),45000,'bad archive signature exits');
  assert.ok(badArchive.text().includes('ZERO_UPDATER cycle-error'),badArchive.text());
  assert.ok(!badArchive.text().includes('ZERO_UPDATER install-on-quit'));
  assert.ok(requests.slice(requestsBeforeBadArchive).some(request=>request.path==='/fixture.dmg'),'Bad signature archive must actually download');
  const signatureLog=run('/usr/bin/log',['show','--last','2m','--predicate',`subsystem == "org.sparkle-project.Sparkle" AND processIdentifier == ${badArchive.pid}`,'--style','compact','--info','--debug']).stdout;
  assert.match(signatureLog,/signature.*(?:does not match|validation failed)/i,'Sparkle must explicitly report signature rejection');
  writeFileSync(path.join(output,'sparkle-bad-archive.log'),signatureLog);
  assert.deepEqual(treeManifest(installed),expectedB); receipt.results.badArchiveSignature={passed:true,requests:requests.slice(requestsBeforeBadArchive)};
  run('/usr/bin/defaults',['delete',domain]);
  feed=null;
  const offline=launch('unavailable-feed'); await waitFor(()=>offline.exited(),30000,'unavailable feed exits');
  assert.ok(offline.text().includes('ZERO_UPDATER cycle-error'),offline.text()); receipt.results.unavailableFeed={passed:true};
  const runtime=spawnSync(path.join(installed,'Contents/MacOS/ZeroSetup'),['--runtime'],{encoding:'utf8',timeout:10000});
  assert.equal(runtime.status,1); assert.ok(!`${runtime.stdout}${runtime.stderr}`.includes('ZERO_UPDATER'));
  writeFileSync(path.join(output,'runtime.log'),`${runtime.stdout}${runtime.stderr}`); receipt.results.runtimeDoesNotStartUpdater={passed:true};
  receipt.limits.push('Wrong identity, slow/interrupted transfer and manual URL/UI were not live-tested.');
  receipt.completedAt=new Date().toISOString(); receipt.passed=true;
  log('PASS: signed/notarized A → B; no relaunch; sentinel/dummy preservation; no-update; bad feed/archive signature; unavailable-feed; runtime isolation');
  }
} catch (error) {
  receipt.passed=false; receipt.error=String(error.stack || error); log(`FAIL: ${error.message}`); process.exitCode=1;
} finally {
  if (child && child.exitCode===null && child.signalCode===null) child.kill('SIGTERM');
  if (editorDummy && editorDummy.exitCode===null) editorDummy.kill('SIGTERM');
  if (manualMode) {
    // Only terminate processes whose executable is inside this invocation's app.
    const listing=spawnSync('/bin/ps',['-axo','pid=,comm='],{encoding:'utf8'});
    for (const line of (listing.stdout || '').split('\n')) {
      const match=line.match(/^\s*(\d+)\s+(.+)$/);
      if (match && match[2]===path.join(output,'installed/Zero Update Fixture.app/Contents/MacOS/ZeroSetup')) {
        try { process.kill(Number(match[1]),'SIGTERM'); } catch {}
      }
    }
  }
  if (server) await new Promise(resolve=>server.close(resolve));
  // Never leave the fixture Ed key behind, even when notarization or update fails.
  rmSync(privateDirectory,{recursive:true,force:true});
  const removed=spawnSync('/usr/bin/defaults',['delete',domain],{encoding:'utf8'});
  receipt.fixturePreferencesCleaned=removed.status===0 || /not found|does not exist/i.test(removed.stderr || '');
  if (hadPreferences) { run('/usr/bin/defaults',['import',domain,path.join(output,'fixture-preferences-before.plist')]); receipt.fixturePreferencesRestored=true; }
  if (distribution) rmSync(distribution.directory,{recursive:true,force:true});
  receipt.finishedAt=new Date().toISOString(); writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2));
  log(`Receipt: ${path.join(output,'receipt.json')}`);
}
