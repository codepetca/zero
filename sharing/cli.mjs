import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import github from '../extension/src/sharing/github.js';
import { FileRegistry } from './registry.mjs';
import { createGitHubRegistryAdapter, REGISTRY_REPOSITORY, REGISTRY_BRANCH } from './github-registry.mjs';
import { BlobStorage } from './blob-storage.mjs';
import { createSharingPlatform, platformSetupDocument, publicError } from './platform.mjs';
import { writeLibraryCheck } from './managed-library.mjs';

export function validatePlatformConfig(config) {
  const required=['schema','repository','registryBranch','artifactOrigin','policyRevision','gamePublicationEnabled'];
  if(!config || config.schema!==1 || Object.keys(config).some(key=>!required.includes(key)) || required.some(key=>!Object.hasOwn(config,key)) || config.repository!==REGISTRY_REPOSITORY || config.registryBranch!==REGISTRY_BRANCH || !/^[a-f0-9]{40}$/.test(config.policyRevision) || typeof config.gamePublicationEnabled!=='boolean')throw new Error('Platform configuration invalid');
  const origin=new URL(config.artifactOrigin);
  if(origin.origin!==config.artifactOrigin || origin.protocol!=='https:' || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(origin.hostname))throw new Error('Configured public Blob origin invalid');
  return {...config};
}
export function validateLibraryPlatformConfig(config) {
  if(!config || typeof config!=='object' || Array.isArray(config) || Object.keys(config).some(key=>!['schema','repository','registryBranch','artifactOrigin','policyRevision','gamePublicationEnabled','libraryPublicationEnabled'].includes(key)) || typeof config.libraryPublicationEnabled!=='boolean')throw new Error('Platform configuration invalid');
  const {libraryPublicationEnabled,...shared}=config;
  return {...validatePlatformConfig(shared),libraryPublicationEnabled};
}
export function parseArguments(argv) {
  const commands=['setup','status','prepare','publish','reconcile','deliver','retry','withdraw','restore','library-intake','library-check','library-publish','library-practice-cleanup'];
  const options={command:argv[0]||'setup',execute:false};
  if(!commands.includes(options.command))throw new Error('Unknown sharing command');
  for(let index=1;index<argv.length;index++) {
    const flag=argv[index];
    if(flag==='--execute'){if(options.execute)throw new Error('Duplicate execution flag');options.execute=true;continue;}
    const name={'--config':'config','--issue':'issue','--issues':'issues','--release':'release','--releases':'releases','--role':'role','--page':'page','--offset':'offset','--request':'request','--run':'run','--attempt':'attempt','--artifact':'artifact','--out':'out','--outcome':'outcome'}[flag];
    if(!name||options[name]!==undefined||!argv[index+1]||argv[index+1].startsWith('--'))throw new Error('Unsupported sharing argument');
    options[name]=argv[++index];
  }
  if(options.issue!==undefined){if(!/^[1-9][0-9]*$/.test(options.issue)||!Number.isSafeInteger(Number(options.issue)))throw new Error('Positive issue number required');options.issue=Number(options.issue);}
  if(options.issues!==undefined){if(!/^[1-9][0-9]*(?:,[1-9][0-9]*)*$/.test(options.issues))throw new Error('Use a finite comma-separated issue list');options.issues=options.issues.split(',').map(Number);if(options.issues.length>150||options.issues.some(value=>!Number.isSafeInteger(value)))throw new Error('At most 150 issue numbers supported');}
  for(const field of ['page','offset'])if(options[field]!==undefined){if(!/^[0-9]+$/.test(options[field]))throw new Error('Invalid bounded inbox continuation');options[field]=Number(options[field]);}
  if(options.command==='library-practice-cleanup') {
    options.releases=(options.releases||'').split(',');
    if(options.releases.length>150||new Set(options.releases).size!==options.releases.length||options.releases.some(key=>!/^library\/lib-r[1-9][0-9]*-tutorial-credits-badge\/(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(key)))throw new Error('Choose 1–150 distinct exact practice release keys');
  } else if(options.releases!==undefined)throw new Error('Unsupported sharing argument');
  if(options.execute && options.role!==(options.command==='library-intake'?'intake':options.command==='library-check'?'worker':'publisher'))throw new Error('Execution requires the explicit publisher role');
  if(['prepare','publish'].includes(options.command)&&!options.issue)throw new Error('An exact issue number is required');
  if(['deliver','withdraw','restore'].includes(options.command)&&!/^(game|library)\/(game|lib)-r[1-9][0-9]*-[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/[0-9]+\.[0-9]+\.[0-9]+$/.test(options.release||''))throw new Error('An exact accepted release key is required');
  if(options.command==='retry'&&!/^[a-f0-9]{64}$/.test(options.request||''))throw new Error('An exact frozen request fingerprint is required');
  if(['library-intake','library-check','library-publish'].includes(options.command)) {
    if(['library-check','library-publish'].includes(options.command)&&!/^[a-f0-9]{64}$/.test(options.request||''))throw new Error('An exact frozen request fingerprint is required');
    for(const key of ['run','attempt',...(options.command==='library-publish'&&options.outcome==='success'?['artifact']:[])])if(options[key]!==undefined){if(!/^[1-9][0-9]*$/.test(options[key])||!Number.isSafeInteger(Number(options[key])))throw new Error('Exact managed workflow identity required');options[key]=Number(options[key]);}
    if(['library-check','library-publish'].includes(options.command)&&(!options.run||!options.attempt))throw new Error('Exact managed workflow identity required');
    if(options.command==='library-check'&&(!options.out||!options.out.startsWith('/')))throw new Error('Absolute managed check output required');
    if(options.command==='library-publish'&&(!['success','failure','cancelled','timed_out','skipped'].includes(options.outcome)||options.outcome==='success'&&!options.artifact))throw new Error('Exact managed workflow outcome required');
  }
  return options;
}
async function defaultDependencies(config,execute,environment,role) {
  const publisher=execute&&role==='publisher',writer=execute&&role!=='worker';
  const adapter=createGitHubRegistryAdapter({token:writer?environment.ZERO_REGISTRY_TOKEN:environment.ZERO_SOURCE_READ_TOKEN,readOnly:!writer});
  const registry=new FileRegistry({adapter,maxRetries:8});
  const reader=github.createGitHubReader({token:environment.ZERO_SOURCE_READ_TOKEN});
  let storage;
  if(publisher){const sdk=await import('@vercel/blob');storage=new BlobStorage({sdk,token:environment.ZERO_BLOB_TOKEN,artifactOrigin:config.artifactOrigin});}
  else storage={get:()=>{throw new Error('Dry run has no storage actions');}};
  return createSharingPlatform({reader,registry,storage,artifactOrigin:config.artifactOrigin,policyRevision:config.policyRevision,libraryPublicationEnabled:config.libraryPublicationEnabled===true});
}

/** No comments are posted, credentials configured, branches provisioned,
 * candidate commands executed, or writes performed without both flags/config. */
export async function runCli(argv,{loadConfig=async filename=>JSON.parse(await readFile(filename,'utf8')),createPlatform=defaultDependencies,environment=process.env}={}) {
  const options=parseArguments(argv);
  if(options.command==='setup')return platformSetupDocument();
  if(!options.config)throw new Error('Explicit platform configuration file required');
  const libraryCommand=options.command.startsWith('library-');
  const config=libraryCommand?validateLibraryPlatformConfig(await loadConfig(options.config)):validatePlatformConfig(await loadConfig(options.config));
  if(options.execute&&!(libraryCommand?config.libraryPublicationEnabled:config.gamePublicationEnabled))throw new Error('Publication remains disabled in the reviewed platform configuration');
  const platform=await createPlatform(config,options.execute,environment,options.role);
  if(libraryCommand) {
    if(options.command==='library-practice-cleanup')return platform.cleanupPracticeListings(options.releases,{execute:options.execute});
    if(!options.execute)return {mode:'dry-run',action:options.command,libraryPublicationEnabled:config.libraryPublicationEnabled};
    if(options.command==='library-intake')return {selected:await platform.selectLibraryForCheck()};
    if(options.command==='library-check'){
      const {record,result}=await platform.checkLibraryRequest(options.request);
      const written=await writeLibraryCheck(options.out,{record,result,runId:options.run,attempt:options.attempt});
      return {requestId:record.id,artifactName:written.name,status:written.receipt.status};
    }
    const outcome=await platform.publishManagedLibrary({requestId:options.request,runId:options.run,attempt:options.attempt,artifactId:options.artifact,token:environment.ZERO_ACTIONS_READ_TOKEN,checkOutcome:options.outcome});
    return {requestId:options.request,status:outcome.status||outcome.delivery};
  }
  if(options.command==='status')return platform.readStatus();
  if(options.command==='prepare') {
    const result=await platform.prepareIssue(options.issue,{persist:options.execute});
    return {mode:options.execute?'intake':'dry-run',requestId:result.record.id,kind:result.record.frozen.kind,version:result.record.frozen.version,commit:result.record.frozen.commit,included:result.included,publicationEnabled:result.publicationEnabled};
  }
  if(!options.execute) {
    if(options.command==='publish'){const result=await platform.prepareIssue(options.issue,{persist:false});return {mode:'dry-run',requestId:result.record.id,publicationEnabled:result.publicationEnabled,included:result.included};}
    return {mode:'dry-run',action:options.command,issues:options.issues||[],releaseKey:options.release||null,requestId:options.request||null,status:await platform.readStatus()};
  }
  if(options.command==='publish'){const release=await platform.publishIssue(options.issue);return {status:release.delivery,release:release.release.id,version:release.release.version};}
  if(options.command==='deliver'){const release=await platform.deliverAccepted(options.release);return {status:release.delivery,release:release.release.id,version:release.release.version};}
  if(options.command==='retry'){const record=await platform.retryPaused(options.request);return {requestId:record.id,status:record.status};}
  if(['withdraw','restore'].includes(options.command)){const status=options.command==='withdraw'?'withdrawn':'available';await platform.setAvailability(options.release,status);return {releaseKey:options.release,status};}
  const result=await platform.reconcile({issueNumbers:options.issues,page:options.page,offset:options.offset});
  return {intake:result.intake,inbox:result.inbox,processing:result.processing.map(value=>({requestId:value.requestId,status:value.report?.status||(value.error?'retry-required':value.release?.delivery||value.status),message:value.error?value.report?.message||'Platform unavailable; request retained':undefined,...(value.report?.correction?{correction:value.report.correction}:{})})).map(value=>Object.fromEntries(Object.entries(value).filter(([,field])=>field!==undefined)))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{process.stdout.write(JSON.stringify(await runCli(process.argv.slice(2)))+'\n');}
  catch(error){process.stderr.write(publicError(error)+'\n');process.exitCode=1;}
}
