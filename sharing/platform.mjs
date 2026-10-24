import contracts from '../extension/src/sharing/contracts.js';
import { canonical } from './registry.mjs';
import { freezeRequest, ingestRequest, reportAttempt, cancelRequest, retryRequest, sameStableRequest } from './requests.mjs';
import sourceDiagnostics from '../extension/src/sharing/source-diagnostics.js';
import gamePreview from '../extension/src/sharing/game-preview.js';
import { PublicationService } from './publication.mjs';
import { buildGamePackage } from './game-package.mjs';
import { byteHash } from './file-storage.mjs';
import { REGISTRY_REPOSITORY, REGISTRY_BRANCH } from './github-registry.mjs';
import { fetchOfficialLibraryEvidence, verifyOfficialLibraryEvidence, verifyOfficialLibraryRun, reviewedWorkflowBytes } from './managed-library.mjs';

export const LIBRARY_EXECUTION_GATE = 'Library publication is closed pending managed execution acceptance';
export const LIBRARY_EVIDENCE_CONTRACT = Object.freeze({schema:1,required:['requestFingerprint','sourceDigest','commit','policyRevision','artifacts','status','provenance'],authority:'Separately accepted fixed managed workflow verifier; student CI/local receipts grant no authority',implementationActive:false});
// Released 0.5.19 clients stamp this reviewed game contract. Compatibility only
// preserves that request identity; all unaccepted games use this publisher's
// current source and screenshot checks, including already frozen queued work.
const COMPATIBLE_GAME_REQUEST_POLICY = '1b63ae6ce07f467ab4c4600d78507157ad3bdc7c';

function sourceFailure(message) { return Object.assign(new Error(message),{kind:'source-failure'}); }
function executionGate() {return Object.assign(new Error(LIBRARY_EXECUTION_GATE),{code:'EXECUTION_GATE'});}
function screenshot(request,files) {
  if(request.kind!=='game')return;
  if(!request.descriptor.preview)throw sourceFailure('Include a square PNG screenshot using Edit sharing details, then Commit & push and Share game again.');
  const file=files.find(value=>value.path===request.descriptor.preview);
  if(!file)throw sourceFailure('The committed game screenshot is missing. Commit & push the PNG and Share game again.');
  const bytes=Buffer.from(file.bytes??file.data);
  try{gamePreview.validateGamePreview(bytes);}catch{throw sourceFailure('Use a valid square PNG screenshot, at most 2048 × 2048 pixels and 4 MiB. Commit & push it, then Share game again.');}
  return bytes;
}
function sourceDescriptor(request, files) {
  const name=request.kind==='game'?'zero-game.json':'zero-library.json';
  const file=files.find(value=>value.path===name);
  if(!file)throw sourceFailure('Committed sharing descriptor missing: '+name);
  let descriptor;try{descriptor=contracts.validateDescriptor(JSON.parse(Buffer.from(file.bytes ?? file.data).toString('utf8')));}catch{throw sourceFailure('Committed sharing descriptor is invalid');}
  if(canonical(descriptor)!==canonical(request.descriptor))throw sourceFailure('Committed descriptor differs from the frozen publication request');
}

/** Game snapshots undergo structural packaging only. No submitted Java,
 * scripts, POM, tests, workflow or local passing receipt is ever executed. */
export function createSharingPlatform({reader,registry,storage,artifactOrigin,policyRevision,libraryPublicationEnabled=false,checkLibrarySource,officialLibraryEvidence=fetchOfficialLibraryEvidence,now=Date.now,wallBudgetMs=900000,sourceTimeoutMs=30000}) {
  if(!reader?.publicationIssue||!reader?.publicationIssueState||!reader?.source||!reader?.repository||!registry||!storage||! /^[a-f0-9]{40}$/.test(policyRevision||''))throw new Error('Trusted reader, registry, storage and exact policy revision required');
  if(!Number.isFinite(wallBudgetMs)||wallBudgetMs<1||wallBudgetMs>1200000||!Number.isInteger(sourceTimeoutMs)||sourceTimeoutMs<1||sourceTimeoutMs>60000)throw new Error('Invalid finite publication budget');
  if(typeof libraryPublicationEnabled!=='boolean')throw new Error('Invalid library publication gate');
  const receipts=new WeakSet(), observedRepositories=new Map(), sourceCache=new Map(), publicationBudgets=new Map();
  function assertRequestPolicy(request) {
    if(request.descriptor?.schema===2)throw sourceFailure('Core-dependent library schema 2 is not enabled for hosted preparation.');
    if(request.policyRevision!==policyRevision && !(request.kind==='game' && request.policyRevision===COMPATIBLE_GAME_REQUEST_POLICY))throw sourceFailure('Request targets a different policy revision; prepare it again');
  }
  function validationSignal(requestId){const budget=publicationBudgets.get(requestId);if(budget&&now()-budget.started>=wallBudgetMs)throw new Error('Publication wall budget exhausted before acceptance');return budget?AbortSignal.any([budget.signal,AbortSignal.timeout(sourceTimeoutMs)]):AbortSignal.timeout(sourceTimeoutMs);}
  async function assertOpen(record,{signal}={}) {
    for(const number of record.issueIds) {
      const observed=await reader.publicationIssueState(Number(number),{signal});
      if(observed.authenticatedActor.githubId!==record.frozen.requester.githubId)throw sourceFailure('Observed issue author differs from the frozen request');
      if(observed.issueState==='open')return;
    }
    if(!record.releaseKey)await cancelRequest(registry,record.id);
    throw sourceFailure('Publication issue is closed; no unaccepted request will be published');
  }
  const service=new PublicationService({registry,storage,artifactOrigin,
    verifyEvidence:async evidence=>receipts.has(evidence),
    beforeAccept:async({requestId})=>assertOpen((await registry.read()).state.requests[requestId],{signal:validationSignal(requestId)}),
    resolveRepositoryMetadata:async(id,{requestId}={})=>{
      const name=observedRepositories.get(id);
      if(!name)throw new Error('Repository binding is unavailable; prepare the immutable request again');
      return reader.repositoryById?reader.repositoryById(id,{signal:validationSignal(requestId)}):reader.repository(name,{signal:validationSignal(requestId)});
    }
  });
  async function prepareIssue(issueNumber,{persist=false,signal=AbortSignal.timeout(sourceTimeoutMs)}={}) {
    const observed=await reader.publicationIssue(issueNumber,{repository:REGISTRY_REPOSITORY,signal});
    if(observed.issueState==='closed') {
      if(persist){const records=Object.values((await registry.read()).state.requests).filter(record=>record.issueIds.includes(observed.issueId)&&!record.releaseKey);for(const record of records){try{await assertOpen(record,{signal});}catch(error){if(error.kind!=='source-failure')throw error;}}}
      return {record:{id:null,frozen:observed.request,status:'closed',releaseKey:null},files:[],included:[],publicationEnabled:false};
    }
    assertRequestPolicy(observed.request);
    const known=Object.values((await registry.read()).state.requests).find(record=>sameStableRequest(record.frozen,observed.request,{includeSourceDigest:false}));
    if(known){const record=persist?await ingestRequest(registry,{...observed,sourceDigest:known.frozen.sourceDigest},{resumeCancelled:observed.issueState==='open'}):structuredClone(known);return {record,files:null,included:[],publicationEnabled:record.frozen.kind==='game',cached:true};}
    const source=await reader.source(observed.request,{signal});
    const input={...observed,repositoryMetadata:source.repositoryMetadata,sourceDigest:source.sourceDigest};
    const frozen=freezeRequest(input);
    observedRepositories.set(observed.request.repository.id,`${source.repositoryMetadata.owner}/${source.repositoryMetadata.name}`);
    let record;
    if(persist)record=await ingestRequest(registry,input);
    else record={id:frozen.id,frozen:frozen.frozen,status:'preview',releaseKey:null};
    try{
      sourceDescriptor(observed.request,source.files);
      screenshot(observed.request,source.files);
      const included=observed.request.kind==='game'?buildGamePackage({files:source.files}).files.map(file=>file.path):[];
      sourceCache.clear();sourceCache.set(record.id,source);
      return {record,files:source.files,included,publicationEnabled:observed.request.kind==='game'};
    }catch(error){
      sourceCache.delete(record.id);
      const failure=error.kind==='source-failure'?error:sourceFailure(error.message);
      if(persist)await reportAttempt(registry,record.id,{kind:'source-failure',message:publicError(failure),sourceDiagnostic:sourceDiagnostics.diagnosticFromError(failure)});
      throw failure;
    }
  }
  async function prepareRecord(record) {
    assertRequestPolicy(record.frozen);
    if(record.frozen.kind==='library')throw executionGate();
    const signal=validationSignal(record.id);
    await assertOpen(record,{signal});
    const {sourceDigest,...request}=record.frozen;
    const source=sourceCache.get(record.id)||await reader.source(request,{signal});
    sourceCache.delete(record.id);
    if(source.sourceDigest!==sourceDigest)throw sourceFailure('Frozen source digest changed');
    sourceDescriptor(request,source.files);
    observedRepositories.set(request.repository.id,`${source.repositoryMetadata.owner}/${source.repositoryMetadata.name}`);
    let packaged;try{packaged=buildGamePackage({files:source.files});}catch(error){throw sourceFailure(error.message);}
    const artifacts={zip:packaged.bytes};
    let web;
    if(request.web){
      if(typeof reader.verifyWebPublication!=='function')throw new Error('Trusted web publication verifier unavailable');
      web=await reader.verifyWebPublication(request,{signal});
      if(canonical(web)!==canonical(request.web))throw sourceFailure('Verified web publication differs from the frozen request');
    }
    artifacts.preview=screenshot(request,source.files);
    // Evidence preserves the frozen client contract; provenance records the
    // exact operator-selected publisher source that performed current checks.
    const evidence={...(web?{web}:{}),status:'passed',requestFingerprint:record.id,sourceDigest,commit:request.commit,policyRevision:request.policyRevision,
      artifacts:Object.fromEntries(Object.entries(artifacts).map(([kind,bytes])=>[kind,{size:bytes.length,sha256:byteHash(bytes)}])),
      provenance:{kind:'trusted-game-packaging',schema:1,policyRevision,execution:'none'}};
    receipts.add(evidence);
    return {evidence,artifacts};
  }
  function requireLibrary(record) {
    if(!libraryPublicationEnabled)throw executionGate();
    if(!record || record.frozen.kind!=='library')throw new Error('An exact queued library request is required');
    assertRequestPolicy(record.frozen);
    return record;
  }
  async function managedPublish({requestId,runId,attempt,artifactId,token,checkOutcome='success'}) {
    const record=(await registry.read()).state.requests[requestId];
    if(!libraryPublicationEnabled)throw executionGate();
    if(!record||record.frozen.kind!=='library')throw new Error('An exact managed library request is required');
    if(record.releaseKey){if(checkOutcome!=='skipped')throw new Error('Accepted library recovery must skip candidate checks');return service.deliver(record.releaseKey);}
    requireLibrary(record);
    if(record.status!=='queued')throw new Error('Managed library request is not queued');
    if(checkOutcome==='skipped')throw new Error('Unaccepted library requires a completed check');
    try {
    const reviewedWorkflow=await reviewedWorkflowBytes();
    const official=await officialLibraryEvidence({token,runId,artifactId:checkOutcome==='success'?artifactId:undefined});
    if(checkOutcome!=='success') {
      verifyOfficialLibraryRun({record,official,runId,attempt,reviewedWorkflow,expectedConclusion:checkOutcome});
      await reportAttempt(registry,record.id,{kind:'infrastructure-failure',message:'Managed checker job did not complete',maxInfrastructureRetries:3});
      return {requestId:record.id,status:(await registry.read()).state.requests[record.id].status};
    }
    const {expectedPolicyDigest}=await import('../hub/checker/image-policy.mjs');
    const verified=verifyOfficialLibraryEvidence({record,official,runId,attempt,artifactId,reviewedWorkflow,expectedPolicyDigest:expectedPolicyDigest()});
    if(verified.receipt.status==='failed') {
      const failedStage=verified.receipt.checks.find(check=>check.passed===false)?.id;
      const code=({'fixed-build':'library-build',api:'library-api',behavior:'library-behavior',first:'library-example',second:'library-example'})[failedStage]||'source-check';
      await reportAttempt(registry,record.id,{kind:'source-failure',message:'Managed source checks failed',sourceDiagnostic:{code}});
      return {requestId:record.id,status:'failed'};
    }
    const evidence={status:'passed',requestFingerprint:record.id,sourceDigest:record.frozen.sourceDigest,
      commit:record.frozen.commit,policyRevision:record.frozen.policyRevision,
      artifacts:verified.receipt.artifacts,componentsDigest:verified.receipt.componentsDigest,
      provenance:{kind:'managed-library-check',schema:1,runId,attempt,artifactId,checkerPolicy:verified.receipt.checkerPolicy,checkerPolicyDigest:verified.receipt.checkerPolicyDigest,image:verified.receipt.image}};
    receipts.add(evidence);
    await assertOpen(record,{signal:AbortSignal.timeout(sourceTimeoutMs)});
    observedRepositories.set(record.frozen.repository.id,`${record.frozen.repository.owner}/${record.frozen.repository.name}`);
    return service.publish({requestId:record.id,evidence,artifacts:verified.artifacts,components:verified.components});
    } catch(error) {
      await reportAttempt(registry,record.id,{kind:error.kind==='source-failure'?'source-failure':'infrastructure-failure',message:'Managed publication or official evidence unavailable',maxInfrastructureRetries:3});
      throw error;
    }
  }
  return {
    prepareIssue,
    async selectLibraryForCheck() {
      if(!libraryPublicationEnabled)throw executionGate();
      const started=now();
      const state=(await registry.read()).state;
      const pending=Object.values(state.requests).find(record=>record.frozen.kind==='library'&&record.status==='delivery-pending'&&record.releaseKey);
      if(pending)return {requestId:pending.id,commit:pending.frozen.commit,recovery:true};
      const stale=Object.values(state.requests).find(record=>record.frozen.kind==='library'&&record.status==='queued'&&!record.releaseKey&&record.frozen.policyRevision!==policyRevision);
      if(stale)await reportAttempt(registry,stale.id,{kind:'source-failure',message:'Library request targets a different reviewed policy',sourceDiagnostic:{code:'source-check'}});
      for(const queued of Object.values((await registry.read()).state.requests).filter(record=>record.frozen.kind==='library'&&record.status==='queued'&&!record.releaseKey&&record.frozen.policyRevision===policyRevision)) {
        if(now()-started+sourceTimeoutMs>480000)return null;
        try {await assertOpen(queued,{signal:AbortSignal.timeout(sourceTimeoutMs)});return {requestId:queued.id,commit:queued.frozen.commit};}
        catch(error){if(error.kind!=='source-failure')throw error;}
      }
      if(!reader.publicationIssues)throw new Error('Trusted publication inbox listing required');
      const cursor=state.libraryInbox||{page:1,offset:0};
      const page=await reader.publicationIssues({repository:REGISTRY_REPOSITORY,page:cursor.page,perPage:100,signal:AbortSignal.timeout(sourceTimeoutMs)});
      for(let index=cursor.offset;index<page.issueNumbers.length;index++) {
        if(now()-started+sourceTimeoutMs>480000)break;
        const number=page.issueNumbers[index];
        const next=index===page.issueNumbers.length-1&&page.exhausted?{page:1,offset:0}:index===page.issueNumbers.length-1?{page:Math.min(cursor.page+1,1000),offset:0}:{page:cursor.page,offset:index+1};
        let selected;
        try {
          const observed=await reader.publicationIssue(number,{repository:REGISTRY_REPOSITORY,signal:AbortSignal.timeout(sourceTimeoutMs)});
          if(observed.request.kind==='library'&&observed.issueState==='open') {
            const {record}=await prepareIssue(number,{persist:true});
            if(record.status==='queued')selected={requestId:record.id,commit:record.frozen.commit};
          }
        } catch { /* Invalid/closed inbox entries cannot starve durable scanning. */ }
        await registry.update(state=>{state.libraryInbox=next;});
        sourceCache.clear();
        if(selected)return selected;
      }
      if(page.issueNumbers.length===0)await registry.update(state=>{state.libraryInbox=page.exhausted?{page:1,offset:0}:{page:Math.min(cursor.page+1,1000),offset:0};});
      return null;
    },
    async checkLibraryRequest(requestId) {
      const record=requireLibrary((await registry.read()).state.requests[requestId]);
      if(record.status!=='queued'||record.releaseKey)throw new Error('Managed library request is not queued');
      const {sourceDigest,...request}=record.frozen;
      const source=await reader.source(request,{signal:AbortSignal.timeout(sourceTimeoutMs)});
      if(source.sourceDigest!==sourceDigest)throw sourceFailure('Frozen source digest changed');
      const checker=checkLibrarySource|| (await import('./library-checker.mjs')).checkLibrarySource;
      const result=await checker({request,files:source.files,sourceDigest});
      if(result?.sourceDigest!==sourceDigest)throw new Error('Managed checker source digest mismatch');
      return {record,result};
    },
    publishManagedLibrary:managedPublish,
    async publishIssue(issueNumber) {
      const started=now(),signal=AbortSignal.timeout(wallBudgetMs);
      const {record}=await prepareIssue(issueNumber,{persist:true,signal:AbortSignal.any([signal,AbortSignal.timeout(sourceTimeoutMs)])});
      publicationBudgets.set(record.id,{started,signal});
      try{
        if(record.releaseKey)return await service.deliver(record.releaseKey);
        if(record.status==='closed')throw sourceFailure('Publication issue is closed; no unaccepted request will be published');
        if(record.frozen.kind==='library')throw executionGate();
        return await service.publish({requestId:record.id,...await prepareRecord(record)});
      }catch(error){
        if(record.id)await reportAttempt(registry,record.id,{kind:error.kind==='source-failure'?'source-failure':'infrastructure-failure',maxInfrastructureRetries:error.code==='EXECUTION_GATE'?1:3,message:publicError(error),...(error.kind==='source-failure'?{sourceDiagnostic:sourceDiagnostics.diagnosticFromError(error)}:{})});
        throw error;
      }finally{publicationBudgets.delete(record.id);sourceCache.delete(record.id);}
    },
    async reconcile({issueNumbers,limit=150,page,offset,maxPages=10}={}) {
      if(issueNumbers!==undefined&&(!Array.isArray(issueNumbers)||issueNumbers.length>150))throw new Error('Use a finite issue page of at most 150');
      if(!Number.isInteger(limit)||limit<1||limit>150)throw new Error('Invalid finite processing limit');
      const started=now(),deadline=AbortSignal.timeout(wallBudgetMs),hasTime=()=>now()-started<wallBudgetMs;
      const canIntake=()=>now()-started+sourceTimeoutMs<wallBudgetMs;
      const operationSignal=()=>AbortSignal.timeout(Math.max(1,Math.min(sourceTimeoutMs,Math.floor(wallBudgetMs-(now()-started)))));
      const initial=(await registry.read()).state;
      let expectedCursor=structuredClone(initial.inbox),cursorOwned=true;
      if(page===undefined){page=expectedCursor.page;offset=offset??expectedCursor.offset;}else offset=offset??0;
      if(!Number.isInteger(page)||page<1||page>1000||!Number.isInteger(offset)||offset<0||offset>=100||!Number.isInteger(maxPages)||maxPages<1||maxPages>10)throw new Error('Invalid bounded inbox continuation');
      const intake=[],processing=[],attempted=new Set();let continuation=null,exhausted=issueNumbers!==undefined;
      async function checkpoint(next) {
        const result=await registry.update(state=>{if(canonical(state.inbox)!==canonical(expectedCursor))return false;state.inbox=next;return true;});
        cursorOwned=result.value; if(cursorOwned)expectedCursor=structuredClone(next);
        return cursorOwned;
      }
      async function processOne(record) {
        if(!record||record.frozen.kind==='library'||!['queued','delivery-pending'].includes(record.status)||attempted.has(record.id)||processing.length>=limit||!hasTime())return;
        attempted.add(record.id);publicationBudgets.set(record.id,{started,signal:deadline});
        try{
          const release=record.releaseKey?await service.deliver(record.releaseKey):await service.publish({requestId:record.id,...await prepareRecord(record)});
          processing.push({requestId:record.id,release});
        }catch(error){
          await reportAttempt(registry,record.id,{kind:error.kind==='source-failure'?'source-failure':'infrastructure-failure',message:publicError(error),maxInfrastructureRetries:error.code==='EXECUTION_GATE'?1:3,...(error.kind==='source-failure'?{sourceDiagnostic:sourceDiagnostics.diagnosticFromError(error)}:{})});
          processing.push({requestId:record.id,error:publicError(error)});
        }finally{publicationBudgets.delete(record.id);sourceCache.delete(record.id);}
      }
      // Accepted delivery and frozen queued work cannot be starved by a large
      // intake page. Every attempted request is visited at most once per run.
      const durable=Object.values(initial.requests).sort((a,b)=>Number(!!b.releaseKey)-Number(!!a.releaseKey));
      for(const record of durable){if(!hasTime())break;await processOne(record);}
      async function ingestNumber(number) {
        try{const observed=await reader.publicationIssue(number,{repository:REGISTRY_REPOSITORY,signal:operationSignal()});if(observed.request.kind==='library')return null;const {record}=await prepareIssue(number,{persist:true,signal:operationSignal()});intake.push({issueNumber:number,requestId:record.id});return record;}
        catch(error){intake.push({issueNumber:number,status:'rejected',message:publicError(error)});return null;}
      }
      if(issueNumbers) {
        for(const number of issueNumbers){if(!canIntake())break;await processOne(await ingestNumber(number));}
      } else if(canIntake()) {
        if(!reader.publicationIssues)throw new Error('Trusted publication inbox listing required');
        outer:for(let pages=0;pages<maxPages;pages++,page++) {
          const batch=await reader.publicationIssues({repository:REGISTRY_REPOSITORY,page,perPage:100,signal:operationSignal()});
          for(let index=offset;index<batch.issueNumbers.length;index++) {
            if(!canIntake()||intake.length>=150){continuation={page,offset:index};break outer;}
            const record=await ingestNumber(batch.issueNumbers[index]);
            const last=index===batch.issueNumbers.length-1;
            const next=last?(batch.exhausted?{page:1,offset:0}:{page:Math.min(page+1,1000),offset:0}):{page,offset:index+1};
            // Commit after each item, before packaging/upload can be interrupted.
            if(!await checkpoint(next)){continuation=(await registry.read()).state.inbox;break outer;}
            await processOne(record);
            if(last&&batch.exhausted){exhausted=true;break outer;}
          }
          offset=0;
          if(batch.issueNumbers.length===0&&!await checkpoint(batch.exhausted?{page:1,offset:0}:{page:Math.min(page+1,1000),offset:0})){continuation=(await registry.read()).state.inbox;break;}
          if(batch.exhausted){exhausted=true;break;}
          if(page===1000||pages===maxPages-1||!hasTime()){continuation=expectedCursor;break;}
        }
      }
      if(!exhausted&&!continuation)continuation=(await registry.read()).state.inbox;
      sourceCache.clear();
      await service.refreshCatalog();
      const finalState=(await registry.read()).state;
      return {intake,processing:processing.map(value=>({...value,report:formatPublicReport(finalState.requests[value.requestId])})),inbox:{exhausted,continuation,limit:150,maxPages,capacityLimited:!!continuation&&continuation.page===1000,wallBudgetMs,budgetExhausted:!canIntake(),cursor:finalState.inbox}};
    },
    async deliverAccepted(key) {return service.deliver(key);},
    async retryPaused(requestId) {
      const record=(await registry.read()).state.requests[requestId];
      if(!record)throw new Error('Unknown request');
      if(record.frozen.kind!=='game'&&!libraryPublicationEnabled)throw executionGate();
      return retryRequest(registry,requestId);
    },
    async setAvailability(key,status) {
      const accepted=(await registry.read()).state.releases[key];
      if(!accepted)throw new Error('Unknown accepted release');
      if(accepted.release.kind!=='game'&&!libraryPublicationEnabled)throw executionGate();
      if(status==='available')await service.deliver(key);
      return service.setAvailability(key,status);
    },
    async cleanupPracticeListings(keys,{execute=false}={}) {
      if(execute&&!libraryPublicationEnabled)throw executionGate();
      return service.cleanupPracticeListings(keys,{execute});
    },
    async readStatus() {
      const {state,revision}=await registry.read();
      return {schema:1,revision,sequence:state.sequence,counts:Object.fromEntries(['queued','failed','cancelled','paused','delivery-pending','available'].map(status=>[status,Object.values(state.requests).filter(request=>request.status===status).length])),catalog:state.catalog,inbox:state.inbox};
    },
    async refreshCatalog() {return service.refreshCatalog();}
  };
}

export function publicError(error) {
  // Remote provider bodies/stacks/URLs and credential-bearing error text are
  // never copied into an issue or console report. Known source failures are data.
  if(error?.code==='EXECUTION_GATE')return LIBRARY_EXECUTION_GATE;
  const configurationMessages=new Set(['Unknown sharing command','Duplicate execution flag','Unsupported sharing argument','Positive issue number required','Use a finite comma-separated issue list','At most 150 issue numbers supported','Execution requires the explicit publisher role','An exact issue number is required','An exact accepted release key is required','Explicit platform configuration file required','Publication remains disabled in the reviewed platform configuration','Platform configuration invalid','Configured public Blob origin invalid','Explicit registry credential required','Explicit Blob SDK and publisher credential required','Registry branch/state missing; explicit operator setup required']);
  for(const message of ['An exact frozen request fingerprint is required','Only infrastructure-paused requests can be manually retried','Unknown request','Unknown accepted release','Choose 1–150 distinct exact practice release keys','Only exact delivery-ready tutorial practice releases can be cleaned up','Practice availability changed; review the exact selection again'])configurationMessages.add(message);
  if(configurationMessages.has(error?.message))return error.message;
  if(error?.kind==='source-failure' && typeof error.message==='string' && error.message.length<=2000 && !/(?:token|password|secret|Bearer\s|https?:\/\/)/i.test(error.message))return error.message;
  return 'Platform unavailable; the durable request can be retried';
}
export function formatPublicReport(record) {
  const correction=sourceDiagnostics.publicCorrection(record);
  return {schema:1,requestId:record.id,status:record.status,kind:record.frozen.kind,version:record.frozen.version,commit:record.frozen.commit,releaseKey:record.releaseKey,...(correction?{correction}:{}),message:record.releaseKey?'Publication accepted; delivery status is recorded separately':record.status==='failed'?'Source checks failed; correct source and submit its new commit':record.status==='paused'?'Publication paused; operator action is required':record.status==='cancelled'?'Publication request cancelled':'Request retained for processing'};
}
export function platformSetupDocument() {
  return {schema:1,repository:REGISTRY_REPOSITORY,registryBranch:REGISTRY_BRANCH,registryPath:'registry/state.json',libraryExecution:'closed',automaticCreation:false,roles:{reader:['public GitHub read'],publisher:['dedicated registry branch contents write','selected public Blob store read/write']},credentialsInSource:false};
}
