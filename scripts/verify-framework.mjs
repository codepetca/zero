import {copyFileSync, cpSync, readdirSync, rmSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';
import {starterMembers} from './kit.mjs';
import {root} from './release.mjs';
import {extractProject, maven} from './verification-project.mjs';
import {executionIdentity,persistJavaEvidence,nativeProducerFiles,nativeToolFiles,loadJavaEvidence,requireTargetEvidence} from './api-evidence.mjs';

export const frameworkCases=Object.freeze([
 ['PaddingLauncher','ZERO_PADDING_OK'],['SmokeLauncher','ZERO_SMOKE_OK'],
 ['GameHelpersCheck','ZERO_GAME_HELPERS_OK'],['ActorCheck','ZERO_ACTOR_OK'],
 ['UiCheck','ZERO_UI_OK'],['NavigationCheck','ZERO_NAVIGATION_OK'],['AudioCheck','ZERO_AUDIO_OK']
]);
export function selectFrameworkCases(args) {
 const selectors=args.filter(arg=>arg==='--only'||arg.startsWith('--only='));
 if(selectors.length>1||selectors[0]==='--only')throw new Error('Use one --only=Class,Class selector.');
 const selected=selectors.length?selectors[0].slice(7).split(','):frameworkCases.map(([name])=>name);
 if(!selected.length||selected.some(name=>!frameworkCases.some(([known])=>known===name))||new Set(selected).size!==selected.length)throw new Error('Unknown, empty or duplicate native framework selection.');
 return selected.map(name=>frameworkCases.find(([known])=>known===name));
}
export function verifyFramework(args=process.argv.slice(2)) {
 const selection=selectFrameworkCases(args),evidenceFlag=args.find(arg=>arg.startsWith('--evidence='));
 if(args.some(arg=>!arg.startsWith('--only=')&&!arg.startsWith('--evidence=')))throw new Error('Unknown native framework argument.');
 const evidenceRoot=evidenceFlag?path.resolve(evidenceFlag.slice(11)):path.join(root,'.verification/native-api-evidence','run-'+Date.now()+'-'+process.pid);
 const manifest=JSON.parse(readFileSync(path.join(root,'framework/evidence/api-signatures.json'),'utf8'));
 const project=extractProject(zipSync(starterMembers(root)),'zero-starter',tmpdir());
 try {
  for(const name of readdirSync(path.join(root,'framework/checks/zero')))if(name.endsWith('.java'))copyFileSync(path.join(root,'framework/checks/zero',name),path.join(project,'src/main/java/zero',name));
  cpSync(path.join(root,'framework/evidence/java/evidence'),path.join(project,'src/main/java/evidence'),{recursive:true});
  for(const [index,[name,marker]] of selection.entries()) {
   const result=maven(project,['-V','-q','-Dapp.mainClass=zero.'+name,...(index===0?['clean']:[]),'compile','javafx:run']);
   if(!result.stdout.includes(marker))throw new Error(result.stdout+'\n'+result.stderr);
   console.log(result.stdout.trim());
   if(evidenceRoot&&result.stdout.includes('ZERO_API_EVIDENCE_V1')) {
    const javaHome=result.stdout.match(/^ZERO_API_JAVA_HOME=(.+)$/m)?.[1]?.trim();
    const platform=result.stdout.match(/^ZERO_API_PLATFORM=(.+)$/m)?.[1]?.trim();
    if(!javaHome||!platform)throw new Error('Native evidence omitted actual JVM identity.');
    const modulePath=result.stdout.match(/^ZERO_API_MODULE_PATH=(.*)$/m)?.[1]?.trim();
    if(!modulePath)throw new Error('Native evidence omitted actual JavaFX module path.');
    const cleanOutput=result.stdout.replace(/\x1b\[[0-9;]*m/g,'');
    const mavenHome=cleanOutput.match(/^Maven home: (.+)$/m)?.[1]?.trim();
    if(!mavenHome)throw new Error('Native evidence omitted actual Maven home (-V).');
    const mavenJavaHome=cleanOutput.match(/^Java version:.*runtime: (.+)$/m)?.[1]?.trim();
    if(!mavenJavaHome)throw new Error('Native evidence omitted actual Maven JVM home (-V).');
    const actualTools=[...new Set([...nativeToolFiles({javaHome,mavenHome,modulePath:modulePath.split(path.delimiter)}),...nativeToolFiles({javaHome:mavenJavaHome,mavenHome})])];
    const {identity,output,inputs}=executionIdentity({manifest,projectRoot:project,outputDirectory:path.join(project,'target/classes'),toolFiles:actualTools,platform,harnessFiles:[...nativeProducerFiles(),...readdirSync(path.join(root,'framework/checks/zero')).filter(file=>file.endsWith('.java')).map(file=>path.join(root,'framework/checks/zero',file)),...['ApiProof.java','ApiSignatureChecks.java','ApiNative.java','ApiDrawingChecks.java','ApiLifecycleChecks.java','ApiCompletionChecks.java','ApiProbeBases.java'].map(file=>path.join(root,'framework/evidence/java/evidence',file))]});
    persistJavaEvidence({directory:path.join(evidenceRoot,'native-'+name),manifest,raw:result.stdout,identity,output,inputs,runId:'native-'+name+'-'+Date.now(),target:'native',caseId:'native/'+name});
   }
  }
  const required=['PaddingLauncher','GameHelpersCheck','ActorCheck','UiCheck','NavigationCheck','AudioCheck'];
  if(required.every(name=>selection.some(([selected])=>selected===name)))requireTargetEvidence(loadJavaEvidence(evidenceRoot,{manifest}),'native');
  console.log('Retained native API evidence: '+evidenceRoot);
  console.log('Selected native framework checks passed: '+selection.map(([name])=>name).join(', '));
 } finally {rmSync(project,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))verifyFramework();
