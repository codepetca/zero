import contracts from '../extension/src/sharing/contracts.js';
import { canonical } from './registry.mjs';
import { freezeRequest, ingestRequest, reportAttempt } from './requests.mjs';
import { PublicationService } from './publication.mjs';
import { buildGamePackage } from './game-package.mjs';
import { byteHash } from './file-storage.mjs';
import { REGISTRY_REPOSITORY, REGISTRY_BRANCH } from './github-registry.mjs';

export const LIBRARY_EXECUTION_GATE = 'Library publication is closed pending managed execution acceptance';
export const LIBRARY_EVIDENCE_CONTRACT = Object.freeze({schema:1,required:['requestFingerprint','sourceDigest','commit','policyRevision','artifacts','status','provenance'],authority:'Separately accepted fixed managed workflow verifier; student CI/local receipts grant no authority',implementationActive:false});

function sourceFailure(message) { return Object.assign(new Error(message),{kind:'source-failure'}); }
function executionGate() {return Object.assign(new Error(LIBRARY_EXECUTION_GATE),{code:'EXECUTION_GATE'});}
function sourceDescriptor(request, files) {
  const name=request.kind==='game'?'zero-game.json':'zero-library.json';
  const file=files.find(value=>value.path===name);
  if(!file)throw sourceFailure('Committed sharing descriptor missing: '+name);
  let descriptor;try{descriptor=contracts.validateDescriptor(JSON.parse(Buffer.from(file.bytes ?? file.data).toString('utf8')));}catch{throw sourceFailure('Committed sharing descriptor is invalid');}
  if(canonical(descriptor)!==canonical(request.descriptor))throw sourceFailure('Committed descriptor differs from the frozen publication request');
}

/** Game snapshots undergo structural packaging only. No submitted Java,
 * scripts, POM, tests, workflow or local passing receipt is ever executed. */
export function createSharingPlatform({reader,registry,storage,artifactOrigin,policyRevision}) {
  if(!reader?.publicationIssue||!reader?.source||!reader?.repository||!registry||!storage||! /^[a-f0-9]{40}$/.test(policyRevision||''))throw new Error('Trusted reader, registry, storage and exact policy revision required');
  const receipts=new WeakSet(), observedRepositories=new Map();
  const service=new PublicationService({registry,storage,artifactOrigin,
    verifyEvidence:async evidence=>receipts.has(evidence),
    resolveRepositoryMetadata:async id=>{
      const name=observedRepositories.get(id);
      if(!name)throw new Error('Repository binding is unavailable; prepare the immutable request again');
      return reader.repository(name);
    }
  });
  async function prepareIssue(issueNumber,{persist=false}={}) {
    const observed=await reader.publicationIssue(issueNumber,{repository:REGISTRY_REPOSITORY});
    if(observed.issueState==='closed') {
      if(persist)await registry.update(state=>{for(const record of Object.values(state.requests))if(record.issueIds.includes(observed.issueId)&&!record.releaseKey)record.status='cancelled';});
      return {record:{id:null,frozen:observed.request,status:'closed',releaseKey:null},files:[],included:[],publicationEnabled:false};
    }
    if(observed.request.policyRevision!==policyRevision)throw sourceFailure('Request targets a different policy revision; prepare it again');
    const source=await reader.source(observed.request);
    sourceDescriptor(observed.request,source.files);
    const input={...observed,repositoryMetadata:source.repositoryMetadata,sourceDigest:source.sourceDigest};
    const frozen=freezeRequest(input);
    observedRepositories.set(observed.request.repository.id,`${source.repositoryMetadata.owner}/${source.repositoryMetadata.name}`);
    let record;
    if(persist)record=await ingestRequest(registry,input);
    else record={id:frozen.id,frozen:frozen.frozen,status:'preview',releaseKey:null};
    return {record,files:source.files,included:observed.request.kind==='game'?buildGamePackage({files:source.files}).files.map(file=>file.path):[],publicationEnabled:observed.request.kind==='game'};
  }
  async function prepareRecord(record) {
    if(record.frozen.kind==='library')throw executionGate();
    const {sourceDigest,...request}=record.frozen;
    const source=await reader.source(request);
    if(source.sourceDigest!==sourceDigest)throw sourceFailure('Frozen source digest changed');
    sourceDescriptor(request,source.files);
    observedRepositories.set(request.repository.id,`${source.repositoryMetadata.owner}/${source.repositoryMetadata.name}`);
    let packaged;try{packaged=buildGamePackage({files:source.files});}catch(error){throw sourceFailure(error.message);}
    const artifacts={zip:packaged.bytes};
    const previewName=request.descriptor.preview;
    if(previewName) {
      const preview=source.files.find(file=>file.path===previewName);
      const bytes=preview&&Buffer.from(preview.bytes ?? preview.data);
      if(!bytes||bytes.length>contracts.LIMITS.artifactBytes||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw sourceFailure('Committed PNG preview is missing or invalid');
      artifacts.preview=bytes;
    }
    const evidence={status:'passed',requestFingerprint:record.id,sourceDigest,commit:request.commit,policyRevision,
      artifacts:Object.fromEntries(Object.entries(artifacts).map(([kind,bytes])=>[kind,{size:bytes.length,sha256:byteHash(bytes)}])),
      provenance:{kind:'trusted-game-packaging',schema:1,policyRevision,execution:'none'}};
    receipts.add(evidence);
    return {evidence,artifacts};
  }
  return {
    prepareIssue,
    async publishIssue(issueNumber) {
      const {record}=await prepareIssue(issueNumber,{persist:true});
      if(record.status==='closed')throw sourceFailure('Publication issue is closed; no unaccepted request will be published');
      if(record.frozen.kind==='library') {await reportAttempt(registry,record.id,{kind:'infrastructure-failure',maxInfrastructureRetries:1,message:LIBRARY_EXECUTION_GATE});throw executionGate();}
      return service.publish({requestId:record.id,...await prepareRecord(record)});
    },
    async reconcile({issueNumbers,limit=150,page,offset,maxPages=10}={}) {
      if(issueNumbers!==undefined&&(!Array.isArray(issueNumbers)||issueNumbers.length>150))throw new Error('Use a finite issue page of at most 150');
      const startCursor=structuredClone((await registry.read()).state.inbox);
      if(page===undefined){page=startCursor.page;offset=offset??startCursor.offset;}else offset=offset??0;
      if(!Number.isInteger(page)||page<1||page>1000||!Number.isInteger(offset)||offset<0||offset>=100||!Number.isInteger(maxPages)||maxPages<1||maxPages>10)throw new Error('Invalid bounded inbox continuation');
      const intake=[];let continuation=null,exhausted=issueNumbers!==undefined;
      const ingestNumber=async number=>{try{const {record}=await prepareIssue(number,{persist:true});intake.push({issueNumber:number,requestId:record.id});}catch(error){intake.push({issueNumber:number,status:'rejected',message:publicError(error)});}};
      if(issueNumbers)for(const number of issueNumbers)await ingestNumber(number);
      else {
        if(!reader.publicationIssues)throw new Error('Trusted publication inbox listing required');
        for(let pages=0;pages<maxPages;pages++,page++) {
          const batch=await reader.publicationIssues({repository:REGISTRY_REPOSITORY,page,perPage:100});
          for(let index=offset;index<batch.issueNumbers.length;index++) {
            if(intake.length>=150){continuation={page,offset:index};break;}
            await ingestNumber(batch.issueNumbers[index]);
          }
          offset=0;
          if(continuation)break;
          if(batch.exhausted){exhausted=true;break;}
          if(page===1000){continuation={page:1000,offset:0};break;}
          if(pages===maxPages-1)continuation={page:Math.min(page+1,1000),offset:0};
        }
      }
      if(issueNumbers===undefined)await registry.update(state=>{if(canonical(state.inbox)===canonical(startCursor))state.inbox=exhausted?{page:1,offset:0}:continuation;});
      const processing=await service.reconcile({prepare:prepareRecord,limit});
      const finalState=(await registry.read()).state;
      return {intake,processing:processing.map(value=>({...value,report:formatPublicReport(finalState.requests[value.requestId])})),inbox:{exhausted,continuation,limit:150,maxPages,capacityLimited:!!continuation&&continuation.page===1000}};
    },
    async deliverAccepted(key) {return service.deliver(key);},
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
  if(configurationMessages.has(error?.message))return error.message;
  if(error?.kind==='source-failure' && typeof error.message==='string' && error.message.length<=2000 && !/(?:token|password|secret|Bearer\s|https?:\/\/)/i.test(error.message))return error.message;
  return 'Platform unavailable; the durable request can be retried';
}
export function formatPublicReport(record) {
  return {schema:1,requestId:record.id,status:record.status,kind:record.frozen.kind,version:record.frozen.version,commit:record.frozen.commit,releaseKey:record.releaseKey,message:record.releaseKey?'Publication accepted; delivery status is recorded separately':record.status==='failed'?'Source checks failed; correct source and submit its new commit':record.status==='paused'?'Publication paused; operator action is required':'Request retained for processing'};
}
export function platformSetupDocument() {
  return {schema:1,repository:REGISTRY_REPOSITORY,registryBranch:REGISTRY_BRANCH,registryPath:'registry/state.json',libraryExecution:'closed',automaticCreation:false,roles:{reader:['public GitHub read'],publisher:['dedicated registry branch contents write','selected public Blob store read/write']},credentialsInSource:false};
}
