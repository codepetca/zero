import {createJamService} from '../service.mjs';

export const creator={id:'11',login:'creator'},maintainer={id:'22',login:'maintainer'},participant={id:'33',login:'student'};
export const COMMIT='a'.repeat(40),NEXT_COMMIT='b'.repeat(40);
export function manifest(overrides={}) {
  return {schema:1,templateVersion:'1.0.0',type:'game',title:'Jam title',summary:'A public creative jam.',theme:'Space',rules:'Make your own work.',eligibility:'Everyone',websiteUrl:'https://creator.github.io/jam/',timezone:'America/Toronto',schedule:{registrationOpensAt:'2030-01-01T00:00:00Z',registrationClosesAt:'2030-01-03T00:00:00Z',startsAt:'2030-01-01T00:00:00Z',submissionsOpenAt:'2030-01-02T00:00:00Z',submissionsCloseAt:'2030-01-04T00:00:00Z'},...overrides};
}
export function memoryStore() {
  const records=new Map(); let sequence=0;
  return {records,beforeCas:null,afterCas:null,async read(id){const item=records.get(id);return item?structuredClone(item):{state:null,revision:null};},async list(){return [...records.keys()];},async compareAndSwap(id,expected,state){if(this.beforeCas)await this.beforeCas(id,expected,state);const found=records.get(id);if((found?.revision||null)!==expected)return false;records.set(id,{state:structuredClone(state),revision:`revision-${++sequence}`});if(this.afterCas)await this.afterCas(id,expected,state);return true;}};
}
export function fixture({limits={},maintainerIds=[maintainer.id],source}={}) {
  const store=memoryStore();let time=Date.parse('2030-01-02T12:00:00Z');let calls=0;
  const verifySource=async input=>{calls++;if(source)return source(input);return {repository:{id:input.manifest?'101':'202',ownerId:input.actor.id,fullName:`${input.actor.login}/${input.manifest?'jam':'project'}`,commit:input.commit},...(input.manifest?{manifest:manifest(input.commit===NEXT_COMMIT?{title:'Updated jam',rules:'Updated rules'}:{})}:{})};};
  const service=createJamService({store,verifySource,maintainerIds,now:()=>time,limits});
  return {store,service,setTime:value=>{time=typeof value==='number'?value:Date.parse(value);},calls:()=>calls};
}
export async function approved(f) {
  const proposal=await f.service.propose({actor:creator,operationId:'propose-0001',repositoryUrl:'https://github.com/creator/jam',commit:COMMIT});
  await f.service.mutate({id:'jam-101',actor:maintainer,operationId:'approve-0001',action:'approve',revision:proposal.revision});
  return proposal.revision;
}
export const submission=(revision,extra={})=>({id:'jam-101',actor:participant,operationId:'submit-0001',action:'submit',revision,source:{repositoryUrl:'https://github.com/student/project',commit:COMMIT},title:'Project',description:'A small project',demoUrl:'https://student.github.io/project/',instructions:'Use arrows.',...extra});
