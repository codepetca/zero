// Browser-safe manifest contract shared by preparation and official intake.
export class JamError extends Error {
  constructor(status, message) { super(message); this.name = 'JamError'; this.status = status; }
}
export const fail = (status, message) => { throw new JamError(status, message); };

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
