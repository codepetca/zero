import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultJamDraft,prepareJamDraft} from '../lib/jam-draft.mjs';
import {manifestData,JamError} from '../../jams/schema.mjs';
import {JamError as BrowserJamError} from '../../jams/manifest.mjs';
const valid=(patch={})=>({...defaultJamDraft(),title:'My jam',summary:'Build something small.',theme:'Small worlds',registrationOpensAt:'2030-03-01T09:00',startsAt:'2030-03-15T09:00',submissionsCloseAt:'2030-03-17T22:00',...patch});
test('browser and service share one manifest/error contract; defaults do not invent event dates',()=>{
  assert.equal(JamError,BrowserJamError);assert.equal(defaultJamDraft().startsAt,'');assert.equal(prepareJamDraft(defaultJamDraft()).manifest,null);
  const {manifest,errors}=prepareJamDraft(valid());assert.deepEqual(errors,{});assert.deepEqual(manifestData(manifest),manifest);
  assert.equal(manifest.schedule.registrationOpensAt,'2030-03-01T14:00:00.000Z');
  assert.equal(manifest.schedule.startsAt,'2030-03-15T13:00:00.000Z');
  assert.equal(manifest.schedule.registrationClosesAt,manifest.schedule.startsAt);
  assert.equal(manifest.schedule.submissionsOpenAt,manifest.schedule.startsAt);
  assert.equal(manifest.websiteUrl,'https://example.com/your-jam/');
});
test('local date conversion handles offsets and refuses DST gaps, repeated times and invalid dates',()=>{
  for(const [date,pattern]of [['2030-03-10T02:30',/does not exist/],['2030-11-03T01:30',/occurs twice/],['2030-02-30T10:00',/valid date/]]){
    const result=prepareJamDraft(valid({startsAt:date}));assert.equal(result.manifest,null);assert.match(result.errors.startsAt,pattern);
  }
  const result=prepareJamDraft(valid({timezone:'Asia/Kathmandu'}));assert.equal(result.manifest.schedule.startsAt,'2030-03-15T03:15:00.000Z');
  assert.match(prepareJamDraft(valid({timezone:'invalid/zone'})).errors.timezone,/IANA/);
});
test('specific field errors preserve text and schedule choices and optional overrides validate',()=>{
  const draft=valid({title:'x'.repeat(121),websiteUrl:'javascript:alert(1)',submissionsOpenAt:'2030-03-18T10:00'}),before=structuredClone(draft);
  const result=prepareJamDraft(draft);assert.equal(result.manifest,null);assert.ok(result.errors.title);assert.ok(result.errors.websiteUrl);assert.ok(result.errors.submissionsCloseAt);assert.deepEqual(draft,before);
  assert.equal(prepareJamDraft(valid({registrationClosesAt:'2030-03-17T12:00',type:'app'})).manifest.type,'app');
  assert.equal(prepareJamDraft(valid({rules:'界'.repeat(8000),summary:'界'.repeat(1000),theme:'界'.repeat(1000),eligibility:'界'.repeat(2000)})).manifest,null);
});

test('hosted proposals omit a creator site and require a later gallery reveal',async()=>{
  const {prepareHostedJamDraft}=await import('../lib/jam-draft.mjs');
  const draft=valid({galleryRevealAt:'2030-03-18T09:00'});
  const result=prepareHostedJamDraft(draft);
  assert.deepEqual(result.errors,{});
  assert.equal(Object.hasOwn(result.manifest,'websiteUrl'),false);
  assert.equal(result.manifest.schedule.galleryRevealAt,'2030-03-18T13:00:00.000Z');
  assert.match(prepareHostedJamDraft({...draft,galleryRevealAt:draft.submissionsCloseAt}).errors.galleryRevealAt,/after/);
  assert.match(prepareHostedJamDraft({...draft,galleryRevealAt:''}).errors.galleryRevealAt,/complete/);
});


test('hosted proposal validates the UTF-8 request envelope against the HTTP byte limit',async()=>{
  const {prepareHostedJamDraft}=await import('../lib/jam-draft.mjs');
  const result=prepareHostedJamDraft(valid({galleryRevealAt:'2030-03-18T09:00',rules:'界'.repeat(6000)}));
  assert.equal(result.manifest,null);assert.match(result.errors.rules,/large/);
});

test('hosted defaults describe live Pages while legacy preparation retains exact source',async()=>{
  const {defaultHostedJamDraft}=await import('../lib/jam-draft.mjs');
  for (const type of ['game','app']) {
    const draft=defaultHostedJamDraft(type,'UTC');
    assert.equal(draft.type,type);assert.equal(draft.timezone,'UTC');assert.equal(draft.galleryRevealAt,'');
    assert.match(draft.rules,/GitHub Pages URL/);assert.doesNotMatch(draft.rules,/exact commit/);
  }
  assert.match(defaultJamDraft().rules,/exact commit/);
});

test('hosted initial defaults are deterministic UTC and browser timezone detection validates IANA with a UTC fallback',async t=>{
  const {browserJamTimezone,defaultHostedJamDraft}=await import('../lib/jam-draft.mjs');
  assert.equal(defaultHostedJamDraft().timezone,'UTC');
  const Original=Intl.DateTimeFormat;
  for(const zone of ['Asia/Tokyo','Asia/Kathmandu','America/Los_Angeles',undefined,'','Invalid/Zone']){
    const mock=t.mock.method(Intl,'DateTimeFormat',function(...args){return args.length?new Original(...args):{resolvedOptions:()=>({timeZone:zone})};});
    assert.equal(browserJamTimezone(),zone&&zone!=='Invalid/Zone'?zone:'UTC');mock.mock.restore();
  }
  const broken=t.mock.method(Intl,'DateTimeFormat',()=>{throw Error('Unavailable Intl');});
  assert.equal(browserJamTimezone(),'UTC');broken.mock.restore();
  Intl.DateTimeFormat=undefined;
  try{assert.equal(browserJamTimezone(),'UTC');}finally{Intl.DateTimeFormat=Original;}
});

test('requested date style preserves event-local calendar date and scheduled time across offsets and DST',async()=>{
  const {formatJamDateTime}=await import('../lib/jam-draft.mjs');
  assert.match(formatJamDateTime('2026-11-05T14:30:00Z','America/Toronto'),/^Thu Nov 5 · 2026 · 9:30/);
  assert.match(formatJamDateTime('2026-11-05T14:30:00Z','Asia/Kathmandu'),/^Thu Nov 5 · 2026 · 8:15/);
  assert.match(formatJamDateTime('2026-11-05T00:30:00Z','America/Los_Angeles'),/^Wed Nov 4 · 2026 · 4:30/);
  assert.match(formatJamDateTime('2030-03-10T09:30:00Z','America/Los_Angeles'),/^Sun Mar 10 · 2030 · 1:30/);
  assert.match(formatJamDateTime('2030-03-10T10:30:00Z','America/Los_Angeles'),/^Sun Mar 10 · 2030 · 3:30/);
  assert.equal(formatJamDateTime('not-a-date','UTC'),'not-a-date');
  assert.equal(formatJamDateTime('2026-11-05T14:30:00Z','Invalid/Zone'),'2026-11-05T14:30:00Z');
});

test('non-Toronto hosted drafts preserve local wall times and reject DST gaps and folds without changing input',async()=>{
  const {prepareHostedJamDraft}=await import('../lib/jam-draft.mjs');
  const draft=valid({timezone:'America/Los_Angeles',galleryRevealAt:'2030-03-18T09:00'}),before=structuredClone(draft);
  const result=prepareHostedJamDraft(draft);assert.deepEqual(result.errors,{});
  assert.equal(result.manifest.timezone,'America/Los_Angeles');
  assert.equal(result.manifest.schedule.registrationOpensAt,'2030-03-01T17:00:00.000Z');
  assert.equal(result.manifest.schedule.startsAt,'2030-03-15T16:00:00.000Z');
  assert.deepEqual(draft,before);
  for(const [value,error]of [['2030-03-10T02:30',/does not exist/],['2030-11-03T01:30',/occurs twice/]]){
    const invalid=prepareHostedJamDraft({...draft,startsAt:value});assert.equal(invalid.manifest,null);assert.match(invalid.errors.startsAt,error);
  }
});
