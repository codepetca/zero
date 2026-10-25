import {manifestData, text, httpsUrl} from '../../jams/manifest.mjs';

export const JAM_DRAFT_LIMITS=Object.freeze({title:120,summary:1000,theme:1000,rules:8000,eligibility:2000,websiteUrl:2048,timezone:100});
export function defaultJamDraft(type='game',timezone='America/Toronto') {
  return {type:['game','app'].includes(type)?type:'game',title:'',summary:'',theme:'',
    rules:'Make your own work during the jam. Credit collaborators, libraries and assets. Keep entries appropriate for a classroom. Use GitHub for your project. Your repository must be public. Submit your repository URL and exact commit.',
    eligibility:'Open to beginning Java students working individually.',websiteUrl:'',timezone,
    registrationOpensAt:'',startsAt:'',submissionsCloseAt:'',registrationClosesAt:'',submissionsOpenAt:''};
}
const dateFields=['registrationOpensAt','startsAt','submissionsCloseAt','registrationClosesAt','submissionsOpenAt'];
function utc(parts) { const d=new Date(0); d.setUTCFullYear(parts[0],parts[1]-1,parts[2]);d.setUTCHours(parts[3],parts[4],parts[5]||0,0);return d.getTime(); }
function localInstant(value,timezone) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw Error('Enter a complete date and time.');
  const target=value.match(/\d+/g).map(Number),nominal=utc(target),d=new Date(nominal);
  if(d.getUTCFullYear()!==target[0]||d.getUTCMonth()+1!==target[1]||d.getUTCDate()!==target[2]||d.getUTCHours()!==target[3]||d.getUTCMinutes()!==target[4])throw Error('Enter a valid date and time.');
  const formatter=new Intl.DateTimeFormat('en',{timeZone:timezone,calendar:'iso8601',numberingSystem:'latn',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const parts=time=>{const p=Object.fromEntries(formatter.formatToParts(time).map(p=>[p.type,p.value]));return [p.year,p.month,p.day,p.hour,p.minute,p.second].map(Number);};
  const offsets=new Set();for(let h=-36;h<=36;h+=6){const probe=nominal+h*3600000;offsets.add(utc(parts(probe))-probe);}
  const matches=[...offsets].map(offset=>nominal-offset).filter(time=>parts(time).slice(0,5).every((v,i)=>v===target[i]));
  if(!matches.length)throw Error('This local time does not exist because the clocks change. Choose another time.');
  if(matches.length!==1)throw Error('This local time occurs twice because the clocks change. Choose another time.');
  return new Date(matches[0]).toISOString();
}
export function prepareJamDraft(input) {
  const draft=input&&typeof input==='object'?input:{},errors={},values={};
  if(!['game','app'].includes(draft.type))errors.type='Choose Game Jam or App Jam.';
  for(const [field,max]of Object.entries(JAM_DRAFT_LIMITS)) {
    if(field==='websiteUrl')continue;
    try{values[field]=text(draft[field],max);}catch{errors[field]=`Enter ${field==='eligibility'?'who can take part':field} (${max} characters or fewer).`;}
  }
  if(!errors.timezone)try{new Intl.DateTimeFormat('en',{timeZone:values.timezone}).format();}catch{errors.timezone='Use an IANA timezone, such as America/Toronto.';}
  try{values.websiteUrl=typeof draft.websiteUrl==='string'&&!draft.websiteUrl.trim()?'https://example.com/your-jam/':httpsUrl(draft.websiteUrl);}catch{errors.websiteUrl='Enter a public HTTPS website URL, or leave it blank until you publish.';}
  const schedule={};
  if(!errors.timezone)for(const field of dateFields) {
    const optional=field==='registrationClosesAt'||field==='submissionsOpenAt';
    if(optional&&draft[field]===''){if(schedule.startsAt)schedule[field]=schedule.startsAt;continue;}
    try{schedule[field]=localInstant(draft[field],values.timezone);}catch(error){errors[field]=error.message;}
  }
  const before=(a,b,equal,message)=>{if(schedule[a]&&schedule[b]&&!(equal?schedule[a]<=schedule[b]:schedule[a]<schedule[b]))errors[b]=message;};
  before('registrationOpensAt','registrationClosesAt',false,'Registration must close after it opens.');
  before('registrationOpensAt','startsAt',true,'The jam must start on or after registration opens.');
  before('startsAt','submissionsOpenAt',true,'Submissions must open on or after the jam starts.');
  before('submissionsOpenAt','submissionsCloseAt',false,'The submission deadline must be after submissions open.');
  before('registrationClosesAt','submissionsCloseAt',true,'The submission deadline must be on or after registration closes.');
  if(Object.keys(errors).length)return {manifest:null,errors};
  try {
    const manifest=manifestData({schema:1,templateVersion:'1.0.0',type:draft.type,...values,schedule});
    if(new TextEncoder().encode(JSON.stringify({manifest})).length>32768)return {manifest:null,errors:{rules:'These details are too large together. Shorten the rules and other text.'}};
    return {manifest,errors:{}};
  }catch{return {manifest:null,errors:{form:'Check the jam details and schedule.'}};}
}
