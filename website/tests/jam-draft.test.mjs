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
