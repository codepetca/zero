import {test} from 'node:test';
import assert from 'node:assert/strict';
import {communityPreview} from '../lib/community-preview.mjs';
const manifest = {components:[{id:'health-bar'}]};
const fixture = () => ({schema:1, library:{groupId:'school.zero.community',artifactId:'zero-community',version:'0.1.3',javaRelease:17,javafxVersion:'21.0.12'},components:[{id:'segmented-health-bar',name:'SegmentedHealthBar',className:'zero.community.SegmentedHealthBar',description:'Explicit segments.',api:['SegmentedHealthBar(int maximum)'],examples:[],category:'health-bars',versions:['0.1.3'],status:'experimental',license:'MIT',maintainer:null}]});
test('preview is opt-in, refuses hosted builds and never modifies the published catalog', () => {
  assert.equal(communityPreview(fixture(),manifest),null);
  assert.equal(communityPreview(fixture(),manifest,{enabled:true,hosted:true}),null);
  const before = structuredClone(manifest);
  const preview = communityPreview(fixture(),manifest,{enabled:true});
  assert.equal(preview.version,'0.1.3');
  assert.equal(preview.components[0].id,'segmented-health-bar');
  assert.equal(preview.components[0].versions,undefined);
  assert.deepEqual(manifest,before);
});
test('preview excludes existing choices and refuses status, scripts and recommendation claims', () => {
  const metadata = fixture();
  metadata.components.push({...metadata.components[0],id:'health-bar',className:'zero.community.HealthBar'});
  assert.equal(communityPreview(metadata,manifest,{enabled:true}).components.length,1);
  for (const mutate of [
    m => {m.components[0].recommended=true;},
    m => {m.components[0].status='community-reviewed';},
    m => {m.components[0].command='exec';},
    m => {m.discovery={recommendations:[]};},
    m => {m.components[0].versions=['0.1.2'];},
    m => {m.components[0].category=['health-bars'];},
    m => {m.library.version='latest';},
  ]) {const changed=fixture();mutate(changed);assert.throws(()=>communityPreview(changed,manifest,{enabled:true}));}
});
