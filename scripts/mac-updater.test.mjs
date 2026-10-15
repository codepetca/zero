import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateMacUpdaterConfig,sparklePin,updaterFeedURL,updaterEnabledForVersion,verifySparkleArchive,frameworkManifest,signSparkleFramework,sparkleComponents,verifyUpdaterPlist,acquireSparkle,copySparkleFramework,verifySparkleFramework,validateUpdaterReceipt,sha256} from './mac-updater.mjs';
import {installerPlist} from './installer-signing.mjs';
const config = {schema:1,buildNumber:2,feedURL:updaterFeedURL,publicKey:Buffer.alloc(32,1).toString('base64'),sparkle:{...sparklePin}};
const run=(cmd,args)=>{const result=spawnSync(cmd,args,{encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);return {stdout:result.stdout,stderr:result.stderr};};
test('updater manifest strictly pins dependency, HTTPS channel, public key and monotonic number domain',()=>{
  assert.equal(validateMacUpdaterConfig(config),config);
  for(const delta of [{schema:2},{buildNumber:1},{buildNumber:2.5},{buildNumber:'2'},{feedURL:'https://evil.example/appcast.xml'},{feedURL:'http://zero.codepet.ca/updates/macos/appcast.xml'},{publicKey:'secret'},{publicKey:Buffer.alloc(31).toString('base64')},{sparkle:{...sparklePin,sha256:'0'.repeat(64)}},{extra:true}]) assert.throws(()=>validateMacUpdaterConfig({...config,...delta}));
  for(const version of ['0.5.12','0.5.13','0.5.14','0.4.99']) assert.equal(updaterEnabledForVersion(version),false);
  for(const version of ['0.5.15','0.6.0','1.0.0']) assert.equal(updaterEnabledForVersion(version),true);
  assert.throws(()=>verifySparkleArchive(Buffer.alloc(1),config),/size/);
  assert.throws(()=>verifySparkleArchive(Buffer.alloc(sparklePin.size),config),/digest/);
});
test('production plist binds strict trust/default settings; development omits channel, key and URL registration',()=>{
  const template=readFileSync(new URL('../native-installer/macos/Info.plist',import.meta.url),'utf8');
  const folder=mkdtempSync(path.join(tmpdir(),'zero-updater-plist-'));
  try {
    for(const signed of [true,false]) {
      const file=path.join(folder,'Info.plist');writeFileSync(file,installerPlist(template,'0.5.15',signed,config));
      if(process.platform==='darwin') {
        const plist=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',file]).stdout);
        verifyUpdaterPlist(plist,config,signed);
        for(const delta of [{CFBundleVersion:'1'},{SUAllowsAutomaticUpdates:false},{SUEnableJavaScript:true},{SURequireSignedFeed:false},{SUVerifyUpdateBeforeExtraction:false},{SUSignedFeedFailureExpirationInterval:10},{SUEnableInstallerLauncherService:true}]) assert.throws(()=>verifyUpdaterPlist({...plist,...delta},config,signed));
        if(!signed) assert.throws(()=>verifyUpdaterPlist({...plist,CFBundleURLTypes:[]},config,false));
      }
      else assert.match(readFileSync(file,'utf8'),/<key>CFBundleVersion<\/key><string>2<\/string>/);
    }
  } finally {rmSync(folder,{recursive:true,force:true});}
});
test('framework manifests reject escaping links and record unfollowed internal links/modes/digests',()=>{
  const folder=mkdtempSync(path.join(tmpdir(),'zero-framework-'));
  try {
    mkdirSync(path.join(folder,'Versions'));writeFileSync(path.join(folder,'Versions/file'),'fixture');symlinkSync('Versions/file',path.join(folder,'file'));
    assert.deepEqual(frameworkManifest(folder).find(e=>e.path==='file'),{path:'file',type:'symlink',target:'Versions/file'});
    symlinkSync('/Applications',path.join(folder,'escape'));assert.throws(()=>frameworkManifest(folder),/Unsafe/);
    rmSync(path.join(folder,'escape'));symlinkSync('../outside',path.join(folder,'escape'));assert.throws(()=>frameworkManifest(folder),/Unsafe/);
  } finally {rmSync(folder,{recursive:true,force:true});}
});
test('nested signing is explicit, inside-out, timestamped, runtime and strips inherited entitlements',()=>{
  const calls=[];signSparkleFramework((tool,args)=>calls.push([tool,args]),'/fixture/Sparkle.framework','A'.repeat(40));
  assert.equal(calls.length,5);
  assert.deepEqual(calls.map(([,args])=>args.at(-1)),sparkleComponents.map(c=>path.join('/fixture/Sparkle.framework',c.path)));
  for(const [tool,args] of calls) {assert.equal(tool,'/usr/bin/codesign');assert.ok(args.includes('runtime'));assert.ok(args.includes('--timestamp'));assert.ok(args.includes('--identifier'));assert.ok(!args.includes('--deep'));assert.ok(!args.includes('--entitlements'));assert.ok(!args.some(a=>a.startsWith('--preserve-metadata')));}
});
test('authenticated distribution survives copy and ad-hoc signing; resource tampering is rejected',{skip:process.platform!=='darwin' || !process.env.ZERO_TEST_SPARKLE_DISTRIBUTION},()=>{
  const root=path.resolve(new URL('..',import.meta.url).pathname), distribution=acquireSparkle(run,root,config), folder=mkdtempSync(path.join(root,'.verification/sparkle-test-'));
  try {
    const framework=copySparkleFramework(distribution,folder);signSparkleFramework(run,framework,'-');
    const evidence=verifySparkleFramework(run,framework,config,{sourceFramework:distribution.framework});assert.match(evidence.manifestSha256,/^[a-f0-9]{64}$/);
    run('/usr/bin/codesign',['--verify','--strict',framework]);
    for (const component of sparkleComponents) assert.equal(run('/usr/bin/codesign',['--display','--entitlements',':-',path.join(framework,component.path)]).stdout.trim(),'','Re-signing strips upstream entitlements');
    const swift=path.join(folder,'load.swift'), executable=path.join(folder,'load-sparkle');
    writeFileSync(swift,'import Sparkle\nprint(String(describing: SPUStandardUpdaterController.self))\n');
    run('/usr/bin/xcrun',['swiftc','-F',path.join(folder,'Frameworks'),'-framework','Sparkle','-Xlinker','-rpath','-Xlinker','@executable_path/Frameworks',swift,'-o',executable]);
    run('/usr/bin/codesign',['--force','--sign','-',executable]);
    assert.match(run(executable,[]).stdout,/SPUStandardUpdaterController/,'Development ad-hoc executable loads Sparkle without disabling library validation');
    writeFileSync(path.join(framework,'Versions/B/Resources/ca.lproj/Sparkle.strings'),'tampered');
    assert.throws(()=>verifySparkleFramework(run,framework,config,{sourceFramework:distribution.framework}),/resources|layout/);
  } finally {rmSync(folder,{recursive:true,force:true});rmSync(distribution.directory,{recursive:true,force:true});}
});

const signer = {identitySha1:'A'.repeat(40), teamIdentifier:'TESTTEAM01'};
function validUpdaterReceipt() {
  return {schema:1,buildNumber:config.buildNumber,feedURL:config.feedURL,publicKeySha256:sha256(Buffer.from(config.publicKey,'base64')),
    sparkle:{...sparklePin,frameworkManifestSha256:'b'.repeat(64)},
    framework:{manifestSha256:'c'.repeat(64),components:sparkleComponents.map(({path,identifier})=>({path,identifier,signature:{architectures:['arm64','x86_64'].map(architecture=>({architecture,...signer,authority:`Developer ID Application: Fixture (${signer.teamIdentifier})`,timestamp:'Oct 14, 2026 at 12:00:00'}))}}))}};
}
test('sealed updater receipt binds exact config, dependency, five universal components and common signer',()=>{
  const value=validUpdaterReceipt();assert.equal(validateUpdaterReceipt(value,config,signer),value);
  const mutations=[
    r=>{r.extra=true;},r=>{r.buildNumber++;},r=>{r.feedURL='https://evil.example';},r=>{r.publicKeySha256='d'.repeat(64);},
    r=>{r.sparkle.version='2.9.0';},r=>{r.sparkle.sha256='d'.repeat(64);},r=>{r.sparkle.extra=true;},
    r=>{r.sparkle.frameworkManifestSha256='short';},r=>{r.framework.manifestSha256='C'.repeat(64);},r=>{r.framework.extra=true;},
    r=>{r.framework.components.pop();},r=>{r.framework.components.push(r.framework.components[0]);},
    r=>{r.framework.components[1]=r.framework.components[0];},r=>{r.framework.components[0].path='../evil';},
    r=>{r.framework.components[0].identifier='evil';},r=>{r.framework.components[0].signature.extra=true;},
    r=>{r.framework.components[0].signature.architectures.reverse();},r=>{r.framework.components[0].signature.architectures.push({});},
    ...['identitySha1','teamIdentifier','authority','timestamp'].map(key=>r=>{r.framework.components[0].signature.architectures[0][key]='wrong';}),
    r=>{r.framework.components[0].signature.architectures[0].timestamp='none';},
    r=>{r.framework.components[0].signature.architectures[0].timestamp='x'.repeat(129);},
    r=>{r.framework.components[0].signature.architectures[0].extra=true;},
    r=>{r.framework.components[1].signature.architectures[0].authority=`Developer ID Application: Other (${signer.teamIdentifier})`;}
  ];
  for(const mutation of mutations) {const changed=validUpdaterReceipt();mutation(changed);assert.throws(()=>validateUpdaterReceipt(changed,config,signer));}
  assert.throws(()=>validateUpdaterReceipt(value,config,{...signer,identitySha1:'B'.repeat(40)}));
  assert.throws(()=>validateUpdaterReceipt(value,config,{...signer,teamIdentifier:'WRONGTEAM1'}));
});
