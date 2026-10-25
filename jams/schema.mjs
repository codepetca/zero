import {createHash} from 'node:crypto';

export class JamError extends Error {
  constructor(status, message) { super(message); this.name = 'JamError'; this.status = status; }
}
export const fail = (status, message) => { throw new JamError(status, message); };
export const ID = /^jam-[1-9][0-9]{0,19}$/;
export const SHA = /^[a-f0-9]{40}$/;
export const ACCOUNT = /^[1-9][0-9]{0,19}$/;
export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
export const LIMITS = Object.freeze({events:100, participants:200, operations:1000, proposals:50, entryHistory:30, retries:8, stateBytes:2_000_000, actorWrites:10, writeWindowMs:60000});
export const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function keys(value, allowed, required = allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value,key))) fail(400,'Invalid fields.');
}
export function text(value, max, optional = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || !optional && !value.trim()) fail(400,'Invalid text.');
  return value.trim();
}
export function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) fail(400,'Use a public HTTPS URL.');
  let url; try { url = new URL(value); } catch { fail(400,'Use a public HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.') || url.hostname.endsWith('.') || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') || /^\d+(?:\.\d+){3}$/.test(url.hostname) || url.hostname.includes(':')) fail(400,'Use a public HTTPS URL.');
  return url.href;
}
export function repositoryUrl(value) {
  if (typeof value !== 'string' || value.length > 256) fail(400,'Use a public GitHub repository URL.');
  const match = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})\/?$/.exec(value);
  if (!match || /(?:^\.|\.$|\.\.|\.git$)/i.test(match[2])) fail(400,'Use a public GitHub repository URL.');
  return {owner:match[1],repo:match[2],url:`https://github.com/${match[1]}/${match[2]}`};
}
export function actorIdentity(actor) {
  keys(actor,['id','login']);
  if (!ACCOUNT.test(actor.id) || !LOGIN.test(actor.login)) fail(401,'GitHub sign-in required.');
  return {id:actor.id,login:actor.login};
}
export function manifestData(input) {
  keys(input,['schema','templateVersion','type','title','summary','theme','rules','eligibility','websiteUrl','timezone','schedule']);
  if (input.schema !== 1 || input.templateVersion !== '1.0.0' || !['game','app'].includes(input.type)) fail(400,'Unsupported jam manifest.');
  const timezone = text(input.timezone,100);
  try { new Intl.DateTimeFormat('en',{timeZone:timezone}).format(); } catch { fail(400,'Use an IANA timezone.'); }
  const dateKeys = ['registrationOpensAt','registrationClosesAt','startsAt','submissionsOpenAt','submissionsCloseAt'];
  keys(input.schedule,dateKeys);
  const schedule = {}, times = {};
  for (const key of dateKeys) {
    const date = input.schedule[key];
    if (typeof date !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().replace('.000Z','Z') !== date.replace('.000Z','Z')) fail(400,'Use valid ISO UTC schedule dates.');
    times[key] = Date.parse(date); schedule[key] = new Date(date).toISOString();
  }
  if (!(times.registrationOpensAt < times.registrationClosesAt && times.registrationOpensAt <= times.startsAt && times.startsAt <= times.submissionsOpenAt && times.submissionsOpenAt < times.submissionsCloseAt && times.registrationClosesAt <= times.submissionsCloseAt)) fail(400,'Jam schedule boundaries are inconsistent.');
  return {schema:1,templateVersion:'1.0.0',type:input.type,title:text(input.title,120),summary:text(input.summary,1000),theme:text(input.theme,1000),rules:text(input.rules,8000),eligibility:text(input.eligibility,2000),websiteUrl:httpsUrl(input.websiteUrl),timezone,schedule};
}
export function repositoryData(input, actor, expectedCommit) {
  keys(input,['id','ownerId','fullName','commit']);
  if (!ACCOUNT.test(input.id) || input.ownerId !== actor.id || !SHA.test(input.commit) || input.commit !== expectedCommit || typeof input.fullName !== 'string') fail(403,'The public source must belong to your GitHub account.');
  const parsed = repositoryUrl(`https://github.com/${input.fullName}`);
  if (parsed.owner.toLowerCase() !== actor.login.toLowerCase()) fail(403,'The public source must belong to your GitHub account.');
  return {...input};
}
export function validateState(state, id, limit = LIMITS) {
  // The registry is operator-controlled, but malformed/truncated state must never
  // become an empty event or supply authority through an unchecked record.
  try {
    keys(state,['schema','id','creator','repositoryId','proposals','accepted','moderation','registrations','entries','operations','history','updatedAt']);
    if (state.schema !== 1 || state.id !== id || !ID.test(id) || state.repositoryId !== id.slice(4)) throw Error();
    actorIdentity(state.creator);
    if (!Array.isArray(state.proposals) || !state.proposals.length || state.proposals.length > limit.proposals || !object(state.registrations) || !object(state.entries) || !object(state.operations) || !Array.isArray(state.history) || !['active','suspended','cancelled'].includes(state.moderation?.status)) throw Error();
    if (Object.keys(state.registrations).length > limit.participants || Object.keys(state.operations).length > limit.operations || Buffer.byteLength(JSON.stringify(state)) > limit.stateBytes) throw Error();
    for (const proposal of state.proposals) {
      if (!/^[a-f0-9]{64}$/.test(proposal.revision) || !['submitted','changes-requested','approved','rejected'].includes(proposal.status)) throw Error();
      manifestData(proposal.manifest);
      // Archived source names survive an account/repository rename. Numeric
      // ownership is the durable binding; current names are checked on intake.
      repositoryData(proposal.repository,{id:state.creator.id,login:proposal.repository?.fullName?.split('/')[0]},proposal.repository.commit);
      if (proposal.repository.id !== state.repositoryId) throw Error();
    }
    if (state.accepted) {
      const proposal=state.proposals.find(proposal=>proposal.revision===state.accepted.revision&&proposal.status==='approved');
      const {approvedBy,approvedAt,...acceptedProposal}=state.accepted;
      if(!proposal||canonical(proposal)!==canonical(acceptedProposal)||!ACCOUNT.test(approvedBy)||approvedBy===state.creator.id||approvedAt!==proposal.reviewedAt)throw Error();
    }
    for (const [key,value] of Object.entries(state.registrations)) if (!ACCOUNT.test(key) || value.id !== key || !LOGIN.test(value.login) || !['joined','left'].includes(value.status)) throw Error();
    for (const [key,history] of Object.entries(state.entries)) if (!ACCOUNT.test(key) || !state.registrations[key] || !Array.isArray(history) || history.length > limit.entryHistory || history.some(entry => entry.participantId !== key || !['active','withdrawn'].includes(entry.status))) throw Error();
    for(const [key,operation]of Object.entries(state.operations)) {
      keys(operation,['actorId','acceptedAt','payloadDigest','result']);
      if(!ACCOUNT.test(operation.actorId)||!key.startsWith(operation.actorId+':')||!Number.isSafeInteger(operation.acceptedAt)||! /^[a-f0-9]{64}$/.test(operation.payloadDigest)||operation.result?.eventId!==id||operation.result.operationId!==key.slice(operation.actorId.length+1))throw Error();
    }
    return structuredClone(state);
  } catch { fail(503,'Official jam records are unavailable.'); }
}
