import {createJamService} from '../service.mjs';
import {digest,manifestData,validateState} from '../schema.mjs';

export const creator={id:'11',login:'creator'},maintainer={id:'22',login:'maintainer'},participant={id:'33',login:'student'};
export const verifiedPages=async(repository,pagesUrl)=>({status:'verified',pagesUrl,repositoryId:repository.id,ownerId:repository.ownerId});
export const COMMIT='a'.repeat(40),NEXT_COMMIT='b'.repeat(40);
export function manifest(overrides={}) {
  return {schema:1,templateVersion:'1.0.0',type:'game',title:'Jam title',summary:'A public creative jam.',theme:'Space',rules:'Make your own work.',eligibility:'Everyone',websiteUrl:'https://creator.github.io/jam/',timezone:'America/Toronto',schedule:{registrationOpensAt:'2030-01-01T00:00:00Z',registrationClosesAt:'2030-01-03T00:00:00Z',startsAt:'2030-01-01T00:00:00Z',submissionsOpenAt:'2030-01-02T00:00:00Z',submissionsCloseAt:'2030-01-04T00:00:00Z'},...overrides};
}
export function memoryStore() {
  const records=new Map(); let sequence=0,settlements={schema:1,operations:{}};
  return {records,bump(){sequence++;},beforeCas:null,afterCas:null,async snapshot(){const copy=new Map(structuredClone([...records]));const rev=sequence.toString(16).padStart(40,'0');return {revision:rev,settlements:structuredClone(settlements),ids:[...copy.keys()],async read(id){return {state:copy.get(id)?.state||null};}};},async read(id){const item=records.get(id);return item?structuredClone(item):{state:null,revision:null};},async list(){return [...records.keys()];},async compareAndSwap(id,expected,state,update={}){if(this.beforeCas)await this.beforeCas(id,expected,state);const found=records.get(id);if(sequence.toString(16).padStart(40,'0')!==expected)return false;sequence++;if(id!==null)records.set(id,{state:structuredClone(state),revision:`revision-${sequence}`});if(update.settlements)settlements=structuredClone(update.settlements);if(this.afterCas)await this.afterCas(id,expected,state);return true;}};
}
export function fixture({canCreateJam=()=>true,limits={},maintainerIds=[maintainer.id],source,verifyRepository,pagesBindingReader}={}) {
  const store=memoryStore();let time=Date.parse('2030-01-02T12:00:00Z');let calls=0;
  const verifySource=async input=>{calls++;if(source)return source(input);return {repository:{id:input.manifest?'101':'202',ownerId:input.actor.id,fullName:`${input.actor.login}/${input.manifest?'jam':'project'}`,commit:input.commit},...(input.manifest?{manifest:manifest(input.commit===NEXT_COMMIT?{title:'Updated jam',rules:'Updated rules'}:{})}:{})};};
  const service=createJamService({canCreateJam,store,verifySource,pagesBindingReader,verifyRepository:verifyRepository|| (async ({actor})=>({repository:{id:'202',ownerId:actor.id,fullName:`${actor.login}/project`}})),maintainerIds,now:()=>time,limits});
  return {store,service,legacySource:source,setTime:value=>{time=typeof value==='number'?value:Date.parse(value);},calls:()=>calls};
}
// Archived creator-hosted fixtures exercise compatibility without reopening intake.
export async function legacyProposal(f,{operationId='propose-0001',commit=COMMIT,data=manifest(),actor=creator}={}) {
  const id='jam-101',stamp='2030-01-02T12:00:00.000Z';
  const stored=await f.store.read(id);
  const state=stored.state||{schema:1,id,creator:actor,repositoryId:'101',proposals:[],accepted:null,moderation:{status:'active'},registrations:{},entries:{},operations:{},history:[],updatedAt:stamp};
  if(f.legacySource){const sourced=await f.legacySource({actor,commit,repositoryUrl:`https://github.com/${actor.login}/jam`,manifest:true});data=sourced.manifest;}
  const verified={repository:{id:'101',ownerId:actor.id,fullName:`${actor.login}/jam`,commit},manifest:manifestData(data)},revision=digest(verified);
  state.proposals.push({revision,...verified,status:'submitted',reason:'',proposedAt:stamp});
  const result={eventId:id,operationId,revision,status:'submitted'};
  state.operations[`${actor.id}:${operationId}`]={actorId:actor.id,acceptedAt:Date.parse(stamp),payloadDigest:digest({action:'propose',repositoryUrl:`https://github.com/${actor.login}/jam`,commit}),result,pool:'ordinary'};
  validateState(state,id);
  await f.store.compareAndSwap(id,(await f.store.snapshot()).revision,state);
  return result;
}
export function hostedManifest(overrides={}) {
  const {websiteUrl,...data}=manifest();
  return {...data,schedule:{...data.schedule,galleryRevealAt:'2030-01-05T00:00:00Z'},...overrides};
}
export async function approved(f) {
  const proposal=await legacyProposal(f);
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'approve-0001',action:'approve',revision:proposal.revision});
  return proposal.revision;
}
export const submission=(revision,extra={})=>({id:'jam-101',actor:participant,operationId:'submit-0001',action:'submit',revision,source:{repositoryUrl:'https://github.com/student/project',commit:COMMIT},title:'Project',description:'A small project',demoUrl:'https://student.github.io/project/',instructions:'Use arrows.',...extra});
