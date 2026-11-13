import test from 'node:test';
import assert from 'node:assert/strict';
import {hostedManifestData, manifestData, JAM_THEME_IDS, JAM_BACKDROP_IDS} from '../../jams/manifest.mjs';
import {jamStyle, jamStyleClass, JAM_THEMES, JAM_BACKDROPS} from '../lib/jam-style.mjs';
import {hostedJamDraftStyle} from '../lib/jam-draft.mjs';

const schedule={registrationOpensAt:'2030-01-01T00:00:00Z',registrationClosesAt:'2030-01-02T00:00:00Z',startsAt:'2030-01-02T00:00:00Z',
  submissionsOpenAt:'2030-01-02T00:00:00Z',submissionsCloseAt:'2030-01-03T00:00:00Z',galleryRevealAt:'2030-01-04T00:00:00Z'};
const hosted=(extra={})=>({schema:1,templateVersion:'1.0.0',type:'game',title:'Jam',summary:'A jam',theme:'Space',rules:'Be kind',eligibility:'Everyone',timezone:'UTC',schedule,...extra});

test('hosted manifests accept only listed look presets and stay valid without one',()=>{
  assert.equal(Object.hasOwn(hostedManifestData(hosted()),'style'),false);
  assert.deepEqual(hostedManifestData(hosted({style:{theme:'ocean',backdrop:'waves'}})).style,{theme:'ocean',backdrop:'waves'});
  for(const style of [{theme:'neon',backdrop:'waves'},{theme:'ocean',backdrop:'https://example.com/a.png'},{theme:'ocean'},{theme:'ocean',backdrop:'waves',image:'x'},'ocean',null])
    assert.throws(()=>hostedManifestData(hosted({style})),error=>error.status===400);
  const {galleryRevealAt:ignored,...legacySchedule}=schedule;
  assert.throws(()=>manifestData({...hosted({style:{theme:'ocean',backdrop:'waves'}}),websiteUrl:'https://example.com/',schedule:legacySchedule}),error=>error.status===400);
});

test('every preset has a label, and jams without a look get a stable non-plain preset',()=>{
  assert.deepEqual(JAM_THEMES.map(item=>item.id),[...JAM_THEME_IDS]);
  assert.deepEqual(JAM_BACKDROPS.map(item=>item.id),[...JAM_BACKDROP_IDS]);
  assert.deepEqual(jamStyle({id:'jam-1',style:{theme:'forest',backdrop:'plain'}}),{theme:'forest',backdrop:'plain'});
  const fallback=jamStyle({id:'jam-zero-0123456789abcdef0123456789abcdef'});
  assert.deepEqual(jamStyle({id:'jam-zero-0123456789abcdef0123456789abcdef'}),fallback);
  assert.ok(JAM_THEME_IDS.includes(fallback.theme));assert.ok(JAM_BACKDROP_IDS.includes(fallback.backdrop));assert.notEqual(fallback.backdrop,'plain');
  assert.deepEqual(jamStyle({id:'jam-2',style:{theme:'neon',backdrop:'plain'}}),jamStyle({id:'jam-2'}));
  assert.match(jamStyleClass({style:{theme:'candy',backdrop:'grid'}}),/^jam-theme-candy jam-backdrop-grid$/);
});

test('drafts saved before look presets submit the default look',()=>{
  assert.deepEqual(hostedJamDraftStyle({}),{theme:'violet',backdrop:'stars'});
  assert.deepEqual(hostedJamDraftStyle({styleTheme:'sunset',styleBackdrop:'confetti'}),{theme:'sunset',backdrop:'confetti'});
  assert.deepEqual(hostedJamDraftStyle({styleTheme:'bogus',styleBackdrop:'confetti'}),{theme:'violet',backdrop:'confetti'});
});
