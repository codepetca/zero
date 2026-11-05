import test from 'node:test';
import assert from 'node:assert/strict';
import contracts from '../../extension/src/sharing/contracts.js';
import {projectHeldCatalog} from '../lib/jam-held-catalog.mjs';
import {projectVisibility} from '../../jams/project-visibility.mjs';
import {fixture as jamFixture,manifest,creator,participant,approved} from '../../jams/test/fixtures.mjs';

const origin = 'https://artifacts.example';
function release(kind, repositoryId, version, status = 'available') {
  const slug = kind === 'game' ? 'space-game' : 'health-bar';
  const identity = contracts.identity(kind, repositoryId, slug);
  const artifact = type => {
    const path = contracts.artifactPath(identity, version, type);
    return {path, url:`${origin}/${path}`, size:1, sha256:'e'.repeat(64)};
  };
  return {
    schema:1, kind, id:identity.id, slug, version, title:'Private title',
    description:'Private description', license:'MIT',
    repository:{id:repositoryId, ownerId:'7', owner:'student', name:'game', url:'https://github.com/student/game'},
    contributor:{githubId:'7', login:'student'},
    source:{commit:'b'.repeat(40), folder:kind === 'game' ? '.' : `libraries/${slug}`, sha256:'c'.repeat(64)},
    policyRevision:'d'.repeat(40), status,
    ...(kind === 'game' ? {controls:'Arrows', artifacts:{zip:artifact('zip')},
      web:{provider:'github-pages',url:'https://student.github.io/game/',commit:'b'.repeat(40),runId:42}} :
      {namespace:identity.namespace, coordinate:{...identity.coordinate,version}, libraryKind:'helper',
        artifacts:{jar:artifact('jar'),sources:artifact('sources'),pom:artifact('pom')}})
  };
}
function fixture() {
  return contracts.validateCatalog({schema:1,revision:'a'.repeat(40),releases:[
    release('game','123','0.1.0'), release('game','123','0.2.0','withdrawn'),
    release('game','1234','0.1.0'), release('library','123','0.1.0')
  ]},{artifactOrigin:origin});
}
const decision = isHeld => ({revision:'f'.repeat(40),isHeld});

test('removes all held game versions by exact repository ID and preserves other releases', () => {
  const catalog = fixture(), original = structuredClone(catalog), seen = [];
  const projected = projectHeldCatalog(catalog, decision(id => {seen.push(id); return id === '123';}));
  assert.deepEqual(seen,['123','123','1234','123']);
  assert.deepEqual(projected.releases,[original.releases[2]]);
  assert.deepEqual(catalog,original);
  assert.equal(projected.revision,original.revision);
  assert.ok(!JSON.stringify(projected).includes('game-r123-space-game'));
  assert.notEqual(projected.releases[0],catalog.releases[2]);
});

test('requires a well-formed decision and rejects non-boolean or failed checks', () => {
  const catalog = fixture();
  for (const visibility of [undefined, null, {}, {revision:'f'.repeat(40)},
    {revision:'bad',isHeld:()=>false}, decision(()=>undefined), decision(()=>null),
    decision(()=>Promise.resolve(false)), decision(()=>{throw Error('secret held metadata');})]) {
    assert.throws(() => projectHeldCatalog(catalog,visibility), {message:'Project visibility is unavailable.'});
  }
  assert.throws(() => projectHeldCatalog({...catalog,releases:[]},undefined), {message:'Project visibility is unavailable.'});
});

test('rejects malformed repository IDs without exposing catalog details', () => {
  for (const id of [123, '0123', '0', '123x']) {
    const catalog = fixture(); catalog.releases[0].repository.id = id;
    assert.throws(() => projectHeldCatalog(catalog,decision(()=>false)), {message:'Project visibility is unavailable.'});
  }
});

test('an approved jam holds every shared game version until its reveal',async()=>{
 const reveal='2030-01-05T00:00:00Z';
 const jam=jamFixture({verifyRepository:async()=>({repository:{id:'123',ownerId:participant.id,fullName:'student/project'}}),source:async input=>({repository:{id:'101',ownerId:creator.id,fullName:'creator/jam',commit:input.commit},manifest:manifest({schedule:{...manifest().schedule,galleryRevealAt:reveal}})})});
 const revision=await approved(jam);
 await jam.service.mutate({id:'jam-101',actor:participant,operationId:'catalog-join-01',action:'join',revision,repositoryUrl:'https://github.com/student/project',demoUrl:'https://student.github.io/project/'});
 const state=jam.store.records.get('jam-101').state;
 const snapshot={revision:'f'.repeat(40),ids:['jam-101'],settlements:{schema:1,operations:{}},read:async()=>({state})};
 const before=await projectVisibility(snapshot,Date.parse(reveal)-1),after=await projectVisibility(snapshot,Date.parse(reveal));
 assert.deepEqual(projectHeldCatalog(fixture(),before).releases.map(item=>item.id),['game-r1234-space-game']);
 assert.equal(projectHeldCatalog(fixture(),after).releases.length,4);
});
